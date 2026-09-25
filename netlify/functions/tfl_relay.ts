import https from 'https';
import fs from 'fs';
import path from 'path';
import type { LineTrafficReport } from '../../core/types';

export function getTflApiKey(): string {
  if (process.env.TFL_APP_KEY) return process.env.TFL_APP_KEY.trim();
  for (const file of ['.env.local', '.env']) {
    try {
      const p = path.resolve(process.cwd(), file);
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const line of text.split('\n')) {
          if (line.trim().startsWith('TFL_APP_KEY=')) {
            return line.split('=', 2)[1].trim().replace(/^['"]|['"]$/g, '');
          }
        }
      }
    } catch {}
  }
  return '';
}

export interface TflArrivalPrediction {
  id: string;
  lineId: string;
  vehicleId: string | null;
  stationId: string;
  stationName: string;
  direction: 'inbound' | 'outbound' | string;
  timeToStation: number; // secondes
  expectedArrival: string; // ISO 8601
  destinationStationId: string | null;
  destinationName?: string;
  platformName?: string;
  currentLocation?: string;
}

export interface TflSnapshot {
  producedAt: string;
  timestamp: number;
  validUntil: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  arrivals: TflArrivalPrediction[];
  trafficByLine: Record<string, LineTrafficReport>;
}

export const TFL_TUBE_LINE_IDS = [
  'bakerloo',
  'central',
  'circle',
  'district',
  'hammersmith-city',
  'jubilee',
  'metropolitan',
  'northern',
  'piccadilly',
  'victoria',
  'waterloo-city',
  'dlr',
  'elizabeth',
  'liberty',
  'lioness',
  'mildmay',
  'suffragette',
  'weaver',
  'windrush',
  'tram'
];

export const NIGHT_TUBE_LINES = new Set([
  'central',
  'jubilee',
  'northern',
  'piccadilly',
  'victoria'
]);

const NAPTAN_ALIAS: Record<string, string> = {
  '940GZZBPSUS': '940GZZLU991',
  '9400ZZBPSUST': '940GZZLU991',
  '940GZZNEUGS': '940GZZLU990',
  '9400ZZNEUGST': '940GZZLU990',
};

export function normalizeStationId(rawId: string): string {
  if (!rawId) return '';
  const trimmed = rawId.trim();
  if (NAPTAN_ALIAS[trimmed]) return NAPTAN_ALIAS[trimmed];
  if (trimmed.startsWith('9400')) {
    const base = '940G' + trimmed.slice(4, -1);
    return NAPTAN_ALIAS[base] || base;
  }
  return NAPTAN_ALIAS[trimmed] || trimmed;
}

/**
 * Nettoie le vehicleId TfL (e.g. "042" -> "42" ou "224").
 */
export function cleanVehicleId(rawId: string | null | undefined): string | null {
  if (!rawId) return null;
  const trimmed = rawId.trim();
  if (!trimmed || trimmed === '0' || trimmed === 'null' || trimmed === 'undefined') return null;
  return trimmed;
}

/**
 * Détermine si le métro londonien est en service à une heure donnée.
 * Vendredi et samedi soir : Night Tube actif 24h sur Central, Jubilee, Northern, Piccadilly, Victoria.
 * Autres nuits : fermeture entre 01:00 et 05:00 heure de Londres.
 */
export function isLondonTubeServiceHours(date: Date = new Date()): boolean {
  const londonTimeStr = date.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  const [h, m] = londonTimeStr.split(':').map(Number);
  const currentMinutes = h * 60 + m;

  // Récupérer le jour de la semaine à Londres
  const dayStr = date.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short'
  }); // Mon, Tue, Wed, Thu, Fri, Sat, Sun

  const isWeekendNight = (dayStr === 'Sat' || dayStr === 'Sun') && currentMinutes < 5 * 60;
  if (isWeekendNight) {
    // Night Tube actif
    return true;
  }

  // Nuit normale : fermeture entre 01:00 et 05:00
  if (currentMinutes >= 60 && currentMinutes < 300) {
    return false;
  }
  return true;
}

/**
 * Parse les statuts de ligne de TfL (/Line/Mode/tube/Status).
 */
