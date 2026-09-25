import type { CityConfig } from '@core/config';

export const parisConfig: CityConfig = {
  id: 'paris',
  slug: 'paris',
  displayName: 'paris',
  networkName: 'Métro de Paris',
  timezone: 'Europe/Paris',
  locale: 'fr-FR',
  modes: [
    {
      id: 'metro',
      displayName: 'Métro',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/download/?format=csv&timezone=Europe/Berlin&lang=fr',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 30
      },
      geometry: { source: 'idfm-osm' },
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
      realtime: { kind: 'per-trip-offsets' }
    }
  ],
  rollingStock: '/data/rolling-stock.json',
  gtfs: {
    sourceUrl: 'https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/download/?format=csv&timezone=Europe/Berlin&lang=fr',
    agencyFilter: ['IDFM:Operator_100', 'IDFM:Operator_71'],
    routeTypes: [1, 2],
    scheduleModel: 'trip-based',
    validityCheck: 'feed_info'
  },
  map: {
    center: [2.3488, 48.8534],
    zoom: 11.8,
    pitch: 30,
    bearing: -15,
    minZoom: 9,
    maxZoom: 18,
    ringRoadNames: [
      'Boulevard périphérique',
      'Boulevard Périphérique',
      'BP',
      'Périphérique'
    ]
  },
  realtime: {
    provider: 'prim',
    capability: { kind: 'per-trip-offsets' },
    pollIntervalMs: 180000,
    endpoints: {
      relay: '/api/prim',
      delays: '/api/prim_delays'
    }
  },
  attribution: {
    operatorName: 'RATP / Île-de-France Mobilités',
    datasetName: 'GTFS & PRIM SIRI-Lite',
    text: 'Powered by IDFM / RATP Open Data',
    licenseText: 'IDFM ODbL',
    licenseUrl: 'https://data.iledefrance-mobilites.fr',
    disclaimer: 'Projet indépendant, non affilié à la RATP ni à Île-de-France Mobilités.'
  },
  paths: {
    dataDir: '/data',
    modelsDir: '/models/train',
    rer: {
      shapesBin: '/data/rer_shapes.bin',
      scheduleJson: '/data/rer_schedule.json',
      linesJson: '/data/rer_lines.json'
    }
  }
};
