import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { parse } from '@loaders.gl/core';
import { GLTFLoader } from '@loaders.gl/gltf';
import type { ShapeEntry } from '@core/sim/shapes';
import { coordAtDistance, splitIntoCars } from '@core/sim/shapes_loader';
import type { RollingStockDatabase } from '@core/sim/rolling_stock';
import { getRollingStockForLine, getBogieCentresM } from '@core/sim/rolling_stock';
import type { TrainMarker } from './trains_layer';
import { carCenterSpacingM, compassBearingToDeckYaw } from './train_model_geometry';
export { resolveTrainRenderLayers } from './train_render_fallback';

export const TRAIN_MODEL_ZOOM_THRESHOLD = 13.0;
const LOAD_TIMEOUT_MS = 5000;
const FAMILY_URLS = {
  pneumatic_generic: '/models/train/pneumatic_generic__neutral.glb',
  steel_classic: '/models/train/steel_classic__neutral.glb',
  wmata_generic: '/models/train/wmata_generic__neutral.glb',
  bvg_grossprofil: '/models/train/bvg_grossprofil__neutral.glb',
  bvg_kleinprofil: '/models/train/bvg_kleinprofil__neutral.glb',
  scotrail_class_385: '/models/train/scotrail_class_385__neutral.glb',
  val_208: '/models/train/val_208__neutral.glb',
  val_52m: '/models/train/val_52m__neutral.glb',
  breda_vlc: '/models/train/breda_vlc__neutral.glb',
  rer_generic_A: '/models/train/rer_generic_A__neutral.glb',
  rer_generic_B: '/models/train/rer_generic_B__neutral.glb',
  rer_generic_C: '/models/train/rer_generic_C__neutral.glb',
  rer_generic_D: '/models/train/rer_generic_D__neutral.glb',
  rer_generic_E: '/models/train/rer_generic_E__neutral.glb',
} as const;
const CAB_URLS: Partial<Record<TrainModelFamily, string>> = {
  pneumatic_generic: '/models/train/pneumatic_generic__neutral__cab.glb',
  steel_classic: '/models/train/steel_classic__neutral__cab.glb',
  wmata_generic: '/models/train/wmata_generic__cab.glb',
  bvg_grossprofil: '/models/train/bvg_grossprofil__cab.glb',
  bvg_kleinprofil: '/models/train/bvg_kleinprofil__cab.glb',
  scotrail_class_385: '/models/train/scotrail_class_385__cab.glb',
  val_208: '/models/train/val_208__cab.glb',
  val_52m: '/models/train/val_52m__cab.glb',
  breda_vlc: '/models/train/breda_vlc__cab.glb',
  rer_generic_A: '/models/train/rer_generic_A__cab.glb',
  rer_generic_B: '/models/train/rer_generic_B__cab.glb',
  rer_generic_C: '/models/train/rer_generic_C__cab.glb',
  rer_generic_D: '/models/train/rer_generic_D__cab.glb',
  rer_generic_E: '/models/train/rer_generic_E__cab.glb',
};
const TAIL_URLS: Partial<Record<TrainModelFamily, string>> = {
  pneumatic_generic: '/models/train/pneumatic_generic__neutral__tail.glb',
  steel_classic: '/models/train/steel_classic__neutral__tail.glb',
  wmata_generic: '/models/train/wmata_generic__tail.glb',
  bvg_grossprofil: '/models/train/bvg_grossprofil__tail.glb',
  bvg_kleinprofil: '/models/train/bvg_kleinprofil__tail.glb',
  scotrail_class_385: '/models/train/scotrail_class_385__tail.glb',
  val_208: '/models/train/val_208__tail.glb',
  val_52m: '/models/train/val_52m__tail.glb',
  breda_vlc: '/models/train/breda_vlc__tail.glb',
  rer_generic_A: '/models/train/rer_generic_A__tail.glb',
  rer_generic_B: '/models/train/rer_generic_B__tail.glb',
  rer_generic_C: '/models/train/rer_generic_C__tail.glb',
  rer_generic_D: '/models/train/rer_generic_D__tail.glb',
  rer_generic_E: '/models/train/rer_generic_E__tail.glb',
};
const MODEL_RENDER_POLICY: Record<
  TrainModelFamily,
  { heightMeasured: boolean; grazingCameraApproved: boolean }
