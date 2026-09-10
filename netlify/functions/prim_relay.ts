import https from 'https';
import zlib from 'zlib';

export interface EstimatedCallData {
  stopPointRef: string;
  stopPointName: string;
  order: number;
  aimedArrivalTime: string | null;
  expectedArrivalTime: string | null;
  aimedDepartureTime: string | null;
  expectedDepartureTime: string | null;
  delaySeconds: number | null;
  arrivalStatus?: string;
  departureStatus?: string;
}

export interface EstimatedVehicleJourneyData {
  journeyId: string;
  lineId: string;
  lineRef: string;
  direction: '0' | '1';
  destinationRef: string;
  destinationName: string;
  vehicleMode: 'metro' | 'rail';
  recordedAt: string;
  calls: EstimatedCallData[];
}

export interface LineTrafficReport {
  lineId: string;
  status: 'normal' | 'disrupted' | 'interrupted';
  severity: 'normal' | 'info' | 'warning' | 'alert';
  title: string;
  message: string;
  updatedAt: string;
  closedStations?: string[];
}

export interface PrimSnapshot {
  producedAt: string;
  timestamp: number;
  validUntil: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  stats: {
    linesQueried: number;
    linesSucceeded: number;
    totalJourneys: number;
    totalCalls: number;
    fetchDurationMs: number;
  };
  delays: Record<string, number>;
  journeysByLine: Record<string, EstimatedVehicleJourneyData[]>;
  trafficByLine?: Record<string, LineTrafficReport>;
}

// 21 lines: 16 metro lines + 5 RER lines
export const METRO_RER_LINES = [
  { id: 'IDFM:C01371', rawId: 'C01371', name: '1', mode: 'metro' as const },
  { id: 'IDFM:C01372', rawId: 'C01372', name: '2', mode: 'metro' as const },
  { id: 'IDFM:C01373', rawId: 'C01373', name: '3', mode: 'metro' as const },
  { id: 'IDFM:C01386', rawId: 'C01386', name: '3bis', mode: 'metro' as const },
  { id: 'IDFM:C01374', rawId: 'C01374', name: '4', mode: 'metro' as const },
  { id: 'IDFM:C01375', rawId: 'C01375', name: '5', mode: 'metro' as const },
  { id: 'IDFM:C01376', rawId: 'C01376', name: '6', mode: 'metro' as const },
  { id: 'IDFM:C01377', rawId: 'C01377', name: '7', mode: 'metro' as const },
  { id: 'IDFM:C01387', rawId: 'C01387', name: '7bis', mode: 'metro' as const },
  { id: 'IDFM:C01378', rawId: 'C01378', name: '8', mode: 'metro' as const },
  { id: 'IDFM:C01379', rawId: 'C01379', name: '9', mode: 'metro' as const },
  { id: 'IDFM:C01380', rawId: 'C01380', name: '10', mode: 'metro' as const },
  { id: 'IDFM:C01381', rawId: 'C01381', name: '11', mode: 'metro' as const },
  { id: 'IDFM:C01382', rawId: 'C01382', name: '12', mode: 'metro' as const },
  { id: 'IDFM:C01383', rawId: 'C01383', name: '13', mode: 'metro' as const },
  { id: 'IDFM:C01384', rawId: 'C01384', name: '14', mode: 'metro' as const },
  { id: 'IDFM:C01742', rawId: 'C01742', name: 'A', mode: 'rail' as const },
  { id: 'IDFM:C01743', rawId: 'C01743', name: 'B', mode: 'rail' as const },
  { id: 'IDFM:C01727', rawId: 'C01727', name: 'C', mode: 'rail' as const },
  { id: 'IDFM:C01728', rawId: 'C01728', name: 'D', mode: 'rail' as const },
  { id: 'IDFM:C01729', rawId: 'C01729', name: 'E', mode: 'rail' as const }
];

/**
 * Operating hours derived from GTFS (05:15 to 02:30 local Paris time).
 */
export function isParisMetroServiceHours(date: Date = new Date()): boolean {
  const parisTimeStr = date.toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  const [h, m] = parisTimeStr.split(':').map(Number);
  const currentMinutes = h * 60 + m;

  const startMinutes = 5 * 60 + 15; // 05:15
  const endMinutes = 2 * 60 + 30; // 02:30 (next morning)

  // Overnight lull: 02:30 to 05:15
  if (currentMinutes >= endMinutes && currentMinutes < startMinutes) {
    return false;
  }
  return true;
}

interface FetchLineResult {
  lineId: string;
  journeys: EstimatedVehicleJourneyData[];
  delaysByDir: Record<string, number>;
  statusCode: number;
  error?: string;
}

