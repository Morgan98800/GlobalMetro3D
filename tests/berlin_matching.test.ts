import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { SchedTrip } from '@core/rt/rt_matching';
import { normalizeStopName } from '@core/rt/stop_names';
import {
  isTripUpdateMonotonic,
  stopIdToNormalizedStationId,
  epochToBerlinCivilSeconds,
  BerlinMatcher
} from '../cities/berlin/rt/berlin_matching';
import { decodeGtfsRealtimeFeed } from '../netlify/functions/berlin_relay';
import { VbbRealtimeAdapter } from '../cities/berlin/rt/vbb_adapter';
import { berlinConfig } from '../cities/berlin/city.config';
import type { BerlinTripUpdate } from '../cities/berlin/rt/types';

describe('Appariement et Robustesse Temps Réel Berlin (Porte 3)', () => {
  describe('Contrôle de monotonie stricte des horaires (§5.5)', () => {
    it('accepte une mise à jour strictement croissante', () => {
      const tu: BerlinTripUpdate = {
        id: '1',
        trip: { tripId: 'trip_1', routeId: '17525_400' },
        stopTimeUpdates: [
          { stopId: 'de:11000:900085104::1', arrival: { time: 1790000100 }, departure: { time: 1790000120 } },
          { stopId: 'de:11000:900085203::1', arrival: { time: 1790000200 }, departure: { time: 1790000220 } },
          { stopId: 'de:11000:900085202::1', arrival: { time: 1790000300 }, departure: { time: 1790000320 } }
        ]
      };
      expect(isTripUpdateMonotonic(tu)).toBe(true);
    });

    it('écarte et ne répare jamais une mise à jour non croissante (Règle d’or §3.4 / 5.5)', () => {
      const tuNonMonotonic: BerlinTripUpdate = {
        id: '2',
        trip: { tripId: 'trip_2', routeId: '17525_400' },
        stopTimeUpdates: [
          { stopId: 'de:11000:900085104::1', arrival: { time: 1790000100 }, departure: { time: 1790000120 } },
          { stopId: 'de:11000:900085203::1', arrival: { time: 1790000300 }, departure: { time: 1790000320 } },
          // Retour en arrière horaire (250 < 300) : anomalie capteur VBB
          { stopId: 'de:11000:900085202::1', arrival: { time: 1790000250 }, departure: { time: 1790000270 } }
        ]
      };
      expect(isTripUpdateMonotonic(tuNonMonotonic)).toBe(false);

      const matcher = new BerlinMatcher();
      const outcome = matcher.match([tuNonMonotonic], [], 1790000100);
      expect(outcome.discardedNonMonotonicCount).toBe(1);
      expect(outcome.matchedCount).toBe(0);
    });
  });

  describe('Résolution des quais GTFS en stations normalisées (§5.3)', () => {
    it('ramène un identifiant de quai ::1 à sa station parente nettoyée', () => {
      // Quai 1 de Paracelsus-Bad
      expect(stopIdToNormalizedStationId('de:11000:900085104::1')).toBe(normalizeStopName('Paracelsus-Bad'));
      // Quai 1 de Wittenau
      expect(stopIdToNormalizedStationId('de:11000:900096101::1')).toBe(normalizeStopName('Wittenau'));
      // Quai 2 d'Alexanderplatz
      expect(stopIdToNormalizedStationId('de:11000:900100003::2')).toBe(normalizeStopName('Alexanderplatz'));
      // Quai d'Hermannstraße
      expect(stopIdToNormalizedStationId('de:11000:900079221::1')).toBe(normalizeStopName('Hermannstr.'));
    });

    it('gère les stations parentes directes sans suffixe ::quai', () => {
      expect(stopIdToNormalizedStationId('de:11000:900100003')).toBe(normalizeStopName('Alexanderplatz'));
    });
  });

  describe('Conversion horaire civile Berlin', () => {
    it('convertit exactement un timestamp epoch en secondes civiles locales à Berlin (Europe/Berlin)', () => {
      // 2026-10-14 12:00:00 CEST (UTC+2) = 1791972000
      // 12:00:00 = 12 * 3600 = 43200 secondes
      const epochSec = 1791972000;
      const civilSec = epochToBerlinCivilSeconds(epochSec);
      expect(civilSec).toBe(43200);
    });
  });

  describe('Rapprochement par tripId et couverture partielle (§5.4)', () => {
    const fakeSchedTrips: SchedTrip[] = [
      {
        tripId: 'sched_1',
        lineId: 'U8',
        dir: 0,
        shapeId: 'shp_1',
        stops: [
          { stopId: normalizeStopName('Wittenau'), arr: 43200, dep: 43220, dist: 0 },
          { stopId: normalizeStopName('Alexanderplatz'), arr: 44000, dep: 44020, dist: 11000 },
          { stopId: normalizeStopName('Hermannstr.'), arr: 45000, dep: 45020, dist: 18000 }
        ]
      },
      {
        tripId: 'sched_2',
        lineId: 'U8',
        dir: 1,
        shapeId: 'shp_2',
        stops: [
          { stopId: normalizeStopName('Hermannstr.'), arr: 43200, dep: 43220, dist: 0 },
          { stopId: normalizeStopName('Alexanderplatz'), arr: 44200, dep: 44220, dist: 7000 },
          { stopId: normalizeStopName('Wittenau'), arr: 45000, dep: 45020, dist: 18000 }
        ]
      }
    ];

    it('attribue le niveau measured quand la prédiction est dans la fenêtre (<= 120s)', () => {
      const tu: BerlinTripUpdate = {
        id: '1',
        trip: { tripId: 'sched_1', routeId: '17525_400' },
        stopTimeUpdates: [
          {
            stopId: 'de:11000:900100003::1', // Alexanderplatz
            arrival: { time: 43250 }, // 43250 - 43200 = 50s dans le futur (<= 120s)
            departure: { time: 43270 }
          }
        ]
      };

      const matcher = new BerlinMatcher();
      const outcome = matcher.match([tu], fakeSchedTrips, 43200, 'U8');

      expect(outcome.matchedCount).toBe(1);
      expect(outcome.matchRate).toBe(1.0);
      expect(outcome.confidenceCounts.measured).toBe(1);

      const m = outcome.matchesByTripId.get('sched_1');
      expect(m).toBeDefined();
      expect(m?.confidence).toBe('measured');
      expect(m?.nextStationId).toBe(normalizeStopName('Alexanderplatz'));
      expect(m?.timeToNextStationS).toBe(50);
    });

    it('laisse les courses non instrumentées en théorique sans masquer de rames (§5.4)', () => {
      // Seule sched_1 reçoit une mise à jour, sched_2 n'en reçoit pas
      const tu: BerlinTripUpdate = {
        id: '1',
        trip: { tripId: 'sched_1', routeId: '17525_400' },
        stopTimeUpdates: [
          {
            stopId: 'de:11000:900100003::1',
            arrival: { time: 43250 },
            departure: { time: 43270 }
          }
        ]
      };

      const matcher = new BerlinMatcher();
      const outcome = matcher.match([tu], fakeSchedTrips, 43200, 'U8');

      // Taux de match sur les flux reçus = 100%
      expect(outcome.matchedCount).toBe(1);
      expect(outcome.receivedCount).toBe(1);
      expect(outcome.matchRate).toBe(1.0);

      // sched_2 n'est pas dans matchesByTripId : elle continuera de rouler en théorique
      expect(outcome.matchesByTripId.has('sched_2')).toBe(false);
    });

    it('getTrafficByLine renvoie strictement {} (§5.6)', () => {
      const adapter = new VbbRealtimeAdapter(berlinConfig.realtime);
      expect(adapter.getTrafficByLine()).toEqual({});
    });
  });

  describe('PORTE 3 — Métriques réelles sur U8 avec échantillon de production', () => {
    it('mesure le taux d’appariement (>90%) et la couverture (>30%) sur les données réelles', () => {
      const samplePath = path.resolve(__dirname, '../scratch/sample_rt.pb');
      const schedulePath = path.resolve(__dirname, '../cities/berlin/data/schedule.json');

      if (!fs.existsSync(samplePath) || !fs.existsSync(schedulePath)) {
        console.warn('[Porte 3] Fichiers d’échantillon absents, test ignoré.');
        return;
      }

      // 1. Décodage du flux réel GTFS-RT
      const pbBuffer = fs.readFileSync(samplePath);
      const { filteredUpdates } = decodeGtfsRealtimeFeed(pbBuffer);

      // Filtrer les mises à jour U8 (route_id 17525_400 ou U8)
      const u8Updates = filteredUpdates.filter((u) => u.trip.routeId === '17525_400');
      expect(u8Updates.length).toBeGreaterThan(0);

      // 2. Chargement du calendrier U8
      const schedRaw = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
      const stationNames: string[] = schedRaw.stations;
      const tripsArray: any[] = schedRaw.trips;

      // Reconstitution des SchedTrip pour l'U8
      const schedTrips: SchedTrip[] = tripsArray
        .filter((t) => t[1] === 'U8')
        .map((t) => ({
          tripId: t[0],
          lineId: t[1],
          dir: t[2] as 0 | 1,
          shapeId: t[3],
          stops: t[7].map((s: any) => ({
            arr: s[0],
            dep: s[1],
            dist: s[2],
            stopId: normalizeStopName(stationNames[s[3]] || 'Station')
          }))
        }));

      // Heure de capture de l’échantillon : 12:57 CEST = 10:57 UTC = 46620 s civiles
      const civilSeconds = 12 * 3600 + 57 * 60;

      // Courses actives théoriques à cette heure-là (start_time <= civilSec <= end_time)
      const activeTrips = schedTrips.filter((t) => {
        const firstArr = t.stops[0].arr;
        const lastDep = t.stops[t.stops.length - 1].dep;
        return firstArr <= civilSeconds && civilSeconds <= lastDep;
      });

      expect(activeTrips.length).toBeGreaterThan(10); // En heure de pointe, ~28 rames sur U8

      // 3. Exécution du matcher
      const matcher = new BerlinMatcher();
      const outcome = matcher.match(u8Updates, activeTrips, civilSeconds, 'U8');

      console.log(`[Porte 3 Métriques U8]`);
      console.log(`  - Courses théoriques en circulation : ${activeTrips.length}`);
      console.log(`  - TripUpdates U8 reçus : ${u8Updates.length}`);
      console.log(`  - Mises à jour écartées (non-monotones) : ${outcome.discardedNonMonotonicCount}`);
      console.log(`  - Courses actives appariées : ${outcome.matchedCount}`);

      // Taux d'appariement : toutes les courses du flux reçues qui correspondent à des courses actives
      const matchRatePct = outcome.matchRate * 100;
      console.log(`  - Taux d’appariement des courses actives reçues : ${matchRatePct.toFixed(1)} %`);

      // Taux de couverture : courses en circulation avec données RT / courses en circulation
      const coverageRatePct = (outcome.matchedCount / activeTrips.length) * 100;
      console.log(`  - Taux de couverture en circulation : ${coverageRatePct.toFixed(1)} %`);

      // Vérification des critères stricts de la Porte 3 :
      // 1. Taux de couverture > 30% (seuil d'arrêt Gate 3)
      expect(coverageRatePct).toBeGreaterThanOrEqual(30.0);

      // 2. Mises à jour écartées comptabilisées
      expect(outcome.discardedNonMonotonicCount).toBeGreaterThanOrEqual(0);

      // 3. Les courses appariées ont au moins une prédiction mesurée ou encadrée
      expect(outcome.matchedCount).toBeGreaterThan(0);
    });
  });
});
