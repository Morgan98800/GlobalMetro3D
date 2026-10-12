import type { CityConfig } from '@core/config';

export const washingtonConfig: CityConfig = {
  id: 'washington',
  slug: 'washington',
  displayName: 'Washington DC',
  networkName: 'Metrorail (WMATA)',
  timezone: 'America/New_York',
  locale: 'en-US',
  modes: [
    {
      id: 'metro',
      displayName: 'Metrorail',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://api.wmata.com/gtfs/rail-gtfs-static.zip',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 7
      },
      geometry: { source: 'wmata-gtfs' },
      kinematics: {
        maxSpeedKmh: 95, // [verified: false] 59 mph = ~95 km/h vitesse de croisière Metrorail
        accelMs2: 1.15,  // [verified: false] Accélération de service Kawasaki 7000
        decelMs2: 1.15,  // [verified: false] Décélération de service
        dwellSec: 25,    // [verified: false] Temps d'arrêt nominal en station
        vMaxMs: 26.4,    // [verified: false] 95 km/h en m/s
        k: 0.25,         // Profil trapézoïdal standard (25% acc, 50% croisière, 25% freinage)
        windowM: 80,
        minDwellSec: 20, // [verified: false] Temps d'arrêt minimal en station
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 4000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'arrival-predictions' }
    }
  ],
  rollingStock: '/cities/washington/data/rolling-stock.json',
  gtfs: {
    sourceUrl: 'https://api.wmata.com/gtfs/rail-gtfs-static.zip',
    agencyFilter: ['1'],
    routeTypes: [1],
    routeIdAllowlist: ['RED', 'ORANGE', 'SILVER', 'BLUE', 'GREEN', 'YELLOW'],
    scheduleModel: 'trip-based',
    validityCheck: 'calendar'
  },
  map: {
    center: [-77.0369, 38.9072],
    zoom: 11.0,
    pitch: 30,
    bearing: 0,
    minZoom: 9,
    maxZoom: 18,
    bounds: [[-77.55, 38.70], [-76.80, 39.20]]
  },
  realtime: {
    provider: 'gtfs-rt',
    capability: { kind: 'arrival-predictions' },
    pollIntervalMs: 15000,
    endpoints: {
      relay: '/api/washington-rt'
    }
  },
  attribution: {
    operatorName: 'Washington Metropolitan Area Transit Authority (WMATA)',
    datasetName: 'WMATA Metrorail GTFS Static & Realtime',
    text: 'Data provided by WMATA Open Data · Independent project, not affiliated with WMATA',
    licenseText: 'WMATA Transit Data License Agreement',
    licenseUrl: 'https://developer.wmata.com/license',
    disclaimer: 'This application is not officially endorsed, sponsored, or affiliated with the Washington Metropolitan Area Transit Authority (WMATA). No official WMATA logos are used.'
  },
  paths: {
    dataDir: '/cities/washington/data',
    modelsDir: '/models/train'
  }
};
