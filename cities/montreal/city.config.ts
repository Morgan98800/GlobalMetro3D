import type { CityConfig } from '@core/config';

export const montrealConfig: CityConfig = {
  id: 'montreal',
  slug: 'montreal',
  displayName: 'montréal',
  networkName: 'Métro de Montréal',
  timezone: 'America/Montreal',
  locale: 'fr-CA',
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
    provider: 'none',
    pollIntervalMs: 30000
  },
  attribution: {
    operatorName: 'Société de transport de Montréal (STM)',
    datasetName: 'GTFS STM',
    licenseText: 'STM Open Data',
    licenseUrl: 'https://www.stm.info/fr/a-propos/developpeurs',
    disclaimer: 'Projet indépendant, non affilié à la Société de transport de Montréal (STM).'
  },
  paths: {
    dataDir: '/cities/montreal/data',
    modelsDir: '/models/train'
  }
};
