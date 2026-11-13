import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getOptimalPixelRatio, isMobileGpuDevice } from '@core/ui/map/device_perf';
import type { TrainMarker } from '@core/ui/map/trains_layer';

export interface ParisRideOptions {
  initialLine?: string;
  initialDest?: string;
  initialStation?: string;
  initialTrainId?: string;
  initialView?: 'ride' | 'vault';
  onExit?: () => void;
  onRouteChange?: (routeKey: string) => void;
}

export interface ParisRideHandle {
  setRoute: (key: string, stationName?: string, destName?: string) => void;
  setView: (view: 'vault' | 'ride') => void;
  syncFromSimulation: (trains: TrainMarker[]) => void;
  dispose: () => void;
}

export type ParisGlbFamily =
  | 'pneumatic_generic'
  | 'steel_classic'
  | 'rer_generic_A'
  | 'rer_generic_B'
  | 'rer_generic_C'
  | 'rer_generic_D'
  | 'rer_generic_E';

interface RouteStationDef {
  name: string;
  flag: '' | 'f' | 'b';
  air: boolean;
}

interface RouteDef {
  key: string;
  num: string;
  bg: string;
  fg: string;
  branch?: string;
  open: {
    air?: string[];
    seine?: [string, string][];
    tower?: [string, string];
  };
  stations: RouteStationDef[];
}

interface TrackPiece {
  t: 'L' | 'A';
  s0: number;
  len: number;
  x?: number;
  z?: number;
  h?: number;
  cx?: number;
  cz?: number;
  R?: number;
  sg?: number;
  h0?: number;
}

interface StationPos {
  name: string;
  flag: '' | 'f' | 'b';
  air: boolean;
  s0: number;
  sc: number;
}

interface TunnelDef {
  s0: number;
  s1: number;
  curve: number;
  a: boolean;
  b: boolean;
  seine: boolean;
  tower: boolean;
  out: [number, number] | null;
}

interface BuiltPart {
  g: THREE.Object3D;
  env: 'in' | 'out' | 'plug';
}

interface BuiltSegment {
  parts: BuiltPart[];
  dispose: () => void;
}

const PI = Math.PI;
const GY = -7;
const AW = 7;
const AY = 1.1;
const AH = 5.4;
const SL = 124;
const HALF = 62;
const PE = 3.25;
const TW = 4.2;
const TY = 2.6;
const TH = 2.4;
const TL = 320;
const TAIL = 260;

const L = 13.6;
const CW = 2.4;
const SH = 2.15;
const BY = 0.95;
const GAP = 0.7;
const NC = 5;
const WR = 0.42;
const TRAIN_LEN = NC * L + (NC - 1) * GAP;

const DOORS: [number, number][] = [
  [1.55, 2.85],
  [6.15, 7.45],
  [10.75, 12.05],
];
const WINS: [number, number][] = [
  [0.35, 1.35],
  [3.05, 4.4],
  [4.6, 5.95],
  [7.65, 9.0],
  [9.2, 10.55],
  [12.25, 13.25],
];
const WY: [number, number] = [1.0, 1.8];
const DY: [number, number] = [0.08, 2.0];

const T7 = [
  'La Courneuve – 8 Mai 1945',
  'Fort d’Aubervilliers',
  'Aubervilliers – Pantin – Quatre Chemins',
  'Porte de la Villette',
  'Corentin Cariou',
  'Crimée',
  'Riquet',
  'Stalingrad',
  'Louis Blanc',
  'Château-Landon',
  'Gare de l’Est',
  'Poissonnière',
  'Cadet',
  'Le Peletier',
  'Chaussée d’Antin – La Fayette',
  'Opéra',
  'Pyramides',
  'Palais Royal – Musée du Louvre',
  'Pont Neuf',
  'Châtelet',
  'Pont Marie',
  'Sully – Morland',
  'Jussieu',
  'Place Monge',
  'Censier – Daubenton',
  'Les Gobelins',
  'Place d’Italie',
  'Tolbiac',
  'Maison Blanche',
];

const T13 = [
  'Châtillon – Montrouge',
  'Malakoff – Étienne Dolet',
  'Malakoff – Plateau de Vanves',
  'Porte de Vanves',
  'Plaisance',
  'Pernety',
  'Gaîté',
  'Montparnasse – Bienvenüe',
  'Duroc',
  'Saint-François-Xavier',
  'Varenne',
  'Invalides',
  'Champs-Élysées – Clemenceau',
  'Miromesnil',
  'Saint-Lazare',
  'Liège',
  'Place de Clichy',
  'La Fourche',
];

const RAW_ROUTES: Array<{
  key: string;
  num: string;
  bg: string;
  fg: string;
  branch?: string;
  st: string[];
}> = [
  {
    key: '1',
    num: '1',
    bg: '#FFCD00',
    fg: '#1a1a1a',
    st: [
      'La Défense',
      'Esplanade de La Défense',
      'Pont de Neuilly',
      'Les Sablons',
      'Porte Maillot',
      'Argentine',
      'Charles de Gaulle – Étoile',
      'George V',
      'Franklin D. Roosevelt',
      'Champs-Élysées – Clemenceau',
      'Concorde',
      'Tuileries',
      'Palais Royal – Musée du Louvre',
      'Louvre – Rivoli',
      'Châtelet',
      'Hôtel de Ville',
      'Saint-Paul',
      'Bastille',
      'Gare de Lyon',
      'Reuilly – Diderot',
      'Nation',
      'Porte de Vincennes',
      'Saint-Mandé',
      'Bérault',
      'Château de Vincennes',
    ],
  },
  {
    key: '2',
    num: '2',
    bg: '#003CA6',
    fg: '#ffffff',
    st: [
      'Porte Dauphine',
      'Victor Hugo',
      'Charles de Gaulle – Étoile',
      'Ternes',
      'Courcelles',
      'Monceau',
      'Villiers',
      'Rome',
      'Place de Clichy',
      'Blanche',
      'Pigalle',
      'Anvers',
      'Barbès – Rochechouart',
      'La Chapelle',
      'Stalingrad',
      'Jaurès',
      'Colonel Fabien',
      'Belleville',
      'Couronnes',
      'Ménilmontant',
      'Père Lachaise',
      'Philippe Auguste',
      'Alexandre Dumas',
      'Avron',
      'Nation',
    ],
  },
  {
    key: '3',
    num: '3',
    bg: '#837902',
    fg: '#ffffff',
    st: [
      'Pont de Levallois – Bécon',
      'Anatole France',
      'Louise Michel',
      'Porte de Champerret',
      'Pereire',
      'Wagram',
      'Malesherbes',
      'Villiers',
      'Europe',
      'Saint-Lazare',
      'Havre – Caumartin',
      'Opéra',
      'Quatre-Septembre',
      'Bourse',
      'Sentier',
      'Réaumur – Sébastopol',
      'Arts et Métiers',
      'Temple',
      'République',
      'Parmentier',
      'Rue Saint-Maur',
      'Père Lachaise',
      'Gambetta',
      'Porte de Bagnolet',
      'Gallieni',
    ],
  },
  {
    key: '3bis',
    num: '3bis',
    bg: '#6EC4E8',
    fg: '#0d2340',
    st: ['Gambetta', 'Pelleport', 'Saint-Fargeau', 'Porte des Lilas'],
  },
  {
    key: '4',
    num: '4',
    bg: '#CF009E',
    fg: '#ffffff',
    st: [
      'Porte de Clignancourt',
      'Simplon',
      'Marcadet – Poissonniers',
      'Château Rouge',
      'Barbès – Rochechouart',
      'Gare du Nord',
      'Gare de l’Est',
      'Château d’Eau',
      'Strasbourg – Saint-Denis',
      'Réaumur – Sébastopol',
      'Étienne Marcel',
      'Les Halles',
      'Châtelet',
      'Cité',
      'Saint-Michel',
      'Odéon',
      'Saint-Germain-des-Prés',
      'Saint-Sulpice',
      'Saint-Placide',
      'Montparnasse – Bienvenüe',
      'Vavin',
      'Raspail',
      'Denfert-Rochereau',
      'Mouton-Duvernet',
      'Alésia',
      'Porte d’Orléans',
      'Mairie de Montrouge',
      'Barbara',
      'Bagneux – Lucie Aubrac',
    ],
  },
  {
    key: '5',
    num: '5',
    bg: '#FF7E2E',
    fg: '#1a1a1a',
    st: [
      'Bobigny – Pablo Picasso',
      'Bobigny – Pantin – Raymond Queneau',
      'Église de Pantin',
      'Hoche',
      'Porte de Pantin',
      'Ourcq',
      'Laumière',
      'Jaurès',
      'Stalingrad',
      'Gare du Nord',
      'Gare de l’Est',
      'Jacques Bonsergent',
      'République',
      'Oberkampf',
      'Richard-Lenoir',
      'Bréguet-Sabin',
      'Bastille',
      'Quai de la Rapée',
      'Gare d’Austerlitz',
      'Saint-Marcel',
      'Campo-Formio',
      'Place d’Italie',
    ],
  },
  {
    key: '6',
    num: '6',
    bg: '#6ECA97',
    fg: '#0f2a1c',
    st: [
      'Charles de Gaulle – Étoile',
      'Kléber',
      'Boissière',
      'Trocadéro',
      'Passy',
      'Bir-Hakeim',
      'Dupleix',
      'La Motte-Picquet – Grenelle',
      'Cambronne',
      'Sèvres – Lecourbe',
      'Pasteur',
      'Montparnasse – Bienvenüe',
      'Edgar Quinet',
      'Raspail',
      'Denfert-Rochereau',
      'Saint-Jacques',
      'Glacière',
      'Corvisart',
      'Place d’Italie',
      'Nationale',
      'Chevaleret',
      'Quai de la Gare',
      'Bercy',
      'Dugommier',
      'Daumesnil',
      'Bel-Air',
      'Picpus',
      'Nation',
    ],
  },
  {
    key: '7v',
    num: '7',
    bg: '#FA9ABA',
    fg: '#3a0d1f',
    branch: 'Branche Villejuif',
    st: T7.concat([
      'Porte d’Italie',
      'Le Kremlin-Bicêtre',
      'Villejuif – Léo Lagrange',
      'Villejuif – Paul Vaillant-Couturier',
      'Villejuif – Louis Aragon',
    ]),
  },
  {
    key: '7i',
    num: '7',
    bg: '#FA9ABA',
    fg: '#3a0d1f',
    branch: 'Branche Ivry',
    st: T7.concat(['Porte de Choisy', 'Porte d’Ivry', 'Pierre et Marie Curie', 'Mairie d’Ivry']),
  },
  {
    key: '7bis',
    num: '7bis',
    bg: '#6ECA97',
    fg: '#0f2a1c',
    st: [
      'Louis Blanc',
      'Jaurès',
      'Bolivar',
      'Buttes Chaumont',
      'Botzaris',
      'Place des Fêtes>',
      '<Danube',
      'Pré-Saint-Gervais',
    ],
  },
  {
    key: '8',
    num: '8',
    bg: '#E19BDF',
    fg: '#2d0e2c',
    st: [
      'Balard',
      'Lourmel',
      'Boucicaut',
      'Félix Faure',
      'Commerce',
      'La Motte-Picquet – Grenelle',
      'École Militaire',
      'La Tour-Maubourg',
      'Invalides',
      'Concorde',
      'Madeleine',
      'Opéra',
      'Richelieu – Drouot',
      'Grands Boulevards',
      'Bonne Nouvelle',
      'Strasbourg – Saint-Denis',
      'République',
      'Filles du Calvaire',
      'Saint-Sébastien – Froissart',
      'Chemin Vert',
      'Bastille',
      'Ledru-Rollin',
      'Faidherbe – Chaligny',
      'Reuilly – Diderot',
      'Montgallet',
      'Daumesnil',
      'Michel Bizot',
      'Porte Dorée',
      'Porte de Charenton',
      'Liberté',
      'Charenton – Écoles',
      'École Vétérinaire de Maisons-Alfort',
      'Maisons-Alfort – Stade',
      'Maisons-Alfort – Les Juilliottes',
      'Créteil – L’Échat',
      'Créteil – Université',
      'Créteil – Préfecture',
      'Pointe du Lac',
    ],
  },
  {
    key: '9',
    num: '9',
    bg: '#B6BD00',
    fg: '#1f2200',
    st: [
      'Pont de Sèvres',
      'Billancourt',
      'Marcel Sembat',
      'Porte de Saint-Cloud',
      'Exelmans',
      'Michel-Ange – Molitor',
      'Michel-Ange – Auteuil',
      'Jasmin',
      'Ranelagh',
      'La Muette',
      'Rue de la Pompe',
      'Trocadéro',
      'Iéna',
      'Alma – Marceau',
      'Franklin D. Roosevelt',
      'Saint-Philippe du Roule',
      'Miromesnil',
      'Saint-Augustin',
      'Havre – Caumartin',
      'Chaussée d’Antin – La Fayette',
      'Richelieu – Drouot',
      'Grands Boulevards',
      'Bonne Nouvelle',
      'Strasbourg – Saint-Denis',
      'République',
      'Oberkampf',
      'Saint-Ambroise',
      'Voltaire',
      'Charonne',
      'Rue des Boulets',
      'Nation',
      'Buzenval',
      'Maraîchers',
      'Porte de Montreuil',
      'Robespierre',
      'Croix de Chavaux',
      'Mairie de Montreuil',
    ],
  },
  {
    key: '10',
    num: '10',
    bg: '#C9910D',
    fg: '#1f1400',
    st: [
      'Gare d’Austerlitz',
      'Jussieu',
      'Cardinal Lemoine',
      'Maubert – Mutualité',
      'Cluny – La Sorbonne',
      'Odéon',
      'Mabillon',
      'Sèvres – Babylone',
      'Vaneau',
      'Duroc',
      'Ségur',
      'La Motte-Picquet – Grenelle',
      'Avenue Émile Zola',
      'Charles Michels',
      'Javel – André Citroën',
      'Église d’Auteuil>',
      '<Mirabeau',
      'Michel-Ange – Auteuil>',
      '<Chardon-Lagache',
      'Porte d’Auteuil>',
      '<Michel-Ange – Molitor',
      'Boulogne – Jean Jaurès',
      'Boulogne – Pont de Saint-Cloud',
    ],
  },
  {
    key: '11',
    num: '11',
    bg: '#704B1C',
    fg: '#ffffff',
    st: [
      'Châtelet',
      'Hôtel de Ville',
      'Rambuteau',
      'Arts et Métiers',
      'République',
      'Goncourt',
      'Belleville',
      'Pyrénées',
      'Jourdain',
      'Place des Fêtes',
      'Télégraphe',
      'Porte des Lilas',
      'Mairie des Lilas',
      'Serge Gainsbourg',
      'Romainville – Carnot',
      'Montreuil – Hôpital',
      'La Dhuys',
      'Coteaux Beauclair',
      'Rosny – Bois-Perrier',
    ],
  },
  {
    key: '12',
    num: '12',
    bg: '#007852',
    fg: '#ffffff',
    st: [
      'Mairie d’Aubervilliers',
      'Aimé Césaire',
      'Front Populaire',
      'Porte de la Chapelle',
      'Marx Dormoy',
      'Marcadet – Poissonniers',
      'Jules Joffrin',
      'Lamarck – Caulaincourt',
      'Abbesses',
      'Pigalle',
      'Saint-Georges',
      'Notre-Dame-de-Lorette',
      'Trinité – d’Estienne d’Orves',
      'Saint-Lazare',
      'Madeleine',
      'Concorde',
      'Assemblée Nationale',
      'Solférino',
      'Rue du Bac',
      'Sèvres – Babylone',
      'Rennes',
      'Notre-Dame-des-Champs',
      'Montparnasse – Bienvenüe',
      'Falguière',
      'Pasteur',
      'Volontaires',
      'Vaugirard',
      'Convention',
      'Porte de Versailles',
      'Corentin Celton',
      'Mairie d’Issy',
    ],
  },
  {
    key: '13s',
    num: '13',
    bg: '#6EC4E8',
    fg: '#0d2340',
    branch: 'Branche Saint-Denis',
    st: T13.concat([
      'Guy Môquet',
      'Porte de Saint-Ouen',
      'Garibaldi',
      'Mairie de Saint-Ouen',
      'Carrefour Pleyel',
      'Saint-Denis – Porte de Paris',
      'Basilique de Saint-Denis',
      'Saint-Denis – Université',
    ]),
  },
  {
    key: '13a',
    num: '13',
    bg: '#6EC4E8',
    fg: '#0d2340',
    branch: 'Branche Asnières',
    st: T13.concat([
      'Brochant',
      'Porte de Clichy',
      'Mairie de Clichy',
      'Gabriel Péri',
      'Les Agnettes',
      'Les Courtilles',
    ]),
  },
  {
    key: '14',
    num: '14',
    bg: '#62259D',
    fg: '#ffffff',
    st: [
      'Saint-Denis Pleyel',
      'Mairie de Saint-Ouen',
      'Porte de Clichy',
      'Pont Cardinet',
      'Saint-Lazare',
      'Madeleine',
      'Pyramides',
      'Châtelet',
      'Gare de Lyon',
      'Bercy',
      'Cour Saint-Émilion',
      'Bibliothèque François Mitterrand',
      'Olympiades',
      'Maison Blanche',
      'Hôpital Bicêtre',
      'Villejuif – Gustave Roussy',
      'L’Haÿ-les-Roses',
      'Chevilly-Larue',
      'Thiais – Orly',
      'Aéroport d’Orly',
    ],
  },
  {
    key: 'A',
    num: 'A',
    bg: '#EB2132',
    fg: '#ffffff',
    st: [
      'Cergy / Poissy',
      'Nanterre-Préfecture',
      'La Défense',
      'Charles de Gaulle – Étoile',
      'Auber',
      'Châtelet – Les Halles',
      'Gare de Lyon',
      'Nation',
      'Vincennes',
      'Val de Fontenay',
      'Marne-la-Vallée / Boissy',
    ],
  },
  {
    key: 'B',
    num: 'B',
    bg: '#5091CB',
    fg: '#ffffff',
    st: [
      'Aéroport CDG 2 / Mitry',
      'Aulnay-sous-Bois',
      'Gare du Nord',
      'Châtelet – Les Halles',
      'Saint-Michel Notre-Dame',
      'Luxembourg',
      'Port-Royal',
      'Denfert-Rochereau',
      'Cité Universitaire',
      'Bourg-la-Reine',
      'Antony / Saint-Rémy',
    ],
  },
  {
    key: 'C',
    num: 'C',
    bg: '#FFCC30',
    fg: '#000000',
    st: [
      'Pontoise / Versailles-Château',
      'Javel',
      'Champ de Mars – Tour Eiffel',
      'Pont de l’Alma',
      'Invalides',
      'Musée d’Orsay',
      'Saint-Michel Notre-Dame',
      'Gare d’Austerlitz',
      'Bibliothèque François Mitterrand',
      'Choisy-le-Roi',
      'Juvisy',
    ],
  },
  {
    key: 'D',
    num: 'D',
    bg: '#008B5B',
    fg: '#ffffff',
    st: [
      'Orry-la-Ville – Creil',
      'Saint-Denis',
      'Stade de France – Saint-Denis',
      'Gare du Nord',
      'Châtelet – Les Halles',
      'Gare de Lyon',
      'Maisons-Alfort – Alfortville',
      'Villeneuve-Saint-Georges',
      'Juvisy / Melun',
    ],
  },
  {
    key: 'E',
    num: 'E',
    bg: '#B94E9A',
    fg: '#ffffff',
    st: [
      'Nanterre-la-Folie',
      'La Défense',
      'Neuilly – Porte Maillot',
      'Haussmann – Saint-Lazare',
      'Magenta',
      'Rosa Parks',
      'Pantin',
      'Noisy-le-Sec',
      'Chelles / Tournan',
    ],
  },
];

