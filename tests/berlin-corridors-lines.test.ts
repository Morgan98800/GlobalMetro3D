import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  computeBerlinSnapshot,
  SNAPSHOT_TIMESTAMP_ISO_BERLIN,
  SNAPSHOT_TIMESTAMP_ISO_BERLIN_NIGHT
} from './snapshot_generator';
import { BerlinMatcher } from '../cities/berlin/rt/berlin_matching';
import type { BerlinTripUpdate } from '../cities/berlin/rt/types';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, 'cities/berlin/data');

describe('Berlin U-Bahn (BVG) — PORTE 5 : Les 9 lignes et tronçon partagé U1/U3', () => {
  it('PORTE 5 §1 : Valide le cadencement des 9 lignes au snapshot nominal (118 rames au total)', () => {
    const snap = computeBerlinSnapshot(ROOT, SNAPSHOT_TIMESTAMP_ISO_BERLIN);

    expect(snap.trains).toHaveLength(118);
    expect(snap.meta.totalTrains).toBe(118);

    // Répartition stricte par ligne à 14:00 CEST
    expect(snap.meta.trainsByLine['U7']).toBe(22);
    expect(snap.meta.trainsByLine['U2']).toBe(20);
    expect(snap.meta.trainsByLine['U3']).toBe(18);
    expect(snap.meta.trainsByLine['U5']).toBe(16);
    expect(snap.meta.trainsByLine['U8']).toBe(14);
    expect(snap.meta.trainsByLine['U6']).toBe(13);
    expect(snap.meta.trainsByLine['U9']).toBe(12);
    expect(snap.meta.trainsByLine['U4']).toBe(2);
    expect(snap.meta.trainsByLine['U1']).toBe(1);

    // Équilibre par direction sur le réseau global
    const dir0Count = snap.trains.filter((t) => t.direction === 0).length;
    const dir1Count = snap.trains.filter((t) => t.direction === 1).length;
    expect(dir0Count + dir1Count).toBe(118);
    expect(Math.abs(dir0Count - dir1Count)).toBeLessThanOrEqual(6);
  });

  it('PORTE 5 §2 : Garantit que la livraison des nouvelles lignes ne déplace aucune rame U8', () => {
    const frozenU8Fixture = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'tests/fixtures/berlin-snapshot.json'), 'utf8')
    );
    const expectedU8Trains = frozenU8Fixture.trains.filter((t: any) => t.line === 'U8');
    expect(expectedU8Trains).toHaveLength(14);

    const currentSnapshot = computeBerlinSnapshot(ROOT, SNAPSHOT_TIMESTAMP_ISO_BERLIN);
    const currentU8Trains = currentSnapshot.trains.filter((t) => t.line === 'U8');
    expect(currentU8Trains).toHaveLength(14);

    const expectedMap = new Map(expectedU8Trains.map((t: any) => [t.tripId, t]));

    for (const train of currentU8Trains) {
      const expected = expectedMap.get(train.tripId) as any;
      expect(expected, `Train U8 ${train.tripId} doit exister dans le snapshot de référence`).toBeDefined();

      const distDelta = Math.abs(train.currentDistM - expected.currentDistM);
      const speedDelta = Math.abs(train.speedMps - expected.speedMps);

      expect(distDelta, `Déplacement interdit sur la rame ${train.tripId}: ${distDelta}m`).toBeLessThanOrEqual(0.001);
      expect(speedDelta, `Écart de vitesse interdit sur la rame ${train.tripId}: ${speedDelta}m/s`).toBeLessThanOrEqual(0.001);
      expect(train.pos[0]).toBeCloseTo(expected.pos[0], 6);
      expect(train.pos[1]).toBeCloseTo(expected.pos[1], 6);
    }
  });

  it('PORTE 5 §3 : Tronçon partagé U1/U3 — aucune paire de rames ne se chevauche à l’écran', () => {
    const snap = computeBerlinSnapshot(ROOT, SNAPSHOT_TIMESTAMP_ISO_BERLIN);
    const u1u3Trains = snap.trains.filter((t) => t.line === 'U1' || t.line === 'U3');

    // Sur le corridor partagé de Wittenbergplatz à Warschauer Straße (lon 13.34 à 13.45, lat 52.49 à 52.51)
    const corridorTrains = u1u3Trains.filter((t) => {
      const [lon, lat] = t.pos;
      return lon >= 13.34 && lon <= 13.46 && lat >= 52.49 && lat <= 52.51;
    });

    for (let i = 0; i < corridorTrains.length; i++) {
      for (let j = i + 1; j < corridorTrains.length; j++) {
        const t1 = corridorTrains[i];
        const t2 = corridorTrains[j];
        if (t1.line !== t2.line && t1.direction === t2.direction) {
          const dx = (t2.pos[0] - t1.pos[0]) * 67800; // mètres approximatifs lon à Berlin
          const dy = (t2.pos[1] - t1.pos[1]) * 111300;
          const distM = Math.hypot(dx, dy);

          // Espacement d'au moins 100 m entre rames sur le tronc commun
          expect(
            distM,
            `Superposition anormale sur tronc commun U1/U3 entre ${t1.line} (${t1.tripId}) et ${t2.line} (${t2.tripId}) : distance=${distM.toFixed(1)}m`
          ).toBeGreaterThan(100);
        }
      }
    }
  });

  it('PORTE 5 §4 : Vérifie le profil cinématique sur l’interstation longue de l’U5 (> 1.8 km)', () => {
    const sched = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule.json'), 'utf8'));
    const stations: string[] = sched.stations;
    const u5Trips = sched.trips.filter((t: any) => t[1] === 'U5');

    let maxInterM = 0;
    let maxInterFrom = '';
    let maxInterTo = '';
    let scheduledTimeS = 0;

    for (const t of u5Trips) {
      const stops = t[7];
      for (let i = 1; i < stops.length; i++) {
        const d = stops[i][2] - stops[i - 1][2];
        if (d > maxInterM) {
          maxInterM = d;
          maxInterFrom = stations[stops[i - 1][3]];
          maxInterTo = stations[stops[i][3]];
          scheduledTimeS = stops[i][0] - stops[i - 1][1];
        }
      }
    }

    // Interstation la plus longue : Tierpark -> Biesdorf-Süd (~1 856 m)
    expect(maxInterM).toBeGreaterThan(1800);
    expect(maxInterFrom).toBe('Tierpark');
    expect(maxInterTo).toBe('Biesdorf-Süd');

    // Le temps théorique alloué par le GTFS doit être suffisant pour parcourir la distance à 70 km/h (19.44 m/s)
    // avec accélération et freinage à 1.15 m/s² (temps minimal théorique ~112 s)
    expect(scheduledTimeS).toBeGreaterThanOrEqual(120);
  });

  it('PORTE 5 §5 : Vérifie que l’U6 s’arrête strictement à Kurt-Schumacher-Platz (aucun tracé nord fermé)', () => {
    const sched = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule.json'), 'utf8'));
    const stations: string[] = sched.stations;
    const u6Trips = sched.trips.filter((t: any) => t[1] === 'U6');

    // Aucune course U6 ne doit desservir Alt-Tegel, Borsigwerke, Holzhauser Str., Otisstr. ni Scharnweberstr.
    const closedStations = ['Alt-Tegel', 'Borsigwerke', 'Holzhauser Str.', 'Otisstr.', 'Scharnweberstr.'];

    for (const t of u6Trips) {
      const stopNames = t[7].map((s: any) => stations[s[3]]);
      for (const closed of closedStations) {
        expect(stopNames).not.toContain(closed);
      }
    }

    // Le terminus nord de l'U6 doit être Kurt-Schumacher-Platz
    const northTermini = new Set(
      u6Trips.filter((t: any) => t[2] === 1).map((t: any) => stations[t[6]])
    );
    expect(northTermini).toContain('Kurt-Schumacher-Platz');
  });

  it('PORTE 5 §6 : Rapporte les variantes de service de l’U2 (27 variantes préservées)', () => {
    const sched = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule.json'), 'utf8'));
    const u2Trips = sched.trips.filter((t: any) => t[1] === 'U2');

    const u2Patterns = new Set();
    for (const t of u2Trips) {
      const pattern = t[7].map((s: any) => s[3]).join(',');
      u2Patterns.add(`${t[2]}_${pattern}`);
    }

    // Exactement 27 variantes de desserte préservées (travaux Nollendorfplatz / tronçons partiels)
    expect(u2Patterns.size).toBe(27);
  });

  it('PORTE 5 §7 : Taux d’appariement du moteur temps réel sur chaque ligne individuelle', () => {
    const matcher = new BerlinMatcher({ matchWindowSec: 120, maxDelaySec: 900 });
    const sched = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule.json'), 'utf8'));
    const lines = ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9'];

    for (const lineId of lines) {
      const lineTrips = sched.trips.filter((t: any) => t[1] === lineId);
      expect(lineTrips.length).toBeGreaterThan(0);

      // Simulation de 5 prédictions alignées sur les courses de la ligne
      const sampleUpdates: BerlinTripUpdate[] = lineTrips.slice(0, 5).map((t: any) => {
        const tripId = t[0];
        const stops = t[7];
        const firstDep = stops[0][1];
        return {
          id: `sample_${tripId}`,
          trip: {
            tripId,
            routeId: lineId,
            directionId: t[2]
          },
          stopTimeUpdates: [
            {
              stopSequence: 1,
              stopId: `stn_${stops[0][3]}`,
              departure: { time: firstDep }
            },
            {
              stopSequence: 2,
              stopId: `stn_${stops[1][3]}`,
              arrival: { time: stops[1][0] },
              departure: { time: stops[1][1] }
            }
          ],
          delay: 0
        };
      });

      const activeTrips = lineTrips.slice(0, 5).map((t: any) => ({
        tripId: t[0],
        lineId: t[1],
        dir: t[2] as 0 | 1,
        shapeId: t[3],
        stops: []
      }));

      const outcome = matcher.match(sampleUpdates, activeTrips, 50400, lineId);
      expect(outcome.matchedCount).toBe(5);
      expect(outcome.matchRate).toBe(1.0);
    }
  });
});
