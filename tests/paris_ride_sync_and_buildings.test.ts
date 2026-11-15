import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  computeLiveStepS,
  getGlbUrlsForFamily,
  isRerLineNum,
  resolveParisStockSpec,
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

  it('resolves Paris rolling stock specs across automatic, driven, RER, and Sprague modes', () => {
    const mp14 = resolveParisStockSpec('14', false);
    expect(mp14.id).toBe('mp14_ca');
    expect(mp14.driverless).toBe(true);
    expect(mp14.hasPsd).toBe(true);
    expect(mp14.boa).toBe(true);

    const mp05 = resolveParisStockSpec('1', false);
    expect(mp05.id).toBe('mp05_ca');
    expect(mp05.driverless).toBe(true);
    expect(mp05.hasPsd).toBe(true);

    const mf01 = resolveParisStockSpec('9', false);
    expect(mf01.id).toBe('mf01');
    expect(mf01.driverless).toBe(false);
    expect(mf01.hasPsd).toBe(false);
    expect(mf01.boa).toBe(true);

    const mf67 = resolveParisStockSpec('12', false);
    expect(mf67.id).toBe('mf67');
    expect(mf67.driverless).toBe(false);
    expect(mf67.boa).toBe(false);

    const rerA = resolveParisStockSpec('A', false);
    expect(rerA.driverless).toBe(false);
    expect(rerA.boa).toBe(false);

    const rerE = resolveParisStockSpec('RER E', false);
    expect(rerE.label).toBe('RER NG');
    expect(rerE.boa).toBe(true);

    const sprague = resolveParisStockSpec('14', true);
    expect(sprague.id).toBe('sprague_1930');
    expect(sprague.driverless).toBe(false);
    expect(sprague.hasPsd).toBe(false);
    expect(sprague.boa).toBe(false);
  });
});
