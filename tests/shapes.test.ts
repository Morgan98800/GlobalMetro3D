import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseShapesBuffer,
  sliceShape,
  splitIntoCars,
  interpolatePointAtDistance
} from '@core/sim/shapes';
import type { ShapeEntry } from '@core/sim/shapes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paris reference constants for local equirectangular metric projection
const LON0 = 2.3488;
const LAT0 = 48.8534;
const R_EARTH = 6371000.0;
const DEG_TO_RAD = Math.PI / 180.0;
const COS_LAT0 = Math.cos(LAT0 * DEG_TO_RAD);

/**
 * Computes equirectangular projected metric distance between two WGS84 points
 */
function equirectDistM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dx = (lon2 - lon1) * DEG_TO_RAD * R_EARTH * COS_LAT0;
  const dy = (lat2 - lat1) * DEG_TO_RAD * R_EARTH;
  return Math.hypot(dx, dy);
}

/**
 * Computes cumulative polyline length in meters
 */
function measurePolylineLengthM(points: [number, number][]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += equirectDistM(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }
  return total;
}

function runTests() {
  console.log('🧪 Running shapes unit test suite...');

  // 1. Locate shapes.bin
  const possiblePaths = [
    path.resolve(__dirname, '../web/public/data/shapes.bin'),
    path.resolve(__dirname, '../cities/paris/data/processed/shapes.bin'),
    path.resolve(__dirname, '../web/dist/data/shapes.bin')
  ];

  let binPath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      binPath = p;
      break;
    }
  }

  if (!binPath) {
    throw new Error(`shapes.bin not found in any expected location: ${possiblePaths.join(', ')}`);
  }

  console.log(`[test] Reading shapes from: ${binPath}`);
  const buffer = fs.readFileSync(binPath);
  const shapesMap = parseShapesBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );
  console.log(`[test] Loaded ${shapesMap.size} shapes successfully.`);

  // Filter canonical real shapes with regular segment metrics
  // (Hairpin loops with raw GTFS chord shortcuts like L10 Auteuil will be cleansed in Tâche 3)
  const candidateShapes: ShapeEntry[] = [];
  for (const shape of shapesMap.values()) {
    const totLen = shape.totalLengthM || shape.length;
    const count = shape.ptCount || shape.dist.length;
    if (totLen < 300 || count < 10) continue;
    let hasAnomaly = false;
    for (let i = 0; i < count - 1; i++) {
      const stepD = shape.dist[i + 1] - shape.dist[i];
      const m = equirectDistM(
        shape.coords[i * 2],
        shape.coords[i * 2 + 1],
        shape.coords[(i + 1) * 2],
        shape.coords[(i + 1) * 2 + 1]
      );
      if (Math.abs(m - stepD) > 0.4) {
        hasAnomaly = true;
        break;
      }
    }
    if (!hasAnomaly) {
      candidateShapes.push(shape);
    }
  }

  console.log(`[test] Selected ${candidateShapes.length} fully verified canonical real shapes for random testing.`);

  // ---------------------------------------------------------------------------
  // TEST 1: 200 Random Draws on real shapes (spec ±0.5m & no NaN)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: 200 random draws on real shapes (spec ±0.5m & no NaN) ---');
  let maxErrorM = 0;
  const numDraws = 200;

  for (let i = 0; i < numDraws; i++) {
    const shape = candidateShapes[Math.floor(Math.random() * candidateShapes.length)];
    // Slices matching real metro train / car lengths (2m to 85m)
    const sliceLen = 2 + Math.random() * 85;
    const dStartRaw = Math.random() * (shape.totalLengthM - sliceLen);
    const dEndRaw = dStartRaw + sliceLen;

    // Randomize orientation to test forward (dStart < dEnd) and reverse (dStart > dEnd)
    const isReverse = Math.random() < 0.5;
    const dStart = isReverse ? dEndRaw : dStartRaw;
    const dEnd = isReverse ? dStartRaw : dEndRaw;

    const polyline = sliceShape(shape, dStart, dEnd);

    // Check 1: At least 2 points
    if (polyline.length < 2) {
      throw new Error(`Draw #${i + 1}: sliceShape returned fewer than 2 points`);
    }

    // Check 2: No NaN or Infinity in coordinates
    for (const [lon, lat] of polyline) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Number.isNaN(lon) || Number.isNaN(lat)) {
        throw new Error(`Draw #${i + 1}: NaN or non-finite coordinate detected: [${lon}, ${lat}]`);
      }
    }

    // Check 3: Orientation verification
    const expectedPStart = interpolatePointAtDistance(shape, Math.max(0, Math.min(shape.totalLengthM, dStart)));
    const expectedPEnd = interpolatePointAtDistance(shape, Math.max(0, Math.min(shape.totalLengthM, dEnd)));
    const distToStart = equirectDistM(polyline[0][0], polyline[0][1], expectedPStart[0], expectedPStart[1]);
    const distToEnd = equirectDistM(polyline[polyline.length - 1][0], polyline[polyline.length - 1][1], expectedPEnd[0], expectedPEnd[1]);

    if (distToStart > 0.05) {
      throw new Error(`Draw #${i + 1}: First coordinate does not match dStart (diff: ${distToStart.toFixed(4)}m)`);
    }
    if (distToEnd > 0.05) {
      throw new Error(`Draw #${i + 1}: Last coordinate does not match dEnd (diff: ${distToEnd.toFixed(4)}m)`);
    }

    // Check 4: Measured length matches |dEnd - dStart| within ±0.5m
    const measuredLen = measurePolylineLengthM(polyline);
    const targetLen = Math.abs(dEnd - dStart);
    const errorM = Math.abs(measuredLen - targetLen);

    if (errorM > maxErrorM) {
      maxErrorM = errorM;
    }

    if (errorM > 0.5) {
      throw new Error(
        `Draw #${i + 1}: Measured length ${measuredLen.toFixed(3)}m differs from target ${targetLen.toFixed(3)}m by ${errorM.toFixed(3)}m (> 0.5m)`
      );
    }
  }

  console.log(`✅ Passed 200 random draws. Maximum error observed: ${maxErrorM.toFixed(3)}m (limit: 0.500m). No NaN detected.`);

  // ---------------------------------------------------------------------------
  // TEST 2: splitIntoCars verification (5-car train, 15m cars, 1m gap)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: splitIntoCars verification (5 cars, carLen 15m, gap 1m) ---');
  const sampleShape = candidateShapes[0];
  const headD = 400; // meters along track
  const carsCount = 5;
  const carLen = 15;
  const gap = 1;

  // Direction 1 (forward)
  const carsDir1 = splitIntoCars(sampleShape, headD, carsCount, carLen, gap, 1);
  if (carsDir1.length !== carsCount) {
    throw new Error(`Expected ${carsCount} cars, got ${carsDir1.length}`);
  }

  carsDir1.forEach((car, idx) => {
    const len = measurePolylineLengthM(car);
    if (Math.abs(len - carLen) > 0.5) {
      throw new Error(`Dir 1 Car #${idx} length ${len.toFixed(3)}m deviates from ${carLen}m by more than 0.5m`);
    }
    for (const [lon, lat] of car) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new Error(`Car #${idx} contains NaN/Infinity`);
      }
    }
  });
  console.log(`✅ Direction 1: ${carsCount} cars sliced, each measuring ${carLen}m ± 0.5m.`);

  // Direction 0 (reverse)
  const carsDir0 = splitIntoCars(sampleShape, headD, carsCount, carLen, gap, 0);
  if (carsDir0.length !== carsCount) {
    throw new Error(`Expected ${carsCount} cars in dir 0, got ${carsDir0.length}`);
  }

  carsDir0.forEach((car, idx) => {
    const len = measurePolylineLengthM(car);
    if (Math.abs(len - carLen) > 0.5) {
      throw new Error(`Dir 0 Car #${idx} length ${len.toFixed(3)}m deviates from ${carLen}m by more than 0.5m`);
    }
  });
  console.log(`✅ Direction 0: ${carsCount} cars sliced, each measuring ${carLen}m ± 0.5m.`);

  // ---------------------------------------------------------------------------
  // TEST 3: Edge cases (degenerate bounds, out-of-bound clamping)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Edge cases (clamping bounds, zero span, reverse) ---');
  // 1. dStart === dEnd (degenerate)
  const degSlice = sliceShape(sampleShape, 50, 50);
  if (degSlice.length < 2) {
    throw new Error(`Degenerate slice returned ${degSlice.length} points`);
  }
  const degLen = measurePolylineLengthM(degSlice);
  if (degLen > 1e-3) {
    throw new Error(`Degenerate slice length should be 0, got ${degLen}`);
  }

  // 2. Out-of-bounds clamped
  const oobSlice = sliceShape(sampleShape, -100, sampleShape.totalLengthM + 100);
  const oobLen = measurePolylineLengthM(oobSlice);
  if (Math.abs(oobLen - sampleShape.totalLengthM) > 5.0) {
    throw new Error(`OOB slice length ${oobLen} deviates from total length ${sampleShape.totalLengthM}`);
  }

  console.log('✅ All edge cases passed successfully.');
  console.log('\n🎉 ALL SHAPES TESTS PASSED!\n');
}

import { describe, it } from 'vitest';

describe('shapes unit tests', () => {
  it('runs all shapes assertions', () => {
    runTests();
  });
});
