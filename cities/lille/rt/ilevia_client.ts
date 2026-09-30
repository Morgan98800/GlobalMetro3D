import type { LineTrafficReport } from '@core/types';
import type { IleviaSnapshot, IleviaTripUpdate } from './types';
import { IleviaMatcher, type IleviaMatchOutcome } from './ilevia_matching';
import type { SchedTrip } from '@core/rt/rt_matching';

export interface IleviaStatus {
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
  totalReceivedCount?: number;
  discardedNonMonotonicCount?: number;
}

export class IleviaRealtimeClient {
  private trafficByLine: Record<string, LineTrafficReport> = {};
  private tripUpdates: IleviaTripUpdate[] = [];
  private isPolling = false;
  private timerId: any = null;
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
  private feedHealthy = false;
  private serviceActive = true;
  private serviceMessage?: string;
  private pollIntervalMs = 30000;
  private onUpdateCallback?: (status: IleviaStatus) => void;
  private matcher: IleviaMatcher;
  private lastOutcome?: IleviaMatchOutcome;

  constructor(pollIntervalMs: number = 30000) {
    this.pollIntervalMs = pollIntervalMs;
    this.matcher = new IleviaMatcher({
      matchWindowSec: 120,
      maxDelaySec: 900
    });
  }

  public getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.trafficByLine;
  }

  public getTripUpdates(): readonly IleviaTripUpdate[] {
    return this.tripUpdates;
  }

  public isFeedHealthy(): boolean {
    return this.feedHealthy;
  }

  public getMatcher(): IleviaMatcher {
    return this.matcher;
  }

  public getLastOutcome(): IleviaMatchOutcome | undefined {
    return this.lastOutcome;
  }

  public matchTrips(
    activeTrips: readonly SchedTrip[],
    currentCivilSeconds: number,
    filterRouteId?: string
  ): IleviaMatchOutcome {
    const outcome = this.matcher.match(this.tripUpdates, activeTrips, currentCivilSeconds, filterRouteId);
    this.lastOutcome = outcome;
    return outcome;
  }

  public getStatus(): IleviaStatus {
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
      coveragePct: this.lastOutcome ? Math.round(this.lastOutcome.matchRate * 100) : undefined,
      matchedCount: this.lastOutcome?.matchedCount,
      totalReceivedCount: this.lastOutcome?.receivedCount,
      discardedNonMonotonicCount: this.lastOutcome?.discardedNonMonotonicCount
    };
  }

  public onUpdate(callback: (status: IleviaStatus) => void): void {
    this.onUpdateCallback = callback;
  }

  public startPolling(lineIds: string[], getFocusedLineId: () => string | null): void {
    if (this.isPolling) return;
    this.isPolling = true;
    this.poll();
    this.timerId = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  public stopPolling(): void {
    this.isPolling = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public injectSnapshot(snapshot: IleviaSnapshot): void {
    this.feedHealthy = snapshot.feedHealthy;
    this.serviceActive = snapshot.serviceActive;
    this.serviceMessage = snapshot.serviceMessage;
    this.lastError = snapshot.lastError;
    this.lastUpdate = snapshot.timestamp ? snapshot.timestamp * 1000 : Date.now();
    this.tripUpdates = snapshot.tripUpdates || [];
    this.trafficByLine = snapshot.trafficByLine || {};

    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getStatus());
    }
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch('/api/lille-rt');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: IleviaSnapshot = await res.json();
      this.injectSnapshot(data);
    } catch (e: any) {
      this.feedHealthy = false;
      this.lastError = e.message || 'Poll failed';
      if (this.onUpdateCallback) {
        this.onUpdateCallback(this.getStatus());
      }
    }
  }
}
