import fs from 'node:fs';
import path from 'node:path';
import { decodeShapes } from '@core/sim/shapes_loader';
import { selectActiveTrips } from '@core/sim/paris_time';
import { computeTripKinematics, type TripData } from '@core/sim/kinematics';

export const SNAPSHOT_TIMESTAMP_ISO = '2026-06-09T06:30:00Z'; // Mardi 08:30:00 Paris (CEST)
export const SNAPSHOT_SECONDS = 30600;

export interface TrainSnapshotEntry {
  tripId: string;
  line: string;
  lineName: string;
  shapeId: string;
  direction: 0 | 1;
  currentDistM: number;
  speedKmh: number;
  speedMps: number;
  pos: [number, number];
  bearing: number;
  nextStation: string;
  destStation: string;
}

export interface ParisSnapshotFixture {
  meta: {
    description: string;
    timestampIso: string;
    serviceDate: string;
    civilSeconds: number;
    totalTrains: number;
    metroTrains: number;
    rerTrains: number;
  };
  trains: TrainSnapshotEntry[];
}

export function computeParisSnapshot(baseDir: string = process.cwd()): ParisSnapshotFixture {
  // 1. Load lines
  const linesJsonPath = path.resolve(baseDir, 'web/public/data/lines.json');
  const lines: any[] = JSON.parse(fs.readFileSync(linesJsonPath, 'utf8'));
  const linesMap = new Map(lines.map(l => [l.id, l]));

  // 2. Load shapes (Metro + RER)
  const shapesMetroBuf = fs.readFileSync(path.resolve(baseDir, 'web/public/data/shapes.bin'));
  const shapesRerBuf = fs.readFileSync(path.resolve(baseDir, 'web/public/data/rer_shapes.bin'));
  
  const shapesMap = decodeShapes(shapesMetroBuf.buffer.slice(shapesMetroBuf.byteOffset, shapesMetroBuf.byteOffset + shapesMetroBuf.byteLength));
  const shapesRerMap = decodeShapes(shapesRerBuf.buffer.slice(shapesRerBuf.byteOffset, shapesRerBuf.byteOffset + shapesRerBuf.byteLength));
  for (const [id, s] of shapesRerMap.entries()) {
    shapesMap.set(id, s);
  }

  // 3. Load schedules (Metro + RER)
  const schedMetro = JSON.parse(fs.readFileSync(path.resolve(baseDir, 'web/public/data/schedule.json'), 'utf8'));
  const schedRer = JSON.parse(fs.readFileSync(path.resolve(baseDir, 'web/public/data/rer_schedule.json'), 'utf8'));

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

  const fixedDate = new Date(SNAPSHOT_TIMESTAMP_ISO);
  const activeTrips = selectActiveTrips(trips, fixedDate);

  const trains: TrainSnapshotEntry[] = [];
  let metroCount = 0;
  let rerCount = 0;

  for (const { trip, serviceSeconds } of activeTrips) {
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
      0, // delaySeconds = 0 (théorique de référence)
      lineColor,
      lineTextColor,
      lineShortName,
      elevationOffset
    );

    if (train) {
      if (train.line.includes('C017') || ['A', 'B', 'C', 'D', 'E'].includes(train.lineName)) {
        rerCount++;
      } else {
        metroCount++;
      }

      trains.push({
        tripId: train.id,
        line: train.line,
        lineName: train.lineName,
        shapeId: train.shapeId,
        direction: train.direction,
        currentDistM: Math.round(train.currentDistM * 100) / 100,
        speedKmh: train.spd,
        speedMps: Math.round(train.speedMps * 100) / 100,
        pos: [Math.round(train.pos[0] * 1e7) / 1e7, Math.round(train.pos[1] * 1e7) / 1e7],
        bearing: Math.round(train.brg * 10) / 10,
        nextStation: train.next,
        destStation: train.dest
      });
    }
  }

  // Tri déterministe absolu par tripId
  trains.sort((a, b) => a.tripId.localeCompare(b.tripId));

  return {
    meta: {
      description: 'Paris Subway 3D Reference Kinematic Simulation Snapshot',
      timestampIso: SNAPSHOT_TIMESTAMP_ISO,
      serviceDate: '2026-06-09',
      civilSeconds: SNAPSHOT_SECONDS,
      totalTrains: trains.length,
      metroTrains: metroCount,
      rerTrains: rerCount
    },
    trains
  };
}
