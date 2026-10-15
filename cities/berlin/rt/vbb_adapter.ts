import type { RealtimeAdapter, RealtimeTickContext } from '@core/rt/adapter';
import { buildTimeline } from '@core/rt/rt_matching';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';
import { BerlinRealtimeClient } from './berlin_client';
import type { BerlinStatus } from './types';

/**
 * Adaptateur temps réel pour Berlin (VBB GTFS-RT TripUpdates).
 *
 * Implémente le contrat RealtimeAdapter pour le réseau U-Bahn de Berlin :
 * - Rapprochement par `trip_id` GTFS (§5.3)
 * - Contrôle de monotonie stricte des horaires (§5.5)
 * - Assignation de chronologies recalées sur prédictions d'arrivée
 * - Couverture partielle : maintien en théorique des courses sans mise à jour RT (§5.4)
 * - Trafic par ligne vide `{}` (aucun flux d'alertes en open data, §5.6)
 */
export class VbbRealtimeAdapter implements RealtimeAdapter<BerlinStatus> {
  readonly client: BerlinRealtimeClient;
  private readonly config: CityRealtimeConfig;

  constructor(config: CityRealtimeConfig) {
    this.config = config;
    const relayUrl = config.endpoints?.relay || '/api/berlin-rt';
    this.client = new BerlinRealtimeClient(relayUrl, config.pollIntervalMs || 15000);
  }

  startPolling(lineIds: string[], getFocusedLineId: () => string | null): void {
    this.client.startPolling(lineIds, getFocusedLineId);
  }

  stopPolling(): void {
    this.client.stopPolling();
  }

  getStatus(): BerlinStatus {
    return this.client.getStatus();
  }

  onUpdate(callback: (status: BerlinStatus) => void): void {
    this.client.onUpdate(callback);
  }

  getTrafficByLine(): Record<string, LineTrafficReport> {
    // Règle d'or §5.6 : Le flux VBB GTFS-RT ne comporte pas d'alertes.
    // getTrafficByLine renvoie strictement {}.
    // N'infère jamais une interruption à partir de l'absence de rames ou de données RT.
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
        // Mode théorique nominal
        ctx.timelines.set(tripId, buildTimeline(schedTrip, []));
      }
    }
  }

  reset(): void {
    // Réinitialisation de l'état accumulé
  }
}
