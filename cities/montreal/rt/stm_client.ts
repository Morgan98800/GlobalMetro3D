import type { LineTrafficReport } from '@core/types';

export interface StmStatus {
  active: boolean;
  lastUpdate: number | null;
  minutesAgo?: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  trafficByLine: Record<string, LineTrafficReport>;
}

export class StmRealtimeClient {
  private trafficByLine: Record<string, LineTrafficReport> = {};
  private isPolling = false;
  private timerId: any = null;
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
  private feedHealthy = false;
  private serviceActive = true;
  private serviceMessage?: string;
  private pollIntervalMs = 120000;
  private onUpdateCallback?: (status: StmStatus) => void;

  constructor(pollIntervalMs: number = 120000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  public getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.trafficByLine;
  }

  public isFeedHealthy(): boolean {
    return this.feedHealthy;
  }

  public getStatus(): StmStatus {
    const minutesAgo = this.lastUpdate !== null
      ? Math.floor((Date.now() - this.lastUpdate) / 60000)
      : undefined;

    return {
      active: this.isPolling,
      lastUpdate: this.lastUpdate,
      minutesAgo,
      feedHealthy: this.feedHealthy,
      serviceActive: this.serviceActive,
      serviceMessage: this.serviceMessage,
      lastError: this.lastError,
      trafficByLine: this.trafficByLine
    };
  }

  public onUpdate(callback: (status: StmStatus) => void) {
    this.onUpdateCallback = callback;
  }

  public async pollOnce(): Promise<void> {
    const endpoints = ['/api/stm', '/.netlify/functions/stm_relay'];
    let succeeded = false;

    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          headers: { Accept: 'application/json' }
        });

        if (!resp.ok) continue;

        const data = await resp.json();
        this.lastUpdate = data.timestamp || Date.now();
        this.feedHealthy = data.feedHealthy ?? true;
        this.serviceActive = data.serviceActive ?? true;
        this.serviceMessage = data.serviceMessage;
        this.lastError = data.lastError || null;

        if (data.trafficByLine && typeof data.trafficByLine === 'object') {
          this.trafficByLine = data.trafficByLine;
        }

        succeeded = true;
        break;
      } catch (err: any) {
        // Try fallback endpoint
      }
    }

    if (!succeeded && this.lastUpdate === null) {
      this.feedHealthy = false;
      this.lastError = 'Échec de communication avec le relais STM';
    }

    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getStatus());
    }
  }

  public startPolling(_lineIds: string[] = [], _getFocusedLine?: () => string | null) {
    if (this.isPolling) return;
    this.isPolling = true;

    // Initial immediate poll
    this.pollOnce();

    this.timerId = setInterval(() => {
      this.pollOnce();
    }, this.pollIntervalMs);
  }

  public stopPolling() {
    this.isPolling = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
