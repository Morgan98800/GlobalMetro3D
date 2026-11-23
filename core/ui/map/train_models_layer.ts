import { PolygonLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { parse } from '@loaders.gl/core';
import { GLTFLoader } from '@loaders.gl/gltf';
import type { ShapeEntry } from '@core/sim/shapes';
import { splitIntoCars } from '@core/sim/shapes_loader';
import type { RollingStockDatabase } from '@core/sim/rolling_stock';
import { getRollingStockForLine, getBogieCentresM } from '@core/sim/rolling_stock';
import {
  distanceMeters,
  dualTrackOffsetForZoom,
  sampleShapeFrame,
  smoothShapeForRender,
} from './rounded_path';
import { type HubRegistry, resolveLineElevationAt } from './station_levels';
import type { TrainMarker } from './trains_layer';
import { carCenterSpacingM, compassBearingToDeckYaw } from './train_model_geometry';
import type { LineMetadata } from '@core/types';
export { resolveTrainRenderLayers } from './train_render_fallback';

export const TRAIN_MODEL_ZOOM_THRESHOLD = 13.0;
const LOAD_TIMEOUT_MS = 20000;
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
  forwardRad: number;
  halfLengthM: number;
}

interface TrainLightBeamDatum {
  polygon: [number, number, number][];
  color: [number, number, number, number];
  isUnderground: boolean;
}

interface ModelLayerParams {
  trains: TrainMarker[];
  shapes: Map<string, ShapeEntry>;
  rollingStockDb: RollingStockDatabase;
  grazingCamera: boolean;
  bounds?: [[number, number], [number, number]] | null;
  selectedTrainId?: string | null;
  elevationOffset?: { lineId: string; offset: number };
  zoom?: number;
  lineMap?: Map<string, LineMetadata>;
  hubRegistry?: HubRegistry | null;
  undergroundBeforeId?: string;
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

export type TrainModelPreset = 'detailed' | 'base';

let currentTrainModelPreset: TrainModelPreset =
  typeof window !== 'undefined' && window.localStorage?.getItem('train_model_preset') === 'base'
    ? 'base'
    : 'detailed';

export function getTrainModelPreset(): TrainModelPreset {
  return currentTrainModelPreset;
}

export function setTrainModelPreset(preset: TrainModelPreset): void {
  currentTrainModelPreset = preset;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem('train_model_preset', preset);
    } catch {
      // ignore storage errors
    }
  }
  notifyAssetListeners();
}

/** Modèle de base (low-poly texturé d'origine, conservé pour pouvoir y revenir à tout moment) */
const BASE_LIVERY_VARIANT_URLS: Record<string, { neutral: string; cab: string; tail: string }> = {
  paris_idfm_pneu: {
    neutral: '/models/train/paris_idfm_pneu__neutral.glb',
    cab: '/models/train/paris_idfm_pneu__neutral__cab.glb',
    tail: '/models/train/paris_idfm_pneu__neutral__tail.glb',
  },
  paris_idfm_steel: {
    neutral: '/models/train/paris_idfm_steel__neutral.glb',
    cab: '/models/train/paris_idfm_steel__neutral__cab.glb',
    tail: '/models/train/paris_idfm_steel__neutral__tail.glb',
  },
  paris_mf77: {
    neutral: '/models/train/paris_mf77__neutral.glb',
    cab: '/models/train/paris_mf77__neutral__cab.glb',
    tail: '/models/train/paris_mf77__neutral__tail.glb',
  },
};

