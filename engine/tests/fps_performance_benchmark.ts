import fs from 'node:fs';
import path from 'node:path';
import {
  matchJourneys,
  buildTimeline,
  positionAt,
  type SchedTrip,
  type RtJourney,
  type RtCall,
  type Timeline
} from '../../web/src/sim/rt_matching.ts';

function normalizeStopName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Minimal trapezoid baseline from kinematics.ts
function baselineTrapezoid(arr0: number, dep0: number, dist0: number, arr1: number, dist1: number, effTime: number) {
  const durationS = Math.max(1, arr1 - dep0);
  const elapsedS = effTime - dep0;
  const tau = Math.min(1.0, Math.max(0.0, elapsedS / durationS));
  const distSpanM = Math.max(0, dist1 - dist0);
  const k = 0.25;
  let progress = 0;
  let vMps = 0;
  const vCruise = distSpanM / ((1 - k) * durationS);

  if (tau < k) {
    progress = 0.5 * (tau * tau) / (k * (1 - k));
    vMps = vCruise * (tau / k);
  } else if (tau <= 1 - k) {
    progress = (tau - 0.5 * k) / (1 - k);
    vMps = vCruise;
  } else {
    const u = 1.0 - tau;
    progress = 1.0 - 0.5 * (u * u) / (k * (1 - k));
    vMps = vCruise * (u / k);
  }
  return { dist: dist0 + Math.min(1.0, Math.max(0.0, progress)) * distSpanM, speed: vMps };
}

async function runBenchmark() {
  console.log('--- FPS & Engine Performance Benchmark (Before vs After) ---');

  const scheduleData = JSON.parse(fs.readFileSync('web/public/data/schedule.json', 'utf8'));
  const stations = scheduleData.stations;

  const peakSeconds = 30600; // 08:30
  const peakTrips = scheduleData.trips.filter((t: any) => peakSeconds >= t[4] && peakSeconds <= t[5]);
  console.log(`Peak hour active trains: ${peakTrips.length}`);

  const schedTrips: SchedTrip[] = peakTrips.map((t: any) => ({
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

  // Build simulated RT journeys
  const simulatedJourneys: RtJourney[] = schedTrips.map((trip, idx) => {
    const delay = Math.round((Math.sin(idx) * 45) + 30);
    const calls: RtCall[] = trip.stops.map(s => ({
      stopId: s.stopId,
      aimed: s.arr,
      expected: s.arr + delay
    }));
    return {
      lineId: trip.lineId,
      dir: trip.dir,
      destination: trip.stops[trip.stops.length - 1].stopId,
      calls
    };
  });

  const { matches } = matchJourneys(simulatedJourneys, schedTrips);
  const timelines = new Map<string, Timeline>();
  for (const m of matches) {
    timelines.set(m.trip.tripId, buildTimeline(m.trip, m.journey.calls));
  }

  const NUM_FRAMES = 1000;

  // 1. Benchmark Baseline (Legacy per-line delay kinematics per frame)
  const startBaseline = performance.now();
  for (let f = 0; f < NUM_FRAMES; f++) {
    const t = peakSeconds + f * 0.016;
    for (const trip of schedTrips) {
      const effTime = t - 15; // uniform line delay
      const stops = trip.stops;
      for (let i = 0; i < stops.length - 1; i++) {
        if (effTime >= stops[i].dep && effTime <= stops[i + 1].arr) {
          baselineTrapezoid(stops[i].arr, stops[i].dep, stops[i].dist, stops[i + 1].arr, stops[i + 1].dist, effTime);
          break;
        }
      }
    }
  }
  const durBaseline = performance.now() - startBaseline;
  const timePerFrameBaseline = durBaseline / NUM_FRAMES;

  // 2. Benchmark Level 2 & 3 (positionAt with Timeline per frame)
  const startLevel3 = performance.now();
  for (let f = 0; f < NUM_FRAMES; f++) {
    const t = peakSeconds + f * 0.016;
    for (const schedTrip of schedTrips) {
      const timeline = timelines.get(schedTrip.tripId);
      if (!timeline) continue;
      positionAt(timeline, t);
    }
  }
  const durLevel3 = performance.now() - startLevel3;
  const timePerFrameLevel3 = durLevel3 / NUM_FRAMES;

  console.log(`\n--- Benchmark Results (${NUM_FRAMES} frames × ${peakTrips.length} active trains) ---`);
  console.log(`1. Baseline (calcul par ligne / retard uniforme) :`);
  console.log(`   - Temps total (1000 frames) : ${durBaseline.toFixed(2)} ms`);
  console.log(`   - Temps par frame : ${timePerFrameBaseline.toFixed(4)} ms/frame`);
  console.log(`   - Fréquence CPU théorique : ${(1000 / timePerFrameBaseline).toFixed(0)} FPS`);

  console.log(`\n2. Niveaux 2 & 3 (positionAt par course avec encadrement) :`);
  console.log(`   - Temps total (1000 frames) : ${durLevel3.toFixed(2)} ms`);
  console.log(`   - Temps par frame : ${timePerFrameLevel3.toFixed(4)} ms/frame`);
  console.log(`   - Fréquence CPU théorique : ${(1000 / timePerFrameLevel3).toFixed(0)} FPS`);

  console.log(`\nDelta par frame : ${(timePerFrameLevel3 - timePerFrameBaseline).toFixed(4)} ms`);
  console.log(`Poids sur le budget 60 FPS (16,67 ms) : ${(timePerFrameLevel3 / 16.667 * 100).toFixed(2)} %`);
}

runBenchmark().catch(console.error);
