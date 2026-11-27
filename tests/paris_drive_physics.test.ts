import { describe, expect, it } from 'vitest';
import {
  NOTCH_LABELS,
  clampDriveNotch,
  computeSignalAhead,
  computeSpeedLimitKmh,
  computeTrackGradePercent,
  evaluateStopPrecision,
  resolveStockPhysics,
  stepManualTrain,
} from '../web/src/ride/drive_physics';

describe('paris_ride_view manual driving physics & KVB supervision', () => {
  it('clamps notches cleanly and exposes standard RATP labels', () => {
    expect(clampDriveNotch(-10)).toBe(-4);
    expect(clampDriveNotch(10)).toBe(3);
    expect(clampDriveNotch(1.4)).toBe(1);
    expect(NOTCH_LABELS[-4]).toBe('FU');
    expect(NOTCH_LABELS[0]).toBe('0');
    expect(NOTCH_LABELS[3]).toBe('T3');
  });

  it('allows free door opening and traction at any time without locking the train', () => {
    const res = stepManualTrain({
      s: 400,
      v: 0,
      dir: 1,
      dt: 0.5,
      notch: 3,
      door: 0.8,
      targetFront: 800,
      isRer: false,
      isPneumatic: true,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: false,
    });
    expect(res.tractionBlockedByDoors).toBe(false);
    expect(res.doorAllowed).toBe(true);
    expect(res.v).toBeGreaterThan(0);
    expect(res.s).toBeGreaterThan(400);
  });

  it('accelerates faster on pneumatic metro than steel metro', () => {
    const base = {
      s: 100,
      v: 0,
      dir: 1 as const,
      dt: 1.0,
      notch: 3 as const,
      door: 0,
      targetFront: 1000,
      isRer: false,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: false,
    };
    const pneu = stepManualTrain({ ...base, isPneumatic: true });
    const steel = stepManualTrain({ ...base, isPneumatic: false });
    expect(pneu.v).toBeGreaterThan(steel.v);
    expect(pneu.tractionBlockedByDoors).toBe(false);
  });

  it('warns above recommended speed without forcing an automatic KVB stop and allows manual FU braking', () => {
    const limit = computeSpeedLimitKmh({
      isRer: false,
      isOpenAir: false,
      inCurve: false,
      distToStopM: 300,
    });
    expect(limit).toBe(70);

    // Overspeed > limit + 5 (85 km/h) -> advisory warning only, still accelerates freely up to 95 km/h
    const overspeed = stepManualTrain({
      s: 200,
      v: 85 / 3.6,
      dir: 1,
      dt: 0.5,
      notch: 3,
      door: 0,
      targetFront: 900,
      isRer: false,
      isPneumatic: false,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: false,
    });
    expect(overspeed.kvbStatus).toBe('warn');
    expect(overspeed.kvbBrakeLatched).toBe(false);
    expect(overspeed.v).toBeGreaterThan(85 / 3.6);

    // Manual FU emergency brake slows the train rapidly when requested by the driver
    const manualFu = stepManualTrain({
      s: 220,
      v: 85 / 3.6,
      dir: 1,
      dt: 0.5,
      notch: -4,
      door: 0,
      targetFront: 900,
      isRer: false,
      isPneumatic: false,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: false,
    });
    expect(manualFu.v).toBeLessThan(85 / 3.6);
  });

  it('grades station stopping precision and flags overrun cleanly', () => {
    expect(evaluateStopPrecision(1.1)?.grade).toBe('perfect');
    expect(evaluateStopPrecision(-4.5)?.grade).toBe('good');
    expect(evaluateStopPrecision(11.0)?.grade).toBe('ok');
    expect(evaluateStopPrecision(24.0)).toBeNull();

    const stoppedAtMark = stepManualTrain({
      s: 799.2,
      v: 0.1,
      dir: 1,
      dt: 0.2,
      notch: -2,
      door: 0,
      targetFront: 800,
      isRer: false,
      isPneumatic: true,
      isOpenAir: true,
      inCurve: false,
      kvbBrakeLatched: false,
    });
    expect(stoppedAtMark.doorAllowed).toBe(true);
    expect(stoppedAtMark.overranStation).toBe(false);

    const overran = stepManualTrain({
      s: 822,
      v: 6,
      dir: 1,
      dt: 0.1,
      notch: 0,
      door: 0,
      targetFront: 800,
      isRer: false,
      isPneumatic: true,
      isOpenAir: true,
      inCurve: false,
      kvbBrakeLatched: false,
    });
    expect(overran.overranStation).toBe(true);
  });

  it('resolves distinct rolling-stock physics profiles for Sprague, RER, pneumatic, modern steel, and classic steel', () => {
    const sprague = resolveStockPhysics('sprague_1930', false, true);
    expect(sprague.accelMult).toBe(0.82);
    expect(sprague.brakeMult).toBe(0.72);
    expect(sprague.maxSpeedKmh).toBe(62);
    expect(sprague.rollingDrag).toBe(0.055);
    expect(sprague.hasKvb).toBe(false);
    expect(sprague.stoppingDistanceFactor).toBe(1.35);

    const rerStd = resolveStockPhysics('rer_z2n', true, false);
    expect(rerStd.accelMult).toBe(0.88);
    expect(rerStd.brakeMult).toBe(0.76);
    expect(rerStd.maxSpeedKmh).toBe(95);
    expect(rerStd.rollingDrag).toBe(0.036);
    expect(rerStd.hasKvb).toBe(true);
    expect(rerStd.stoppingDistanceFactor).toBe(1.55);

    const rerNg = resolveStockPhysics('rer_ng', true, false);
    expect(rerNg.maxSpeedKmh).toBe(100);

    const pneu = resolveStockPhysics('mp89', false, true);
    expect(pneu.accelMult).toBe(1.15);
    expect(pneu.brakeMult).toBe(1.12);
    expect(pneu.maxSpeedKmh).toBe(72);
    expect(pneu.rollingDrag).toBe(0.048);
    expect(pneu.stoppingDistanceFactor).toBe(0.9);

    const modernSteel = resolveStockPhysics('mf01', false, false);
    expect(modernSteel.accelMult).toBe(1.04);
    expect(modernSteel.brakeMult).toBe(1.05);
    expect(modernSteel.maxSpeedKmh).toBe(72);
    expect(modernSteel.rollingDrag).toBe(0.042);
    expect(modernSteel.stoppingDistanceFactor).toBe(1.0);

    const classicSteel = resolveStockPhysics('mf67', false, false);
    expect(classicSteel.accelMult).toBe(0.96);
    expect(classicSteel.brakeMult).toBe(0.94);
    expect(classicSteel.maxSpeedKmh).toBe(70);
    expect(classicSteel.rollingDrag).toBe(0.046);
    expect(classicSteel.stoppingDistanceFactor).toBe(1.08);
  });

  it('computes deterministic smooth track grade within [-3.2%, +3.2%] and RATP signal aspects + TIV', () => {
    for (let s = 0; s <= 3000; s += 137) {
      const ug = computeTrackGradePercent(s, false);
      const oa = computeTrackGradePercent(s, true);
      expect(ug).toBeGreaterThanOrEqual(-3.2);
      expect(ug).toBeLessThanOrEqual(3.2);
      expect(oa).toBeGreaterThanOrEqual(-3.2);
      expect(oa).toBeLessThanOrEqual(3.2);
      // 1-decimal rounding
      expect(Math.round(oa * 10)).toBeCloseTo(oa * 10, 6);
    }
    // Deterministic for same input
    expect(computeTrackGradePercent(640, true)).toBe(computeTrackGradePercent(640, true));

    // VL (green) in clear underground tunnel far from station
    const vl = computeSignalAhead({
      distToStopM: 320,
      limitKmh: 70,
      isOpenAir: false,
      isRer: false,
      inCurve: false,
    });
    expect(vl.aspect).toBe('VL');
    expect(vl.tivKmh).toBeNull();
    expect(vl.nextSignalDistM).toBeGreaterThan(0);
    expect(vl.nextSignalDistM).toBeLessThanOrEqual(72);

    // A (yellow) with TIV 55 on metro viaduct / curve
    const openAirA = computeSignalAhead({
      distToStopM: 250,
      limitKmh: 55,
      isOpenAir: true,
      isRer: false,
      inCurve: false,
    });
    expect(openAirA.aspect).toBe('A');
    expect(openAirA.tivKmh).toBe(55);

    // A (yellow) with TIV 45 near station approach
    const stationApproach = computeSignalAhead({
      distToStopM: 70,
      limitKmh: 45,
      isOpenAir: false,
      isRer: false,
      inCurve: false,
    });
    expect(stationApproach.aspect).toBe('A');
    expect(stationApproach.tivKmh).toBe(45);
    expect(stationApproach.nextSignalDistM).toBe(70);

    // RER TIV 65 in curve & TIV 50 approaching station
    const rerCurve = computeSignalAhead({
      distToStopM: 300,
      limitKmh: 65,
      isOpenAir: false,
      isRer: true,
      inCurve: true,
    });
    expect(rerCurve.aspect).toBe('A');
    expect(rerCurve.tivKmh).toBe(65);

    // S (red) when lead train is closer than 110m
    const redSignal = computeSignalAhead({
      distToStopM: 400,
      limitKmh: 70,
      isOpenAir: false,
      isRer: false,
      inCurve: false,
      leadTrainGapM: 65,
    });
    expect(redSignal.aspect).toBe('S');
    expect(redSignal.nextSignalDistM).toBeLessThan(65);
  });

  it('applies grade gravity, skips KVB e-brake on Sprague 1930, and reports jolt penalties', () => {
    const common = {
      s: 300,
      v: 10,
      dir: 1 as const,
      dt: 0.5,
      notch: 2 as const,
      door: 0,
      targetFront: 1000,
      isRer: false,
      isPneumatic: false,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: false,
      stockId: 'mf01',
    };

    const flat = stepManualTrain({ ...common, gradePercent: 0 });
    const uphill = stepManualTrain({ ...common, gradePercent: 3.0 });
    const downhill = stepManualTrain({ ...common, gradePercent: -3.0 });
    expect(uphill.v).toBeLessThan(flat.v);
    expect(downhill.v).toBeGreaterThan(flat.v);
    expect(uphill.gradePercent).toBe(3.0);

    // Stopped train on steep uphill grade does not roll backward below 0
    const stoppedUphill = stepManualTrain({
      ...common,
      v: 0,
      notch: 0,
      gradePercent: 3.2,
    });
    expect(stoppedUphill.v).toBe(0);

    // Sprague 1930: no KVB emergency brake latch even far above limit
    const spragueOverspeed = stepManualTrain({
      s: 200,
      v: 68 / 3.6,
      dir: 1,
      dt: 0.5,
      notch: 0,
      door: 0,
      targetFront: 900,
      isRer: false,
      isPneumatic: true,
      isOpenAir: true,
      inCurve: false,
      kvbBrakeLatched: false,
      stockId: 'sprague_1930',
    });
    expect(spragueOverspeed.stockProfile.hasKvb).toBe(false);
    expect(spragueOverspeed.kvbBrakeLatched).toBe(false);
    expect(spragueOverspeed.kvbStatus).toBe('warn');

    // Jolt penalty triggers on FU at speed or sharp acceleration delta
    const smooth = stepManualTrain({ ...common, prevAccel: flat.accel });
    expect(smooth.joltPenalty).toBe(0);

    const emergencyJolt = stepManualTrain({
      ...common,
      notch: -4,
      v: 12,
      prevAccel: 0.9,
    });
    expect(emergencyJolt.joltPenalty).toBeGreaterThan(0);

    const sharpDeltaJolt = stepManualTrain({
      ...common,
      notch: 3,
      v: 5,
      prevAccel: -1.5,
    });
    expect(sharpDeltaJolt.joltPenalty).toBeGreaterThan(0);
  });
});
