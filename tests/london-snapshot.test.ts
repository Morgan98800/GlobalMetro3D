import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { computeLondonSnapshot, LondonSnapshotFixture } from './snapshot_generator';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/london-snapshot.json');

describe('London Underground Simulation Snapshot Safety Net', () => {
  it('reproduces active Tube train kinematic positions to within 1 meter', () => {
    // 1. If fixture does not exist, compute and save it as reference
    if (!fs.existsSync(FIXTURE_PATH)) {
      const freshSnapshot = computeLondonSnapshot();
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(freshSnapshot, null, 2), 'utf8');
      console.log(`[fixture] Created new reference snapshot at ${FIXTURE_PATH} (${freshSnapshot.trains.length} trains)`);
    }

    // 2. Load frozen reference fixture
    const expectedFixture: LondonSnapshotFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    // 3. Replay computation from engine and data
    const computedSnapshot = computeLondonSnapshot();

    // 4. Validate metadata and fleet counts
    expect(computedSnapshot.trains.length).toBe(658);
    expect(computedSnapshot.meta.totalTrains).toBe(658);
    expect(computedSnapshot.meta.trainsByLine['bakerloo']).toBe(29);
    expect(computedSnapshot.meta.trainsByLine['central']).toBe(79);
    expect(computedSnapshot.meta.trainsByLine['circle']).toBe(17);
    expect(computedSnapshot.meta.trainsByLine['district']).toBe(71);
    expect(computedSnapshot.meta.trainsByLine['hammersmith-city']).toBe(13);
    expect(computedSnapshot.meta.trainsByLine['jubilee']).toBe(54);
    expect(computedSnapshot.meta.trainsByLine['metropolitan']).toBe(46);
    expect(computedSnapshot.meta.trainsByLine['northern']).toBe(105);
    expect(computedSnapshot.meta.trainsByLine['piccadilly']).toBe(76);
    expect(computedSnapshot.meta.trainsByLine['victoria']).toBe(47);
    expect(computedSnapshot.meta.trainsByLine['waterloo-city']).toBe(3);
    expect(computedSnapshot.meta.trainsByLine['dlr']).toBe(38);
    expect(computedSnapshot.meta.trainsByLine['elizabeth']).toBe(40);
    expect(computedSnapshot.meta.trainsByLine['liberty']).toBe(2);
    expect(computedSnapshot.meta.trainsByLine['lioness']).toBe(6);
    expect(computedSnapshot.meta.trainsByLine['mildmay']).toBe(10);
    expect(computedSnapshot.meta.trainsByLine['suffragette']).toBe(4);
    expect(computedSnapshot.meta.trainsByLine['weaver']).toBe(6);
    expect(computedSnapshot.meta.trainsByLine['windrush']).toBe(12);

    // Validate all 19 lines are active
    const lineIds = [
      'bakerloo', 'central', 'circle', 'district', 'hammersmith-city',
      'jubilee', 'metropolitan', 'northern', 'piccadilly', 'victoria', 'waterloo-city',
      'dlr', 'elizabeth', 'liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'
    ];
    for (const lid of lineIds) {
      expect(computedSnapshot.meta.trainsByLine[lid], `Line ${lid} must have active trains`).toBeGreaterThan(0);
    }

    // 5. Compare train by train for Tube (strict non-regression: 540 trains must match reference fixture exactly)
    const expectedMap = new Map(expectedFixture.trains.map(t => [t.tripId, t]));
    const OVERGROUND_LINES = new Set(['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush']);
    const tubeTrains = computedSnapshot.trains.filter(t => t.line !== 'dlr' && t.line !== 'elizabeth' && !OVERGROUND_LINES.has(t.line));
    expect(tubeTrains.length).toBe(540);

    let maxDistDeltaM = 0;
    let maxSpeedDeltaMps = 0;

    for (const computed of tubeTrains) {
      const expected = expectedMap.get(computed.tripId);
      expect(expected, `Train ${computed.tripId} must exist in reference snapshot`).toBeDefined();
      if (!expected) continue;

      expect(computed.line).toBe(expected.line);
      expect(computed.shapeId).toBe(expected.shapeId);
      expect(computed.direction).toBe(expected.direction);

      // Verify Greater London bounding box coordinates
      const [lon, lat] = computed.pos;
      expect(lon).toBeGreaterThanOrEqual(-0.65);
      expect(lon).toBeLessThanOrEqual(0.35);
      expect(lat).toBeGreaterThanOrEqual(51.25);
      expect(lat).toBeLessThanOrEqual(51.75);

      const distDeltaM = Math.abs(computed.currentDistM - expected.currentDistM);
      const speedDeltaMps = Math.abs(computed.speedMps - expected.speedMps);

      if (distDeltaM > maxDistDeltaM) maxDistDeltaM = distDeltaM;
      if (speedDeltaMps > maxSpeedDeltaMps) maxSpeedDeltaMps = speedDeltaMps;

      // Acceptance criterion: strictly reproduction within 1 meter (exact non-regression)
      expect(distDeltaM, `Position of train ${computed.tripId} (${computed.lineName}) deviated by ${distDeltaM}m (> 1m limit)`).toBeLessThanOrEqual(1.0);
      expect(speedDeltaMps, `Speed of train ${computed.tripId} (${computed.lineName}) deviated by ${speedDeltaMps} m/s`).toBeLessThanOrEqual(0.1);
    }

    // 6. Verify newly delivered DLR fleet (38 trains active in East London)
    const dlrTrains = computedSnapshot.trains.filter(t => t.line === 'dlr');
    expect(dlrTrains.length).toBe(38);
    for (const t of dlrTrains) {
      const [lon, lat] = t.pos;
      expect(lon).toBeGreaterThanOrEqual(-0.15); // DLR is bounded between Bank and Beckton/Woolwich/Lewisham
      expect(lon).toBeLessThanOrEqual(0.10);
      expect(lat).toBeGreaterThanOrEqual(51.45); // Lewisham is ~51.465
      expect(lat).toBeLessThanOrEqual(51.56);
      expect(t.speedMps).toBeGreaterThanOrEqual(0);
      expect(t.speedMps).toBeLessThanOrEqual(25); // max 80-90 km/h
    }

    // 7. Verify newly delivered Elizabeth line fleet (40 active trains across Reading-Heathrow-Shenfield-Abbey Wood)
    const elizabethTrains = computedSnapshot.trains.filter(t => t.line === 'elizabeth');
    expect(elizabethTrains.length).toBe(40);
    for (const t of elizabethTrains) {
      const [lon, lat] = t.pos;
      expect(lon).toBeGreaterThanOrEqual(-1.02); // Reading is ~ -0.973
      expect(lon).toBeLessThanOrEqual(0.35);  // Shenfield is ~ +0.331
      expect(lat).toBeGreaterThanOrEqual(51.44); // Heathrow / Abbey Wood ~51.46 - 51.49
      expect(lat).toBeLessThanOrEqual(51.65); // Shenfield ~51.63
      expect(t.speedMps).toBeGreaterThanOrEqual(0);
      expect(t.speedMps).toBeLessThanOrEqual(35); // max 120-125 km/h
      expect(t.shapeId).toMatch(/^elizabeth_\d+_\d+$/);
    }

    // 8. Verify London Overground fleet (40 active trains across Liberty, Lioness, Mildmay, Suffragette, Weaver, Windrush)
    const overgroundTrains = computedSnapshot.trains.filter(t => OVERGROUND_LINES.has(t.line));
    expect(overgroundTrains.length).toBe(40);
    for (const t of overgroundTrains) {
      const [lon, lat] = t.pos;
      expect(lon).toBeGreaterThanOrEqual(-0.50); // Watford is ~ -0.40
      expect(lon).toBeLessThanOrEqual(0.30);  // Upminster is ~ +0.25
      expect(lat).toBeGreaterThanOrEqual(51.35); // West Croydon is ~51.37
      expect(lat).toBeLessThanOrEqual(51.72); // Cheshunt / Watford is ~51.67-51.70
      expect(t.speedMps).toBeGreaterThanOrEqual(0);
      expect(t.speedMps).toBeLessThanOrEqual(30); // max ~100 km/h
      expect(t.shapeId).toMatch(/^(liberty|lioness|mildmay|suffragette|weaver|windrush)_\d+_\d+$/);
    }

    console.log(`✅ London snapshot passed: 540 Tube trains matched with Max pos delta: ${maxDistDeltaM.toFixed(4)}m, Max speed delta: ${maxSpeedDeltaMps.toFixed(4)} m/s, plus 38 active DLR, 40 active Elizabeth line, and 40 active London Overground trains.`);
  });
});
