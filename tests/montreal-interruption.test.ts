import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeShapes } from '../core/sim/shapes_loader';
import { TripData, computeTripKinematics } from '../core/sim/kinematics';
import { selectActiveTrips } from '../core/sim/paris_time';
import { normalizeStopName } from '../core/rt/stop_names';
import type { LineTrafficReport } from '../core/types';

const MONTREAL_DIR = path.resolve(process.cwd(), 'cities/montreal/data');

describe('Montreal Realtime Interruption & Train Suppression Tests (Phase 5)', () => {
  const shapesBuf = fs.readFileSync(path.join(MONTREAL_DIR, 'shapes.bin'));
  const shapesMap = decodeShapes(shapesBuf.buffer.slice(shapesBuf.byteOffset, shapesBuf.byteOffset + shapesBuf.byteLength));
  const sched = JSON.parse(fs.readFileSync(path.join(MONTREAL_DIR, 'schedule.json'), 'utf8'));
  const lines = JSON.parse(fs.readFileSync(path.join(MONTREAL_DIR, 'lines.json'), 'utf8'));
  const stationNames: string[] = sched.stations;

  const trips: TripData[] = sched.trips.map((t: any): TripData => ({
    id: t[0],
    line: t[1],
    dir: (t[2] === 0 ? 0 : 1) as 0 | 1,
    shapeId: t[3],
    t0: t[4],
    t1: t[5],
    destName: stationNames[t[6]] || 'Terminus',
    stops: t[7].map((s: any) => [
      s[0],
      s[1],
      s[2],
      stationNames[s[3]] || 'Station'
    ])
  }));

  const fixedDate = new Date('2026-09-15T08:30:00-04:00'); // Tuesday 08:30 EDT (Peak)

  function runSimulationWithTraffic(trafficByLine: Record<string, LineTrafficReport>) {
    const activeTrips = selectActiveTrips(trips, fixedDate, undefined, 0, 'America/Montreal');
    const trains: any[] = [];
    const trainsByLine: Record<string, number> = { '1': 0, '2': 0, '4': 0, '5': 0 };

    for (const { trip, serviceSeconds } of activeTrips) {
      // Info Trafic check (strictly matching engine logic)
      const lineTraffic = trafficByLine[trip.line];
      if (lineTraffic && lineTraffic.status === 'interrupted') {
        if (lineTraffic.closedStations && lineTraffic.closedStations.length > 0) {
          const isInsideClosedSection = trip.stops.some(s =>
            lineTraffic.closedStations!.some(cs => normalizeStopName(s[3]).includes(normalizeStopName(cs)))
          );
          if (isInsideClosedSection) continue;
        } else {
          // Line-level interruption without specific stations: suppress all trains on this line!
          continue;
        }
      }

      const shape = shapesMap.get(trip.shapeId);
      if (!shape) continue;

      const train = computeTripKinematics(
        trip,
        shape,
        serviceSeconds,
        0,
        '#000',
        '#fff',
        trip.line,
        0
      );

      if (train) {
        trainsByLine[train.line] = (trainsByLine[train.line] || 0) + 1;
        trains.push(train);
      }
    }

    return { trains, trainsByLine };
  }

  it('runs nominal simulation with exactly 72 active trains when traffic is normal', () => {
    const { trains, trainsByLine } = runSimulationWithTraffic({});
    expect(trains.length).toBe(72);
    expect(trainsByLine['1']).toBe(27);
    expect(trainsByLine['2']).toBe(32);
    expect(trainsByLine['4']).toBe(4);
    expect(trainsByLine['5']).toBe(9);
  });

  it('suppresses ALL trains on Line 1 when Line 1 is fully interrupted', () => {
    const traffic: Record<string, LineTrafficReport> = {
      '1': {
        lineId: '1',
        status: 'interrupted',
        severity: 'alert',
        title: 'Ligne 1 - Verte (Interruption de service)',
        message: 'Interruption complète du service sur la ligne verte.',
        updatedAt: new Date().toISOString()
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);

    // Strictly 0 trains on Line 1!
    expect(trainsByLine['1']).toBe(0);
    // Other lines completely unaffected
    expect(trainsByLine['2']).toBe(32);
    expect(trainsByLine['4']).toBe(4);
    expect(trainsByLine['5']).toBe(9);
    // Total trains is 72 - 27 = 45
    expect(trains.length).toBe(45);
  });

  it('suppresses only trips inside a closed section for partial interruption', () => {
    // Interruption partial on Line 4 Jaune (between Berri-UQAM and Jean-Drapeau)
    const traffic: Record<string, LineTrafficReport> = {
      '4': {
        lineId: '4',
        status: 'interrupted',
        severity: 'alert',
        title: 'Ligne 4 - Jaune (Interruption partielle)',
        message: 'Interruption entre Berri-UQAM et Jean-Drapeau.',
        updatedAt: new Date().toISOString(),
        closedStations: ['Berri-UQAM', 'Jean-Drapeau']
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);

    // All trips on Line 4 cross Berri-UQAM and Jean-Drapeau, so Line 4 has 0 trains
    expect(trainsByLine['4']).toBe(0);
    // Line 1, 2, 5 remain intact
    expect(trainsByLine['1']).toBe(27);
    expect(trainsByLine['2']).toBe(32);
    expect(trainsByLine['5']).toBe(9);
    expect(trains.length).toBe(68);
  });

  it('preserves nominal trains when a line has a slowdown (disrupted) without interruption', () => {
    const traffic: Record<string, LineTrafficReport> = {
      '2': {
        lineId: '2',
        status: 'disrupted',
        severity: 'warning',
        title: 'Ligne 2 - Orange (Ralentissement)',
        message: 'Ralentissement de service sur la ligne orange.',
        updatedAt: new Date().toISOString()
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);

    // Under slowdown, trains continue to circulate (no phantom trains suppressed, only alerts displayed)
    expect(trains.length).toBe(72);
    expect(trainsByLine['2']).toBe(32);
  });
});
