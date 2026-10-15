import https from 'https';
import Pbf from 'pbf';
import type { LineTrafficReport } from '../../core/types';
import type {
  BerlinStopTimeEvent,
  BerlinStopTimeUpdate,
  BerlinTripDescriptor,
  BerlinTripUpdate,
  BerlinSnapshot,
  BerlinStats
} from '../../cities/berlin/rt/types';

export type {
  BerlinStopTimeEvent,
  BerlinStopTimeUpdate,
  BerlinTripDescriptor,
  BerlinTripUpdate,
  BerlinSnapshot,
  BerlinStats
};

export const CACHE_TTL_SEC = 15; // [verified: false] netlify CDN and in-memory TTL (15s)
export const VBB_FEED_URL = 'https://production.gtfsrt.vbb.de/data';
export const USER_AGENT_CONTACT = 'ParisSubway3D/1.0 (+https://github.com/morgancanteri/paris-subway-3d; morgan.canteri@gmail.com)';

/**
 * Identifiants officiels des 9 lignes U-Bahn dans le GTFS VBB standard (route_type = 400).
 * U1: 17512_400, U2: 17514_400, U3: 17515_400, U4: 17516_400, U5: 17518_400,
 * U6: 17521_400, U7: 17523_400, U8: 17525_400, U9: 17526_400.
 * Les bus de substitution portent le suffixe _700 (ex: 17524_700) et sont strictement exclus.
 */
export const ALLOWED_UBAHN_ROUTES = new Set([
  '17512_400',
  '17514_400',
  '17515_400',
  '17516_400',
  '17518_400',
  '17521_400',
  '17523_400',
  '17525_400',
  '17526_400'
]);

export function isUbahnRoute(routeId: string): boolean {
  if (!routeId) return false;
  if (ALLOWED_UBAHN_ROUTES.has(routeId)) return true;
  // Détection générique par extended route_type 400 (ex: 12345_400)
  if (routeId.endsWith('_400') && !routeId.includes('_700')) return true;
  return false;
}

// ============================================================================
// Décodeurs Protobuf GTFS-RT (TripUpdates)
// ============================================================================

function readStopTimeEvent(pbf: any, end: number): BerlinStopTimeEvent {
  const ev: BerlinStopTimeEvent = {};
  while (pbf.pos < end) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 1) ev.delay = pbf.readSVarint();
    else if (tag === 2) ev.time = pbf.readVarint();
    else if (tag === 3) ev.uncertainty = pbf.readVarint();
    else pbf.skip(val & 7);
  }
  return ev;
}

function readStopTimeUpdate(pbf: any, end: number): BerlinStopTimeUpdate {
  const stu: BerlinStopTimeUpdate = {};
  while (pbf.pos < end) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 1) stu.stopSequence = pbf.readVarint();
    else if (tag === 4) stu.stopId = pbf.readString();
    else if (tag === 2) stu.arrival = readStopTimeEvent(pbf, pbf.readVarint() + pbf.pos);
    else if (tag === 3) stu.departure = readStopTimeEvent(pbf, pbf.readVarint() + pbf.pos);
    else if (tag === 5) stu.scheduleRelationship = pbf.readVarint();
    else pbf.skip(val & 7);
  }
  return stu;
}

function readTripDescriptor(pbf: any, end: number): BerlinTripDescriptor {
  const td: Partial<BerlinTripDescriptor> = {};
  while (pbf.pos < end) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 1) td.tripId = pbf.readString();
    else if (tag === 5) td.routeId = pbf.readString();
    else if (tag === 6) td.directionId = pbf.readVarint();
    else if (tag === 2) td.startTime = pbf.readString();
    else if (tag === 3) td.startDate = pbf.readString();
    else pbf.skip(val & 7);
  }
  return {
    tripId: td.tripId || '',
    routeId: td.routeId || '',
    directionId: td.directionId,
    startTime: td.startTime,
    startDate: td.startDate
  };
}

