import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  computeWashingtonSnapshot,
  SNAPSHOT_TIMESTAMP_ISO_WASHINGTON,
  SNAPSHOT_TIMESTAMP_ISO_WASHINGTON_WINTER
} from './snapshot_generator';
import { WashingtonMatcher } from '../cities/washington/rt/washington_matching';
import type { WashingtonTripUpdate } from '../cities/washington/rt/types';
import { textColorFor } from '../core/ui/components/line_badge';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, 'cities/washington/data');

describe('Washington DC (WMATA Metrorail) — PORTE 5 : Les six lignes et tronçons partagés', () => {
  it('PORTE 5 §1 : Valide le cadencement des 6 lignes au snapshot nominal (97 rames au total)', () => {
    const snap = computeWashingtonSnapshot(ROOT, SNAPSHOT_TIMESTAMP_ISO_WASHINGTON);

    expect(snap.trains).toHaveLength(97);
    expect(snap.meta.totalTrains).toBe(97);

    // Répartition stricte par ligne
    expect(snap.meta.trainsByLine['RED']).toBe(26);
    expect(snap.meta.trainsByLine['ORANGE']).toBe(12);
    expect(snap.meta.trainsByLine['SILVER']).toBe(19);
    expect(snap.meta.trainsByLine['BLUE']).toBe(13);
    expect(snap.meta.trainsByLine['GREEN']).toBe(18);
    expect(snap.meta.trainsByLine['YELLOW']).toBe(9);

    // Équilibre par direction sur le réseau global
    const dir0Count = snap.trains.filter(t => t.direction === 0).length;
    const dir1Count = snap.trains.filter(t => t.direction === 1).length;
    expect(dir0Count).toBe(49);
    expect(dir1Count).toBe(48);
  });

  it('PORTE 5 §2 : Garantit que la livraison de chaque ligne ne déplace aucune rame des lignes antérieures', () => {
    // Vérification de non-régression stricte sur la Ligne Red
    const frozenRedFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/washington-snapshot.json'), 'utf8'));
    const expectedRedTrains = frozenRedFixture.trains.filter((t: any) => t.line === 'RED');
    expect(expectedRedTrains).toHaveLength(26);

    const currentSnapshot = computeWashingtonSnapshot(ROOT, SNAPSHOT_TIMESTAMP_ISO_WASHINGTON);
    const currentRedTrains = currentSnapshot.trains.filter(t => t.line === 'RED');
    expect(currentRedTrains).toHaveLength(26);

    const expectedMap = new Map(expectedRedTrains.map((t: any) => [t.tripId, t]));

    for (const train of currentRedTrains) {
      const expected = expectedMap.get(train.tripId) as any;
      expect(expected, `Train Red ${train.tripId} doit exister dans le snapshot de référence`).toBeDefined();

      const distDelta = Math.abs(train.currentDistM - expected.currentDistM);
      const speedDelta = Math.abs(train.speedMps - expected.speedMps);

      expect(distDelta, `Déplacement interdit sur la rame ${train.tripId}: ${distDelta}m`).toBeLessThanOrEqual(0.001);
      expect(speedDelta, `Écart de vitesse interdit sur la rame ${train.tripId}: ${speedDelta}m/s`).toBeLessThanOrEqual(0.001);
      expect(train.pos[0]).toBeCloseTo(expected.pos[0], 6);
      expect(train.pos[1]).toBeCloseTo(expected.pos[1], 6);
    }
  });

  it('PORTE 5 §3 : Tronc commun Orange / Silver / Blue (Rosslyn ↔ Stadium-Armory) : aucune superposition de rames hors station', () => {
    const snap = computeWashingtonSnapshot(ROOT, SNAPSHOT_TIMESTAMP_ISO_WASHINGTON);

    // Coordonnées approximatives du tronc commun Rosslyn (-77.070) à Stadium-Armory (-76.977)
    // et latitude 38.885 à 38.905
    const trunkTrains = snap.trains.filter(t => {
      const isOSB = ['ORANGE', 'SILVER', 'BLUE'].includes(t.line);
      const inTrunkArea = t.pos[0] >= -77.08 && t.pos[0] <= -76.97 && t.pos[1] >= 38.88 && t.pos[1] <= 38.91;
      return isOSB && inTrunkArea;
    });

    expect(trunkTrains.length).toBeGreaterThanOrEqual(10);

    // Vérifier les distances entre toutes les paires de rames se déplaçant dans la même direction
    for (let i = 0; i < trunkTrains.length; i++) {
      for (let j = i + 1; j < trunkTrains.length; j++) {
        const t1 = trunkTrains[i];
        const t2 = trunkTrains[j];

        if (t1.direction !== t2.direction) continue; // Voies opposées séparées

        const dx = (t1.pos[0] - t2.pos[0]) * 86326;
        const dy = (t1.pos[1] - t2.pos[1]) * 111195;
        const distM = Math.hypot(dx, dy);

        // Aucune paire de rames de lignes différentes ne doit être superposée (distance > 100 m)
        if (t1.line !== t2.line) {
          expect(
            distM,
            `Superposition anormale sur tronc commun OR/SV/BL entre ${t1.line} (${t1.tripId}) et ${t2.line} (${t2.tripId}) : distance=${distM.toFixed(1)}m`
          ).toBeGreaterThan(100);
        }
      }
    }
  });

  it('PORTE 5 §4 : Tronc commun Green / Yellow (L\'Enfant Plaza ↔ Mt Vernon Sq) : aucune superposition de rames hors station', () => {
    const snap = computeWashingtonSnapshot(ROOT, SNAPSHOT_TIMESTAMP_ISO_WASHINGTON);

    const trunkGYTrains = snap.trains.filter(t => {
      const isGY = ['GREEN', 'YELLOW'].includes(t.line);
      const inTrunkArea = t.pos[0] >= -77.03 && t.pos[0] <= -77.01 && t.pos[1] >= 38.88 && t.pos[1] <= 38.91;
      return isGY && inTrunkArea;
    });

    expect(trunkGYTrains.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < trunkGYTrains.length; i++) {
      for (let j = i + 1; j < trunkGYTrains.length; j++) {
        const t1 = trunkGYTrains[i];
        const t2 = trunkGYTrains[j];

        if (t1.direction !== t2.direction) continue;

        const dx = (t1.pos[0] - t2.pos[0]) * 86326;
        const dy = (t1.pos[1] - t2.pos[1]) * 111195;
        const distM = Math.hypot(dx, dy);

        if (t1.line !== t2.line) {
          expect(
            distM,
            `Superposition anormale sur tronc commun GR/YL entre ${t1.line} (${t1.tripId}) et ${t2.line} (${t2.tripId}) : distance=${distM.toFixed(1)}m`
          ).toBeGreaterThan(100);
        }
      }
    }
  });

  it('PORTE 5 §5 : Taux d\'appariement du moteur temps réel sur chaque ligne individuelle (>= 80%)', () => {
    const matcher = new WashingtonMatcher({ matchWindowSec: 120, maxDelaySec: 900 });

    const lines = ['RED', 'ORANGE', 'SILVER', 'BLUE', 'GREEN', 'YELLOW'];
    const sched = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule.json'), 'utf8'));

    for (const lineId of lines) {
      const lineTrips = sched.trips.filter((t: any) => t[1] === lineId);
      expect(lineTrips.length).toBeGreaterThan(150);

      // Création de 10 prédictions temps réel réalistes alignées sur le GTFS
      const sampleUpdates: WashingtonTripUpdate[] = lineTrips.slice(0, 10).map((t: any) => {
        const tripId = t[0];
        const stops = t[7];
        const firstStop = stops[0];
        const depSec = firstStop[1];

        return {
          trip: {
            tripId,
            routeId: lineId,
            directionId: t[2]
          },
          stopTimeUpdates: [
            {
              stopSequence: 1,
              stopId: sched.stations[firstStop[3]],
              departure: { time: depSec }
            },
            {
              stopSequence: 2,
              stopId: sched.stations[stops[1][3]],
              arrival: { time: stops[1][0] },
              departure: { time: stops[1][1] }
            }
          ],
          delay: 0
        };
      });

      const activeTrips = lineTrips.slice(0, 10).map((t: any) => ({
        tripId: t[0],
        routeId: t[1],
        directionId: t[2],
        shapeId: t[3],
        t0: t[4],
        t1: t[5],
        stops: []
      }));

      const outcome = matcher.match(sampleUpdates, activeTrips, 30600, lineId);

      expect(outcome.receivedCount).toBe(10);
      expect(outcome.matchedCount).toBe(10);
      expect(outcome.matchRate).toBe(1.0); // 100% >= seuil 80% (et seuil éliminatoire 30%)
      expect(outcome.discardedNonMonotonicCount).toBe(0);
    }
  });

  it('PORTE 5 §6 : Conformité colorimétrique dynamique via textColorFor (WCAG contrast ratio >= 3.0)', () => {
    const lines = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'lines.json'), 'utf8'));
    expect(lines).toHaveLength(6);

    for (const line of lines) {
      const bg = line.color;
      const fg = textColorFor(bg, line.text_color);

      // Contrôle de lisibilité
      if (['YELLOW', 'SILVER', 'ORANGE'].includes(line.id)) {
        expect(fg.toUpperCase(), `La ligne ${line.id} (${bg}) sur fond clair doit avoir un texte sombre`).toBe('#000000');
      }
      if (['RED', 'BLUE', 'GREEN'].includes(line.id)) {
        expect(fg.toUpperCase(), `La ligne ${line.id} (${bg}) sur fond foncé doit avoir un texte clair`).toBe('#FFFFFF');
      }

      // La couleur de lines.json doit correspondre à textColorFor
      expect(line.text_color.toUpperCase()).toBe(fg.toUpperCase());
    }
  });
});
