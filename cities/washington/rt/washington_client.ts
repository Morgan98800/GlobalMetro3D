import type { LineTrafficReport } from '@core/types';
import type { WashingtonSnapshot, WashingtonTripUpdate, WashingtonTrainUpdate, WashingtonStatus } from './types';
import { WashingtonMatcher, type WashingtonMatchOutcome } from './washington_matching';
import type { SchedTrip } from '@core/rt/rt_matching';

export class WashingtonRealtimeClient {
  private trafficByLine: Record<string, LineTrafficReport> = {};
  private tripUpdates: WashingtonTripUpdate[] = [];
  private trains: WashingtonTrainUpdate[] = [];
  private isPolling = false;
  private timerId: any = null;
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
  private feedHealthy = false;
  private serviceActive = true;
  private serviceStatus: 'active' | 'unavailable' | 'degraded' = 'active';
  private serviceMessage?: string;
  private pollIntervalMs = 15000;
  private onUpdateCallback?: (status: WashingtonStatus) => void;
  private matcher: WashingtonMatcher;
  private lastOutcome?: WashingtonMatchOutcome;

  constructor(pollIntervalMs: number = 15000) {
    this.pollIntervalMs = pollIntervalMs;
    this.matcher = new WashingtonMatcher({
      matchWindowSec: 120,
      maxDelaySec: 900
    });
  }

  public getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.trafficByLine;
  }

  public getTripUpdates(): readonly WashingtonTripUpdate[] {
    return this.tripUpdates;
  }

  public getTrains(): readonly WashingtonTrainUpdate[] {
    return this.trains;
  }

  public isFeedHealthy(): boolean {
    return this.feedHealthy;
  }

  public getMatcher(): WashingtonMatcher {
    return this.matcher;
  }

  public getLastOutcome(): WashingtonMatchOutcome | undefined {
    return this.lastOutcome;
  }

  public matchTrips(
    activeTrips: readonly SchedTrip[],
    currentCivilSeconds: number,
    filterRouteId: string = 'RED'
  ): WashingtonMatchOutcome {
    const outcome = this.matcher.match(this.tripUpdates, activeTrips, currentCivilSeconds, filterRouteId);
    this.lastOutcome = outcome;
    return outcome;
  }

  public getStatus(): WashingtonStatus {
    const minutesAgo = this.lastUpdate !== null
      ? Math.floor((Date.now() - this.lastUpdate) / 60000)
      : undefined;

    return {
      active: this.isPolling,
      lastUpdate: this.lastUpdate,
      minutesAgo,
      feedHealthy: this.feedHealthy,
      serviceActive: this.serviceActive,
      serviceStatus: this.serviceStatus,
      serviceMessage: this.serviceMessage,
      lastError: this.lastError,
      trafficByLine: this.trafficByLine,
      coveragePct: this.lastOutcome ? Math.round(this.lastOutcome.matchRate * 100) : undefined,
      matchedCount: this.lastOutcome?.matchedCount,
      totalReceivedCount: this.lastOutcome?.receivedCount,
      discardedNonMonotonicCount: this.lastOutcome?.discardedNonMonotonicCount,
      trainCount: this.trains.length
    };
  }

  public onUpdate(callback: (status: WashingtonStatus) => void): void {
    this.onUpdateCallback = callback;
  }

  public startPolling(lineIds?: string[], getFocusedLineId?: () => string | null): void {
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

  public injectSnapshot(snapshot: WashingtonSnapshot): void {
    this.feedHealthy = snapshot.feedHealthy;
    this.serviceActive = snapshot.serviceActive;
    this.serviceStatus = snapshot.serviceStatus;
    this.serviceMessage = snapshot.lastError ?? undefined;
    this.lastError = snapshot.lastError;
    this.lastUpdate = snapshot.timestamp ? snapshot.timestamp * 1000 : Date.now();
    this.trains = snapshot.trains || [];
    this.tripUpdates = snapshot.tripUpdates || [];
    this.trafficByLine = snapshot.trafficByLine || {};

    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getStatus());
    }
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch('/api/washington-rt');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WashingtonSnapshot = await res.json();
      this.injectSnapshot(data);
    } catch (e: any) {
      this.feedHealthy = false;
      this.serviceActive = false;
      this.serviceStatus = 'unavailable';
      this.lastError = e.message || 'Poll failed';
      if (this.onUpdateCallback) {
        this.onUpdateCallback(this.getStatus());
      }
    }
  }
}
