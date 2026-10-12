import type { RealtimeAdapter, RealtimeTickContext } from '@core/rt/adapter';
import { buildTimeline } from '@core/rt/rt_matching';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';
import { WashingtonRealtimeClient } from './washington_client';
import type { WashingtonStatus } from './types';

/**
 * Adaptateur temps réel pour Washington DC (WMATA GTFS-RT).
 *
 * Implémente le contrat RealtimeAdapter pour le réseau Metrorail WMATA :
 * - Reconstruction par prédictions d'arrivée (capacité `arrival-predictions`)
 * - Rapprochement par `trip_id` avec contrôle de monotonie stricte
 * - Repli silencieux en mode théorique si le flux est indisponible (429/401/erreur réseau)
 * - Statut des lignes alimenté par les incidents explicites WMATA
 */
export class WashingtonRealtimeAdapter implements RealtimeAdapter<WashingtonStatus> {
  readonly client: WashingtonRealtimeClient;
  private readonly config: CityRealtimeConfig;

  constructor(config: CityRealtimeConfig) {
    this.config = config;
    this.client = new WashingtonRealtimeClient(config.pollIntervalMs);
  }

  startPolling(lineIds?: string[], getFocusedLineId?: () => string | null): void {
    this.client.startPolling(lineIds, getFocusedLineId);
  }

  stopPolling(): void {
    this.client.stopPolling();
  }

  getStatus(): WashingtonStatus {
    return this.client.getStatus();
  }

  onUpdate(callback: (status: WashingtonStatus) => void): void {
    this.client.onUpdate(callback);
  }

  getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.client.getTrafficByLine();
  }

  applyTick(ctx: RealtimeTickContext): void {
    // Si la capacité n'autorise pas les prédictions d'arrivée ou si le flux est indisponible,
    // conserver les chronologies théoriques sans altération (repli gracieux)
    if (this.config.capability?.kind !== 'arrival-predictions') return;
    const status = this.client.getStatus();
    if (!status.feedHealthy || !status.serviceActive) return;

    const outcome = this.client.matchTrips(ctx.activeSchedTrips, ctx.civilSeconds);

    for (const [tripId, m] of outcome.matchesByTripId.entries()) {
      const schedTrip = ctx.schedTripsById.get(tripId);
      if (!schedTrip) continue;

      if (m.confidence === 'measured' && m.nextStationId && m.timeToNextStationS !== undefined) {
        const stop = schedTrip.stops.find((s) => s.stopId === m.nextStationId);
        const calls = stop
          ? [
              {
                stopId: m.nextStationId,
                aimed: stop.arr,
                expected: ctx.civilSeconds + m.timeToNextStationS
              }
            ]
          : [];
        ctx.timelines.set(tripId, buildTimeline(schedTrip, calls));
      } else {
        ctx.timelines.set(tripId, buildTimeline(schedTrip, []));
      }
    }
  }

  reset(): void {
    // Réinitialisation de l'état accumulé
  }
}
