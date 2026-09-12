import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  matchJourneys,
  buildTimeline,
  positionAt,
  createGhostTracker,
  updateGhosts,
  stats,
  CONFIG,
  type SchedTrip,
  type RtJourney,
  type RtCall,
  type Timeline
} from '../../web/src/sim/rt_matching.ts';

console.log('--- Testing rt_matching.ts (Levels 2 & 3) ---');

// Helper to normalize stop names
function normalizeStopName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load real schedule.json
const schedulePath = path.resolve('web/public/data/schedule.json');
const scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const stations = scheduleData.stations;

console.log(`Loaded schedule.json with ${stations.length} stations and ${scheduleData.trips.length} trips.`);

// Select peak hour trips at 08:30 (8 * 3600 + 30 * 60 = 30600 seconds)
const peakSeconds = 30600;
const peakTrips = scheduleData.trips.filter((t: any) => peakSeconds >= t[4] && peakSeconds <= t[5]);
console.log(`Peak hour 08:30 active trips: ${peakTrips.length}`);

// Convert to SchedTrip[]
const activeSchedTrips: SchedTrip[] = peakTrips.map((t: any) => ({
  tripId: t[0],
  lineId: t[1],
  dir: (t[2] === 0 ? 0 : 1) as 0 | 1,
  shapeId: t[3],
  stops: t[7].map((s: any) => ({
    stopId: normalizeStopName(stations[s[3]] || ''),
    arr: s[0],
    dep: s[1],
    dist: s[2]
  }))
}));

// Simulate realistic SIRI EstimatedTimetable journeys from active trips (with random 0 to 90s delays)
let directionDeductionSuccess = 0;
let directionDeductionTotal = 0;

const simulatedJourneys: RtJourney[] = activeSchedTrips.map((trip, idx) => {
  const delay = Math.round((Math.sin(idx) * 45) + 30); // -15s to +75s delay
  const calls: RtCall[] = trip.stops.map(s => ({
    stopId: s.stopId,
    aimed: s.arr,
    expected: s.arr + delay
  }));

  directionDeductionTotal++;
  directionDeductionSuccess++; // 100% known

  return {
    lineId: trip.lineId,
    dir: trip.dir,
    destination: trip.stops[trip.stops.length - 1].stopId,
    calls,
    journeyRef: `journey_${trip.tripId}`
  };
});

// Run Level 2 Matching
const matchStart = performance.now();
const { matches, unmatchedJourneys } = matchJourneys(simulatedJourneys, activeSchedTrips);
const matchDuration = performance.now() - matchStart;

console.log(`\n--- Level 2 Matching Results (Peak Hour: 08:30) ---`);
console.log(`Active scheduled trips: ${activeSchedTrips.length}`);
console.log(`Feed journeys: ${simulatedJourneys.length}`);
console.log(`Matched pairs: ${matches.length}`);
console.log(`Unmatched journeys: ${unmatchedJourneys.length}`);
console.log(`Matching time: ${matchDuration.toFixed(2)} ms (${(matchDuration / activeSchedTrips.length).toFixed(3)} ms/trip)`);

const overallRate = (matches.length / simulatedJourneys.length) * 100;
console.log(`Global matching rate: ${overallRate.toFixed(1)}%`);
assert.ok(overallRate >= 95, 'Matching rate should be >= 95% on clean data');

// Per-line breakdown
const matchesByLine = new Map<string, { total: number; matched: number }>();
for (const trip of activeSchedTrips) {
  const cur = matchesByLine.get(trip.lineId) || { total: 0, matched: 0 };
  cur.total++;
  matchesByLine.set(trip.lineId, cur);
}
for (const m of matches) {
  const cur = matchesByLine.get(m.trip.lineId)!;
  cur.matched++;
}

console.log('\n--- Per-Line Matching Rates ---');
for (const [lineId, stat] of matchesByLine.entries()) {
  const lineRate = (stat.matched / stat.total) * 100;
  console.log(`Line ${lineId}: ${stat.matched}/${stat.total} (${lineRate.toFixed(1)}%)`);
}

// Run Level 3 Timelines & Bracketed Position Verification
const timelines: Timeline[] = [];
let bracketedCount = 0;
let measuredAtStopCount = 0;
let extrapolatedCount = 0;
let scheduledCount = 0;

for (const m of matches) {
  const timeline = buildTimeline(m.trip, m.journey.calls);
  timelines.push(timeline);
  if (timeline.measuredCount >= 2) bracketedCount++;

  const pos = positionAt(timeline, peakSeconds);
  if (pos) {
    if (pos.confidence === 'measured') measuredAtStopCount++;
    else if (pos.confidence === 'bracketed') bracketedCount++;
    else if (pos.confidence === 'extrapolated') extrapolatedCount++;
    else scheduledCount++;
  }
}

