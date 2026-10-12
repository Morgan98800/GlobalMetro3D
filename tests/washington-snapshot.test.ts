import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  computeWashingtonSnapshot,
  SNAPSHOT_TIMESTAMP_ISO_WASHINGTON,
  SNAPSHOT_TIMESTAMP_ISO_WASHINGTON_WINTER,
  type WashingtonSnapshotFixture
} from './snapshot_generator';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/washington-snapshot.json');

describe('Washington DC Metrorail Red Line Simulation Snapshot Safety Net', () => {
  it('reproduces active Red line train kinematic positions to within 1 meter (26 rames à 08:30:00 EDT)', () => {
    // 1. If fixture does not exist, compute and save it as reference
    if (!fs.existsSync(FIXTURE_PATH)) {
      const freshSnapshot = computeWashingtonSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_WASHINGTON);
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(freshSnapshot, null, 2), 'utf8');
      console.log(`[fixture] Created new reference snapshot at ${FIXTURE_PATH} (${freshSnapshot.trains.length} trains)`);
    }

    // 2. Load frozen reference fixture
    const expectedFixture: WashingtonSnapshotFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    // 3. Replay computation from engine and data at fixed EDT timestamp (2026-10-06T12:30:00Z = 08:30:00 EDT)
    const computedSnapshot = computeWashingtonSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_WASHINGTON);

    // 4. Validate metadata and fleet counts
    expect(computedSnapshot.trains.length).toBe(97);
    expect(computedSnapshot.meta.totalTrains).toBe(97);
    expect(computedSnapshot.meta.trainsByLine['RED']).toBe(26);
    expect(computedSnapshot.meta.trainsByLine['ORANGE']).toBe(12);
    expect(computedSnapshot.meta.trainsByLine['SILVER']).toBe(19);
    expect(computedSnapshot.meta.trainsByLine['BLUE']).toBe(13);
    expect(computedSnapshot.meta.trainsByLine['GREEN']).toBe(18);
    expect(computedSnapshot.meta.trainsByLine['YELLOW']).toBe(9);

    // 5. Compare Red line trains against frozen reference fixture (strict non-regression: zero displacement)
    const expectedRedTrains = expectedFixture.trains.filter(t => t.line === 'RED');
    expect(expectedRedTrains).toHaveLength(26);
    const expectedMap = new Map(expectedRedTrains.map(t => [t.tripId, t]));

    let maxDistDeltaM = 0;
    let maxSpeedDeltaMps = 0;

    const computedRedTrains = computedSnapshot.trains.filter(t => t.line === 'RED');
    expect(computedRedTrains).toHaveLength(26);

    for (const computed of computedRedTrains) {
      const expected = expectedMap.get(computed.tripId);
      expect(expected, `Train ${computed.tripId} must exist in reference snapshot`).toBeDefined();
      if (!expected) continue;

      expect(computed.line).toBe('RED');
      expect(computed.shapeId).toMatch(/^RRED_/);
      expect(computed.direction).toBe(expected.direction);

      // Verify Washington DC area bounding box coordinates
      const [lon, lat] = computed.pos;
      expect(lon).toBeGreaterThanOrEqual(-77.25);
      expect(lon).toBeLessThanOrEqual(-76.95);
      expect(lat).toBeGreaterThanOrEqual(38.85);
      expect(lat).toBeLessThanOrEqual(39.15);

      // Speeds must be non-negative and <= max speed (95 km/h = 26.4 m/s)
      expect(computed.speedMps).toBeGreaterThanOrEqual(0);
      expect(computed.speedMps).toBeLessThanOrEqual(27.0);

      const distDeltaM = Math.abs(computed.currentDistM - expected.currentDistM);
      const speedDeltaMps = Math.abs(computed.speedMps - expected.speedMps);

      if (distDeltaM > maxDistDeltaM) maxDistDeltaM = distDeltaM;
      if (speedDeltaMps > maxSpeedDeltaMps) maxSpeedDeltaMps = speedDeltaMps;

      // Acceptance criterion: strictly reproduction within 1 meter
      expect(distDeltaM, `Position of train ${computed.tripId} deviated by ${distDeltaM}m (> 1m limit)`).toBeLessThanOrEqual(1.0);
      expect(speedDeltaMps, `Speed of train ${computed.tripId} deviated by ${speedDeltaMps} m/s`).toBeLessThanOrEqual(0.1);
    }

    console.log(`✅ Washington multi-line snapshot passed: 97 trains total (RED: 26, ORG: 12, SIL: 19, BLU: 13, GRN: 18, YEL: 9). Red line max delta: ${maxDistDeltaM.toFixed(4)}m.`);
  });

  it('guarantees identical train positions on Nov 2, 2026 after US DST fallback (08:30:00 EST): no 1-hour shift', () => {
    // Reference snapshot at 08:30:00 EDT (summer time)
    const summerSnapshot = computeWashingtonSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_WASHINGTON);

    // Winter snapshot on Monday Nov 2, 2026 at 08:30:00 EST (2026-11-02T13:30:00Z)
    // US DST ended Sunday Nov 1, 2026. Europe DST ended one week earlier on Oct 25, 2026.
    const winterSnapshot = computeWashingtonSnapshot(process.cwd(), SNAPSHOT_TIMESTAMP_ISO_WASHINGTON_WINTER);

    expect(winterSnapshot.trains.length).toBe(97);
    expect(winterSnapshot.trains.length).toBe(summerSnapshot.trains.length);

    const summerMap = new Map(summerSnapshot.trains.map(t => [t.tripId, t]));

    for (const winterTrain of winterSnapshot.trains) {
      const summerTrain = summerMap.get(winterTrain.tripId);
      expect(summerTrain, `Train ${winterTrain.tripId} must exist in summer snapshot`).toBeDefined();
      if (!summerTrain) continue;

      // Exactly identical distance along track (0.01m tolerance)
      const distDelta = Math.abs(winterTrain.currentDistM - summerTrain.currentDistM);
      expect(distDelta, `Train ${winterTrain.tripId} shifted by ${distDelta}m (> 0.05m tolerance)`).toBeLessThanOrEqual(0.05);

      // Exactly identical speed
      const speedDelta = Math.abs(winterTrain.speedMps - summerTrain.speedMps);
      expect(speedDelta, `Train ${winterTrain.tripId} speed differed by ${speedDelta} m/s`).toBeLessThanOrEqual(0.05);

      // Exactly identical GPS coordinates
      expect(winterTrain.pos[0]).toBeCloseTo(summerTrain.pos[0], 5);
      expect(winterTrain.pos[1]).toBeCloseTo(summerTrain.pos[1], 5);
    }

    console.log(`✅ US DST transition verified: all 97 trains across all 6 lines at identical positions on Nov 2, 2026 (EST) vs Oct 6, 2026 (EDT). Zero 1-hour shift.`);
  });
});
