import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serviceCandidates, selectActiveTrips, parisClock } from './paris_time.ts';

console.log('🧪 Running paris_time unit test suite...');

// 1. serviceCandidates DST transitions
console.log('\n--- TEST 1: Bascules Heure Été / Hiver ---');

// Spring transition: 2026-03-29
// 01:59 CET = 00:59 UTC
const springBefore = new Date('2026-03-29T00:59:00Z');
const candSpringBefore = serviceCandidates(springBefore);
assert.equal(candSpringBefore[0].serviceDate, '2026-03-29');
assert.equal(candSpringBefore[0].seconds, 1 * 3600 + 59 * 60);
assert.equal(candSpringBefore[1].serviceDate, '2026-03-28');
assert.equal(candSpringBefore[1].seconds, 1 * 3600 + 59 * 60 + 86400);

// 03:01 CEST = 01:01 UTC
const springAfter = new Date('2026-03-29T01:01:00Z');
const candSpringAfter = serviceCandidates(springAfter);
assert.equal(candSpringAfter[0].serviceDate, '2026-03-29');
assert.equal(candSpringAfter[0].seconds, 3 * 3600 + 1 * 60);
assert.equal(candSpringAfter[1].serviceDate, '2026-03-28');
assert.equal(candSpringAfter[1].seconds, 3 * 3600 + 1 * 60 + 86400);

console.log('✅ Bascule heure d\'été (Printemps 2026) validée.');

// Autumn transition: 2026-10-25
const autumn = new Date('2026-10-25T00:30:00Z'); // 02:30 CEST
const candAutumn = serviceCandidates(autumn);
assert.equal(candAutumn[0].serviceDate, '2026-10-25');
assert.equal(candAutumn[0].seconds, 2 * 3600 + 30 * 60);
assert.equal(candAutumn[1].serviceDate, '2026-10-24');
assert.equal(candAutumn[1].seconds, 2 * 3600 + 30 * 60 + 86400);

console.log('✅ Bascule heure d\'hiver (Automne 2026) validée.');

// 2. Integration with schedule.json
console.log('\n--- TEST 2: Comptage des rames sur schedule.json réel ---');
const schedulePath = fs.existsSync('web/public/data/schedule.json')
  ? path.resolve('web/public/data/schedule.json')
  : path.resolve('public/data/schedule.json');
const scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));

// Format trips to TripWindow objects
const trips = scheduleData.trips.map((t: any) => ({
  id: t[0],
  line: t[1],
  dir: t[2],
  shapeId: t[3],
  t0: t[4],
  t1: t[5],
  destIdx: t[6],
  stops: t[7]
}));

// Test 00h30 Mardi (June 9, 2026 CEST: 00:30 Paris = June 8, 2026 22:30 UTC)
const t00h30 = new Date('2026-06-08T22:30:00Z');
const act00h30 = selectActiveTrips(trips, t00h30);
console.log(`[00h30] Rames actives: ${act00h30.length}`);
assert.ok(act00h30.length > 100, `Attendu > 100 rames à 00h30, obtenu ${act00h30.length}`);

// Test 01h30 Mardi (23:30 UTC)
const t01h30 = new Date('2026-06-08T23:30:00Z');
const act01h30 = selectActiveTrips(trips, t01h30);
console.log(`[01h30] Rames actives: ${act01h30.length} (service terminé)`);
assert.equal(act01h30.length, 0, `Attendu 0 rame à 01h30, obtenu ${act01h30.length}`);

// Test 03h00 Mardi (01:00 UTC)
const t03h00 = new Date('2026-06-09T01:00:00Z');
const act03h00 = selectActiveTrips(trips, t03h00);
console.log(`[03h00] Rames actives: ${act03h00.length} (service terminé)`);
assert.equal(act03h00.length, 0, `Attendu 0 rame à 03h00, obtenu ${act03h00.length}`);

// Test 08h30 Mardi (06:30 UTC - Heure de pointe)
const t08h30 = new Date('2026-06-09T06:30:00Z');
const act08h30 = selectActiveTrips(trips, t08h30);
console.log(`[08h30] Rames actives: ${act08h30.length}`);
assert.ok(act08h30.length > 400, `Attendu > 400 rames à 08h30, obtenu ${act08h30.length}`);

console.log('\n🎉 TOUS LES TESTS PARIS_TIME SONT VALIDÉS !');