console.log(`\n--- Level 3 Bracketed Kinematics Results ---`);
console.log(`Courses with >= 2 measurements (bracketed timeline): ${bracketedCount}`);
console.log(`Confidence distribution at t=08:30:`);
console.log(`  - measured:     ${measuredAtStopCount}`);
console.log(`  - bracketed:    ${bracketedCount}`);
console.log(`  - extrapolated: ${extrapolatedCount}`);
console.log(`  - scheduled:    ${scheduledCount}`);

// Test Ghost Trains Suppression
const tracker = createGhostTracker();
const matchedTripIds = new Set(matches.map(m => m.trip.tripId));
const everMatched = new Set(activeSchedTrips.map(t => t.tripId));

// Disappear a trip
const activeMinusOne = activeSchedTrips.slice(1);
const matchedMinusOne = new Set(Array.from(matchedTripIds).slice(1));
const missingTripId = activeSchedTrips[0].tripId;

// Poll 1: missed = 1
let ghosts = updateGhosts(tracker, activeSchedTrips, matchedMinusOne, everMatched, true);
assert.strictEqual(ghosts.size, 0, 'Not suppressed after 1 miss');

// Poll 2: missed = 2
ghosts = updateGhosts(tracker, activeSchedTrips, matchedMinusOne, everMatched, true);
assert.strictEqual(ghosts.size, 0, 'Not suppressed after 2 misses');

// Poll 3: missed = 3 -> suppressed
ghosts = updateGhosts(tracker, activeSchedTrips, matchedMinusOne, everMatched, true);
assert.strictEqual(ghosts.size, 1, 'Suppressed after 3 misses');
assert.ok(ghosts.has(missingTripId), 'Missing trip identified as ghost');
console.log(`\n✓ Ghost train suppression verified (threshold = 3 polls)`);

// --- RER E Real GTFS Schedule & Matching Verification ---
console.log('\n--- Testing RER E RT Matching on rer_schedule.json ---');
const rerSchedulePath = path.resolve('web/public/data/rer_schedule.json');
if (fs.existsSync(rerSchedulePath)) {
  const rerScheduleData = JSON.parse(fs.readFileSync(rerSchedulePath, 'utf8'));
  const rerStations = rerScheduleData.stations;
  const rerTrips = rerScheduleData.trips;
  const rerPeakTrips = rerTrips.filter((t: any) => peakSeconds >= t[4] && peakSeconds <= t[5]);
  console.log(`RER E trips: ${rerTrips.length}, active at peak 08:30: ${rerPeakTrips.length}`);

  const rerActiveSchedTrips: SchedTrip[] = rerPeakTrips.map((t: any) => ({
    tripId: t[0],
    lineId: t[1],
    dir: (t[2] === 0 ? 0 : 1) as 0 | 1,
    shapeId: t[3],
    stops: t[7].map((s: any) => ({
      stopId: normalizeStopName(rerStations[s[3]] || ''),
      arr: s[0],
      dep: s[1],
      dist: s[2]
    }))
  }));

  const rerSimulatedJourneys: RtJourney[] = rerActiveSchedTrips.map((trip, idx) => {
    const delay = Math.round((Math.sin(idx) * 60) + 45); // retards réalistes de -15s à 105s
    const calls: RtCall[] = trip.stops.map(s => ({
      stopId: s.stopId,
      aimed: s.arr,
      expected: s.arr + delay
    }));
    return {
      lineId: trip.lineId,
      dir: trip.dir,
      destination: trip.stops[trip.stops.length - 1].stopId,
      calls,
      journeyRef: `rer_journey_${trip.tripId}`
    };
  });

  const { matches: rerMatches } = matchJourneys(rerSimulatedJourneys, rerActiveSchedTrips);
  const rerRate = (rerMatches.length / rerSimulatedJourneys.length) * 100;
  console.log(`RER E Matching Rate (08:30): ${rerMatches.length}/${rerSimulatedJourneys.length} (${rerRate.toFixed(1)}%)`);
  assert.ok(rerRate >= 95, `RER E Matching rate should be >= 95%, got ${rerRate}%`);

  for (const rm of rerMatches) {
    const timeline = buildTimeline(rm.trip, rm.journey.calls);
    assert.strictEqual(timeline.lineId, 'IDFM:C01729');
    const pos = positionAt(timeline, peakSeconds);
    assert.ok(pos !== null, 'Train position must be computed');
  }
  console.log('✓ RER E Level 2 matching & Level 3 position verified successfully');
}

console.log('\n--- All RT Matching Tests (Metro + RER E) PASSED ---');
