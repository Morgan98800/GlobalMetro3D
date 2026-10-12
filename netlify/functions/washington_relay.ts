import https from 'https';
import fs from 'fs';
import path from 'path';
import Pbf from 'pbf';
import type { LineTrafficReport } from '../../core/types';
import type {
  WashingtonStopTimeEvent,
  WashingtonStopTimeUpdate,
  WashingtonTripDescriptor,
  WashingtonPosition,
  WashingtonVehicleDescriptor,
  WashingtonTripUpdate,
  WashingtonVehiclePosition,
  WashingtonTrainUpdate,
  WashingtonSnapshot,
  WashingtonStats,
  WashingtonAIMPrediction
} from '../../cities/washington/rt/types';

export const CACHE_TTL_SEC = 15; // [verified: false] netlify CDN and in-memory TTL
export const ALLOWED_ROUTE_IDS = new Set(['RD', 'RED']);

export const WMATA_LINE_MAP: Record<string, string> = {
  RD: 'RED',
  RED: 'RED',
  OR: 'ORANGE',
  ORG: 'ORANGE',
  ORANGE: 'ORANGE',
  SV: 'SILVER',
  SIL: 'SILVER',
  SILVER: 'SILVER',
  BL: 'BLUE',
  BLU: 'BLUE',
  BLUE: 'BLUE',
  GR: 'GREEN',
  GRN: 'GREEN',
  GREEN: 'GREEN',
  YL: 'YELLOW',
  YEL: 'YELLOW',
  YELLOW: 'YELLOW'
};

export function getWmataApiKey(): string {
  if (process.env.WMATA_API_KEY) return process.env.WMATA_API_KEY.trim();
  for (const file of ['.env.local', '.env']) {
    try {
      const p = path.resolve(process.cwd(), file);
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const line of text.split('\n')) {
          if (line.trim().startsWith('WMATA_API_KEY=')) {
            return line.split('=', 2)[1].trim().replace(/^['"]|['"]$/g, '');
          }
        }
      }
    } catch {}
  }
  return '';
}

// ============================================================================
// Décodeurs Protobuf GTFS-RT (TripUpdates et VehiclePositions)
// ============================================================================

function readStopTimeEvent(pbf: any, end: number): WashingtonStopTimeEvent {
  const ev: WashingtonStopTimeEvent = {};
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

function readStopTimeUpdate(pbf: any, end: number): WashingtonStopTimeUpdate {
  const stu: WashingtonStopTimeUpdate = {};
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

function readTripDescriptor(pbf: any, end: number): WashingtonTripDescriptor {
  const td: Partial<WashingtonTripDescriptor> = {};
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

function readPosition(pbf: any, end: number): WashingtonPosition {
  const pos: any = {};
  while (pbf.pos < end) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 1) pos.latitude = pbf.readFloat();
    else if (tag === 2) pos.longitude = pbf.readFloat();
    else if (tag === 3) pos.bearing = pbf.readFloat();
    else if (tag === 4) pos.odometer = pbf.readDouble();
    else if (tag === 5) pos.speed = pbf.readFloat();
    else pbf.skip(val & 7);
  }
  return pos;
}

function readVehicleDescriptor(pbf: any, end: number): WashingtonVehicleDescriptor {
  const vd: any = {};
  while (pbf.pos < end) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 1) vd.id = pbf.readString();
    else if (tag === 2) vd.label = pbf.readString();
    else if (tag === 3) vd.licensePlate = pbf.readString();
    else pbf.skip(val & 7);
  }
  return vd;
}