export function parseTflLineStatuses(data: any): Record<string, LineTrafficReport> {
  const reports: Record<string, LineTrafficReport> = {};
  const nowIso = new Date().toISOString();

  for (const lid of TFL_TUBE_LINE_IDS) {
    reports[lid] = {
      lineId: lid,
      status: 'normal',
      severity: 'normal',
      title: 'Service normal',
      message: 'Good Service',
      updatedAt: nowIso
    };
  }

  if (!Array.isArray(data)) return reports;

  for (const item of data) {
    const lineId = (item.id || '').toLowerCase().trim();
    if (!reports[lineId]) continue;

    const lineStatuses = item.lineStatuses || [];
    if (lineStatuses.length === 0) continue;

    // Prendre le statut le plus sévère
    // severity: 10 = Good, 9 = Minor, 6 = Severe, 5 = Part Suspended, 1 = Suspended
    let minSeverity = 10;
    let worstStatus = lineStatuses[0];

    for (const st of lineStatuses) {
      const sev = typeof st.statusSeverity === 'number' ? st.statusSeverity : 10;
      if (sev < minSeverity) {
        minSeverity = sev;
        worstStatus = st;
      }
    }

    const desc = worstStatus.statusSeverityDescription || 'Good Service';
    const reason = worstStatus.reason || '';

    if (minSeverity <= 5) {
      reports[lineId] = {
        lineId,
        status: 'interrupted',
        severity: 'alert',
        title: desc,
        message: reason || desc,
        updatedAt: nowIso
      };
    } else if (minSeverity < 10) {
      reports[lineId] = {
        lineId,
        status: 'disrupted',
        severity: minSeverity <= 7 ? 'alert' : 'warning',
        title: desc,
        message: reason || desc,
        updatedAt: nowIso
      };
    } else {
      reports[lineId] = {
        lineId,
        status: 'normal',
        severity: 'normal',
        title: 'Service normal',
        message: desc,
        updatedAt: nowIso
      };
    }
  }

  return reports;
}

/**
 * Parse les prédictions d'arrivée (/Line/{ids}/Arrivals).
 */
export function parseTflArrivals(data: any): TflArrivalPrediction[] {
  if (!Array.isArray(data)) return [];

  const predictions: TflArrivalPrediction[] = [];

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;

    const lineId = (item.lineId || '').toLowerCase().trim();
    if (!TFL_TUBE_LINE_IDS.includes(lineId)) continue;

    const stationId = normalizeStationId(item.naptanId || '');
    if (!stationId) continue;

    const vehicleId = cleanVehicleId(item.vehicleId);
    const timeToStation = Math.max(0, parseInt(item.timeToStation, 10) || 0);

    predictions.push({
      id: String(item.id || `${lineId}-${vehicleId || 'v'}-${stationId}-${timeToStation}`),
      lineId,
      vehicleId,
      stationId,
      stationName: item.stationName ? item.stationName.replace(' Underground Station', '').replace(' Station', '').trim() : '',
      direction: item.direction || 'outbound',
      timeToStation,
      expectedArrival: item.expectedArrival || new Date(Date.now() + timeToStation * 1000).toISOString(),
      destinationStationId: item.destinationNaptanId ? normalizeStationId(item.destinationNaptanId) : null,
      destinationName: item.destinationName ? item.destinationName.replace(' Underground Station', '').trim() : undefined,
      platformName: item.platformName || undefined,
      currentLocation: item.currentLocation || undefined
    });
  }

  // Trier par temps restant croissant
  predictions.sort((a, b) => a.timeToStation - b.timeToStation);
  return predictions;
}

// Cache mémoire serveur
let cachedSnapshot: TflSnapshot | null = null;
const CACHE_TTL_MS = 30000; // 30 secondes

function httpsGetJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`JSON parse error on ${url}: ${err}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} on ${url}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout on ${url}`));
    });
  });
}

export async function fetchTflData(): Promise<TflSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now < cachedSnapshot.validUntil) {
    return cachedSnapshot;
  }

  const appKey = getTflApiKey();
  const queryParam = appKey ? `?app_key=${encodeURIComponent(appKey)}` : '';
  const linesParam = TFL_TUBE_LINE_IDS.join(',');

  const arrivalsUrl = `https://api.tfl.gov.uk/Line/${linesParam}/Arrivals${queryParam}`;
  const statusUrl = `https://api.tfl.gov.uk/Line/Mode/tube,dlr,elizabeth-line,overground,tram/Status${queryParam}`;

  let rawArrivals: any = null;
  let rawStatus: any = null;
  let errorMsg: string | null = null;

  try {
    const [arr, st] = await Promise.all([
      httpsGetJson(arrivalsUrl),
      httpsGetJson(statusUrl)
    ]);
    rawArrivals = arr;
    rawStatus = st;
  } catch (err: any) {
    errorMsg = err.message || String(err);
    console.warn('[tfl_relay] Warning during TfL fetch:', errorMsg);
  }

  const isServiceActive = isLondonTubeServiceHours(new Date(now));
  const trafficByLine = parseTflLineStatuses(rawStatus);
  const arrivals = parseTflArrivals(rawArrivals);
  const feedHealthy = rawArrivals !== null && rawStatus !== null;

  const snapshot: TflSnapshot = {
    producedAt: new Date(now).toISOString(),
    timestamp: now,
    validUntil: now + CACHE_TTL_MS,
    feedHealthy,
    serviceActive: isServiceActive,
    serviceMessage: isServiceActive ? undefined : 'Service nocturne terminé sur le réseau (hors Night Tube).',
    lastError: errorMsg,
    arrivals,
    trafficByLine
  };

  if (feedHealthy) {
    cachedSnapshot = snapshot;
  } else if (!cachedSnapshot) {
    cachedSnapshot = snapshot;
  }

  return cachedSnapshot;
}

export const handler = async (event: any = {}, context: any = {}) => {
  const snapshot = await fetchTflData();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(snapshot)
  };
};
