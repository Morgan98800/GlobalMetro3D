import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTrainRenderLayers } from '@core/ui/map/train_render_fallback';
import { carCenterSpacingM, compassBearingToDeckYaw } from '@core/ui/map/train_model_geometry';
import { getRollingStockForLine } from '@core/sim/rolling_stock';
import type { ShapeEntry } from '@core/sim/shapes';
import {
  dualTrackOffsetForZoom,
  sampleShapeFrame,
  smoothShapeForRender,
} from '@core/ui/map/rounded_path';
import { createCapsuleLayers } from '@core/ui/map/capsule_layer';

import { beforeAll, describe, it } from 'vitest';

describe('train_models_layer and RER specifications', () => {
  beforeAll(() => {
    const glbPath = path.resolve(
      import.meta.dirname,
      '../web/public/models/train/rer_generic_A__neutral.glb'
    );
    if (!fs.existsSync(glbPath)) {
      execSync('npm run models:publish', { stdio: 'pipe' });
    }
  });
  it('should validate fallback layers and geometry', () => {
    const capsuleLayers = ['capsule-base', 'capsule-core'];
    const modelLayers = ['model-pneumatic', 'model-steel'];

    assert.deepEqual(
      resolveTrainRenderLayers(modelLayers, capsuleLayers),
      [...capsuleLayers, ...modelLayers],
      'les capsules restent visibles pendant que les modèles 3D sont disponibles'
    );
    assert.deepEqual(
      resolveTrainRenderLayers([], capsuleLayers),
      capsuleLayers,
      'a failed, timed-out, or missing model load must keep capsules active'
    );
    assert.equal(compassBearingToDeckYaw(-144.680485), 234.680485);
    assert.equal(carCenterSpacingM(15.5, 0.25), 15.75);
  });

  it('should validate rolling stock and 3D models for all 5 RER lines (A, B, C, D, E)', () => {
    const rsPath = path.resolve(import.meta.dirname, '../web/public/data/rolling-stock.json');
    const rsData = JSON.parse(fs.readFileSync(rsPath, 'utf8'));

    const rerLetters = ['A', 'B', 'C', 'D', 'E'];
    for (const letter of rerLetters) {
      const stock = getRollingStockForLine(rsData, letter);
      assert.equal(stock.short_name, letter);
      assert.equal(stock.width_m, 2.8);
      assert.equal(stock.cars_count, 7);
      assert.equal(stock.car_length_m, 15.0);
      assert.equal(stock.total_length_m, 110.0);

      const glbPath = path.resolve(
        import.meta.dirname,
        `../web/public/models/train/rer_generic_${letter}__neutral.glb`
      );
      assert.ok(
        fs.existsSync(glbPath),
        `rer_generic_${letter}__neutral.glb must exist in web/public`
      );
    }
  });

  it('should validate follow camera zoom, smoothing, and RER line identification', async () => {
    const { isRerTrain, getFollowZoom, getFollowSmoothingMs } = await import(
      '@core/ui/map/follow_camera'
    );

    const rerMarkerA = { line: 'IDFM:C01742', lineName: 'A' } as any;
    const rerMarkerE = { line: 'IDFM:C01729', lineName: 'E' } as any;
    const metroMarker1 = { line: 'IDFM:C01371', lineName: '1' } as any;

    assert.equal(isRerTrain(rerMarkerA), true);
    assert.equal(isRerTrain(rerMarkerE), true);
    assert.equal(isRerTrain(metroMarker1), false);

    assert.equal(getFollowZoom(rerMarkerA), 16.8);
    assert.equal(getFollowZoom(metroMarker1), 18.0);

    assert.equal(getFollowSmoothingMs(rerMarkerA), 360);
    assert.equal(getFollowSmoothingMs(metroMarker1), 520);
  });

  it('should map rolling stock families for Berlin, Edinburgh, Washington, and Paris', async () => {
    const { familyForStock, TRAIN_MODEL_ZOOM_THRESHOLD } = await import(
      '@core/ui/map/train_models_layer'
    );

    assert.equal(TRAIN_MODEL_ZOOM_THRESHOLD, 13.0);
    assert.equal(
      familyForStock({
        drive_type: 'steel',
        short_name: 'U5',
        model_id: 'BVG_GROSSPROFIL_GENERIC',
      }),
      'bvg_grossprofil'
    );
    assert.equal(
      familyForStock({
        drive_type: 'steel',
        short_name: 'U1',
        model_id: 'BVG_KLEINPROFIL_GENERIC',
      }),
      'bvg_kleinprofil'
    );
    assert.equal(
      familyForStock({ drive_type: 'steel', short_name: 'EXP', model_id: 'CLASS_385_EMU' }),
      'scotrail_class_385'
    );
    assert.equal(
      familyForStock({ drive_type: 'steel', short_name: 'Red', model_id: 'WMATA_GENERIC_2V' }),
      'wmata_generic'
    );
    assert.equal(
      familyForStock({ drive_type: 'tire', short_name: '1', model_id: 'VAL_208' }),
      'val_208'
    );
    assert.equal(
      familyForStock({ drive_type: 'tire', short_name: '1', model_id: 'VAL_52M' }),
      'val_52m'
    );
    assert.equal(
      familyForStock({
        drive_type: 'steel',
        short_name: 'TRAM',
        model_id: 'Breda_VLC',
        car_length_m: 30.0,
      }),
      'breda_vlc'
    );
    assert.equal(
      familyForStock({ drive_type: 'tire', short_name: '1', model_id: 'MP05' }),
      'pneumatic_generic'
    );
    assert.equal(
      familyForStock({ drive_type: 'steel', short_name: 'A', model_id: 'RER_A_MI09_UM2' }),
      'rer_generic_A'
    );
  });

  it('aligns curves, dual-track offsets, direction-0 traversal, and bogie slope pitch accurately', async () => {
    const { computeCarModelPose } = await import('@core/ui/map/train_models_layer');

    assert.equal(dualTrackOffsetForZoom(12.5), 0);
    assert.equal(dualTrackOffsetForZoom(15.5), 1.55);

    const rawShape: ShapeEntry = {
      id: 'test-curve',
      coords: new Float64Array([2.34, 48.85, 2.343, 48.85, 2.343, 48.853]),
      dist: new Float32Array([0, 220, 554]),
      length: 554,
    };
    const smoothed = smoothShapeForRender(rawShape);
    assert.ok(smoothed.coords.length >= rawShape.coords.length);
    const frameRight = sampleShapeFrame(smoothed, 100, 1.55);
    const frameLeft = sampleShapeFrame(smoothed, 100, -1.55);
    assert.ok(frameRight.pos[1] < frameLeft.pos[1]);

    // Direction 0 and direction 1 must both traverse shapes forward along [0..length] without mirroring backward
    const shapes = new Map([[rawShape.id, rawShape]]);
    const rsDb = JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dirname, '../web/public/data/rolling-stock.json'),
        'utf8'
      )
    );
    const [firstCapsuleLayer] = createCapsuleLayers({
      trains: [
        {
          id: 't0',
          line: 'IDFM:C01371',
          lineName: '1',
          colorHex: '#FFCD00',
          textColorHex: '#111111',
          shapeId: 'test-curve',
          direction: 0,
          currentDistM: 120,
          pos: [2.3415, 48.85],
          brg: 90,
          dest: 'La Défense',
          next: 'Châtelet',
          spd: 45,
          conf: 'measured',
          elevation: -7.5,
          atStop: false,
        },
        {
          id: 't1',
          line: 'IDFM:C01371',
          lineName: '1',
          colorHex: '#FFCD00',
          textColorHex: '#111111',
          shapeId: 'test-curve',
          direction: 1,
          currentDistM: 120,
          pos: [2.3415, 48.85],
          brg: 90,
          dest: 'Château de Vincennes',
          next: 'Châtelet',
          spd: 45,
          conf: 'measured',
          elevation: -7.5,
          atStop: false,
        },
      ] as any,
      shapes,
      rollingStockDb: rsDb,
      mapCenter: [2.342, 48.85],
      selectedLineId: null,
      zoom: 15.5,
      onHover: () => undefined,
      onClick: () => undefined,
    });
    const layerData = (firstCapsuleLayer as any).props.data as Array<{
      path?: [number, number, number][];
      position?: [number, number, number];
    }>;
    assert.ok(layerData.length >= 2, 'both direction-0 and direction-1 trains must render cleanly');
    const paths = layerData.filter((d) => Array.isArray(d.path) && d.path.length >= 2);
    if (paths.length >= 2) {
      assert.ok(
        Math.abs(paths[0].path![0][0] - paths[1].path![0][0]) < 0.0005,
        'direction-0 train must traverse forward monotonically matching direction-1 without reversing backward'
      );
    }

    // Pitch sign verification on a climb into viaduct: cab pitches negative on deck.gl matrix, tail flips sign
    const viaductLine = {
      id: 'L6',
      short_name: '6',
      long_name: 'Ligne 6',
      mode: 'metro' as const,
      color: '#6ECA97',
      text_color: '#111111',
      destinations: { '0': 'Étoile', '1': 'Nation' },
      measured_length_km: 13.6,
      elevation_offset: 5,
    };
    const rampShape: ShapeEntry = {
      id: 'ramp-6',
      coords: new Float64Array([2.282, 48.853, 2.286, 48.853]),
      dist: new Float32Array([0, 293]),
      length: 293,
    };
    const cabPose = computeCarModelPose({
      shape: rampShape,
      centerDistance: 146.5,
      bogieSpanM: 12,
      trackOffsetM: 1.55,
      elevation: 0,
      line: viaductLine,
      isTailCar: false,
    });
    const tailPose = computeCarModelPose({
      shape: rampShape,
      centerDistance: 146.5,
      bogieSpanM: 12,
      trackOffsetM: 1.55,
      elevation: 0,
      line: viaductLine,
      isTailCar: true,
    });
    assert.ok(cabPose.orientation[0] < 0, 'uphill lead cab must use negative deck pitch');
    assert.ok(tailPose.orientation[0] > 0, 'uphill 180-yawed tail car must flip pitch positive');
  });
});