function readTripUpdate(
  pbf: any,
  end: number
): {
  trip?: BerlinTripDescriptor;
  stopTimeUpdates: BerlinStopTimeUpdate[];
  timestamp?: number;
  delay?: number;
} {
  const tu = {
    stopTimeUpdates: [] as BerlinStopTimeUpdate[],
    timestamp: undefined as number | undefined,
    delay: undefined as number | undefined,
    trip: undefined as BerlinTripDescriptor | undefined
  };
  while (pbf.pos < end) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 1) tu.trip = readTripDescriptor(pbf, pbf.readVarint() + pbf.pos);
    else if (tag === 2) tu.stopTimeUpdates.push(readStopTimeUpdate(pbf, pbf.readVarint() + pbf.pos));
    else if (tag === 4) tu.timestamp = pbf.readVarint();
    else if (tag === 5) tu.delay = pbf.readSVarint();
    else pbf.skip(val & 7);
  }
  return tu;
}

export function decodeGtfsRealtimeFeed(buffer: Buffer): {
  totalEntities: number;
  filteredUpdates: BerlinTripUpdate[];
} {
  const pbf = new Pbf(buffer);
  let totalEntities = 0;
  const filteredUpdates: BerlinTripUpdate[] = [];

  while (pbf.pos < pbf.length) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 2) {
      // FeedEntity
      totalEntities++;
      const end = pbf.readVarint() + pbf.pos;
      let entityId = '';
      let tripUpdateData: any = null;

      while (pbf.pos < end) {
        const v2 = pbf.readVarint();
        const t2 = v2 >> 3;
        if (t2 === 1) entityId = pbf.readString();
        else if (t2 === 3) tripUpdateData = readTripUpdate(pbf, pbf.readVarint() + pbf.pos);
        else pbf.skip(v2 & 7);
      }

      if (tripUpdateData && tripUpdateData.trip && isUbahnRoute(tripUpdateData.trip.routeId)) {
        filteredUpdates.push({
          id: entityId,
          trip: tripUpdateData.trip,
          timestamp: tripUpdateData.timestamp,
          delay: tripUpdateData.delay,
          stopTimeUpdates: tripUpdateData.stopTimeUpdates
        });
      }
    } else {
      pbf.skip(val & 7);
    }
  }

  return { totalEntities, filteredUpdates };
}

// ============================================================================
// Cache partagé et Réseau
// ============================================================================

let cachedSnapshot: BerlinSnapshot | null = null;
let lastFetchEpochMs = 0;
let lastETag: string | null = null;
let inFlightFetch: Promise<BerlinSnapshot> | null = null;

export function resetBerlinCache(): void {
  cachedSnapshot = null;
  lastFetchEpochMs = 0;
  lastETag = null;
  inFlightFetch = null;
}

export interface VbbFetchOptions {
  feedUrl?: string;
  etag?: string | null;
  userAgent?: string;
}

export interface VbbFetchResult {
  statusCode: number;
  data?: Buffer;
  etag?: string | null;
  error?: string;
}

export type VbbFetcher = (options: VbbFetchOptions) => Promise<VbbFetchResult>;

export async function defaultVbbFetcher(options: VbbFetchOptions): Promise<VbbFetchResult> {
  const feedUrl = options.feedUrl || VBB_FEED_URL;
  const userAgent = options.userAgent || USER_AGENT_CONTACT;

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Accept: 'application/x-protobuf, application/octet-stream, */*'
  };

  if (options.etag) {
    headers['If-None-Match'] = options.etag;
  }

  return new Promise((resolve) => {
    const req = https.request(
      feedUrl,
      {
        method: 'GET',
        headers,
        timeout: 10000
      },
      (res) => {
        const chunks: Buffer[] = [];
        const resETag = (res.headers['etag'] as string) || null;

        if (res.statusCode === 304) {
          return resolve({ statusCode: 304, etag: resETag });
        }

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              data: Buffer.concat(chunks),
              etag: resETag
            });
          } else {
            resolve({
              statusCode: res.statusCode || 500,
              etag: resETag,
              error: `HTTP ${res.statusCode}`
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({ statusCode: 500, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 504, error: 'Gateway Timeout' });
    });

    req.end();
  });
}

