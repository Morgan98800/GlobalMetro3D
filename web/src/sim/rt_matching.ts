/**
 * rt_matching.ts — rapprochement des prédictions PRIM avec les courses GTFS,
 * et interpolation encadrée par deux mesures.
 *
 * Ce que fait le code actuel : réduire tout le flux EstimatedTimetable à un retard
 * moyen par ligne et par sens. Toutes les rames d'un sens sont décalées du même
 * montant. Or chaque EstimatedVehicleJourney du flux EST une course individuelle,
 * avec ses propres EstimatedCall portant heure théorique et heure estimée par arrêt.
 * On jette donc l'essentiel de l'information déjà téléchargée.
 *
 * Ce que fait ce module :
 *   1. rapprocher chaque course du flux d'une course GTFS  (niveau 2)
 *   2. construire une chronologie corrigée où chaque arrêt porte soit une heure
 *      MESURÉE, soit une heure interpolée entre deux mesures                (niveau 3)
 *   3. positionner la rame entre deux mesures et non entre deux horaires théoriques
 *   4. signaler les courses probablement supprimées               (rames fantômes)
 *
 * Toutes les heures sont en secondes depuis le minuit de la journée de service,
 * cohérentes avec paris_time.ts. Aucune Date n'entre dans ce module.
 */

/* ---------------------------------------------------------------- types --- */

export interface RtCall {
  stopId: string;
  /** heure théorique annoncée par le flux, en secondes de service */
  aimed: number;
  /** heure estimée par le flux */
  expected: number;
}

/** Un EstimatedVehicleJourney normalisé. */
export interface RtJourney {
  lineId: string;
  /** déduit de DirectionRef ou de la destination ; peut être null */
  dir: 0 | 1 | null;
  destination: string | null;
  calls: RtCall[];
  /** DatedVehicleJourneyRef s'il existe — peu fiable, sert seulement d'indice */
  journeyRef?: string;
}

export interface SchedStop {
  stopId: string;
  /** heure d'arrivée théorique, secondes de service */
  arr: number;
  /** heure de départ théorique */
  dep: number;
  /** abscisse curviligne le long du tracé, en mètres */
  dist: number;
}

export interface SchedTrip {
  tripId: string;
  lineId: string;
  dir: 0 | 1;
  shapeId: string;
  stops: SchedStop[];
}

export type Confidence = 'measured' | 'bracketed' | 'extrapolated' | 'scheduled';

export interface TimelineStop extends SchedStop {
  /** heures corrigées */
  cArr: number;
  cDep: number;
  /** true si l'heure vient d'une mesure du flux */
  measured: boolean;
}

export interface Timeline {
  tripId: string;
  shapeId: string;
  dir: 0 | 1;
  stops: TimelineStop[];
  /** dernière mesure utilisée, en secondes de service — sert au vieillissement */
  lastMeasurementAt: number | null;
  measuredCount: number;
}

/* ------------------------------------------------------------ réglages --- */

export const CONFIG = {
  /** fenêtre de rapprochement sur l'heure théorique, en secondes */
  matchWindow: 120,
  /** au-delà, un retard est jugé aberrant : la course est probablement supprimée */
  maxDelay: 15 * 60,
  /** lissage exponentiel du retard par course */
  alpha: 0.4,
  /** au-delà du dernier arrêt mesuré, le retard décroît sur cette distance (m) */
  decayDistance: 4000,
  /** une mesure plus vieille que ça n'est plus considérée comme fraîche */
  staleAfter: 6 * 60,
  /** accélération et décélération, m/s² */
  accel: 1.0,
  decel: 1.2,
  /** vitesse maximale par défaut, m/s (≈ 70 km/h) */
  vMax: 19.4,
  /** temps de stationnement minimal si le GTFS n'en donne pas, s */
  minDwell: 20,
};

/* -------------------------------------------------- niveau 2 : matching --- */

/**
 * Score de rapprochement entre une course du flux et une course GTFS.
 * Plus bas = meilleur. Infinity = incompatible.
 *
 * On compare les heures THÉORIQUES aux arrêts communs : c'est le seul point de
 * contact fiable entre les deux mondes. Les heures estimées ne peuvent pas servir,
 * puisqu'elles portent justement l'écart que l'on cherche à mesurer.
 */
