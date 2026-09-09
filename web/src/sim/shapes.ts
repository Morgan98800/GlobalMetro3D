export interface ShapeData {
  shapeId: string;
  routeId: string;
  directionId: number;
  ptCount: number;
  totalLengthM: number;
  points: Float32Array; // [lng0, lat0, d0, lng1, lat1, d1, ...]
}

export type ShapeEntry = ShapeData;

export function parseShapesBuffer(arrayBuffer: ArrayBuffer): Map<string, ShapeEntry> {
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');

  // Verify Magic "MSHP"
  const magic = decoder.decode(new Uint8Array(arrayBuffer, 0, 4));
  if (magic !== 'MSHP') {
    throw new Error(`Invalid magic header in shapes.bin: ${magic}`);
  }

  const shapeCount = view.getUint16(6, true);
  const tableOffset = 32;
  const entrySize = 64;
  const dataStart = tableOffset + shapeCount * entrySize;

  const shapes = new Map<string, ShapeEntry>();

  for (let i = 0; i < shapeCount; i++) {
    const entryStart = tableOffset + i * entrySize;

    // Read shape_id (32 bytes)
    const sidBytes = new Uint8Array(arrayBuffer, entryStart, 32);
    let sidLen = 0;
    while (sidLen < 32 && sidBytes[sidLen] !== 0) sidLen++;
    const shapeId = decoder.decode(sidBytes.subarray(0, sidLen));

    // Read route_id (16 bytes)
    const ridBytes = new Uint8Array(arrayBuffer, entryStart + 32, 16);
    let ridLen = 0;
    while (ridLen < 16 && ridBytes[ridLen] !== 0) ridLen++;
    const routeId = decoder.decode(ridBytes.subarray(0, ridLen));

    const directionId = view.getUint8(entryStart + 48);
    const ptCount = view.getUint32(entryStart + 52, true);
    const totalLengthM = view.getFloat32(entryStart + 56, true);
    const byteOffset = view.getUint32(entryStart + 60, true);

    const ptStart = dataStart + byteOffset;
    const ptLength = ptCount * 3;

    const points = new Float32Array(arrayBuffer, ptStart, ptLength);

    shapes.set(shapeId, {
      shapeId,
      routeId,
      directionId,
      ptCount,
      totalLengthM,
      points
    });
  }

  return shapes;
}

export async function loadShapesBin(url: string = '/data/shapes.bin'): Promise<Map<string, ShapeEntry>> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load shapes.bin: ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return parseShapesBuffer(arrayBuffer);
}

/**
 * Linearly interpolates [lon, lat] at an exact curvilinear distance along a shape
 * using binary search on the cumulative distance component (index 2).
 */
export function interpolatePointAtDistance(shape: ShapeEntry, distM: number): [number, number] {
  const pts = shape.points;
  const count = shape.ptCount;
  if (count === 0) return [0, 0];
  if (count === 1 || distM <= pts[2]) return [pts[0], pts[1]];
  if (distM >= pts[(count - 1) * 3 + 2]) return [pts[(count - 1) * 3], pts[(count - 1) * 3 + 1]];

  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pts[mid * 3 + 2] <= distM) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const i0 = Math.max(0, low - 1);
  const i1 = Math.min(count - 1, i0 + 1);
  if (i0 === i1) {
    return [pts[i0 * 3], pts[i0 * 3 + 1]];
  }

  const d0 = pts[i0 * 3 + 2];
  const d1 = pts[i1 * 3 + 2];
  const span = d1 - d0;
  const t = span > 1e-6 ? (distM - d0) / span : 0;
  const clampedT = Math.max(0, Math.min(1, t));

  const lng = pts[i0 * 3] + clampedT * (pts[i1 * 3] - pts[i0 * 3]);
  const lat = pts[i0 * 3 + 1] + clampedT * (pts[i1 * 3 + 1] - pts[i0 * 3 + 1]);

  return [
    Number.isFinite(lng) ? lng : pts[i0 * 3],
    Number.isFinite(lat) ? lat : pts[i0 * 3 + 1]
  ];
}

/**
 * Slices a contiguous polyline segment from a shape between dStartMeters and dEndMeters.
 * - Works exclusively on ShapeEntry (from shapes.bin).
 * - Binary searches intermediate vertices.
 * - Linearly interpolates endpoints dStartMeters and dEndMeters.
 * - If dStart > dEnd, reverses the returned coordinate sequence.
 */
export function sliceShape(
  shape: ShapeEntry,
  dStartMeters: number,
  dEndMeters: number
): [number, number][] {
  const count = shape.ptCount;
  if (count === 0) return [];
  if (count === 1) return [[shape.points[0], shape.points[1]]];

  const isReverse = dStartMeters > dEndMeters;
  const dMin = Math.min(dStartMeters, dEndMeters);
  const dMax = Math.max(dStartMeters, dEndMeters);

  const total = shape.totalLengthM;
  const cMin = Math.max(0, Math.min(total, dMin));
  const cMax = Math.max(0, Math.min(total, dMax));

  if (Math.abs(cMax - cMin) < 1e-4) {
    const pt = interpolatePointAtDistance(shape, cMin);
    return [pt, [pt[0], pt[1]]];
  }

  const pStart = interpolatePointAtDistance(shape, cMin);
  const pEnd = interpolatePointAtDistance(shape, cMax);

  const pts = shape.points;

  // Binary search for first vertex with cumulative distance > cMin + 1e-4
  let low = 0;
  let high = count - 1;
  let firstK = count;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pts[mid * 3 + 2] > cMin + 1e-4) {
      firstK = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Binary search for last vertex with cumulative distance < cMax - 1e-4
  low = 0;
  high = count - 1;
  let lastK = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pts[mid * 3 + 2] < cMax - 1e-4) {
      lastK = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const result: [number, number][] = [pStart];
  if (firstK <= lastK) {
    for (let k = firstK; k <= lastK; k++) {
      result.push([pts[k * 3], pts[k * 3 + 1]]);
    }
  }
  result.push(pEnd);

  if (isReverse) {
    result.reverse();
  }

  return result;
}

/**
 * Splits a train into individual car polylines along the shape.
 * Each car is a track segment of exactly carLengthM, separated by interCarGapM.
 * Clamps bounds to [0, shape.totalLengthM].
 * Direction 1: train head is at headDistanceM, tail at lower distance.
 * Direction 0: inverted according to shape sense convention.
 */
export function splitIntoCars(
  shape: ShapeEntry,
  headDistanceM: number,
  carsCount: number,
  carLengthM: number,
  interCarGapM: number,
  direction: 0 | 1 = 1
): [number, number][][] {
  const cars: [number, number][][] = [];
  const total = shape.totalLengthM;

  for (let i = 0; i < carsCount; i++) {
    let carHead: number;
    let carTail: number;

    if (direction === 1) {
      carHead = headDistanceM - i * (carLengthM + interCarGapM);
      carTail = carHead - carLengthM;
    } else {
      carHead = headDistanceM + i * (carLengthM + interCarGapM);
      carTail = carHead + carLengthM;
    }

    const clampedHead = Math.max(0, Math.min(total, carHead));
    const clampedTail = Math.max(0, Math.min(total, carTail));

    const carPolyline = sliceShape(shape, clampedTail, clampedHead);
    cars.push(carPolyline);
  }

  return cars;
}
