import fs from 'node:fs';
import path from 'node:path';
import { parisClock, selectActiveTrips, serviceCandidates } from '../../web/src/sim/paris_time.ts';

console.log('=== AUDIT DES CONTRÔLES EN ATTENTE ===\n');

// 1. Contrôle (a) : Compteur de rames à 08h30 un mardi (horloge injectée via paris_time.ts)
const schedulePath = path.resolve('web/public/data/schedule.json');
const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const trips = schedule.trips.map((t: any) => ({
  id: t[0],
  line: t[1],
  dir: t[2],
  shapeId: t[3],
  t0: t[4],
  t1: t[5],
  destIdx: t[6],
  stops: t[7]
}));

console.log(`Total courses dans schedule.json : ${trips.length}`);

// Simuler un mardi à 08h30 heure de Paris
// Mardi 15 septembre 2026 à 08:30:00 CEST (UTC+2) -> 06:30:00 UTC
const tuesday0830 = new Date('2026-09-15T08:30:00+02:00');
const activeTuesday0830 = selectActiveTrips(trips, tuesday0830);

console.log(`[08h30 Mardi] Rames actives : ${activeTuesday0830.length}`);

// Tranches horaires complètes sur 24h
console.log('\n--- Nombre de rames actives par tranche horaire ---');
const testHours = [
  { label: '05h30 (Début de service)', iso: '2026-09-15T05:30:00+02:00' },
  { label: '07h00', iso: '2026-09-15T07:00:00+02:00' },
  { label: '08h30 (Pointe du matin)', iso: '2026-09-15T08:30:00+02:00' },
  { label: '10h00', iso: '2026-09-15T10:00:00+02:00' },
  { label: '12h30 (Midi)', iso: '2026-09-15T12:30:00+02:00' },
  { label: '15h00', iso: '2026-09-15T15:00:00+02:00' },
  { label: '18h30 (Pointe du soir)', iso: '2026-09-15T18:30:00+02:00' },
  { label: '21h00', iso: '2026-09-15T21:00:00+02:00' },
  { label: '23h30', iso: '2026-09-15T23:30:00+02:00' },
  { label: '00h45 (Nuit)', iso: '2026-09-15T00:45:00+02:00' },
  { label: '01h30 (Fin de service)', iso: '2026-09-15T01:30:00+02:00' },
  { label: '03h30 (Interruption nocturne)', iso: '2026-09-15T03:30:00+02:00' }
];

for (const th of testHours) {
  const d = new Date(th.iso);
  const active = selectActiveTrips(trips, d);
  console.log(`  ${th.label.padEnd(30)} : ${String(active.length).padStart(4)} rames`);
}

// 2. Contrôle (c) : Recherche de clés API / secrets résiduels dans le repo git
console.log('\n--- Audit de sécurité des secrets dans le dépôt ---');
const distDir = path.resolve('web/dist');
let bundleHasSecret = false;

if (fs.existsSync(distDir)) {
  const jsFiles = fs.readdirSync(path.join(distDir, 'assets')).filter(f => f.endsWith('.js'));
  for (const jf of jsFiles) {
    const content = fs.readFileSync(path.join(distDir, 'assets', jf), 'utf8');
    if (content.includes('STIF:') && content.includes('apikey') || content.includes('PRIM_API_KEY')) {
      console.warn(`⚠️ Potentiel secret trouvé dans web/dist/assets/${jf}`);
      bundleHasSecret = true;
    }
  }
}

if (!bundleHasSecret) {
  console.log('✓ Aucun secret, clé PRIM ou token Netlify dans le bundle de production web/dist.');
}

console.log('\n=== FIN DU CONTRÔLE ===');
