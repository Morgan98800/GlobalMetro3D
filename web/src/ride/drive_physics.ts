/**
 * Pure manual driving physics, KVB speed supervision, and station stop grading
 * for Paris Metro & RER "À bord 3D" driving mode.
 */

export type DriveNotch = -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3;

export const DRIVE_NOTCHES: readonly DriveNotch[] = [-4, -3, -2, -1, 0, 1, 2, 3];

export const NOTCH_LABELS: Record<DriveNotch, string> = {
  [-4]: 'FU',
  [-3]: 'F3',
  [-2]: 'F2',
  [-1]: 'F1',
  0: '0',
  1: 'T1',
  2: 'T2',
  3: 'T3',
};

const BASE_ACCELS: Record<DriveNotch, number> = {
  [-4]: -3.2,
  [-3]: -1.95,
  [-2]: -1.25,
  [-1]: -0.65,
  0: 0,
  1: 0.52,
  2: 0.94,
  3: 1.38,
};

export type KvbStatus = 'ok' | 'warn' | 'ebrake';

export interface StopEvaluation {
  grade: 'perfect' | 'good' | 'ok';
  label: string;
  offsetM: number;
}

export interface ManualStepInput {
  s: number;
  v: number;
  dir: 1 | -1;
  dt: number;
  notch: DriveNotch;
  door: number;
  targetFront: number;
  isRer: boolean;
  isPneumatic: boolean;
  isOpenAir: boolean;
  inCurve: boolean;
  kvbBrakeLatched: boolean;
}

export interface ManualStepResult {
  s: number;
  v: number;
  accel: number;
  effort: number;
  limitKmh: number;
  kvbStatus: KvbStatus;
  kvbBrakeLatched: boolean;
  tractionBlockedByDoors: boolean;
  distToStopM: number;
  doorAllowed: boolean;
  overranStation: boolean;
}

export function clampDriveNotch(n: number): DriveNotch {
  const rounded = Math.round(n);
  if (rounded <= -4) return -4;
  if (rounded >= 3) return 3;
  return rounded as DriveNotch;
}

/**
 * Computes active KVB / signal speed limit (km/h) based on line type,
 * viaduct/curve geometry, and distance remaining to the next stopping mark.
 */
export function computeSpeedLimitKmh(params: {
  isRer: boolean;
  isOpenAir: boolean;
  inCurve: boolean;
  distToStopM: number | null;
}): number {
  const { isRer, isOpenAir, inCurve, distToStopM } = params;
  let limit = isRer ? 90 : 70;
  if (isOpenAir || inCurve) {
    limit = Math.min(limit, isRer ? 65 : 55);
  }
  const approachWindow = isRer ? 115 : 85;
  if (distToStopM !== null && distToStopM > -15 && distToStopM < approachWindow) {
    limit = Math.min(limit, isRer ? 50 : 45);
  }
  return limit;
}

/**
 * Grades station stopping alignment relative to the "TÊTE DE TRAIN" mark (offset in meters).
 */
export function evaluateStopPrecision(offsetM: number): StopEvaluation | null {
  const abs = Math.abs(offsetM);
  if (abs <= 2.2) return { grade: 'perfect', label: 'Arrêt parfait', offsetM };
  if (abs <= 6.5) return { grade: 'good', label: 'Bon arrêt', offsetM };
  if (abs <= 16.0) return { grade: 'ok', label: 'Arrêt à quai', offsetM };
  return null;
}

/**
 * Advances manual driving physics by `dt` seconds with door interlock and KVB supervision.
 */
export function stepManualTrain(input: ManualStepInput): ManualStepResult {
  const {
    s,
    v,
    dir,
    dt,
    notch,
    door,
    targetFront,
    isRer,
    isPneumatic,
    isOpenAir,
    inCurve,
    kvbBrakeLatched: prevLatched,
  } = input;

  const distBefore = (targetFront - s) * dir;
  const limitKmh = computeSpeedLimitKmh({
    isRer,
    isOpenAir,
    inCurve,
    distToStopM: distBefore,
  });

  const speedKmh = v * 3.6;
  let kvbBrakeLatched = prevLatched;
  if (speedKmh > limitKmh + 12) {
    kvbBrakeLatched = true;
  } else if (kvbBrakeLatched && speedKmh <= Math.max(0, limitKmh - 8)) {
    kvbBrakeLatched = false;
  }

  let kvbStatus: KvbStatus = 'ok';
  if (kvbBrakeLatched) {
    kvbStatus = 'ebrake';
  } else if (speedKmh > limitKmh + 4) {
    kvbStatus = 'warn';
  }

  const doorsOpen = door > 0.04;
  const tractionBlockedByDoors = doorsOpen && notch > 0;
  const mult = isPneumatic ? 1.12 : 1.0;

  let accel: number;
  if (kvbBrakeLatched) {
    accel = BASE_ACCELS[-4];
  } else if (tractionBlockedByDoors) {
    accel = -1.4;
  } else if (notch === -4) {
    accel = BASE_ACCELS[-4];
  } else if (notch === 0) {
    accel = v > 0.001 ? -(0.045 + 0.00085 * v * v) : 0;
  } else {
    accel = BASE_ACCELS[notch] * mult;
  }

  const hardCapMps = (limitKmh + 18) / 3.6;
  const nextV = Math.max(0, Math.min(hardCapMps, v + accel * dt));
  const avgV = 0.5 * (v + nextV);
  const nextS = s + dir * avgV * dt;
  const distToStopM = (targetFront - nextS) * dir;

  const appliedAccel = kvbBrakeLatched ? BASE_ACCELS[-4] : tractionBlockedByDoors ? -1.4 : accel;
  const rawEffort = nextV <= 0.001 && appliedAccel <= 0 ? 0 : appliedAccel / 1.8;
  const effort = Math.max(-1, Math.min(1, rawEffort));

  return {
    s: nextS,
    v: nextV,
    accel: appliedAccel,
    effort,
    limitKmh,
    kvbStatus,
    kvbBrakeLatched,
    tractionBlockedByDoors,
    distToStopM,
    doorAllowed: nextV < 0.25 && Math.abs(distToStopM) <= 16,
    overranStation: distToStopM < -16.5,
  };
}
