import type { LineTrafficReport } from '@core/types';
import type { BerlinSnapshot, BerlinTripUpdate, BerlinStatus } from './types';
import { BerlinMatcher, type BerlinMatchOutcome } from './berlin_matching';
import type { SchedTrip } from '@core/rt/rt_matching';

export class BerlinRealtimeClient {
  private trafficByLine: Record<string, LineTrafficReport> = {};
  private tripUpdates: BerlinTripUpdate[] = [];
  private isPolling = false;
  private timerId: any = null;
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
  private feedHealthy = false;
  private serviceActive = true;
  private serviceMessage?: string;
  private pollIntervalMs = 15000;
  private relayUrl = '/api/berlin-rt';
  private onUpdateCallback?: (status: BerlinStatus) => void;
  private matcher: BerlinMatcher;
  private lastOutcome?: BerlinMatchOutcome;

  constructor(relayUrl: string = '/api/berlin-rt', pollIntervalMs: number = 15000) {
    this.relayUrl = relayUrl;
    this.pollIntervalMs = pollIntervalMs;
    this.matcher = new BerlinMatcher({
      matchWindowSec: 120,
      maxDelaySec: 900
    });
  }

  public getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.trafficByLine;
  }

  public getTripUpdates(): readonly BerlinTripUpdate[] {
    return this.tripUpdates;
  }

  public isFeedHealthy(): boolean {
    return this.feedHealthy;
  }

  public getMatcher(): BerlinMatcher {
    return this.matcher;
  }

  public getLastOutcome(): BerlinMatchOutcome | undefined {
    return this.lastOutcome;
  }

  public matchTrips(
    activeTrips: readonly SchedTrip[],
    currentCivilSeconds: number,
    filterRouteId?: string,
    stationMap?: Record<string, string>
  ): BerlinMatchOutcome {
    const outcome = this.matcher.match(
      this.tripUpdates,
      activeTrips,
      currentCivilSeconds,
      filterRouteId,
      stationMap
    );
    this.lastOutcome = outcome;
    return outcome;
  }

  public getStatus(): BerlinStatus {
    const minutesAgo =
      this.lastUpdate !== null ? Math.floor((Date.now() - this.lastUpdate) / 60000) : undefined;

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

  public onUpdate(callback: (status: BerlinStatus) => void): void {
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

  public injectSnapshot(snapshot: BerlinSnapshot): void {
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
      const res = await fetch(this.relayUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BerlinSnapshot = await res.json();
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
