import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import {
  matchJourneys,
  buildTimeline,
  positionAt,
  getKinematicProfile,
  isRerLine,
  RER_LINE_IDS,
  type SchedTrip,
  type RtJourney,
  type RtCall
} from '@core/rt/rt_matching';

function normalizeStopName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('RER RT Matching Acceptance (Phase 5 - 5 Lines)', () => {
  it('should validate kinematic profiles for all 5 RER lines', () => {
    for (const rid of RER_LINE_IDS) {
      assert.strictEqual(isRerLine(rid), true, `${rid} doit être reconnu comme RER`);
      const prof = getKinematicProfile(rid);
      assert.strictEqual(prof.vMax, 30.5, `${rid} doit avoir vMax = 30.5 m/s (110 km/h)`);
      assert.strictEqual(prof.matchWindow, 180, `${rid} doit avoir matchWindow = 180 s`);
      assert.strictEqual(prof.reconcileDurationMs, 400);
      assert.strictEqual(prof.reconcileThresholdM, 50);
    }
  });

  it('should match journeys at peak hour (08:30) with >= 95% rate across all 5 lines', () => {
    const schedulePath = fs.existsSync('web/public/data/rer_schedule.json')
      ? path.resolve('web/public/data/rer_schedule.json')
      : path.resolve(__dirname, '../../web/public/data/rer_schedule.json');
    const scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
    const stations = scheduleData.stations;
    const trips = scheduleData.trips;

    assert.strictEqual(trips.length, 2613, 'Doit contenir exactement 2613 courses actives');

    const allSchedTrips: SchedTrip[] = trips.map((t: any) => ({
      tripId: t[0],
      lineId: t[1],
      dir: (t[2] === 0 ? 0 : 1) as 0 | 1,
      shapeId: t[3],
      stops: t[7].map((s: any) => ({
        stopId: normalizeStopName(stations[s[3]] || ''),
        arr: s[0],
        dep: s[1],
        dist: s[2]
      }))
    }));

    const tPeak = 30600; // 08:30
    const peakIndices = trips
      .map((raw: any, idx: number) => ({ raw, idx }))
      .filter(({ raw }: any) => tPeak >= raw[4] && tPeak <= raw[5]);

    console.log(`Courses actives RER à l'heure de pointe (08:30): ${peakIndices.length}`);
    assert(peakIndices.length >= 200, `Nombre insuffisant de rames en pointe: ${peakIndices.length}`);

    const simPeakJourneys: RtJourney[] = peakIndices.map(({ idx }, i) => {
      const trip = allSchedTrips[idx];
      const delay = Math.round((Math.sin(i * 1.5) * 60) + 60); // 0s à 120s de retard
      const calls: RtCall[] = trip.stops.map(s => ({
        stopId: s.stopId,
        aimed: s.dep,
        expected: s.dep + delay
      }));

      return {
        lineId: trip.lineId,
        dir: trip.dir,
        destination: trip.stops[trip.stops.length - 1].stopId,
        calls
      };
    });

    const peakSchedTrips = peakIndices.map(({ idx }) => allSchedTrips[idx]);
    const res = matchJourneys(simPeakJourneys, peakSchedTrips);

    const matchCount = res.matches.length;
    const peakRate = (matchCount / simPeakJourneys.length) * 100;
    console.log(`Rapprochement pointe (08:30): ${matchCount} / ${simPeakJourneys.length} (${peakRate.toFixed(1)} %)`);
    assert(peakRate >= 95.0, `Taux insuffisant: ${peakRate}% < 95%`);

    // Positionnement cinématique
    let validPositions = 0;
    for (const match of res.matches) {
      const profile = getKinematicProfile(match.trip.lineId);
      const timeline = buildTimeline(match.trip, match.journey.calls);
      const pos = positionAt(timeline, tPeak + 30, profile);
      if (pos !== null) {
        assert(pos.dist >= 0);
        assert(pos.speed >= 0 && pos.speed <= profile.vMax + 1.0);
        validPositions++;
      }
    }
    console.log(`Positions cinématiques valides: ${validPositions} / ${matchCount}`);
    assert(validPositions > 0);
  });

  it('should match journeys on 24h schedule with >= 95% rate for each line', () => {
    const schedulePath = path.resolve('web/public/data/rer_schedule.json');
    const scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
    const stations = scheduleData.stations;
    const trips = scheduleData.trips;

    const allSchedTrips: SchedTrip[] = trips.map((t: any) => ({
      tripId: t[0],
      lineId: t[1],
      dir: (t[2] === 0 ? 0 : 1) as 0 | 1,
      shapeId: t[3],
      stops: t[7].map((s: any) => ({
        stopId: normalizeStopName(stations[s[3]] || ''),
        arr: s[0],
        dep: s[1],
        dist: s[2]
      }))
    }));

    for (const lineId of RER_LINE_IDS) {
      const lineTrips = allSchedTrips.filter(t => t.lineId === lineId);
      const simJourneys: RtJourney[] = lineTrips.map((trip, i) => {
        const delay = (i % 5) * 20;
        return {
          lineId: trip.lineId,
          dir: trip.dir,
          destination: trip.stops[trip.stops.length - 1].stopId,
          calls: trip.stops.map(s => ({
            stopId: s.stopId,
            aimed: s.dep,
            expected: s.dep + delay
          }))
        };
      });

      const res = matchJourneys(simJourneys, lineTrips);
      const rate = (res.matches.length / simJourneys.length) * 100;
      console.log(`Ligne ${lineId}: ${res.matches.length} / ${simJourneys.length} appariées (${rate.toFixed(1)} %)`);
      assert(rate >= 95.0, `Ligne ${lineId}: taux ${rate}% < 95%`);
    }
  });
});