/**
 * Fetch general traffic disruption messages from PRIM Marketplace
 */
export function fetchGeneralMessages(apiKey: string, timeoutMs = 6000): Promise<Record<string, LineTrafficReport>> {
  const url = 'https://prim.iledefrance-mobilites.fr/marketplace/general-message';
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          apikey: apiKey,
          accept: 'application/json',
          'User-Agent': 'ParisSubway3D-Relay/1.0'
        },
        timeout: timeoutMs
      },
      (res) => {
        if (res.statusCode !== 200) {
          resolve({});
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const messages = json?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
            const traffic: Record<string, LineTrafficReport> = {};

            for (const msg of messages) {
              const lineRef = msg?.LineRef?.value || msg?.InfoChannelRef?.value || '';
              const matchingLine = METRO_RER_LINES.find(l => lineRef.includes(l.rawId) || lineRef.includes(`::${l.name}:`));
              if (!matchingLine) continue;

              const content = msg?.Content?.value || msg?.MessageText?.[0]?.value || '';
              const messageType = (msg?.MessageType || '').toLowerCase();
              const impact = (msg?.Impact || '').toLowerCase();

              let status: 'normal' | 'disrupted' | 'interrupted' = 'disrupted';
              if (content.toLowerCase().includes('interrompu') || impact.includes('interruption') || messageType.includes('interruption')) {
                status = 'interrupted';
              }

              const closedStations: string[] = [];
              const matchBetween = content.match(/interrompu entre ([^et]+) et ([^.]+)/i);
              if (matchBetween) {
                closedStations.push(matchBetween[1].trim(), matchBetween[2].trim());
              }

              traffic[matchingLine.id] = {
                lineId: matchingLine.id,
                status,
                severity: status === 'interrupted' ? 'alert' : 'warning',
                title: status === 'interrupted' ? 'Trafic interrompu' : 'Trafic perturbé',
                message: content,
                updatedAt: msg?.RecordedAtTime || new Date().toISOString(),
                closedStations
              };
            }

            // Fill default normal status for lines without disruptions
            for (const line of METRO_RER_LINES) {
              if (!traffic[line.id]) {
                traffic[line.id] = {
                  lineId: line.id,
                  status: 'normal',
                  severity: 'normal',
                  title: 'Trafic normal',
                  message: 'Trafic fluide sur l’ensemble de la ligne',
                  updatedAt: new Date().toISOString(),
                  closedStations: []
                };
              }
            }

            resolve(traffic);
          } catch {
            resolve({});
          }
        });
      }
    );
    req.on('error', () => resolve({}));
    req.on('timeout', () => { req.destroy(); resolve({}); });
  });
}

/**
 * Fetch and parse full detailed SIRI EstimatedTimetable for a single line from PRIM.
 */
