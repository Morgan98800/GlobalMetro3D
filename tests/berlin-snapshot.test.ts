import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  computeBerlinSnapshot,
  SNAPSHOT_TIMESTAMP_ISO_BERLIN,
  SNAPSHOT_TIMESTAMP_ISO_BERLIN_NIGHT,
  type BerlinSnapshotFixture
} from './snapshot_generator';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/berlin-snapshot.json');

describe('Berlin U-Bahn U8 Simulation Snapshot Safety Net', () => {
  it('reproduces active U8 train kinematic positions to within 1 meter (14:00:00 CEST)', () => {
    // 1. If fixture does not exist, compute and save it as reference
    if (!fs.existsSync(FIXTURE_PATH)) {
      const freshSnapshot = computeBerlinSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_BERLIN);
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(freshSnapshot, null, 2), 'utf8');
      console.log(`[fixture] Created new reference snapshot at ${FIXTURE_PATH} (${freshSnapshot.trains.length} trains)`);
    }

    // 2. Load frozen reference fixture
    const expectedFixture: BerlinSnapshotFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    // 3. Replay computation from engine and data at fixed CEST timestamp
    const computedSnapshot = computeBerlinSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_BERLIN);

    // 4. Validate metadata and fleet counts
    expect(computedSnapshot.trains.length).toBeGreaterThan(0);
    expect(computedSnapshot.meta.totalTrains).toBe(computedSnapshot.trains.length);

    // 5. Compare U8 trains against frozen reference fixture (strict non-regression: zero displacement)
    const expectedU8Trains = expectedFixture.trains.filter(t => t.line === 'U8');
    const computedU8Trains = computedSnapshot.trains.filter(t => t.line === 'U8');
    expect(computedU8Trains).toHaveLength(expectedU8Trains.length);
    expect(computedSnapshot.meta.trainsByLine['U8']).toBe(expectedU8Trains.length);
    const expectedMap = new Map(expectedU8Trains.map(t => [t.tripId, t]));

    let maxDistDeltaM = 0;
    let maxSpeedDeltaMps = 0;

    for (const computed of computedU8Trains) {
      const expected = expectedMap.get(computed.tripId);
      expect(expected, `Train ${computed.tripId} must exist in reference snapshot`).toBeDefined();
      if (!expected) continue;

      expect(computed.line).toBe('U8');
      expect(computed.direction).toBe(expected.direction);

      // Verify Berlin area bounding box coordinates (13.25 to 13.50 lon, 52.40 to 52.65 lat)
      const [lon, lat] = computed.pos;
      expect(lon).toBeGreaterThanOrEqual(13.25);
      expect(lon).toBeLessThanOrEqual(13.50);
      expect(lat).toBeGreaterThanOrEqual(52.40);
      expect(lat).toBeLessThanOrEqual(52.65);

      // Speeds must be non-negative and <= max speed (70 km/h = 19.4 m/s + margin)
      expect(computed.speedMps).toBeGreaterThanOrEqual(0);
      expect(computed.speedMps).toBeLessThanOrEqual(21.0);

      const distDeltaM = Math.abs(computed.currentDistM - expected.currentDistM);
      const speedDeltaMps = Math.abs(computed.speedMps - expected.speedMps);

      if (distDeltaM > maxDistDeltaM) maxDistDeltaM = distDeltaM;
      if (speedDeltaMps > maxSpeedDeltaMps) maxSpeedDeltaMps = speedDeltaMps;

      // Acceptance criterion: strictly reproduction within 1 meter
      expect(distDeltaM, `Position of train ${computed.tripId} deviated by ${distDeltaM}m (> 1m limit)`).toBeLessThanOrEqual(1.0);
      expect(speedDeltaMps, `Speed of train ${computed.tripId} deviated by ${speedDeltaMps} m/s`).toBeLessThanOrEqual(0.1);
    }

    console.log(`[berlin-test] U8 daytime snapshot passed: ${computedSnapshot.trains.length} trains, maxDistDelta: ${maxDistDeltaM.toFixed(2)}m, maxSpeedDelta: ${maxSpeedDeltaMps.toFixed(2)}m/s`);
  });

  it('covers weekend 24h night service with active trains at 03:00:00 CEST Saturday', () => {
    const nightSnapshot = computeBerlinSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_BERLIN_NIGHT);
    
    // U-Bahn runs throughout the weekend night with 15-minute headway
    expect(nightSnapshot.trains.length).toBeGreaterThanOrEqual(2);
    expect(nightSnapshot.meta.trainsByLine['U8']).toBeGreaterThanOrEqual(2);

    for (const train of nightSnapshot.trains.filter(t => t.line === 'U8')) {
      expect(train.line).toBe('U8');
      const [lon, lat] = train.pos;
      expect(lon).toBeGreaterThanOrEqual(13.25);
      expect(lon).toBeLessThanOrEqual(13.50);
      expect(lat).toBeGreaterThanOrEqual(52.40);
      expect(lat).toBeLessThanOrEqual(52.65);
      expect(train.speedMps).toBeGreaterThanOrEqual(0);
      expect(train.speedMps).toBeLessThanOrEqual(21.0);
    }

    console.log(`[berlin-test] U8 weekend night snapshot passed: ${nightSnapshot.trains.length} trains active at 03:00 CEST Saturday`);
  });
});
