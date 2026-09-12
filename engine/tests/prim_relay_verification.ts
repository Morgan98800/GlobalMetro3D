import assert from 'node:assert';
import zlib from 'node:zlib';
import {
  METRO_RER_LINES,
  isParisMetroServiceHours,
  type PrimSnapshot,
  type EstimatedVehicleJourneyData,
  parseEstimatedTimetablePayload
} from '../../netlify/functions/prim_relay.ts';

console.log('--- Testing PRIM Relay & Quota Calculations ---');

// 1. Line count verification
assert.strictEqual(METRO_RER_LINES.length, 21, 'Must monitor exactly 21 lines (16 metro + 5 RER)');
const metroLines = METRO_RER_LINES.filter(l => l.mode === 'metro');
const rerLines = METRO_RER_LINES.filter(l => l.mode === 'rail');
assert.strictEqual(metroLines.length, 16, '16 metro lines');
assert.strictEqual(rerLines.length, 5, '5 RER lines (A, B, C, D, E)');
console.log('✓ 21 lines configured (16 Metro + 5 RER)');

// 1b. SIRI may split a line response across several journey frames.
const framePayload = {
  Siri: {
    ServiceDelivery: {
      EstimatedTimetableDelivery: [{
        EstimatedJourneyVersionFrame: [
          { EstimatedVehicleJourney: [{ FramedVehicleJourneyRef: { DatedVehicleJourneyRef: 'frame-1' }, DirectionRef: { value: '0' }, EstimatedCalls: { EstimatedCall: [{ AimedArrivalTime: '2026-09-10T12:00:00Z', ExpectedArrivalTime: '2026-09-10T12:00:30Z' }] } }] },
          { EstimatedVehicleJourney: [{ FramedVehicleJourneyRef: { DatedVehicleJourneyRef: 'frame-2' }, DirectionRef: { value: '1' }, EstimatedCalls: { EstimatedCall: [{ AimedArrivalTime: '2026-09-10T12:00:00Z', ExpectedArrivalTime: '2026-09-10T12:01:00Z' }] } }] }
        ]
      }]
    }
  }
};
const parsedFrames = parseEstimatedTimetablePayload(framePayload, METRO_RER_LINES[0]);
assert.strictEqual(parsedFrames.journeys.length, 2, 'All SIRI journey frames must be aggregated');
assert.strictEqual(parsedFrames.delaysByDir['IDFM:C01371#0'], 30);
assert.strictEqual(parsedFrames.delaysByDir['IDFM:C01371#1'], 60);
console.log('✓ Multi-frame SIRI payload aggregated with direction-specific delays');

// 2. Service Hours Verification (derived from GTFS schedule: 05:15 to 02:30 Paris time)
assert.strictEqual(isParisMetroServiceHours(new Date('2026-09-10T12:00:00+02:00')), true, '12:00 is active');
assert.strictEqual(isParisMetroServiceHours(new Date('2026-09-10T05:15:00+02:00')), true, '05:15 is active');
assert.strictEqual(isParisMetroServiceHours(new Date('2026-09-10T01:30:00+02:00')), true, '01:30 is active');
assert.strictEqual(isParisMetroServiceHours(new Date('2026-09-10T02:29:00+02:00')), true, '02:29 is active');
assert.strictEqual(isParisMetroServiceHours(new Date('2026-09-10T03:00:00+02:00')), false, '03:00 is inactive (night lull)');
assert.strictEqual(isParisMetroServiceHours(new Date('2026-09-10T04:30:00+02:00')), false, '04:30 is inactive (night lull)');
assert.strictEqual(isParisMetroServiceHours(new Date('2026-09-10T05:14:00+02:00')), false, '05:14 is inactive (night lull)');
console.log('✓ Service hours properly windowed (05:15 - 02:30 active, 02:30 - 05:15 suspended)');

// 3. Realistic Snapshot Gzip Compression Measurement
const mockJourneysByLine: Record<string, EstimatedVehicleJourneyData[]> = {};
let totalCalls = 0;
let totalJourneys = 0;

