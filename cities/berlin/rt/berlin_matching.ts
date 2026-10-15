import type { SchedTrip, Confidence } from '@core/rt/rt_matching';
import { normalizeStopName } from '@core/rt/stop_names';
import type { BerlinTripUpdate, BerlinStopTimeUpdate } from './types';
import { BERLIN_STATION_MAP } from './station_map';

export interface BerlinMatchConfig {
  matchWindowSec: number;
  maxDelaySec: number;
}

export interface BerlinTripMatch {
  tripId: string;
  matchedSchedTripId: string;
  confidence: Confidence;
  nextStationId?: string;
  timeToNextStationS?: number;
  delaySeconds?: number;
}

export interface BerlinMatchOutcome {
  matchedCount: number;
  receivedCount: number;
  matchRate: number; // 0.0 à 1.0 (ex: 0.85 = 85%)
  discardedNonMonotonicCount: number;
  confidenceCounts: Record<Confidence, number>;
  matchesByTripId: Map<string, BerlinTripMatch>;
}

/**
 * Valide la stricte croissance chronologique des prédictions d'une course.
 * Règle d'or §3.4 / 5.5 : « Une mise à jour non croissante est écartée, jamais réparée
 * en inventant un horaire, et comptée dans les statistiques de l'adaptateur. »
 */
export function isTripUpdateMonotonic(tu: BerlinTripUpdate): boolean {
  if (!tu.stopTimeUpdates || tu.stopTimeUpdates.length < 2) {
    return true;
  }

  let lastTime: number | null = null;
  for (const stu of tu.stopTimeUpdates) {
    const t = stu.arrival?.time ?? stu.departure?.time;
    if (t !== undefined && t !== null) {
      if (lastTime !== null && t <= lastTime) {
        return false; // Non-monotonie détectée
      }
      lastTime = t;
    }
  }
  return true;
}

export function cleanStationName(rawName: string): string {
  let name = rawName.replace(/^(S\+U|U|S)\s+/, '');
  name = name.replace(/\s+Bhf\s*\(Berlin\)$/, '');
  name = name.replace(/\s*\(Berlin\)$/, '');
  return name.trim();
}

/**
 * Résout un identifiant d'arrêt GTFS/GTFS-RT (quai de:11000:900100003::1 ou station parente)
 * en identifiant de station normalisé identique à celui utilisé dans les SchedStop du moteur.
 */
export function stopIdToNormalizedStationId(
  stopId: string,
  customMap?: Record<string, string>
): string {
  if (!stopId) return '';

  // 1. Recherche dans la carte personnalisée injectée (si fournie)
  if (customMap && customMap[stopId]) {
    return normalizeStopName(customMap[stopId]);
  }

  // 2. Recherche dans le dictionnaire officiel des quais et stations U-Bahn
  const mapped = BERLIN_STATION_MAP[stopId];
  if (mapped) {
    return normalizeStopName(mapped);
  }

  // 3. Dérivation par extraction de l'identifiant parent (sans le suffixe ::quai)
  const parentId = stopId.split('::')[0];
  const parentMapped = BERLIN_STATION_MAP[parentId];
  if (parentMapped) {
    return normalizeStopName(parentMapped);
  }

  // 4. Repli : nettoyage textuel standard
  return normalizeStopName(cleanStationName(stopId));
}

/**
 * Convertit un timestamp unix epoch (secondes) en secondes civiles de la journée locale à Berlin (fuseau Europe/Berlin).
 */
export function epochToBerlinCivilSeconds(epochSec: number): number {
  const d = new Date(epochSec * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const s = parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10);
  return h * 3600 + m * 60 + s;
}

export class BerlinMatcher {
  private readonly config: BerlinMatchConfig;

  constructor(config: BerlinMatchConfig = { matchWindowSec: 120, maxDelaySec: 900 }) {
    this.config = config;
  }

  public match(
    updates: readonly BerlinTripUpdate[],
    activeSchedTrips: readonly SchedTrip[],
    currentCivilSeconds: number,
    filterRouteId?: string,
    stationMap?: Record<string, string>
  ): BerlinMatchOutcome {
    const relevantUpdates = filterRouteId
      ? updates.filter((u) => {
          const r = u.trip.routeId;
          return (
            r === filterRouteId ||
            (filterRouteId === 'U8' && (r === '17525_400' || r === 'U8')) ||
            (filterRouteId === 'U1' && (r === '17512_400' || r === 'U1')) ||
            (filterRouteId === 'U2' && (r === '17514_400' || r === 'U2')) ||
            (filterRouteId === 'U3' && (r === '17515_400' || r === 'U3')) ||
            (filterRouteId === 'U4' && (r === '17516_400' || r === 'U4')) ||
            (filterRouteId === 'U5' && (r === '17518_400' || r === 'U5')) ||
            (filterRouteId === 'U6' && (r === '17521_400' || r === 'U6')) ||
            (filterRouteId === 'U7' && (r === '17523_400' || r === 'U7')) ||
            (filterRouteId === 'U9' && (r === '17526_400' || r === 'U9'))
          );
        })
      : updates;

    let discardedNonMonotonicCount = 0;
    const validUpdates: BerlinTripUpdate[] = [];

    for (const u of relevantUpdates) {
      if (!isTripUpdateMonotonic(u)) {
        discardedNonMonotonicCount++;
      } else {
        validUpdates.push(u);
      }
    }

    const schedMap = new Map<string, SchedTrip>();
    for (const t of activeSchedTrips) {
      schedMap.set(t.tripId, t);
    }

    const matchesByTripId = new Map<string, BerlinTripMatch>();
    const confidenceCounts: Record<Confidence, number> = {
      measured: 0,
      bracketed: 0,
      extrapolated: 0,
      scheduled: 0
    };

    for (const u of validUpdates) {
      const tripId = u.trip.tripId;
      const sched = schedMap.get(tripId);
      if (!sched) continue;

      // Recherche du prochain arrêt avec horaire estimé dans le futur
      let nextStopId: string | undefined;
      let timeToNextS: number | undefined;

      for (const stu of u.stopTimeUpdates) {
        if (!stu.stopId) continue;
        const predTime = stu.arrival?.time ?? stu.departure?.time;
        if (predTime !== undefined && predTime !== null) {
          const predLocalSec =
            predTime > 86400 * 10 ? epochToBerlinCivilSeconds(predTime) : predTime;

          const diffS = predLocalSec - currentCivilSeconds;
          if (diffS >= -30) {
            nextStopId = stopIdToNormalizedStationId(stu.stopId, stationMap);
            timeToNextS = Math.max(0, diffS);
            break;
          }
        }
      }

      let conf: Confidence = 'scheduled';
      if (nextStopId && timeToNextS !== undefined) {
        if (timeToNextS <= this.config.matchWindowSec) {
          conf = 'measured';
        } else if (timeToNextS <= this.config.maxDelaySec) {
          conf = 'bracketed';
        }
      }

      confidenceCounts[conf]++;
      matchesByTripId.set(tripId, {
        tripId,
        matchedSchedTripId: sched.tripId,
        confidence: conf,
        nextStationId: nextStopId,
        timeToNextStationS: timeToNextS,
        delaySeconds: u.delay
      });
    }

    const matchedCount = matchesByTripId.size;
    const receivedCount = relevantUpdates.length;
    const matchRate = receivedCount > 0 ? matchedCount / receivedCount : 0.0;

    return {
      matchedCount,
      receivedCount,
      matchRate,
      discardedNonMonotonicCount,
      confidenceCounts,
      matchesByTripId
    };
  }
}
