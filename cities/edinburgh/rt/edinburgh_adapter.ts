import type { RealtimeAdapter, RealtimeStatusBase } from '@core/rt/adapter';
import type { CityRealtimeConfig } from '@core/config';
import type { LineTrafficReport } from '@core/types';

export interface EdinburghRealtimeStatus extends RealtimeStatusBase {
  active: boolean;
  provider: 'none';
  mode: 'theoretical_only';
}

/**
 * Adaptateur temps réel pour Édimbourg (ScotRail & National Rail).
 * 
 * Édimbourg est exploitée en mode théorique (provider: 'none') avec cinématique haute précision.
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
