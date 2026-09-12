import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { parse } from '@loaders.gl/core';
import { GLTFLoader } from '@loaders.gl/gltf';
import type { ShapeEntry } from '../sim/shapes';
import { coordAtDistance, splitIntoCars } from '../sim/shapes_loader';
import type { RollingStockDatabase } from '../sim/rolling_stock';
import { getRollingStockForLine, getBogieCentresM } from '../sim/rolling_stock';
import type { TrainMarker } from './trains_layer';
import { carCenterSpacingM, compassBearingToDeckYaw } from './train_model_geometry';
export { resolveTrainRenderLayers } from './train_render_fallback';

export const TRAIN_MODEL_ZOOM_THRESHOLD = 13.0;
const LOAD_TIMEOUT_MS = 5000;
const FAMILY_URLS = {
  pneumatic_generic: '/models/train/pneumatic_generic__neutral.glb',
  steel_classic: '/models/train/steel_classic__neutral.glb',
  rer_generic_A: '/models/train/rer_generic_A__neutral.glb',
  rer_generic_B: '/models/train/rer_generic_B__neutral.glb',
  rer_generic_C: '/models/train/rer_generic_C__neutral.glb',
  rer_generic_D: '/models/train/rer_generic_D__neutral.glb',
  rer_generic_E: '/models/train/rer_generic_E__neutral.glb'
} as const;
const MODEL_RENDER_POLICY: Record<TrainModelFamily, { heightMeasured: boolean; grazingCameraApproved: boolean }> = {
  pneumatic_generic: { heightMeasured: false, grazingCameraApproved: true },
  steel_classic: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_A: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_B: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_C: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_D: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_E: { heightMeasured: false, grazingCameraApproved: true }
};

type TrainModelFamily = keyof typeof FAMILY_URLS;
type AssetStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface ModelCar {
  position: [number, number, number];
  orientation: readonly [number, number, number];
  train: TrainMarker;
}

interface ModelLayerParams {
  trains: TrainMarker[];
  shapes: Map<string, ShapeEntry>;
  rollingStockDb: RollingStockDatabase;
  grazingCamera: boolean;
  bounds?: [[number, number], [number, number]] | null;
  elevationOffset?: { lineId: string; offset: number };
  onClick?: (train: TrainMarker) => void;
  onHover?: (info: any) => void;
}

const assetStatus = new Map<TrainModelFamily, AssetStatus>();
const parsedScenegraphs = new Map<TrainModelFamily, any>();
const assetListeners = new Set<() => void>();
const requestedFamilies = new Set<TrainModelFamily>();

function familyForStock(stock: { drive_type: string; short_name: string }): TrainModelFamily {
  if (stock.short_name === 'A' || stock.short_name === 'B' || stock.short_name === 'C' || stock.short_name === 'D' || stock.short_name === 'E') {
    return `rer_generic_${stock.short_name}` as TrainModelFamily;
  }
  return stock.drive_type === 'tire' ? 'pneumatic_generic' : 'steel_classic';
}

export function requestTrainModel(train: TrainMarker, rollingStockDb: RollingStockDatabase): void {
  const stock = getRollingStockForLine(rollingStockDb, train.line || train.lineName);
  const family = familyForStock(stock);
  requestedFamilies.add(family);
  beginAssetLoad(family);
}

function notifyAssetListeners(): void {
  for (const listener of assetListeners) listener();
}

