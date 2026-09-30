import type { CityConfig } from '@core/config';

export const lilleConfig: CityConfig = {
  id: 'lille',
  slug: 'lille',
  displayName: 'lille',
  networkName: 'Métro & Tramway Ilévia',
  timezone: 'Europe/Paris',
  locale: 'fr-FR',
  modes: [
    {
      id: 'metro',
      displayName: 'Métro',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://media.ilevia.fr/opendata/gtfs.zip',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 7
      },
      geometry: { source: 'osm-ilevia' },
      kinematics: {
        maxSpeedKmh: 80, // [verified: false] valeur nominale constructeur VAL 208 à calibrer en Phase 2
        accelMs2: 1.3,   // [verified: false] accélération VAL sur pneu à calibrer en Phase 2
        decelMs2: 1.3,   // [verified: false] décélération VAL sur pneu à calibrer en Phase 2
        dwellSec: 20,    // [verified: false] temps d'arrêt par défaut
        vMaxMs: 22.2,    // [verified: false] 80 km/h en m/s
        k: 0.25,
        windowM: 60,
        minDwellSec: 15,
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 3000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'service-status-only' }
    }
  ],
  rollingStock: '/cities/lille/data/rolling-stock.json',
  gtfs: {
    sourceUrl: 'https://media.ilevia.fr/opendata/gtfs.zip',
    agencyFilter: ['ILE'],
    routeTypes: [1],
    routeIdAllowlist: ['ME1'],
    scheduleModel: 'trip-based',
    validityCheck: 'calendar'
  },
  map: {
    center: [3.0573, 50.6292],
    zoom: 12.2,
    pitch: 30,
    bearing: 0,
    minZoom: 9,
    maxZoom: 18,
    bounds: [[2.95, 50.55], [3.25, 50.75]]
  },
  realtime: {
    provider: 'none', // Mode théorique pour la Phase 1 (l'adaptateur sera activé en Phase 3)
    capability: { kind: 'service-status-only' },
    pollIntervalMs: 30000,
    endpoints: {
      relay: '/api/lille-rt'
    }
  },
  attribution: {
    operatorName: 'Ilévia (Keolis Lille Métropole)',
    datasetName: 'Horaires et arrêts Ilévia / Métropole Européenne de Lille',
    text: 'Données ouvertes MEL & Ilévia (Licence Ouverte 2.0) · Voies ferroviaires © contributeurs OpenStreetMap (ODbL)',
    licenseText: 'Licence Ouverte 2.0 & ODbL',
    licenseUrl: 'https://data.lillemetropole.fr',
    disclaimer: 'Projet indépendant, non affilié à la Métropole Européenne de Lille (MEL) ou Ilévia.'
  },
  paths: {
    dataDir: '/cities/lille/data',
    modelsDir: '/models/train'
  }
};
