import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  computeLiveStepS,
  formatSielWaitTime,
  getGlbUrlsForFamily,
  isRerLineNum,
  resolveParisStockSpec,
  resolveRideRouteKey,
  resolveTrainGlbFamily,
  selectDualSielBoards,
  shouldUseDetailedCarMesh,
} from '../web/src/paris_ride_view';
import { computeSubsurfaceMix } from '@core/ui/map/maplibre';
import { getSubsurfacePaints } from '@core/ui/map/vector_style';

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

    const line1 = ROUTES.find((r) => r.key === '1');
    const line5 = ROUTES.find((r) => r.key === '5');
    const line6 = ROUTES.find((r) => r.key === '6');
    const rerA = ROUTES.find((r) => r.key === 'A');
    const rerC = ROUTES.find((r) => r.key === 'C');
    expect(line1?.open.bastilleColumn).toBe('Bastille');
    expect(line1?.open.grandeArche).toBe('Pont de Neuilly');
    expect(line5?.open.austerlitzArch).toEqual(['Quai de la Rapée', 'Gare d’Austerlitz']);
    expect(line6?.open.tower).toEqual(['Passy', 'Bir-Hakeim']);
    expect(rerA?.open.grandeArche).toBe('Nanterre-Préfecture');
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

  it('formats live dual-direction SIEL boards, detailed Quai 3D doors, and subsurface map translucency', () => {
    expect(formatSielWaitTime({ atStop: true, waitSeconds: 0 })).toBe('À quai');
    expect(formatSielWaitTime({ atStop: false, waitSeconds: 18 })).toBe('À quai');
    expect(formatSielWaitTime({ atStop: false, waitSeconds: 45 })).toBe('< 1 min');
    expect(formatSielWaitTime({ atStop: false, waitSeconds: 230 })).toBe('4 min');

    const boards = selectDualSielBoards({
      departures: [
        {
          tripId: 't1',
          lineId: 'L6',
          lineShortName: '6',
          colorHex: '#6ECA97',
          textColorHex: '#111',
          direction: 0,
          destName: 'Nation',
          arrivalSeconds: 300,
          waitSeconds: 0,
          waitMinutes: 0,
          atStop: true,
          confidence: 'measured',
        },
        {
          tripId: 't2',
          lineId: 'L6',
          lineShortName: '6',
          colorHex: '#6ECA97',
          textColorHex: '#111',
          direction: 0,
          destName: 'Nation',
          arrivalSeconds: 540,
          waitSeconds: 240,
          waitMinutes: 4,
          atStop: false,
          confidence: 'measured',
        },
        {
          tripId: 't3',
          lineId: 'L6',
          lineShortName: '6',
          colorHex: '#6ECA97',
          textColorHex: '#111',
          direction: 1,
          destName: 'Charles de Gaulle – Étoile',
          arrivalSeconds: 420,
          waitSeconds: 120,
          waitMinutes: 2,
          atStop: false,
          confidence: 'scheduled',
        },
      ],
      lineNum: '6',
      posDest: 'Nation',
      negDest: 'Charles de Gaulle – Étoile',
      simDir: 1,
      simState: 'dwell',
      simKmh: 0,
      counterEtaText: '3 min',
    });

    expect(boards.pos.rows[0].eta).toBe('À quai');
    expect(boards.pos.rows[1].eta).toBe('4 min');
    expect(boards.neg.rows[0].eta).toBe('2 min');
    expect(boards.neg.rows[1].eta).toBe('6 min');

    expect(
      shouldUseDetailedCarMesh({
        view: 'vault',
        glbStatus: 'ready',
        doorOpen: 0.5,
        spragueMode: false,
      })
    ).toBe(true);

    expect(computeSubsurfaceMix(0, false)).toBe(0);
    expect(computeSubsurfaceMix(26, false)).toBe(1);
    expect(computeSubsurfaceMix(10, true)).toBeGreaterThanOrEqual(0.85);

    const opaque = getSubsurfacePaints(0, 'dark');
    const xray = getSubsurfacePaints(1, 'dark');
    const urbanOpaque = opaque.find(([layer]) => layer === 'landuse-urban')?.[2];
    const urbanXray = xray.find(([layer]) => layer === 'landuse-urban')?.[2];
    expect(urbanOpaque).toBe(0.68);
    expect(Number(urbanXray)).toBeLessThan(0.35);
  });
});
