import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { cityClock, selectActiveTrips, serviceCandidates, type TripWindow } from '@core/sim/paris_time';
import { parisConfig } from '@cities/paris/city.config';
import { montrealConfig } from '@cities/montreal/city.config';

import { londonConfig } from '@cities/london/city.config';

describe('DST Transitions Safety Net (Paris vs Montréal vs Londres)', () => {
  // Mock trips: first morning departure at 05:30:00 (19800 seconds)
  const FIRST_DEPARTURE_SECONDS = 5 * 3600 + 30 * 60; // 19800s
  const FIRST_ARRIVAL_SECONDS = 6 * 3600; // 21600s

  const parisTrip: TripWindow = {
    t0: FIRST_DEPARTURE_SECONDS,
    t1: FIRST_ARRIVAL_SECONDS,
    service_id: 'paris-morning-1'
  };

  const montrealTrip: TripWindow = {
    t0: FIRST_DEPARTURE_SECONDS,
    t1: FIRST_ARRIVAL_SECONDS,
    service_id: 'stm-morning-1'
  };

  const londonTrip: TripWindow = {
    t0: FIRST_DEPARTURE_SECONDS,
    t1: FIRST_ARRIVAL_SECONDS,
    service_id: 'tfl-morning-1'
  };

  it('verifies Paris, Montreal, and London on March 10, 2026 (Montreal EDT UTC-4, London GMT UTC+0, Paris CET UTC+1)', () => {
    // On March 10, 2026:
    // Quebec switched to summer time on Sunday March 8, 2026 (UTC-4)
    // UK and France are still in winter time (GMT UTC+0, CET UTC+1), switching on March 29, 2026
    
    // 1. Check Paris at 05:30:00 local time (which is 04:30:00 UTC)
    const parisDateUtc = DateTime.fromISO('2026-03-10T04:30:00Z').toJSDate();
    const parisClockData = cityClock(parisDateUtc, parisConfig.timezone);
    expect(parisClockData.date).toBe('2026-03-10');
    expect(parisClockData.secondsSinceMidnight).toBe(FIRST_DEPARTURE_SECONDS);

    const parisActive = selectActiveTrips([parisTrip], parisDateUtc, undefined, 0, parisConfig.timezone);
    expect(parisActive.length).toBe(1);
    expect(parisActive[0].serviceSeconds).toBe(FIRST_DEPARTURE_SECONDS);
    expect(parisActive[0].serviceDate).toBe('2026-03-10');

    // 2. Check Montreal at 05:30:00 local time (which is 09:30:00 UTC in EDT)
    const montrealDateUtc = DateTime.fromISO('2026-03-10T09:30:00Z').toJSDate();
    const montrealClockData = cityClock(montrealDateUtc, montrealConfig.timezone);
    expect(montrealClockData.date).toBe('2026-03-10');
    expect(montrealClockData.secondsSinceMidnight).toBe(FIRST_DEPARTURE_SECONDS);

    const montrealActive = selectActiveTrips([montrealTrip], montrealDateUtc, undefined, 0, montrealConfig.timezone);
    expect(montrealActive.length).toBe(1);
    expect(montrealActive[0].serviceSeconds).toBe(FIRST_DEPARTURE_SECONDS);
    expect(montrealActive[0].serviceDate).toBe('2026-03-10');

    // 3. Check London at 05:30:00 local time (which is 05:30:00 UTC in GMT)
    const londonDateUtc = DateTime.fromISO('2026-03-10T05:30:00Z').toJSDate();
    const londonClockData = cityClock(londonDateUtc, londonConfig.timezone);
    expect(londonClockData.date).toBe('2026-03-10');
    expect(londonClockData.secondsSinceMidnight).toBe(FIRST_DEPARTURE_SECONDS);

    const londonActive = selectActiveTrips([londonTrip], londonDateUtc, undefined, 0, londonConfig.timezone);
    expect(londonActive.length).toBe(1);
    expect(londonActive[0].serviceSeconds).toBe(FIRST_DEPARTURE_SECONDS);
    expect(londonActive[0].serviceDate).toBe('2026-03-10');
  });

  it('verifies Paris, Montreal, and London on March 30, 2026 (Montreal EDT UTC-4, London BST UTC+1, Paris CEST UTC+2)', () => {
    // On March 30, 2026:
    // UK and France switched to summer time on Sunday March 29, 2026 (BST UTC+1, CEST UTC+2)
    // Quebec is in EDT (UTC-4)

    // 1. Check Paris at 05:30:00 local time (which is 03:30:00 UTC in CEST)
    const parisDateUtc = DateTime.fromISO('2026-03-30T03:30:00Z').toJSDate();
    const parisClockData = cityClock(parisDateUtc, parisConfig.timezone);
    expect(parisClockData.date).toBe('2026-03-30');
    expect(parisClockData.secondsSinceMidnight).toBe(FIRST_DEPARTURE_SECONDS);

    const parisActive = selectActiveTrips([parisTrip], parisDateUtc, undefined, 0, parisConfig.timezone);
    expect(parisActive.length).toBe(1);
    expect(parisActive[0].serviceSeconds).toBe(FIRST_DEPARTURE_SECONDS);
    expect(parisActive[0].serviceDate).toBe('2026-03-30');

    // 2. Check Montreal at 05:30:00 local time (which is 09:30:00 UTC in EDT)
    const montrealDateUtc = DateTime.fromISO('2026-03-30T09:30:00Z').toJSDate();
    const montrealClockData = cityClock(montrealDateUtc, montrealConfig.timezone);
    expect(montrealClockData.date).toBe('2026-03-30');
    expect(montrealClockData.secondsSinceMidnight).toBe(FIRST_DEPARTURE_SECONDS);

    const montrealActive = selectActiveTrips([montrealTrip], montrealDateUtc, undefined, 0, montrealConfig.timezone);
    expect(montrealActive.length).toBe(1);
    expect(montrealActive[0].serviceSeconds).toBe(FIRST_DEPARTURE_SECONDS);
    expect(montrealActive[0].serviceDate).toBe('2026-03-30');

    // 3. Check London at 05:30:00 local time (which is 04:30:00 UTC in BST)
    const londonDateUtc = DateTime.fromISO('2026-03-30T04:30:00Z').toJSDate();
    const londonClockData = cityClock(londonDateUtc, londonConfig.timezone);
    expect(londonClockData.date).toBe('2026-03-30');
    expect(londonClockData.secondsSinceMidnight).toBe(FIRST_DEPARTURE_SECONDS);

    const londonActive = selectActiveTrips([londonTrip], londonDateUtc, undefined, 0, londonConfig.timezone);
    expect(londonActive.length).toBe(1);
    expect(londonActive[0].serviceSeconds).toBe(FIRST_DEPARTURE_SECONDS);
    expect(londonActive[0].serviceDate).toBe('2026-03-30');
  });

  it('verifies late night service after midnight (t0 >= 86400) on both dates', () => {
    // Night trip at 01:15:00 the following morning (service seconds = 86400 + 3600 + 15*60 = 90900)
    const NIGHT_SECONDS = 86400 + 4500; // 90900s
    const nightTrip: TripWindow = {
      t0: 90000,
      t1: 91800,
      service_id: 'late-night-service'
    };

    // Civil time 01:15:00 on March 11 at Paris (00:15 UTC)
    const parisNightUtc = DateTime.fromISO('2026-03-11T00:15:00Z').toJSDate();
    const parisCandidates = serviceCandidates(parisNightUtc, parisConfig.timezone);
    expect(parisCandidates.length).toBe(2);
    // Candidate 0 is March 11 with 4500s; Candidate 1 is March 10 with 90900s
    expect(parisCandidates[1].serviceDate).toBe('2026-03-10');
    expect(parisCandidates[1].seconds).toBe(NIGHT_SECONDS);

    const activeNight = selectActiveTrips([nightTrip], parisNightUtc, undefined, 0, parisConfig.timezone);
    expect(activeNight.length).toBe(1);
    expect(activeNight[0].serviceSeconds).toBe(NIGHT_SECONDS);
    expect(activeNight[0].serviceDate).toBe('2026-03-10');
  });

  it('verifies London autumn clock change with a Night Tube trip crossing the transition', () => {
    // On Sunday October 25, 2026:
    // UK clocks fall back from 02:00 BST (UTC+1) to 01:00 GMT (UTC+0).
    // Saturday night Night Tube service runs continuously across the transition.
    // A trip starting Saturday night at 01:45 BST has service seconds = 86400 + 1*3600 + 45*60 = 92700s.
    const nightTubeTrip: TripWindow = {
      t0: 92000,
      t1: 94000,
      service_id: 'london-night-tube'
    };

    // At 01:45 BST before the fallback (00:45:00 UTC on Sunday Oct 25)
    const beforeFallbackUtc = DateTime.fromISO('2026-10-25T00:45:00Z').toJSDate();
    const clockBefore = cityClock(beforeFallbackUtc, londonConfig.timezone);
    expect(clockBefore.date).toBe('2026-10-25');

    const activeBefore = selectActiveTrips([nightTubeTrip], beforeFallbackUtc, undefined, 0, londonConfig.timezone);
    expect(activeBefore.length).toBe(1);
    expect(activeBefore[0].serviceDate).toBe('2026-10-24');
    expect(activeBefore[0].serviceSeconds).toBe(92700);

    // After the fallback at 01:45 GMT (01:45:00 UTC on Sunday Oct 25)
    // Civil time is 01:45:00 GMT (secondsSinceMidnight = 6300)
    const afterFallbackUtc = DateTime.fromISO('2026-10-25T01:45:00Z').toJSDate();
    const clockAfter = cityClock(afterFallbackUtc, londonConfig.timezone);
    expect(clockAfter.date).toBe('2026-10-25');
    expect(clockAfter.secondsSinceMidnight).toBe(1 * 3600 + 45 * 60);
  });
});

