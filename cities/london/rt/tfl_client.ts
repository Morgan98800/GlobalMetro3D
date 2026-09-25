import type { LineTrafficReport } from '@core/types';
import type { TflArrivalPrediction, TflSnapshot } from '../../../netlify/functions/tfl_relay';
import { TflHybridMatcher, type TflMatchOutcome } from '@core/rt/tfl_matching';
import type { SchedTrip } from '@core/rt/rt_matching';

export interface TflStatus {
  active: boolean;
  lastUpdate: number | null;
  minutesAgo?: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  trafficByLine: Record<string, LineTrafficReport>;
  coveragePct?: number;
  matchedCount?: number;
  totalActiveCount?: number;
}

export class TflRealtimeClient {
  private trafficByLine: Record<string, LineTrafficReport> = {};
  private arrivals: TflArrivalPrediction[] = [];
  private isPolling = false;
  private timerId: any = null;
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
  private feedHealthy = false;
  private serviceActive = true;
  private serviceMessage?: string;
  private pollIntervalMs = 60000;
  private onUpdateCallback?: (status: TflStatus) => void;
  private matcher: TflHybridMatcher;
  private lastOutcome?: TflMatchOutcome;

  constructor(pollIntervalMs: number = 60000) {
    this.pollIntervalMs = pollIntervalMs;
    this.matcher = new TflHybridMatcher({
      matchWindowSec: 120,
      maxDelaySec: 900,
      alpha: 0.4
    });
  }

  public getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.trafficByLine;
  }

  public getArrivals(): readonly TflArrivalPrediction[] {
    return this.arrivals;
  }

  public isFeedHealthy(): boolean {
    return this.feedHealthy;
  }

  public getMatcher(): TflHybridMatcher {
    return this.matcher;
  }

  public matchTrips(activeTrips: readonly SchedTrip[], currentCivilSeconds: number): TflMatchOutcome {
    const outcome = this.matcher.match(this.arrivals, activeTrips, currentCivilSeconds);
    this.lastOutcome = outcome;
    return outcome;
  }

  public getStatus(): TflStatus {
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
      trafficByLine: this.trafficByLine,
      coveragePct: this.lastOutcome?.coveragePct,
      matchedCount: this.lastOutcome?.matchedCount,
      totalActiveCount: this.lastOutcome?.totalActiveCount
    };
  }

  public onUpdate(callback: (status: TflStatus) => void) {
    this.onUpdateCallback = callback;
  }

  public async pollOnce(): Promise<void> {
    const endpoints = ['/api/tfl_arrivals', '/.netlify/functions/tfl_relay'];
    let succeeded = false;

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });

        if (!res.ok) {
          continue;
        }

        const data: TflSnapshot = await res.json();
        if (!data || typeof data !== 'object') {
          continue;
        }

        this.lastUpdate = data.timestamp || Date.now();
        this.feedHealthy = data.feedHealthy !== false;
        this.serviceActive = data.serviceActive !== false;
        this.serviceMessage = data.serviceMessage;
        this.lastError = data.lastError || null;
        this.trafficByLine = data.trafficByLine || {};
        this.arrivals = Array.isArray(data.arrivals) ? data.arrivals : [];

        succeeded = true;
        break;
      } catch (err: any) {
        // Fallback sur le prochain endpoint
      }
    }

    if (!succeeded && this.lastUpdate === null) {
      this.feedHealthy = false;
      this.lastError = 'Échec de communication avec le relais TfL';
    }

    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getStatus());
    }
  }

  public startPolling(_lineIds: string[] = [], _getFocusedLine?: () => string | null) {
    if (this.isPolling) return;
    this.isPolling = true;
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