/** Modèles détaillés par ligne (1 mesh fusionné, centré (0,0,0), couleurs cuites en vertex-colors) */
const DETAILED_LIVERY_VARIANT_URLS: Record<string, { neutral: string; cab: string; tail: string }> = {
  paris_mp14_ca: {
    neutral: '/models/train/map_hd/mp14_car.glb',
    cab: '/models/train/map_hd/mp14_ca__cab.glb',
    tail: '/models/train/map_hd/mp14_ca__cab.glb',
  },
  paris_mp14_cc: {
    neutral: '/models/train/map_hd/mp14_car.glb',
    cab: '/models/train/map_hd/mp14_cc__cab.glb',
    tail: '/models/train/map_hd/mp14_cc__cab.glb',
  },
  paris_mp05: {
    neutral: '/models/train/map_hd/mp05_car.glb',
    cab: '/models/train/map_hd/mp05__cab.glb',
    tail: '/models/train/map_hd/mp05__cab.glb',
  },
  paris_mp89_ca: {
    neutral: '/models/train/map_hd/mp89_car.glb',
    cab: '/models/train/map_hd/mp89_ca__cab.glb',
    tail: '/models/train/map_hd/mp89_ca__cab.glb',
  },
  paris_mp89_cc: {
    neutral: '/models/train/map_hd/mp89_car.glb',
    cab: '/models/train/map_hd/mp89_cc__cab.glb',
    tail: '/models/train/map_hd/mp89_cc__cab.glb',
  },
  paris_mf01: {
    neutral: '/models/train/map_hd/mf01_car.glb',
    cab: '/models/train/map_hd/mf01__cab.glb',
    tail: '/models/train/map_hd/mf01__cab.glb',
  },
  paris_mf88: {
    neutral: '/models/train/map_hd/mf88_car.glb',
    cab: '/models/train/map_hd/mf88__cab.glb',
    tail: '/models/train/map_hd/mf88__cab.glb',
  },
  paris_mf77: {
    neutral: '/models/train/map_hd/mf77_car.glb',
    cab: '/models/train/map_hd/mf77__cab.glb',
    tail: '/models/train/map_hd/mf77__cab.glb',
  },
  paris_mf67: {
    neutral: '/models/train/map_hd/mf67_car.glb',
    cab: '/models/train/map_hd/mf67__cab.glb',
    tail: '/models/train/map_hd/mf67__cab.glb',
  },
  paris_mp73: {
    neutral: '/models/train/map_hd/mp73_car.glb',
    cab: '/models/train/map_hd/mp73__cab.glb',
    tail: '/models/train/map_hd/mp73__cab.glb',
  },
  paris_mp59: {
    neutral: '/models/train/map_hd/mp59_car.glb',
    cab: '/models/train/map_hd/mp59__cab.glb',
    tail: '/models/train/map_hd/mp59__cab.glb',
  },
  paris_mf19: {
    neutral: '/models/train/map_hd/mf19_car.glb',
    cab: '/models/train/map_hd/mf19__cab.glb',
    tail: '/models/train/map_hd/mf19__cab.glb',
  },
};

function resolveBaseParisLiveryVariant(stock: {
  drive_type: string;
  short_name: string;
  model_id?: string;
}): string | null {
  const sn = stock.short_name?.trim();
  const mid = (stock.model_id ?? '').toUpperCase();
  if (sn === '4' || sn === '11' || sn === '14' || mid.startsWith('MP14')) {
    return 'paris_idfm_pneu';
  }
  if (sn === '2' || sn === '5' || sn === '9' || sn === '7bis' || mid.startsWith('MF01') || mid === 'MF88') {
    return 'paris_idfm_steel';
  }
  if (sn === '7' || sn === '8' || sn === '13' || mid.startsWith('MF77')) {
    return 'paris_mf77';
  }
  return null;
}

