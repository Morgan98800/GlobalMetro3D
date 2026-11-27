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

export type SignalAspect = 'VL' | 'A' | 'S';

export interface StockPhysicsProfile {
  id: string;
  label: string;
  accelMult: number;
  brakeMult: number;
  maxSpeedKmh: number;
  rollingDrag: number;
  hasKvb: boolean;
  stoppingDistanceFactor: number;
}

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
  stockId?: string;
  prevAccel?: number;
  gradePercent?: number;
  leadTrainGapM?: number | null;
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
  gradePercent: number;
  signalAspect: SignalAspect;
  nextSignalDistM: number;
  tivKmh: number | null;
  joltPenalty: number;
  stockProfile: StockPhysicsProfile;
}

export function clampDriveNotch(n: number): DriveNotch {
  const rounded = Math.round(n);
  if (rounded <= -4) return -4;
  if (rounded >= 3) return 3;
  return rounded as DriveNotch;
}

/**
 * Resolves rolling-stock traction, braking, drag, and KVB supervision profile.
 */
export function resolveStockPhysics(
  stockId?: string,
  isRer = false,
  isPneumatic = false
): StockPhysicsProfile {
  const normalized = (stockId ?? '').trim().toLowerCase();

  if (normalized === 'sprague_1930' || normalized.includes('sprague')) {
    return {
      id: normalized || 'sprague_1930',
      label: 'Sprague-Thomson',
      accelMult: 0.82,
      brakeMult: 0.72,
      maxSpeedKmh: 62,
      rollingDrag: 0.055,
      hasKvb: false,
      stoppingDistanceFactor: 1.35,
    };
  }

  if (isRer || normalized.startsWith('rer_')) {
    const isRerNg = normalized === 'rer_ng';
    return {
      id: normalized || 'rer',
      label: isRerNg ? 'RER NG' : normalized ? normalized.toUpperCase().replace(/_/g, ' ') : 'RER',
      accelMult: 0.88,
      brakeMult: 0.76,
      maxSpeedKmh: isRerNg ? 100 : 95,
      rollingDrag: 0.036,
      hasKvb: true,
      stoppingDistanceFactor: 1.55,
    };
  }

  if (isPneumatic || normalized.startsWith('mp')) {
    return {
      id: normalized || 'mp',
      label: normalized ? normalized.toUpperCase().replace(/_/g, ' ') : 'Métro Pneu',
      accelMult: 1.15,
      brakeMult: 1.12,
      maxSpeedKmh: 72,
      rollingDrag: 0.048,
      hasKvb: true,
      stoppingDistanceFactor: 0.9,
    };
  }

  if (normalized === 'mf01' || normalized === 'mf19') {
    return {
      id: normalized,
      label: normalized === 'mf01' ? 'MF 01' : 'MF 19',
      accelMult: 1.04,
      brakeMult: 1.05,
      maxSpeedKmh: 72,
      rollingDrag: 0.042,
      hasKvb: true,
      stoppingDistanceFactor: 1.0,
    };
  }

  return {
    id: normalized || 'mf_classic',
    label: normalized ? normalized.toUpperCase().replace(/_/g, ' ') : 'Métro Fer',
    accelMult: 0.96,
    brakeMult: 0.94,
    maxSpeedKmh: 70,
    rollingDrag: 0.046,
    hasKvb: true,
    stoppingDistanceFactor: 1.08,
  };
}

/**
 * Deterministic smooth track grade profile in percent (-3.2% to +3.2%),
 * with slightly stronger slopes near viaduct / open-air portal transitions.
 */
