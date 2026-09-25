import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BrowserSubwayEngine } from '../core/sim/browser_engine';
import { resetShapesCache } from '../core/sim/shapes_loader';
import type { RealtimeAdapter, RealtimeTickContext, RealtimeTickResult } from '../core/rt/adapter';
import type { CityConfig } from '../core/config';
import type { LineTrafficReport } from '../core/types';
import { parisConfig } from '../cities/paris/city.config';
import { montrealConfig } from '../cities/montreal/city.config';
import { londonConfig } from '../cities/london/city.config';
import { createRealtimeAdapter } from '../cities/realtime';
import { PrimRealtimeAdapter } from '../cities/paris/rt/prim_adapter';
import { StmRealtimeAdapter } from '../cities/montreal/rt/stm_adapter';
import { TflRealtimeAdapter } from '../cities/london/rt/tfl_adapter';
import {
  SNAPSHOT_TIMESTAMP_ISO,
  SNAPSHOT_TIMESTAMP_ISO_MONTREAL,
  SNAPSHOT_TIMESTAMP_ISO_LONDON
} from './snapshot_generator';

/**
 * Ce test fait tourner le vrai moteur (`BrowserSubwayEngine`), ce que les
 * snapshots ne font pas : ils passent par un générateur séparé. Il vérifie que
 * le moteur ne dépend que du contrat `RealtimeAdapter`, et que le chemin
 * d'adaptateur ne change rien au mode théorique.
 */

const PUBLIC_DIR = path.resolve(__dirname, '../web/public');

function stubFetchFromPublicDir() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const urlPath = String(input).split('?')[0];
    const file = path.join(PUBLIC_DIR, urlPath);
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(fs.readFileSync(file));
  }));
}

/** Paris sans le RER : son chargement est asynchrone et non attendu par initialize(). */
const parisMetroOnly: CityConfig = {
  ...parisConfig,
  paths: { ...parisConfig.paths, rer: undefined }
};

class FakeAdapter implements RealtimeAdapter {
  active = true;
  traffic: Record<string, LineTrafficReport> = {};
  suppress: (ctx: RealtimeTickContext) => Set<string> | undefined = () => undefined;
  ticks: RealtimeTickContext[] = [];
  withApplyTick = true;
  resets = 0;

  startPolling(): void {}
  stopPolling(): void {}
  getStatus() { return { active: this.active }; }
  onUpdate(): void {}
  getTrafficByLine() { return this.traffic; }
  reset() { this.resets++; }
  applyTick = (ctx: RealtimeTickContext): RealtimeTickResult | void => {
    this.ticks.push(ctx);
    const suppressedTripIds = this.suppress(ctx);
    return suppressedTripIds ? { suppressedTripIds } : undefined;
  };
}

async function runFirstTick(
  config: CityConfig,
  adapter: RealtimeAdapter,
  isoTime: string
): Promise<{ count: number; trainIds: string[]; lines: string[]; engine: BrowserSubwayEngine }> {
  vi.setSystemTime(new Date(isoTime));
  const linesRes = await fetch(`${config.paths.dataDir}/lines.json`);
  const lines = await linesRes.json();
  const engine = new BrowserSubwayEngine(config, adapter);
  await engine.initialize(lines);
  let result = { count: -1, trainIds: [] as string[], lines: [] as string[] };
  engine.start({
    onTick: (trains, count) => {
      if (result.count === -1) {
        result = { count, trainIds: trains.map(t => t.id), lines: trains.map(t => t.line) };
      }
    }
  });
  engine.stop();
  return { ...result, engine };
}

