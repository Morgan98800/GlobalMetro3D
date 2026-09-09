export interface PrimStatus {
  active: boolean;
  lastUpdate: number | null;
  delays: Record<string, number>;
  requestCount: number;
  lastError: string | null;
}

export class PrimRealtimeClient {
  private apiKey: string;
  private lineDelays = new Map<string, number>(); // lineId -> delay (seconds)
  private isPolling = false;
  private timerId: any = null;
  private requestCount = 0;
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
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
    return {
      active: this.isPolling && !this.lastError,
      lastUpdate: this.lastUpdate,
      delays,
      requestCount: this.requestCount,
      lastError: this.lastError
    };
  }

  public onUpdate(callback: (status: PrimStatus) => void) {
    this.onUpdateCallback = callback;
  }

  /** Polls estimated-timetable for a single line */
  public async pollLine(lineId: string): Promise<number | null> {
    if (!this.apiKey) return null;

    const rawLineNum = lineId.replace('IDFM:', '');
    const url = `https://prim.iledefrance-mobilites.fr/marketplace/estimated-timetable?LineRef=STIF:Line::${rawLineNum}:`;

    try {
      const res = await fetch(url, {
        headers: {
          apikey: this.apiKey,
          accept: 'application/json'
        }
      });

      this.requestCount++;

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          this.lastError = `Clé PRIM invalide ou refusée (${res.status})`;
        } else if (res.status === 429) {
          this.lastError = `Quota PRIM atteint (429 Too Many Requests)`;
        }
        return null;
      }

      const json = await res.json();
      const journeys =
        json?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame?.[0]
          ?.EstimatedVehicleJourney || [];

      let totalDelay = 0;
      let delayCount = 0;
      const dirDelays: Record<string, { total: number; count: number }> = {
        '0': { total: 0, count: 0 },
        '1': { total: 0, count: 0 }
      };

      for (const j of journeys) {
        const dirVal = String(j.DirectionRef?.value || '0').trim();
        const dirKey = dirVal.includes('1') || dirVal.toLowerCase().includes('b') || dirVal.toLowerCase().includes('retour') ? '1' : '0';

        const calls = j.EstimatedCalls?.EstimatedCall || [];
        for (const c of calls) {
          const expStr = c.ExpectedDepartureTime || c.ExpectedArrivalTime;
          const aimStr = c.AimedDepartureTime || c.AimedArrivalTime;
          if (expStr && aimStr) {
            const exp = new Date(expStr).getTime();
            const aim = new Date(aimStr).getTime();
            const delayS = Math.round((exp - aim) / 1000);
            if (Math.abs(delayS) < 1800) {
              totalDelay += delayS;
              delayCount++;
              dirDelays[dirKey].total += delayS;
              dirDelays[dirKey].count++;
            }
          }
        }
      }

      this.lastError = null;
      this.lastUpdate = Date.now();

      if (delayCount > 0) {
        const avgDelay = Math.round(totalDelay / delayCount);
        const prev = this.lineDelays.get(lineId) || 0;
        const smoothed = Math.round(0.3 * avgDelay + 0.7 * prev);
        this.lineDelays.set(lineId, smoothed);

        // Store per-direction smoothed delays
        for (const d of ['0', '1']) {
          if (dirDelays[d].count > 0) {
            const dAvg = Math.round(dirDelays[d].total / dirDelays[d].count);
            const dPrev = this.lineDelays.get(`${lineId}#${d}`) || smoothed;
            this.lineDelays.set(`${lineId}#${d}`, Math.round(0.35 * dAvg + 0.65 * dPrev));
          } else {
            this.lineDelays.set(`${lineId}#${d}`, smoothed);
          }
        }

        if (this.onUpdateCallback) this.onUpdateCallback(this.getStatus());
        return smoothed;
      }

      return this.lineDelays.get(lineId) || 0;
    } catch (err: any) {
      this.lastError = err.message || 'Erreur réseau PRIM';
      return null;
    }
  }

  /** Cycles through lines at 1 poll per 4 seconds (15 req/min, safe within 20 req/min limit) */
  public startPolling(lineIds: string[], getFocusedLineId?: () => string | null) {
    if (this.isPolling || lineIds.length === 0) return;
    this.isPolling = true;

    let index = 0;
    const tick = async () => {
      // Prioritize the focused/selected line if user has one selected
      const focused = getFocusedLineId ? getFocusedLineId() : null;
      const targetLine = (focused && Math.random() < 0.6) ? focused : lineIds[index % lineIds.length];
      index++;

      await this.pollLine(targetLine);
    };

    // First tick immediately
    tick();

    // Loop every 4 seconds
    this.timerId = setInterval(tick, 4000);
  }

  public stopPolling() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isPolling = false;
  }
}