const OPEN: Record<
  string,
  { air?: string[]; seine?: [string, string][]; tower?: [string, string] }
> = {
  '1': { air: ['Bastille'] },
  '2': { air: ['Barbès – Rochechouart', 'La Chapelle', 'Stalingrad', 'Jaurès'] },
  '5': {
    air: ['Quai de la Rapée', 'Gare d’Austerlitz'],
    seine: [['Quai de la Rapée', 'Gare d’Austerlitz']],
  },
  '6': {
    air: [
      'Passy',
      'Bir-Hakeim',
      'Dupleix',
      'La Motte-Picquet – Grenelle',
      'Cambronne',
      'Sèvres – Lecourbe',
      'Saint-Jacques',
      'Glacière',
      'Corvisart',
      'Nationale',
      'Chevaleret',
      'Quai de la Gare',
      'Bel-Air',
    ],
    seine: [
      ['Passy', 'Bir-Hakeim'],
      ['Quai de la Gare', 'Bercy'],
    ],
    tower: ['Passy', 'Bir-Hakeim'],
  },
  '8': {
    air: ['Créteil – L’Échat', 'Créteil – Université', 'Créteil – Préfecture', 'Pointe du Lac'],
  },
  '11': { air: ['Coteaux Beauclair'] },
  '13s': { air: ['Châtillon – Montrouge', 'Malakoff – Étienne Dolet'] },
  '13a': { air: ['Châtillon – Montrouge', 'Malakoff – Étienne Dolet'] },
  A: { air: ['Nanterre-Préfecture', 'Vincennes', 'Val de Fontenay'] },
  B: { air: ['Aulnay-sous-Bois', 'Cité Universitaire', 'Bourg-la-Reine', 'Antony / Saint-Rémy'] },
  C: {
    air: ['Javel', 'Champ de Mars – Tour Eiffel', 'Pont de l’Alma', 'Invalides', 'Choisy-le-Roi'],
    seine: [['Javel', 'Champ de Mars – Tour Eiffel']],
    tower: ['Javel', 'Champ de Mars – Tour Eiffel'],
  },
  D: { air: ['Saint-Denis', 'Stade de France – Saint-Denis', 'Maisons-Alfort – Alfortville'] },
  E: { air: ['Rosa Parks', 'Pantin', 'Noisy-le-Sec'] },
};

export const ROUTES: RouteDef[] = RAW_ROUTES.map((r) => {
  const open = OPEN[r.key] ?? {};
  return {
    key: r.key,
    num: r.num,
    bg: r.bg,
    fg: r.fg,
    branch: r.branch,
    open,
    stations: r.st.map((rawName) => {
      let name = rawName;
      let flag: '' | 'f' | 'b' = '';
      if (name.endsWith('>')) {
        flag = 'f';
        name = name.slice(0, -1);
      } else if (name.startsWith('<')) {
        flag = 'b';
        name = name.slice(1);
      }
      return {
        name,
        flag,
        air: (open.air ?? []).includes(name),
      };
    }),
  };
});

export function isRerLineNum(num: string): boolean {
  const up = num.trim().toUpperCase();
  return up === 'A' || up === 'B' || up === 'C' || up === 'D' || up === 'E';
}

const PNEUMATIC_LINES = new Set(['1', '4', '6', '11', '14']);

export function resolveTrainGlbFamily(lineNumOrKey: string): ParisGlbFamily {
  const upper = lineNumOrKey
    .trim()
    .toUpperCase()
    .replace(/^RER\s+/, '');
  if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D' || upper === 'E') {
    return `rer_generic_${upper}` as ParisGlbFamily;
  }
  if (PNEUMATIC_LINES.has(upper)) {
    return 'pneumatic_generic';
  }
  return 'steel_classic';
}

export function getGlbUrlsForFamily(family: ParisGlbFamily): {
  neutral: string;
  cab: string;
  tail: string;
} {
  if (family.startsWith('rer_generic_')) {
    return {
      neutral: `/models/train/${family}__neutral.glb`,
      cab: `/models/train/${family}__cab.glb`,
      tail: `/models/train/${family}__tail.glb`,
    };
  }
  return {
    neutral: `/models/train/${family}__neutral.glb`,
    cab: `/models/train/${family}__neutral__cab.glb`,
    tail: `/models/train/${family}__neutral__tail.glb`,
  };
}

export function computeLiveStepS(params: {
  prevFront: number;
  targetFront: number;
  curS: number;
  dir: 1 | -1;
  atStop: boolean;
  speedMps: number;
  dt: number;
}): number {
  const { prevFront, targetFront, curS, dir, atStop, speedMps, dt } = params;
  if (atStop) {
    const gap = targetFront - curS;
    if (Math.abs(gap) < 0.05) return targetFront;
    return curS + gap * Math.min(1, dt * 4.5);
  }
  const minBound =
    dir > 0 ? Math.min(prevFront, targetFront - 4) : Math.max(prevFront, targetFront + 4);
  const stopHoldBound = targetFront - dir * 5.5;
  const maxAdvance = Math.max(0.5, speedMps) * dt;
  const candidate = curS + dir * maxAdvance;
  if (dir > 0) {
    return Math.min(stopHoldBound, Math.max(minBound, candidate));
  }
  return Math.max(stopHoldBound, Math.min(minBound, candidate));
}

