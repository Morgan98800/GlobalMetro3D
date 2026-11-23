/**
 * Factual, public-domain registry of Paris Metro closed / ghost stations
 * and major terminal turnaround loops for Passionné exploration mode.
 */

export interface GhostStationSpec {
  id: string;
  name: string;
  shortNote: string;
  lines: string[];
  status: 'fermée' | 'jamais_ouverte' | 'fusionnée' | 'boucle';
  coordinates: [number, number];
  /** Neighboring stations between which a ride-view train passes this ghost vault */
  betweenStops?: [string, string];
  yearClosed?: number;
}

export const PARIS_GHOST_STATIONS: readonly GhostStationSpec[] = [
  {
    id: 'ghost:arsenal',
    name: 'Arsenal',
    shortNote: 'Station fermée en 1939 (entre Bastille et Quai de la Rapée)',
    lines: ['5'],
    status: 'fermée',
    coordinates: [2.3660, 48.8504],
    betweenStops: ['Bastille', 'Quai de la Rapée'],
    yearClosed: 1939,
  },
  {
    id: 'ghost:saint_martin',
    name: 'Saint-Martin',
    shortNote: 'Grande station à 4 voies fermée en 1939 (entre Strasbourg et République)',
    lines: ['8', '9'],
    status: 'fermée',
    coordinates: [2.3578, 48.8685],
    betweenStops: ['Strasbourg - Saint-Denis', 'République'],
    yearClosed: 1939,
  },
  {
    id: 'ghost:croix_rouge',
    name: 'Croix-Rouge',
    shortNote: 'Ancien terminus L10 fermé en 1939 (entre Sèvres - Babylone et Mabillon)',
    lines: ['10'],
    status: 'fermée',
    coordinates: [2.3283, 48.8520],
    betweenStops: ['Sèvres - Babylone', 'Mabillon'],
    yearClosed: 1939,
  },
  {
    id: 'ghost:champ_de_mars',
    name: 'Champ de Mars',
    shortNote: 'Station L8 fermée en 1939 (entre La Motte-Picquet et École Militaire)',
    lines: ['8'],
    status: 'fermée',
    coordinates: [2.3016, 48.8548],
    betweenStops: ['La Motte-Picquet - Grenelle', 'École Militaire'],
    yearClosed: 1939,
  },
  {
    id: 'ghost:haxo',
    name: 'Haxo',
    shortNote: 'Station jamais ouverte sur la Voie des Fêtes (entre L3bis et L7bis)',
    lines: ['3bis', '7bis'],
    status: 'jamais_ouverte',
    coordinates: [2.4008, 48.8781],
  },
  {
    id: 'ghost:porte_molitor',
    name: 'Porte Molitor',
    shortNote: 'Station jamais ouverte sur la Voie Murat (raccordement L9 / L10)',
    lines: ['9', '10'],
    status: 'jamais_ouverte',
    coordinates: [2.2537, 48.8439],
  },
  {
    id: 'ghost:martin_nadaud',
    name: 'Martin Nadaud',
    shortNote: 'Ancienne station L3 absorbée par Gambetta lors du prolongement de 1969',
    lines: ['3'],
    status: 'fusionnée',
    coordinates: [2.3949, 48.8648],
    betweenStops: ['Père Lachaise', 'Gambetta'],
    yearClosed: 1969,
  },
  {
    id: 'loop:porte_dauphine',
    name: 'Boucle Porte Dauphine',
    shortNote: 'Boucle historique de retournement terminus Ouest de la Ligne 2 (1900)',
    lines: ['2'],
    status: 'boucle',
    coordinates: [2.2750, 48.8712],
  },
  {
    id: 'loop:nation_l1_l2_l6',
    name: 'Boucles de Nation',
    shortNote: 'Boucles de retournement et ateliers souterrains (L1, L2, L6)',
    lines: ['1', '2', '6'],
    status: 'boucle',
    coordinates: [2.3982, 48.8482],
  },
  {
    id: 'loop:etoile_l6',
    name: 'Boucle Charles de Gaulle – Étoile',
    shortNote: 'Boucle terminale serrée à quai unique de la Ligne 6',
    lines: ['6'],
    status: 'boucle',
    coordinates: [2.2949, 48.8742],
  },
];

function normName(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-–—']/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function findGhostStationBetween(
  lineNum: string,
  prevStopName: string,
  nextStopName: string
): GhostStationSpec | null {
  const a = normName(prevStopName);
  const b = normName(nextStopName);
  for (const ghost of PARIS_GHOST_STATIONS) {
    if (!ghost.betweenStops || !ghost.lines.includes(lineNum)) continue;
    const g0 = normName(ghost.betweenStops[0]);
    const g1 = normName(ghost.betweenStops[1]);
    if (
      ((a.includes(g0) || g0.includes(a)) && (b.includes(g1) || g1.includes(b))) ||
      ((a.includes(g1) || g1.includes(a)) && (b.includes(g0) || g0.includes(b)))
    ) {
      return ghost;
    }
  }
  return null;
}