export async function getOrFetchBerlinSnapshot(
  nowEpochMs: number = Date.now(),
  fetcher: VbbFetcher = defaultVbbFetcher,
  feedUrl: string = VBB_FEED_URL
): Promise<{ snapshot: BerlinSnapshot; fromCache: boolean }> {
  const nowEpochSec = Math.floor(nowEpochMs / 1000);

  // Vérification du cache en mémoire (durée de validité : CACHE_TTL_SEC)
  if (cachedSnapshot && nowEpochMs - lastFetchEpochMs < CACHE_TTL_SEC * 1000) {
    return { snapshot: cachedSnapshot, fromCache: true };
  }

  // Mutex d'appel en vol (burst request deduplication)
  if (inFlightFetch) {
    const snapshot = await inFlightFetch;
    return { snapshot, fromCache: true };
  }

  inFlightFetch = (async () => {
    try {
      const res = await fetcher({
        feedUrl,
        etag: lastETag,
        userAgent: USER_AGENT_CONTACT
      });

      // 304 Not Modified : les données n'ont pas changé chez VBB
      if (res.statusCode === 304 && cachedSnapshot) {
        lastFetchEpochMs = nowEpochMs;
        const refreshedSnapshot: BerlinSnapshot = {
          ...cachedSnapshot,
          producedAt: new Date(nowEpochMs).toISOString(),
          timestamp: nowEpochSec,
          validUntil: nowEpochSec + CACHE_TTL_SEC
        };
        cachedSnapshot = refreshedSnapshot;
        return refreshedSnapshot;
      }

      if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
        if (res.etag) {
          lastETag = res.etag;
        }

        const { totalEntities, filteredUpdates } = decodeGtfsRealtimeFeed(res.data);
        const snapshot: BerlinSnapshot = {
          producedAt: new Date(nowEpochMs).toISOString(),
          timestamp: nowEpochSec,
          validUntil: nowEpochSec + CACHE_TTL_SEC,
          feedHealthy: true,
          serviceActive: true,
          lastError: null,
          tripUpdates: filteredUpdates,
          trafficByLine: {}, // Le flux GTFS-RT ne comporte pas d'alertes (Porte 0 h)
          stats: {
            totalEntitiesInFeed: totalEntities,
            retainedEntities: filteredUpdates.length,
            uBahnCount: filteredUpdates.length
          }
        };

        cachedSnapshot = snapshot;
        lastFetchEpochMs = nowEpochMs;
        return snapshot;
      }

      // Codes d'erreur HTTP 429, 403, 5xx ou réseau
      const isRateLimited = res.statusCode === 429;
      const isForbidden = res.statusCode === 403 || res.statusCode === 401;
      const errorMsg = isRateLimited
        ? 'VBB API Rate Limit exceeded (429)'
        : isForbidden
        ? `VBB API Forbidden (${res.statusCode})`
        : res.error
        ? `${res.error} (${res.statusCode})`
        : `HTTP ${res.statusCode}`;

      const fallbackSnapshot: BerlinSnapshot = {
        producedAt: new Date(nowEpochMs).toISOString(),
        timestamp: nowEpochSec,
        validUntil: nowEpochSec + CACHE_TTL_SEC,
        feedHealthy: false,
        serviceActive: true,
        lastError: errorMsg,
        tripUpdates: cachedSnapshot ? cachedSnapshot.tripUpdates : [],
        trafficByLine: {},
        stats: cachedSnapshot ? cachedSnapshot.stats : { totalEntitiesInFeed: 0, retainedEntities: 0, uBahnCount: 0 }
      };

      cachedSnapshot = fallbackSnapshot;
      lastFetchEpochMs = nowEpochMs;
      return fallbackSnapshot;
    } catch (e: any) {
      const errSnapshot: BerlinSnapshot = {
        producedAt: new Date(nowEpochMs).toISOString(),
        timestamp: nowEpochSec,
        validUntil: nowEpochSec + CACHE_TTL_SEC,
        feedHealthy: false,
        serviceActive: true,
        lastError: e.message || 'Fetch failed',
        tripUpdates: cachedSnapshot ? cachedSnapshot.tripUpdates : [],
        trafficByLine: {},
        stats: cachedSnapshot ? cachedSnapshot.stats : { totalEntitiesInFeed: 0, retainedEntities: 0, uBahnCount: 0 }
      };

      cachedSnapshot = errSnapshot;
      lastFetchEpochMs = nowEpochMs;
      return errSnapshot;
    } finally {
      inFlightFetch = null;
    }
  })();

  const snapshot = await inFlightFetch;
  return { snapshot, fromCache: false };
}

export const handler = async () => {
  const now = Date.now();
  const { snapshot } = await getOrFetchBerlinSnapshot(now);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=10, s-maxage=${CACHE_TTL_SEC}, stale-while-revalidate=5`,
    'Netlify-CDN-Cache-Control': `public, s-maxage=${CACHE_TTL_SEC}`,
    'Access-Control-Allow-Origin': '*'
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(snapshot)
  };
};
