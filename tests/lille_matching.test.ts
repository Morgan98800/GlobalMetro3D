import { describe, it, expect, beforeEach } from 'vitest';
import { IleviaMatcher, isTripUpdateMonotonic } from '../cities/lille/rt/ilevia_matching';
import { IleviaRealtimeAdapter } from '../cities/lille/rt/ilevia_adapter';
import { createRealtimeAdapter } from '../cities/realtime';
import { lilleConfig } from '../cities/lille/city.config';
import type { IleviaTripUpdate } from '../netlify/functions/lille_relay';
import type { SchedTrip } from '@core/rt/rt_matching';
import fs from 'fs';
import path from 'path';

describe('Appariement et validation temps réel Ilévia (Phase 3)', () => {
  describe('Contrôle de monotonie (§3.4)', () => {
    it('valide une mise à jour aux horaires strictement croissants', () => {
      const validUpdate: IleviaTripUpdate = {
        id: '1',
        trip: { tripId: '5538720', routeId: 'ME1' },
        stopTimeUpdates: [
          { stopSequence: 1, stopId: '4CA099', departure: { time: 1790760000 } },
          { stopSequence: 2, stopId: 'CSC099', arrival: { time: 1790760086 } },
          { stopSequence: 3, stopId: 'TIO099', arrival: { time: 1790760161 } }
        ]
      };
      expect(isTripUpdateMonotonic(validUpdate)).toBe(true);
    });

    it('écarte une mise à jour non croissante sans inventer d’horaire (§3.4)', () => {
      const defectiveUpdate: IleviaTripUpdate = {
        id: '2',
        trip: { tripId: '5538720', routeId: 'ME1' },
        stopTimeUpdates: [
          { stopSequence: 1, stopId: '4CA099', departure: { time: 1790760100 } },
          { stopSequence: 2, stopId: 'CSC099', arrival: { time: 1790760050 } } // Recul de 50 s !
        ]
      };
      expect(isTripUpdateMonotonic(defectiveUpdate)).toBe(false);

      const matcher = new IleviaMatcher();
      const outcome = matcher.match([defectiveUpdate], [], 30600);
      expect(outcome.discardedNonMonotonicCount).toBe(1);
      expect(outcome.matchedCount).toBe(0);
    });
  });

  describe('Appariement par trip_id et niveaux de confiance (§3.3 & §3.5)', () => {
    const mockSchedTrip: SchedTrip = {
      tripId: '5539138',
      lineId: 'ME1',
      dir: 0,
      shapeId: 'ME1_0',
      stops: [
        { stopId: '4CA099', arr: 30500, dep: 30500, dist: 26.4 },
        { stopId: 'CSC099', arr: 30586, dep: 30586, dist: 802.1 }
      ]
    };

    it('attribue la confiance "measured" pour une prédiction d’arrivée dans la fenêtre', () => {
      const update: IleviaTripUpdate = {
        id: '10',
        trip: { tripId: '5539138', routeId: 'ME1' },
        stopTimeUpdates: [
          { stopSequence: 2, stopId: 'CSC099', arrival: { time: 30650 } } // +50s du temps civil
        ]
      };

      const matcher = new IleviaMatcher({ matchWindowSec: 120, maxDelaySec: 900 });
      const outcome = matcher.match([update], [mockSchedTrip], 30600);

      expect(outcome.matchedCount).toBe(1);
      expect(outcome.confidenceCounts.measured).toBe(1);
      const match = outcome.matchesByTripId.get('5539138');
      expect(match?.confidence).toBe('measured');
      expect(match?.timeToNextStationS).toBe(50);
    });

    it('attribue la confiance "bracketed" pour une prédiction au-delà de matchWindow', () => {
      const update: IleviaTripUpdate = {
        id: '11',
        trip: { tripId: '5539138', routeId: 'ME1' },
        stopTimeUpdates: [
          { stopSequence: 2, stopId: 'CSC099', arrival: { time: 30800 } } // +200s (> 120s)
        ]
      };

      const matcher = new IleviaMatcher({ matchWindowSec: 120, maxDelaySec: 900 });
      const outcome = matcher.match([update], [mockSchedTrip], 30600);

      expect(outcome.matchedCount).toBe(1);
      expect(outcome.confidenceCounts.bracketed).toBe(1);
    });
  });

  describe('Adaptateur RealtimeAdapter (§3.2 & §3.6)', () => {
    it('est bien instancié depuis cities/realtime.ts avec le provider "ilevia-gtfsrt"', () => {
      const adapter = createRealtimeAdapter(lilleConfig);
      expect(adapter).toBeInstanceOf(IleviaRealtimeAdapter);
    });

    it('getTrafficByLine renvoie {} (aucun flux d’alertes Ilévia, §3.6)', () => {
      const adapter = createRealtimeAdapter(lilleConfig);
      expect(adapter.getTrafficByLine()).toEqual({});
    });
  });

  describe('Mesure du taux d’appariement de la Ligne 1 (PORTE 3)', () => {
    it('taux d’appariement sur injection synthétique représentative', () => {
      // Chargement du vrai schedule lillois
      const schedPath = path.resolve(__dirname, '../cities/lille/data/schedule.json');
      const schedData = JSON.parse(fs.readFileSync(schedPath, 'utf8'));
      const activeTrips: SchedTrip[] = schedData.trips
        .filter((t: any) => t[1] === 'ME1' && t[4] <= 30600 && 30600 <= t[5])
        .map((t: any) => ({
          tripId: String(t[0]),
          lineId: t[1],
          dir: t[2],
          shapeId: t[3],
          stops: t[7].map((s: any) => ({
            arr: s[0],
            dep: s[1],
            dist: s[2],
            stopId: schedData.stations[s[3]]
          }))
        }));

      expect(activeTrips.length).toBe(32);

      // Simulation de mises à jour reçues pour 10 rames actives de la ligne 1
      const sampleUpdates: IleviaTripUpdate[] = activeTrips.slice(0, 10).map((t, idx) => ({
        id: `sample_${idx}`,
        trip: { tripId: t.tripId, routeId: 'ME1' },
        stopTimeUpdates: [
          { stopSequence: 1, stopId: 'TEST_STOP', arrival: { time: 30640 } }
        ]
      }));

      const matcher = new IleviaMatcher();
      const outcome = matcher.match(sampleUpdates, activeTrips, 30600, 'ME1');

      expect(outcome.receivedCount).toBe(10);
      expect(outcome.matchedCount).toBe(10);
      expect(outcome.matchRate).toBe(1.0); // 100% d’appariement par trip_id stable
      expect(outcome.discardedNonMonotonicCount).toBe(0);
    });

    it('identifie 68 rames actives pour la Ligne 2 et les apparie à 100% par trip_id', () => {
      const schedPath = path.resolve(__dirname, '../web/public/cities/lille/data/schedule.json');
      const schedData = JSON.parse(fs.readFileSync(schedPath, 'utf-8'));

      const activeTripsL2: SchedTrip[] = schedData.trips
        .filter((t: any[]) => t[1] === 'ME2' && t[4] <= 30600 && t[5] >= 30600)
        .map((t: any[]) => ({
          tripId: t[0],
          lineId: t[1],
          dir: t[2],
          shapeId: t[3],
          stops: t[7].map((s: any[]) => ({
            arr: s[0],
            dep: s[1],
            dist: s[2],
            stopId: schedData.stations[s[3]]
          }))
        }));

      expect(activeTripsL2.length).toBe(68);

      const sampleUpdates: IleviaTripUpdate[] = activeTripsL2.slice(0, 15).map((t, idx) => ({
        id: `sample_l2_${idx}`,
        trip: { tripId: t.tripId, routeId: 'ME2' },
        stopTimeUpdates: [
          { stopSequence: 1, stopId: 'TEST_STOP_L2', arrival: { time: 30650 } }
        ]
      }));

      const matcher = new IleviaMatcher();
      const outcome = matcher.match(sampleUpdates, activeTripsL2, 30600, 'ME2');

      expect(outcome.receivedCount).toBe(15);
      expect(outcome.matchedCount).toBe(15);
      expect(outcome.matchRate).toBe(1.0);
      expect(outcome.discardedNonMonotonicCount).toBe(0);
    });
  });
});