> = {
  pneumatic_generic: { heightMeasured: false, grazingCameraApproved: true },
  steel_classic: { heightMeasured: false, grazingCameraApproved: true },
  wmata_generic: { heightMeasured: false, grazingCameraApproved: true },
  bvg_grossprofil: { heightMeasured: false, grazingCameraApproved: true },
  bvg_kleinprofil: { heightMeasured: false, grazingCameraApproved: true },
  scotrail_class_385: { heightMeasured: false, grazingCameraApproved: true },
  val_208: { heightMeasured: false, grazingCameraApproved: true },
  val_52m: { heightMeasured: false, grazingCameraApproved: true },
  breda_vlc: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_A: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_B: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_C: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_D: { heightMeasured: false, grazingCameraApproved: true },
  rer_generic_E: { heightMeasured: false, grazingCameraApproved: true },
};

type TrainModelFamily = keyof typeof FAMILY_URLS;
type AssetStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface ModelCar {
  position: [number, number, number];
  orientation: readonly [number, number, number];
  train: TrainMarker;
  role: 'cab' | 'tail' | 'neutral';
}

interface ModelLayerParams {
  trains: TrainMarker[];
  shapes: Map<string, ShapeEntry>;
  rollingStockDb: RollingStockDatabase;
  grazingCamera: boolean;
  bounds?: [[number, number], [number, number]] | null;
  selectedTrainId?: string | null;
  elevationOffset?: { lineId: string; offset: number };
  onClick?: (train: TrainMarker) => void;
  onHover?: (info: any) => void;
}

const assetStatus = new Map<string, AssetStatus>();
const parsedScenegraphs = new Map<string, any>();
const parsedCabScenegraphs = new Map<string, any>();
const parsedTailScenegraphs = new Map<string, any>();
const assetListeners = new Set<() => void>();
const requestedAssets = new Set<string>();

export function familyForStock(stock: {
  drive_type: string;
  short_name: string;
  model_id?: string;
  car_length_m?: number;
}): TrainModelFamily {
  const modelId = stock.model_id?.toUpperCase() ?? '';
  if (modelId === 'BVG_GROSSPROFIL_GENERIC' || modelId.includes('GROSSPROFIL')) {
    return 'bvg_grossprofil';
  }
  if (modelId === 'BVG_KLEINPROFIL_GENERIC' || modelId.includes('KLEINPROFIL')) {
    return 'bvg_kleinprofil';
  }
  if (modelId === 'CLASS_385_EMU' || modelId.includes('CLASS_385')) {
    return 'scotrail_class_385';
  }
  if (modelId === 'VAL_208' || modelId.includes('VAL_208')) {
    return 'val_208';
  }
  if (modelId === 'VAL_52M' || modelId.includes('VAL_52M')) {
    return 'val_52m';
  }
  if (modelId === 'BREDA_VLC' || modelId.includes('BREDA')) {
    return 'breda_vlc';
  }
  if (
    modelId.startsWith('WMATA') ||
    (stock.car_length_m ?? 0) >= 20 ||
    [
      'RED',
      'ORANGE',
      'SILVER',
      'BLUE',
      'GREEN',
      'YELLOW',
      'RD',
      'OR',
      'SV',
      'BL',
      'GR',
      'YL',
    ].includes(stock.short_name.toUpperCase())
  ) {
    return 'wmata_generic';
  }
  if (
    stock.short_name === 'A' ||
    stock.short_name === 'B' ||
    stock.short_name === 'C' ||
    stock.short_name === 'D' ||
    stock.short_name === 'E'
  ) {
    return `rer_generic_${stock.short_name}` as TrainModelFamily;
  }
  return stock.drive_type === 'tire' ? 'pneumatic_generic' : 'steel_classic';
}

function assetKeyForStock(stock: {
  drive_type: string;
  short_name: string;
  model_id?: string;
  car_length_m?: number;
}): {
  family: TrainModelFamily;
  key: string;
  url: string;
  cabUrl?: string;
  tailUrl?: string;
} {
  const family = familyForStock(stock);
  return {
    family,
    key: family,
    url: FAMILY_URLS[family],
    cabUrl: CAB_URLS[family],
    tailUrl: TAIL_URLS[family],
  };
}

export function isTrainModelReadyForTrain(
  train: TrainMarker,
  rollingStockDb: RollingStockDatabase
): boolean {
  const stock = getRollingStockForLine(rollingStockDb, train.line || train.lineName);
  const { key } = assetKeyForStock(stock);
  return assetStatus.get(key) === 'ready' && parsedScenegraphs.has(key);
}

