import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTrainRenderLayers } from './train_render_fallback.ts';
import { carCenterSpacingM, compassBearingToDeckYaw } from './train_model_geometry.ts';
import { getRollingStockForLine } from '../sim/rolling_stock.ts';

const capsuleLayers = ['capsule-base', 'capsule-core'];
const modelLayers = ['model-pneumatic', 'model-steel'];

assert.deepEqual(resolveTrainRenderLayers(modelLayers, capsuleLayers), modelLayers);
assert.deepEqual(
  resolveTrainRenderLayers([], capsuleLayers),
  capsuleLayers,
  'a failed, timed-out, or missing model load must keep capsules active'
);
assert.equal(compassBearingToDeckYaw(-144.680485), 234.680485);
assert.equal(carCenterSpacingM(15.5, 0.25), 15.75);

// RER E Rolling Stock Specifications Verification
const rsPath = path.resolve(import.meta.dirname, '../../public/data/rolling-stock.json');
const rsData = JSON.parse(fs.readFileSync(rsPath, 'utf8'));
const stockE = getRollingStockForLine(rsData, 'E');
assert.equal(stockE.short_name, 'E');
assert.equal(stockE.width_m, 2.8);
assert.equal(stockE.cars_count, 7);
assert.equal(stockE.car_length_m, 15.0);
assert.equal(stockE.total_length_m, 110.0);

const glbEPath = path.resolve(import.meta.dirname, '../../public/models/train/rer_generic_E__neutral.glb');
assert.ok(fs.existsSync(glbEPath), 'rer_generic_E__neutral.glb must exist in web/public');

console.log('train model and RER E specifications test passed');