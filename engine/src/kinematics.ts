import type { ShapeData, ActiveTrip } from './loader';
import type { TrainState } from '@paris-subway/shared';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Computes bearing in degrees (0..359) from point 1 to point 2 */
export function calculateBearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dlambda = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(dlambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  const brg = Math.atan2(y, x) * RAD_TO_DEG;
  return Math.round((brg + 360) % 360);
}

/** Interpolates coordinates at curvilinear distance d on a resampled shape */
export function getCoordAtDistance(shape: ShapeData, distM: number): [number, number] {
  const pts = shape.points;
  const count = shape.ptCount;
  if (count === 0) return [0, 0];
  if (distM <= 0) return [pts[0], pts[1]];
  if (distM >= shape.totalLengthM) return [pts[(count - 1) * 3], pts[(count - 1) * 3 + 1]];

  // Binary search for segment
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const dMid = pts[mid * 3 + 2];
    if (dMid < distM) {
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
  const fraction = span > 1e-4 ? (distM - d0) / span : 0;

  const lng = pts[i0 * 3] + fraction * (pts[i1 * 3] - pts[i0 * 3]);
  const lat = pts[i0 * 3 + 1] + fraction * (pts[i1 * 3 + 1] - pts[i0 * 3 + 1]);
  return [Number(lng.toFixed(5)), Number(lat.toFixed(5))];
}

/** Computes smoothed bearing at distance d by looking +/- 30m along the shape */
export function getSmoothedBearing(shape: ShapeData, distM: number, windowM: number = 30): number {
  const d1 = Math.max(0, distM - windowM);
  const d2 = Math.min(shape.totalLengthM, distM + windowM);
  const p1 = getCoordAtDistance(shape, d1);
  const p2 = getCoordAtDistance(shape, d2);
  return calculateBearing(p1[0], p1[1], p2[0], p2[1]);
}

/** Computes the TrainState for an active trip at time t (seconds since midnight) */
export function computeTripKinematics(
  trip: ActiveTrip,
  shape: ShapeData,
  timeSeconds: number,
  delaySeconds: number = 0,
  rollingStockMap: Map<string, string>
): TrainState | null {
  const stops = trip.stops;
  if (!stops || stops.length < 2) return null;

  const effTime = timeSeconds - delaySeconds;
  let currentDistM = stops[0].shapeDistM;
  let speedKmh = 0;
  let nextStopId = stops[1].stopId;

  if (effTime <= stops[0].depTime) {
    // In station dwell at first stop
    currentDistM = stops[0].shapeDistM;
    speedKmh = 0;
    nextStopId = stops[1].stopId;
  } else if (effTime >= stops[stops.length - 1].arrTime) {
    // Arrived at destination
    currentDistM = stops[stops.length - 1].shapeDistM;
    speedKmh = 0;
    nextStopId = stops[stops.length - 1].stopId;
  } else {
    // Search segment
    for (let i = 0; i < stops.length - 1; i++) {
      const s0 = stops[i];
      const s1 = stops[i + 1];

      // In station dwell at intermediate stop
      if (effTime >= s0.arrTime && effTime <= s0.depTime) {
        currentDistM = s0.shapeDistM;
        speedKmh = 0;
        nextStopId = s1.stopId;
        break;
      }

      // In transit between s0 and s1
      if (effTime > s0.depTime && effTime < s1.arrTime) {
        const durationS = Math.max(1, s1.arrTime - s0.depTime);
        const elapsedS = effTime - s0.depTime;
        const progress = Math.min(1.0, Math.max(0.0, elapsedS / durationS));

        const distSpanM = Math.max(0, s1.shapeDistM - s0.shapeDistM);
        currentDistM = s0.shapeDistM + progress * distSpanM;

        // Estimated speed in km/h
        speedKmh = Math.round((distSpanM / durationS) * 3.6);
        nextStopId = s1.stopId;
        break;
      }
    }
  }

  const pos = getCoordAtDistance(shape, currentDistM);
  const brg = getSmoothedBearing(shape, currentDistM);
  const stock = rollingStockMap.get(trip.routeId) || 'MF01';

  return {
    id: trip.tripId,
    line: trip.routeId,
    dir: trip.directionId as 0 | 1,
    pos,
    brg,
    spd: speedKmh,
    delay: delaySeconds,
    next: nextStopId,
    dest: stops[stops.length - 1].stopId,
    conf: delaySeconds !== 0 ? 'rt' : 'sched',
    stock
  };
}