function beginAssetLoad(family: TrainModelFamily): void {
  if (assetStatus.get(family) !== undefined) return;
  assetStatus.set(family, 'loading');
  notifyAssetListeners();

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  fetch(FAMILY_URLS[family], { signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error(`train model ${family}: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then(buffer => parse(buffer, GLTFLoader))
    .then(gltf => {
      parsedScenegraphs.set(family, gltf);
      assetStatus.set(family, 'ready');
      notifyAssetListeners();
    })
    .catch(error => {
      console.warn(`[train-models] ${family} unavailable; keeping capsules`, error);
      assetStatus.set(family, 'failed');
      notifyAssetListeners();
    })
    .finally(() => globalThis.clearTimeout(timeout));
}

export function subscribeTrainModelAssets(listener: () => void): () => void {
  assetListeners.add(listener);
  return () => assetListeners.delete(listener);
}

export function preloadTrainModels(): void {
  for (const family of Object.keys(FAMILY_URLS) as TrainModelFamily[]) {
    requestedFamilies.add(family);
    beginAssetLoad(family);
  }
}

export function trainModelsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('train-models') !== '0';
}

export function trainModelsReady(): boolean {
  return [...assetStatus.values()].some(status => status === 'ready');
}


function modelPosition(shape: ShapeEntry, tailDistance: number, headDistance: number, elevation: number): [number, number, number] {
  const midpoint = (tailDistance + headDistance) / 2;
  const [longitude, latitude] = coordAtDistance(shape, midpoint);
  return [longitude, latitude, elevation];
}

function modelOrientation(shape: ShapeEntry, tailDistance: number, headDistance: number): readonly [number, number, number] {
  const tail = coordAtDistance(shape, tailDistance);
  const head = coordAtDistance(shape, headDistance);
  const latitude = ((tail[1] + head[1]) / 2) * Math.PI / 180;
  const compassBearing = Math.atan2((head[0] - tail[0]) * Math.cos(latitude), head[1] - tail[1]) * 180 / Math.PI;
  const yaw = compassBearingToDeckYaw(compassBearing);
  // deck.gl 9.4.0 expects [pitch, yaw, roll]. The source cap is a compass
  // bearing; converting with 90 - cap puts it in deck.gl's mathematical yaw.
  return [0, yaw, 90];
}

function buildFamilyCars(params: ModelLayerParams, family: TrainModelFamily): ModelCar[] {
  const cars: ModelCar[] = [];
  for (const train of params.trains) {
    if (!train.shapeId) continue;
    const shape = params.shapes.get(train.shapeId);
    if (!shape) continue;
    const stock = getRollingStockForLine(params.rollingStockDb, train.line || train.lineName);
    if (familyForStock(stock) !== family) continue;
    if (params.bounds) {
      const [[west, south], [east, north]] = params.bounds;
      if (train.pos[0] < west || train.pos[0] > east || train.pos[1] < south || train.pos[1] > north) continue;
    }
    const headDistance = train.currentDistM ?? 0;
    const trainDir = (train.direction ?? 1) as 0 | 1;
    const carsForTrain = splitIntoCars(
      shape,
      headDistance,
      stock.cars_count,
      stock.car_length_m,
      stock.inter_car_gap_m,
      trainDir
    );
    const bogieSpanM = getBogieCentresM(stock);
    for (let index = 0; index < carsForTrain.length; index++) {
      const car = carsForTrain[index];
      if (car.length < 2) continue;
      const spacingM = carCenterSpacingM(stock.car_length_m, stock.inter_car_gap_m);
      const centerDistance = trainDir === 1
        ? headDistance - index * spacingM - stock.car_length_m / 2
        : headDistance + index * spacingM + stock.car_length_m / 2;
      const bogieTailDistance = trainDir === 1
        ? Math.max(0, Math.min(shape.length, centerDistance - bogieSpanM / 2))
        : Math.max(0, Math.min(shape.length, centerDistance + bogieSpanM / 2));
      const bogieHeadDistance = trainDir === 1
        ? Math.max(0, Math.min(shape.length, centerDistance + bogieSpanM / 2))
        : Math.max(0, Math.min(shape.length, centerDistance - bogieSpanM / 2));
      cars.push({
        position: modelPosition(
          shape,
          bogieTailDistance,
          bogieHeadDistance,
          (train.elevation || 0) + (params.elevationOffset?.lineId === train.line
            ? params.elevationOffset.offset
            : 0)
        ),
        orientation: modelOrientation(shape, bogieTailDistance, bogieHeadDistance),
        train
      });
    }
  }
  return cars;
}

export function createTrainModelLayers(params: ModelLayerParams): ScenegraphLayer<ModelCar>[] {
  if (!trainModelsEnabled()) return [];
  const usedFamilies = new Set<TrainModelFamily>();
  for (const train of params.trains) {
    if (params.bounds) {
      const [[west, south], [east, north]] = params.bounds;
      if (train.pos[0] < west || train.pos[0] > east || train.pos[1] < south || train.pos[1] > north) continue;
    }
    const stock = getRollingStockForLine(params.rollingStockDb, train.line || train.lineName);
    const family = familyForStock(stock);
    if (!requestedFamilies.has(family)) continue;
    usedFamilies.add(family);
  }
  const layers: ScenegraphLayer<ModelCar>[] = [];

  for (const family of usedFamilies) {
    if (params.grazingCamera && !MODEL_RENDER_POLICY[family].grazingCameraApproved) continue;
    if (assetStatus.get(family) !== 'ready') continue;
    const gltf = parsedScenegraphs.get(family);
    if (!gltf) continue;

    const cars = buildFamilyCars(params, family);
    if (cars.length === 0) continue;

    layers.push(new ScenegraphLayer<ModelCar>({
      id: `subway-train-model-${family}`,
      data: cars,
      scenegraph: gltf,
      getPosition: car => car.position,
      getOrientation: car => car.orientation,
      sizeScale: 1,
      _lighting: 'pbr',
      pickable: true,
      onClick: (info: any) => {
        if (info.object?.train && params.onClick) {
          params.onClick(info.object.train);
        }
      },
      onHover: (info: any) => {
        if (params.onHover) {
          params.onHover(info.object ? { ...info, object: info.object.train } : info);
        }
      },
      onFirstDraw: () => undefined
    }));
  }
  return layers;
}