function normalizeStr(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveRideRouteKey(line?: string, dest?: string): string {
  if (!line) return '6';
  const cleaned = line
    .trim()
    .toLowerCase()
    .replace(/^rer\s+/, '');
  if (cleaned === '7') {
    const destNorm = normalizeStr(dest ?? '');
    if (destNorm.includes('ivry')) return '7i';
    return '7v';
  }
  if (cleaned === '13') {
    const destNorm = normalizeStr(dest ?? '');
    if (
      destNorm.includes('asnieres') ||
      destNorm.includes('courtilles') ||
      destNorm.includes('gennevilliers')
    ) {
      return '13a';
    }
    return '13s';
  }
  const found = ROUTES.find(
    (r) => r.key.toLowerCase() === cleaned || r.num.toLowerCase() === cleaned
  );
  return found ? found.key : '6';
}

function pairIs(p: [string, string], a: string, b: string): boolean {
  return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface GlbFamilyScenes {
  neutral: THREE.Group;
  cab: THREE.Group;
  tail: THREE.Group;
}

const gltfLoader = new GLTFLoader();
const glbFamilyCache = new Map<ParisGlbFamily, Promise<GlbFamilyScenes | null>>();

function normalizeGlbCarScene(raw: THREE.Group, rotateTail: boolean): THREE.Group {
  const wrapper = new THREE.Group();
  const model = raw.clone(true);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const scale = size.x > 0.1 ? L / size.x : 1;
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.scale.setScalar(scale);
  if (rotateTail) {
    const rotGroup = new THREE.Group();
    rotGroup.rotation.y = PI;
    rotGroup.add(model);
    wrapper.add(rotGroup);
  } else {
    wrapper.add(model);
  }
  return wrapper;
}

function loadGlbFamily(family: ParisGlbFamily): Promise<GlbFamilyScenes | null> {
  const existing = glbFamilyCache.get(family);
  if (existing) return existing;
  const urls = getGlbUrlsForFamily(family);
  const loadOne = (url: string) => gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
  const promise = Promise.all([
    loadOne(urls.neutral),
    loadOne(urls.cab).catch(() => null),
    loadOne(urls.tail).catch(() => null),
  ])
    .then(([neutral, cab, tail]) => ({
      neutral,
      cab: cab ?? neutral,
      tail: tail ?? cab ?? neutral,
    }))
    .catch((err) => {
      console.warn(`[paris-ride] Failed to load 3D train model ${family}:`, err);
      glbFamilyCache.delete(family);
      return null;
    });
  glbFamilyCache.set(family, promise);
  return promise;
}

export function mountParisRideView(
  container: HTMLElement,
  options: ParisRideOptions = {}
): ParisRideHandle {
  const root = document.createElement('div');
  root.className = 'paris-ride-overlay';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Vue 3D à bord du métro parisien');

  root.innerHTML = `
    <div class="paris-ride-stage" data-ride-stage></div>
    <div class="paris-ride-top">
      <div class="paris-ride-plaque" data-ride-plaque>Métro</div>
      <div class="paris-ride-top-right">
        <label class="paris-ride-card paris-ride-picker">
          <span class="paris-ride-badge" data-ride-badge>1</span>
          <select data-ride-route aria-label="Ligne de métro ou RER"></select>
        </label>
        <button type="button" class="paris-ride-btn paris-ride-btn--close" data-ride-exit>
          Carte 3D (Esc)
        </button>
      </div>
    </div>
    <div class="paris-ride-veil" data-ride-veil>Retournement au terminus</div>
    <div class="paris-ride-hud">
      <div class="paris-ride-card paris-ride-board" aria-live="polite">
        <div class="paris-ride-board-head">
          <span class="paris-ride-badge paris-ride-badge--sm" data-ride-board-badge>1</span>
          <div class="paris-ride-board-title">
            <div class="paris-ride-row"><span data-ride-now-label>À quai</span><b data-ride-now>—</b></div>
            <div class="paris-ride-row"><span>Prochain</span><b data-ride-next>—</b></div>
          </div>
          <button type="button" class="paris-ride-live-pill" data-ride-live aria-pressed="true" title="Synchronisation temps réel avec la simulation">
            <span class="paris-ride-live-dot" aria-hidden="true"></span>
            <span data-ride-live-label>EN DIRECT</span>
          </button>
        </div>
        <div class="paris-ride-row"><span>Direction</span><b data-ride-toward>—</b></div>
        <div class="paris-ride-row"><span>Voie</span><b data-ride-track>—</b></div>
        <div class="paris-ride-progress"><i data-ride-bar></i></div>
      </div>
      <div class="paris-ride-card paris-ride-controls" role="group" aria-label="Contrôles de caméra et lecture">
        <button type="button" class="paris-ride-btn" data-ride-view="vault" aria-pressed="false">Quai</button>
        <button type="button" class="paris-ride-btn" data-ride-view="ride" aria-pressed="true">Cabine</button>
        <button type="button" class="paris-ride-btn" data-ride-eiffel aria-pressed="false" hidden>Tour Eiffel</button>
        <button type="button" class="paris-ride-btn" data-ride-speed aria-label="Vitesse de lecture">1×</button>
        <button type="button" class="paris-ride-btn" data-ride-pause aria-pressed="false">Pause</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  const stage = root.querySelector('[data-ride-stage]') as HTMLElement;
  const veil = root.querySelector('[data-ride-veil]') as HTMLElement;
  const elPlaque = root.querySelector('[data-ride-plaque]') as HTMLElement;
  const badge = root.querySelector('[data-ride-badge]') as HTMLElement;
  const boardBadge = root.querySelector('[data-ride-board-badge]') as HTMLElement;
  const sel = root.querySelector('[data-ride-route]') as HTMLSelectElement;
  const exitBtn = root.querySelector('[data-ride-exit]') as HTMLButtonElement;
  const elNow = root.querySelector('[data-ride-now]') as HTMLElement;
  const elNowLabel = root.querySelector('[data-ride-now-label]') as HTMLElement;
  const elNext = root.querySelector('[data-ride-next]') as HTMLElement;
  const elToward = root.querySelector('[data-ride-toward]') as HTMLElement;
  const elTrack = root.querySelector('[data-ride-track]') as HTMLElement;
  const elBar = root.querySelector('[data-ride-bar]') as HTMLElement;
  const liveBtn = root.querySelector('[data-ride-live]') as HTMLButtonElement;
  const liveLabelEl = root.querySelector('[data-ride-live-label]') as HTMLElement;
  const eiffelBtn = root.querySelector('[data-ride-eiffel]') as HTMLButtonElement;
  const speedBtn = root.querySelector('[data-ride-speed]') as HTMLButtonElement;
  const pauseBtn = root.querySelector('[data-ride-pause]') as HTMLButtonElement;
  const viewButtons = Array.from(root.querySelectorAll('[data-ride-view]')) as HTMLButtonElement[];

  const isMobileGpu = isMobileGpuDevice();
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isMobileGpu,
      powerPreference: 'high-performance',
    });
  } catch {
    root.remove();
    options.onExit?.();
    return {
      setRoute: () => {},
      setView: () => {},
      syncFromSimulation: () => {},
      dispose: () => {},
    };
  }

  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  renderer.setPixelRatio(getOptimalPixelRatio(1.75, 1.4));
  renderer.setSize(
    container.clientWidth || window.innerWidth,
    container.clientHeight || window.innerHeight
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  stage.appendChild(renderer.domElement);
  const maxAniso = Math.min(isMobileGpu ? 4 : 8, renderer.capabilities.getMaxAnisotropy());

  const makeCanvas = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  const toTex = (c: HTMLCanvasElement, rx = 1, ry = 1, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    textures.push(t);
    return t;
  };

  const fitText = (
    g: CanvasRenderingContext2D,
    s: string,
    x: number,
    y: number,
    maxW: number,
    px: number,
    weight: string,
    family: string,
    color: string,
    align: CanvasTextAlign = 'center'
  ) => {
    let size = px;
    g.font = `${weight} ${size}px ${family}`;
    while (g.measureText(s).width > maxW && size > 10) {
      size -= 2;
      g.font = `${weight} ${size}px ${family}`;
    }
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillText(s, x, y);
  };

  const poly = (
    g: CanvasRenderingContext2D,
    pts: [number, number][],
    fill: string | CanvasGradient
  ) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };

  const noise = (
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    n: number,
    alpha: number,
    dark: boolean
  ) => {
    const v = dark ? 0 : 255;
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      g.fillRect(
        Math.random() * w,
        Math.random() * h,
        1 + Math.random() * 2,
        1 + Math.random() * 2
      );
    }
  };

  const mergeGeos = (list: THREE.BufferGeometry[]) => {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    for (const g0 of list) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      const u = g.attributes.uv ? g.attributes.uv.array : null;
      for (let i = 0; i < p.length; i++) {
        pos.push(p[i]);
        nor.push(n[i]);
      }
      if (u) {
        for (let i = 0; i < u.length; i++) uv.push(u[i]);
      } else {
        for (let i = 0; i < (p.length / 3) * 2; i++) uv.push(0);
      }
      if (g !== g0) g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geo;
  };

  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };

  /* ---------- Textures ---------- */
  function tileCanvas(bump: boolean) {
    const S = 512;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    const tw = 128;
    const th = 64;
    const gr = 4;
    const bv = 11;
    g.fillStyle = bump ? '#000' : '#9d978a';
    g.fillRect(0, 0, S, S);
    for (let r = 0; r < 8; r++) {
      const off = (r % 2) * 64;
      for (let k = -1; k < 5; k++) {
        const x = k * tw + off + gr / 2;
        const y = r * th + gr / 2;
        const w = tw - gr;
        const h = th - gr;
        const top: [number, number][] = [
          [x, y],
          [x + w, y],
          [x + w - bv, y + bv],
          [x + bv, y + bv],
        ];
        const bot: [number, number][] = [
          [x, y + h],
          [x + w, y + h],
          [x + w - bv, y + h - bv],
          [x + bv, y + h - bv],
        ];
        const lef: [number, number][] = [
          [x, y],
          [x + bv, y + bv],
          [x + bv, y + h - bv],
          [x, y + h],
        ];
        const rig: [number, number][] = [
          [x + w, y],
          [x + w - bv, y + bv],
          [x + w - bv, y + h - bv],
          [x + w, y + h],
        ];
        if (bump) {
          g.fillStyle = '#fff';
          g.fillRect(x + bv, y + bv, w - 2 * bv, h - 2 * bv);
          let gd = g.createLinearGradient(0, y, 0, y + bv);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, top, gd);
          gd = g.createLinearGradient(0, y + h, 0, y + h - bv);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, bot, gd);
          gd = g.createLinearGradient(x, 0, x + bv, 0);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, lef, gd);
          gd = g.createLinearGradient(x + w, 0, x + w - bv, 0);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, rig, gd);
        } else {
          const v = 236 + Math.floor(Math.random() * 14);
          g.fillStyle = `rgb(${v},${v - 3},${v - 11})`;
          g.fillRect(x, y, w, h);
          poly(g, top, 'rgba(255,255,255,0.6)');
          poly(g, lef, 'rgba(255,255,250,0.32)');
          poly(g, bot, 'rgba(70,55,30,0.22)');
          poly(g, rig, 'rgba(70,55,30,0.16)');
          const hl = g.createLinearGradient(x, y, x + w, y + h);
          hl.addColorStop(0, 'rgba(255,255,255,0.18)');
          hl.addColorStop(0.5, 'rgba(255,255,255,0)');
          hl.addColorStop(1, 'rgba(120,100,70,0.05)');
          g.fillStyle = hl;
          g.fillRect(x + bv, y + bv, w - 2 * bv, h - 2 * bv);
        }
      }
    }
    if (!bump) noise(g, S, S, 2200, 0.05, true);
    return c;
  }

  function concreteCanvas(base: string, spots: number, streak: boolean) {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < spots; i++) {
      const r = 6 + Math.random() * 40;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      const d = Math.random() < 0.5;
      gr.addColorStop(0, d ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(Math.random() * S, Math.random() * S);
      g.fillStyle = gr;
      g.fillRect(-r, -r, 2 * r, 2 * r);
      g.restore();
    }
    if (streak) {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        g.fillRect(Math.random() * S, 0, 1 + Math.random() * 3, S);
      }
    }
    noise(g, S, S, 3000, 0.12, true);
    noise(g, S, S, 1200, 0.05, false);
    return c;
  }

  function slabCanvas() {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = '#4b4844';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const v = 118 + Math.floor(Math.random() * 18);
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
      }
    }
    noise(g, S, S, 4000, 0.12, true);
    noise(g, S, S, 1500, 0.08, false);
    return c;
  }

  function posterCanvas(k: number) {
    const W = 900;
    const H = 540;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    const serif = 'Georgia,"Times New Roman",serif';
    const sans = 'Switzer,"Avenir Next",Futura,Arial,sans-serif';
    let title = '';
    let sub = '';
    let band = '';
    let ink = '';
    if (k === 0) {
      const gr = g.createLinearGradient(0, 0, 0, H * 0.62);
      gr.addColorStop(0, '#2b2d5c');
      gr.addColorStop(0.55, '#d8665a');
      gr.addColorStop(1, '#f4b860');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffe3a3';
      g.beginPath();
      g.arc(W * 0.66, H * 0.6, 92, PI, 0);
      g.fill();
      g.fillStyle = '#1d2c4f';
      g.fillRect(0, H * 0.6, W, H * 0.4);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(255,214,150,${0.55 - i * 0.05})`;
        const w = 170 - i * 16;
        g.fillRect(W * 0.66 - w / 2, H * 0.6 + 10 + i * 15, w, 4);
      }
      poly(
        g,
        [
          [180, 322],
          [390, 322],
          [360, 350],
          [205, 350],
        ],
        '#0f1730'
      );
      poly(
        g,
        [
          [285, 318],
          [285, 170],
          [365, 318],
        ],
        '#f6ead0'
      );
      poly(
        g,
        [
          [278, 318],
          [278, 200],
          [215, 318],
        ],
        '#e9d7b3'
      );
      title = 'CROISIÈRES DU SOIR';
      sub = 'Départs chaque jeudi depuis le quai n° 3';
      band = '#141c36';
      ink = '#f6ead0';
    } else if (k === 1) {
      g.fillStyle = '#2f5d46';
      g.fillRect(0, 0, W, H);
      const cols = ['#7fb58a', '#cfe3b8', '#4f8a63', '#e8efd2'];
      for (let i = 0; i < 7; i++) {
        g.fillStyle = cols[i % 4];
        g.beginPath();
        g.arc(W / 2, H * 0.78, 380 - i * 52, PI, 0);
        g.fill();
      }
      for (let i = 0; i < 10; i++) {
        g.save();
        g.translate(90 + i * 80, 120 + (i % 2) * 40);
        g.rotate((i % 2 ? 1 : -1) * 0.5);
        g.fillStyle = i % 2 ? '#1e3f2f' : '#a9cf8f';
        g.beginPath();
        g.ellipse(0, 0, 22, 58, 0, 0, 2 * PI);
        g.fill();
        g.restore();
      }
      title = 'LE JARDIN D’HIVER';
      sub = 'Serres ouvertes jusqu’à minuit';
      band = '#1b3528';
      ink = '#f3ecd4';
    } else if (k === 2) {
      const gr = g.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, 520);
      gr.addColorStop(0, '#24386e');
      gr.addColorStop(1, '#060a18');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * 2 * PI;
        const b = a + PI / 28;
        poly(
          g,
          [
            [W / 2, H * 0.42],
            [W / 2 + Math.cos(a) * 900, H * 0.42 + Math.sin(a) * 900],
            [W / 2 + Math.cos(b) * 900, H * 0.42 + Math.sin(b) * 900],
          ],
          i % 2 ? 'rgba(255,214,110,0.16)' : 'rgba(255,255,255,0.03)'
        );
      }
      g.fillStyle = '#ffd56a';
      g.beginPath();
      g.arc(W / 2, H * 0.42, 58, 0, 2 * PI);
      g.fill();
      g.strokeStyle = '#ffd56a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(W / 2, H * 0.42, 86, 0, 2 * PI);
      g.stroke();
      title = 'EXPOSITION DES LUMIÈRES';
      sub = 'Palais d’Été · entrée libre le dimanche';
      band = '#0b1126';
      ink = '#ffd56a';
    } else if (k === 3) {
      g.fillStyle = '#efe2c6';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 14; i++) {
        const a = PI + (i / 13) * PI;
        poly(
          g,
          [
            [W / 2, 330],
            [W / 2 + Math.cos(a - 0.06) * 600, 330 + Math.sin(a - 0.06) * 600],
            [W / 2 + Math.cos(a + 0.06) * 600, 330 + Math.sin(a + 0.06) * 600],
          ],
          'rgba(214,150,70,0.22)'
        );
      }
      g.fillStyle = '#6b3b25';
      g.beginPath();
      g.ellipse(W / 2, 370, 190, 26, 0, 0, 2 * PI);
      g.fill();
      g.fillStyle = '#8a4b2c';
      g.beginPath();
      g.moveTo(W / 2 - 130, 250);
      g.lineTo(W / 2 + 130, 250);
      g.quadraticCurveTo(W / 2 + 120, 365, W / 2, 368);
      g.quadraticCurveTo(W / 2 - 120, 365, W / 2 - 130, 250);
      g.fill();
      g.strokeStyle = '#8a4b2c';
      g.lineWidth = 18;
      g.beginPath();
      g.arc(W / 2 + 138, 295, 36, -PI / 2, PI / 2);
      g.stroke();
      g.strokeStyle = '#6b3b25';
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(W / 2 + i * 55, 228);
        g.bezierCurveTo(W / 2 + i * 55 - 30, 190, W / 2 + i * 55 + 30, 160, W / 2 + i * 55, 110);
        g.stroke();
      }
      title = 'CAFÉ L’AURORE';
      sub = 'Le premier café du matin, servi dès 5 h';
      band = '#3c2316';
      ink = '#efe2c6';
    } else {
      g.fillStyle = '#1a0d0f';
      g.fillRect(0, 0, W, H);
      const sp = g.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, 260);
      sp.addColorStop(0, 'rgba(255,230,170,0.55)');
      sp.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = sp;
      g.fillRect(0, 0, W, H);
      for (const side of [0, 1]) {
        for (let i = 0; i < 7; i++) {
          const x = side ? W - 40 - i * 34 : i * 34;
          const gr = g.createLinearGradient(x, 0, x + 34, 0);
          gr.addColorStop(0, '#5c1016');
          gr.addColorStop(0.5, '#b3262f');
          gr.addColorStop(1, '#5c1016');
          g.fillStyle = gr;
          g.fillRect(x, 0, 40, H);
        }
      }
      g.fillStyle = '#d4a441';
      g.fillRect(0, 0, W, 44);
      for (let i = 0; i < 15; i++) {
        g.beginPath();
        g.arc(30 + i * 60, 44, 30, 0, PI);
        g.fill();
      }
      g.fillStyle = '#f4dca0';
      g.beginPath();
      g.arc(W / 2, H * 0.5, 34, 0, 2 * PI);
      g.fill();
      title = 'THÉÂTRE DU MIDI';
      sub = 'Ce soir : « La Lune en retard »';
      band = '#2a0f12';
      ink = '#e9c46a';
    }
    g.fillStyle = band;
    g.fillRect(0, H - 138, W, 138);
    g.fillStyle = ink;
    g.fillRect(36, H - 138, W - 72, 3);
    fitText(g, title, W / 2, H - 66, W - 90, 60, '700', serif, ink);
    fitText(g, sub, W / 2, H - 24, W - 120, 28, '500', sans, ink);
    return c;
  }

  function plaqueCanvas(text: string) {
    const W = 1024;
    const H = 192;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#1d3f7a';
    g.fillRect(0, 0, W, H);
    const gl = g.createLinearGradient(0, 0, 0, H);
    gl.addColorStop(0, 'rgba(255,255,255,0.12)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0)');
    gl.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.strokeRect(16, 16, W - 32, H - 32);
    fitText(
      g,
      text,
      W / 2,
      H / 2 + 34,
      W - 90,
      100,
      '600',
      'Switzer,"Arial Narrow",Arial,sans-serif',
      '#ffffff'
    );
    return c;
  }

  function signCanvas(text: string, bg: string, fg: string) {
    const W = 512;
    const H = 128;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    fitText(g, text, W / 2, H / 2 + 22, W - 50, 62, '600', 'Switzer,Arial,sans-serif', fg);
    return c;
  }

  function destCanvas(text: string) {
    const W = 512;
    const H = 96;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#0d0d0d';
    g.fillRect(0, 0, W, H);
    fitText(g, text, W / 2, H / 2 + 18, W - 30, 52, '600', 'Switzer,Arial,sans-serif', '#ffb547');
    return c;
  }

  function woodCanvas() {
    const W = 256;
    const H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#6e4426';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,8' : '160,110,60'},${Math.random() * 0.25})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * H;
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
      g.stroke();
    }
    return c;
  }

  function classCanvas() {
    const S = 128;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = '#e9dcb4';
    g.beginPath();
    g.arc(64, 64, 60, 0, 2 * PI);
    g.fill();
    g.strokeStyle = '#7a5b22';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 64, 52, 0, 2 * PI);
    g.stroke();
    fitText(g, '1', 64, 94, 100, 84, '600', 'Georgia,serif', '#5a1414');
    return c;
  }

  function badgeCanvas(r: RouteDef) {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 4, 0, 2 * PI);
    g.fill();
    g.fillStyle = r.bg;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 16, 0, 2 * PI);
    g.fill();
    fitText(
      g,
      r.num,
      S / 2,
      S / 2 + (r.num.length > 2 ? 34 : 52),
      S - 70,
      r.num.length > 2 ? 96 : 150,
      '600',
      'Switzer,Arial,sans-serif',
      r.fg
    );
    return c;
  }

  const tileMap = toTex(tileCanvas(false), 1 / 0.6, 1 / 0.6);
  const tileBump = toTex(tileCanvas(true), 1 / 0.6, 1 / 0.6, false);
  const tunnelTex = toTex(concreteCanvas('#3a352f', 90, true), 1 / 4, 1 / 4);
  const bedTex = toTex(concreteCanvas('#2e2a26', 120, false), 1 / 3, 1 / 3);
  const slabTex = toTex(slabCanvas(), 1 / 1.2, 1 / 1.2);
  const groundTex = toTex(concreteCanvas('#77716a', 60, false), 1 / 6, 1 / 6);
  const classTex = toTex(classCanvas());

  /* ---------- Materials ---------- */
  const M = {
    tile: trackMat(
      new THREE.MeshStandardMaterial({
        map: tileMap,
        bumpMap: tileBump,
        bumpScale: 0.35,
        roughness: 0.2,
        metalness: 0,
        envMapIntensity: 0.9,
        side: THREE.DoubleSide,
      })
    ),
    tunnel: trackMat(
      new THREE.MeshStandardMaterial({
        map: tunnelTex,
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.04,
        side: THREE.BackSide,
      })
    ),
    bed: trackMat(
      new THREE.MeshStandardMaterial({
        map: bedTex,
        roughness: 0.95,
        envMapIntensity: 0.12,
        side: THREE.DoubleSide,
      })
    ),
    slab: trackMat(
      new THREE.MeshStandardMaterial({
        map: slabTex,
        roughness: 0.55,
        envMapIntensity: 0.35,
      })
    ),
    platformFace: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x2f2b27, roughness: 0.9, envMapIntensity: 0.15 })
    ),
    edge: trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd9d1bd, roughness: 0.5, envMapIntensity: 0.4 })
    ),
    steel: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9a9894,
        roughness: 0.32,
        metalness: 0.85,
        envMapIntensity: 1,
        side: THREE.DoubleSide,
      })
    ),
    third: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5b5148,
        roughness: 0.6,
        metalness: 0.4,
        envMapIntensity: 0.3,
        side: THREE.DoubleSide,
      })
    ),
    sleeper: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3b342c, roughness: 0.95, envMapIntensity: 0.15 })
    ),
    frame: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc6a45e,
        roughness: 0.28,
        metalness: 0.1,
        envMapIntensity: 0.9,
        side: THREE.DoubleSide,
      })
    ),
    cream: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xeee7d6,
        roughness: 0.3,
        envMapIntensity: 0.7,
        side: THREE.DoubleSide,
      })
    ),
    housing: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x23262a,
        roughness: 0.5,
        metalness: 0.6,
        envMapIntensity: 0.5,
      })
    ),
    lamp: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.95, 2.5) })),
    tunnelLamp: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.3) })),
    paintGreen: trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x24513c,
        roughness: 0.42,
        metalness: 0.05,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        envMapIntensity: 0.9,
      })
    ),
    paintRed: trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x7e1f1d,
        roughness: 0.42,
        metalness: 0.05,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        envMapIntensity: 0.9,
      })
    ),
    roof: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b3d3f,
        roughness: 0.6,
        metalness: 0.2,
        envMapIntensity: 0.5,
      })
    ),
    under: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x171717,
        roughness: 0.8,
        metalness: 0.3,
        envMapIntensity: 0.3,
      })
    ),
    wood: trackMat(
      new THREE.MeshStandardMaterial({
        map: toTex(woodCanvas(), 1, 1),
        roughness: 0.4,
        envMapIntensity: 0.5,
        side: THREE.DoubleSide,
      })
    ),
    floor: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3a2a1f, roughness: 0.7, envMapIntensity: 0.3 })
    ),
    ceiling: trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.9, 1.65, 1.2),
        side: THREE.DoubleSide,
      })
    ),
    glass: trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x9fb3b0,
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.2,
        envMapIntensity: 1.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    ),
    stripe: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8c38a,
        roughness: 0.3,
        metalness: 0.4,
        envMapIntensity: 0.9,
      })
    ),
    chrome: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd6d6d6,
        roughness: 0.15,
        metalness: 1,
        envMapIntensity: 1.2,
      })
    ),
    rubber: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, envMapIntensity: 0.1 })
    ),
    head: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3.2) })),
    tail: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.12, 0.08) })),
    viaduct: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9a9184,
        roughness: 0.85,
        envMapIntensity: 0.3,
        side: THREE.DoubleSide,
      })
    ),
    iron: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2f3d35,
        roughness: 0.5,
        metalness: 0.6,
        envMapIntensity: 0.5,
      })
    ),
    canopy: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x41524a,
        roughness: 0.6,
        metalness: 0.3,
        envMapIntensity: 0.4,
        side: THREE.DoubleSide,
      })
    ),
    ground: trackMat(
      new THREE.MeshStandardMaterial({
        map: groundTex,
        roughness: 0.95,
        envMapIntensity: 0.2,
        side: THREE.DoubleSide,
      })
    ),
    water: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3c5a5e,
        roughness: 0.12,
        metalness: 0.3,
        envMapIntensity: 1.2,
        side: THREE.DoubleSide,
      })
    ),
    building: trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.85, envMapIntensity: 0.3 })
    ),
    zinc: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5f666d,
        roughness: 0.5,
        metalness: 0.4,
        envMapIntensity: 0.4,
      })
    ),
    mound: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x56603f, roughness: 1, envMapIntensity: 0.15 })
    ),
    plug: trackMat(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })),
    tower: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6b5642,
        roughness: 0.58,
        metalness: 0.45,
        envMapIntensity: 0.55,
        side: THREE.DoubleSide,
      })
    ),
    towerBeacon: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffdf99,
      })
    ),
  };

  /* ---------- Train geometry ---------- */
  function rectPath(x0: number, y0: number, x1: number, y1: number) {
    const p = new THREE.Path();
    p.moveTo(x0, y0);
    p.lineTo(x1, y0);
    p.lineTo(x1, y1);
    p.lineTo(x0, y1);
    p.lineTo(x0, y0);
    return p;
  }

  function rrPath(x0: number, y0: number, x1: number, y1: number, r: number) {
    const p = new THREE.Path();
    p.moveTo(x0 + r, y0);
    p.lineTo(x1 - r, y0);
    p.quadraticCurveTo(x1, y0, x1, y0 + r);
    p.lineTo(x1, y1 - r);
    p.quadraticCurveTo(x1, y1, x1 - r, y1);
    p.lineTo(x0 + r, y1);
    p.quadraticCurveTo(x0, y1, x0, y1 - r);
    p.lineTo(x0, y0 + r);
    p.quadraticCurveTo(x0, y0, x0 + r, y0);
    return p;
  }

  const sideShape = new THREE.Shape();
  sideShape.moveTo(0, 0);
  sideShape.lineTo(L, 0);
  sideShape.lineTo(L, SH);
  sideShape.lineTo(0, SH);
  WINS.forEach((w) => sideShape.holes.push(rrPath(w[0], WY[0], w[1], WY[1], 0.08)));
  DOORS.forEach((d) => sideShape.holes.push(rectPath(d[0], DY[0], d[1], DY[1])));

  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.lineTo(0.66, 0);
  leafShape.lineTo(0.66, 1.92);
  leafShape.lineTo(0, 1.92);
  leafShape.holes.push(rrPath(0.11, 1.0, 0.55, 1.76, 0.05));

  function endShape(cab: boolean) {
    const s = new THREE.Shape();
    s.moveTo(-CW / 2, 0);
    s.lineTo(CW / 2, 0);
    s.lineTo(CW / 2, SH);
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      s.lineTo(CW / 2 - CW * t, SH + 0.36 * Math.sin(PI * t));
    }
    if (cab) {
      s.holes.push(rrPath(-1.02, 1.05, -0.14, 1.85, 0.06));
      s.holes.push(rrPath(0.14, 1.05, 1.02, 1.85, 0.06));
    } else {
      s.holes.push(rectPath(-0.38, 0.08, 0.38, 1.95));
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 6 });
    g.rotateY(PI / 2);
    return g;
  }

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-CW / 2 - 0.04, 0);
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    roofShape.lineTo(-CW / 2 - 0.04 + (CW + 0.08) * t, i === 24 ? 0 : 0.4 * Math.sin(PI * t));
  }

  const wheelParts: THREE.BufferGeometry[] = [];
  [-0.72, 0.72].forEach((z) => {
    const w = new THREE.CylinderGeometry(WR, WR, 0.1, 24);
    w.rotateX(PI / 2);
    w.translate(0, 0, z);
    wheelParts.push(w);
    const f = new THREE.CylinderGeometry(WR + 0.035, WR + 0.035, 0.025, 24);
    f.rotateX(PI / 2);
    f.translate(0, 0, z - Math.sign(z) * 0.06);
    wheelParts.push(f);
    wheelParts.push(box(0.09, 0.62, 0.02, 0, 0, z + Math.sign(z) * 0.06));
  });
  const axGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.56, 10);
  axGeo.rotateX(PI / 2);
  wheelParts.push(axGeo);

  const seatParts: THREE.BufferGeometry[] = [];
  [
    [3.05, 5.95],
    [7.65, 10.55],
  ].forEach(([b0, b1]) =>
    [-0.66, 0.66].forEach((z) => {
      [
        [b0 + 0.32, b0 + 0.07],
        [b1 - 0.32, b1 - 0.07],
      ].forEach(([sx, bx]) => {
        seatParts.push(box(0.46, 0.07, 0.92, sx, BY + 0.47, z));
        seatParts.push(box(0.06, 0.55, 0.92, bx, BY + 0.78, z));
        seatParts.push(box(0.4, 0.4, 0.8, sx, BY + 0.24, z));
      });
    })
  );
  [
    [0.35, 1.35],
    [12.25, 13.25],
  ].forEach(([b0, b1]) =>
    [-0.85, 0.85].forEach((z) => {
      seatParts.push(box(b1 - b0, 0.07, 0.42, (b0 + b1) / 2, BY + 0.47, z));
      seatParts.push(box(b1 - b0, 0.5, 0.05, (b0 + b1) / 2, BY + 0.76, z + Math.sign(z) * 0.2));
    })
  );

  const G = {
    side: trackGeo(
      new THREE.ExtrudeGeometry(sideShape, { depth: 0.05, bevelEnabled: false, curveSegments: 6 })
    ),
    lining: trackGeo(
      new THREE.ExtrudeGeometry(sideShape, { depth: 0.02, bevelEnabled: false, curveSegments: 6 })
    ),
    sideGlass: trackGeo(
      mergeGeos(
        WINS.map((w) => {
          const g = new THREE.PlaneGeometry(w[1] - w[0] + 0.06, WY[1] - WY[0] + 0.06);
          g.translate((w[0] + w[1]) / 2, (WY[0] + WY[1]) / 2, 0);
          return g;
        })
      )
    ),
    leaf: trackGeo(
      new THREE.ExtrudeGeometry(leafShape, { depth: 0.035, bevelEnabled: false, curveSegments: 5 })
    ),
    leafGlass: trackGeo(
      (() => {
        const g = new THREE.PlaneGeometry(0.48, 0.8);
        g.translate(0.33, 1.38, 0.0175);
        return g;
      })()
    ),
    endCab: trackGeo(endShape(true)),
    endMid: trackGeo(endShape(false)),
    cabGlass: trackGeo(
      mergeGeos(
        [-0.58, 0.58].map((z) => {
          const g = new THREE.PlaneGeometry(0.94, 0.86);
          g.rotateY(PI / 2);
          g.translate(0, 1.45, z);
          return g;
        })
      )
    ),
    roof: trackGeo(
      (() => {
        const g = new THREE.ExtrudeGeometry(roofShape, { depth: L + 0.06, bevelEnabled: false });
        g.rotateY(PI / 2);
        g.translate(-0.03, 0, 0);
        return g;
      })()
    ),
    vents: trackGeo(mergeGeos([2.2, 6.8, 11.4].map((x) => box(0.9, 0.12, 0.6, x, 0.43, 0)))),
    floor: trackGeo(box(L, 0.06, CW - 0.1, L / 2, BY + 0.03, 0)),
    ceil: trackGeo(
      (() => {
        const g = new THREE.PlaneGeometry(L - 0.3, CW - 0.2);
        g.rotateX(PI / 2);
        g.translate(L / 2, BY + SH - 0.015, 0);
        return g;
      })()
    ),
    under: trackGeo(
      mergeGeos([
        box(L - 1.2, 0.3, CW - 0.5, L / 2, BY - 0.18, 0),
        box(2.2, 0.35, 0.8, L / 2 - 1.8, BY - 0.45, 0.4),
        box(1.6, 0.3, 0.7, L / 2 + 2.2, BY - 0.43, -0.45),
        box(1.0, 0.28, 0.5, L / 2 + 0.2, BY - 0.42, 0.6),
      ])
    ),
    bogie: trackGeo(
      mergeGeos([
        box(2.8, 0.22, 0.12, 0, 0.5, 0.92),
        box(2.8, 0.22, 0.12, 0, 0.5, -0.92),
        box(0.36, 0.2, 1.84, 0, 0.52, 0),
        box(0.5, 0.2, 0.3, 0, 0.68, 0.92),
        box(0.5, 0.2, 0.3, 0, 0.68, -0.92),
        box(0.5, 0.06, 0.18, 0, 0.12, 1.2),
      ])
    ),
    axle: trackGeo(mergeGeos(wheelParts)),
    seats: trackGeo(mergeGeos(seatParts)),
    poles: trackGeo(
      mergeGeos(
        DOORS.map((d) => {
          const c = new THREE.CylinderGeometry(0.022, 0.022, SH - 0.1, 10);
          c.translate((d[0] + d[1]) / 2, BY + SH / 2, 0);
          return c;
        })
      )
    ),
    stripe: trackGeo(
      mergeGeos(
        [
          [0, DOORS[0][0]],
          [DOORS[0][1], DOORS[1][0]],
          [DOORS[1][1], DOORS[2][0]],
          [DOORS[2][1], L],
        ].map(([a, b]) => box(b - a, 0.035, 0.012, (a + b) / 2, 0, 0))
      )
    ),
    gangway: trackGeo(
      mergeGeos([
        box(GAP + 0.1, 0.08, 1.0, 0, BY + 2.0, 0),
        box(GAP + 0.1, 0.06, 1.0, 0, BY + 0.03, 0),
        box(GAP + 0.1, 2.0, 0.06, 0, BY + 1.0, 0.5),
        box(GAP + 0.1, 2.0, 0.06, 0, BY + 1.0, -0.5),
      ])
    ),
  };

  function buildCar(
    paint: THREE.Material,
    frontCab: boolean,
    rearCab: boolean,
    firstClass: boolean
  ) {
    const car = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      car.add(m);
      return m;
    };
    add(G.side, paint, 0, BY, CW / 2 - 0.05);
    add(G.side, paint, 0, BY, -CW / 2);
    add(G.lining, M.wood, 0, BY, CW / 2 - 0.075);
    add(G.lining, M.wood, 0, BY, -CW / 2 + 0.055);
    add(G.sideGlass, M.glass, 0, BY, CW / 2 - 0.0525);
    add(G.sideGlass, M.glass, 0, BY, -CW / 2 + 0.0525);
    add(G.stripe, M.stripe, 0, BY + 0.9, CW / 2 + 0.006);
    add(G.stripe, M.stripe, 0, BY + 0.9, -CW / 2 - 0.006);
    add(G.roof, M.roof, 0, BY + SH, 0);
    add(G.vents, M.roof, 0, BY + SH, 0);
    add(G.floor, M.floor);
    add(G.ceil, M.ceiling);
    add(G.under, M.under);
    add(G.seats, M.wood);
    add(G.poles, M.chrome);
    add(rearCab ? G.endCab : G.endMid, paint, 0, BY, 0);
    add(frontCab ? G.endCab : G.endMid, paint, L - 0.05, BY, 0);
    if (rearCab) add(G.cabGlass, M.glass, 0.025, BY, 0);
    if (frontCab) add(G.cabGlass, M.glass, L - 0.025, BY, 0);

    const axles: THREE.Mesh[] = [];
    [2.4, L - 2.4].forEach((bx) => {
      add(G.bogie, M.under, bx, 0, 0);
      [-0.95, 0.95].forEach((o) => axles.push(add(G.axle, M.under, bx + o, WR, 0)));
    });

    const leaves: Array<{ obj: THREE.Group; base: number; dir: number }> = [];
    [1, -1].forEach((s) =>
      DOORS.forEach((d) => {
        const c = (d[0] + d[1]) / 2;
        [
          [c - 0.66, -1],
          [c, 1],
        ].forEach(([base, dir]) => {
          const lg = new THREE.Group();
          lg.add(new THREE.Mesh(G.leaf, paint));
          lg.add(new THREE.Mesh(G.leafGlass, M.glass));
          lg.position.set(base, BY + 0.08, s > 0 ? CW / 2 + 0.004 : -CW / 2 - 0.039);
          car.add(lg);
          if (s > 0) leaves.push({ obj: lg, base, dir });
        });
      })
    );

    if (firstClass) {
      const classGeo = trackGeo(new THREE.PlaneGeometry(0.34, 0.34));
      const classMat = trackMat(
        new THREE.MeshStandardMaterial({ map: classTex, roughness: 0.3, transparent: true })
      );
      [1, -1].forEach((s) =>
        [4.5, 9.1].forEach((x) => {
          const p = new THREE.Mesh(classGeo, classMat);
          p.position.set(x, BY + 0.55, s * (CW / 2 + 0.008));
          if (s < 0) p.rotation.y = PI;
          car.add(p);
        })
      );
    }

    car.userData = { axles, leaves };
    return car;
  }

  /* ---------- Scene & Lighting ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050404);
  scene.fog = new THREE.FogExp2(0x0c0a08, 0.0085);
  const camera = new THREE.PerspectiveCamera(
    55,
    (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
    0.05,
    isMobileGpu ? 950 : 1400
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 70;
  controls.minDistance = 0.4;
  controls.screenSpacePanning = true;

  let envTarget: THREE.WebGLRenderTarget | null = null;
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const envBoxGeo = new THREE.BoxGeometry(30, 12, 30);
    const envBoxMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.08, 0.066, 0.052),
      side: THREE.BackSide,
    });
    const envStripGeo = new THREE.BoxGeometry(26, 0.2, 0.5);
    const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.5, 3.8) });
    const envFloorGeo = new THREE.PlaneGeometry(30, 30);
    const envFloorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.2, 0.17) });

    es.add(new THREE.Mesh(envBoxGeo, envBoxMat));
    for (let i = -2; i <= 2; i++) {
      const m = new THREE.Mesh(envStripGeo, sm);
      m.position.set(0, 5.6, i * 2.6);
      es.add(m);
    }
    const fl = new THREE.Mesh(envFloorGeo, envFloorMat);
    fl.rotation.x = -PI / 2;
    fl.position.y = -5.5;
    es.add(fl);
    envTarget = pm.fromScene(es, 0.035);
    scene.environment = envTarget.texture;
    envBoxGeo.dispose();
    envBoxMat.dispose();
    envStripGeo.dispose();
    sm.dispose();
    envFloorGeo.dispose();
    envFloorMat.dispose();
    pm.dispose();
  }

  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x3a2c1e, 0.42);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 0);
  scene.add(sun);
  scene.add(sun.target);

  const sky = (() => {
    const c = makeCanvas(8, 256);
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#6f9cc6');
    gr.addColorStop(0.45, '#b7cde0');
    gr.addColorStop(0.52, '#e3e6e4');
    gr.addColorStop(1, '#cfcac0');
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    const skyGeo = trackGeo(new THREE.SphereGeometry(1150, 32, 16));
    const skyMat = trackMat(
      new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    const m = new THREE.Mesh(skyGeo, skyMat);
    m.renderOrder = -1;
    m.visible = false;
    scene.add(m);
    return m;
  })();

  /* ---------- Station module geometries ---------- */
  function archPts(halfW: number, y0: number, h: number, seg: number, walls: boolean) {
    const pts: [number, number][] = [];
    if (walls) pts.push([halfW, 0]);
    for (let i = 0; i <= seg; i++) {
      const t = (PI * i) / seg;
      pts.push([halfW * Math.cos(t), y0 + h * Math.sin(t)]);
    }
    if (walls) pts.push([-halfW, 0]);
    return pts;
  }

  function profileTube(profile: [number, number][], x0: number, x1: number) {
    const lens = [0];
    for (let i = 1; i < profile.length; i++) {
      lens.push(
        lens[i - 1] +
          Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1])
      );
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const n = profile.length;
    [x0, x1].forEach((x) => {
      for (let i = 0; i < n; i++) {
        pos.push(x, profile[i][1], profile[i][0]);
        uv.push(x, lens[i]);
      }
    });
    for (let i = 0; i < n - 1; i++) idx.push(i, n + i, i + 1, i + 1, n + i, n + i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function wallPatch(xc: number, hw: number, y1: number, y2: number, side: number, inset: number) {
    const a = AW - inset;
    const b = AH - inset;
    const cl = (v: number) => Math.max(-1, Math.min(1, v));
    const t1 = Math.asin(cl((y1 - AY) / AH));
    const t2 = Math.asin(cl((y2 - AY) / AH));
    const seg = 16;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= 1; j++) {
      const x = xc - hw + 2 * hw * j;
      for (let i = 0; i <= seg; i++) {
        const t = t1 + ((t2 - t1) * i) / seg;
        pos.push(x, AY + b * Math.sin(t), side * a * Math.cos(t));
        uv.push(side > 0 ? 1 - j : j, i / seg);
      }
    }
    for (let i = 0; i < seg; i++) {
      const n = seg + 1;
      idx.push(i, n + i, i + 1, i + 1, n + i, n + i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
    const u = g.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * su, u.getY(i) * sv);
    return g;
  }

  function plane(w: number, h: number, ry: number, x: number, y: number, z: number) {
    const g = new THREE.PlaneGeometry(w, h);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  }

  const portalPts: [number, number][] = [
    [-AW, 0],
    [-AW, AY],
  ];
  for (let i = 1; i <= 60; i++) {
    const t = PI - (PI * i) / 60;
    portalPts.push([AW * Math.cos(t), AY + AH * Math.sin(t)]);
  }
  portalPts.push([AW, 0], [TW, 0], [TW, TY]);
  for (let i = 1; i <= 40; i++) {
    const t = (PI * i) / 40;
    portalPts.push([TW * Math.cos(t), TY + TH * Math.sin(t)]);
  }
  portalPts.push([-TW, 0]);
  const portalPg = new THREE.ShapeGeometry(
    new THREE.Shape(portalPts.map((p) => new THREE.Vector2(p[0], p[1])))
  );
  const portalPa = portalPg.clone();
  portalPa.rotateY(PI / 2);
  portalPa.translate(-HALF, 0, 0);
  const portalPb = portalPg.clone();
  portalPb.rotateY(-PI / 2);
  portalPb.translate(HALF, 0, 0);
  portalPg.dispose();

  const wPlat = AW - PE;
  const platBodies: THREE.BufferGeometry[] = [];
  const platTops: THREE.BufferGeometry[] = [];
  const platEdges: THREE.BufferGeometry[] = [];
  [-1, 1].forEach((s) => {
    const zc = s * (PE + wPlat / 2);
    platBodies.push(box(SL, AY, wPlat, 0, AY / 2, zc));
    const t = new THREE.PlaneGeometry(SL, wPlat);
    scaleUV(t, SL, wPlat);
    t.rotateX(-PI / 2);
    t.translate(0, AY + 0.002, zc);
    platTops.push(t);
    platEdges.push(box(SL, 0.03, 0.38, 0, AY + 0.012, s * (PE + 0.19)));
  });

  const railsStn: THREE.BufferGeometry[] = [];
  const thirdStn: THREE.BufferGeometry[] = [];
  const sleepersStn: THREE.BufferGeometry[] = [];
  [1.8, -1.8].forEach((zc) => {
    [-0.7175, 0.7175].forEach((o) => railsStn.push(box(SL, 0.1, 0.07, 0, 0.17, zc + o)));
    thirdStn.push(box(SL, 0.09, 0.12, 0, 0.28, zc - Math.sign(zc) * 1.45));
    for (let x = -HALF + 0.35; x < HALF; x += 0.7)
      sleepersStn.push(box(0.24, 0.12, 2.5, x, 0.06, zc));
  });

  const posterX = [-48, -24, 0, 24, 48];
  const plaqueX = [-36, -12, 12, 36, -58, 58];
  const framesStn: THREE.BufferGeometry[] = [];
  const postersStn: THREE.BufferGeometry[][] = [[], [], [], [], []];
  const pframesStn: THREE.BufferGeometry[] = [];
  const plaquesStn: THREE.BufferGeometry[] = [];
  [-1, 1].forEach((s) => {
    posterX.forEach((x, i) => {
      framesStn.push(wallPatch(x, 1.78, 1.8, 3.92, s, 0.012));
      postersStn[(i + (s > 0 ? 0 : 2)) % 5].push(wallPatch(x, 1.6, 1.92, 3.8, s, 0.03));
    });
    plaqueX.forEach((x) => {
      pframesStn.push(wallPatch(x, 1.72, 2.28, 3.02, s, 0.012));
      plaquesStn.push(wallPatch(x, 1.6, 2.35, 2.95, s, 0.03));
    });
    plaquesStn.push(plane(3.4, 0.64, (-s * PI) / 2, s * (HALF - 0.03), 5.6, s * 0.4));
    pframesStn.push(plane(4.75, 0.8, (-s * PI) / 2, s * (HALF - 0.015), 5.6, -s * 0.175));
  });

  const plinthsStn: THREE.BufferGeometry[] = [];
  const seatsStn: THREE.BufferGeometry[][] = [[], [], [], [], []];
  [-1, 1].forEach((s) =>
    posterX.forEach((x, bi) => {
      plinthsStn.push(box(3.4, 0.42, 0.5, x, AY + 0.21, s * 6.3));
      for (let i = 0; i < 5; i++) {
        seatsStn[(i + bi) % 5].push(box(0.5, 0.08, 0.44, x - 1.3 + i * 0.65, AY + 0.46, s * 6.27));
      }
    })
  );

  const housStn: THREE.BufferGeometry[] = [];
  const diffStn: THREE.BufferGeometry[] = [];
  const rodsStn: THREE.BufferGeometry[] = [];
  [-2.4, 2.4].forEach((z) => {
    for (let i = 0; i < 26; i++) {
      const x = -57.5 + i * 4.6;
      housStn.push(box(3.3, 0.12, 0.32, x, 5.75, z));
      diffStn.push(box(3.1, 0.03, 0.24, x, 5.68, z));
      [-1.3, 1.3].forEach((o) => {
        const c = new THREE.CylinderGeometry(0.01, 0.01, 0.5, 5);
        c.translate(x + o, 6.05, z);
        rodsStn.push(c);
      });
    }
  });

  const signsStn: THREE.BufferGeometry[] = [];
  const sframesStn: THREE.BufferGeometry[] = [];
  [
    [-20, 5.05],
    [20, -5.05],
  ].forEach(([x, z]) => {
    signsStn.push(plane(2, 0.5, PI / 2, x + 0.031, 4, z));
    signsStn.push(plane(2, 0.5, -PI / 2, x - 0.031, 4, z));
    sframesStn.push(box(0.05, 0.56, 2.06, x, 4, z));
    [-0.8, 0.8].forEach((o) => {
      const c = new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6);
      c.translate(x, 4.88, z + o);
      sframesStn.push(c);
    });
  });

  const colsAir: THREE.BufferGeometry[] = [];
  const lampsAir: THREE.BufferGeometry[] = [];
  const pfAir: THREE.BufferGeometry[] = [];
  const plAir: THREE.BufferGeometry[] = [];
  const pierAir: THREE.BufferGeometry[] = [];
  for (let x = -55; x <= 55; x += 10) {
    [-1, 1].forEach((s) => {
      const c = new THREE.CylinderGeometry(0.08, 0.1, 3.6, 10);
      c.translate(x, AY + 1.8, s * 6.95);
      colsAir.push(c);
    });
  }
  [-1, 1].forEach((s) => {
    lampsAir.push(box(SL - 12, 0.04, 0.2, 0, AY + 3.52, s * 4.3));
    [-45, -15, 15, 45].forEach((x) => {
      pfAir.push(plane(3.5, 0.82, s > 0 ? PI : 0, x, AY + 2.45, s * 6.99));
      plAir.push(plane(3.2, 0.6, s > 0 ? PI : 0, x, AY + 2.45, s * 6.97));
    });
  });
  for (let x = -60; x <= 60; x += 20) {
    [-1, 1].forEach((s) => pierAir.push(box(1.6, -GY - 1.3, 1.6, x, (GY - 1.3) / 2, s * 5.5)));
  }

  const STN = {
    vault: trackGeo(profileTube(archPts(AW, AY, AH, 120, false), -HALF, HALF)),
    portal: trackGeo(mergeGeos([portalPa, portalPb])),
    platBody: trackGeo(mergeGeos(platBodies)),
    platTop: trackGeo(mergeGeos(platTops)),
    edge: trackGeo(mergeGeos(platEdges)),
    bed: trackGeo(
      (() => {
        const b = new THREE.PlaneGeometry(SL, 14);
        scaleUV(b, SL, 14);
        b.rotateX(-PI / 2);
        return b;
      })()
    ),
    rails: trackGeo(mergeGeos(railsStn)),
    third: trackGeo(mergeGeos(thirdStn)),
    sleepers: trackGeo(mergeGeos(sleepersStn)),
    frames: trackGeo(mergeGeos(framesStn)),
    posters: postersStn.map((list) => trackGeo(mergeGeos(list))),
    pframes: trackGeo(mergeGeos(pframesStn)),
    plaques: trackGeo(mergeGeos(plaquesStn)),
    badges: trackGeo(
      mergeGeos(
        [-1, 1].map((s) => plane(0.6, 0.6, (-s * PI) / 2, s * (HALF - 0.03), 5.6, -s * 2.15))
      )
    ),
    plinths: trackGeo(mergeGeos(plinthsStn)),
    seats: seatsStn.map((list) => trackGeo(mergeGeos(list))),
    hous: trackGeo(mergeGeos(housStn)),
    diff: trackGeo(mergeGeos(diffStn)),
    rods: trackGeo(mergeGeos(rodsStn)),
    signs: trackGeo(mergeGeos(signsStn)),
    sframes: trackGeo(mergeGeos(sframesStn)),
    airDeck: trackGeo(box(SL + 0.2, 1.3, 14.8, 0, -0.65, 0)),
    airParapet: trackGeo(mergeGeos([-1, 1].map((s) => box(SL, 1.1, 0.18, 0, AY + 0.55, s * 7.25)))),
    canopy: trackGeo(mergeGeos([-1, 1].map((s) => box(SL - 6, 0.12, 4.5, 0, AY + 3.6, s * 5.15)))),
    cols: trackGeo(mergeGeos(colsAir)),
    airLamps: trackGeo(mergeGeos(lampsAir)),
    airPf: trackGeo(mergeGeos(pfAir)),
    airPl: trackGeo(mergeGeos(plAir)),
    airPiers: trackGeo(mergeGeos(pierAir)),
    airGround: trackGeo(
      (() => {
        const gr = new THREE.PlaneGeometry(260, 260);
        scaleUV(gr, 260, 260);
        gr.rotateX(-PI / 2);
        gr.translate(0, GY, 0);
        return gr;
      })()
    ),
  };

  const posterMats = [0, 1, 2, 3, 4].map((k) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        map: toTex(posterCanvas(k)),
        roughness: 0.3,
        envMapIntensity: 0.55,
        side: THREE.DoubleSide,
      })
    )
  );
  const seatMats = [0xc8352b, 0xe9a23b, 0xe0c03a, 0x3f7f5a, 0x2d5fa0].map((c) =>
    trackMat(new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, envMapIntensity: 0.7 }))
  );
  const signMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: toTex(signCanvas('Sortie', '#1d3f7a', '#ffffff')),
      roughness: 0.25,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide,
    })
  );

  let badgeMat: THREE.MeshStandardMaterial | null = null;
  let route: RouteDef = ROUTES[0];
  let pieces: TrackPiece[] = [];
  let stations: StationPos[] = [];
  let tunnels: TunnelDef[] = [];
  let tailA = { s0: 0, s1: TAIL, out: null as [number, number] | null };
  let tailB = { s0: 0, s1: TAIL, out: null as [number, number] | null };
  let openIv: [number, number][] = [];

  function buildPath(r: RouteDef) {
    pieces = [];
    stations = [];
    tunnels = [];
    let s = 0;
    let x = 0;
    let z = 0;
    let h = 0;
    const line = (len: number) => {
      pieces.push({ t: 'L', s0: s, len, x, z, h });
      x += Math.cos(h) * len;
      z += Math.sin(h) * len;
      s += len;
    };
    const arc = (R: number, th: number) => {
      const sg = Math.sign(th);
      const len = R * Math.abs(th);
      const cx = x - sg * R * Math.sin(h);
      const cz = z + sg * R * Math.cos(h);
      pieces.push({ t: 'A', s0: s, len, cx, cz, R, sg, h0: h });
      h += th;
      x = cx + sg * R * Math.sin(h);
      z = cz - sg * R * Math.cos(h);
      s += len;
    };

    tailA = { s0: 0, s1: TAIL, out: null };
    line(TAIL);
    const base = hashStr(r.key);
    r.stations.forEach((st, k) => {
      stations.push({ name: st.name, flag: st.flag, air: st.air, s0: s, sc: s + HALF });
      line(SL);
      if (k < r.stations.length - 1) {
        const t0 = s;
        const seed = base + k * 977;
        let th = 0;
        let R = 200;
        if (rnd(seed) > 0.42) {
          th = (((15 + rnd(seed + 1) * 60) * PI) / 180) * (rnd(seed + 2) < 0.5 ? -1 : 1);
          R = 140 + rnd(seed + 3) * 90;
          if (R * Math.abs(th) > 250) R = 250 / Math.abs(th);
        }
        const al = R * Math.abs(th);
        const a = (TL - al) / 2;
        line(a);
        if (th) arc(R, th);
        line(TL - al - a);
        const nb = r.stations[k + 1];
        const sp = (r.open.seine ?? []).some((p) => pairIs(p, st.name, nb.name));
        tunnels.push({
          s0: t0,
          s1: s,
          curve: th,
          a: st.air,
          b: nb.air,
          seine: sp,
          tower: Boolean(r.open.tower && pairIs(r.open.tower, st.name, nb.name)),
          out: null,
        });
      }
    });
    tailB = { s0: s, s1: s + TAIL, out: null };
    line(TAIL);

    const iv: [number, number][] = [];
    stations.forEach((st) => {
      if (st.air) iv.push([st.s0, st.s0 + SL]);
    });
    tunnels.forEach((t) => {
      const len = t.s1 - t.s0;
      const f = t.seine ? 0.75 : 0.35;
      if (t.a && t.b) t.out = [t.s0, t.s1];
      else if (t.a) t.out = [t.s0, t.s0 + f * len];
      else if (t.b) t.out = [t.s1 - f * len, t.s1];
      else t.out = null;
      if (t.out) iv.push([t.out[0], t.out[1]]);
    });
    tailA.out = stations[0].air ? [tailA.s1 - 150, tailA.s1] : null;
    tailB.out = stations[stations.length - 1].air ? [tailB.s0, tailB.s0 + 150] : null;
    if (tailA.out) iv.push([tailA.out[0], tailA.out[1]]);
    if (tailB.out) iv.push([tailB.out[0], tailB.out[1]]);
    iv.sort((x, y) => x[0] - y[0]);
    openIv = [];
    iv.forEach((seg) => {
      const last = openIv[openIv.length - 1];
      if (last && seg[0] <= last[1] + 0.5) last[1] = Math.max(last[1], seg[1]);
      else openIv.push(seg);
    });
  }

  function isOpen(s: number) {
    for (let i = 0; i < openIv.length; i++) {
      if (s >= openIv[i][0] && s <= openIv[i][1]) return true;
    }
    return false;
  }

  function portalDist(s: number) {
    let d = 1e9;
    openIv.forEach((v) => {
      d = Math.min(d, Math.abs(s - v[0]), Math.abs(s - v[1]));
    });
    return d;
  }

  const _pose = { x: 0, z: 0, h: 0 };
  function pose(sVal: number, out = _pose) {
    const s = Math.max(0, sVal);
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].s0 <= s) lo = mid;
      else hi = mid - 1;
    }
    const p = pieces[lo];
    const d = Math.min(s - p.s0, p.len);
    if (p.t === 'L') {
      out.x = (p.x ?? 0) + Math.cos(p.h ?? 0) * d;
      out.z = (p.z ?? 0) + Math.sin(p.h ?? 0) * d;
      out.h = p.h ?? 0;
    } else {
      const hh = (p.h0 ?? 0) + ((p.sg ?? 1) * d) / (p.R ?? 200);
      out.x = (p.cx ?? 0) + (p.sg ?? 1) * (p.R ?? 200) * Math.sin(hh);
      out.z = (p.cz ?? 0) - (p.sg ?? 1) * (p.R ?? 200) * Math.cos(hh);
      out.h = hh;
    }
    return out;
  }

  function toWorld(
    P: { x: number; z: number; h: number },
    lx: number,
    ly: number,
    lz: number,
    v: THREE.Vector3
  ) {
    const c = Math.cos(P.h);
    const s = Math.sin(P.h);
    return v.set(P.x + c * lx - s * lz, ly, P.z + s * lx + c * lz);
  }

  function sweep(profile: [number, number][], s0: number, s1: number, step: number) {
    const lens = [0];
    for (let i = 1; i < profile.length; i++) {
      lens.push(
        lens[i - 1] +
          Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1])
      );
    }
    const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
    const m = profile.length;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const P = { x: 0, z: 0, h: 0 };
    for (let i = 0; i < n; i++) {
      const s = s0 + ((s1 - s0) * i) / (n - 1);
      pose(s, P);
      const nx = -Math.sin(P.h);
      const nz = Math.cos(P.h);
      for (let j = 0; j < m; j++) {
        pos.push(P.x + nx * profile[j][0], profile[j][1], P.z + nz * profile[j][0]);
        uv.push(s, lens[j]);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = i * m + j;
        const b = a + 1;
        const c = a + m;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const tunnelProfile = archPts(TW, TY, TH, 48, true);
  const rectProf = (o: number, y0: number, y1: number, w: number): [number, number][] => [
    [o - w / 2, y0],
    [o - w / 2, y1],
    [o + w / 2, y1],
    [o + w / 2, y0],
    [o - w / 2, y0],
  ];
  const sleeperGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.12, 2.5));
  const lampGeo = trackGeo(new THREE.BoxGeometry(0.3, 0.12, 0.08));
  const unitBox = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const DECK: [number, number][] = [
    [-4.5, -1.3],
    [-4.5, 1.1],
    [-4.25, 1.1],
    [-4.25, 0],
    [4.25, 0],
    [4.25, 1.1],
    [4.5, 1.1],
    [4.5, -1.3],
    [-4.5, -1.3],
  ];

  function addTrack(g: THREE.Group, geos: THREE.BufferGeometry[], s0: number, s1: number) {
    const rails: THREE.BufferGeometry[] = [];
    const third: THREE.BufferGeometry[] = [];
    [1.8, -1.8].forEach((zc) => {
      [-0.7175, 0.7175].forEach((o) =>
        rails.push(sweep(rectProf(zc + o, 0.12, 0.22, 0.07), s0, s1, 4))
      );
      third.push(sweep(rectProf(zc - Math.sign(zc) * 1.45, 0.235, 0.325, 0.12), s0, s1, 4));
    });
    const rg = mergeGeos(rails);
    const tg = mergeGeos(third);
    rails.concat(third).forEach((x) => x.dispose());
    geos.push(rg, tg);
    g.add(new THREE.Mesh(rg, M.steel));
    g.add(new THREE.Mesh(tg, M.third));
    const P = { x: 0, z: 0, h: 0 };
    const m4 = new THREE.Matrix4();
    const N = Math.max(1, Math.floor((s1 - s0) / 0.7));
    const sl = new THREE.InstancedMesh(sleeperGeo, M.sleeper, N * 2);
    let k = 0;
    for (let i = 0; i < N; i++) {
      pose(s0 + 0.35 + i * 0.7, P);
      [1.8, -1.8].forEach((lat) => {
        m4.makeRotationY(-P.h);
        m4.setPosition(P.x - Math.sin(P.h) * lat, 0.06, P.z + Math.cos(P.h) * lat);
        sl.setMatrixAt(k++, m4);
      });
    }
    sl.instanceMatrix.needsUpdate = true;
    g.add(sl);
  }

  function tunnelGroup(s0: number, s1: number, geos: THREE.BufferGeometry[]) {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      geos.push(geo);
      g.add(new THREE.Mesh(geo, mat));
    };
    add(sweep(tunnelProfile, s0, s1, 4), M.tunnel);
    add(
      sweep(
        [
          [-TW, 0.001],
          [TW, 0.001],
        ],
        s0,
        s1,
        4
      ),
      M.bed
    );
    addTrack(g, geos, s0, s1);
    const P = { x: 0, z: 0, h: 0 };
    const m4 = new THREE.Matrix4();
    const lamps: number[] = [];
    for (let s = s0 + 9; s < s1; s += 18) lamps.push(s);
    if (lamps.length) {
      const lm = new THREE.InstancedMesh(lampGeo, M.tunnelLamp, lamps.length * 2);
      let k = 0;
      lamps.forEach((s) => {
        pose(s, P);
        [-1, 1].forEach((side) => {
          const lat = side * (TW - 0.05);
          m4.makeRotationY(-P.h);
          m4.setPosition(P.x - Math.sin(P.h) * lat, 2.3, P.z + Math.cos(P.h) * lat);
          lm.setMatrixAt(k++, m4);
        });
      });
      lm.instanceMatrix.needsUpdate = true;
      g.add(lm);
    }
    return g;
  }

  function placeBox(
    im: THREE.InstancedMesh,
    i: number,
    P: { x: number; z: number; h: number },
    along: number,
    lat: number,
    y: number,
    sx: number,
    sy: number,
    sz: number
  ) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -P.h);
    const c = Math.cos(P.h);
    const sn = Math.sin(P.h);
    im.setMatrixAt(
      i,
      new THREE.Matrix4().compose(
        new THREE.Vector3(P.x + c * along - sn * lat, y, P.z + sn * along + c * lat),
        q,
        new THREE.Vector3(sx, sy, sz)
      )
    );
  }

  function cityBlocks(
    g: THREE.Group,
    list: Array<{
      P: { x: number; z: number; h: number };
      along: number;
      lat: number;
      w: number;
      h: number;
      d: number;
    }>
  ) {
    if (!list.length) return;
    const b = new THREE.InstancedMesh(unitBox, M.building, list.length);
    const r = new THREE.InstancedMesh(unitBox, M.zinc, list.length);
    list.forEach((o, i) => {
      placeBox(b, i, o.P, o.along, o.lat, GY + o.h / 2, o.w, o.h, o.d);
      placeBox(r, i, o.P, o.along, o.lat, GY + o.h + 1.6, o.w - 1.2, 3.2, o.d - 1.2);
    });
    b.instanceMatrix.needsUpdate = true;
    r.instanceMatrix.needsUpdate = true;
    g.add(b);
    g.add(r);
  }

  let towerWorldPos: THREE.Vector3 | null = null;

  function eiffel(geos: THREE.BufferGeometry[]) {
    const grp = new THREE.Group();
    // Quatre piliers évasés de la base (y = 0) jusqu'au 2e étage (y = 115)
    const legGeo = new THREE.CylinderGeometry(3.2, 11.5, 62, 6);
    const upperLegGeo = new THREE.CylinderGeometry(2.2, 4.4, 60, 6);
    geos.push(legGeo, upperLegGeo);
    const lowerR = 45;
    const midR = 23;
    [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ].forEach(([sx, sz]) => {
      const leg = new THREE.Mesh(legGeo, M.tower);
      leg.position.set(sx * lowerR, 28, sz * lowerR);
      leg.rotation.z = sx * 0.34;
      leg.rotation.x = -sz * 0.34;
      grp.add(leg);

      const upper = new THREE.Mesh(upperLegGeo, M.tower);
      upper.position.set(sx * midR, 86, sz * midR);
      upper.rotation.z = sx * 0.16;
      upper.rotation.x = -sz * 0.16;
      grp.add(upper);
    });

    // Fût supérieur (y = 115 -> 324) + antenne
    const shaftPts = [
      [19, 115],
      [13, 158],
      [8.5, 205],
      [5.5, 250],
      [3.4, 280],
      [1.6, 305],
      [0.4, 324],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const shaftGeo = new THREE.LatheGeometry(shaftPts, 4);
    shaftGeo.rotateY(PI / 4);
    geos.push(shaftGeo);
    grp.add(new THREE.Mesh(shaftGeo, M.tower));

    // Ceinture ajourée des 4 faces sous le 1er étage
    const archGeo = new THREE.TorusGeometry(26, 2.2, 6, 18, PI);
    geos.push(archGeo);
    [0, PI / 2, PI, -PI / 2].forEach((rotY) => {
      const arch = new THREE.Mesh(archGeo, M.tower);
      arch.position.set(Math.sin(rotY) * 32, 24, Math.cos(rotY) * 32);
      arch.rotation.y = rotY;
      grp.add(arch);
    });

    // 3 plateformes emblématiques + liseré doré
    [
      [57, 6.2, 68],
      [115, 4.5, 41],
      [276, 3.4, 13],
    ].forEach(([y, h, w]) => {
      const bg = new THREE.BoxGeometry(w, h, w);
      geos.push(bg);
      const m = new THREE.Mesh(bg, M.tower);
      m.position.y = y;
      grp.add(m);
      const glowGeo = new THREE.BoxGeometry(w + 0.6, 0.9, w + 0.6);
      geos.push(glowGeo);
      const glowMesh = new THREE.Mesh(glowGeo, M.towerBeacon);
      glowMesh.position.y = y - h / 2 - 0.35;
      grp.add(glowMesh);
    });

    // Phare lumineux au sommet (324 m)
    const beaconGeo = new THREE.SphereGeometry(2.6, 10, 8);
    geos.push(beaconGeo);
    const beacon = new THREE.Mesh(beaconGeo, M.towerBeacon);
    beacon.position.y = 325;
    grp.add(beacon);
    return grp;
  }

  function viaductGroup(
    s0: number,
    s1: number,
    t: { seine?: boolean; tower?: boolean } | null,
    geos: THREE.BufferGeometry[]
  ) {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      geos.push(geo);
      g.add(new THREE.Mesh(geo, mat));
    };
    add(sweep(DECK, s0, s1, 4), M.viaduct);
    addTrack(g, geos, s0, s1);
    const mid = (s0 + s1) / 2;
    const seine = Boolean(t && t.seine);
    const river: [number, number] | null = seine ? [mid - 75, mid + 75] : null;
    if (river) {
      if (river[0] > s0) {
        add(
          sweep(
            [
              [-130, GY],
              [130, GY],
            ],
            s0,
            river[0],
            6
          ),
          M.ground
        );
      }
      if (river[1] < s1) {
        add(
          sweep(
            [
              [-130, GY],
              [130, GY],
            ],
            river[1],
            s1,
            6
          ),
          M.ground
        );
      }
      const P = pose(mid, { x: 0, z: 0, h: 0 });
      const wg = new THREE.PlaneGeometry(150, 1600);
      geos.push(wg);
      const w = new THREE.Mesh(wg, M.water);
      w.rotation.x = -PI / 2;
      w.rotation.z = P.h;
      w.position.set(P.x, GY + 0.4, P.z);
      g.add(w);
    } else {
      add(
        sweep(
          [
            [-130, GY],
            [130, GY],
          ],
          s0,
          s1,
          6
        ),
        M.ground
      );
    }

    const piers: number[] = [];
    for (let s = s0 + 12; s < s1; s += seine ? 36 : 24) piers.push(s);
    if (piers.length) {
      const im = new THREE.InstancedMesh(unitBox, M.viaduct, piers.length * 2);
      let i = 0;
      piers.forEach((s) => {
        const P = pose(s, { x: 0, z: 0, h: 0 });
        [-3, 3].forEach((lat) => placeBox(im, i++, P, 0, lat, (GY - 1.3) / 2, 1.5, -GY - 1.3, 1.5));
      });
      im.instanceMatrix.needsUpdate = true;
      g.add(im);
    }

    const list: Array<{
      P: { x: number; z: number; h: number };
      along: number;
      lat: number;
      w: number;
      h: number;
      d: number;
    }> = [];
    const seed = hashStr(route.key) + Math.floor(s0);
    let n = 0;
    for (let s = s0 + 10; s < s1 - 6; s += 26) {
      n++;
      if (river && s > river[0] - 40 && s < river[1] + 40) continue;
      [-1, 1].forEach((side) => {
        // Garde la berge côté Champ-de-Mars dégagée pour voir toute la Tour Eiffel depuis la rame
        if (t?.tower && side < 0) return;
        const q = seed + n * 13 + side * 7;
        list.push({
          P: { ...pose(s, { x: 0, z: 0, h: 0 }) },
          along: 0,
          lat: side * (26 + rnd(q) * 16),
          w: 20 + rnd(q + 1) * 5,
          h: 17 + rnd(q + 2) * 7,
          d: 14 + rnd(q + 3) * 8,
        });
      });
    }
    cityBlocks(g, list);

    if (t && t.tower) {
      const twPosS = s0 + (s1 - s0) * 0.62;
      const P = pose(twPosS, { x: 0, z: 0, h: 0 });
      const tw = eiffel(geos);
      const lat = -190;
      tw.position.set(P.x - Math.sin(P.h) * lat, GY, P.z + Math.cos(P.h) * lat);
      towerWorldPos = new THREE.Vector3(tw.position.x, GY + 135, tw.position.z);
      g.add(tw);
      const padGeo = new THREE.CircleGeometry(210, 36);
      geos.push(padGeo);
      const pad = new THREE.Mesh(padGeo, M.ground);
      pad.rotation.x = -PI / 2;
      pad.position.set(tw.position.x, GY - 0.02, tw.position.z);
      g.add(pad);
    }
    return g;
  }

  function portalParts(sp: number, o: number, geos: THREE.BufferGeometry[]): BuiltPart[] {
    const P = pose(sp, { x: 0, z: 0, h: 0 });
    const d = new THREE.Vector3(Math.cos(P.h), 0, Math.sin(P.h));
    const n = new THREE.Vector3(-Math.sin(P.h), 0, Math.cos(P.h));
    const up = new THREE.Vector3(0, 1, 0);
    const basis = new THREE.Matrix4().makeBasis(
      o > 0 ? n.clone().negate() : n,
      up,
      o > 0 ? d : d.clone().negate()
    );
    basis.setPosition(P.x, 0, P.z);
    const sh = new THREE.Shape();
    sh.moveTo(-60, GY);
    sh.lineTo(60, GY);
    sh.lineTo(60, 12);
    sh.lineTo(-60, 12);
    const hole = new THREE.Path();
    hole.moveTo(TW, 0);
    hole.lineTo(TW, TY);
    for (let i = 1; i <= 32; i++) {
      const t = (PI * i) / 32;
      hole.lineTo(TW * Math.cos(t), TY + TH * Math.sin(t));
    }
    hole.lineTo(-TW, 0);
    hole.lineTo(TW, 0);
    sh.holes.push(hole);
    const wall = new THREE.ShapeGeometry(sh);
    wall.applyMatrix4(basis);
    geos.push(wall);
    const out = new THREE.Group();
    out.add(new THREE.Mesh(wall, M.viaduct));
    const moundGeo = new THREE.BoxGeometry(120, 19, 60);
    geos.push(moundGeo);
    const mound = new THREE.Mesh(moundGeo, M.mound);
    mound.applyMatrix4(basis);
    mound.translateZ(-30.2);
    mound.translateY(2.5);
    out.add(mound);
    const pg = new THREE.PlaneGeometry(2 * TW, TY + TH);
    pg.translate(0, (TY + TH) / 2, -2.5);
    pg.applyMatrix4(basis);
    geos.push(pg);
    const plug = new THREE.Group();
    plug.add(new THREE.Mesh(pg, M.plug));
    return [
      { g: out, env: 'out' },
      { g: plug, env: 'plug' },
    ];
  }

  function buildSegment(
    t: { out: [number, number] | null; seine?: boolean; tower?: boolean },
    s0: number,
    s1: number
  ): BuiltSegment {
    const geos: THREE.BufferGeometry[] = [];
    const parts: BuiltPart[] = [];
    if (!t.out) parts.push({ g: tunnelGroup(s0, s1, geos), env: 'in' });
    else if (t.out[0] <= s0 + 0.01 && t.out[1] >= s1 - 0.01)
      parts.push({ g: viaductGroup(s0, s1, t, geos), env: 'out' });
    else if (t.out[0] <= s0 + 0.01) {
      parts.push({ g: viaductGroup(s0, t.out[1], t, geos), env: 'out' });
      parts.push({ g: tunnelGroup(t.out[1], s1, geos), env: 'in' });
      portalParts(t.out[1], -1, geos).forEach((p) => parts.push(p));
    } else {
      parts.push({ g: tunnelGroup(s0, t.out[0], geos), env: 'in' });
      parts.push({ g: viaductGroup(t.out[0], s1, t, geos), env: 'out' });
      portalParts(t.out[0], 1, geos).forEach((p) => parts.push(p));
    }
    return {
      parts,
      dispose() {
        geos.forEach((x) => x.dispose());
      },
    };
  }

  function buildAirStation(name: string, k: number): { group: THREE.Group; dispose: () => void } {
    const g = new THREE.Group();
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas(name));
    plaqueTex.wrapS = THREE.RepeatWrapping;
    plaqueTex.wrapT = THREE.RepeatWrapping;
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = maxAniso;
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      roughness: 0.18,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => g.add(new THREE.Mesh(geo, mat));
    add(STN.airDeck, M.viaduct);
    add(STN.platBody, M.platformFace);
    add(STN.platTop, M.slab);
    add(STN.edge, M.edge);
    add(STN.rails, M.steel);
    add(STN.third, M.third);
    add(STN.sleepers, M.sleeper);
    add(STN.airParapet, M.iron);
    add(STN.canopy, M.canopy);
    add(STN.cols, M.iron);
    add(STN.airLamps, M.lamp);
    add(STN.airPf, M.cream);
    add(STN.airPl, plaqueMat);
    add(STN.plinths, M.cream);
    STN.seats.forEach((p, i) => add(p, seatMats[i]));
    add(STN.airPiers, M.viaduct);
    add(STN.airGround, M.ground);
    const list: Array<{
      P: { x: number; z: number; h: number };
      along: number;
      lat: number;
      w: number;
      h: number;
      d: number;
    }> = [];
    const seed = hashStr(route.key) + k * 101;
    const P0 = { x: 0, z: 0, h: 0 };
    for (let x = -110, n = 0; x <= 110; x += 26, n++) {
      [-1, 1].forEach((side) => {
        const q = seed + n * 13 + side * 7;
        list.push({
          P: P0,
          along: x,
          lat: side * (28 + rnd(q) * 14),
          w: 20 + rnd(q + 1) * 5,
          h: 17 + rnd(q + 2) * 7,
          d: 14 + rnd(q + 3) * 8,
        });
      });
    }
    cityBlocks(g, list);
    return {
      group: g,
      dispose() {
        plaqueTex.dispose();
        plaqueMat.dispose();
      },
    };
  }

  function buildStation(name: string): { group: THREE.Group; dispose: () => void } {
    const g = new THREE.Group();
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas(name));
    plaqueTex.wrapS = THREE.RepeatWrapping;
    plaqueTex.wrapT = THREE.RepeatWrapping;
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = maxAniso;
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      roughness: 0.18,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => g.add(new THREE.Mesh(geo, mat));
    add(STN.vault, M.tile);
    add(STN.portal, M.tile);
    add(STN.platBody, M.platformFace);
    add(STN.platTop, M.slab);
    add(STN.edge, M.edge);
    add(STN.bed, M.bed);
    add(STN.rails, M.steel);
    add(STN.third, M.third);
    add(STN.sleepers, M.sleeper);
    add(STN.frames, M.frame);
    STN.posters.forEach((p, i) => add(p, posterMats[i]));
    add(STN.pframes, M.cream);
    add(STN.plaques, plaqueMat);
    if (badgeMat) add(STN.badges, badgeMat);
    add(STN.plinths, M.cream);
    STN.seats.forEach((p, i) => add(p, seatMats[i]));
    add(STN.hous, M.housing);
    add(STN.diff, M.lamp);
    add(STN.rods, M.housing);
    add(STN.signs, signMat);
    add(STN.sframes, M.housing);
    return {
      group: g,
      dispose() {
        plaqueTex.dispose();
        plaqueMat.dispose();
      },
    };
  }

  const built = new Map<string, BuiltSegment>();
  function want(lo: number, hi: number) {
    const keys = new Set<string>();
    for (let k = Math.max(0, lo); k <= Math.min(stations.length - 1, hi); k++) keys.add(`s${k}`);
    for (let j = Math.max(0, lo - 1); j <= Math.min(tunnels.length - 1, hi); j++) keys.add(`t${j}`);
    if (lo <= 0) keys.add('ta');
    if (hi >= stations.length - 1) keys.add('tb');
    return keys;
  }

  function makePiece(key: string): BuiltSegment {
    if (key[0] === 's') {
      const k = +key.slice(1);
      const st = stations[k];
      const o = st.air ? buildAirStation(st.name, k) : buildStation(st.name);
      const P = pose(st.sc, { x: 0, z: 0, h: 0 });
      o.group.position.set(P.x, 0, P.z);
      o.group.rotation.y = -P.h;
      return { parts: [{ g: o.group, env: st.air ? 'out' : 'in' }], dispose: o.dispose };
    }
    if (key === 'ta') return buildSegment(tailA, tailA.s0, tailA.s1);
    if (key === 'tb') return buildSegment(tailB, tailB.s0, tailB.s1);
    const t = tunnels[+key.slice(1)];
    return buildSegment(t, t.s0, t.s1);
  }

  function stream(lo: number, hi: number, limit: number) {
    const keys = want(lo, hi);
    built.forEach((o, k) => {
      if (!keys.has(k)) {
        o.parts.forEach((p) => scene.remove(p.g));
        o.dispose();
        built.delete(k);
      }
    });
    let n = 0;
    keys.forEach((k) => {
      if (!built.has(k) && n < limit) {
        const o = makePiece(k);
        o.parts.forEach((p) => scene.add(p.g));
        built.set(k, o);
        n++;
      }
    });
  }

  function clearAll() {
    towerWorldPos = null;
    built.forEach((o) => {
      o.parts.forEach((p) => scene.remove(p.g));
      o.dispose();
    });
    built.clear();
  }

  const FOG_IN = new THREE.Color(0x0c0a08);
  const FOG_OUT = new THREE.Color(0xc3cbd0);
  let camEnv: 'in' | 'out' | 'edge' = 'in';
  let openMix = 0;

  function applyEnv(cs: number, dt: number) {
    const open = isOpen(cs);
    const near = portalDist(cs) < 150;
    camEnv = near ? 'edge' : open ? 'out' : 'in';
    built.forEach((o) =>
      o.parts.forEach((p) => {
        p.g.visible =
          p.env === 'in' ? camEnv !== 'out' : p.env === 'out' ? camEnv !== 'in' : camEnv === 'out';
      })
    );
    const target = open ? 1 : near ? 0.25 * (1 - portalDist(cs) / 150) : 0;
    openMix += (target - openMix) * Math.min(1, dt * 2.5);
    const o = openMix;
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(FOG_IN).lerp(FOG_OUT, o);
      scene.fog.density = 0.0085 + (0.00105 - 0.0085) * o;
    }
    sun.intensity = 1.9 * o;
    hemi.intensity = 0.42 + 0.6 * o;
    sky.visible = camEnv !== 'in';
    sky.position.copy(camera.position);
    sun.position.set(camera.position.x + 120, camera.position.y + 220, camera.position.z + 60);
    sun.target.position.copy(camera.position);
  }

  const lightPool = [-50, -30, -10, 10, 30, 50].map((x) => {
    const l = new THREE.PointLight(0xffe9cc, 1.35, 34, 1.5);
    scene.add(l);
    return { l, x };
  });

  function placeLights(k: number) {
    const P = pose(stations[k].sc, { x: 0, z: 0, h: 0 });
    lightPool.forEach((o) => toWorld(P, o.x, 5.2, 0, o.l.position));
  }

  /* ---------- The Train ---------- */
  type TrainCarEntry = { outer: THREE.Group; inner: THREE.Group; glbSlot: THREE.Group };
  const tr = {
    cars: [] as TrainCarEntry[],
    s: 0,
    dir: 1 as 1 | -1,
    v: 0,
    state: 'dwell' as 'dwell' | 'run',
    dwell: 0,
    door: 0,
    wheel: 0,
    time: 0,
    cur: 0,
    target: null as { type: 'stn' | 'turn'; k?: number; front: number } | null,
    destMat: trackMat(new THREE.MeshBasicMaterial({})),
  };

  let glbLoadToken = 0;
  let glbStatus: 'loading' | 'ready' | 'failed' = 'loading';
  let loadedGlbFamily: ParisGlbFamily | null = null;
  let disposed = false;

  function syncCarVisibility(v: 'vault' | 'ride') {
    const showGlb = v === 'vault' && glbStatus === 'ready';
    const showInner = v === 'ride' || (v === 'vault' && glbStatus === 'failed');
    for (const c of tr.cars) {
      c.glbSlot.visible = showGlb;
      c.inner.visible = showInner;
    }
  }

  function applyTrainGlbForRoute(r: RouteDef) {
    const family = resolveTrainGlbFamily(r.num);
    if (loadedGlbFamily === family && glbStatus === 'ready') {
      syncCarVisibility(view);
      return;
    }
    const token = ++glbLoadToken;
    glbStatus = 'loading';
    syncCarVisibility(view);
    void loadGlbFamily(family).then((scenes) => {
      if (disposed || token !== glbLoadToken) return;
      if (!scenes) {
        glbStatus = 'failed';
        loadedGlbFamily = null;
        syncCarVisibility(view);
        return;
      }
      tr.cars.forEach((carEntry, idx) => {
        carEntry.glbSlot.clear();
        const isCab = idx === 0;
        const isTail = idx === tr.cars.length - 1 && tr.cars.length > 1;
        const source = isCab ? scenes.cab : isTail ? scenes.tail : scenes.neutral;
        const mesh = normalizeGlbCarScene(source, isTail);
        carEntry.glbSlot.add(mesh);
      });
      loadedGlbFamily = family;
      glbStatus = 'ready';
      syncCarVisibility(view);
    });
  }

  {
    const cls = [0, 0, 1, 0, 0];
    for (let i = 0; i < NC; i++) {
      const inner = buildCar(
        cls[i] ? M.paintRed : M.paintGreen,
        i === 0,
        i === NC - 1,
        Boolean(cls[i])
      );
      inner.position.x = -L / 2;
      const glbSlot = new THREE.Group();
      glbSlot.position.y = 0.05;
      glbSlot.visible = false;
      const outer = new THREE.Group();
      outer.rotation.order = 'YXZ';
      outer.add(inner);
      outer.add(glbSlot);
      if (i < NC - 1) {
        const gw = new THREE.Mesh(G.gangway, M.rubber);
        gw.position.x = -L / 2 - GAP / 2;
        outer.add(gw);
      }
      scene.add(outer);
      tr.cars.push({ outer, inner, glbSlot });
    }
    const front = tr.cars[0].inner;
    const rear = tr.cars[NC - 1].inner;
    const headGeo = trackGeo(new THREE.SphereGeometry(0.085, 16, 10));
    const ringGeo = trackGeo(new THREE.TorusGeometry(0.1, 0.018, 8, 20));
    const tailGeo = trackGeo(new THREE.SphereGeometry(0.07, 14, 8));
    [-0.8, 0.8].forEach((z) => {
      const h = new THREE.Mesh(headGeo, M.head);
      h.position.set(L + 0.01, BY + 0.42, z);
      front.add(h);
      const ring = new THREE.Mesh(ringGeo, M.chrome);
      ring.rotation.y = PI / 2;
      ring.position.set(L + 0.01, BY + 0.42, z);
      front.add(ring);
      const t = new THREE.Mesh(tailGeo, M.tail);
      t.position.set(-0.01, BY + 0.42, z);
      rear.add(t);
    });
    const dpGeo = trackGeo(new THREE.PlaneGeometry(1.0, 0.19));
    const dp = new THREE.Mesh(dpGeo, tr.destMat);
    dp.rotation.y = PI / 2;
    dp.position.set(L + 0.003, BY + 1.97, 0);
    front.add(dp);
    const fo = tr.cars[0].outer;
    const spot = new THREE.SpotLight(0xfff0d2, 2.6, 85, 0.5, 0.6, 1);
    spot.position.set(L / 2 + 0.2, BY + 0.6, 0);
    const tgt = new THREE.Object3D();
    tgt.position.set(L / 2 + 35, 0.4, 0);
    fo.add(spot);
    fo.add(tgt);
    spot.target = tgt;
    const glow = new THREE.PointLight(0xffd9a0, 0.75, 12, 1.6);
    glow.position.set(0, 2.4, 2.0);
    tr.cars[2].outer.add(glow);
  }

  let destTex: THREE.CanvasTexture | null = null;
  function setDest() {
    const name = tr.dir > 0 ? stations[stations.length - 1].name : stations[0].name;
    if (destTex) destTex.dispose();
    destTex = new THREE.CanvasTexture(destCanvas(name.toUpperCase()));
    destTex.wrapS = THREE.RepeatWrapping;
    destTex.wrapT = THREE.RepeatWrapping;
    destTex.colorSpace = THREE.SRGBColorSpace;
    destTex.anisotropy = maxAniso;
    tr.destMat.map = destTex;
    tr.destMat.needsUpdate = true;
  }

  const A_BRAKE = 1.55;
  const ACC = 1.15;
  const VMAX = 16;
  const DWELL = 10;

  function serves(k: number, d: number) {
    const f = stations[k].flag;
    return d > 0 ? f !== 'b' : f !== 'f';
  }

  function nextFrom(cur: number, dir: number): { type: 'stn' | 'turn'; k?: number; front: number } {
    const N = stations.length;
    if (dir > 0) {
      for (let k = cur + 1; k < N; k++) {
        if (serves(k, 1)) return { type: 'stn', k, front: stations[k].sc + TRAIN_LEN / 2 };
      }
      return { type: 'turn', front: tailB.s0 + TAIL - 20 };
    }
    for (let k = cur - 1; k >= 0; k--) {
      if (serves(k, -1)) return { type: 'stn', k, front: stations[k].sc - TRAIN_LEN / 2 };
    }
    return { type: 'turn', front: tailA.s1 - TAIL + 20 };
  }

  function planNext() {
    tr.target = nextFrom(tr.cur, tr.dir);
  }

  let view: 'vault' | 'ride' = options.initialView ?? 'ride';
  let paused = false;
  let speed = 1;
  let focusKey = '';
  let veilTimeout: ReturnType<typeof setTimeout> | null = null;
  let cabYaw = 0;
  let cabPitch = 0;
  let eiffelGlance = false;

  let liveMode = true;
  let liveActive = false;
  let liveTargetTrainId: string | null = options.initialTrainId ?? null;
  let latestLiveTrain: TrainMarker | null = null;
  let liveLegKey = '';

  function updateLiveUi() {
    liveBtn.setAttribute('aria-pressed', String(liveMode));
    liveBtn.classList.toggle('is-live-active', liveMode && liveActive);
    liveLabelEl.textContent = liveMode ? (liveActive ? 'EN DIRECT' : 'DIRECT...') : 'SIMU';
    speedBtn.hidden = liveMode && liveActive;
  }

  function turnBack() {
    tr.dir = tr.dir > 0 ? -1 : 1;
    if (tr.dir < 0) {
      tr.s = tailB.s0 + 180;
      tr.cur = stations.length;
    } else {
      tr.s = tailA.s1 - 180;
      tr.cur = -1;
    }
    tr.v = 0;
    tr.state = 'run';
    planNext();
    setDest();
    if (view === 'ride') {
      veil.style.opacity = '1';
      if (veilTimeout) clearTimeout(veilTimeout);
      veilTimeout = setTimeout(() => {
        veil.style.opacity = '0';
      }, 900);
    }
  }

  function stepTrain(dt: number) {
    tr.time += dt;
    if (tr.state === 'dwell') {
      tr.dwell += dt;
      if (tr.dwell > DWELL) {
        tr.state = 'run';
        planNext();
      }
    } else if (tr.target) {
      const tg = tr.target;
      const rem = (tg.front - tr.s) * tr.dir;
      tr.v = Math.min(VMAX, tr.v + ACC * dt);
      if (rem <= (tr.v * tr.v) / (2 * A_BRAKE)) {
        tr.v = Math.min(tr.v, Math.sqrt(Math.max(0, 2 * A_BRAKE * rem)));
      }
      const st = Math.min(rem, Math.max(tr.v, 0.05) * dt);
      tr.s += tr.dir * st;
      if (rem - st < 0.01) {
        tr.s = tg.front;
        tr.v = 0;
        if (tg.type === 'stn' && tg.k !== undefined) {
          tr.cur = tg.k;
          tr.state = 'dwell';
          tr.dwell = 0;
        } else {
          turnBack();
        }
      }
    }
    const targetDoor = tr.state === 'dwell' && tr.dwell > 1.3 && tr.dwell < DWELL - 2.4 ? 1 : 0;
    const sp = dt / 1.3;
    tr.door += Math.max(-sp, Math.min(sp, targetDoor - tr.door));
    tr.wheel += (tr.v * dt) / WR;
  }

  function stepLiveTrain(train: TrainMarker, dt: number) {
    tr.time += dt;
    const nextIdx = resolveStationIndex(train.next);
    const dir = resolveDirection(train.dest, nextIdx);
    const dirChanged = tr.dir !== dir;
    tr.dir = dir;
    if (dirChanged) setDest();

    const targetFront = stations[nextIdx].sc + (dir * TRAIN_LEN) / 2;
    const prevIdx = Math.max(0, Math.min(stations.length - 1, nextIdx - dir));
    const prevFront = stations[prevIdx].sc + (dir * TRAIN_LEN) / 2;
    const atStop = Boolean(train.atStop);
    const legKey = `${route.key}|${dir}|${nextIdx}`;

    if (legKey !== liveLegKey) {
      const wasAdjacent =
        liveLegKey.startsWith(`${route.key}|${dir}|`) &&
        Math.abs(nextIdx - Number(liveLegKey.split('|')[2])) <= 1;
      liveLegKey = legKey;
      if (!wasAdjacent) {
        tr.s = atStop ? targetFront : prevFront + (targetFront - prevFront) * 0.42;
      }
    }

    const speedMps = train.speedMps ?? Math.max(0, (train.spd || 0) / 3.6);
    tr.s = computeLiveStepS({
      prevFront,
      targetFront,
      curS: tr.s,
      dir,
      atStop,
      speedMps: atStop ? 0 : Math.max(4, speedMps),
      dt,
    });
    tr.v = atStop ? Math.max(0, tr.v - A_BRAKE * 2 * dt) : Math.max(1, speedMps);
    tr.cur = atStop ? nextIdx : prevIdx;
    tr.state = atStop ? 'dwell' : 'run';
    tr.target = { type: 'stn', k: nextIdx, front: targetFront };

    const targetDoor = atStop ? 1 : 0;
    const sp = dt / 1.1;
    tr.door += Math.max(-sp, Math.min(sp, targetDoor - tr.door));
    tr.wheel += (tr.v * dt) / WR;
  }

  function syncFromSimulation(trains: TrainMarker[]) {
    if (!trains.length) {
      latestLiveTrain = null;
      liveActive = false;
      updateLiveUi();
      return;
    }
    const routeNumNorm = route.num.trim().toLowerCase();
    let match: TrainMarker | undefined;
    if (liveTargetTrainId) {
      match = trains.find((t) => t.id === liveTargetTrainId && !t.isGhost);
    }
    if (!match) {
      match = trains.find(
        (t) =>
          !t.isGhost &&
          t.lineName
            .trim()
            .toLowerCase()
            .replace(/^rer\s+/, '') === routeNumNorm
      );
      if (match) liveTargetTrainId = match.id;
    }
    latestLiveTrain = match ?? null;
    liveActive = Boolean(match);
    updateLiveUi();
  }

  const PC = { x: 0, z: 0, h: 0 };
  function poseTrain() {
    const e = tr.door < 0.5 ? 2 * tr.door * tr.door : 1 - Math.pow(-2 * tr.door + 2, 2) / 2;
    const sway = Math.min(1, tr.v / 10);
    tr.cars.forEach((c, i) => {
      pose(tr.s - tr.dir * (i * (L + GAP) + L / 2), PC);
      const lat = tr.dir * 1.8;
      c.outer.position.set(PC.x - Math.sin(PC.h) * lat, 0.22, PC.z + Math.cos(PC.h) * lat);
      c.outer.rotation.y = -(PC.h + (tr.dir < 0 ? PI : 0));
      c.inner.rotation.x =
        Math.sin(tr.time * 2.7 + i * 1.3) * 0.006 * sway +
        Math.sin(tr.time * 7.1 + i) * 0.0015 * sway;
      const axles = c.inner.userData.axles as THREE.Mesh[];
      const leaves = c.inner.userData.leaves as Array<{
        obj: THREE.Group;
        base: number;
        dir: number;
      }>;
      axles.forEach((a) => {
        a.rotation.z = -tr.wheel;
      });
      leaves.forEach((l) => {
        l.obj.position.x = l.base + l.dir * 0.64 * e;
      });
    });
  }

  function focusStation() {
    if (tr.state === 'dwell') return Math.max(0, Math.min(stations.length - 1, tr.cur));
    if (tr.target?.type === 'stn' && tr.target.k !== undefined) return tr.target.k;
    return tr.dir > 0 ? stations.length - 1 : 0;
  }

  function nearestStation() {
    let lo = 0;
    let hi = stations.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (stations[mid].sc <= tr.s) lo = mid;
      else hi = mid - 1;
    }
    if (
      lo < stations.length - 1 &&
      Math.abs(stations[lo + 1].sc - tr.s) < Math.abs(stations[lo].sc - tr.s)
    ) {
      lo++;
    }
    return lo;
  }

  function aimVault(k: number) {
    const P = pose(stations[k].sc, { x: 0, z: 0, h: 0 });
    const d = tr.dir;
    toWorld(P, d * 36, 2.75, d * 4.85, camera.position);
    toWorld(P, -d * 6, 1.85, d * 1.5, controls.target);
    controls.update();
  }

  function setView(v: 'vault' | 'ride') {
    view = v;
    focusKey = '';
    viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rideView === v)));
    controls.enabled = v === 'vault';
    camera.fov = v === 'ride' ? 62 : 52;
    camera.updateProjectionMatrix();
    syncCarVisibility(v);
    eiffelBtn.hidden = v !== 'ride' || !route.open.tower;
  }

  ROUTES.forEach((r) => {
    const o = document.createElement('option');
    o.value = r.key;
    const a = r.stations[0].name;
    const b = r.stations[r.stations.length - 1].name;
    const prefix = isRerLineNum(r.num) ? 'RER' : 'Ligne';
    o.textContent = `${prefix} ${r.num}${r.branch ? ` (${r.branch})` : ''} · ${a} – ${b}`;
    sel.appendChild(o);
  });

  function resolveStationIndex(stationName?: string): number {
    if (!stationName) return 0;
    const needle = normalizeStr(stationName);
    if (!needle) return 0;
    const exact = stations.findIndex((s) => normalizeStr(s.name) === needle);
    if (exact >= 0) return exact;
    const partial = stations.findIndex((s) => {
      const hay = normalizeStr(s.name);
      return hay.includes(needle) || needle.includes(hay);
    });
    return partial >= 0 ? partial : 0;
  }

  function resolveDirection(destName?: string, startIndex = 0): 1 | -1 {
    if (destName) {
      const destNorm = normalizeStr(destName);
      const firstNorm = normalizeStr(stations[0].name);
      const lastNorm = normalizeStr(stations[stations.length - 1].name);
      if (firstNorm.includes(destNorm) || destNorm.includes(firstNorm)) return -1;
      if (lastNorm.includes(destNorm) || destNorm.includes(lastNorm)) return 1;
    }
    return startIndex >= stations.length - 1 ? -1 : 1;
  }

  let badgeTex: THREE.CanvasTexture | null = null;
  function setRoute(key: string, stationName?: string, destName?: string) {
    route = ROUTES.find((r) => r.key === key) || ROUTES[0];
    sel.value = route.key;
    [badge, boardBadge].forEach((el) => {
      el.textContent = route.num;
      el.style.background = route.bg;
      el.style.color = route.fg;
    });
    clearAll();
    if (badgeTex) badgeTex.dispose();
    if (badgeMat) badgeMat.dispose();
    badgeTex = new THREE.CanvasTexture(badgeCanvas(route));
    badgeTex.wrapS = THREE.RepeatWrapping;
    badgeTex.wrapT = THREE.RepeatWrapping;
    badgeTex.colorSpace = THREE.SRGBColorSpace;
    badgeTex.anisotropy = maxAniso;
    badgeMat = new THREE.MeshStandardMaterial({
      map: badgeTex,
      roughness: 0.2,
      envMapIntensity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
    });
    buildPath(route);

    const startIdx = resolveStationIndex(stationName);
    const dir = resolveDirection(destName, startIdx);
    const startSt = stations[startIdx];
    Object.assign(tr, {
      dir,
      cur: startIdx,
      v: 0,
      state: 'dwell' as const,
      dwell: 5.5,
      door: 0,
      s: startSt.sc + (dir * TRAIN_LEN) / 2,
      target: null,
    });
    liveLegKey = '';
    if (!stationName) liveTargetTrainId = null;
    eiffelGlance = false;
    cabYaw = 0;
    cabPitch = 0;
    eiffelBtn.setAttribute('aria-pressed', 'false');
    eiffelBtn.hidden = view !== 'ride' || !route.open.tower;

    planNext();
    setDest();
    applyTrainGlbForRoute(route);
    elBar.style.background = route.bg;
    focusKey = '';
    stream(startIdx - 2, startIdx + 2, 99);
    updateHud();
    options.onRouteChange?.(route.key);
  }

  function trackText(s: number) {
    const speedSuffix =
      liveMode && liveActive && latestLiveTrain
        ? ` · ${Math.round(latestLiveTrain.spd || 0)} km/h`
        : '';
    for (const st of stations) {
      if (s >= st.s0 && s <= st.s0 + SL) {
        return `${st.air ? 'Station aérienne' : 'Station souterraine'}${speedSuffix}`;
      }
    }
    const t = tunnels.find((item) => s >= item.s0 && s < item.s1);
    if (isOpen(s)) {
      const base =
        t && t.seine
          ? t.tower
            ? 'Traversée de la Seine · vue Tour Eiffel'
            : 'Traversée de la Seine'
          : 'Sur le viaduc, plein air';
      return `${base}${speedSuffix}`;
    }
    return `En tunnel${speedSuffix}`;
  }

  function updateHud() {
    const N = stations.length;
    const toward =
      liveMode && liveActive && latestLiveTrain?.dest
        ? latestLiveTrain.dest
        : tr.dir > 0
          ? stations[N - 1].name
          : stations[0].name;
    let now = '';
    let label = '';
    let next = '';
    if (tr.state === 'dwell') {
      label = 'À quai';
      now = stations[tr.cur].name;
    } else if (tr.target?.type === 'turn') {
      label = 'Manœuvre';
      now = 'Arrière-gare terminus';
    } else if (tr.target?.k !== undefined) {
      label = 'Prochaine';
      now = stations[tr.target.k].name;
    }
    let t: { type: 'stn' | 'turn'; k?: number } | null = null;
    if (tr.state === 'dwell') t = nextFrom(tr.cur, tr.dir);
    else if (tr.target?.type === 'stn' && tr.target.k !== undefined)
      t = nextFrom(tr.target.k, tr.dir);
    const nk = t && t.type === 'stn' && t.k !== undefined ? t.k : null;
    next =
      nk !== null
        ? stations[nk].name
        : tr.state !== 'dwell' && tr.target?.type === 'turn'
          ? tr.dir > 0
            ? stations[stations.length - 1].name
            : stations[0].name
          : 'Terminus, retournement';
    elNowLabel.textContent = label;
    elNow.textContent = now;
    elNext.textContent = next;
    elToward.textContent = toward;
    const k = focusStation();
    elPlaque.textContent = stations[k].name;
    elTrack.textContent = trackText(tr.s - (tr.dir * TRAIN_LEN) / 2);
    const denom = stations[N - 1].sc - stations[0].sc || 1;
    const frac = (tr.s - stations[0].sc) / denom;
    elBar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    eiffelBtn.hidden = view !== 'ride' || !route.open.tower;
    eiffelBtn.classList.toggle(
      'paris-ride-btn--highlight',
      Boolean(route.open.tower && camEnv === 'out')
    );
  }

  /* ---------- Event Listeners ---------- */
  const onViewClick = (ev: Event) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    const v = btn.dataset.rideView === 'vault' ? 'vault' : 'ride';
    setView(v);
  };
  viewButtons.forEach((b) => b.addEventListener('click', onViewClick));

  const onLiveClick = () => {
    liveMode = !liveMode;
    updateLiveUi();
  };
  liveBtn.addEventListener('click', onLiveClick);

  const onEiffelClick = () => {
    eiffelGlance = !eiffelGlance;
    eiffelBtn.setAttribute('aria-pressed', String(eiffelGlance));
    if (!eiffelGlance) {
      cabYaw = 0;
      cabPitch = 0;
    }
  };
  eiffelBtn.addEventListener('click', onEiffelClick);

  const onPauseClick = () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? 'Reprendre' : 'Pause';
  };
  pauseBtn.addEventListener('click', onPauseClick);

  const onSpeedClick = () => {
    liveMode = false;
    updateLiveUi();
    speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    speedBtn.textContent = `${speed}×`;
  };
  speedBtn.addEventListener('click', onSpeedClick);

  const onRouteSelect = () => {
    if (!route || sel.value !== route.key) {
      liveTargetTrainId = null;
      setRoute(sel.value);
    }
  };
  sel.addEventListener('change', onRouteSelect);

  const onExitClick = () => {
    options.onExit?.();
  };
  exitBtn.addEventListener('click', onExitClick);

  let draggingCab = false;
  let lastPtrX = 0;
  let lastPtrY = 0;
  const onCanvasPointerDown = (e: PointerEvent) => {
    if (view !== 'ride') return;
    draggingCab = true;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  };
  const onCanvasPointerMove = (e: PointerEvent) => {
    if (!draggingCab || view !== 'ride') return;
    const dx = e.clientX - lastPtrX;
    const dy = e.clientY - lastPtrY;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    eiffelGlance = false;
    eiffelBtn.setAttribute('aria-pressed', 'false');
    cabYaw = Math.max(-1.85, Math.min(1.85, cabYaw - dx * 0.0045));
    cabPitch = Math.max(-0.25, Math.min(0.75, cabPitch + dy * 0.0035));
  };
  const onCanvasPointerUp = (e: PointerEvent) => {
    draggingCab = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  };
  const onCanvasDblClick = () => {
    if (view !== 'ride') return;
    cabYaw = 0;
    cabPitch = 0;
    eiffelGlance = false;
    eiffelBtn.setAttribute('aria-pressed', 'false');
  };
  renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
  renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
  renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);
  renderer.domElement.addEventListener('pointercancel', onCanvasPointerUp);
  renderer.domElement.addEventListener('dblclick', onCanvasDblClick);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      options.onExit?.();
    }
  };
  window.addEventListener('keydown', onKeyDown, true);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  /* ---------- Bootstrap & Render Loop ---------- */
  const initialRouteKey = resolveRideRouteKey(options.initialLine, options.initialDest);
  setRoute(initialRouteKey, options.initialStation, options.initialDest);
  setView(options.initialView ?? 'ride');
  updateLiveUi();

  const camLocal = new THREE.Vector3(L / 2 - 1.0, BY + 1.62, 0.5);
  const lookLocal = new THREE.Vector3(L / 2 + 30, BY + 1.2, 0.5);
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const clock = new THREE.Clock();
  let hudT = 0;

  renderer.setAnimationLoop(() => {
    if (disposed) return;
    const dt = Math.min(0.05, clock.getDelta());
    if (!paused) {
      if (liveMode && latestLiveTrain) {
        stepLiveTrain(latestLiveTrain, dt);
      } else {
        for (let i = 0; i < speed; i++) stepTrain(dt);
      }
    }
    poseTrain();
    const near = nearestStation();
    const fk = focusStation();
    const streamRadius = isMobileGpu ? 1 : 2;
    stream(
      Math.min(near, fk) - streamRadius,
      Math.max(near, fk) + streamRadius,
      isMobileGpu ? 1 : 2
    );
    if (view === 'vault') {
      const key = `${fk}:${tr.dir}`;
      if (key !== focusKey) {
        focusKey = key;
        aimVault(fk);
      }
      placeLights(fk);
      controls.update();
      applyEnv(stations[fk].sc, dt);
    } else {
      placeLights(near);
      const car = tr.cars[0].outer;
      car.updateMatrixWorld(true);
      car.localToWorld(tmpA.copy(camLocal));
      car.localToWorld(tmpB.copy(lookLocal));
      const fwdDir = tmpB.sub(tmpA).normalize();
      if (eiffelGlance && towerWorldPos) {
        const toTower = tmpC.copy(towerWorldPos).sub(tmpA).normalize();
        fwdDir.copy(toTower);
      } else {
        if (Math.abs(cabYaw) > 0.0001) fwdDir.applyAxisAngle(WORLD_UP, cabYaw);
        if (Math.abs(cabPitch) > 0.0001) {
          fwdDir.y = Math.max(-0.55, Math.min(0.88, fwdDir.y + cabPitch));
          fwdDir.normalize();
        }
      }
      camera.position.copy(tmpA);
      camera.lookAt(tmpB.copy(tmpA).addScaledVector(fwdDir, 30));
      applyEnv(tr.s - tr.dir * 1.5, dt);
    }
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.25;
      updateHud();
    }
    renderer.render(scene, camera);
  });

  return {
    setRoute,
    setView,
    syncFromSimulation,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (veilTimeout) clearTimeout(veilTimeout);
      renderer.setAnimationLoop(null);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove);
      renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onCanvasPointerUp);
      renderer.domElement.removeEventListener('dblclick', onCanvasDblClick);
      viewButtons.forEach((b) => b.removeEventListener('click', onViewClick));
      liveBtn.removeEventListener('click', onLiveClick);
      eiffelBtn.removeEventListener('click', onEiffelClick);
      pauseBtn.removeEventListener('click', onPauseClick);
      speedBtn.removeEventListener('click', onSpeedClick);
      sel.removeEventListener('change', onRouteSelect);
      exitBtn.removeEventListener('click', onExitClick);
      controls.dispose();
      clearAll();
      if (badgeTex) badgeTex.dispose();
      if (badgeMat) badgeMat.dispose();
      if (destTex) destTex.dispose();
      textures.forEach((t) => t.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      if (envTarget) envTarget.dispose();
      renderer.dispose();
      root.remove();
    },
  };
}