function resolveDetailedParisLiveryVariant(stock: {
  drive_type: string;
  short_name: string;
  model_id?: string;
}): string | null {
  const sn = stock.short_name?.trim();
  const mid = (stock.model_id ?? '').toUpperCase();
  if (mid === 'MP14_5V' || sn === '11') return 'paris_mp14_cc';
  if (mid.startsWith('MP14') || sn === '14') return 'paris_mp14_ca';
  if (mid.startsWith('MP05') || sn === '1') return 'paris_mp05';
  if (mid === 'MP89_CA' || sn === '4') return 'paris_mp89_ca';
  if (mid.startsWith('MP89') || sn === '6') return 'paris_mp89_cc';
  if (mid === 'MP73') return 'paris_mp73';
  if (mid === 'MP59') return 'paris_mp59';
  if (mid.startsWith('MF19')) return 'paris_mf19';
  if (mid.startsWith('MF01') || sn === '2' || sn === '5' || sn === '9') return 'paris_mf01';
  if (mid === 'MF88' || sn === '7bis') return 'paris_mf88';
  if (mid.startsWith('MF77') || sn === '7' || sn === '8' || sn === '13') return 'paris_mf77';
  if (mid.startsWith('MF67') || sn === '3' || sn === '3bis' || sn === '10' || sn === '12') return 'paris_mf67';
  return null;
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
  if (family === 'pneumatic_generic' || family === 'steel_classic') {
    if (currentTrainModelPreset === 'detailed') {
      const variant = resolveDetailedParisLiveryVariant(stock);
      if (variant && DETAILED_LIVERY_VARIANT_URLS[variant]) {
        const urls = DETAILED_LIVERY_VARIANT_URLS[variant];
        return {
          family,
          key: `hd_${variant}`,
          url: urls.neutral,
          cabUrl: urls.cab,
          tailUrl: urls.tail,
        };
      }
    }
    const variant = resolveBaseParisLiveryVariant(stock);
    if (variant && BASE_LIVERY_VARIANT_URLS[variant]) {
      const urls = BASE_LIVERY_VARIANT_URLS[variant];
      return {
        family,
        key: variant,
        url: urls.neutral,
        cabUrl: urls.cab,
        tailUrl: urls.tail,
      };
    }
  }
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
  const fetchGlb = (targetUrl: string) => {
    const versionedUrl = targetUrl.includes('/map_hd/')
      ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}v=5`
      : targetUrl;
    return fetch(versionedUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`train model ${key}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => parse(buffer, GLTFLoader));
  };

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

export function computeCarModelPose(opts: {
  shape: ShapeEntry;
  centerDistance: number;
  bogieSpanM: number;
  trackOffsetM: number;
  elevation: number;
  elevationShift?: number;
  line?: LineMetadata;
  hubRegistry?: HubRegistry | null;
  isTailCar: boolean;
}): { position: [number, number, number]; orientation: readonly [number, number, number] } {
  const { shape, centerDistance, bogieSpanM, trackOffsetM, elevation, isTailCar } = opts;
  const clampedCenter = Math.max(0, Math.min(shape.length, centerDistance));
  let bogieTailDistance = Math.max(0, clampedCenter - bogieSpanM / 2);
  let bogieHeadDistance = Math.min(shape.length, clampedCenter + bogieSpanM / 2);
  if (bogieHeadDistance - bogieTailDistance < 1 && shape.length > 1) {
    bogieTailDistance = Math.max(0, clampedCenter - 0.5);
    bogieHeadDistance = Math.min(shape.length, bogieTailDistance + 1);
  }

  const midFrame = sampleShapeFrame(shape, clampedCenter, trackOffsetM);
  const tailFrame = sampleShapeFrame(shape, bogieTailDistance, trackOffsetM);
  const headFrame = sampleShapeFrame(shape, bogieHeadDistance, trackOffsetM);

  const chordDist = distanceMeters(tailFrame.pos, headFrame.pos);
  const latitudeRad = (((tailFrame.pos[1] + headFrame.pos[1]) * 0.5) * Math.PI) / 180;
  const compassBearing =
    chordDist > 0.25
      ? (Math.atan2(
          (headFrame.pos[0] - tailFrame.pos[0]) * Math.cos(latitudeRad),
          headFrame.pos[1] - tailFrame.pos[1]
        ) *
          180) /
        Math.PI
      : midFrame.compassBearing;
  const baseYaw = compassBearingToDeckYaw(compassBearing);

  const tailZ = opts.line
    ? resolveLineElevationAt(tailFrame.pos, opts.line, opts.hubRegistry)
    : elevation;
  const headZ = opts.line
    ? resolveLineElevationAt(headFrame.pos, opts.line, opts.hubRegistry)
    : elevation;
  const carZ = 0.5 * (tailZ + headZ) + (opts.elevationShift ?? 0);

  const horizDist = Math.max(0.5, chordDist, bogieHeadDistance - bogieTailDistance);
  const rawSlopeDeg = (Math.atan2(headZ - tailZ, horizDist) * 180) / Math.PI;
  const slopeDeg = Math.max(-18, Math.min(18, rawSlopeDeg));

  // matrix.js col0.z = -sin(pitch): negative pitch tilts local +X (cab nose) UP;
  // reversed tail cars rotate yaw +180° so their pitch flips sign to stay coplanar on ramps.
  const orientation: readonly [number, number, number] = isTailCar
    ? [slopeDeg, (baseYaw + 180) % 360, 90]
    : [-slopeDeg, baseYaw, 90];

  return {
    position: [midFrame.pos[0], midFrame.pos[1], carZ],
    orientation,
  };
}

