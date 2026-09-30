import type { SchedTrip, Confidence } from '@core/rt/rt_matching';
import { normalizeStopName } from '@core/rt/stop_names';
import type { IleviaTripUpdate, IleviaStopTimeUpdate } from './types';

export interface IleviaMatchConfig {
  matchWindowSec: number;
  maxDelaySec: number;
}

export interface IleviaTripMatch {
  tripId: string;
  matchedSchedTripId: string;
  confidence: Confidence;
  nextStationId?: string;
  timeToNextStationS?: number;
  delaySeconds?: number;
}

export interface IleviaMatchOutcome {
  matchedCount: number;
  receivedCount: number;
  matchRate: number; // 0.0 à 1.0 (ex: 0.85 = 85%)
  discardedNonMonotonicCount: number;
  confidenceCounts: Record<Confidence, number>;
  matchesByTripId: Map<string, IleviaTripMatch>;
}

/**
 * Valide la stricte croissance chronologique des prédictions d'une course.
 * Règle d'or §3.4 : « Une mise à jour non croissante est écartée, jamais réparée
 * en inventant un horaire, et comptée dans les statistiques de l'adaptateur. »
 */
export function isTripUpdateMonotonic(tu: IleviaTripUpdate): boolean {
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

const PREFIX_TO_STATION_NAME: Record<string, string> = {
  // Ligne 1
  '4CA': '4 Cantons Stade P. Mauroy',
  'CSC': 'Cité Scientifique',
  'TIO': 'Triolo',
  'HDV': "V. D'Ascq Hotel De Ville",
  'PDB': 'Pont De Bois',
  'LZN': 'Square Flandres',
  'MHE': "Mairie D'Hellemmes",
  'MRB': 'Marbrerie',
  'DFI': 'Fives',
  'CIE': 'Madeleine Caulier',
  'LIG': 'Gare Lille Flandres',
  'RIH': 'Rihour',
  'REP': 'République Beaux-Arts',
  'CGA': 'Gambetta',
  'WAZ': 'Wazemmes',
  'PDP': 'Porte Des Postes',
  'CHR': 'Chu - Centre O. Lambret',
  'CAL': 'Chu - Eurasanté',
  // Ligne 2
  'HSP': 'Saint Philibert',
  'BRG': 'Bourg',
  'MDE': 'Maison Des Enfants',
  'MIT': 'Mitterie',
  'PSU': 'Pont Supérieur',
  'LLO': 'Lomme-Lambersart',
  'CAN': 'Canteleu Euratechnologies',
  'LPC': 'Bois Blancs',
  'PTL': 'Port De Lille',
  'COR': 'Cormontaigne',
  'MNT': 'Montebello',
  'PRR': "Porte D'Arras",
  'PDO': 'Porte De Douai',
  'PDV': 'Porte De Valenciennes',
  'LGP': 'Lille Grand Palais',
  'MDL': 'Mairie De Lille',
  'EUR': 'Gare Lille Europe',
  'SMP': 'Saint Maurice Pellevoisin',
  'MSA': 'Mons Sarts',
  'MDM': 'Mairie De Mons',
  'FOR': 'Fort De Mons',
  'PRS': 'Les Prés Edgard Pisani',
  'JRS': 'Jean Jaurès',
  'PVL': 'Wasquehal Pavé De Lille',
  'WMI': 'Wasquehal Hôtel De Ville',
  'CPL': 'Croix Centre',
  'CXM': 'Mairie De Croix',
  'EPL': 'Epeule Montesquieu',
  'CDG': 'Roubaix Charles De Gaulle',
  'ROU': 'Eurotéléport',
  'RXP': 'Roubaix Grand Place',
  'MGR': 'Gare Jean Lebas Roubaix',
  'ALS': 'Alsace Plaine Images',
  'MER': 'Mercure',
  'CTL': 'Carliers',
  'SEB': 'Gare De Tourcoing',
  'TOU': 'Tourcoing Centre',
  'COB': 'Colbert',
  'TPH': 'Phalempins',
  'PTN': 'Pont De Neuville',
  'TBO': 'Bourgogne',
  'DRO': 'C.H. Dron',
  // Tramway R & T
  'ROM': 'Romarin',
  'BOT': 'Botanique',
  'SMA': 'Saint Maur',
  'MAB': 'Buisson',
  'OSS': 'Brossolette',
  'MCL': 'Clemenceau Hippodrome',
  'CRL': 'Croise Laroche',
  'ACA': 'Acacias',
  'PDW': 'Pont De Wasquehal',
  'LAT': 'La Terrasse',
  'SNO': 'Le Sart',
  'PLE': 'Planche Epinoy',
  'ARQ': 'La Marque',
  'CLD': 'Villa Cavrois',
  'BOA': "Bol D'Air",
  'PBA': 'Parc Barbieux',
  'BDC': 'Hopital Victor Provo',
  'QUI': 'Jean Moulin',
  'MAM': 'Alfred Mongy',
  'OCH': 'Foch',
  'LQS': 'Le Quesne',
  'CDA': 'Cerisaie',
  'CTR': 'Chateau Rouge',
  'TEL': 'Cartelot',
  'GDC': 'Grand Cottignies',
  'TRI': 'Triez',
  '3SU': 'Trois Suisses',
  'DAI': 'Faidherbe',
  'CAM': 'Ma Campagne',
  'PHY': 'Pont Hydraulique',
  'ICT': 'Victoire'
};

export function stopIdToNormalizedStationId(stopId: string): string {
  const pfx = stopId.substring(0, 3).toUpperCase();
  const name = PREFIX_TO_STATION_NAME[pfx];
  return name ? normalizeStopName(name) : normalizeStopName(stopId);
}

export function epochToParisCivilSeconds(epochSec: number): number {
  const d = new Date(epochSec * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
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

export class IleviaMatcher {
  private readonly config: IleviaMatchConfig;

  constructor(config: IleviaMatchConfig = { matchWindowSec: 120, maxDelaySec: 900 }) {
    this.config = config;
  }

  public match(
    updates: readonly IleviaTripUpdate[],
    activeSchedTrips: readonly SchedTrip[],
    currentCivilSeconds: number,
    filterRouteId?: string
  ): IleviaMatchOutcome {
    const relevantUpdates = filterRouteId
      ? updates.filter((u) => {
          const r = u.trip.routeId;
          return r === filterRouteId || (r === '71' && (filterRouteId === 'TRAM_R' || filterRouteId === 'TRAM_T'));
        })
      : updates;

    let discardedNonMonotonicCount = 0;
    const validUpdates: IleviaTripUpdate[] = [];

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

    const matchesByTripId = new Map<string, IleviaTripMatch>();
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

      // Recherche de la prochaine station avec heure prédite future
      let nextStopId: string | undefined;
      let timeToNextS: number | undefined;

      for (const stu of u.stopTimeUpdates) {
        if (!stu.stopId) continue;
        const predTime = stu.arrival?.time ?? stu.departure?.time;
        if (predTime !== undefined) {
          // Si predTime est un timestamp epoch unix, le convertir en secondes civiles locales à Paris
          const predLocalSec = predTime > 86400 * 10
            ? epochToParisCivilSeconds(predTime)
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
          conf = 'measured'; // Niveau de confiance nominal des prédictions (similaire à Londres)
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
