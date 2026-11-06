import type { CityConfig } from '@core/config';

export const edinburghConfig: CityConfig = {
  id: 'edinburgh',
  slug: 'edimbourg',
  displayName: 'edimbourg',
  networkName: 'ScotRail & National Rail',
  timezone: 'Europe/London',
  locale: 'en-GB',
  modes: [
    {
      id: 'train',
      displayName: 'Train',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://publicdatafeeds.networkrail.co.uk/',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 14 // [verified: false]
      },
      geometry: { source: 'osm-rail-edinburgh' },
      kinematics: {
        maxSpeedKmh: 160,      // [verified: false] ScotRail Class 385 100 mph (160 km/h)
        accelMs2: 0.85,        // [verified: false] Accélération nominale Hitachi Class 385
        decelMs2: 0.9,         // [verified: false] Décélération de service
        dwellSec: 30,          // [verified: false] Temps d'arrêt nominal en gare
        vMaxMs: 44.44,         // [verified: false] 160 km/h / 3.6
        k: 0.25,               // [verified: false]
        windowM: 120,          // [verified: false]
        minDwellSec: 20,       // [verified: false]
        matchWindowSec: 180,   // [verified: false]
        maxDelaySec: 1200,     // [verified: false]
        alpha: 0.4,            // [verified: false]
        decayDistanceM: 5000,  // [verified: false]
        staleAfterSec: 360,    // [verified: false]
        reconcileDurationMs: 300, // [verified: false]
        reconcileThresholdM: 30   // [verified: false]
      },
      realtime: { kind: 'service-status-only' }
    }
  ],
  map: {
    center: [-3.205, 55.95],
    zoom: 13.5,
    pitch: 55,
    bearing: -15,
    minZoom: 10,
    maxZoom: 18,
    bounds: [-3.38, 55.89, -3.15, 55.99]
  },
  rollingStock: 'automotrice_ecossaise',
  attribution: {
    operatorName: 'ScotRail & National Rail',
    datasetName: 'Network Rail Open Data Feeds & NaPTAN',
    licenseText: 'Open Government Licence v3.0 (OGL v3)',
    licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    disclaimer: 'Visualisation 3D indépendante du réseau ferroviaire d’Édimbourg et de la vallée de Waverley.'
  },
  paths: {
    dataDir: '/cities/edinburgh/data',
    modelsDir: '/cities/edinburgh/models'
  },
  realtime: {
    provider: 'none',
    pollIntervalMs: 15000
  }
};
