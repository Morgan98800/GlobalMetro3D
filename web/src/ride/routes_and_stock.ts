import type { StationDeparture } from '@core/sim/browser_engine';
import type { TrainMarker } from '@core/ui/map/trains_layer';

export interface ParisRideOptions {
  initialLine?: string;
  initialDest?: string;
  initialStation?: string;
  initialTrainId?: string;
  initialView?: 'ride' | 'vault' | 'passenger';
  initialDriveMode?: boolean;
  initialStockGlb?: { cab: string; car: string; label?: string; sprague?: boolean };
  getStationDepartures?: (stationName: string) => StationDeparture[];
  onExit?: () => void;
  onRouteChange?: (routeKey: string) => void;
}

export interface ParisRideHandle {
  setRoute: (key: string, stationName?: string, destName?: string) => void;
  setView: (view: 'vault' | 'ride' | 'passenger') => void;
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

export interface RouteStationDef {
  name: string;
  flag: '' | 'f' | 'b';
  air: boolean;
}

export interface RouteDef {
  key: string;
  num: string;
  bg: string;
  fg: string;
  branch?: string;
  open: {
    air?: string[];
    seine?: [string, string][];
    tower?: [string, string];
    austerlitzArch?: [string, string];
    bastilleColumn?: string;
    grandeArche?: string;
  };
  stations: RouteStationDef[];
}

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
    bg: '#FFCE00',
    fg: '#25303B',
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
    bg: '#0064B0',
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
    bg: '#9C9522',
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
    bg: '#98D4E2',
    fg: '#25303B',
    st: ['Gambetta', 'Pelleport', 'Saint-Fargeau', 'Porte des Lilas'],
  },
  {
    key: '4',
    num: '4',
    bg: '#C04191',
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
    bg: '#F28E42',
    fg: '#25303B',
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
    bg: '#83C491',
    fg: '#25303B',
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
    bg: '#F3A4BA',
    fg: '#25303B',
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
    bg: '#F3A4BA',
    fg: '#25303B',
    branch: 'Branche Ivry',
    st: T7.concat(['Porte de Choisy', 'Porte d’Ivry', 'Pierre et Marie Curie', 'Mairie d’Ivry']),
  },
  {
    key: '7bis',
    num: '7bis',
    bg: '#83C491',
    fg: '#25303B',
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
    bg: '#CEADD2',
    fg: '#25303B',
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
    bg: '#D5C900',
    fg: '#25303B',
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
    bg: '#E3B32A',
    fg: '#25303B',
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
    bg: '#8D5E2A',
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
    bg: '#00814F',
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
    bg: '#98D4E2',
    fg: '#25303B',
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
    bg: '#98D4E2',
    fg: '#25303B',
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
    bg: '#662483',
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
    bg: '#E3051C',
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
    bg: '#5291CE',
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
    bg: '#FFCE00',
    fg: '#25303B',
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
    bg: '#00814F',
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
    bg: '#C04191',
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
  {
    air?: string[];
    seine?: [string, string][];
    tower?: [string, string];
    austerlitzArch?: [string, string];
    bastilleColumn?: string;
    grandeArche?: string;
  }
> = {
  '1': {
    air: ['Pont de Neuilly', 'Bastille'],
    bastilleColumn: 'Bastille',
    grandeArche: 'Pont de Neuilly',
  },
  '2': { air: ['Barbès – Rochechouart', 'La Chapelle', 'Stalingrad', 'Jaurès'] },
  '5': {
    air: ['Quai de la Rapée', 'Gare d’Austerlitz'],
    seine: [['Quai de la Rapée', 'Gare d’Austerlitz']],
    austerlitzArch: ['Quai de la Rapée', 'Gare d’Austerlitz'],
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
  A: {
    air: ['Nanterre-Préfecture', 'Vincennes', 'Val de Fontenay'],
    grandeArche: 'Nanterre-Préfecture',
  },
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

export interface ParisRollingStockSpec {
  id: string;
  label: string;
  driverless: boolean;
  hasPsd: boolean;
  boa: boolean;
  bodyHex: number;
  firstClassBodyHex?: number;
  stripeHex: number;
  roofHex: number;
  floorHex: number;
  seatHex: number;
  liningHex: number;
  ceilingTint: [number, number, number];
}

export function resolveParisStockSpec(
  lineNumOrKey: string,
  spragueMode = false
): ParisRollingStockSpec {
  if (spragueMode) {
    return {
      id: 'sprague_1930',
      label: 'Sprague 1930',
      driverless: false,
      hasPsd: false,
      boa: false,
      bodyHex: 0x24513c,
      firstClassBodyHex: 0x7e1f1d,
      stripeHex: 0xd8c38a,
      roofHex: 0x3b3d3f,
      floorHex: 0x3a2a1f,
      seatHex: 0x6e4426,
      liningHex: 0x6e4426,
      ceilingTint: [1.9, 1.65, 1.2],
    };
  }
  const up = lineNumOrKey
    .trim()
    .toUpperCase()
    .replace(/^RER\s+/, '');
  if (up === 'A' || up === 'B' || up === 'C' || up === 'D' || up === 'E') {
    return {
      id: `rer_${up}`,
      label: up === 'A' ? 'MI 09' : up === 'B' ? 'MI 79' : up === 'E' ? 'RER NG' : 'Z 2N / RER',
      driverless: false,
      hasPsd: false,
      boa: up === 'E',
      bodyHex: 0xf2f3f5,
      stripeHex: up === 'E' ? 0x00a3a6 : 0x18294b,
      roofHex: 0x454a52,
      floorHex: 0x2a2f36,
      seatHex: 0x1e4d92,
      liningHex: 0xd9dde2,
      ceilingTint: [1.65, 1.72, 1.82],
    };
  }
  if (up === '14' || up === '4') {
    return {
      id: up === '4' ? 'mp89_ca' : 'mp14_ca',
      label: up === '4' ? 'MP 89 CA / MP 14 CA' : 'MP 14 CA',
      driverless: true,
      hasPsd: true,
      boa: true,
      bodyHex: 0xf4f4f2,
      stripeHex: 0x00a3a6,
      roofHex: 0x4b5158,
      floorHex: 0x31363c,
      seatHex: 0x008b8d,
      liningHex: 0xe6e7e9,
      ceilingTint: [1.7, 1.76, 1.82],
    };
  }
  if (up === '11') {
    return {
      id: 'mp14_cc',
      label: 'MP 14 CC',
      driverless: false,
      hasPsd: false,
      boa: true,
      bodyHex: 0xf4f4f2,
      stripeHex: 0x00a3a6,
      roofHex: 0x4b5158,
      floorHex: 0x31363c,
      seatHex: 0x008b8d,
      liningHex: 0xe6e7e9,
      ceilingTint: [1.7, 1.76, 1.82],
    };
  }
  if (up === '1') {
    return {
      id: 'mp05_ca',
      label: 'MP 05 CA',
      driverless: true,
      hasPsd: true,
      boa: true,
      bodyHex: 0xf2efe9,
      stripeHex: 0x008a8a,
      roofHex: 0x464a4e,
      floorHex: 0x383a3d,
      seatHex: 0x1f7a6e,
      liningHex: 0xe3e2dc,
      ceilingTint: [1.78, 1.78, 1.74],
    };
  }
  if (up === '6') {
    return {
      id: 'mp89_cc',
      label: 'MP 89 CC',
      driverless: false,
      hasPsd: false,
      boa: true,
      bodyHex: 0xf0eee8,
      stripeHex: 0x008a8a,
      roofHex: 0x45494e,
      floorHex: 0x36393d,
      seatHex: 0x2d5fa0,
      liningHex: 0xdeddd8,
      ceilingTint: [1.72, 1.72, 1.66],
    };
  }
  if (up === '2' || up === '5' || up === '9') {
    return {
      id: 'mf01',
      label: 'MF 01',
      driverless: false,
      hasPsd: false,
      boa: true,
      bodyHex: 0xf1f1ee,
      stripeHex: up === '9' ? 0x00a3a6 : 0x008a8a,
      roofHex: 0x4d5257,
      floorHex: 0x35393e,
      seatHex: 0x007e82,
      liningHex: 0xe0e1e4,
      ceilingTint: [1.74, 1.76, 1.78],
    };
  }
  if (up === '7BIS' || up === '7B') {
    return {
      id: 'mf88',
      label: 'MF 88',
      driverless: false,
      hasPsd: false,
      boa: true,
      bodyHex: 0xf1f1ee,
      stripeHex: 0x008a8a,
      roofHex: 0x4d5257,
      floorHex: 0x36393d,
      seatHex: 0xb5322c,
      liningHex: 0xe0e1e4,
      ceilingTint: [1.74, 1.74, 1.72],
    };
  }
  if (up === '10') {
    return {
      id: 'mf19',
      label: 'MF 19',
      driverless: false,
      hasPsd: false,
      boa: true,
      bodyHex: 0xf3f5f8,
      stripeHex: 0x009cde,
      roofHex: 0x454a52,
      floorHex: 0x2c323b,
      seatHex: 0x0072b2,
      liningHex: 0xe5e8ed,
      ceilingTint: [1.72, 1.78, 1.84],
    };
  }
  if (up === '7' || up === '8' || up === '13') {
    return {
      id: 'mf77',
      label: 'MF 77',
      driverless: false,
      hasPsd: false,
      boa: false,
      bodyHex: 0xf3f1ec,
      stripeHex: 0x1e4d92,
      roofHex: 0x52565c,
      floorHex: 0x3c3b39,
      seatHex: 0x2d5fa0,
      liningHex: 0xd9d8d2,
      ceilingTint: [1.82, 1.75, 1.62],
    };
  }
  return {
    id: 'mf67',
    label: 'MF 67',
    driverless: false,
    hasPsd: false,
    boa: false,
    bodyHex: 0x2c5b94,
    stripeHex: 0xf2efe6,
    roofHex: 0x4d5054,
    floorHex: 0x383430,
    seatHex: 0xc8352b,
    liningHex: 0xdad5c7,
    ceilingTint: [1.85, 1.72, 1.48],
  };
}

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

export function getLibraryGlbUrlsForLine(lineNumOrKey: string): {
  cab: string;
  car: string;
} {
  const upper = lineNumOrKey
    .trim()
    .toUpperCase()
    .replace(/^RER\s+/, '')
    .replace(/^M/, '');
  switch (upper) {
    case '1':
      return {
        cab: '/models/train/library/mp05_cab.glb',
        car: '/models/train/library/mp05_car.glb',
      };
    case '2':
    case '5':
    case '9':
      return {
        cab: '/models/train/library/mf01_cab.glb',
        car: '/models/train/library/mf01_car.glb',
      };
    case '3':
    case '3BIS':
    case '12':
      return {
        cab: '/models/train/library/mf67_cab.glb',
        car: '/models/train/library/mf67_car.glb',
      };
    case '10':
      return {
        cab: '/models/train/library/mf19_cab.glb',
        car: '/models/train/library/mf19_car.glb',
      };
    case '4':
      return {
        cab: '/models/train/library/mp89_ca_cab.glb',
        car: '/models/train/library/mp89_car.glb',
      };
    case '6':
      return {
        cab: '/models/train/library/mp89_cc_cab.glb',
        car: '/models/train/library/mp89_car.glb',
      };
    case '7':
    case '8':
    case '13':
      return {
        cab: '/models/train/library/mf77_cab.glb',
        car: '/models/train/library/mf77_car.glb',
      };
    case '7BIS':
      return {
        cab: '/models/train/library/mf88_cab.glb',
        car: '/models/train/library/mf88_car.glb',
      };
    case '11':
      return {
        cab: '/models/train/library/mp14_cc_cab.glb',
        car: '/models/train/library/mp14_car.glb',
      };
    case '14':
      return {
        cab: '/models/train/library/mp14_ca_cab.glb',
        car: '/models/train/library/mp14_car.glb',
      };
    case 'A':
      return {
        cab: '/models/train/library/rer_a_mi09_cab.glb',
        car: '/models/train/library/rer_a_mi09_car.glb',
      };
    case 'B':
      return {
        cab: '/models/train/library/rer_b_mi79_cab.glb',
        car: '/models/train/library/rer_b_mi79_car.glb',
      };
    case 'C':
      return {
        cab: '/models/train/library/rer_c_z2n_cab.glb',
        car: '/models/train/library/rer_c_z2n_car.glb',
      };
    case 'D':
      return {
        cab: '/models/train/library/rer_d_z20500_cab.glb',
        car: '/models/train/library/rer_d_z20500_car.glb',
      };
    case 'E':
      return {
        cab: '/models/train/library/rer_e_rerng_cab.glb',
        car: '/models/train/library/rer_e_rerng_car.glb',
      };
    default:
      return {
        cab: '/models/train/library/mf01_cab.glb',
        car: '/models/train/library/mf01_car.glb',
      };
  }
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

export function normalizeStr(v: string): string {
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

export interface SielRow {
  dest: string;
  eta: string;
}

export interface DualSielBoards {
  pos: { heading: string; rows: SielRow[] };
  neg: { heading: string; rows: SielRow[] };
}

export function formatSielWaitTime(dep: Pick<StationDeparture, 'atStop' | 'waitSeconds'>): string {
  if (dep.atStop || dep.waitSeconds <= 20) return 'À quai';
  if (dep.waitSeconds < 60) return '< 1 min';
  return `${Math.max(1, Math.round(dep.waitSeconds / 60))} min`;
}

function destMatchesHeading(dest: string, heading: string): boolean {
  const a = normalizeStr(dest);
  const b = normalizeStr(heading);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const firstWordA = a.split(' ').find((w) => w.length >= 4);
  const firstWordB = b.split(' ').find((w) => w.length >= 4);
  return Boolean(firstWordA && firstWordB && (a.includes(firstWordB) || b.includes(firstWordA)));
}

export function selectDualSielBoards(params: {
  departures: readonly StationDeparture[];
  lineNum: string;
  posDest: string;
  negDest: string;
  simDir: 1 | -1;
  simState: 'dwell' | 'run';
  simKmh: number;
  counterEtaText: string;
}): DualSielBoards {
  const { departures, lineNum, posDest, negDest, simDir, simState, simKmh, counterEtaText } =
    params;
  const normLine = lineNum
    .trim()
    .toLowerCase()
    .replace(/^rer\s+/, '');
  const matching = departures
    .filter(
      (d) =>
        d.lineShortName
          .trim()
          .toLowerCase()
          .replace(/^rer\s+/, '') === normLine
    )
    .slice()
    .sort((a, b) => a.waitSeconds - b.waitSeconds);

  const posDeps: StationDeparture[] = [];
  const negDeps: StationDeparture[] = [];
  let dir0Side: 'pos' | 'neg' | null = null;
  for (const dep of matching) {
    const matchPos = destMatchesHeading(dep.destName, posDest);
    const matchNeg = destMatchesHeading(dep.destName, negDest);
    if (matchPos && !matchNeg) {
      dir0Side = dep.direction === 0 ? 'pos' : 'neg';
      break;
    }
    if (matchNeg && !matchPos) {
      dir0Side = dep.direction === 0 ? 'neg' : 'pos';
      break;
    }
  }
  for (const dep of matching) {
    const matchPos = destMatchesHeading(dep.destName, posDest);
    const matchNeg = destMatchesHeading(dep.destName, negDest);
    if (matchPos && !matchNeg) {
      posDeps.push(dep);
    } else if (matchNeg && !matchPos) {
      negDeps.push(dep);
    } else {
      const target = dir0Side
        ? dep.direction === 0
          ? dir0Side
          : dir0Side === 'pos'
            ? 'neg'
            : 'pos'
        : dep.direction === 0
          ? 'pos'
          : 'neg';
      (target === 'pos' ? posDeps : negDeps).push(dep);
    }
  }

  const buildRows = (
    deps: StationDeparture[],
    fallbackHeading: string,
    primaryEta: string,
    secondaryEta: string
  ): SielRow[] => {
    if (deps.length >= 2) {
      return deps.slice(0, 2).map((d) => ({
        dest: d.destName.toUpperCase(),
        eta: formatSielWaitTime(d),
      }));
    }
    if (deps.length === 1) {
      const firstEta = formatSielWaitTime(deps[0]);
      const nextMin = Math.max(3, Math.round(deps[0].waitSeconds / 60) + 4);
      return [
        { dest: deps[0].destName.toUpperCase(), eta: firstEta },
        { dest: deps[0].destName.toUpperCase(), eta: `${nextMin} min` },
      ];
    }
    return [
      { dest: fallbackHeading.toUpperCase(), eta: primaryEta },
      { dest: fallbackHeading.toUpperCase(), eta: secondaryEta },
    ];
  };

  const simPrimaryEta = simState === 'dwell' ? 'À quai' : simKmh > 0 ? '1 min' : 'À l’approche';
  const simSecondaryEta = simState === 'dwell' ? '4 min' : '5 min';
  const oppSecondaryEta = counterEtaText === 'À quai' ? '4 min' : '5 min';

  return {
    pos: {
      heading: posDest.toUpperCase(),
      rows: buildRows(
        posDeps,
        posDest,
        simDir > 0 ? simPrimaryEta : counterEtaText,
        simDir > 0 ? simSecondaryEta : oppSecondaryEta
      ),
    },
    neg: {
      heading: negDest.toUpperCase(),
      rows: buildRows(
        negDeps,
        negDest,
        simDir < 0 ? simPrimaryEta : counterEtaText,
        simDir < 0 ? simSecondaryEta : oppSecondaryEta
      ),
    },
  };
}

export function shouldUseDetailedCarMesh(params: {
  view: 'vault' | 'ride';
  glbStatus: 'loading' | 'ready' | 'failed';
  doorOpen: number;
  spragueMode: boolean;
}): boolean {
  return (
    params.view === 'ride' ||
    params.view === 'vault' ||
    params.spragueMode ||
    params.glbStatus !== 'ready' ||
    params.doorOpen > 0.01
  );
}
