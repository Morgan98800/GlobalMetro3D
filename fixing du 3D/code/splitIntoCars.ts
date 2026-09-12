export interface Shape {
  coords: Float64Array;
  dist: Float32Array;
  length: number;
}

export function indexAtDistance(shape: Shape, d: number): number {
  const { dist } = shape;
  let lo = 0;
  let hi = dist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function coordAtDistance(shape: Shape, d: number): [number, number] {
  const n = shape.dist.length;
  if (d <= 0) return [shape.coords[0], shape.coords[1]];
  if (d >= shape.length) return [shape.coords[(n - 1) * 2], shape.coords[(n - 1) * 2 + 1]];

  const i = indexAtDistance(shape, d);
  const j = Math.min(i + 1, n - 1);
  const span = shape.dist[j] - shape.dist[i];
  const f = span > 0 ? (d - shape.dist[i]) / span : 0;

  return [
    shape.coords[i * 2] + f * (shape.coords[j * 2] - shape.coords[i * 2]),
    shape.coords[i * 2 + 1] + f * (shape.coords[j * 2 + 1] - shape.coords[i * 2 + 1]),
  ];
}

export function sliceShape(
  shape: Shape,
  dStart: number,
  dEnd: number
): [number, number][] {
  const isReverse = dStart > dEnd;
  const minD = Math.min(dStart, dEnd);
  const maxD = Math.max(dStart, dEnd);

  const a = Math.max(0, Math.min(minD, shape.length));
  const b = Math.max(0, Math.min(maxD, shape.length));
  if (b - a < 0.5) {
    const pt = coordAtDistance(shape, a);
    return [pt, [pt[0], pt[1]]];
  }

  const out: [number, number][] = [coordAtDistance(shape, a)];
  const i0 = indexAtDistance(shape, a);
  const i1 = indexAtDistance(shape, b);
  for (let i = i0 + 1; i <= i1; i++) {
    out.push([shape.coords[i * 2], shape.coords[i * 2 + 1]]);
  }
  out.push(coordAtDistance(shape, b));

  if (isReverse) {
    out.reverse();
  }
  return out;
}

/**
 * Découpe une rame en ses caisses individuelles le long du tracé.
 */
export function splitIntoCars(
  shape: Shape,
  headDistanceM: number,
  carsCount: number,
  carLengthM: number,
  interCarGapM: number,
  direction: 0 | 1 = 1
): [number, number][][] {
  const cars: [number, number][][] = [];
  const total = shape.length;

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

