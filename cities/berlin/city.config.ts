import type { CityConfig } from '@core/config';

export const berlinConfig: CityConfig = {
  id: 'berlin',
  slug: 'berlin',
  displayName: 'berlin',
  networkName: 'U-Bahn (BVG)',
  timezone: 'Europe/Berlin',
  locale: 'de-DE',
  modes: [
    {
      id: 'metro',
      displayName: 'U-Bahn',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://www.vbb.de/gtfs',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 7
      },
      geometry: { source: 'vbb-gtfs' },
      kinematics: {
        maxSpeedKmh: 70, // [verified: false] Vitesse maximale nominale U-Bahn Großprofil (70 km/h) calibrée sur GTFS
        accelMs2: 1.15,  // [verified: false] Accélération de service (1.15 m/s²)
        decelMs2: 1.15,  // [verified: false] Décélération de service (1.15 m/s²)
        dwellSec: 20,    // [verified: false] Temps d'arrêt nominal en station
        vMaxMs: 19.44,   // [verified: false] 70 km/h en m/s
        k: 0.25,         // Profil trapézoïdal standard (25% acc, 50% croisière, 25% freinage)
        windowM: 60,
        minDwellSec: 20, // [verified: false] Temps d'arrêt minimal en station (le GTFS VBB a arrival == departure)
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 3000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'arrival-predictions' }
    }
  ],
  rollingStock: '/cities/berlin/data/rolling-stock.json',
  gtfs: {
    sourceUrl: 'https://www.vbb.de/gtfs',
    agencyFilter: ['796'],
    routeTypes: [400],
    routeIdAllowlist: [
      '17512_400', 'U1',
      '17514_400', 'U2',
      '17515_400', 'U3',
      '17516_400', 'U4',
      '17518_400', 'U5',
      '17521_400', 'U6',
      '17523_400', 'U7',
      '17525_400', 'U8',
      '17526_400', 'U9'
    ],
    scheduleModel: 'trip-based',
    validityCheck: 'calendar'
  },
  map: {
    center: [13.411267, 52.521512], // Alexanderplatz
    zoom: 11.5,
    pitch: 30,
    bearing: 0,
    minZoom: 9,
    maxZoom: 18,
    bounds: [[13.05, 52.35], [13.75, 52.68]]
  },
  realtime: {
    provider: 'gtfs-rt',
    capability: { kind: 'arrival-predictions' },
    pollIntervalMs: 15000,
    endpoints: {
      relay: '/api/berlin-rt'
    }
  },
  attribution: {
    operatorName: 'Berliner Verkehrsbetriebe (BVG)',
    datasetName: 'VBB GTFS Schedule & Realtime',
    licenseText: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    text: 'Données : VBB, CC BY 4.0 · Projet indépendant non affilié à la BVG ou au VBB',
    disclaimer: 'Ce projet est une initiative indépendante de cartographie et de visualisation. Il n\'est ni affilié, ni approuvé, ni sponsorisé par la Berliner Verkehrsbetriebe (BVG) ou le Verkehrsverbund Berlin-Brandenburg (VBB).'
  },
  paths: {
    dataDir: '/cities/berlin/data',
    modelsDir: '/models/train'
  }
};
