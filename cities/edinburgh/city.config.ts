import type { CityConfig } from '@core/config';

export const edinburghConfig: CityConfig = {
  id: 'edinburgh',
  slug: 'edimbourg',
  displayName: 'edimbourg',
  networkName: 'Edinburgh Trams',
  timezone: 'Europe/London',
  locale: 'en-GB',
  modes: [
    {
      id: 'tram',
      displayName: 'Tram',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/scotland/',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 14 // [verified: false]
      },
      geometry: { source: 'osm-relation-4116776' },
      kinematics: {
        maxSpeedKmh: 70,       // [verified: false] Vitesse maximale en site propre (Airport -> Haymarket)
        accelMs2: 1.0,         // [verified: false] Accélération nominale CAF Urbos 3 (1.0 m/s²)
        decelMs2: 1.0,         // [verified: false] Décélération de service (1.0 m/s²)
        dwellSec: 20,          // [verified: false] Temps d'arrêt nominal moyen en station
        vMaxMs: 19.44,         // [verified: false] 70 km/h / 3.6
        k: 0.25,               // [verified: false]
        windowM: 90,           // [verified: false]
        minDwellSec: 15,       // [verified: false]
        matchWindowSec: 120,   // [verified: false]
        maxDelaySec: 900,      // [verified: false]
        alpha: 0.4,            // [verified: false]
        decayDistanceM: 4000,  // [verified: false]
        staleAfterSec: 360,    // [verified: false]
        reconcileDurationMs: 300, // [verified: false]
        reconcileThresholdM: 20   // [verified: false]
      },
      realtime: { kind: 'service-status-only' } // [verified: false] Mode théorique pur (statut seul)
    }
  ],
  map: {
    center: [-3.205, 55.952],
    zoom: 13.5,
    pitch: 55,
    bearing: -15,
    minZoom: 10,
    maxZoom: 18,
    bounds: [-3.37, 55.92, -3.15, 55.99]
  },
  rollingStock: 'caf_urbos_3', // [verified: false] CAF Urbos 3
  attribution: {
    operatorName: 'Edinburgh Trams',
    datasetName: 'Bus Open Data Service (BODS) Scotland GTFS',
    licenseText: 'Open Government Licence v3.0 (OGL v3)',
    licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    disclaimer: 'Projet indépendant de visualisation cartographique. Aucune affiliation avec Edinburgh Trams, Transport for Edinburgh ou City of Edinburgh Council.'
  },
  paths: {
    dataDir: '/cities/edinburgh/data',
    modelsDir: '/models/train'
  },
  gtfs: {
    sourceUrl: 'https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/scotland/',
    agencyFilter: ['OP599'],
    routeTypes: [0],
    routeIdAllowlist: ['2908'],
    scheduleModel: 'trip-based',
    validityCheck: 'calendar'
  },
  realtime: {
    provider: 'none',
    pollIntervalMs: 15000
  }
};
