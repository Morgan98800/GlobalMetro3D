import type { RealtimeAdapter, RealtimeTickContext } from '@core/rt/adapter';
import { buildTimeline } from '@core/rt/rt_matching';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';
import { IleviaRealtimeClient, type IleviaStatus } from './ilevia_client';

/**
 * Adaptateur temps réel pour Lille (Ilévia GTFS-RT).
 *
 * Implémente le contrat RealtimeAdapter de façon générique pour les TripUpdates GTFS-RT :
 * - Rapprochement par `trip_id` stable
 * - Contrôle de monotonie stricte des horaires (§3.4)
 * - Assignation de chronologies recalées sur prédictions d'arrivée
 * - Trafic par ligne vide `{}` (aucun flux d'alertes en open data, §3.6)
 */
export class IleviaRealtimeAdapter implements RealtimeAdapter<IleviaStatus> {
  readonly client: IleviaRealtimeClient;

  constructor(private readonly config: CityRealtimeConfig) {
    this.client = new IleviaRealtimeClient(config.pollIntervalMs);
  }

  startPolling(lineIds: string[], getFocusedLineId: () => string | null): void {
    this.client.startPolling(lineIds, getFocusedLineId);
  }

  stopPolling(): void {
    this.client.stopPolling();
  }

  getStatus(): IleviaStatus {
    return this.client.getStatus();
  }

  onUpdate(callback: (status: IleviaStatus) => void): void {
    this.client.onUpdate(callback);
  }

  getTrafficByLine(): Record<string, LineTrafficReport> {
    // Règle §3.6 : Le flux n'a pas d'alerts. getTrafficByLine renvoie {}.
    // N'infère pas d'interruption de l'absence de mises à jour.
    return {};
  }

  applyTick(ctx: RealtimeTickContext): void {
    // Si la capacité n'autorise pas les prédictions d'arrivée, conserver les chronologies théoriques
    if (this.config.capability?.kind !== 'arrival-predictions') return;

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