function readTripUpdate(pbf: any, end: number): { trip?: WashingtonTripDescriptor; stopTimeUpdates: WashingtonStopTimeUpdate[]; timestamp?: number; delay?: number } {
  const tu = { stopTimeUpdates: [] as WashingtonStopTimeUpdate[], timestamp: undefined as number | undefined, delay: undefined as number | undefined, trip: undefined as WashingtonTripDescriptor | undefined };
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

function readVehiclePosition(pbf: any, end: number): WashingtonVehiclePosition {
  const vp: any = { id: '' };
  while (pbf.pos < end) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 1) vp.trip = readTripDescriptor(pbf, pbf.readVarint() + pbf.pos);
    else if (tag === 8) vp.vehicle = readVehicleDescriptor(pbf, pbf.readVarint() + pbf.pos);
    else if (tag === 2) vp.position = readPosition(pbf, pbf.readVarint() + pbf.pos);
    else if (tag === 3) vp.currentStopSequence = pbf.readVarint();
    else if (tag === 7) vp.stopId = pbf.readString();
    else if (tag === 4) vp.currentStatus = pbf.readVarint();
    else if (tag === 5) vp.timestamp = pbf.readVarint();
    else if (tag === 9) vp.occupancyStatus = pbf.readVarint();
    else pbf.skip(val & 7);
  }
  return vp;
}

