import type { CityConfig } from '@core/config';

export const londonConfig: CityConfig = {
  id: 'london',
  slug: 'londres',
  displayName: 'londres',
  networkName: 'London Underground',
  timezone: 'Europe/London',
  locale: 'fr-FR',
  modes: [
    {
      id: 'tube',
      displayName: 'Tube',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://tfl.gov.uk/tfl/syndication/feeds/journey-planner-timetables.zip',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 14
      },
      geometry: { source: 'osm-oobrien' },
      kinematics: {
        maxSpeedKmh: 75,
        accelMs2: 1.15,
        decelMs2: 1.25,
        dwellSec: 25,
        vMaxMs: 20.8,
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
      realtime: { kind: 'arrival-predictions' }
    },
    {
      id: 'dlr',
      displayName: 'DLR',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://tfl.gov.uk/tfl/syndication/feeds/journey-planner-timetables.zip',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 14
      },
      geometry: { source: 'osm-oobrien' },
      kinematics: {
        maxSpeedKmh: 80,
        accelMs2: 1.0,
        decelMs2: 1.0,
        dwellSec: 20,
        vMaxMs: 22.2,
        k: 0.25,
        windowM: 80,
        minDwellSec: 15,
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 3000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'arrival-predictions' }
    },
    {
      id: 'elizabeth-line',
      displayName: 'Elizabeth line',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://tfl.gov.uk/tfl/syndication/feeds/journey-planner-timetables.zip',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 14
      },
      geometry: { source: 'osm-oobrien' },
      kinematics: {
        maxSpeedKmh: 140,
        accelMs2: 1.0,
        decelMs2: 1.0,
        dwellSec: 30,
        vMaxMs: 38.9,
        k: 0.25,
        windowM: 100,
        minDwellSec: 20,
        matchWindowSec: 120,
        maxDelaySec: 900,
        alpha: 0.4,
        decayDistanceM: 5000,
        staleAfterSec: 360,
        reconcileDurationMs: 300,
        reconcileThresholdM: 20
      },
      realtime: { kind: 'arrival-predictions' }
    },
    {
      id: 'overground',
      displayName: 'London Overground',
      enabled: true,
      schedule: {
        format: 'gtfs',
        sourceUrl: 'https://tfl.gov.uk/tfl/syndication/feeds/journey-planner-timetables.zip',
        scheduleModel: 'trip-based',
        stalenessToleranceDays: 14
      },
      geometry: { source: 'osm-oobrien' },
      kinematics: {
        maxSpeedKmh: 100,
        accelMs2: 1.0,
        decelMs2: 1.0,
        dwellSec: 25,
        vMaxMs: 27.8,
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
      realtime: { kind: 'arrival-predictions' }
    }
  ],
  rollingStock: '/cities/london/data/rolling-stock.json',
  gtfs: {
    sourceUrl: 'https://tfl.gov.uk/tfl/syndication/feeds/journey-planner-timetables.zip',
    agencyFilter: ['Transport for London', 'London Underground', 'Docklands Light Railway', 'Elizabeth line', 'London Overground'],
    routeTypes: [1],
    scheduleModel: 'trip-based',
    validityCheck: 'calendar'
  },
  map: {
    center: [-0.1276, 51.5074],
    zoom: 10.5,
    pitch: 30,
    bearing: 0,
    minZoom: 9,
    maxZoom: 18,
    bounds: [[-1.05, 51.35], [0.40, 51.75]]
  },
  realtime: {
    provider: 'tfl-unified',
    capability: { kind: 'arrival-predictions' },
    pollIntervalMs: 60000,
    endpoints: {
      relay: '/api/tfl_arrivals'
    }
  },
  attribution: {
    operatorName: 'Transport for London (TfL)',
    datasetName: 'TfL Open Data / Journey Planner Timetables',
    text: 'Powered by TfL Open Data · Rail geometry © Oliver O\'Brien / OpenStreetMap contributors (ODbL)',
    licenseText: 'TfL Open Data Licence & ODbL',
    licenseUrl: 'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    disclaimer: 'Projet indépendant, non affilié à Transport for London (TfL).'
  },
  paths: {
    dataDir: '/cities/london/data',
    modelsDir: '/models/train'
  }
};
