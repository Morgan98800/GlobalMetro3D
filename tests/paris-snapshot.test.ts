import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { computeParisSnapshot, ParisSnapshotFixture } from './snapshot_generator';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/paris-snapshot.json');

describe('Paris Simulation Snapshot Safety Net', () => {
  it('reproduces active train kinematic positions to within 1 meter (exact match)', () => {
    // 1. If fixture does not exist, compute and save it as reference
    if (!fs.existsSync(FIXTURE_PATH)) {
      const freshSnapshot = computeParisSnapshot();
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(freshSnapshot, null, 2), 'utf8');
      console.log(`[fixture] Created new reference snapshot at ${FIXTURE_PATH} (${freshSnapshot.trains.length} trains)`);
    }

    // 2. Load frozen reference fixture
    const expectedFixture: ParisSnapshotFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    // 3. Replay computation from engine and data
    const computedSnapshot = computeParisSnapshot();

    // 4. Validate metadata
    expect(computedSnapshot.trains.length).toBe(expectedFixture.trains.length);
    expect(computedSnapshot.meta.totalTrains).toBe(expectedFixture.meta.totalTrains);
    expect(computedSnapshot.meta.metroTrains).toBe(expectedFixture.meta.metroTrains);
    expect(computedSnapshot.meta.rerTrains).toBe(expectedFixture.meta.rerTrains);

    // 5. Compare train by train
    const expectedMap = new Map(expectedFixture.trains.map(t => [t.tripId, t]));

    let maxDistDeltaM = 0;
    let maxSpeedDeltaMps = 0;

    for (const computed of computedSnapshot.trains) {
      const expected = expectedMap.get(computed.tripId);
      expect(expected, `Train ${computed.tripId} must exist in reference snapshot`).toBeDefined();
      if (!expected) continue;

      expect(computed.line).toBe(expected.line);
      expect(computed.shapeId).toBe(expected.shapeId);
      expect(computed.direction).toBe(expected.direction);

      const distDeltaM = Math.abs(computed.currentDistM - expected.currentDistM);
      const speedDeltaMps = Math.abs(computed.speedMps - expected.speedMps);

      if (distDeltaM > maxDistDeltaM) maxDistDeltaM = distDeltaM;
      if (speedDeltaMps > maxSpeedDeltaMps) maxSpeedDeltaMps = speedDeltaMps;

      // Acceptance criterion: strictly reproduction within 1 meter (au mètre près)
      expect(distDeltaM, `Position of train ${computed.tripId} (${computed.lineName}) deviated by ${distDeltaM}m (> 1m limit)`).toBeLessThanOrEqual(1.0);
      expect(speedDeltaMps, `Speed of train ${computed.tripId} (${computed.lineName}) deviated by ${speedDeltaMps} m/s`).toBeLessThanOrEqual(0.1);
    }

    console.log(`✅ Snapshot verification passed: ${computedSnapshot.trains.length} trains matched. Max position delta: ${maxDistDeltaM.toFixed(4)}m, Max speed delta: ${maxSpeedDeltaMps.toFixed(4)} m/s.`);
  });
});