export function matchScore(journey: RtJourney, trip: SchedTrip): number {
  if (journey.lineId !== trip.lineId) return Infinity;
  if (journey.dir !== null && journey.dir !== trip.dir) return Infinity;

  const byStop = new Map(trip.stops.map((s) => [s.stopId, s]));
  const diffs: number[] = [];

  for (const call of journey.calls) {
    const stop = byStop.get(call.stopId);
    if (!stop) continue;
    diffs.push(Math.abs(call.aimed - stop.arr));
  }

  if (diffs.length === 0) return Infinity;

  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)];
  if (median > CONFIG.matchWindow) return Infinity;

  // un rapprochement appuyé sur plusieurs arrêts communs vaut mieux qu'un seul
  return median / Math.sqrt(diffs.length);
}

export interface MatchResult {
  journey: RtJourney;
  trip: SchedTrip;
  score: number;
}

/**
 * Appariement global, glouton sur le score croissant, avec unicité des deux côtés.
 *
 * L'appariement course par course est un piège : deux passages proches se collent
 * à la même course GTFS et l'une des deux rames reste sans mesure. On construit
 * donc toutes les paires candidates, on trie, et on consomme.
 *
 * Un appariement optimal (algorithme hongrois) ferait légèrement mieux ; à l'échelle
 * d'une ligne de métro, l'écart n'est pas mesurable. Passer à l'optimal seulement si
 * le taux de rapprochement journalisé reste médiocre.
 */
export function matchJourneys(
  journeys: readonly RtJourney[],
  activeTrips: readonly SchedTrip[]
): { matches: MatchResult[]; unmatchedJourneys: RtJourney[] } {
  const pairs: MatchResult[] = [];

  for (const journey of journeys) {
    for (const trip of activeTrips) {
      const score = matchScore(journey, trip);
      if (score !== Infinity) pairs.push({ journey, trip, score });
    }
  }

  pairs.sort((a, b) => a.score - b.score);

  const usedTrips = new Set<string>();
  const usedJourneys = new Set<RtJourney>();
  const matches: MatchResult[] = [];

  for (const pair of pairs) {
    if (usedTrips.has(pair.trip.tripId)) continue;
    if (usedJourneys.has(pair.journey)) continue;
    usedTrips.add(pair.trip.tripId);
    usedJourneys.add(pair.journey);
    matches.push(pair);
  }

  return {
    matches,
    unmatchedJourneys: journeys.filter((j) => !usedJourneys.has(j)),
  };
}

/* ------------------------------------------- niveau 3 : encadrement -------- */

/**
 * Chronologie corrigée d'une course.
 *
 * Chaque arrêt reçoit une heure corrigée. Trois cas :
 *   - arrêt mesuré par le flux            → l'heure estimée est utilisée telle quelle
 *   - arrêt entre deux arrêts mesurés     → écart interpolé linéairement (encadré)
 *   - arrêt après le dernier arrêt mesuré → écart décroissant sur decayDistance
 *
 * C'est ce qui fait la différence de fidélité : entre deux stations mesurées, la rame
 * n'est plus positionnée à partir d'un horaire théorique décalé, elle est encadrée
 * par deux observations réelles.
 */