function buildAssetCars(params: ModelLayerParams, assetKey: string): ModelCar[] {
  const cars: ModelCar[] = [];
  const trackOffsetM = dualTrackOffsetForZoom(params.zoom ?? 13);

  for (const train of params.trains) {
    if (!train.shapeId) continue;
    const rawShape = params.shapes.get(train.shapeId);
    if (!rawShape) continue;
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

    // Both direction === 0 and direction === 1 advance monotonically from 0 -> shape.length.
    const renderShape = smoothShapeForRender(rawShape);
    const headDistance = Math.max(
      0,
      Math.min(renderShape.length, (train.currentDistM ?? 0) + stock.total_length_m / 2)
    );
    const carsForTrain = splitIntoCars(
      renderShape,
      headDistance,
      stock.cars_count,
      stock.car_length_m,
      stock.inter_car_gap_m,
      1
    );
    const bogieSpanM = getBogieCentresM(stock);
    const spacingM = carCenterSpacingM(stock.car_length_m, stock.inter_car_gap_m);
    const line = params.lineMap?.get(train.line);
    const elevationShift =
      0.35 + (params.elevationOffset?.lineId === train.line ? params.elevationOffset.offset : 0);

    for (let index = 0; index < carsForTrain.length; index++) {
      const car = carsForTrain[index];
      if (car.length < 2) continue;
      const centerDistance = headDistance - index * spacingM - stock.car_length_m / 2;
      const isLeadCar = index === 0;
      const isTailCar = index === carsForTrain.length - 1 && carsForTrain.length > 1;
      const pose = computeCarModelPose({
        shape: renderShape,
        centerDistance,
        bogieSpanM,
        trackOffsetM,
        elevation: train.elevation || 0,
        elevationShift,
        line,
        hubRegistry: params.hubRegistry,
        isTailCar,
      });
      const yawDeg = pose.orientation[1];
      // Deck yaw = 90 - compassBearing, so local +X direction in ENU radians is yawDeg * PI/180
      const forwardRad = (yawDeg * Math.PI) / 180;
      cars.push({
        position: pose.position,
        orientation: pose.orientation,
        train,
        role: isLeadCar ? 'cab' : isTailCar ? 'tail' : 'neutral',
        forwardRad,
        halfLengthM: stock.car_length_m * 0.5,
      });
    }
  }
  return cars;
}