export function computeTrackGradePercent(s: number, isOpenAir: boolean): number {
  const raw =
    Math.sin(s * 0.0031) * 1.45 +
    Math.sin(s * 0.0079 + 1.1) * 0.75 +
    Math.cos(s * 0.0153 - 0.6) * 0.35;
  const scale = isOpenAir ? 1.25 : 0.92;
  const clamped = Math.max(-3.2, Math.min(3.2, raw * scale));
  const rounded = Math.round(clamped * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
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
 * Computes RATP/SNCF lateral block signal aspect (VL / A / S), distance to next signal,
 * and active TIV (Tableau Indicateur de Vitesse) restriction board ahead.
 */
export function computeSignalAhead(params: {
  distToStopM: number | null;
  limitKmh: number;
  isOpenAir: boolean;
  isRer: boolean;
  inCurve: boolean;
  leadTrainGapM?: number | null;
}): { aspect: SignalAspect; nextSignalDistM: number; tivKmh: number | null } {
  const { distToStopM, limitKmh, isOpenAir, isRer, inCurve, leadTrainGapM } = params;

  const hasRedLeadGap =
    leadTrainGapM !== null && leadTrainGapM !== undefined && leadTrainGapM < 110;
  const cautionWindow = isRer ? 135 : 95;
  const nearStation = distToStopM !== null && distToStopM > 0 && distToStopM < cautionWindow;

  let aspect: SignalAspect = 'VL';
  if (hasRedLeadGap) {
    aspect = 'S';
  } else if (nearStation || inCurve || isOpenAir) {
    aspect = 'A';
  }

  let nextSignalDistM = 72;
  if (distToStopM !== null && distToStopM > 0) {
    if (distToStopM <= 72) {
      nextSignalDistM = Math.max(1, Math.round(distToStopM));
    } else {
      const rem = distToStopM % 72;
      nextSignalDistM = rem < 1 ? 72 : Math.round(rem);
    }
  }
  if (hasRedLeadGap) {
    nextSignalDistM = Math.max(5, Math.min(nextSignalDistM, Math.round(leadTrainGapM * 0.55)));
  }

  const baseLineLimit = isRer ? 90 : 70;
  let tivKmh: number | null = null;
  if (limitKmh < baseLineLimit) {
    tivKmh = limitKmh;
  } else if (distToStopM !== null && distToStopM > 0 && distToStopM < (isRer ? 180 : 130)) {
    tivKmh = isRer ? 50 : 45;
  }

  return { aspect, nextSignalDistM, tivKmh };
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
 * Advances manual driving physics by `dt` seconds with door interlock, KVB supervision,
 * rolling-stock profile dynamics, track grade gravity, and passenger comfort telemetry.
 */
export function stepManualTrain(input: ManualStepInput): ManualStepResult {
  const { s, v, dir, dt, notch, targetFront, isRer, isPneumatic, isOpenAir, inCurve } = input;

  const stockProfile = resolveStockPhysics(input.stockId, isRer, isPneumatic);

  const distBefore = (targetFront - s) * dir;
  const limitKmh = computeSpeedLimitKmh({
    isRer,
    isOpenAir,
    inCurve,
    distToStopM: distBefore,
  });

  const speedKmh = v * 3.6;
  // Free driving latitude: never auto-latch KVB emergency braking; only surface a gentle
  // advisory warning when exceeding the recommended line/zone speed.
  const kvbBrakeLatched = false;
  const kvbStatus: KvbStatus = speedKmh > limitKmh + 5 ? 'warn' : 'ok';

  const tractionBlockedByDoors = false;
  const useStockProfileDynamics = input.stockId !== undefined;
  const legacyMult = isPneumatic ? 1.12 : 1.0;

  let baseAccel: number;
  if (notch === -4) {
    baseAccel = BASE_ACCELS[-4] * (useStockProfileDynamics ? stockProfile.brakeMult : 1.0);
  } else if (notch === 0) {
    const drag = useStockProfileDynamics ? stockProfile.rollingDrag : 0.045;
    baseAccel = v > 0.001 ? -(drag + 0.00085 * v * v) : 0;
  } else if (notch > 0) {
    baseAccel =
      BASE_ACCELS[notch] * (useStockProfileDynamics ? stockProfile.accelMult : legacyMult);
  } else {
    baseAccel =
      BASE_ACCELS[notch] * (useStockProfileDynamics ? stockProfile.brakeMult : legacyMult);
  }

  const hasExplicitGrade =
    typeof input.gradePercent === 'number' && Number.isFinite(input.gradePercent);
  const gradePercent = hasExplicitGrade ? input.gradePercent! : 0;
  const shouldApplyGrade = hasExplicitGrade && (v > 0.001 || notch > 0);
  const gradeAccel = shouldApplyGrade ? -9.81 * (gradePercent / 100) : 0;

  const totalAccel = baseAccel + gradeAccel;
  const hardCapKmh = isRer ? 130 : 95;
  const hardCapMps = hardCapKmh / 3.6;
  const nextV = Math.max(0, Math.min(hardCapMps, v + totalAccel * dt));
  const avgV = 0.5 * (v + nextV);
  const nextS = s + dir * avgV * dt;
  const distToStopM = (targetFront - nextS) * dir;

  const appliedAccel = totalAccel;
  const rawEffort = nextV <= 0.001 && appliedAccel <= 0 ? 0 : appliedAccel / 1.8;
  const effort = Math.max(-1, Math.min(1, rawEffort));

  let joltPenalty = 0;
  if (notch === -4 && v > 2) {
    joltPenalty += Math.min(12, 3.5 + v * 0.25);
  }
  if (typeof input.prevAccel === 'number' && Number.isFinite(input.prevAccel)) {
    const deltaAccel = Math.abs(appliedAccel - input.prevAccel);
    if (deltaAccel > 1.7) {
      joltPenalty += Math.min(8, (deltaAccel - 1.7) * 3.0);
    }
  }
  joltPenalty = Math.round(joltPenalty * 100) / 100;

  const signal = computeSignalAhead({
    distToStopM,
    limitKmh,
    isOpenAir,
    isRer,
    inCurve,
    leadTrainGapM: input.leadTrainGapM,
  });

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
    doorAllowed: true,
    overranStation: distToStopM < -16.5,
    gradePercent,
    signalAspect: signal.aspect,
    nextSignalDistM: signal.nextSignalDistM,
    tivKmh: signal.tivKmh,
    joltPenalty,
    stockProfile,
  };
}