for (const line of METRO_RER_LINES) {
  const journeys: EstimatedVehicleJourneyData[] = [];
  const numJourneys = line.mode === 'metro' ? 18 : 12; // ~15-20 trains per line active
  for (let j = 0; j < numJourneys; j++) {
    const calls = [];
    const numCalls = line.mode === 'metro' ? 25 : 35;
    for (let c = 0; c < numCalls; c++) {
      calls.push({
        stopPointRef: `STIF:StopPoint:Q:${10000 + c}:`,
        stopPointName: `Station ${c}`,
        order: c + 1,
        aimedArrivalTime: '2026-09-10T12:00:00.000Z',
        expectedArrivalTime: '2026-09-10T12:00:30.000Z',
        aimedDepartureTime: '2026-09-10T12:00:40.000Z',
        expectedDepartureTime: '2026-09-10T12:01:10.000Z',
        delaySeconds: 30,
        arrivalStatus: 'onTime',
        departureStatus: 'onTime'
      });
      totalCalls++;
    }
    journeys.push({
      journeyId: `journey_${line.rawId}_${j}`,
      lineId: line.id,
      lineRef: `STIF:Line::${line.rawId}:`,
      direction: (j % 2 === 0 ? '0' : '1') as '0' | '1',
      destinationRef: 'STIF:StopPoint:Q:99999:',
      destinationName: 'Terminus Test',
      vehicleMode: line.mode,
      recordedAt: new Date().toISOString(),
      calls
    });
    totalJourneys++;
  }
  mockJourneysByLine[line.id] = journeys;
}

const mockSnapshot: PrimSnapshot = {
  producedAt: new Date().toISOString(),
  timestamp: Date.now(),
  validUntil: Date.now() + 180000,
  feedHealthy: true,
  serviceActive: true,
  lastError: null,
  stats: {
    linesQueried: 21,
    linesSucceeded: 21,
    totalJourneys,
    totalCalls,
    fetchDurationMs: 3200
  },
  delays: { 'IDFM:C01371': 15, 'IDFM:C01371#0': 12, 'IDFM:C01371#1': 18 },
  journeysByLine: mockJourneysByLine
};

const rawJsonStr = JSON.stringify(mockSnapshot);
const rawBytes = Buffer.byteLength(rawJsonStr, 'utf8');
const gzipped = zlib.gzipSync(rawJsonStr);
const brotli = zlib.brotliCompressSync(rawJsonStr);

console.log(`✓ Snapshot size: ${Math.round(rawBytes / 1024)} KB raw JSON (${totalJourneys} journeys, ${totalCalls} calls)`);
console.log(`✓ Snapshot Gzip size: ${(gzipped.length / 1024).toFixed(1)} KB`);
console.log(`✓ Snapshot Brotli size: ${(brotli.length / 1024).toFixed(1)} KB`);

// 4. Quota and 24h Consumption Calculations
const linesCount = 21;
const pollIntervalS = 180; // 3 minutes
const cyclesPerHour = 3600 / pollIntervalS; // 20 cycles/hour
const serviceHoursPerDay = 21.25; // from 05:15 to 02:30 = 21h15m = 21.25h
const totalRequests24h = serviceHoursPerDay * cyclesPerHour * linesCount;
const requestsPerMin = (linesCount / pollIntervalS) * 60; // 7 req/min

console.log(`✓ PRIM Quota calculations:`);
console.log(`  - Lines monitored: ${linesCount}`);
console.log(`  - Polling interval: ${pollIntervalS}s (${pollIntervalS / 60} min)`);
console.log(`  - Cycles per hour: ${cyclesPerHour}`);
console.log(`  - Service hours: ${serviceHoursPerDay}h (05:15 to 02:30)`);
console.log(`  - Night suspension: 2h45 (02:30 to 05:15) -> 0 requests`);
console.log(`  - Total requests / 24h: ${Math.round(totalRequests24h)} requests`);
console.log(`  - Average rate: ${requestsPerMin.toFixed(1)} req/min (Official PRIM limit: 20 req/min, headroom: ${((1 - requestsPerMin / 20) * 100).toFixed(0)}%)`);

console.log('--- All Relay Checks PASSED ---');