export function requestTrainModel(train: TrainMarker, rollingStockDb: RollingStockDatabase): void {
  const stock = getRollingStockForLine(rollingStockDb, train.line || train.lineName);
  const { key, url, cabUrl, tailUrl } = assetKeyForStock(stock);
  requestedAssets.add(key);
  beginAssetLoad(key, url, cabUrl, tailUrl);
}

function notifyAssetListeners(): void {
  for (const listener of assetListeners) listener();
}

function beginAssetLoad(key: string, url: string, cabUrl?: string, tailUrl?: string): void {
  if (assetStatus.get(key) !== undefined) return;
  assetStatus.set(key, 'loading');
  notifyAssetListeners();

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  const fetchGlb = (targetUrl: string) =>
    fetch(targetUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`train model ${key}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => parse(buffer, GLTFLoader));

  Promise.all([
    fetchGlb(url),
    cabUrl ? fetchGlb(cabUrl).catch(() => null) : Promise.resolve(null),
    tailUrl ? fetchGlb(tailUrl).catch(() => null) : Promise.resolve(null),
  ])
    .then(([neutralGltf, cabGltf, tailGltf]) => {
      parsedScenegraphs.set(key, neutralGltf);
      if (cabGltf) parsedCabScenegraphs.set(key, cabGltf);
      if (tailGltf) parsedTailScenegraphs.set(key, tailGltf);
      assetStatus.set(key, 'ready');
      notifyAssetListeners();
    })
    .catch((error) => {
      console.warn(`[train-models] ${key} unavailable; keeping capsules`, error);
      assetStatus.set(key, 'failed');
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
    requestedAssets.add(family);
    beginAssetLoad(family, FAMILY_URLS[family], CAB_URLS[family], TAIL_URLS[family]);
  }
}

export function trainModelsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  // Les modèles GLB sont le rendu principal ; les capsules restent le
  // fallback pendant le chargement et pour les familles sans asset.
  return true;
}

export function trainModelsReady(): boolean {
  return [...assetStatus.values()].some((status) => status === 'ready');
}

function modelPosition(
  shape: ShapeEntry,
  tailDistance: number,
  headDistance: number,
  elevation: number
): [number, number, number] {
  const midpoint = (tailDistance + headDistance) / 2;
  const [longitude, latitude] = coordAtDistance(shape, midpoint);
  return [longitude, latitude, elevation];
}

function modelOrientation(
  shape: ShapeEntry,
  tailDistance: number,
  headDistance: number
): readonly [number, number, number] {
  const tail = coordAtDistance(shape, tailDistance);
  const head = coordAtDistance(shape, headDistance);
  const latitude = (((tail[1] + head[1]) / 2) * Math.PI) / 180;
  const compassBearing =
    (Math.atan2((head[0] - tail[0]) * Math.cos(latitude), head[1] - tail[1]) * 180) / Math.PI;
  const yaw = compassBearingToDeckYaw(compassBearing);
  // deck.gl 9.4.0 expects [pitch, yaw, roll]. The source cap is a compass
  // bearing; converting with 90 - cap puts it in deck.gl's mathematical yaw.
  return [0, yaw, 90];
}

function buildAssetCars(params: ModelLayerParams, assetKey: string): ModelCar[] {
  const cars: ModelCar[] = [];
  for (const train of params.trains) {
    if (!train.shapeId) continue;
    const shape = params.shapes.get(train.shapeId);
    if (!shape) continue;
    const stock = getRollingStockForLine(params.rollingStockDb, train.line || train.lineName);
    if (assetKeyForStock(stock).key !== assetKey) continue;
    if (params.bounds && (!params.selectedTrainId || train.id !== params.selectedTrainId)) {
      const [[west, south], [east, north]] = params.bounds;
      if (
        train.pos[0] < west ||
        train.pos[0] > east ||
        train.pos[1] < south ||
        train.pos[1] > north
      )
        continue;
    }
    const trainDirection = (train.direction ?? 1) as 0 | 1;
    const referenceDistance =
      (train.currentDistM ?? 0) +
      (trainDirection === 1 ? stock.total_length_m / 2 : -stock.total_length_m / 2);
    const trainDir = (train.direction ?? 1) as 0 | 1;
    const carsForTrain = splitIntoCars(
      shape,
      referenceDistance,
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
      const centerDistance =
        trainDir === 1
          ? referenceDistance - index * spacingM - stock.car_length_m / 2
          : referenceDistance + index * spacingM + stock.car_length_m / 2;
      const bogieTailDistance =
        trainDir === 1
          ? Math.max(0, Math.min(shape.length, centerDistance - bogieSpanM / 2))
          : Math.max(0, Math.min(shape.length, centerDistance + bogieSpanM / 2));
      const bogieHeadDistance =
        trainDir === 1
          ? Math.max(0, Math.min(shape.length, centerDistance + bogieSpanM / 2))
          : Math.max(0, Math.min(shape.length, centerDistance - bogieSpanM / 2));
      const isLeadCar = index === 0;
      const isTailCar = index === carsForTrain.length - 1 && carsForTrain.length > 1;
      const baseOrientation = modelOrientation(shape, bogieTailDistance, bogieHeadDistance);
      const orientation: readonly [number, number, number] = isTailCar
        ? [baseOrientation[0], (baseOrientation[1] + 180) % 360, baseOrientation[2]]
        : baseOrientation;
      cars.push({
        position: modelPosition(
          shape,
          bogieTailDistance,
          bogieHeadDistance,
          (train.elevation || 0) +
            0.35 +
            (params.elevationOffset?.lineId === train.line ? params.elevationOffset.offset : 0)
        ),
        orientation,
        train,
        role: isLeadCar ? 'cab' : isTailCar ? 'tail' : 'neutral',
      });
    }
  }
  return cars;
}

export function createTrainModelLayers(params: ModelLayerParams): ScenegraphLayer<ModelCar>[] {
  if (!trainModelsEnabled()) return [];
  const usedAssets = new Map<string, TrainModelFamily>();
  for (const train of params.trains) {
    if (params.bounds && (!params.selectedTrainId || train.id !== params.selectedTrainId)) {
      const [[west, south], [east, north]] = params.bounds;
      if (
        train.pos[0] < west ||
        train.pos[0] > east ||
        train.pos[1] < south ||
        train.pos[1] > north
      )
        continue;
    }
    const stock = getRollingStockForLine(params.rollingStockDb, train.line || train.lineName);
    const { family, key } = assetKeyForStock(stock);
    if (!requestedAssets.has(key)) continue;
    usedAssets.set(key, family);
  }
  const layers: ScenegraphLayer<ModelCar>[] = [];

  for (const [assetKey, family] of usedAssets.entries()) {
    if (params.grazingCamera && !MODEL_RENDER_POLICY[family].grazingCameraApproved) continue;
    if (assetStatus.get(assetKey) !== 'ready') continue;
    const gltf = parsedScenegraphs.get(assetKey);
    if (!gltf) continue;

    const cars = buildAssetCars(params, assetKey);
    if (cars.length === 0) continue;

    const cabGltf = parsedCabScenegraphs.get(assetKey);
    const tailGltf = parsedTailScenegraphs.get(assetKey) ?? cabGltf;
    const neutralCars = cars.filter(
      (car) =>
        car.role === 'neutral' ||
        (car.role === 'cab' && !cabGltf) ||
        (car.role === 'tail' && !tailGltf)
    );
    const cabCars = cabGltf ? cars.filter((car) => car.role === 'cab') : [];
    const tailCars = tailGltf
      ? tailGltf === cabGltf
        ? []
        : cars.filter((car) => car.role === 'tail')
      : [];
    const combinedCabCars =
      tailGltf && tailGltf === cabGltf
        ? cars.filter((car) => car.role === 'cab' || car.role === 'tail')
        : cabCars;

    const makeLayer = (id: string, scenegraph: any, data: ModelCar[]) =>
      new ScenegraphLayer<ModelCar>({
        id,
        data,
        scenegraph,
        getPosition: (car) => car.position,
        getOrientation: (car) => car.orientation,
        sizeScale: 1,
        _lighting: 'pbr',
        pickable: true,
        parameters: { depthTest: true, depthWriteEnabled: true } as any,
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
        onFirstDraw: () => undefined,
      });

    if (neutralCars.length > 0) {
      layers.push(makeLayer(`subway-train-model-${assetKey}`, gltf, neutralCars));
    }
    if (combinedCabCars.length > 0 && cabGltf) {
      layers.push(makeLayer(`subway-train-model-${assetKey}-cab`, cabGltf, combinedCabCars));
    }
    if (tailCars.length > 0 && tailGltf) {
      layers.push(makeLayer(`subway-train-model-${assetKey}-tail`, tailGltf, tailCars));
    }
  }
  return layers;
}
