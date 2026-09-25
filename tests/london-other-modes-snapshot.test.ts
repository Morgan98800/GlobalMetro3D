import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { computeLondonSnapshot } from './snapshot_generator';

/**
 * Non-régression de position pour les modes londoniens hors tube : DLR,
 * Elizabeth line, Overground (six lignes) et tram.
 *
 * Le snapshot `london-snapshot.test.ts` vérifie le tube rame par rame mais ne
 * fait que compter les autres modes. Celui-ci les vérifie au mètre près.
 *
 * Contrairement aux autres snapshots, la fixture n'est JAMAIS recréée
 * automatiquement : une fixture absente fait échouer le test. Pour la
 * régénérer volontairement, après avoir vérifié que le changement est voulu :
 *
 *   UPDATE_FIXTURE=1 npx vitest run tests/london-other-modes-snapshot.test.ts
 */

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/london-other-modes-snapshot.json');

const TUBE_LINES = new Set([
  'bakerloo', 'central', 'circle', 'district', 'hammersmith-city', 'jubilee',
  'metropolitan', 'northern', 'piccadilly', 'victoria', 'waterloo-city'
]);

type Train = ReturnType<typeof computeLondonSnapshot>['trains'][number];

function otherModeTrains(): Train[] {
  return computeLondonSnapshot().trains
    .filter(t => !TUBE_LINES.has(t.line))
    .sort((a, b) => a.tripId.localeCompare(b.tripId));
}

describe('Londres hors tube — non-régression de position', () => {
  it('reproduit chaque rame DLR, Elizabeth, Overground et tram à 1 m près', () => {
    const computed = otherModeTrains();

    if (process.env.UPDATE_FIXTURE === '1') {
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify({ trains: computed }, null, 2), 'utf8');
      console.log(`[fixture] ${computed.length} rames écrites dans ${FIXTURE_PATH}`);
    }

    expect(
      fs.existsSync(FIXTURE_PATH),
      'Fixture absente : elle ne se recrée pas seule. Voir l’en-tête du fichier.'
    ).toBe(true);

    const expected: Train[] = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).trains;
    const expectedById = new Map(expected.map(t => [t.tripId, t]));

    // Même ensemble de rames, ni plus ni moins
    expect(computed.map(t => t.tripId)).toEqual(expected.map(t => t.tripId));

    let maxDistDeltaM = 0;
    for (const c of computed) {
      const e = expectedById.get(c.tripId)!;
      expect(c.line).toBe(e.line);
      expect(c.shapeId).toBe(e.shapeId);
      expect(c.direction).toBe(e.direction);

      const distDeltaM = Math.abs(c.currentDistM - e.currentDistM);
      maxDistDeltaM = Math.max(maxDistDeltaM, distDeltaM);
      expect(distDeltaM, `${c.tripId} (${c.line}) décalé de ${distDeltaM} m`).toBeLessThanOrEqual(1.0);
      expect(Math.abs(c.speedMps - e.speedMps), `${c.tripId} vitesse`).toBeLessThanOrEqual(0.1);
    }

    console.log(`✅ Londres hors tube : ${computed.length} rames, écart max ${maxDistDeltaM.toFixed(4)} m`);
  });
});
