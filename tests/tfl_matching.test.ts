import { describe, it, expect, beforeEach } from 'vitest';
import { TflHybridMatcher } from '@core/rt/tfl_matching';
import type { SchedTrip } from '@core/rt/rt_matching';
import type { TflArrivalPrediction } from '../netlify/functions/tfl_relay';

describe('TfL Hybrid Matching & Product Honesty (Phase 4)', () => {
  let matcher: TflHybridMatcher;

  // Mock active scheduled trips on Victoria line
  const mockTrip1: SchedTrip = {
    tripId: 'VIC-001',
    lineId: 'victoria',
    dir: 0,
    shapeId: 'victoria_0_1',
    stops: [
      { stopId: '940GZZLUWRR', arr: 30000, dep: 30025, dist: 0 },
      { stopId: '940GZZLUOXC', arr: 30120, dep: 30145, dist: 1200 },
      { stopId: '940GZZLUGPK', arr: 30240, dep: 30265, dist: 2400 }
    ]
  };

  const mockTrip2: SchedTrip = {
    tripId: 'VIC-002',
    lineId: 'victoria',
    dir: 0,
    shapeId: 'victoria_0_1',
    stops: [
      { stopId: '940GZZLUWRR', arr: 30300, dep: 30325, dist: 0 },
      { stopId: '940GZZLUOXC', arr: 30420, dep: 30445, dist: 1200 },
      { stopId: '940GZZLUGPK', arr: 30540, dep: 30565, dist: 2400 }
    ]
  };

  const mockTripCentral: SchedTrip = {
    tripId: 'CEN-001',
    lineId: 'central',
    dir: 0,
    shapeId: 'central_0_1',
    stops: [
      { stopId: '940GZZLUOXC', arr: 30100, dep: 30125, dist: 500 },
      { stopId: '940GZZLUTCT', arr: 30200, dep: 30225, dist: 1500 }
    ]
  };

  beforeEach(() => {
    matcher = new TflHybridMatcher({
      matchWindowSec: 120,
      maxDelaySec: 900,
      alpha: 0.4
    });
  });

  it('matches a train by vehicleId and locks the association', () => {
    const currentCivilSeconds = 30060; // 08:21:00

    // Live arrival prediction for vehicle "224" approaching Oxford Circus in 70 seconds
    // Expected arrival = 30060 + 70 = 30130 (scheduled is 30120, delay = +10s)
    const arrival: TflArrivalPrediction = {
      id: 'arr-1',
      lineId: 'victoria',
      vehicleId: '224',
      stationId: '940GZZLUOXC',
      stationName: 'Oxford Circus',
      direction: 'outbound',
      timeToStation: 70,
      expectedArrival: '2026-09-25T08:22:10Z',
      destinationStationId: '940GZZLUBXN'
    };

    const outcome = matcher.match([arrival], [mockTrip1, mockTrip2], currentCivilSeconds);

    expect(outcome.matchedCount).toBe(1);
    expect(outcome.totalActiveCount).toBe(2);
    expect(outcome.coveragePct).toBe(50);
    expect(outcome.lockedVehiclesCount).toBe(1);

    const matchTrip1 = outcome.matchesByTripId.get('VIC-001');
    expect(matchTrip1).toBeDefined();
    expect(matchTrip1?.confidence).toBe('measured');
    expect(matchTrip1?.vehicleId).toBe('224');
    expect(matchTrip1?.delayS).toBe(10); // 30130 - 30120 = +10s

    // Trip 2 was not matched and remains in 'scheduled' (Product Honesty)
    const matchTrip2 = outcome.matchesByTripId.get('VIC-002');
    expect(matchTrip2).toBeDefined();
    expect(matchTrip2?.confidence).toBe('scheduled');
    expect(matchTrip2?.delayS).toBe(0);
  });

  it('maintains vehicleId lock on consecutive ticks even as train advances', () => {
    // Tick 1: match vehicle "224" to VIC-001
    matcher.match(
      [
        {
          id: 'arr-1',
          lineId: 'victoria',
          vehicleId: '224',
          stationId: '940GZZLUOXC',
          stationName: 'Oxford Circus',
          direction: 'outbound',
          timeToStation: 60,
          expectedArrival: '2026-09-25T08:22:00Z',
          destinationStationId: '940GZZLUBXN'
        }
      ],
      [mockTrip1, mockTrip2],
      30060
    );

    expect(matcher.match([], [mockTrip1], 30060).lockedVehiclesCount).toBe(1);

    // Tick 2: 30 seconds later (30090), vehicle "224" is now predicting arrival at Green Park in 160s
    // Scheduled Green Park is 30240, expected is 30090 + 160 = 30250 (delay +10s)
    const tick2Outcome = matcher.match(
      [
        {
          id: 'arr-2',
          lineId: 'victoria',
          vehicleId: '224',
          stationId: '940GZZLUGPK',
          stationName: 'Green Park',
          direction: 'outbound',
          timeToStation: 160,
          expectedArrival: '2026-09-25T08:24:10Z',
          destinationStationId: '940GZZLUBXN'
        }
      ],
      [mockTrip1, mockTrip2],
      30090
    );

    const match = tick2Outcome.matchesByTripId.get('VIC-001');
    expect(match).toBeDefined();
    expect(match?.confidence).toBe('measured');
    expect(match?.vehicleId).toBe('224');
    expect(match?.nextStationId).toBe('940GZZLUGPK');
  });

  it('performs spatio-temporal matching when vehicleId is absent', () => {
    const currentCivilSeconds = 30060;

    // Anonymous arrival prediction (vehicleId = null) for Victoria line at Oxford Circus in 50s
    // Expected arrival = 30060 + 50 = 30110s (scheduled 30120s, delay = -10s)
    const arrival: TflArrivalPrediction = {
      id: 'arr-anon',
      lineId: 'victoria',
      vehicleId: null,
      stationId: '940GZZLUOXC',
      stationName: 'Oxford Circus',
      direction: 'outbound',
      timeToStation: 50,
      expectedArrival: '2026-09-25T08:21:50Z',
      destinationStationId: null
    };

    const outcome = matcher.match([arrival], [mockTrip1, mockTrip2], currentCivilSeconds);

    expect(outcome.matchedCount).toBe(1);
    const match = outcome.matchesByTripId.get('VIC-001');
    expect(match).toBeDefined();
    expect(match?.confidence).toBe('measured');
    expect(match?.delayS).toBe(-10);
  });

  it('rejects predictions outside the matching window', () => {
    const currentCivilSeconds = 30060;

    // Prediction with a 500s discrepancy (> matchWindowSec of 120s)
    const arrival: TflArrivalPrediction = {
      id: 'arr-out-of-window',
      lineId: 'victoria',
      vehicleId: '999',
      stationId: '940GZZLUOXC',
      stationName: 'Oxford Circus',
      direction: 'outbound',
      timeToStation: 600, // 30060 + 600 = 30660 vs scheduled 30120 (diff = 540s > 120s)
      expectedArrival: '2026-09-25T08:31:00Z',
      destinationStationId: null
    };

    const outcome = matcher.match([arrival], [mockTrip1], currentCivilSeconds);

    expect(outcome.matchedCount).toBe(0);
    expect(outcome.coveragePct).toBe(0);

    // Trip stays in 'scheduled'
    const match = outcome.matchesByTripId.get('VIC-001');
    expect(match?.confidence).toBe('scheduled');
    expect(match?.delayS).toBe(0);
  });

  it('strictly isolates lines (Central arrival does not match Victoria trip at same interchange)', () => {
    const currentCivilSeconds = 30060;

    // Central line arrival at Oxford Circus
    const arrival: TflArrivalPrediction = {
      id: 'arr-cen',
      lineId: 'central',
      vehicleId: '401',
      stationId: '940GZZLUOXC',
      stationName: 'Oxford Circus',
      direction: 'outbound',
      timeToStation: 40,
      expectedArrival: '2026-09-25T08:21:40Z',
      destinationStationId: null
    };

    const outcome = matcher.match([arrival], [mockTrip1, mockTripCentral], currentCivilSeconds);

    // Matches Central trip, not Victoria trip!
    expect(outcome.matchesByTripId.get('CEN-001')?.confidence).toBe('measured');
    expect(outcome.matchesByTripId.get('VIC-001')?.confidence).toBe('scheduled');
  });

  it('applies exponential smoothing (alpha) to delays over consecutive updates', () => {
    // Tick 1: raw delay = +30s
    const tick1 = matcher.match(
      [
        {
          id: 'arr-1',
          lineId: 'victoria',
          vehicleId: '224',
          stationId: '940GZZLUOXC',
          stationName: 'Oxford Circus',
          direction: 'outbound',
          timeToStation: 90, // 30060 + 90 = 30150 vs 30120 (diff = +30s)
          expectedArrival: '2026-09-25T08:22:30Z',
          destinationStationId: null
        }
      ],
      [mockTrip1],
      30060
    );

    // Delay at tick 1 is initial raw delay = 30
    const m = tick1.matchesByTripId.get('VIC-001');
    expect(m?.delayS).toBe(30);

    // Tick 2: raw delay drops to 0s
    // Smoothed delay = prev + alpha * (raw - prev) = 30 + 0.4 * (0 - 30) = 30 - 12 = 18s
    const tick2 = matcher.match(
      [
        {
          id: 'arr-2',
          lineId: 'victoria',
          vehicleId: '224',
          stationId: '940GZZLUOXC',
          stationName: 'Oxford Circus',
          direction: 'outbound',
          timeToStation: 60, // 30060 + 60 = 30120 vs 30120 (diff = 0s)
          expectedArrival: '2026-09-25T08:22:00Z',
          destinationStationId: null
        }
      ],
      [mockTrip1],
      30060
    );

    const m2 = tick2.matchesByTripId.get('VIC-001');
    expect(m2?.delayS).toBe(18);
  });
});
