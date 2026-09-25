import type { RealtimeAdapter, RealtimeTickContext, RealtimeTickResult } from '@core/rt/adapter';
import {
  matchJourneys,
  buildTimeline,
  createGhostTracker,
  updateGhosts,
  stats
} from '@core/rt/rt_matching';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';
import { PrimRealtimeClient, type PrimStatus } from './prim_client';

/**
 * Temps réel parisien : recalage par course (capacité `per-trip-offsets`).
 *
 * Logique déplacée telle quelle depuis `core/sim/browser_engine.ts` : appariement
 * des courses SIRI aux courses théoriques, suppression des trains fantômes,
 * construction des chronologies, publication des statistiques d'appariement.
 */
export class PrimRealtimeAdapter implements RealtimeAdapter<PrimStatus> {
  readonly client: PrimRealtimeClient;
  private readonly ghostTracker = createGhostTracker();
  private readonly everMatchedTrips = new Set<string>();

  constructor(private readonly config: CityRealtimeConfig, apiKey?: string) {
    this.client = new PrimRealtimeClient(apiKey);
  }

  startPolling(lineIds: string[], getFocusedLineId: () => string | null): void {
    this.client.startPolling(lineIds, getFocusedLineId);
  }

  stopPolling(): void {
    this.client.stopPolling();
  }

  getStatus(): PrimStatus {
    return this.client.getStatus();
  }

  onUpdate(callback: (status: PrimStatus) => void): void {
    this.client.onUpdate(callback);
  }

  getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.client.getTrafficByLine();
  }

  reset(): void {
    this.everMatchedTrips.clear();
  }

  applyTick(ctx: RealtimeTickContext): RealtimeTickResult | void {
    if (this.config.capability?.kind !== 'per-trip-offsets') return;

    const journeys = this.client.getJourneys();
    const { matches } = matchJourneys(journeys, ctx.activeSchedTrips);

    for (const m of matches) {
      this.everMatchedTrips.add(m.trip.tripId);
    }

    // Suppression des trains fantômes (garde-fous 1 et 2 inclus)
    const matchedTripIds = new Set(matches.map(m => m.trip.tripId));
    const suppressedTripIds = updateGhosts(
      this.ghostTracker,
      ctx.activeSchedTrips,
      matchedTripIds,
      this.everMatchedTrips,
      this.client.isFeedHealthy()
    );

    // Chronologies de niveau 3 pour les courses appariées
    for (const { journey, trip } of matches) {
      const prev = ctx.timelines.get(trip.tripId);
      ctx.timelines.set(trip.tripId, buildTimeline(trip, journey.calls, prev));
    }

    // Courses actives non appariées : chronologie théorique
    for (const schedTrip of ctx.activeSchedTrips) {
      if (!ctx.timelines.has(schedTrip.tripId)) {
        ctx.timelines.set(schedTrip.tripId, buildTimeline(schedTrip, []));
      }
    }

    // Statistiques d'appariement de niveaux 2 et 3
    const matchStats = stats(
      journeys,
      matches,
      ctx.activeSchedTrips,
      Array.from(ctx.timelines.values()),
      suppressedTripIds
    );
    this.client.setMatchingStats(matchStats);

    return { suppressedTripIds };
  }
}
