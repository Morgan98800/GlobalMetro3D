import type { ShapeEntry as Shape } from '../../sim/shapes';
import { coordAtDistance, sliceShape } from '../../sim/shapes_loader';

export type GeoPoint = [number, number];

export interface ShapeFrame {
  pos: GeoPoint;
  tangent: [number, number];
  rightNormal: [number, number];
  compassBearing: number;
}

const METERS_PER_DEGREE_LATITUDE = 111320;
const MIN_TURN_DEGREES = 14;
const MAX_CORNER_CUT_METERS = 18;
const CORNER_CUT_RATIO = 0.22;
const CURVE_SAMPLES = 3;

const smoothedShapeCache = new WeakMap<Shape, Shape>();

export function metersPerDegreeLongitude(latitude: number): number {
  return METERS_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Lateral right-hand track offset (in meters) at close zoom so opposing
 * trains run on twin tracks (`±1.55 m`) without clipping at 2-sided stations.
 */
export function dualTrackOffsetForZoom(zoom: number, trackHalfSeparationM = 1.55): number {
  return smoothstep(13.8, 14.45, zoom) * trackHalfSeparationM;
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latitude = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * metersPerDegreeLongitude(latitude);
  const dy = (b[1] - a[1]) * METERS_PER_DEGREE_LATITUDE;
  return Math.hypot(dx, dy);
}

export function offsetGeoPointENU(
  point: GeoPoint,
  eastMeters: number,
  northMeters: number
): GeoPoint {
  const cosLat = Math.max(0.1, Math.cos((point[1] * Math.PI) / 180));
  return [
    point[0] + eastMeters / (METERS_PER_DEGREE_LATITUDE * cosLat),
    point[1] + northMeters / METERS_PER_DEGREE_LATITUDE,
  ];
}

function interpolate(a: GeoPoint, b: GeoPoint, distanceFromA: number): GeoPoint {
  const length = distanceMeters(a, b);
  if (length <= 0.001) return a;
  const t = Math.max(0, Math.min(1, distanceFromA / length));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function turnDegrees(previous: GeoPoint, current: GeoPoint, next: GeoPoint): number {
  const scaleX = metersPerDegreeLongitude(current[1]);
  const incoming = [
    (current[0] - previous[0]) * scaleX,
    (current[1] - previous[1]) * METERS_PER_DEGREE_LATITUDE,
  ];
  const outgoing = [
    (next[0] - current[0]) * scaleX,
    (next[1] - current[1]) * METERS_PER_DEGREE_LATITUDE,
  ];
  const incomingLength = Math.hypot(incoming[0], incoming[1]);
  const outgoingLength = Math.hypot(outgoing[0], outgoing[1]);
  if (incomingLength <= 0.001 || outgoingLength <= 0.001) return 0;
  const cosine =
    (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / (incomingLength * outgoingLength);
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}

/**
 * Arrondit uniquement les angles marqués d'un tracé d'affichage.
 * Les points d'origine et leurs distances restent utilisés par la simulation.
 */
export function roundPathCorners(points: readonly GeoPoint[]): GeoPoint[] {
  if (points.length < 3) return points.map((point) => [point[0], point[1]]);

  const rounded: GeoPoint[] = [[points[0][0], points[0][1]]];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingLength = distanceMeters(previous, current);
    const outgoingLength = distanceMeters(current, next);
    const turn = turnDegrees(previous, current, next);

    if (turn < MIN_TURN_DEGREES || incomingLength <= 0.001 || outgoingLength <= 0.001) {
      rounded.push([current[0], current[1]]);
      continue;
    }

    const cut = Math.min(
      MAX_CORNER_CUT_METERS,
      incomingLength * CORNER_CUT_RATIO,
      outgoingLength * CORNER_CUT_RATIO
    );
    if (cut < 2) {
      rounded.push([current[0], current[1]]);
      continue;
    }

    const entry = interpolate(current, previous, cut);
    const exit = interpolate(current, next, cut);
    rounded.push(entry);
    for (let sample = 1; sample < CURVE_SAMPLES; sample++) {
      const t = sample / CURVE_SAMPLES;
      const oneMinusT = 1 - t;
      rounded.push([
        oneMinusT * oneMinusT * entry[0] + 2 * oneMinusT * t * current[0] + t * t * exit[0],
        oneMinusT * oneMinusT * entry[1] + 2 * oneMinusT * t * current[1] + t * t * exit[1],
      ]);
    }
    rounded.push(exit);
  }
  rounded.push([points[points.length - 1][0], points[points.length - 1][1]]);
  return rounded;
}

/**
 * Produces a render-only rounded Shape sharing the exact corner-rounding curve
 * as PathLayer tracks, normalized back onto `[0, shape.length]` so progress `currentDistM`
 * tracks termini and curves with zero drift.
 */
export function smoothShapeForRender(shape: Shape): Shape {
  const cached = smoothedShapeCache.get(shape);
  if (cached) return cached;

  const vertexCount = shape.coords.length / 2;
  if (vertexCount < 3 || shape.length <= 0) {
    smoothedShapeCache.set(shape, shape);
    return shape;
  }

  const pts: GeoPoint[] = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    pts[i] = [shape.coords[i * 2], shape.coords[i * 2 + 1]];
  }
  const rounded = roundPathCorners(pts);
  const roundedCoords = new Float64Array(rounded.length * 2);
  const rawDists = new Float32Array(rounded.length);
  let totalRaw = 0;
  roundedCoords[0] = rounded[0][0];
  roundedCoords[1] = rounded[0][1];
  rawDists[0] = 0;
  for (let i = 1; i < rounded.length; i++) {
    roundedCoords[i * 2] = rounded[i][0];
    roundedCoords[i * 2 + 1] = rounded[i][1];
    totalRaw += distanceMeters(rounded[i - 1], rounded[i]);
    rawDists[i] = totalRaw;
  }

  const normScale = totalRaw > 0.01 ? shape.length / totalRaw : 1;
  const dist = new Float32Array(rounded.length);
  for (let i = 0; i < rounded.length; i++) {
    dist[i] = rawDists[i] * normScale;
  }
  dist[rounded.length - 1] = shape.length;

  const smoothed: Shape = {
    id: shape.id,
    coords: roundedCoords,
    dist,
    length: shape.length,
    totalLengthM: shape.totalLengthM,
    ptCount: rounded.length,
  };
  smoothedShapeCache.set(shape, smoothed);
  return smoothed;
}

/**
 * Samples position, forward tangent, right-hand normal (ENU), and compass bearing
 * at `distM` along a shape, optionally shifted `offsetRightM` meters onto the right track.
 */
export function sampleShapeFrame(shape: Shape, distM: number, offsetRightM = 0): ShapeFrame {
  const clamped = Math.max(0, Math.min(shape.length, distM));
  const basePos = coordAtDistance(shape, clamped);
  const backD = Math.max(0, clamped - 1.5);
  const fwdD = Math.min(shape.length, clamped + 1.5);
  const pBack = backD < clamped ? coordAtDistance(shape, backD) : basePos;
  const pFwd = fwdD > clamped ? coordAtDistance(shape, fwdD) : basePos;

  const cosLat = Math.max(0.1, Math.cos((basePos[1] * Math.PI) / 180));
  let dx = (pFwd[0] - pBack[0]) * METERS_PER_DEGREE_LATITUDE * cosLat;
  let dy = (pFwd[1] - pBack[1]) * METERS_PER_DEGREE_LATITUDE;
  let len = Math.hypot(dx, dy);

  if (len <= 0.001 && shape.length > 0.01) {
    // Fallback over a wider 6 m window near boundary singularities
    const altBack = coordAtDistance(shape, Math.max(0, clamped - 6));
    const altFwd = coordAtDistance(shape, Math.min(shape.length, clamped + 6));
    dx = (altFwd[0] - altBack[0]) * METERS_PER_DEGREE_LATITUDE * cosLat;
    dy = (altFwd[1] - altBack[1]) * METERS_PER_DEGREE_LATITUDE;
    len = Math.hypot(dx, dy);
  }

  const tx = len > 0.001 ? dx / len : 0;
  const ty = len > 0.001 ? dy / len : 1;
  const rx = ty;
  const ry = -tx;
  const pos =
    Math.abs(offsetRightM) > 0.001
      ? offsetGeoPointENU(basePos, rx * offsetRightM, ry * offsetRightM)
      : basePos;
  const compassBearing = (Math.atan2(tx, ty) * 180) / Math.PI;

  return {
    pos,
    tangent: [tx, ty],
    rightNormal: [rx, ry],
    compassBearing,
  };
}

/**
 * Slices `shape` between `startM` and `endM` and offsets every vertex along its
 * local right-hand normal when `offsetRightM !== 0`.
 */
export function offsetShapeSlice(
  shape: Shape,
  startM: number,
  endM: number,
  offsetRightM = 0
): GeoPoint[] {
  const sliced = sliceShape(shape, startM, endM);
  if (Math.abs(offsetRightM) <= 0.001 || sliced.length < 2) {
    return sliced;
  }

  const out: GeoPoint[] = new Array(sliced.length);
  for (let i = 0; i < sliced.length; i++) {
    const prev = sliced[Math.max(0, i - 1)];
    const next = sliced[Math.min(sliced.length - 1, i + 1)];
    const cur = sliced[i];
    const cosLat = Math.max(0.1, Math.cos((cur[1] * Math.PI) / 180));
    const dx = (next[0] - prev[0]) * METERS_PER_DEGREE_LATITUDE * cosLat;
    const dy = (next[1] - prev[1]) * METERS_PER_DEGREE_LATITUDE;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      const rx = dy / len;
      const ry = -dx / len;
      out[i] = offsetGeoPointENU(cur, rx * offsetRightM, ry * offsetRightM);
    } else {
      out[i] = cur;
    }
  }
  return out;
}
