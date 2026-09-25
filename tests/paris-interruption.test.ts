import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeShapes } from '../core/sim/shapes_loader';
import { TripData, computeTripKinematics } from '../core/sim/kinematics';
import { selectActiveTrips } from '../core/sim/paris_time';
import { normalizeStopName } from '../core/rt/stop_names';
import type { LineTrafficReport } from '../core/types';

const DATA_DIR = path.resolve(process.cwd(), 'web/public/data');

describe('Paris Realtime Interruption & Train Suppression Tests (Phase 6)', () => {
  // 1. Load lines
  const linesJsonPath = path.resolve(DATA_DIR, 'lines.json');
  const lines: any[] = JSON.parse(fs.readFileSync(linesJsonPath, 'utf8'));
  const linesMap = new Map(lines.map(l => [l.id, l]));

  // 2. Load shapes (Metro + RER)
  const shapesMetroBuf = fs.readFileSync(path.resolve(DATA_DIR, 'shapes.bin'));
  const shapesRerBuf = fs.readFileSync(path.resolve(DATA_DIR, 'rer_shapes.bin'));
  
  const shapesMap = decodeShapes(shapesMetroBuf.buffer.slice(shapesMetroBuf.byteOffset, shapesMetroBuf.byteOffset + shapesMetroBuf.byteLength));
  const shapesRerMap = decodeShapes(shapesRerBuf.buffer.slice(shapesRerBuf.byteOffset, shapesRerBuf.byteOffset + shapesRerBuf.byteLength));
  for (const [id, s] of shapesRerMap.entries()) {
    shapesMap.set(id, s);
  }

  // 3. Load schedules (Metro + RER)
  const schedMetro = JSON.parse(fs.readFileSync(path.resolve(DATA_DIR, 'schedule.json'), 'utf8'));
  const schedRer = JSON.parse(fs.readFileSync(path.resolve(DATA_DIR, 'rer_schedule.json'), 'utf8'));

  const stationNames: string[] = [];
  schedMetro.stations.forEach((name: string, i: number) => { stationNames[i] = name; });
  schedRer.stations.forEach((name: string, i: number) => { stationNames[i] = name; });

  const rawTrips: Array<{ trip: any; isRer: boolean }> = [
    ...schedMetro.trips.map((t: any) => ({ trip: t, isRer: false })),
    ...schedRer.trips.map((t: any) => ({ trip: t, isRer: true }))
  ];

  const trips: TripData[] = rawTrips.map(({ trip: t }) => {
    const destName = stationNames[t[6]] || 'Terminus';
    const stops: Array<[number, number, number, string]> = t[7].map((s: any) => [
      s[0],
      s[1],
      s[2],
      stationNames[s[3]] || 'Station'
    ]);
    return {
      id: t[0],
      line: t[1],
      dir: (t[2] === 0 ? 0 : 1) as 0 | 1,
      shapeId: t[3],
      t0: t[4],
      t1: t[5],
      destName,
      stops
    };
  });

  const fixedDate = new Date('2026-06-09T06:30:00Z'); // Tuesday 08:30 CEST

  function runSimulationWithTraffic(trafficByLine: Record<string, LineTrafficReport>) {
    const activeTrips = selectActiveTrips(trips, fixedDate);
    const trains: any[] = [];
    const trainsByLine: Record<string, number> = {};

    for (const { trip, serviceSeconds } of activeTrips) {
      // Info Trafic check (strictly identical to browser_engine.ts)
      const lineTraffic = trafficByLine[trip.line];
      if (lineTraffic && lineTraffic.status === 'interrupted') {
        if (lineTraffic.closedStations && lineTraffic.closedStations.length > 0) {
          const isInsideClosedSection = trip.stops.some(s => {
            const normStop = normalizeStopName(s[3]);
            return lineTraffic.closedStations!.some(cs => {
              const normCs = normalizeStopName(cs);
              return (
                (normStop.length >= 3 && normCs.length >= 3) &&
                (normStop.includes(normCs) || normCs.includes(normStop))
              );
            });
          });
          if (isInsideClosedSection) continue;
        } else {
          // Line-level interruption without specific stations: suppress all trains on this line!
          continue;
        }
      }

      const shape = shapesMap.get(trip.shapeId);
      if (!shape) continue;

      const lineMeta = linesMap.get(trip.line);
      const lineColor = lineMeta?.color || '#ffffff';
      const lineTextColor = lineMeta?.text_color || '#000000';
      const lineShortName = lineMeta?.short_name || trip.line;
      const elevationOffset = lineMeta?.elevation_offset || 0;

      const train = computeTripKinematics(
        trip,
        shape,
        serviceSeconds,
        0,
        lineColor,
        lineTextColor,
        lineShortName,
        elevationOffset
      );

      if (train) {
        trainsByLine[trip.line] = (trainsByLine[trip.line] || 0) + 1;
        trains.push(train);
      }
    }

    return { trains, trainsByLine };
  }

  it('runs nominal simulation with exactly 764 active trains when traffic is normal', () => {
    const { trains, trainsByLine } = runSimulationWithTraffic({});
    expect(trains.length).toBe(764);
    expect(trainsByLine['IDFM:C01371']).toBe(42); // L1
    expect(trainsByLine['IDFM:C01742']).toBe(58); // RER A
    expect(trainsByLine['IDFM:C01384']).toBe(48); // L14
  });

  it('suppresses ALL 42 trains on Line 1 when Line 1 is fully interrupted', () => {
    const traffic: Record<string, LineTrafficReport> = {
      'IDFM:C01371': {
        lineId: 'IDFM:C01371',
        lineName: '1',
        status: 'interrupted',
        severity: 'alert',
        title: 'Ligne 1 (Interruption de service)',
        message: 'Trafic interrompu sur l\'ensemble de la ligne 1.',
        updatedAt: new Date().toISOString()
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);
    expect(trains.length).toBe(764 - 42); // 722
    expect(trainsByLine['IDFM:C01371'] || 0).toBe(0);
    // Unrelated lines remain strictly intact
    expect(trainsByLine['IDFM:C01742']).toBe(58); // RER A
    expect(trainsByLine['IDFM:C01384']).toBe(48); // L14
  });

  it('suppresses ALL 58 trains on RER A when RER A is fully interrupted', () => {
    const traffic: Record<string, LineTrafficReport> = {
      'IDFM:C01742': {
        lineId: 'IDFM:C01742',
        lineName: 'A',
        status: 'interrupted',
        severity: 'alert',
        title: 'RER A (Interruption de service)',
        message: 'Trafic interrompu sur l\'ensemble de la ligne RER A suite à incident caténaire.',
        updatedAt: new Date().toISOString()
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);
    expect(trains.length).toBe(764 - 58); // 706
    expect(trainsByLine['IDFM:C01742'] || 0).toBe(0);
    expect(trainsByLine['IDFM:C01371']).toBe(42); // L1 intact
  });

  it('suppresses only branch trains on RER A during partial branch interruption (Poissy closure)', () => {
    const traffic: Record<string, LineTrafficReport> = {
      'IDFM:C01742': {
        lineId: 'IDFM:C01742',
        lineName: 'A',
        status: 'interrupted',
        severity: 'alert',
        title: 'RER A (Interruption partielle)',
        message: 'Trafic interrompu vers Poissy.',
        updatedAt: new Date().toISOString(),
        closedStations: ['Poissy']
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);
    // Exactly 10 Poissy branch trains suppressed (both directions), 48 continue on other branches
    expect(trainsByLine['IDFM:C01742']).toBe(48);
    expect(trains.length).toBe(764 - 10);
    // Line 1 and Line 14 completely unaffected
    expect(trainsByLine['IDFM:C01371']).toBe(42);
    expect(trainsByLine['IDFM:C01384']).toBe(48);
  });

  it('suppresses all through trips on Line 1 when central station Châtelet is closed', () => {
    const traffic: Record<string, LineTrafficReport> = {
      'IDFM:C01371': {
        lineId: 'IDFM:C01371',
        lineName: '1',
        status: 'interrupted',
        severity: 'alert',
        title: 'Ligne 1 (Interruption partielle)',
        message: 'Trafic interrompu entre Châtelet et Nation.',
        updatedAt: new Date().toISOString(),
        closedStations: ['Châtelet', 'Nation']
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);
    // All 42 through trains serving Châtelet/Nation are suppressed
    expect(trainsByLine['IDFM:C01371'] || 0).toBe(0);
    expect(trains.length).toBe(764 - 42);
    // RER A and L14 completely unaffected
    expect(trainsByLine['IDFM:C01742']).toBe(58);
    expect(trainsByLine['IDFM:C01384']).toBe(48);
  });

  it('does NOT suppress trains when status is only disrupted / travaux (maintains 764 trains)', () => {
    const traffic: Record<string, LineTrafficReport> = {
      'IDFM:C01384': {
        lineId: 'IDFM:C01384',
        lineName: '14',
        status: 'disrupted',
        severity: 'warning',
        title: 'Ligne 14 (Trafic perturbé)',
        message: 'Trafic ralenti en raison de forte affluence.',
        updatedAt: new Date().toISOString()
      }
    };

    const { trains, trainsByLine } = runSimulationWithTraffic(traffic);
    expect(trains.length).toBe(764);
    expect(trainsByLine['IDFM:C01384']).toBe(48);
  });
});