export function buildTimeline(
  trip: SchedTrip,
  calls: readonly RtCall[],
  previous?: Timeline
): Timeline {
  const measured = new Map<string, number>();
  let lastMeasurementAt: number | null = null;

  for (const call of calls) {
    const offset = call.expected - call.aimed;
    if (Math.abs(offset) > CONFIG.maxDelay) continue; // aberrant, ignoré
    measured.set(call.stopId, offset);
    lastMeasurementAt = Math.max(lastMeasurementAt ?? -Infinity, call.expected);
  }

  // écart connu par index d'arrêt, null si inconnu
  const known: (number | null) = null as never;
  const offsets: (number | null)[] = trip.stops.map((s) => {
    const raw = measured.get(s.stopId);
    if (raw === undefined) return null;
    // lissage contre la chronologie précédente pour éviter les à-coups
    const prev = previous?.stops.find((p) => p.stopId === s.stopId);
    if (prev?.measured) {
      const prevOffset = prev.cArr - prev.arr;
      return CONFIG.alpha * raw + (1 - CONFIG.alpha) * prevOffset;
    }
    return raw;
  });

  const measuredIdx = offsets
    .map((o, i) => (o === null ? -1 : i))
    .filter((i) => i >= 0);

  const resolve = (i: number): number => {
    if (offsets[i] !== null) return offsets[i]!;
    if (measuredIdx.length === 0) return 0;

    const before = measuredIdx.filter((k) => k < i).pop();
    const after = measuredIdx.find((k) => k > i);

    // encadré : interpolation linéaire de l'écart sur la distance
    if (before !== undefined && after !== undefined) {
      const d0 = trip.stops[before].dist;
      const d1 = trip.stops[after].dist;
      const f = d1 > d0 ? (trip.stops[i].dist - d0) / (d1 - d0) : 0;
      return offsets[before]! + f * (offsets[after]! - offsets[before]!);
    }

    // après la dernière mesure : décroissance, une rame retardée rattrape en partie
    if (before !== undefined) {
      const gap = trip.stops[i].dist - trip.stops[before].dist;
      const k = Math.max(0, 1 - gap / CONFIG.decayDistance);
      return offsets[before]! * k;
    }

    // avant la première mesure : l'écart est déjà survenu, on l'applique tel quel
    return offsets[after!]!;
  };

  const stops: TimelineStop[] = trip.stops.map((s, i) => {
    const offset = resolve(i);
    const dwell = Math.max(s.dep - s.arr, CONFIG.minDwell);
    const cArr = s.arr + offset;
    return { ...s, cArr, cDep: cArr + dwell, measured: offsets[i] !== null };
  });

  // monotonie : une rame ne recule jamais, même après interpolation
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].cArr < stops[i - 1].cDep + 1) {
      stops[i].cArr = stops[i - 1].cDep + 1;
      stops[i].cDep = Math.max(stops[i].cDep, stops[i].cArr + CONFIG.minDwell);
    }
  }

  return {
    tripId: trip.tripId,
    shapeId: trip.shapeId,
    dir: trip.dir,
    stops,
    lastMeasurementAt,
    measuredCount: measuredIdx.length,
  };
}

/* ------------------------------------------------------ positionnement --- */

export interface Position {
  /** abscisse curviligne, mètres */
  dist: number;
  /** vitesse instantanée, m/s */
  speed: number;
  /** écart à l'horaire à cet instant, secondes */
  delay: number;
  confidence: Confidence;
  nextStopId: string | null;
  atStop: boolean;
}

/** Profil trapézoïdal : fraction de distance parcourue à la fraction de temps tau. */
function trapezoid(distance: number, duration: number, tau: number): { f: number; v: number } {
  if (duration <= 0) return { f: tau >= 1 ? 1 : 0, v: 0 };

  const { accel: a, decel: b } = CONFIG;
  const vMean = distance / duration;
  // vitesse de palier résolue pour que l'aire du trapèze vaille la distance
  let vc = vMean / (1 - (vMean * (a + b)) / (2 * a * b * duration) || 1);
  if (!isFinite(vc) || vc <= 0) vc = vMean;
  vc = Math.min(vc, CONFIG.vMax);

  const tA = vc / a;
  const tD = vc / b;
  const t = tau * duration;

  if (t <= 0) return { f: 0, v: 0 };
  if (t >= duration) return { f: 1, v: 0 };

  let travelled: number;
  let v: number;

  if (t < tA) {
    travelled = 0.5 * a * t * t;
    v = a * t;
  } else if (t > duration - tD) {
    const u = duration - t;
    travelled = distance - 0.5 * b * u * u;
    v = b * u;
  } else {
    travelled = 0.5 * vc * tA + vc * (t - tA);
    v = vc;
  }

  return { f: Math.max(0, Math.min(1, travelled / distance)), v };
}