describe('Moteur ↔ adaptateur temps réel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    resetShapesCache();
    stubFetchFromPublicDir();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetShapesCache();
  });

  describe('registre', () => {
    it('associe à chaque ville son adaptateur, et à rien un adaptateur inerte', () => {
      expect(createRealtimeAdapter(parisConfig)).toBeInstanceOf(PrimRealtimeAdapter);
      expect(createRealtimeAdapter(montrealConfig)).toBeInstanceOf(StmRealtimeAdapter);
      expect(createRealtimeAdapter(londonConfig)).toBeInstanceOf(TflRealtimeAdapter);

      const none = createRealtimeAdapter({
        ...parisConfig,
        realtime: { ...parisConfig.realtime, provider: 'none' }
      });
      expect(none.getStatus().active).toBe(false);
      expect(none.applyTick).toBeUndefined();
    });

    it("Montréal n'a pas de recalage par tick : état de service seul", () => {
      expect(createRealtimeAdapter(montrealConfig).applyTick).toBeUndefined();
    });
  });

  describe('mode théorique par le vrai moteur, recoupé avec les snapshots', () => {
    it('Montréal : 72 rames à l’heure du snapshot', async () => {
      const { count } = await runFirstTick(
        montrealConfig, createRealtimeAdapter(montrealConfig), SNAPSHOT_TIMESTAMP_ISO_MONTREAL
      );
      expect(count).toBe(72);
    });

    it('Londres : 688 rames tous modes à l’heure du snapshot', async () => {
      const { count } = await runFirstTick(
        londonConfig, createRealtimeAdapter(londonConfig), SNAPSHOT_TIMESTAMP_ISO_LONDON
      );
      expect(count).toBe(688);
    });

    it('Paris (métro) : un adaptateur inactif ne change rien', async () => {
      const inactive = new FakeAdapter();
      inactive.active = false;
      const withRealClient = await runFirstTick(
        parisMetroOnly, createRealtimeAdapter(parisMetroOnly), SNAPSHOT_TIMESTAMP_ISO
      );
      resetShapesCache();
      const withFake = await runFirstTick(parisMetroOnly, inactive, SNAPSHOT_TIMESTAMP_ISO);

      expect(withRealClient.count).toBeGreaterThan(0);
      expect(withFake.trainIds).toEqual(withRealClient.trainIds);
      expect(inactive.ticks).toHaveLength(0);
    });
  });

  describe('contrat', () => {
    it("transmet l'heure locale de la ville et les courses actives", async () => {
      const fake = new FakeAdapter();
      const { count } = await runFirstTick(parisMetroOnly, fake, SNAPSHOT_TIMESTAMP_ISO);

      expect(fake.ticks).toHaveLength(1);
      const ctx = fake.ticks[0];
      expect(ctx.civilSeconds).toBe(8 * 3600 + 30 * 60); // 08:30 à Paris
      expect(ctx.activeSchedTrips.length).toBe(count);
      expect(ctx.schedTripsById.size).toBeGreaterThanOrEqual(ctx.activeSchedTrips.length);
    });

    it("masque les courses que l'adaptateur déclare fantômes", async () => {
      const baseline = await runFirstTick(parisMetroOnly, new FakeAdapter(), SNAPSHOT_TIMESTAMP_ISO);
      resetShapesCache();

      const ghosts = new Set(baseline.trainIds.slice(0, 5));
      const fake = new FakeAdapter();
      fake.suppress = () => ghosts;
      const withGhosts = await runFirstTick(parisMetroOnly, fake, SNAPSHOT_TIMESTAMP_ISO);

      expect(withGhosts.count).toBe(baseline.count - 5);
      for (const id of ghosts) expect(withGhosts.trainIds).not.toContain(id);
    });

    it("vide une ligne que l'adaptateur déclare interrompue", async () => {
      const baseline = await runFirstTick(parisMetroOnly, new FakeAdapter(), SNAPSHOT_TIMESTAMP_ISO);
      resetShapesCache();

      const targetLine = baseline.lines[0];
      const onTarget = baseline.lines.filter(l => l === targetLine).length;
      const fake = new FakeAdapter();
      fake.traffic = {
        [targetLine]: {
          lineId: targetLine,
          status: 'interrupted',
          severity: 'alert',
          title: 'Trafic interrompu',
          message: 'test',
          updatedAt: new Date().toISOString()
        }
      };
      const interrupted = await runFirstTick(parisMetroOnly, fake, SNAPSHOT_TIMESTAMP_ISO);

      expect(onTarget).toBeGreaterThan(0);
      expect(interrupted.lines).not.toContain(targetLine);
      expect(interrupted.count).toBe(baseline.count - onTarget);
    });

    it("oublie l'état de l'adaptateur quand le temps réel s'arrête", async () => {
      const fake = new FakeAdapter();
      const { engine } = await runFirstTick(parisMetroOnly, fake, SNAPSHOT_TIMESTAMP_ISO);
      engine.stopRealtime();
      expect(fake.resets).toBeGreaterThanOrEqual(1);
    });
  });
});
