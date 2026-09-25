import type { RealtimeAdapter, RealtimeTickContext } from '@core/rt/adapter';
import { buildTimeline } from '@core/rt/rt_matching';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';
import { TflRealtimeClient, type TflStatus } from './tfl_client';

/**
 * Temps réel londonien : reconstruction par prédictions d'arrivée (capacité
 * `arrival-predictions`).
 *
 * Logique déplacée telle quelle depuis `core/sim/browser_engine.ts`. Une rame
 * appariée avec une confiance « mesurée » reçoit une chronologie recalée sur
 * sa prochaine gare ; toute autre course garde une chronologie théorique.
 */
export class TflRealtimeAdapter implements RealtimeAdapter<TflStatus> {
  readonly client: TflRealtimeClient;

  constructor(private readonly config: CityRealtimeConfig) {
    this.client = new TflRealtimeClient(config.pollIntervalMs);
  }

  startPolling(lineIds: string[], getFocusedLineId: () => string | null): void {
    this.client.startPolling(lineIds, getFocusedLineId);
  }

  stopPolling(): void {
    this.client.stopPolling();
  }

  getStatus(): TflStatus {
    return this.client.getStatus();
  }

  onUpdate(callback: (status: TflStatus) => void): void {
    this.client.onUpdate(callback);
  }

  getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.client.getTrafficByLine();
  }

  applyTick(ctx: RealtimeTickContext): void {
    if (this.config.capability?.kind !== 'arrival-predictions') return;

    const outcome = this.client.matchTrips(ctx.activeSchedTrips, ctx.civilSeconds);

    for (const [tripId, m] of outcome.matchesByTripId.entries()) {
      const schedTrip = ctx.schedTripsById.get(tripId);
      if (!schedTrip) continue;

      if (m.confidence === 'measured' && m.nextStationId && m.timeToNextStationS !== undefined) {
        const stop = schedTrip.stops.find(s => s.stopId === m.nextStationId);
        const calls = stop ? [{
          stopId: m.nextStationId,
          aimed: stop.arr,
          expected: ctx.civilSeconds + m.timeToNextStationS
        }] : [];
        ctx.timelines.set(tripId, buildTimeline(schedTrip, calls));
      } else {
        ctx.timelines.set(tripId, buildTimeline(schedTrip, []));
      }
    }
  }
}