export function decodeGtfsRtTripUpdates(buffer: Buffer): { totalEntities: number; filteredUpdates: WashingtonTripUpdate[] } {
  const pbf = new Pbf(buffer);
  let totalEntities = 0;
  const filteredUpdates: WashingtonTripUpdate[] = [];

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

      if (tripUpdateData && tripUpdateData.trip && ALLOWED_ROUTE_IDS.has(tripUpdateData.trip.routeId.toUpperCase())) {
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

export function decodeGtfsRtVehiclePositions(buffer: Buffer): { totalEntities: number; filteredPositions: WashingtonVehiclePosition[] } {
  const pbf = new Pbf(buffer);
  let totalEntities = 0;
  const filteredPositions: WashingtonVehiclePosition[] = [];

  while (pbf.pos < pbf.length) {
    const val = pbf.readVarint();
    const tag = val >> 3;
    if (tag === 2) { // FeedEntity
      totalEntities++;
      const end = pbf.readVarint() + pbf.pos;
      let entityId = '';
      let vehiclePositionData: any = null;

      while (pbf.pos < end) {
        const v2 = pbf.readVarint();
        const t2 = v2 >> 3;
        if (t2 === 1) entityId = pbf.readString();
        else if (t2 === 4) vehiclePositionData = readVehiclePosition(pbf, pbf.readVarint() + pbf.pos);
        else pbf.skip(v2 & 7);
      }

      if (vehiclePositionData) {
        vehiclePositionData.id = entityId;
        const routeId = vehiclePositionData.trip?.routeId?.toUpperCase();
        if (!routeId || ALLOWED_ROUTE_IDS.has(routeId)) {
          filteredPositions.push(vehiclePositionData);
        }
      }
    } else {
      pbf.skip(val & 7);
    }
  }

  return { totalEntities, filteredPositions };
}

// ============================================================================
// Analyseur des Incidents WMATA
// ============================================================================

export function parseWmataIncidents(jsonTextOrObj: any): Record<string, LineTrafficReport> {
  const result: Record<string, LineTrafficReport> = {
    RED: { lineId: 'RED', lineName: 'Red Line', status: 'normal', severity: 'normal', title: 'Red Line', message: 'Normal service', updatedAt: new Date().toISOString() },
    ORANGE: { lineId: 'ORANGE', lineName: 'Orange Line', status: 'normal', severity: 'normal', title: 'Orange Line', message: 'Normal service', updatedAt: new Date().toISOString() },
    SILVER: { lineId: 'SILVER', lineName: 'Silver Line', status: 'normal', severity: 'normal', title: 'Silver Line', message: 'Normal service', updatedAt: new Date().toISOString() },
    BLUE: { lineId: 'BLUE', lineName: 'Blue Line', status: 'normal', severity: 'normal', title: 'Blue Line', message: 'Normal service', updatedAt: new Date().toISOString() },
    GREEN: { lineId: 'GREEN', lineName: 'Green Line', status: 'normal', severity: 'normal', title: 'Green Line', message: 'Normal service', updatedAt: new Date().toISOString() },
    YELLOW: { lineId: 'YELLOW', lineName: 'Yellow Line', status: 'normal', severity: 'normal', title: 'Yellow Line', message: 'Normal service', updatedAt: new Date().toISOString() }
  };

  if (!jsonTextOrObj) return result;

  let payload = jsonTextOrObj;
  if (typeof jsonTextOrObj === 'string') {
    try {
      payload = JSON.parse(jsonTextOrObj);
    } catch {
      return result;
    }
  }

  const incidents = Array.isArray(payload?.Incidents) ? payload.Incidents : [];
  for (const inc of incidents) {
    const linesAffected = String(inc.LinesAffected || '').toUpperCase();
    const desc = String(inc.Description || '');
    const incType = String(inc.IncidentType || '');

    const lineMappings = [
      ['RD', 'RED'],
      ['RED', 'RED'],
      ['OR', 'ORANGE'],
      ['ORG', 'ORANGE'],
      ['ORANGE', 'ORANGE'],
      ['SV', 'SILVER'],
      ['SIL', 'SILVER'],
      ['SILVER', 'SILVER'],
      ['BL', 'BLUE'],
      ['BLU', 'BLUE'],
      ['BLUE', 'BLUE'],
      ['GR', 'GREEN'],
      ['GRN', 'GREEN'],
      ['GREEN', 'GREEN'],
      ['YL', 'YELLOW'],
      ['YEL', 'YELLOW'],
      ['YELLOW', 'YELLOW']
    ] as const;

    for (const [code, lineKey] of lineMappings) {
      const isTarget = linesAffected.includes(code) || desc.toUpperCase().includes(`${lineKey} LINE`);
      if (!isTarget) continue;

      const descLower = desc.toLowerCase();
      const isInterrupted =
        descLower.includes('suspended') ||
        descLower.includes('suspend') ||
        descLower.includes('interruption') ||
        descLower.includes('bypassing') ||
        descLower.includes('closed');

      const status = isInterrupted ? 'interrupted' : 'disrupted';
      const severity = isInterrupted ? 'alert' : 'warning';
      const lineName = result[lineKey]?.lineName || `${lineKey} Line`;
      const title = isInterrupted ? `${lineName} (Service Interrupted)` : `${lineName} (Delays)`;

      if (result[lineKey].status === 'normal' || (result[lineKey].status === 'disrupted' && status === 'interrupted')) {
        result[lineKey] = {
          lineId: lineKey,
          lineName,
          status,
          severity,
          title,
          message: desc || incType || `Incident on ${lineName}`,
          updatedAt: inc.DateUpdated ? new Date(inc.DateUpdated).toISOString() : new Date().toISOString()
        };
      }
    }
  }

  return result;
}

// ============================================================================
// Analyseur des Prédictions de Station (WMATA Real-Time Rail Predictions)
// ============================================================================

export function parseWmataStationPredictions(
  jsonTextOrObj: any,
  nowEpochSec: number = Math.floor(Date.now() / 1000)
): {
  trains: WashingtonTrainUpdate[];
  tripUpdates: WashingtonTripUpdate[];
  predictions: WashingtonAIMPrediction[];
} {
  let payload = jsonTextOrObj;
  if (typeof jsonTextOrObj === 'string') {
    try {
      payload = JSON.parse(jsonTextOrObj);
    } catch {
      return { trains: [], tripUpdates: [], predictions: [] };
    }
  }

  const rawTrains = Array.isArray(payload?.Trains) ? payload.Trains : [];
  const predictions: WashingtonAIMPrediction[] = [];
  const trains: WashingtonTrainUpdate[] = [];
  const tripUpdates: WashingtonTripUpdate[] = [];

  for (let i = 0; i < rawTrains.length; i++) {
    const raw = rawTrains[i];
    if (!raw || typeof raw !== 'object') continue;

    const lineRaw = String(raw.Line || '').trim().toUpperCase();
    const routeId = WMATA_LINE_MAP[lineRaw];
    if (!routeId) continue;

    const locCode = String(raw.LocationCode || '').trim();
    if (!locCode) continue;

    const destCode = String(raw.DestinationCode || '').trim();
    const destName = String(raw.DestinationName || raw.Destination || '').trim();
    const minStr = String(raw.Min || '').trim().toUpperCase();

    let timeToNextS: number | undefined;
    if (minStr === 'BRD') {
      timeToNextS = 0;
    } else if (minStr === 'ARR') {
      timeToNextS = 30;
    } else {
      const parsedMin = parseInt(minStr, 10);
      if (!isNaN(parsedMin) && parsedMin >= 0) {
        timeToNextS = parsedMin * 60;
      }
    }

    if (timeToNextS === undefined) {
      continue;
    }

    let carCount: number | undefined;
    if (raw.Car) {
      const c = parseInt(String(raw.Car), 10);
      if (!isNaN(c) && c > 0) carCount = c;
    }

    const group = String(raw.Group || '1').trim();
    const directionId: 0 | 1 = group === '2' ? 1 : 0;

    const tripId = `pred_${routeId}_${locCode}_${destCode || 'term'}_${group}_${i}`;

    const predItem: WashingtonAIMPrediction = {
      Car: raw.Car ? String(raw.Car) : undefined,
      Destination: raw.Destination ? String(raw.Destination) : undefined,
      DestinationCode: destCode || undefined,
      DestinationName: destName || undefined,
      Group: group,
      Line: lineRaw,
      LocationCode: locCode,
      LocationName: raw.LocationName ? String(raw.LocationName) : undefined,
      Min: minStr
    };
    predictions.push(predItem);

    const trainUpdate: WashingtonTrainUpdate = {
      tripId,
      routeId,
      directionId,
      vehicleId: tripId,
      carCount,
      delay: 0,
      nextStationId: `STN_${locCode}`,
      nextStationName: raw.LocationName || destName,
      timeToNextStationS: timeToNextS,
      timestamp: nowEpochSec
    };
    trains.push(trainUpdate);

    const tripUpdate: WashingtonTripUpdate = {
      id: tripId,
      trip: {
        tripId,
        routeId,
        directionId
      },
      timestamp: nowEpochSec,
      delay: 0,
      stopTimeUpdates: [
        {
          stopSequence: 1,
          stopId: `STN_${locCode}`,
          arrival: { time: nowEpochSec + timeToNextS },
          departure: { time: nowEpochSec + timeToNextS + 20 }
        }
      ]
    };
    tripUpdates.push(tripUpdate);
  }

  return { trains, tripUpdates, predictions };
}

export function buildSnapshotFromPredictions(
  predictionsPayload: any,
  incidentsPayload: any,
  nowEpochSec: number
): WashingtonSnapshot {
  const { trains, tripUpdates, predictions } = parseWmataStationPredictions(predictionsPayload, nowEpochSec);
  const incData = parseWmataIncidents(incidentsPayload);
  const redCount = trains.filter((t) => t.routeId === 'RED').length;

  return {
    producedAt: new Date(nowEpochSec * 1000).toISOString(),
    timestamp: nowEpochSec,
    validUntil: nowEpochSec + CACHE_TTL_SEC,
    feedHealthy: true,
    serviceActive: true,
    serviceStatus: 'active',
    lastError: null,
    trains,
    tripUpdates,
    predictions,
    dataSource: 'station-prediction',
    trafficByLine: incData,
    stats: {
      totalEntitiesInFeed: predictions.length,
      retainedEntities: trains.length,
      redCount,
      vehiclePositionsCount: 0
    }
  };
}

// ============================================================================
// Fusion et normalisation des flux
// ============================================================================

export function mergeWmataRt(
  tripUpdates: WashingtonTripUpdate[],
  vehiclePositions: WashingtonVehiclePosition[],
  incidentsReport: Record<string, LineTrafficReport>,
  nowEpoch: number
): WashingtonSnapshot {
  const vpByTripId = new Map<string, WashingtonVehiclePosition>();
  for (const vp of vehiclePositions) {
    if (vp.trip?.tripId) {
      vpByTripId.set(vp.trip.tripId, vp);
    }
  }

  const trains: WashingtonTrainUpdate[] = [];

  for (const tu of tripUpdates) {
    const tripId = tu.trip.tripId;
    const vp = vpByTripId.get(tripId);

    // Extraction du nombre de voitures depuis license_plate
    let carCount: number | undefined;
    if (vp?.vehicle?.licensePlate) {
      const parsed = parseInt(vp.vehicle.licensePlate, 10);
      if (!isNaN(parsed) && parsed > 0) carCount = parsed;
    }

    // Prochain arrêt futur
    let nextStopId: string | undefined;
    let timeToNextS: number | undefined;

    for (const stu of tu.stopTimeUpdates) {
      const predTime = stu.arrival?.time ?? stu.departure?.time;
      if (predTime !== undefined && predTime >= nowEpoch - 30) {
        nextStopId = stu.stopId;
        timeToNextS = Math.max(0, predTime - nowEpoch);
        break;
      }
    }

    trains.push({
      tripId,
      routeId: 'RED',
      directionId: (tu.trip.directionId === 1 ? 1 : 0) as 0 | 1,
      vehicleId: vp?.vehicle?.id || tu.trip.tripId,
      carCount,
      delay: tu.delay ?? 0,
      latitude: vp?.position?.latitude,
      longitude: vp?.position?.longitude,
      bearing: vp?.position?.bearing,
      speed: vp?.position?.speed,
      nextStationId: nextStopId,
      timeToNextStationS: timeToNextS,
      timestamp: tu.timestamp || vp?.timestamp || nowEpoch
    });
  }

  return {
    producedAt: new Date(nowEpoch * 1000).toISOString(),
    timestamp: nowEpoch,
    validUntil: nowEpoch + CACHE_TTL_SEC,
    feedHealthy: true,
    serviceActive: true,
    serviceStatus: 'active',
    lastError: null,
    trains,
    tripUpdates,
    trafficByLine: incidentsReport,
    stats: {
      totalEntitiesInFeed: tripUpdates.length,
      retainedEntities: trains.length,
      redCount: trains.length,
      vehiclePositionsCount: vehiclePositions.length
    }
  };
}

// ============================================================================
// Cache Global Lambda & Coalescence des promesses (Burst protection)
// ============================================================================

let cachedSnapshot: WashingtonSnapshot | null = null;
let lastFetchEpochMs = 0;
let inFlightFetch: Promise<WashingtonSnapshot> | null = null;

export function resetWashingtonCache(): void {
  cachedSnapshot = null;
  lastFetchEpochMs = 0;
  inFlightFetch = null;
}

export type WmataFetcher = (
  endpoint: 'tripupdates' | 'vehiclepositions' | 'incidents' | 'stationprediction',
  apiKey: string
) => Promise<{ statusCode: number; data?: Buffer | string; error?: string }>;

export async function defaultWmataFetcher(
  endpoint: 'tripupdates' | 'vehiclepositions' | 'incidents' | 'stationprediction',
  apiKey: string
): Promise<{ statusCode: number; data?: Buffer | string; error?: string }> {
  let url = '';
  let isProtobuf = true;
  if (endpoint === 'tripupdates') {
    url = 'https://api.wmata.com/gtfs/rail-gtfsrt-tripupdates.pb';
  } else if (endpoint === 'vehiclepositions') {
    url = 'https://api.wmata.com/gtfs/rail-gtfsrt-vehiclepositions.pb';
  } else if (endpoint === 'incidents') {
    url = 'https://api.wmata.com/Incidents.svc/json/Incidents';
    isProtobuf = false;
  } else if (endpoint === 'stationprediction') {
    url = 'https://api.wmata.com/StationPrediction.svc/json/GetPrediction/All';
    isProtobuf = false;
  }

  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          'api_key': apiKey,
          'User-Agent': 'ParisSubway3D-WashingtonRelay/1.0',
          Accept: isProtobuf
            ? 'application/x-protobuf, application/octet-stream, */*'
            : 'application/json, */*'
        },
        timeout: 8000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              data: isProtobuf ? buffer : buffer.toString('utf8')
            });
          } else {
            resolve({
              statusCode: res.statusCode || 500,
              error: `HTTP ${res.statusCode}`
            });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ statusCode: 500, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 504, error: 'Gateway Timeout' });
    });
    req.end();
  });
}

