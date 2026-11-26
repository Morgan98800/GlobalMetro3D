import { describe, expect, it } from 'vitest';
import {
  NOTCH_LABELS,
  clampDriveNotch,
  computeSpeedLimitKmh,
  evaluateStopPrecision,
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

  it('blocks positive traction when doors remain open and holds train stationary', () => {
    const res = stepManualTrain({
      s: 400,
      v: 0,
      dir: 1,
      dt: 0.25,
      notch: 3,
      door: 0.8,
      targetFront: 800,
      isRer: false,
      isPneumatic: true,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: false,
    });
    expect(res.tractionBlockedByDoors).toBe(true);
    expect(res.v).toBe(0);
    expect(res.s).toBe(400);
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

  it('triggers KVB warning & emergency brake overspeed latch and releases safely below threshold', () => {
    const limit = computeSpeedLimitKmh({
      isRer: false,
      isOpenAir: false,
      inCurve: false,
      distToStopM: 300,
    });
    expect(limit).toBe(70);

    // Overspeed > limit + 12 (82 km/h) -> KVB emergency brake latch
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
    expect(overspeed.kvbStatus).toBe('ebrake');
    expect(overspeed.kvbBrakeLatched).toBe(true);
    expect(overspeed.v).toBeLessThan(85 / 3.6);

    // Still latched while speed is above limit - 8 (62 km/h)
    const stillLatched = stepManualTrain({
      s: 220,
      v: 66 / 3.6,
      dir: 1,
      dt: 0.5,
      notch: 2,
      door: 0,
      targetFront: 900,
      isRer: false,
      isPneumatic: false,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: true,
    });
    expect(stillLatched.kvbBrakeLatched).toBe(true);

    // Released once <= 62 km/h
    const released = stepManualTrain({
      s: 230,
      v: 60 / 3.6,
      dir: 1,
      dt: 0.5,
      notch: 1,
      door: 0,
      targetFront: 900,
      isRer: false,
      isPneumatic: false,
      isOpenAir: false,
      inCurve: false,
      kvbBrakeLatched: true,
    });
    expect(released.kvbBrakeLatched).toBe(false);
    expect(released.kvbStatus).toBe('ok');
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
});