export function fetchLineEstimatedTimetable(
  line: { id: string; rawId: string; mode: 'metro' | 'rail' },
  apiKey: string,
  timeoutMs = 7000
): Promise<FetchLineResult> {
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/estimated-timetable?LineRef=STIF:Line::${line.rawId}:`;

  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          apikey: apiKey,
          accept: 'application/json',
          'User-Agent': 'ParisSubway3D-Relay/1.0'
        },
        timeout: timeoutMs
      },
      (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode !== 200) {
          resolve({
            lineId: line.id,
            journeys: [],
            delaysByDir: {},
            statusCode,
            error: `HTTP ${statusCode}`
          });
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const delivery =
              json?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame?.[0];
            const rawJourneys = delivery?.EstimatedVehicleJourney || [];

            const parsedJourneys: EstimatedVehicleJourneyData[] = [];
            const dirTotals: Record<string, { totalS: number; count: number }> = {
              '0': { totalS: 0, count: 0 },
              '1': { totalS: 0, count: 0 }
            };

            for (const j of rawJourneys) {
              const journeyId =
                j?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef ||
                j?.VehicleJourneyName?.[0]?.value ||
                `j_${Math.random().toString(36).substring(2, 9)}`;

              const dirVal = String(j?.DirectionRef?.value || '0').trim();
              const dir: '0' | '1' =
                dirVal.includes('1') || dirVal.toLowerCase().includes('retour') ? '1' : '0';

              const destRef = j?.DestinationRef?.value || '';
              const destName = j?.DestinationName?.[0]?.value || '';
              const recordedAt = j?.RecordedAtTime || new Date().toISOString();

              const rawCalls = j?.EstimatedCalls?.EstimatedCall || [];
              const parsedCalls: EstimatedCallData[] = [];

              for (const c of rawCalls) {
                const stopRef = c?.StopPointRef?.value || '';
                const stopName = c?.StopPointName?.[0]?.value || '';
                const order = typeof c?.Order === 'number' ? c.Order : parsedCalls.length + 1;

                const aimedArr = c?.AimedArrivalTime || null;
                const expArr = c?.ExpectedArrivalTime || null;
                const aimedDep = c?.AimedDepartureTime || null;
                const expDep = c?.ExpectedDepartureTime || null;

                const aimedTimeStr = aimedDep || aimedArr;
                const expTimeStr = expDep || expArr;

                let delaySeconds: number | null = null;
                if (aimedTimeStr && expTimeStr) {
                  const aimedMs = new Date(aimedTimeStr).getTime();
                  const expMs = new Date(expTimeStr).getTime();
                  if (Number.isFinite(aimedMs) && Number.isFinite(expMs)) {
                    const diffS = Math.round((expMs - aimedMs) / 1000);
                    if (Math.abs(diffS) <= 1800) {
                      delaySeconds = diffS;
                      dirTotals[dir].totalS += diffS;
                      dirTotals[dir].count += 1;
                    }
                  }
                }

                parsedCalls.push({
                  stopPointRef: stopRef,
                  stopPointName: stopName,
                  order,
                  aimedArrivalTime: aimedArr,
                  expectedArrivalTime: expArr,
                  aimedDepartureTime: aimedDep,
                  expectedDepartureTime: expDep,
                  delaySeconds,
                  arrivalStatus: c?.ArrivalStatus,
                  departureStatus: c?.DepartureStatus
                });
              }

              parsedJourneys.push({
                journeyId,
                lineId: line.id,
                lineRef: `STIF:Line::${line.rawId}:`,
                direction: dir,
                destinationRef: destRef,
                destinationName: destName,
                vehicleMode: line.mode,
                recordedAt,
                calls: parsedCalls
              });
            }

            const delaysByDir: Record<string, number> = {};
            if (dirTotals['0'].count > 0) {
              delaysByDir[`${line.id}#0`] = Math.round(dirTotals['0'].totalS / dirTotals['0'].count);
            }
            if (dirTotals['1'].count > 0) {
              delaysByDir[`${line.id}#1`] = Math.round(dirTotals['1'].totalS / dirTotals['1'].count);
            }
            const overallCount = dirTotals['0'].count + dirTotals['1'].count;
            if (overallCount > 0) {
              delaysByDir[line.id] = Math.round(
                (dirTotals['0'].totalS + dirTotals['1'].totalS) / overallCount
              );
            }

            resolve({
              lineId: line.id,
              journeys: parsedJourneys,
              delaysByDir,
              statusCode: 200
            });
          } catch (err: any) {
            resolve({
              lineId: line.id,
              journeys: [],
              delaysByDir: {},
              statusCode: 200,
              error: `JSON Parse error: ${err.message}`
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        lineId: line.id,
        journeys: [],
        delaysByDir: {},
        statusCode: 0,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        lineId: line.id,
        journeys: [],
        delaysByDir: {},
        statusCode: 408,
        error: 'Request timeout'
      });
    });
  });
}

// In-Memory global snapshot cache across warm lambdas
let cachedSnapshot: PrimSnapshot | null = null;
let lastFetchEpoch = 0;
let isFetching = false;
let backoffMultiplier = 1;

