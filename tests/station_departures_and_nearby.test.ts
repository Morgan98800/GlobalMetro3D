import { describe, expect, it } from 'vitest';
import type { Timeline } from '@core/rt/rt_matching';
import { computeStationDepartures } from '@core/sim/browser_engine';
import type { TripData } from '@core/sim/kinematics';
import type { LineMetadata, StationMetadata } from '@core/types';
import { findNearbyStations, haversineDistanceM } from '@core/ui/utils/nearby_stations';

describe('nearby stations & haversine distance', () => {
  it('computes accurate Paris distances and sorts nearest stations first', () => {
    const chatelet: [number, number] = [2.347, 48.8584];
    const lesHalles: [number, number] = [2.345, 48.862];
    const dist = haversineDistanceM(chatelet, lesHalles);
    expect(dist).toBeGreaterThan(350);
    expect(dist).toBeLessThan(500);

    const stations: StationMetadata[] = [
      {
        id: 'far',
        name: 'Nation',
        coordinates: [2.3958, 48.8483],
        lines: ['1', '2', '6', '9'],
        is_hub: true,
        wheelchair_boarding: 1,
      },
      {
        id: 'near',
        name: 'Châtelet',
        coordinates: chatelet,
        lines: ['1', '4', '7', '11', '14'],
        is_hub: true,
        wheelchair_boarding: 1,
      },
      {
        id: 'mid',
        name: 'Louvre - Rivoli',
        coordinates: [2.3408, 48.8608],
        lines: ['1'],
        is_hub: false,
        wheelchair_boarding: 0,
      },
    ];

    const nearby = findNearbyStations(stations, [2.3472, 48.8585], 2);
    expect(nearby).toHaveLength(2);
    expect(nearby[0].station.name).toBe('Châtelet');
    expect(nearby[0].walkMinutes).toBe(1);
    expect(nearby[1].station.name).toBe('Louvre - Rivoli');
  });
});

describe('computeStationDepartures', () => {
  const linesMap = new Map<string, LineMetadata>([
    [
      '1',
      {
        id: '1',
        short_name: '1',
        long_name: 'La Défense ↔ Château de Vincennes',
        mode: 'metro',
        color: '#FFCE00',
        text_color: '#000000',
        destinations: { '0': 'La Défense', '1': 'Château de Vincennes' },
        measured_length_km: 16.5,
        elevation_offset: 0,
      },
    ],
  ]);

  const trips: TripData[] = [
    {
      id: 'trip-1',
      line: '1',
      dir: 0,
      destName: 'La Défense',
      shapeId: 's1',
      t0: 36000,
      t1: 36320,
      stops: [
        [36000, 36020, 0, 'Nation'],
        [36120, 36140, 500, 'Châtelet'],
        [36300, 36320, 1200, 'La Défense'],
      ],
    },
    {
      id: 'trip-2',
      line: '1',
      dir: 0,
      destName: 'La Défense',
      shapeId: 's1',
      t0: 35800,
      t1: 36200,
      stops: [
        [35800, 35820, 0, 'Nation'],
        [36000, 36020, 500, 'Châtelet'],
        [36180, 36200, 1200, 'La Défense'],
      ],
    },
    {
      id: 'trip-suppressed',
      line: '1',
      dir: 0,
      destName: 'La Défense',
      shapeId: 's1',
      t0: 35900,
      t1: 36260,
      stops: [
        [35900, 35920, 0, 'Nation'],
        [36060, 36080, 500, 'Châtelet'],
        [36240, 36260, 1200, 'La Défense'],
      ],
    },
    {
      id: 'trip-terminating',
      line: '1',
      dir: 1,
      destName: 'Châtelet',
      shapeId: 's1',
      t0: 35900,
      t1: 36100,
      stops: [
        [35900, 35920, 0, 'La Défense'],
        [36080, 36100, 700, 'Châtelet'],
      ],
    },
  ];

  it('filters suppressed trips, ignores terminal drop-offs, and applies RT timelines', () => {
    const timelines = new Map<string, Timeline>([
      [
        'trip-1',
        {
          tripId: 'trip-1',
          lineId: '1',
          shapeId: 's1',
          dir: 0,
          lastMeasurementAt: 36010,
          measuredCount: 1,
          stops: [
            {
              stopId: 'n0',
              arr: 36000,
              dep: 36020,
              dist: 0,
              cArr: 36000,
              cDep: 36020,
              measured: false,
            },
            {
              stopId: 'n1',
              arr: 36120,
              dep: 36140,
              dist: 500,
              cArr: 36180,
              cDep: 36200,
              measured: true,
            },
            {
              stopId: 'n2',
              arr: 36300,
              dep: 36320,
              dist: 1200,
              cArr: 36360,
              cDep: 36380,
              measured: false,
            },
          ],
        },
      ],
    ]);

    const departures = computeStationDepartures({
      stationName: 'Châtelet',
      trips,
      linesMap,
      timelines,
      suppressedTripIds: new Set(['trip-suppressed']),
      serviceSecondsCandidates: [36010],
      limitPerLineDir: 2,
    });

    expect(departures).toHaveLength(2);
    expect(departures[0].tripId).toBe('trip-2');
    expect(departures[0].atStop).toBe(true);
    expect(departures[0].confidence).toBe('scheduled');

    expect(departures[1].tripId).toBe('trip-1');
    expect(departures[1].atStop).toBe(false);
    expect(departures[1].waitMinutes).toBe(3); // 36180 - 36010 = 170s -> 3 min
    expect(departures[1].confidence).toBe('measured');
  });

  it('returns empty array on closed lines', () => {
    const departures = computeStationDepartures({
      stationName: 'Châtelet',
      trips,
      linesMap,
      closedLineIds: new Set(['1']),
      serviceSecondsCandidates: [36010],
    });
    expect(departures).toEqual([]);
  });
});
