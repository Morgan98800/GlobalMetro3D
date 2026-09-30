import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { computeLilleSnapshot, type LilleSnapshotFixture } from './snapshot_generator';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/lille-snapshot.json');

describe('Lille Métro & Tramway Simulation Snapshot Safety Net', () => {
  it('reproduces active Métro & Tramway train kinematic positions to within 1 meter (117 rames: 32 ME1, 68 ME2, 8 Tram R, 9 Tram T)', () => {
    // 1. If fixture does not exist, compute and save it as reference
    if (!fs.existsSync(FIXTURE_PATH)) {
      const freshSnapshot = computeLilleSnapshot();
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(freshSnapshot, null, 2), 'utf8');
      console.log(`[fixture] Created new reference snapshot at ${FIXTURE_PATH} (${freshSnapshot.trains.length} trains)`);
    }

    // 2. Load frozen reference fixture
    const expectedFixture: LilleSnapshotFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    // 3. Replay computation from engine and data
    const computedSnapshot = computeLilleSnapshot();

    // 4. Validate metadata and fleet counts
    expect(computedSnapshot.trains.length).toBe(117);
    expect(computedSnapshot.trains.length).toBe(expectedFixture.trains.length);
    expect(computedSnapshot.meta.totalTrains).toBe(117);
    expect(computedSnapshot.meta.trainsByLine['ME1']).toBe(32);
    expect(computedSnapshot.meta.trainsByLine['ME2']).toBe(68);
    expect(computedSnapshot.meta.trainsByLine['TRAM_R']).toBe(8);
    expect(computedSnapshot.meta.trainsByLine['TRAM_T']).toBe(9);

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

      // Verify Métropole Européenne de Lille bounding box coordinates
      const [lon, lat] = computed.pos;
      expect(lon).toBeGreaterThanOrEqual(2.95);
      expect(lon).toBeLessThanOrEqual(3.25);
      expect(lat).toBeGreaterThanOrEqual(50.55);
      expect(lat).toBeLessThanOrEqual(50.78);

      // Speeds must be non-negative and <= max speeds
      expect(computed.speedMps).toBeGreaterThanOrEqual(0);
      expect(computed.speedMps).toBeLessThanOrEqual(25); // VAL max ~22.2 m/s (80 km/h), Tram max ~19.4 m/s (70 km/h)

      const distDeltaM = Math.abs(computed.currentDistM - expected.currentDistM);
      const speedDeltaMps = Math.abs(computed.speedMps - expected.speedMps);

      if (distDeltaM > maxDistDeltaM) maxDistDeltaM = distDeltaM;
      if (speedDeltaMps > maxSpeedDeltaMps) maxSpeedDeltaMps = speedDeltaMps;

      // Acceptance criterion: strictly reproduction within 1 meter
      expect(distDeltaM, `Position of train ${computed.tripId} (${computed.lineName}) deviated by ${distDeltaM}m (> 1m limit)`).toBeLessThanOrEqual(1.0);
      expect(speedDeltaMps, `Speed of train ${computed.tripId} (${computed.lineName}) deviated by ${speedDeltaMps} m/s`).toBeLessThanOrEqual(0.1);
    }

    // 6. Distinct verification of Metro vs Tram fleets
    const metroTrains = computedSnapshot.trains.filter(t => t.line === 'ME1' || t.line === 'ME2');
    const tramTrains = computedSnapshot.trains.filter(t => t.line === 'TRAM_R' || t.line === 'TRAM_T');
    expect(metroTrains.length).toBe(100);
    expect(tramTrains.length).toBe(17);

    console.log(`✅ Lille snapshot passed: ${computedSnapshot.trains.length} trains matched (ME1: 32, ME2: 68, Tram R: 8, Tram T: 9). Max pos delta: ${maxDistDeltaM.toFixed(4)}m, Max speed delta: ${maxSpeedDeltaMps.toFixed(4)} m/s.`);
  });
});