function loadFixtureSnapshot(nowEpoch: number): WashingtonSnapshot {
  const fixturePaths = [
    path.resolve(process.cwd(), 'cities/washington/data/washington-rt-fixture.json'),
    path.resolve(process.cwd(), 'web/public/cities/washington/data/washington-rt-fixture.json')
  ];

  for (const fp of fixturePaths) {
    if (fs.existsSync(fp)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
        parsed.timestamp = nowEpoch;
        parsed.validUntil = nowEpoch + CACHE_TTL_SEC;
        parsed.producedAt = new Date(nowEpoch * 1000).toISOString();
        return parsed;
      } catch {}
    }
  }

  // Snapshot minimaliste de secours
  return {
    producedAt: new Date(nowEpoch * 1000).toISOString(),
    timestamp: nowEpoch,
    validUntil: nowEpoch + CACHE_TTL_SEC,
    feedHealthy: true,
    serviceActive: true,
    serviceStatus: 'active',
    lastError: null,
    trains: [],
    tripUpdates: [],
    trafficByLine: {
      RED: {
        lineId: 'RED',
        lineName: 'Red Line',
        status: 'normal',
        severity: 'normal',
        title: 'Red Line',
        message: 'Normal service (fixture)',
        updatedAt: new Date(nowEpoch * 1000).toISOString()
      }
    },
    stats: { totalEntitiesInFeed: 0, retainedEntities: 0, redCount: 0 }
  };
}

