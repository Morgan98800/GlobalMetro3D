import type { RtJourney, RtCall, MatchStats } from './rt_matching';
import { parisClock } from './paris_time';

export interface LineTrafficReport {
  lineId: string;
  status: 'normal' | 'disrupted' | 'interrupted';
  severity: 'normal' | 'info' | 'warning' | 'alert';
  title: string;
  message: string;
  updatedAt: string;
  closedStations?: string[];
}

export interface PrimStatus {
  active: boolean;
  lastUpdate: number | null;
  minutesAgo?: number;
  delays: Record<string, number>;
  requestCount: number;
  lastError: string | null;
  feedHealthy: boolean;
  matchStats?: MatchStats | null;
  directionSuccessRate?: number;
  trafficByLine?: Record<string, LineTrafficReport>;
}

export function normalizeStopName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isoToServiceSeconds(isoStr: string, currentServiceDate: string): number {
  const d = new Date(isoStr);
  const { date, secondsSinceMidnight } = parisClock(d);
  if (date === currentServiceDate) {
    return secondsSinceMidnight;
  }
  const [y1, m1, d1] = currentServiceDate.split('-').map(Number);
  const [y2, m2, d2] = date.split('-').map(Number);
  const dt1 = Date.UTC(y1, m1 - 1, d1);
  const dt2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.round((dt2 - dt1) / 86400000);
  return secondsSinceMidnight + diffDays * 86400;
}

