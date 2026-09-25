/**
 * tfl_matching.ts — Moteur de rapprochement hybride pour le London Underground (TfL)
 *
 * Combine deux stratégies complémentaires :
 * 1. Identifiant matériel roulant stable (vehicleId) quand disponible.
 * 2. Rapprochement spatio-temporel au prochain arrêt (timeToStation vs heure théorique)
 *    pour les prédictions sans identifiant ou non encore verrouillées.
 *
 * Règle de Product Honesty :
 * - Les rames avec mesure temps réel valide passent au niveau 'measured' ou 'extrapolated'
 *   (« Temps réel », pastille verte / bleue).
 * - Les rames non matchées restent strictement en 'scheduled' (« Horaires théoriques », pastille neutre).
 * - La pastille globale reflète le taux de couverture effectif.
 */

import type { SchedTrip } from './rt_matching';
import type { TflArrivalPrediction } from '../../netlify/functions/tfl_relay';

export interface MatchedTripState {
  tripId: string;
  lineId: string;
  vehicleId: string | null;
  delayS: number;
  confidence: 'measured' | 'extrapolated' | 'scheduled';
  nextStationId?: string;
  timeToNextStationS?: number;
  measuredAtSeconds: number;
}

export interface TflMatchOutcome {
  matchesByTripId: Map<string, MatchedTripState>;
  matchedCount: number;
  totalActiveCount: number;
  coveragePct: number;
  lockedVehiclesCount: number;
}

export interface TflMatchingOptions {
  matchWindowSec?: number; // Défaut : 120s
  maxDelaySec?: number; // Défaut : 900s (15 min)
  alpha?: number; // Lissage exponentiel (0.4)
}

export class TflHybridMatcher {
  private vehicleToTripMap = new Map<string, string>(); // vehicleId -> tripId
  private tripToVehicleMap = new Map<string, string>(); // tripId -> vehicleId
  private lastDelaysByTripId = new Map<string, number>(); // tripId -> smoothed delay
  private options: Required<TflMatchingOptions>;

  constructor(options: TflMatchingOptions = {}) {
    this.options = {
      matchWindowSec: options.matchWindowSec ?? 120,
      maxDelaySec: options.maxDelaySec ?? 900,
      alpha: options.alpha ?? 0.4
    };
  }

  /**
   * Réinitialise les verrous véhicules.
   */
  public reset() {
    this.vehicleToTripMap.clear();
    this.tripToVehicleMap.clear();
    this.lastDelaysByTripId.clear();
  }