export async function getOrFetchWashingtonSnapshot(
  apiKey: string = getWmataApiKey(),
  nowEpochMs: number = Date.now(),
  fetcher: WmataFetcher = defaultWmataFetcher
): Promise<{ snapshot: WashingtonSnapshot; fromCache: boolean; isFixture: boolean }> {
  const nowEpochSec = Math.floor(nowEpochMs / 1000);

  // 1. Si cache valide en mémoire
  if (cachedSnapshot && nowEpochMs - lastFetchEpochMs < CACHE_TTL_SEC * 1000) {
    return { snapshot: cachedSnapshot, fromCache: true, isFixture: false };
  }

  // 2. Si aucune clé n'est configurée, renvoyer la fixture réaliste avec flag
  if (!apiKey) {
    const fixture = loadFixtureSnapshot(nowEpochSec);
    cachedSnapshot = fixture;
    lastFetchEpochMs = nowEpochMs;
    return { snapshot: fixture, fromCache: false, isFixture: true };
  }

  // 3. Coalescence de promesses (évite les requêtes concurrentes en rafale)
  if (inFlightFetch) {
    const snapshot = await inFlightFetch;
    return { snapshot, fromCache: true, isFixture: false };
  }

  // 4. Lancement de la requête WMATA
  inFlightFetch = (async () => {
    try {
      const [tuRes, vpRes, incRes] = await Promise.all([
        fetcher('tripupdates', apiKey),
        fetcher('vehiclepositions', apiKey),
        fetcher('incidents', apiKey)
      ]);

      // Règle d'or §5.1 : Interception des 429, 401
      // WMATA 429 ou 401 n'est jamais relayé tel quel -> repli en mode théorique
      const isRateLimited = tuRes.statusCode === 429 || vpRes.statusCode === 429 || incRes.statusCode === 429;
      const isUnauthorized = tuRes.statusCode === 401 || vpRes.statusCode === 401 || incRes.statusCode === 401;

      // Décodage des flux GTFS-RT nominaux si disponibles
      const tuData = tuRes.statusCode === 200 && tuRes.data && Buffer.isBuffer(tuRes.data)
        ? decodeGtfsRtTripUpdates(tuRes.data)
        : { totalEntities: 0, filteredUpdates: [] };

      const vpData = vpRes.statusCode === 200 && vpRes.data && Buffer.isBuffer(vpRes.data)
        ? decodeGtfsRtVehiclePositions(vpRes.data)
        : { totalEntities: 0, filteredPositions: [] };

      const incData = parseWmataIncidents(incRes.data);

      // Si GTFS-RT n'a pas retourné de courses (ex: clé non abonnée au GTFS-RT, 403, 404 ou flux vide),
      // tenter automatiquement le repli hybride sur StationPrediction.svc (API JSON GetPrediction/All)
      if (tuData.filteredUpdates.length === 0 && !isRateLimited && !isUnauthorized) {
        try {
          const spRes = await fetcher('stationprediction', apiKey);
          if (spRes.statusCode === 200 && spRes.data) {
            const spSnapshot = buildSnapshotFromPredictions(spRes.data, incRes.data, nowEpochSec);
            cachedSnapshot = spSnapshot;
            lastFetchEpochMs = nowEpochMs;
            return spSnapshot;
          }
        } catch {
          // Erreur non bloquante, poursuivre vers le mode indisponible
        }
      }

      const isNetworkError = tuRes.statusCode >= 500 || vpRes.statusCode >= 500;

      if (isRateLimited || isUnauthorized || isNetworkError || (tuData.filteredUpdates.length === 0 && vpData.filteredPositions.length === 0)) {
        const errorMsg = isRateLimited
          ? 'WMATA API Rate Limit exceeded (429)'
          : isUnauthorized
          ? 'WMATA API Key Unauthorized (401)'
          : `WMATA API Gateway Error (HTTP ${tuRes.statusCode || vpRes.statusCode})`;

        const unavailableSnapshot: WashingtonSnapshot = {
          producedAt: new Date(nowEpochMs).toISOString(),
          timestamp: nowEpochSec,
          validUntil: nowEpochSec + CACHE_TTL_SEC,
          feedHealthy: false,
          serviceActive: false,
          serviceStatus: 'unavailable',
          lastError: errorMsg,
          trains: [],
          tripUpdates: [],
          trafficByLine: incData,
          stats: { totalEntitiesInFeed: 0, retainedEntities: 0, redCount: 0 }
        };

        cachedSnapshot = unavailableSnapshot;
        lastFetchEpochMs = nowEpochMs;
        return unavailableSnapshot;
      }

      const merged = mergeWmataRt(tuData.filteredUpdates, vpData.filteredPositions, incData, nowEpochSec);
      merged.dataSource = 'gtfs-rt';

      cachedSnapshot = merged;
      lastFetchEpochMs = nowEpochMs;
      return merged;
    } catch (e: any) {
      const errSnapshot: WashingtonSnapshot = {
        producedAt: new Date(nowEpochMs).toISOString(),
        timestamp: nowEpochSec,
        validUntil: nowEpochSec + CACHE_TTL_SEC,
        feedHealthy: false,
        serviceActive: false,
        serviceStatus: 'unavailable',
        lastError: e.message || 'Relay fetch failure',
        trains: [],
        tripUpdates: [],
        trafficByLine: {
          RED: {
            lineId: 'RED',
            lineName: 'Red Line',
            status: 'normal',
            severity: 'normal',
            title: 'Red Line',
            message: 'Realtime unavailable - theoretical timetable active',
            updatedAt: new Date(nowEpochMs).toISOString()
          }
        },
        stats: { totalEntitiesInFeed: 0, retainedEntities: 0, redCount: 0 }
      };
      cachedSnapshot = errSnapshot;
      lastFetchEpochMs = nowEpochMs;
      return errSnapshot;
    } finally {
      inFlightFetch = null;
    }
  })();

  const snapshot = await inFlightFetch;
  return { snapshot, fromCache: false, isFixture: !apiKey };
}

export const handler = async () => {
  const now = Date.now();
  const { snapshot, isFixture } = await getOrFetchWashingtonSnapshot(getWmataApiKey(), now);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=10, s-maxage=${CACHE_TTL_SEC}, stale-while-revalidate=5`,
    'Netlify-CDN-Cache-Control': `public, s-maxage=${CACHE_TTL_SEC}`,
    'Access-Control-Allow-Origin': '*'
  };

  if (isFixture) {
    headers['x-wmata-fixture'] = 'true';
  }

  // Règle d'or §5.1 : Le relais renvoie toujours un code HTTP 200 (même en cas de 429/401 côté WMATA),
  // pour permettre au client de basculer silencieusement en mode théorique sans panne réseau.
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(snapshot)
  };
};
