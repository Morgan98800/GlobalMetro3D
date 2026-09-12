export type ScheduleModel = 'trip-based' | 'frequency-expanded';
export type RealtimeProvider = 'prim' | 'gtfs-rt' | 'none';

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
  bearing: number;
  minZoom: number;
  maxZoom: number;
  bounds?: [[number, number], [number, number]];
  ringRoadNames?: string[];
}

export interface CityRealtimeConfig {
  provider: RealtimeProvider;
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
  gtfs: CityGtfsConfig;
  map: CityMapConfig;
  realtime: CityRealtimeConfig;
  attribution: CityAttribution;
  paths: CityPathsConfig;
}
