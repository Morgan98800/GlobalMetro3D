import type { CityConfig } from '@core/config';

export const montrealConfig: CityConfig = {
  id: 'montreal',
  slug: 'montreal',
  displayName: 'montréal',
  networkName: 'Métro de Montréal',
  timezone: 'America/Montreal',
  locale: 'fr-CA',
  modes: [
    {
      id: 'metro',
      displayName: 'Métro',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://www.stm.info/sites/default/files/gtfs/gtfs_stm.zip',
        scheduleModel: 'frequency-expanded',
        stalenessToleranceDays: 90
      },
      geometry: { source: 'stm-gtfs' },
      kinematics: {
        maxSpeedKmh: 90,
        accelMs2: 1.0,
        decelMs2: 1.2,
        dwellSec: 20,
        vMaxMs: 25,
        k: 0.25,
        windowM: 90,
        minDwellSec: 20,
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 4000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'service-status-only' }
    }
  ],
  rollingStock: '/cities/montreal/data/rolling-stock.json',
  gtfs: {
    sourceUrl: 'https://www.stm.info/sites/default/files/gtfs/gtfs_stm.zip',
    agencyFilter: ['STM'],
    routeTypes: [1],
    routeIdAllowlist: ['1', '2', '4', '5'],
    scheduleModel: 'frequency-expanded',
    validityCheck: 'calendar',
    cleanStationPrefix: 'Station '
  },
  map: {
    center: [-73.5673, 45.5017],
    zoom: 11.8,
    pitch: 30,
    bearing: -15,
    minZoom: 9,
    maxZoom: 18
  },
  realtime: {
    provider: 'stm-i3',
    capability: { kind: 'service-status-only' },
    pollIntervalMs: 120000,
    endpoints: {
      relay: '/api/stm'
    }
  },
  attribution: {
    operatorName: 'Société de transport de Montréal (STM)',
    datasetName: 'GTFS STM',
    text: 'Données ouvertes STM',
    licenseText: 'STM Open Data',
    licenseUrl: 'https://www.stm.info/fr/a-propos/developpeurs',
    disclaimer: 'Projet indépendant, non affilié à la Société de transport de Montréal (STM).'
  },
  paths: {
    dataDir: '/cities/montreal/data',
    modelsDir: '/models/train'
  }
};