export class PrimRealtimeClient {
  private apiKey: string;
  private lineDelays = new Map<string, number>();
  private rawJourneys: RtJourney[] = [];
  private trafficByLine: Record<string, LineTrafficReport> = {};
  private isPolling = false;
  private timerId: any = null;
  private requestCount = 0;
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
  private feedHealthy = false;
  private matchStats: MatchStats | null = null;
  private directionSuccessRate = 1.0;
  private onUpdateCallback?: (status: PrimStatus) => void;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey.trim();
  }

  public setApiKey(key: string) {
    this.apiKey = key.trim();
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public getJourneys(): readonly RtJourney[] {
    return this.rawJourneys;
  }

  public getTrafficByLine(): Record<string, LineTrafficReport> {
    return this.trafficByLine;
  }

  public isFeedHealthy(): boolean {
    return this.feedHealthy;
  }

  public setMatchingStats(stats: MatchStats | null, dirRate?: number) {
    this.matchStats = stats;
    if (dirRate !== undefined) {
      this.directionSuccessRate = dirRate;
    }
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getStatus());
    }
  }

  public getLineDelay(lineId: string, dir?: number | string): number {
    if (dir !== undefined) {
      const dirKey = `${lineId}#${dir}`;
      if (this.lineDelays.has(dirKey)) {
        return this.lineDelays.get(dirKey)!;
      }
    }
    return this.lineDelays.get(lineId) || 0;
  }

  public getStatus(): PrimStatus {
    const delays: Record<string, number> = {};
    for (const [k, v] of this.lineDelays.entries()) {
      delays[k] = v;
    }
    const ageMs = this.lastUpdate ? Date.now() - this.lastUpdate : 0;
    const minutesAgo = this.lastUpdate ? Math.max(0, Math.round(ageMs / 60000)) : undefined;

    return {
      active: this.isPolling && !this.lastError && minutesAgo !== undefined && minutesAgo <= 10 && this.feedHealthy,
      lastUpdate: this.lastUpdate,
      minutesAgo,
      delays,
      requestCount: this.requestCount,
      lastError: this.lastError,
      feedHealthy: this.feedHealthy,
      matchStats: this.matchStats,
      directionSuccessRate: this.directionSuccessRate,
      trafficByLine: this.trafficByLine
    };
  }

  public onUpdate(callback: (status: PrimStatus) => void) {
    this.onUpdateCallback = callback;
  }

  /**
   * Lit le flux agrégé du relai partagé (1 seule requête toutes les 3 minutes)
   */
  public async pollRelay(): Promise<void> {
    const urls = ['/api/prim', '/.netlify/functions/prim_relay', '/.netlify/functions/prim_delays', '/data/prim_delays.json'];
    let json: any = null;

    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          json = await res.json();
          if (json && json.timestamp) break;
        }
      } catch {
        // fallback to next url
      }
    }

    this.requestCount++;

    // Si absent : bascule transparente en confiance 100% « théorique » sans bloquer
    if (!json || !json.timestamp) {
      this.lineDelays.clear();
      this.rawJourneys = [];
      this.trafficByLine = {};
      this.lastUpdate = null;
      this.feedHealthy = false;
      this.lastError = 'Pas de flux disponible';
      if (this.onUpdateCallback) {
        this.onUpdateCallback(this.getStatus());
      }
      return;
    }

    const ageMs = Date.now() - json.timestamp;
    const minutesAgo = Math.max(0, Math.round(ageMs / 60000));
    this.feedHealthy = Boolean(json.feedHealthy ?? true);
    this.lastError = json.lastError || null;
    this.trafficByLine = json.trafficByLine || {};

    // Si périmé (> 10 min) : bascule transparente 100% théorique
    if (minutesAgo > 10) {
      this.lineDelays.clear();
      this.rawJourneys = [];
      this.lastUpdate = json.timestamp;
      this.feedHealthy = false;
      if (this.onUpdateCallback) {
        this.onUpdateCallback(this.getStatus());
      }
      return;
    }

    // Données fraîches (<= 10 min)
    this.lastUpdate = json.timestamp;
    this.lineDelays.clear();
    const delays = json.delays || {};
    for (const [k, v] of Object.entries(delays)) {
      if (typeof v === 'number') {
        this.lineDelays.set(k, v);
      }
    }

    // Parse full detailed journeys for Level 2 & 3 matching
    const currentServiceDate = parisClock(new Date(json.timestamp)).date;
    const parsedJourneys: RtJourney[] = [];
    const journeysByLine = json.journeysByLine || {};

    let totalDirQueried = 0;
    let successfulDir = 0;

    for (const [lineId, rawJourneysList] of Object.entries(journeysByLine)) {
      if (!Array.isArray(rawJourneysList)) continue;

      for (const rj of rawJourneysList as any[]) {
        const calls: RtCall[] = [];
        const rawCalls = rj?.calls || [];

        for (const c of rawCalls) {
          const stopName = c?.stopPointName || '';
          const stopId = normalizeStopName(stopName);
          if (!stopId) continue;

          const aimedIso = c?.aimedDepartureTime || c?.aimedArrivalTime;
          const expIso = c?.expectedDepartureTime || c?.expectedArrivalTime;

          let aimedSec: number | null = null;
          let expSec: number | null = null;

          if (aimedIso) {
            aimedSec = isoToServiceSeconds(aimedIso, currentServiceDate);
          }
          if (expIso) {
            expSec = isoToServiceSeconds(expIso, currentServiceDate);
          }

          if (aimedSec !== null && expSec !== null) {
            calls.push({ stopId, aimed: aimedSec, expected: expSec });
          } else if (expSec !== null && c?.delaySeconds !== undefined) {
            calls.push({ stopId, aimed: expSec - (c.delaySeconds || 0), expected: expSec });
          } else if (aimedSec !== null) {
            calls.push({ stopId, aimed: aimedSec, expected: aimedSec + (c?.delaySeconds || 0) });
          }
        }

        if (calls.length > 0) {
          totalDirQueried++;
          let dir: 0 | 1 | null = null;
          if (rj.direction === '0' || rj.direction === 0) {
            dir = 0;
            successfulDir++;
          } else if (rj.direction === '1' || rj.direction === 1) {
            dir = 1;
            successfulDir++;
          }

          parsedJourneys.push({
            lineId,
            dir,
            destination: rj.destinationName ? normalizeStopName(rj.destinationName) : null,
            calls,
            journeyRef: rj.journeyId
          });
        }
      }
    }

    this.rawJourneys = parsedJourneys;
    this.directionSuccessRate = totalDirQueried > 0 ? successfulDir / totalDirQueried : 1.0;

    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getStatus());
    }
  }

  /** Polling toutes les 3 minutes (180 000 ms) */
  public startPolling(lineIds?: string[], getFocusedLineId?: () => string | null) {
    if (this.isPolling) return;
    this.isPolling = true;

    this.pollRelay();
    this.timerId = setInterval(() => {
      this.pollRelay();
    }, 180000);
  }

  public stopPolling() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isPolling = false;
    this.lineDelays.clear();
    this.rawJourneys = [];
    this.trafficByLine = {};
    this.matchStats = null;
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getStatus());
    }
  }
}