function buildLightBeamPolygon(
  car: ModelCar,
  lengthM: number,
  nearHalfW: number,
  farHalfW: number,
  zLiftM: number
): [number, number, number][] {
  const [lng, lat, z] = car.position;
  const latScale = 111_320;
  const lonScale = latScale * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const fx = Math.cos(car.forwardRad);
  const fy = Math.sin(car.forwardRad);
  const rx = -fy;
  const ry = fx;
  const start = car.halfLengthM + 0.15;
  const end = start + lengthM;
  const toPt = (along: number, across: number): [number, number, number] => [
    lng + (fx * along + rx * across) / lonScale,
    lat + (fy * along + ry * across) / latScale,
    z + zLiftM,
  ];
  return [
    toPt(start, -nearHalfW),
    toPt(start, nearHalfW),
    toPt(end, farHalfW),
    toPt(end, -farHalfW),
  ];
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
  const layers: any[] = [];
  const beamData: TrainLightBeamDatum[] = [];
  const emitBeams = (params.zoom ?? 13) >= 14.5;

  for (const [assetKey, family] of usedAssets.entries()) {
    if (params.grazingCamera && !MODEL_RENDER_POLICY[family].grazingCameraApproved) continue;
    if (assetStatus.get(assetKey) !== 'ready') continue;
    const gltf = parsedScenegraphs.get(assetKey);
    if (!gltf) continue;

    const cars = buildAssetCars(params, assetKey);
    if (cars.length === 0) continue;

    if (emitBeams) {
      for (const car of cars) {
        if (car.role === 'cab') {
          beamData.push({
            polygon: buildLightBeamPolygon(car, 14.5, 0.95, 2.35, 0.35),
            color: [255, 244, 198, car.position[2] < 0 ? 115 : 85],
            isUnderground: car.position[2] < 0,
          });
        } else if (car.role === 'tail') {
          beamData.push({
            polygon: buildLightBeamPolygon(car, 4.5, 0.85, 1.45, 0.35),
            color: [255, 58, 52, car.position[2] < 0 ? 95 : 70],
            isUnderground: car.position[2] < 0,
          });
        }
      }
    }

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

    const makeLayer = (
      id: string,
      scenegraph: any,
      data: ModelCar[],
      beforeId?: string
    ) =>
      new ScenegraphLayer<ModelCar>({
        id,
        data,
        ...(beforeId ? { beforeId } : {}),
        scenegraph,
        getPosition: (car: ModelCar) => car.position,
        getOrientation: (car: ModelCar) => car.orientation,
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
      } as any);

    const pushSplitLayers = (baseId: string, scenegraph: any, subset: ModelCar[]) => {
      if (subset.length === 0) return;
      if (!params.undergroundBeforeId) {
        layers.push(makeLayer(baseId, scenegraph, subset));
        return;
      }
      const isAlwaysVisible = (c: ModelCar) =>
        c.position[2] >= 0 || (Boolean(params.selectedTrainId) && c.train.id === params.selectedTrainId);
      const underground = subset.filter((c) => !isAlwaysVisible(c));
      const surface = subset.filter(isAlwaysVisible);
      if (underground.length > 0) {
        layers.push(makeLayer(`${baseId}-ug`, scenegraph, underground, params.undergroundBeforeId));
      }
      if (surface.length > 0) {
        layers.push(makeLayer(baseId, scenegraph, surface));
      }
    };

    pushSplitLayers(`subway-train-model-${assetKey}`, gltf, neutralCars);
    if (cabGltf) {
      pushSplitLayers(`subway-train-model-${assetKey}-cab`, cabGltf, combinedCabCars);
    }
    if (tailGltf) {
      pushSplitLayers(`subway-train-model-${assetKey}-tail`, tailGltf, tailCars);
    }
  }

  // Projected 3D headlight cones + red tail glows (1 lightweight layer per depth band)
  if (beamData.length > 0) {
    const makeBeamLayer = (id: string, subset: TrainLightBeamDatum[], beforeId?: string) =>
      new PolygonLayer<TrainLightBeamDatum>({
        id,
        data: subset,
        ...(beforeId ? { beforeId } : {}),
        pickable: false,
        extruded: false,
        filled: true,
        stroked: false,
        getPolygon: (d: TrainLightBeamDatum) => d.polygon,
        getFillColor: (d: TrainLightBeamDatum) => d.color,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      } as any);

    if (!params.undergroundBeforeId) {
      layers.push(makeBeamLayer('subway-train-headlight-beams', beamData));
    } else {
      const ug = beamData.filter((b) => b.isUnderground);
      const surf = beamData.filter((b) => !b.isUnderground);
      if (ug.length > 0) {
        layers.push(
          makeBeamLayer('subway-train-headlight-beams-ug', ug, params.undergroundBeforeId)
        );
      }
      if (surf.length > 0) {
        layers.push(makeBeamLayer('subway-train-headlight-beams', surf));
      }
    }
  }

  return layers;
}
