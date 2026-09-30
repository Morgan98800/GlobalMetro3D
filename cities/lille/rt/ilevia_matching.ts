import type { SchedTrip, Confidence } from '@core/rt/rt_matching';
import type { IleviaTripUpdate, IleviaStopTimeUpdate } from './types';

export interface IleviaMatchConfig {
  matchWindowSec: number;
  maxDelaySec: number;
}

export interface IleviaTripMatch {
  tripId: string;
  matchedSchedTripId: string;
  confidence: Confidence;
  nextStationId?: string;
  timeToNextStationS?: number;
  delaySeconds?: number;
}

export interface IleviaMatchOutcome {
  matchedCount: number;
  receivedCount: number;
  matchRate: number; // 0.0 à 1.0 (ex: 0.85 = 85%)
  discardedNonMonotonicCount: number;
  confidenceCounts: Record<Confidence, number>;
  matchesByTripId: Map<string, IleviaTripMatch>;
}

/**
 * Valide la stricte croissance chronologique des prédictions d'une course.
 * Règle d'or §3.4 : « Une mise à jour non croissante est écartée, jamais réparée
 * en inventant un horaire, et comptée dans les statistiques de l'adaptateur. »
 */
export function isTripUpdateMonotonic(tu: IleviaTripUpdate): boolean {
  if (!tu.stopTimeUpdates || tu.stopTimeUpdates.length < 2) {
    return true;
  }

  let lastTime: number | null = null;
  for (const stu of tu.stopTimeUpdates) {
    const t = stu.arrival?.time ?? stu.departure?.time;
    if (t !== undefined && t !== null) {
      if (lastTime !== null && t <= lastTime) {
        return false; // Non-monotonie détectée
      }
      lastTime = t;
    }
  }
  return true;
}

export class IleviaMatcher {
  constructor(private readonly config: IleviaMatchConfig = { matchWindowSec: 120, maxDelaySec: 900 }) {}

  public match(
    updates: readonly IleviaTripUpdate[],
    activeSchedTrips: readonly SchedTrip[],
    currentCivilSeconds: number,
    filterRouteId?: string
  ): IleviaMatchOutcome {
    const relevantUpdates = filterRouteId
      ? updates.filter((u) => u.trip.routeId === filterRouteId)
      : updates;

    let discardedNonMonotonicCount = 0;
    const validUpdates: IleviaTripUpdate[] = [];

    for (const u of relevantUpdates) {
      if (!isTripUpdateMonotonic(u)) {
        discardedNonMonotonicCount++;
      } else {
        validUpdates.push(u);
      }
    }

    const schedMap = new Map<string, SchedTrip>();
    for (const t of activeSchedTrips) {
      schedMap.set(t.tripId, t);
    }

    const matchesByTripId = new Map<string, IleviaTripMatch>();
    const confidenceCounts: Record<Confidence, number> = {
      measured: 0,
      bracketed: 0,
      extrapolated: 0,
      scheduled: 0
    };

    for (const u of validUpdates) {
      const tripId = u.trip.tripId;
      const sched = schedMap.get(tripId);
      if (!sched) continue;

      // Recherche de la prochaine station avec heure prédite future
      let nextStopId: string | undefined;
      let timeToNextS: number | undefined;

      for (const stu of u.stopTimeUpdates) {
        if (!stu.stopId) continue;
        const predTime = stu.arrival?.time ?? stu.departure?.time;
        if (predTime !== undefined) {
          // Si predTime est un timestamp epoch unix, le convertir en secondes de service locales
          const predLocalSec = predTime > 86400 * 10
            ? Math.floor(predTime % 86400) // approximation relative
            : predTime;

          const diffS = predLocalSec - currentCivilSeconds;
          if (diffS >= -30) {
            nextStopId = stu.stopId;
            timeToNextS = Math.max(0, diffS);
            break;
          }
        }
      }

      let conf: Confidence = 'scheduled';
      if (nextStopId && timeToNextS !== undefined) {
        if (timeToNextS <= this.config.matchWindowSec) {
          conf = 'measured'; // Niveau de confiance nominal des prédictions (similaire à Londres)
        } else if (timeToNextS <= this.config.maxDelaySec) {
          conf = 'bracketed';
        }
      }

      confidenceCounts[conf]++;
      matchesByTripId.set(tripId, {
        tripId,
        matchedSchedTripId: sched.tripId,
        confidence: conf,
        nextStationId: nextStopId,
        timeToNextStationS: timeToNextS,
        delaySeconds: u.delay
      });
    }

    const matchedCount = matchesByTripId.size;
    const receivedCount = relevantUpdates.length;
    const matchRate = receivedCount > 0 ? matchedCount / receivedCount : 0.0;

    return {
      matchedCount,
      receivedCount,
      matchRate,
      discardedNonMonotonicCount,
      confidenceCounts,
      matchesByTripId
    };
  }
}