  /**
   * Effectue le rapprochement hybride pour l'instant présent.
   *
   * @param arrivals Prédictions normalisées issues du relais TfL
   * @param activeTrips Courses théoriques actuellement actives sur le réseau
   * @param currentCivilSeconds Temps civil actuel en secondes (0..86400+)
   */
  public match(
    arrivals: readonly TflArrivalPrediction[],
    activeTrips: readonly SchedTrip[],
    currentCivilSeconds: number
  ): TflMatchOutcome {
    const activeTripsMap = new Map(activeTrips.map(t => [t.tripId, t]));
    const matchedTrips = new Map<string, MatchedTripState>();
    const usedTrips = new Set<string>();

    // Nettoyer les véhicules verrouillés dont la course n'est plus active
    for (const [vehicleId, tripId] of Array.from(this.vehicleToTripMap.entries())) {
      if (!activeTripsMap.has(tripId)) {
        this.vehicleToTripMap.delete(vehicleId);
        this.tripToVehicleMap.delete(tripId);
      }
    }

    // 1. Regrouper les prédictions par véhicule ou par clé de passage
    // Pour chaque véhicule, la prédiction avec le plus petit timeToStation représente le prochain arrêt
    const vehicleNextArrivals = new Map<string, TflArrivalPrediction>();
    const anonymousArrivals: TflArrivalPrediction[] = [];

    for (const arr of arrivals) {
      if (arr.vehicleId) {
        const existing = vehicleNextArrivals.get(arr.vehicleId);
        if (!existing || arr.timeToStation < existing.timeToStation) {
          vehicleNextArrivals.set(arr.vehicleId, arr);
        }
      } else {
        anonymousArrivals.push(arr);
      }
    }

    // 2. Étape A : Rapprochement prioritaire par vehicleId verrouillé
    for (const [vehicleId, arr] of vehicleNextArrivals.entries()) {
      const lockedTripId = this.vehicleToTripMap.get(vehicleId);
      if (!lockedTripId) continue;

      const trip = activeTripsMap.get(lockedTripId);
      if (!trip || trip.lineId !== arr.lineId) {
        // Le verrou n'est plus cohérent
        this.vehicleToTripMap.delete(vehicleId);
        this.tripToVehicleMap.delete(lockedTripId);
        continue;
      }

      // Vérifier que la course passe bien par la station annoncée
      const stopIdx = trip.stops.findIndex(s => s.stopId === arr.stationId);
      if (stopIdx !== -1) {
        const targetStop = trip.stops[stopIdx];
        const rawDelay = (currentCivilSeconds + arr.timeToStation) - targetStop.arr;

        if (Math.abs(rawDelay) <= this.options.maxDelaySec) {
          const prevDelay = this.lastDelaysByTripId.get(trip.tripId) ?? rawDelay;
          const smoothedDelay = prevDelay + this.options.alpha * (rawDelay - prevDelay);
          this.lastDelaysByTripId.set(trip.tripId, smoothedDelay);

          usedTrips.add(trip.tripId);
          matchedTrips.set(trip.tripId, {
            tripId: trip.tripId,
            lineId: trip.lineId,
            vehicleId,
            delayS: Math.round(smoothedDelay),
            confidence: 'measured',
            nextStationId: arr.stationId,
            timeToNextStationS: arr.timeToStation,
            measuredAtSeconds: currentCivilSeconds
          });
        }
      }
    }

    // 3. Étape B : Rapprochement spatio-temporel pour les véhicules non verrouillés
    // Construction de tous les candidats (véhicule libre, course libre)
    interface CandidatePair {
      vehicleId: string | null;
      arrival: TflArrivalPrediction;
      trip: SchedTrip;
      diffSeconds: number;
    }

    const candidatePairs: CandidatePair[] = [];

    // Véhicules avec ID mais pas encore verrouillés
    for (const [vehicleId, arr] of vehicleNextArrivals.entries()) {
      if (this.vehicleToTripMap.has(vehicleId)) continue;

      for (const trip of activeTrips) {
        if (usedTrips.has(trip.tripId)) continue;
        if (trip.lineId !== arr.lineId) continue;

        const stopIdx = trip.stops.findIndex(s => s.stopId === arr.stationId);
        if (stopIdx === -1) continue;

        const targetStop = trip.stops[stopIdx];
        const diff = Math.abs((currentCivilSeconds + arr.timeToStation) - targetStop.arr);

        if (diff <= this.options.matchWindowSec) {
          candidatePairs.push({
            vehicleId,
            arrival: arr,
            trip,
            diffSeconds: diff
          });
        }
      }
    }

    // Arrivées anonymes (sans vehicleId)
    for (const arr of anonymousArrivals) {
      for (const trip of activeTrips) {
        if (usedTrips.has(trip.tripId)) continue;
        if (trip.lineId !== arr.lineId) continue;

        const stopIdx = trip.stops.findIndex(s => s.stopId === arr.stationId);
        if (stopIdx === -1) continue;

        const targetStop = trip.stops[stopIdx];
        const diff = Math.abs((currentCivilSeconds + arr.timeToStation) - targetStop.arr);

        if (diff <= this.options.matchWindowSec) {
          candidatePairs.push({
            vehicleId: null,
            arrival: arr,
            trip,
            diffSeconds: diff
          });
        }
      }
    }

    // Trier les paires candidates par divergence temporelle croissante
    candidatePairs.sort((a, b) => a.diffSeconds - b.diffSeconds);

    const consumedArrivalIds = new Set<string>();

    for (const pair of candidatePairs) {
      if (usedTrips.has(pair.trip.tripId)) continue;
      const arrivalKey = pair.arrival.id;
      if (consumedArrivalIds.has(arrivalKey)) continue;

      const targetStop = pair.trip.stops.find(s => s.stopId === pair.arrival.stationId)!;
      const rawDelay = (currentCivilSeconds + pair.arrival.timeToStation) - targetStop.arr;

      if (Math.abs(rawDelay) <= this.options.maxDelaySec) {
        usedTrips.add(pair.trip.tripId);
        consumedArrivalIds.add(arrivalKey);

        if (pair.vehicleId) {
          this.vehicleToTripMap.set(pair.vehicleId, pair.trip.tripId);
          this.tripToVehicleMap.set(pair.trip.tripId, pair.vehicleId);
        }

        const prevDelay = this.lastDelaysByTripId.get(pair.trip.tripId) ?? rawDelay;
        const smoothedDelay = prevDelay + this.options.alpha * (rawDelay - prevDelay);
        this.lastDelaysByTripId.set(pair.trip.tripId, smoothedDelay);

        matchedTrips.set(pair.trip.tripId, {
          tripId: pair.trip.tripId,
          lineId: pair.trip.lineId,
          vehicleId: pair.vehicleId,
          delayS: Math.round(smoothedDelay),
          confidence: 'measured',
          nextStationId: pair.arrival.stationId,
          timeToNextStationS: pair.arrival.timeToStation,
          measuredAtSeconds: currentCivilSeconds
        });
      }
    }

    // 4. Étape C : Product Honesty — les courses actives non matchées restent en 'scheduled'
    for (const trip of activeTrips) {
      if (!matchedTrips.has(trip.tripId)) {
        matchedTrips.set(trip.tripId, {
          tripId: trip.tripId,
          lineId: trip.lineId,
          vehicleId: null,
          delayS: 0,
          confidence: 'scheduled',
          measuredAtSeconds: currentCivilSeconds
        });
      }
    }

    const matchedCount = Array.from(matchedTrips.values()).filter(m => m.confidence === 'measured').length;
    const totalActiveCount = activeTrips.length;
    const coveragePct = totalActiveCount > 0 ? Math.round((matchedCount / totalActiveCount) * 100) : 0;

    return {
      matchesByTripId: matchedTrips,
      matchedCount,
      totalActiveCount,
      coveragePct,
      lockedVehiclesCount: this.vehicleToTripMap.size
    };
  }
}
