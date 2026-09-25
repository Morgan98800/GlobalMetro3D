export type ScheduleFormat = 'gtfs' | 'transxchange';
export type ScheduleModel = 'trip-based' | 'frequency-expanded';

export type RealtimeCapability =
  | { kind: 'per-trip-offsets' }
  | { kind: 'service-status-only' }
  | { kind: 'arrival-predictions' };

export type RealtimeProvider = 'prim' | 'stm-i3' | 'tfl-unified' | 'gtfs-rt' | 'none';

export interface ModeKinematics {
  maxSpeedKmh: number;
  accelMs2: number;
  decelMs2: number;
  dwellSec: number;
  vMaxMs: number;
  k?: number;
  windowM?: number;
  minDwellSec?: number;
  matchWindowSec?: number;
  maxDelaySec?: number;
  alpha?: number;
  decayDistanceM?: number;
  staleAfterSec?: number;
  reconcileDurationMs?: number;
  reconcileThresholdM?: number;
}

export interface ModeConfig {
  id: string;
  displayName: string;
  enabled: boolean;
  schedule: {
    format: ScheduleFormat;
    sourceUrl: string;
    scheduleModel: ScheduleModel;
    stalenessToleranceDays: number;
  };
  geometry: { source: string };
  kinematics: ModeKinematics;
  realtime: RealtimeCapability;
}

export interface CityGtfsConfig {
  sourceUrl: string;
  agencyFilter: string[];
  routeTypes: number[];
  routeIdAllowlist?: string[];
  scheduleModel: ScheduleModel;
  validityCheck: 'feed_info' | 'calendar';
  cleanStationPrefix?: string;
}

export interface CityMapConfig {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing?: number;
  minZoom?: number;
  maxZoom?: number;
  bounds?: [number, number, number, number] | [[number, number], [number, number]];
  ringRoadNames?: string[];
}

export interface CityRealtimeConfig {
  provider: RealtimeProvider;
  capability?: RealtimeCapability;
  pollIntervalMs: number;
  endpoints?: {
    relay?: string;
    delays?: string;
    alerts?: string;
  };
}

export interface CityAttribution {
  operatorName: string;
  datasetName: string;
  text?: string;
  licenseText: string;
  licenseUrl: string;
  disclaimer: string;
}

export interface CityRerConfig {
  shapesBin: string;
  scheduleJson: string;
  linesJson?: string;
}

export interface CityPathsConfig {
  dataDir: string;
  modelsDir: string;
  rer?: CityRerConfig;
}

export interface CityConfig {
  id: string;
  slug: string;
  displayName: string;
  networkName: string;
  timezone: string;
  locale: string;
  modes: ModeConfig[];
  map: CityMapConfig;
  rollingStock: string;
  attribution: CityAttribution;
  paths: CityPathsConfig;
  gtfs?: CityGtfsConfig;
  realtime: CityRealtimeConfig;
}
