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
        maxSpeedKmh: 80, // [verified: false] Vitesse maximale nominale VAL 208 calibrée sur inter-stations GTFS
        accelMs2: 1.3,   // [verified: false] Accélération maximale nominale VAL sur pneumatiques
        decelMs2: 1.3,   // [verified: false] Décélération de service VAL sur pneumatiques
        dwellSec: 20,    // [verified: false] Temps d'arrêt en station
        vMaxMs: 22.2,    // [verified: false] 80 km/h en m/s
        k: 0.25,         // Profil trapézoïdal standard (25% acc, 50% croisière, 25% freinage)
        windowM: 60,
        minDwellSec: 20, // [verified: false] Temps d'arrêt minimal en station (le GTFS Ilévia ne distingue pas arr/dep)
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 3000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'service-status-only' }
    },
    {
      id: 'tram',
      displayName: 'Tram',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://media.ilevia.fr/opendata/gtfs.zip',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 7
      },
      geometry: { source: 'osm-ilevia' },
      kinematics: {
        maxSpeedKmh: 70, // [verified: false] Vitesse maximale nominale Breda VLC calibrée sur inter-stations GTFS
        accelMs2: 1.1,   // [verified: false] Accélération de service tramway
        decelMs2: 1.1,   // [verified: false] Décélération de service tramway
        dwellSec: 15,    // [verified: false] Temps d'arrêt en station tramway
        vMaxMs: 19.4,    // [verified: false] 70 km/h en m/s
        k: 0.25,         // Profil trapézoïdal standard
        windowM: 60,
        minDwellSec: 10, // [verified: false]
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 2000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'arrival-predictions' }
    }
  ],
  rollingStock: '/cities/lille/data/rolling-stock.json',
  gtfs: {
    sourceUrl: 'https://media.ilevia.fr/opendata/gtfs.zip',
    agencyFilter: ['ILE'],
    routeTypes: [0, 1],
    routeIdAllowlist: ['ME1', 'ME2', '71', 'TRAM_R', 'TRAM_T'],
    scheduleModel: 'trip-based',
    validityCheck: 'calendar'
  },
  map: {
    center: [3.10, 50.66],
    zoom: 11.8,
    pitch: 30,
    bearing: 0,
    minZoom: 9,
    maxZoom: 18,
    bounds: [[2.95, 50.55], [3.25, 50.75]]
  },
  realtime: {
    provider: 'gtfs-rt',
    capability: { kind: 'arrival-predictions' },
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
