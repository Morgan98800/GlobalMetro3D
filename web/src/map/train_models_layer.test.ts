import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTrainRenderLayers } from './train_render_fallback.ts';
import { carCenterSpacingM, compassBearingToDeckYaw } from './train_model_geometry.ts';
import { getRollingStockForLine } from '../sim/rolling_stock.ts';

import { describe, it } from 'vitest';

describe('train_models_layer and RER specifications', () => {
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
    const rsPath = path.resolve(import.meta.dirname, '../../public/data/rolling-stock.json');
    const rsData = JSON.parse(fs.readFileSync(rsPath, 'utf8'));

    const rerLetters = ['A', 'B', 'C', 'D', 'E'];
    for (const letter of rerLetters) {
      const stock = getRollingStockForLine(rsData, letter);
      assert.equal(stock.short_name, letter);
      assert.equal(stock.width_m, 2.8);
      assert.equal(stock.cars_count, 7);
      assert.equal(stock.car_length_m, 15.0);
      assert.equal(stock.total_length_m, 110.0);

      const glbPath = path.resolve(import.meta.dirname, `../../public/models/train/rer_generic_${letter}__neutral.glb`);
      assert.ok(fs.existsSync(glbPath), `rer_generic_${letter}__neutral.glb must exist in web/public`);
    }
  });

  it('should validate follow camera zoom, smoothing, and RER line identification', async () => {
    const { isRerTrain, getFollowZoom, getFollowSmoothingMs } = await import('./follow_camera.ts');

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
});