export async function buildOrGetSnapshot(
  apiKey: string,
  pollIntervalS = 180,
  forceRefresh = false
): Promise<PrimSnapshot> {
  const now = Date.now();
  const cacheAgeS = (now - lastFetchEpoch) / 1000;

  // Serve cached snapshot if fresh
  if (!forceRefresh && cachedSnapshot && cacheAgeS < pollIntervalS && cachedSnapshot.feedHealthy) {
    return cachedSnapshot;
  }

  // Prevent multiple concurrent fetches from overloading PRIM
  if (isFetching && cachedSnapshot) {
    return cachedSnapshot;
  }

  // Check service hours
  const serviceActive = isParisMetroServiceHours();
  if (!serviceActive) {
    const nightSnapshot: PrimSnapshot = {
      producedAt: new Date().toISOString(),
      timestamp: now,
      validUntil: now + pollIntervalS * 1000,
      feedHealthy: true,
      serviceActive: false,
      serviceMessage: 'Service de nuit — reprise du service à 05h15',
      lastError: null,
      stats: {
        linesQueried: 0,
        linesSucceeded: 0,
        totalJourneys: 0,
        totalCalls: 0,
        fetchDurationMs: 0
      },
      delays: {},
      journeysByLine: {},
      trafficByLine: {}
    };
    cachedSnapshot = nightSnapshot;
    lastFetchEpoch = now;
    return nightSnapshot;
  }

  if (!apiKey) {
    const unconfiguredSnapshot: PrimSnapshot = {
      producedAt: new Date().toISOString(),
      timestamp: now,
      validUntil: now + pollIntervalS * 1000,
      feedHealthy: false,
      serviceActive: true,
      serviceMessage: 'PRIM_API_KEY non configurée côté serveur — mode 100% théorique actif',
      lastError: 'Missing PRIM_API_KEY',
      stats: {
        linesQueried: 0,
        linesSucceeded: 0,
        totalJourneys: 0,
        totalCalls: 0,
        fetchDurationMs: 0
      },
      delays: {},
      journeysByLine: {},
      trafficByLine: {}
    };
    return unconfiguredSnapshot;
  }

  isFetching = true;
  const startedAt = Date.now();

  try {
    const journeysByLine: Record<string, EstimatedVehicleJourneyData[]> = {};
    const aggregatedDelays: Record<string, number> = {};
    let linesSucceeded = 0;
    let totalJourneys = 0;
    let totalCalls = 0;
    let encountered429 = false;

    // Concurrently fetch general messages (info trafic)
    const trafficPromise = fetchGeneralMessages(apiKey);

    // Rate-limited batching: query lines sequentially with 150ms pause
    for (let i = 0; i < METRO_RER_LINES.length; i++) {
      const line = METRO_RER_LINES[i];
      const res = await fetchLineEstimatedTimetable(line, apiKey);

      if (res.statusCode === 429) {
        encountered429 = true;
        console.warn(`[prim_relay] 429 Too Many Requests received for line ${line.name}`);
        break;
      }

      if (res.statusCode === 200 && !res.error) {
        linesSucceeded++;
        journeysByLine[line.id] = res.journeys;
        totalJourneys += res.journeys.length;
        for (const j of res.journeys) {
          totalCalls += j.calls.length;
        }
        Object.assign(aggregatedDelays, res.delaysByDir);
      }

      if (i < METRO_RER_LINES.length - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    const trafficByLine = await trafficPromise;
    const durationMs = Date.now() - startedAt;

    if (encountered429) {
      backoffMultiplier = Math.min(8, backoffMultiplier * 2);
      const backoffS = pollIntervalS * backoffMultiplier;

      if (cachedSnapshot) {
        cachedSnapshot.feedHealthy = false;
        cachedSnapshot.lastError = `PRIM 429 (Too Many Requests). Backoff actif (${backoffS}s)`;
        cachedSnapshot.validUntil = now + backoffS * 1000;
        return cachedSnapshot;
      }

      const degradedSnapshot: PrimSnapshot = {
        producedAt: new Date().toISOString(),
        timestamp: now,
        validUntil: now + backoffS * 1000,
        feedHealthy: false,
        serviceActive: true,
        lastError: `PRIM 429 (Too Many Requests). Backoff actif (${backoffS}s)`,
        stats: {
          linesQueried: METRO_RER_LINES.length,
          linesSucceeded,
          totalJourneys: 0,
          totalCalls: 0,
          fetchDurationMs: durationMs
        },
        delays: {},
        journeysByLine: {},
        trafficByLine: {}
      };
      cachedSnapshot = degradedSnapshot;
      lastFetchEpoch = now;
      return degradedSnapshot;
    }

    // Nominal Success
    backoffMultiplier = 1;
    const newSnapshot: PrimSnapshot = {
      producedAt: new Date().toISOString(),
      timestamp: now,
      validUntil: now + pollIntervalS * 1000,
      feedHealthy: linesSucceeded > 0,
      serviceActive: true,
      lastError: null,
      stats: {
        linesQueried: METRO_RER_LINES.length,
        linesSucceeded,
        totalJourneys,
        totalCalls,
        fetchDurationMs: durationMs
      },
      delays: aggregatedDelays,
      journeysByLine,
      trafficByLine
    };

    cachedSnapshot = newSnapshot;
    lastFetchEpoch = now;
    return newSnapshot;
  } finally {
    isFetching = false;
  }
}

/**
 * Netlify Function handler
 */
export const handler = async (event: any) => {
  const apiKey = (process.env.PRIM_API_KEY || '').trim();
  const pollIntervalS = parseInt(process.env.PRIM_POLL_INTERVAL_SECONDS || '180', 10);

  const snapshot = await buildOrGetSnapshot(apiKey, pollIntervalS);
  const responseBody = JSON.stringify(snapshot);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=60, s-maxage=${pollIntervalS}, stale-while-revalidate=300`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'X-Prim-Produced-At': snapshot.producedAt,
      'X-Prim-Healthy': String(snapshot.feedHealthy)
    },
    body: responseBody
  };
};
