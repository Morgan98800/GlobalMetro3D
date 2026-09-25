import type { RealtimeAdapter } from '@core/rt/adapter';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';
import { StmRealtimeClient, type StmStatus } from './stm_client';

/**
 * Temps réel montréalais : état du service seul (capacité `service-status-only`).
 *
 * Le GTFS-RT de la STM ne couvre que les autobus. Aucun recalage par course
 * n'est possible pour le métro : l'adaptateur n'implémente donc pas `applyTick`,
 * et son seul effet sur la carte passe par `getTrafficByLine` — une ligne
 * interrompue n'affiche plus de rames.
 */
export class StmRealtimeAdapter implements RealtimeAdapter<StmStatus> {
  readonly client: StmRealtimeClient;

  constructor(config: CityRealtimeConfig) {
    this.client = new StmRealtimeClient(config.pollIntervalMs);
  }

  startPolling(lineIds: string[], getFocusedLineId: () => string | null): void {
    this.client.startPolling(lineIds, getFocusedLineId);
  }

  stopPolling(): void {
    this.client.stopPolling();
  }

  getStatus(): StmStatus {
    return this.client.getStatus();
  }

  onUpdate(callback: (status: StmStatus) => void): void {
    this.client.onUpdate(callback);
  }

  getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.client.getTrafficByLine();
  }
}
