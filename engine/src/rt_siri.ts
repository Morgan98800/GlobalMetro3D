import http from 'http';
import https from 'https';

export interface RTJourneyCall {
  stopPointRef: string;
  expectedTime: Date | null;
  aimedTime: Date | null;
  delaySeconds: number;
}

export class PrimRealtimeClient {
  private apiKey: string;
  private lineDelays: Map<string, number> = new Map(); // lineId -> average delay in seconds
  private lastPollTimes: Map<string, number> = new Map();
  private isPolling = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public getLineDelay(lineId: string): number {
    return this.lineDelays.get(lineId) || 0;
  }

  /** Polls estimated-timetable for a specific line (e.g. "IDFM:C01379") */
  public async pollLine(lineId: string): Promise<number | null> {
    const rawLineNum = lineId.replace('IDFM:', '');
    const url = `https://prim.iledefrance-mobilites.fr/marketplace/estimated-timetable?LineRef=STIF:Line::${rawLineNum}:`;

    return new Promise((resolve) => {
      const req = https.get(
        url,
        {
          headers: {
            apikey: this.apiKey,
            accept: 'application/json'
          },
          timeout: 5000
        },
        (res) => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }

          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const journeys =
                json?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame?.[0]?.EstimatedVehicleJourney || [];

              let totalDelay = 0;
              let delayCount = 0;

              for (const j of journeys) {
                const calls = j.EstimatedCalls?.EstimatedCall || [];
                for (const c of calls) {
                  const expStr = c.ExpectedDepartureTime || c.ExpectedArrivalTime;
                  const aimStr = c.AimedDepartureTime || c.AimedArrivalTime;
                  if (expStr && aimStr) {
                    const exp = new Date(expStr).getTime();
                    const aim = new Date(aimStr).getTime();
                    const delayS = Math.round((exp - aim) / 1000);
                    if (Math.abs(delayS) < 1800) { // filter anomalies > 30 min
                      totalDelay += delayS;
                      delayCount++;
                    }
                  }
                }
              }

              if (delayCount > 0) {
                const avgDelay = Math.round(totalDelay / delayCount);
                // Apply exponential smoothing (alpha = 0.3)
                const prevDelay = this.lineDelays.get(lineId) || 0;
                const smoothedDelay = Math.round(0.3 * avgDelay + 0.7 * prevDelay);
                this.lineDelays.set(lineId, smoothedDelay);
                resolve(smoothedDelay);
              } else {
                resolve(this.lineDelays.get(lineId) || 0);
              }
            } catch (err) {
              resolve(null);
            }
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /** Cycles through lines at rate limit of 20 req/min (1 poll every 3s) */
  public startPolling(lineIds: string[]) {
    if (this.isPolling || lineIds.length === 0) return;
    this.isPolling = true;

    let index = 0;
    setInterval(async () => {
      const lineId = lineIds[index % lineIds.length];
      index++;
      try {
        await this.pollLine(lineId);
      } catch (e) {
        // graceful ignore
      }
    }, 3000); // 1 request every 3s = 20 requests/min (exact PRIM free tier budget!)

    console.log(`[rt-siri] Realtime poller started for ${lineIds.length} lines (budget: 20 req/min).`);
  }
}
