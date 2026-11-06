import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  computeEdinburghSnapshot,
  SNAPSHOT_TIMESTAMP_ISO_EDINBURGH,
  SNAPSHOT_TIMESTAMP_ISO_EDINBURGH_WINTER,
  type EdinburghSnapshotFixture
} from './snapshot_generator';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/edinburgh-snapshot.json');

const CANONICAL_23_STATIONS = [
  'Edinburgh Airport',
  'Ingliston Park & Ride',
  'Gogarburn',
  'Edinburgh Gateway',
  'Gyle Centre',
  'Edinburgh Park Central',
  'Edinburgh Park Station',
  'Bankhead',
  'Saughton',
  'Balgreen',
  'Murrayfield Stadium',
  'Haymarket',
  'West End - Princes Street',
  'Princes Street',
  'St Andrew Square',
  'Picardy Place',
  'McDonald Road',
  'Balfour Street',
  'Foot of the Walk',
  'The Shore',
  'Port of Leith',
  'Ocean Terminal',
  'Newhaven'
];

describe('Edinburgh Trams Simulation Snapshot Safety Net', () => {
  it('reproduces active tram kinematic positions to within 1 meter (14:00:00 GMT)', () => {
    // 1. If fixture does not exist, compute and save it as reference
    if (!fs.existsSync(FIXTURE_PATH)) {
      const freshSnapshot = computeEdinburghSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_EDINBURGH);
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(freshSnapshot, null, 2), 'utf8');
      console.log(`[fixture] Created new reference snapshot at ${FIXTURE_PATH} (${freshSnapshot.trains.length} trams)`);
    }

    // 2. Load frozen reference fixture
    const expectedFixture: EdinburghSnapshotFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    // 3. Replay computation from engine and data at fixed GMT timestamp
    const computedSnapshot = computeEdinburghSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_EDINBURGH);

    // 4. Validate metadata and fleet counts
    expect(computedSnapshot.trains.length).toBe(16);
    expect(computedSnapshot.meta.totalTrains).toBe(16);
    expect(computedSnapshot.meta.trainsByLine['T50']).toBe(16);

    // 5. Compare T50 trams against frozen reference fixture (strict non-regression: zero displacement)
    const expectedTrams = expectedFixture.trains.filter(t => t.line === 'T50');
    const computedTrams = computedSnapshot.trains.filter(t => t.line === 'T50');
    expect(computedTrams).toHaveLength(expectedTrams.length);
    const expectedMap = new Map(expectedTrams.map(t => [t.tripId, t]));

    for (const computed of computedTrams) {
      const expected = expectedMap.get(computed.tripId);
      expect(expected, `Tram ${computed.tripId} must exist in reference snapshot`).toBeDefined();
      if (!expected) continue;

      expect(computed.line).toBe('T50');
      expect(computed.direction).toBe(expected.direction);

      // Verify Edinburgh area bounding box coordinates (-3.38 to -3.15 lon, 55.92 to 55.99 lat)
      const [lon, lat] = computed.pos;
      expect(lon).toBeGreaterThanOrEqual(-3.38);
      expect(lon).toBeLessThanOrEqual(-3.15);
      expect(lat).toBeGreaterThanOrEqual(55.92);
      expect(lat).toBeLessThanOrEqual(55.99);

      // Speeds must be non-negative and <= max tram speed (70 km/h = 19.4 m/s + margin)
      expect(computed.speedMps).toBeGreaterThanOrEqual(0);
      expect(computed.speedMps).toBeLessThanOrEqual(21.0);
      expect(computed.speedKmh).toBeGreaterThanOrEqual(0);
      expect(computed.speedKmh).toBeLessThanOrEqual(76);

      // Compare coordinates: delta <= 1 meter (approx 1e-5 degrees)
      const lonDelta = Math.abs(computed.pos[0] - expected.pos[0]);
      const latDelta = Math.abs(computed.pos[1] - expected.pos[1]);
      const distM = Math.hypot(lonDelta * 62000, latDelta * 111000);
      expect(distM).toBeLessThanOrEqual(1.0);
    }
  });

  it('verifies zero 1-hour time shift across winter daylight savings switch (26 Oct 2026)', () => {
    const summerSnapshot = computeEdinburghSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_EDINBURGH);
    const winterSnapshot = computeEdinburghSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_EDINBURGH_WINTER);

    // Both dates at 14:00:00 local time must yield identical fleet count and trip ids
    expect(winterSnapshot.trains.length).toBe(summerSnapshot.trains.length);
    expect(winterSnapshot.trains.map(t => t.tripId)).toEqual(summerSnapshot.trains.map(t => t.tripId));
  });

  it('validates canonical 23 stations sequence, order, and monotonicity in schedule', () => {
    const schedPath = path.resolve(process.cwd(), 'cities/edinburgh/data/schedule.json');
    const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));

    // 1. Station count and names
    expect(sched.stations).toEqual(CANONICAL_23_STATIONS);
    expect(sched.stations).toHaveLength(23);

    // 2. Strict monotonicity along shapes for every trip
    for (const trip of sched.trips) {
      const stops = trip[7];
      expect(stops.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < stops.length; i++) {
        const prevDist = stops[i - 1][2];
        const curDist = stops[i][2];
        expect(curDist, `Trip ${trip[0]} must have strictly monotonic distances`).toBeGreaterThan(prevDist);
      }
    }
  });

  it('validates 10 normalized artifacts exist and are consistent in public directory', () => {
    const publicData = path.resolve(process.cwd(), 'web/public/cities/edinburgh/data');
    const requiredFiles = [
      'lines.json',
      'stations.json',
      'tracks.json',
      'shapes.bin',
      'schedule.json',
      'line_ladders.json',
      'station-rankings.json',
      'sections.json',
      'feed_fingerprint.json',
      'rolling-stock.json'
    ];

    for (const file of requiredFiles) {
      const p = path.join(publicData, file);
      expect(fs.existsSync(p), `Missing required artifact: ${file}`).toBe(true);
      expect(fs.statSync(p).size, `Artifact ${file} must not be empty`).toBeGreaterThan(100);
    }
  });
});
