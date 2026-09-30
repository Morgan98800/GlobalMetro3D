import https from 'https';
import Pbf from 'pbf';
import type { LineTrafficReport } from '../../core/types';
import type {
  IleviaStopTimeEvent,
  IleviaStopTimeUpdate,
  IleviaTripDescriptor,
  IleviaTripUpdate,
  IleviaSnapshot,
  IleviaStats
} from '../../cities/lille/rt/types';

export type {
  IleviaStopTimeEvent,
  IleviaStopTimeUpdate,
  IleviaTripDescriptor,
  IleviaTripUpdate,
  IleviaSnapshot,
  IleviaStats
};

export const ALLOWED_ROUTE_IDS = new Set(['ME1', 'ME2', '71']);

// ============================================================================
// Décodeur Protobuf PBF pour GTFS-RT TripUpdates
// ============================================================================

function readStopTimeEvent(pbf: any, end: number): IleviaStopTimeEvent {
  const ev: IleviaStopTimeEvent = {};
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

function readStopTimeUpdate(pbf: any, end: number): IleviaStopTimeUpdate {
  const stu: IleviaStopTimeUpdate = {};
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

function readTripDescriptor(pbf: any, end: number): IleviaTripDescriptor {
  const td: Partial<IleviaTripDescriptor> = {};
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

function readTripUpdate(pbf: any, end: number): { trip?: IleviaTripDescriptor; stopTimeUpdates: IleviaStopTimeUpdate[]; timestamp?: number; delay?: number } {
  const tu = { stopTimeUpdates: [] as IleviaStopTimeUpdate[], timestamp: undefined as number | undefined, delay: undefined as number | undefined, trip: undefined as IleviaTripDescriptor | undefined };
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

export function decodeGtfsRealtimeFeed(buffer: Buffer): { totalEntities: number; filteredUpdates: IleviaTripUpdate[] } {
  const pbf = new Pbf(buffer);
  let totalEntities = 0;
  const filteredUpdates: IleviaTripUpdate[] = [];

  while (pbf.pos < pbf.length) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 2) { // FeedEntity
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

      if (tripUpdateData && tripUpdateData.trip && ALLOWED_ROUTE_IDS.has(tripUpdateData.trip.routeId)) {
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

// Global lambda cache
let cachedSnapshot: IleviaSnapshot | null = null;
let lastFetchEpoch = 0;
const CACHE_TTL_MS = 30000; // 30 secondes

export async function fetchIleviaFeed(
  feedUrl: string = 'https://proxy.transport.data.gouv.fr/resource/ilevia-lille-gtfs-rt'
): Promise<{ statusCode: number; data?: Buffer; error?: string }> {
  return new Promise((resolve) => {
    const req = https.request(
      feedUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'ParisSubway3D-LilleRelay/1.0',
          Accept: 'application/x-protobuf, application/octet-stream, */*'
        },
        timeout: 10000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: Buffer.concat(chunks) });
          } else {
            resolve({
              statusCode: res.statusCode || 500,
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

export function resetLilleCache(): void {
  cachedSnapshot = null;
  lastFetchEpoch = 0;
}

export async function getOrFetchIleviaSnapshot(
  feedUrl?: string,
  nowEpoch: number = Date.now(),
  fetcher: (url?: string) => Promise<{ statusCode: number; data?: Buffer; error?: string }> = fetchIleviaFeed
): Promise<IleviaSnapshot> {
  if (cachedSnapshot && nowEpoch - lastFetchEpoch < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const res = await fetcher(feedUrl);
  if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
    try {
      const { totalEntities, filteredUpdates } = decodeGtfsRealtimeFeed(res.data);
      const metroCount = filteredUpdates.filter((u) => u.trip.routeId === 'ME1' || u.trip.routeId === 'ME2').length;
      const tramCount = filteredUpdates.filter((u) => u.trip.routeId === '71').length;

      cachedSnapshot = {
        producedAt: new Date(nowEpoch).toISOString(),
        timestamp: Math.floor(nowEpoch / 1000),
        validUntil: Math.floor((nowEpoch + CACHE_TTL_MS) / 1000),
        feedHealthy: true,
        serviceActive: true,
        lastError: null,
        tripUpdates: filteredUpdates,
        trafficByLine: {}, // Le flux GTFS-RT n'a pas d'alerts
        stats: {
          totalEntitiesInFeed: totalEntities,
          retainedEntities: filteredUpdates.length,
          metroCount,
          tramCount
        }
      };
      lastFetchEpoch = nowEpoch;
      return cachedSnapshot;
    } catch (e: any) {
      const errSnapshot: IleviaSnapshot = {
        producedAt: new Date(nowEpoch).toISOString(),
        timestamp: Math.floor(nowEpoch / 1000),
        validUntil: Math.floor((nowEpoch + 15000) / 1000),
        feedHealthy: false,
        serviceActive: true,
        lastError: `Protobuf decode error: ${e.message}`,
        tripUpdates: cachedSnapshot ? cachedSnapshot.tripUpdates : [],
        trafficByLine: {},
        stats: { totalEntitiesInFeed: 0, retainedEntities: 0, metroCount: 0, tramCount: 0 }
      };
      return errSnapshot;
    }
  }

  return {
    producedAt: new Date(nowEpoch).toISOString(),
    timestamp: Math.floor(nowEpoch / 1000),
    validUntil: Math.floor((nowEpoch + 15000) / 1000),
    feedHealthy: false,
    serviceActive: true,
    lastError: res.error || 'Network error',
    tripUpdates: cachedSnapshot ? cachedSnapshot.tripUpdates : [],
    trafficByLine: {},
    stats: { totalEntitiesInFeed: 0, retainedEntities: 0, metroCount: 0, tramCount: 0 }
  };
}

export const handler = async () => {
  const snapshot = await getOrFetchIleviaSnapshot();
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=15, s-maxage=30',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(snapshot)
  };
};
