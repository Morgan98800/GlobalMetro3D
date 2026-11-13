import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  computeLiveStepS,
  getGlbUrlsForFamily,
  isRerLineNum,
  resolveRideRouteKey,
  resolveTrainGlbFamily,
} from '../web/src/paris_ride_view';

describe('paris_ride_view routes, GLB rolling stock mapping, and live sync helpers', () => {
  it('exposes Paris Metro 1-14 and RER A-E routes including Eiffel Tower zones', () => {
    const keys = new Set(ROUTES.map((r) => r.key));
    expect(keys.has('1')).toBe(true);
    expect(keys.has('6')).toBe(true);
    expect(keys.has('14')).toBe(true);
    expect(keys.has('A')).toBe(true);
    expect(keys.has('B')).toBe(true);
    expect(keys.has('C')).toBe(true);
    expect(keys.has('D')).toBe(true);
    expect(keys.has('E')).toBe(true);

    const line6 = ROUTES.find((r) => r.key === '6');
    const rerC = ROUTES.find((r) => r.key === 'C');
    expect(line6?.open.tower).toEqual(['Passy', 'Bir-Hakeim']);
    expect(rerC?.open.tower).toEqual(['Javel', 'Champ de Mars – Tour Eiffel']);
  });

  it('resolves route keys for Metro branches and RER names', () => {
    expect(resolveRideRouteKey('6')).toBe('6');
    expect(resolveRideRouteKey('7', 'Mairie d’Ivry')).toBe('7i');
    expect(resolveRideRouteKey('13', 'Asnières – Gennevilliers Les Courtilles')).toBe('13a');
    expect(resolveRideRouteKey('A')).toBe('A');
    expect(resolveRideRouteKey('RER C')).toBe('C');
    expect(isRerLineNum('B')).toBe(true);
    expect(isRerLineNum('6')).toBe(false);
  });

  it('maps each Paris line to its authentic GLB rolling stock family and asset paths', () => {
    expect(resolveTrainGlbFamily('6')).toBe('pneumatic_generic');
    expect(resolveTrainGlbFamily('14')).toBe('pneumatic_generic');
    expect(resolveTrainGlbFamily('3')).toBe('steel_classic');
    expect(resolveTrainGlbFamily('12')).toBe('steel_classic');
    expect(resolveTrainGlbFamily('A')).toBe('rer_generic_A');
    expect(resolveTrainGlbFamily('RER E')).toBe('rer_generic_E');

    expect(getGlbUrlsForFamily('pneumatic_generic')).toEqual({
      neutral: '/models/train/pneumatic_generic__neutral.glb',
      cab: '/models/train/pneumatic_generic__neutral__cab.glb',
      tail: '/models/train/pneumatic_generic__neutral__tail.glb',
    });
    expect(getGlbUrlsForFamily('rer_generic_C')).toEqual({
      neutral: '/models/train/rer_generic_C__neutral.glb',
      cab: '/models/train/rer_generic_C__cab.glb',
      tail: '/models/train/rer_generic_C__tail.glb',
    });
  });

  it('smoothly advances live train position and clamps cleanly before station arrival', () => {
    const midRun = computeLiveStepS({
      prevFront: 1000,
      targetFront: 1600,
      curS: 1250,
      dir: 1,
      atStop: false,
      speedMps: 14,
      dt: 0.5,
    });
    expect(midRun).toBeGreaterThan(1250);
    expect(midRun).toBeLessThanOrEqual(1600 - 5.5);

    const clampedPreStop = computeLiveStepS({
      prevFront: 1000,
      targetFront: 1600,
      curS: 1598,
      dir: 1,
      atStop: false,
      speedMps: 14,
      dt: 0.5,
    });
    expect(clampedPreStop).toBeLessThan(1600);

    const docked = computeLiveStepS({
      prevFront: 1000,
      targetFront: 1600,
      curS: 1595,
      dir: 1,
      atStop: true,
      speedMps: 0,
      dt: 0.5,
    });
    expect(docked).toBe(1600);
  });
});
