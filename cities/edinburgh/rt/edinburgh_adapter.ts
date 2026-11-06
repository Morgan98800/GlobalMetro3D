import type { RealtimeAdapter, RealtimeStatusBase } from '@core/rt/adapter';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';

export interface EdinburghRealtimeStatus extends RealtimeStatusBase {
  active: boolean;
  provider: 'none';
  mode: 'theoretical_only';
}

/**
 * Adaptateur temps réel pour Édimbourg.
 * 
 * Édimbourg est exploitée en mode purement théorique (provider: 'none') :
 * - Aucune API publique ouverte fiable n'est disponible (TfE OpenData 522 Cloudflare hors-service,
 *   Edinburgh Travel Tracker Trapeze fermé sous User_Key privée, BODS GTFS-RT ne couvre pas le tram).
 * - Les 299 courses quotidiennes sont cadencées fidèlement par la cinématique GTFS.
 */
export class EdinburghRealtimeAdapter implements RealtimeAdapter<EdinburghRealtimeStatus> {
  private config: CityRealtimeConfig;

  constructor(config: CityRealtimeConfig) {
    this.config = config;
  }

  startPolling(): void {}
  stopPolling(): void {}

  getStatus(): EdinburghRealtimeStatus {
    return {
      active: false,
      provider: 'none',
      mode: 'theoretical_only'
    };
  }

  onUpdate(): void {}

  getTrafficByLine(): Record<string, LineTrafficReport> {
    return {};
  }
}