/** Position de la rame à l'instant t (secondes de service). */
export function positionAt(timeline: Timeline, t: number): Position | null {
  const { stops } = timeline;
  if (stops.length < 2) return null;
  if (t < stops[0].cDep) return null;
  if (t > stops[stops.length - 1].cArr) return null;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    // à quai
    if (t >= a.cArr && t < a.cDep) {
      return {
        dist: a.dist,
        speed: 0,
        delay: a.cArr - a.arr,
        confidence: confidenceFor(timeline, a.measured, a.measured, t),
        nextStopId: b.stopId,
        atStop: true,
      };
    }

    if (t >= a.cDep && t <= b.cArr) {
      const distance = b.dist - a.dist;
      const duration = b.cArr - a.cDep;
      const tau = duration > 0 ? (t - a.cDep) / duration : 1;
      const { f, v } = trapezoid(distance, duration, tau);
      return {
        dist: a.dist + f * distance,
        speed: v,
        delay: a.cArr - a.arr + tau * (b.cArr - b.arr - (a.cArr - a.arr)),
        confidence: confidenceFor(timeline, a.measured, b.measured, t),
        nextStopId: b.stopId,
        atStop: false,
      };
    }
  }

  return null;
}

function confidenceFor(
  timeline: Timeline,
  aMeasured: boolean,
  bMeasured: boolean,
  t: number
): Confidence {
  if (timeline.measuredCount === 0) return 'scheduled';
  if (timeline.lastMeasurementAt !== null && t - timeline.lastMeasurementAt > CONFIG.staleAfter) {
    return 'scheduled';
  }
  if (aMeasured && bMeasured) return 'measured';
  if (aMeasured || bMeasured) return 'bracketed';
  return 'extrapolated';
}

/* ------------------------------------------------- rames fantômes -------- */

export interface GhostTracker {
  /** nombre de concédés consécutifs sans mesure, par tripId */
  missed: Map<string, number>;
}

export function createGhostTracker(): GhostTracker {
  return { missed: new Map() };
}

/**
 * Une course déjà rapprochée qui disparaît du flux alors que le flux est sain a
 * probablement été supprimée. Le moteur actuel continue de la faire rouler : ce sont
 * les rames fantômes, plus trompeuses qu'un retard approximatif.
 *
 * Deux gardes indispensables :
 *   - ne rien conclure si le flux est en panne (feedHealthy === false)
 *   - ne rien conclure d'une course jamais rapprochée : l'absence de mesure peut
 *     simplement venir d'un arrêt non sondé
 */
export function updateGhosts(
  tracker: GhostTracker,
  activeTrips: readonly SchedTrip[],
  matchedTripIds: ReadonlySet<string>,
  everMatched: ReadonlySet<string>,
  feedHealthy: boolean,
  threshold = 3
): Set<string> {
  const suppressed = new Set<string>();
  if (!feedHealthy) {
    tracker.missed.clear();
    return suppressed;
  }

  for (const trip of activeTrips) {
    if (matchedTripIds.has(trip.tripId)) {
      tracker.missed.delete(trip.tripId);
      continue;
    }
    if (!everMatched.has(trip.tripId)) continue;

    const n = (tracker.missed.get(trip.tripId) ?? 0) + 1;
    tracker.missed.set(trip.tripId, n);
    if (n >= threshold) suppressed.add(trip.tripId);
  }

  return suppressed;
}

/* ------------------------------------------------------ observabilité --- */

export interface MatchStats {
  journeys: number;
  matched: number;
  rate: number;
  activeTrips: number;
  bracketedTrips: number;
  suppressed: number;
}

/**
 * À exposer sur /health et à journaliser. Le taux de rapprochement est LA métrique
 * du niveau 2 : sous 60 %, l'encadrement du niveau 3 ne sert à rien et il faut
 * revoir la déduction du sens ou la fenêtre de rapprochement.
 */
export function stats(
  journeys: readonly RtJourney[],
  matches: readonly MatchResult[],
  activeTrips: readonly SchedTrip[],
  timelines: readonly Timeline[],
  suppressed: ReadonlySet<string>
): MatchStats {
  return {
    journeys: journeys.length,
    matched: matches.length,
    rate: journeys.length ? matches.length / journeys.length : 0,
    activeTrips: activeTrips.length,
    bracketedTrips: timelines.filter((t) => t.measuredCount >= 2).length,
    suppressed: suppressed.size,
  };
}
