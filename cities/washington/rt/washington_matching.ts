import type { SchedTrip, Confidence } from '@core/rt/rt_matching';
import { normalizeStopName } from '@core/rt/stop_names';
import type { WashingtonTripUpdate, WashingtonStopTimeUpdate } from './types';

export interface WashingtonMatchConfig {
  matchWindowSec: number;
  maxDelaySec: number;
}

export interface WashingtonTripMatch {
  tripId: string;
  matchedSchedTripId: string;
  confidence: Confidence;
  nextStationId?: string;
  nextStationName?: string;
  timeToNextStationS?: number;
  delaySeconds?: number;
}

export interface WashingtonMatchOutcome {
  matchedCount: number;
  receivedCount: number;
  matchRate: number; // 0.0 à 1.0 (ex: 0.85 = 85%)
  discardedNonMonotonicCount: number;
  confidenceCounts: Record<Confidence, number>;
  matchesByTripId: Map<string, WashingtonTripMatch>;
}

/**
 * Valide la stricte croissance chronologique des prédictions d'une course.
 * Règle d'or : une mise à jour non croissante est écartée et comptée.
 */
export function isTripUpdateMonotonic(tu: WashingtonTripUpdate): boolean {
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

/**
 * Table de correspondance entre codes de stations WMATA (ou préfixes) et noms officiels des stations.
 */
export const WMATA_CODE_TO_STATION_NAME: Record<string, string> = {
  // Red Line Branch A (Shady Grove -> Metro Center)
  'A01': 'Metro Center',
  'A02': 'Farragut North',
  'A03': 'Dupont Circle',
  'A04': 'Woodley Park',
  'A05': 'Cleveland Park',
  'A06': 'Van Ness-UDC',
  'A07': 'Tenleytown-AU',
  'A08': 'Friendship Heights',
  'A09': 'Bethesda',
  'A10': 'Medical Center',
  'A11': 'Grosvenor-Strathmore',
  'A12': 'North Bethesda',
  'A13': 'Twinbrook',
  'A14': 'Rockville',
  'A15': 'Shady Grove',
  // Red Line Branch B (Gallery Place -> Glenmont)
  'B01': 'Gallery Place',
  'B02': 'Judiciary Sq',
  'B03': 'Union Station',
  'B04': 'Rhode Island Ave',
  'B05': 'Brookland-CUA',
  'B06': 'Fort Totten',
  'B07': 'Takoma',
  'B08': 'Silver Spring',
  'B09': 'Forest Glen',
  'B10': 'Wheaton',
  'B11': 'Glenmont',
  'B35': 'NoMa-Gallaudet U',
  // Blue / Orange / Silver Branch C & D (Rosslyn -> Largo / New Carrollton)
  'C01': 'Metro Center',
  'C02': 'McPherson Sq',
  'C03': 'Farragut West',
  'C04': 'Foggy Bottom-GWU',
  'C05': 'Rosslyn',
  'C06': 'Arlington Cemetery',
  'C07': 'Pentagon',
  'C08': 'Pentagon City',
  'C09': 'Crystal City',
  'C10': 'Ronald Reagan Washington National Airport',
  'C11': 'Potomac Yard/VT',
  'C12': 'Braddock Rd',
  'C13': 'King St-Old Town',
  'C14': 'Eisenhower Ave',
  'C15': 'Huntington',
  'D01': 'Federal Triangle',
  'D02': 'Smithsonian',
  'D03': "L'Enfant Plaza",
  'D04': 'Federal Center SW',
  'D05': 'Capitol South',
  'D06': 'Eastern Market',
  'D07': 'Potomac Ave',
  'D08': 'Stadium-Armory',
  'D09': 'Minnesota Ave',
  'D10': 'Deanwood',
  'D11': 'Cheverly',
  'D12': 'Landover',
  'D13': 'New Carrollton',
  // Green / Yellow Branch E & F
  'E01': 'Mt Vernon Sq',
  'E02': 'Shaw-Howard U',
  'E03': 'U St',
  'E04': 'Columbia Heights',
  'E05': 'Georgia Ave-Petworth',
  'E06': 'Fort Totten',
  'E07': 'West Hyattsville',
  'E08': 'Hyattsville Crossing',
  'E09': 'College Park-U of MD',
  'E10': 'Greenbelt',
  'F01': 'Gallery Place',
  'F02': 'Archives',
  'F03': "L'Enfant Plaza",
  'F04': 'Waterfront',
  'F05': 'Navy Yard-Ballpark',
  'F06': 'Anacostia',
  'F07': 'Congress Heights',
  'F08': 'Southern Ave',
  'F09': 'Naylor Rd',
  'F10': 'Suitland',
  'F11': 'Branch Ave',
  // Blue / Silver Branch G & J
  'G01': 'Benning Rd',
  'G02': 'Capitol Heights',
  'G03': 'Addison Rd',
  'G04': 'Morgan Blvd',
  'G05': 'Downtown Largo',
  'J02': 'Van Dorn St',
  'J03': 'Franconia-Springfield',
  // Orange Branch K (Court House -> Vienna)
  'K01': 'Court House',
  'K02': 'Clarendon',
  'K03': 'Virginia Sq-GMU',
  'K04': 'Ballston-MU',
  'K05': 'East Falls Church',
  'K06': 'West Falls Church',
  'K07': 'Dunn Loring',
  'K08': 'Vienna',
  // Silver Branch N (McLean -> Ashburn)
  'N01': 'McLean',
  'N02': 'Tysons',
  'N03': 'Greensboro',
  'N04': 'Spring Hill',
  'N06': 'Wiehle-Reston East',
  'N07': 'Reston Town Center',
  'N08': 'Herndon',
  'N09': 'Innovation Center',
  'N10': 'Washington Dulles International Airport',
  'N11': 'Loudoun Gateway',
  'N12': 'Ashburn'
};

/**
 * Résout un stopId (quai PF_A01_1, station STN_A01_C01, code A01 ou nom) en nom de station normalisé.
 */
export function stopIdToNormalizedStationId(stopId: string): string {
  if (!stopId) return '';
  const clean = stopId.trim().toUpperCase();

  // 1. Chercher un code de station (ex: A01, B35) dans la chaîne
  for (const [code, name] of Object.entries(WMATA_CODE_TO_STATION_NAME)) {
    if (
      clean === code ||
      clean.startsWith(`PF_${code}`) ||
      clean.startsWith(`STN_${code}`) ||
      clean.includes(`_${code}_`) ||
      clean.includes(`_${code}`)
    ) {
      return normalizeStopName(name);
    }
  }

  // 2. Repli : normaliser la chaîne brute
  return normalizeStopName(stopId);
}

/**
 * Convertit un timestamp Unix epoch en secondes civiles de la journée locale à Washington (America/New_York).
 */
export function epochToWashingtonCivilSeconds(epochSec: number): number {
  const d = new Date(epochSec * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
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

export class WashingtonMatcher {
  private readonly config: WashingtonMatchConfig;

  constructor(config: WashingtonMatchConfig = { matchWindowSec: 120, maxDelaySec: 900 }) {
    this.config = config;
  }

  public match(
    updates: readonly WashingtonTripUpdate[],
    activeSchedTrips: readonly SchedTrip[],
    currentCivilSeconds: number,
    filterRouteId?: string
  ): WashingtonMatchOutcome {
    const relevantUpdates = filterRouteId && filterRouteId !== 'ALL'
      ? updates.filter((u) => {
          const r = u.trip.routeId.toUpperCase();
          return r === filterRouteId ||
            (filterRouteId === 'RED' && (r === 'RD' || r === 'RED')) ||
            (filterRouteId === 'ORANGE' && (r === 'OR' || r === 'ORANGE')) ||
            (filterRouteId === 'SILVER' && (r === 'SV' || r === 'SILVER')) ||
            (filterRouteId === 'BLUE' && (r === 'BL' || r === 'BLUE')) ||
            (filterRouteId === 'GREEN' && (r === 'GR' || r === 'GREEN')) ||
            (filterRouteId === 'YELLOW' && (r === 'YL' || r === 'YELLOW'));
        })
      : updates;

    let discardedNonMonotonicCount = 0;
    const validUpdates: WashingtonTripUpdate[] = [];

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

    const matchesByTripId = new Map<string, WashingtonTripMatch>();
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

      // Recherche du prochain arrêt futur
      let nextStopId: string | undefined;
      let nextStopName: string | undefined;
      let timeToNextS: number | undefined;

      for (const stu of u.stopTimeUpdates) {
        if (!stu.stopId) continue;
        const predTime = stu.arrival?.time ?? stu.departure?.time;
        if (predTime !== undefined) {
          const predLocalSec = predTime > 86400 * 10
            ? epochToWashingtonCivilSeconds(predTime)
            : predTime;

          const diffS = predLocalSec - currentCivilSeconds;
          if (diffS >= -30) {
            nextStopId = stopIdToNormalizedStationId(stu.stopId);
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
        nextStationName: nextStopName,
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
