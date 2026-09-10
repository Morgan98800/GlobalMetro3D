import type { Shape } from './shapes_loader';
import { coordAtDistance } from './shapes_loader';
import type { TrainMarker } from '../map/trains_layer';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function calculateBearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dlambda = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(dlambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  const brg = Math.atan2(y, x) * RAD_TO_DEG;
  return Math.round((brg + 360) % 360);
}

export function getCoordAtDistance(shape: Shape, distM: number): [number, number] {
  const pt = coordAtDistance(shape, distM);
  return [Number(pt[0].toFixed(5)), Number(pt[1].toFixed(5))];
}

export function getSmoothedBearing(shape: Shape, distM: number, windowM: number = 30): number {
  const d1 = Math.max(0, distM - windowM);
  const d2 = Math.min(shape.length, distM + windowM);
  const p1 = getCoordAtDistance(shape, d1);
  const p2 = getCoordAtDistance(shape, d2);
  return calculateBearing(p1[0], p1[1], p2[0], p2[1]);
}


export interface TripData {
  id: string;
  line: string;
  dir: number;
  shapeId: string;
  t0: number;
  t1: number;
  destName: string;
  stops: Array<[number, number, number, string]>; // [arr, dep, distM, stopName]
}

export function computeTripKinematics(
  trip: TripData,
  shape: Shape,
  timeSeconds: number,
  delaySeconds: number,
  lineColor: string,
  lineTextColor: string,
  lineShortName: string,
  elevationOffset: number = 0
): TrainMarker | null {
  const stops = trip.stops;
  if (!stops || stops.length < 2) return null;

  const effTime = timeSeconds - delaySeconds;
  let currentDistM = stops[0][2];
  let speedKmh = 0;
  let vMps = 0;
  let nextStationName = stops[1][3];

  if (effTime <= stops[0][1]) {
    currentDistM = stops[0][2];
    speedKmh = 0;
    vMps = 0;
    nextStationName = stops[1][3];
  } else if (effTime >= stops[stops.length - 1][0]) {
    currentDistM = stops[stops.length - 1][2];
    speedKmh = 0;
    vMps = 0;
    nextStationName = stops[stops.length - 1][3];
  } else {
    for (let i = 0; i < stops.length - 1; i++) {
      const [arr0, dep0, dist0] = stops[i];
      const [arr1, dep1, dist1, name1] = stops[i + 1];

      // Dwell at station
      if (effTime >= arr0 && effTime <= dep0) {
        currentDistM = dist0;
        speedKmh = 0;
        vMps = 0;
        nextStationName = name1;
        break;
      }

      // In transit between station arr0/dep0 and arr1/dep1
      if (effTime > dep0 && effTime < arr1) {
        const durationS = Math.max(1, arr1 - dep0);
        const elapsedS = effTime - dep0;
        const tau = Math.min(1.0, Math.max(0.0, elapsedS / durationS));
        const distSpanM = Math.max(0, dist1 - dist0);

        // Trapezoidal profile: 25% acceleration, 50% cruise, 25% braking
        const k = 0.25;
        let progress = 0;
        const vCruise = distSpanM / ((1 - k) * durationS);

        if (tau < k) {
          // Acceleration phase
          progress = 0.5 * (tau * tau) / (k * (1 - k));
          vMps = vCruise * (tau / k);
        } else if (tau <= 1 - k) {
          // Cruise phase
          progress = (tau - 0.5 * k) / (1 - k);
          vMps = vCruise;
        } else {
          // Braking / deceleration phase
          const u = 1.0 - tau;
          progress = 1.0 - 0.5 * (u * u) / (k * (1 - k));
          vMps = vCruise * (u / k);
        }

        currentDistM = dist0 + Math.min(1.0, Math.max(0.0, progress)) * distSpanM;
        speedKmh = Math.round(Math.min(85, Math.max(0, vMps * 3.6)));
        nextStationName = name1;
        break;
      }
    }
  }

  const pos = getCoordAtDistance(shape, currentDistM);
  const brg = getSmoothedBearing(shape, currentDistM);

  return {
    id: trip.id,
    line: trip.line,
    lineName: lineShortName,
    colorHex: lineColor,
    textColorHex: lineTextColor,
    pos,
    elevation: elevationOffset,
    brg,
    spd: speedKmh,
    speedMps: vMps,
    delay: delaySeconds,
    dest: trip.destName,
    next: nextStationName,
    conf: (delaySeconds !== 0 ? 'bracketed' : 'scheduled') as any,
    shapeId: trip.shapeId,
    currentDistM,
    direction: (trip.dir === 0 ? 0 : 1) as 0 | 1
  };
}
