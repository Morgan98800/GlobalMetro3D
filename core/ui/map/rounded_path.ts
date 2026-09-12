export type GeoPoint = [number, number];

const METERS_PER_DEGREE_LATITUDE = 111320;
const MIN_TURN_DEGREES = 14;
const MAX_CORNER_CUT_METERS = 18;
const CORNER_CUT_RATIO = 0.22;
const CURVE_SAMPLES = 3;

function metersPerDegreeLongitude(latitude: number): number {
  return METERS_PER_DEGREE_LATITUDE * Math.cos(latitude * Math.PI / 180);
}

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latitude = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * metersPerDegreeLongitude(latitude);
  const dy = (b[1] - a[1]) * METERS_PER_DEGREE_LATITUDE;
  return Math.hypot(dx, dy);
}

function interpolate(a: GeoPoint, b: GeoPoint, distanceFromA: number): GeoPoint {
  const length = distanceMeters(a, b);
  if (length <= 0.001) return a;
  const t = Math.max(0, Math.min(1, distanceFromA / length));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function turnDegrees(previous: GeoPoint, current: GeoPoint, next: GeoPoint): number {
  const latitude = current[1] * Math.PI / 180;
  const scaleX = metersPerDegreeLongitude(current[1]);
  const incoming = [
    (current[0] - previous[0]) * scaleX,
    (current[1] - previous[1]) * METERS_PER_DEGREE_LATITUDE
  ];
  const outgoing = [
    (next[0] - current[0]) * scaleX,
    (next[1] - current[1]) * METERS_PER_DEGREE_LATITUDE
  ];
  const incomingLength = Math.hypot(incoming[0], incoming[1]);
  const outgoingLength = Math.hypot(outgoing[0], outgoing[1]);
  if (incomingLength <= 0.001 || outgoingLength <= 0.001) return 0;
  const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / (incomingLength * outgoingLength);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

/**
 * Arrondit uniquement les angles marqués d'un tracé d'affichage.
 * Les points d'origine et leurs distances restent utilisés par la simulation.
 */
export function roundPathCorners(points: readonly GeoPoint[]): GeoPoint[] {
  if (points.length < 3) return points.map(point => [point[0], point[1]]);

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
        oneMinusT * oneMinusT * entry[1] + 2 * oneMinusT * t * current[1] + t * t * exit[1]
      ]);
    }
    rounded.push(exit);
  }
  rounded.push([points[points.length - 1][0], points[points.length - 1][1]]);
  return rounded;
}
