export interface StationExit {
  num: string;
  label: string;
  landmark?: string;
}

export interface GuimardInfo {
  style: 'édicule' | 'entourage' | 'entourage-écussons';
  year: number;
  note: string;
}

export interface StationHeritage {
  exits: StationExit[];
  guimard: GuimardInfo | null;
}

/**
 * Normalise un nom de station RATP pour tolérer les variantes d'accents,
 * de tirets (-, –, —), d'apostrophes (' / ’) et d'espaces.
 */
export function normalizeStationKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—'’ʻ·/.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const PARIS_STATION_EXITS: Record<string, StationExit[]> = {
  Châtelet: [
    { num: '1', label: 'Place du Châtelet', landmark: 'Théâtre du Châtelet' },
    { num: '2', label: 'Avenue Victoria', landmark: 'Théâtre de la Ville' },
    { num: '3', label: 'Rue Saint-Denis' },
    { num: '4', label: 'Rue de Rivoli', landmark: 'Tour Saint-Jacques' },
    { num: '5', label: 'Place Sainte-Opportune', landmark: 'Édicule Guimard' },
    { num: '6', label: 'Rue des Lavandières-Sainte-Opportune' },
    { num: '7', label: 'Rue Bertin-Poirée' },
    { num: '10', label: 'Place de l’Hôtel de Ville', landmark: 'Hôtel de Ville' },
    { num: '12', label: 'Quai de la Mégisserie', landmark: 'Pont au Change' },
    { num: '14', label: 'Rue des Halles' },
  ],
  'Châtelet – Les Halles': [
    { num: '1', label: 'Porte Marguerite de Navarre', landmark: 'Forum des Halles' },
    { num: '2', label: 'Porte Lescot', landmark: 'Canopée des Halles' },
    { num: '3', label: 'Porte Rambuteau', landmark: 'Centre Pompidou' },
    { num: '4', label: 'Porte Saint-Eustache', landmark: 'Église Saint-Eustache' },
    { num: '5', label: 'Porte Berger', landmark: 'Fontaine des Innocents' },
    { num: '6', label: 'Porte du Jour', landmark: 'Bourse de Commerce' },
    { num: '7', label: 'Place Carrée' },
    { num: '8', label: 'Rue de Turbigo' },
    { num: '11', label: 'Rue Pierre Lescot' },
  ],
  'Gare du Nord': [
    { num: '1', label: 'Rue de Dunkerque', landmark: 'Parvis Gare du Nord' },
    { num: '2', label: 'Boulevard de Denain' },
    { num: '3', label: 'Rue du Faubourg-Saint-Denis' },
    { num: '4', label: 'Rue de Maubeuge' },
    { num: '5', label: 'Boulevard de Magenta', landmark: 'Hôpital Lariboisière' },
    { num: '6', label: 'Rue Saint-Vincent-de-Paul' },
    { num: '7', label: 'Rue de Compiègne', landmark: 'Dépose-minute Eurostar' },
  ],
  'Gare de Lyon': [
    { num: '1', label: 'Boulevard Diderot', landmark: 'Tour de l’Horloge' },
    { num: '2', label: 'Rue de Bercy' },
    { num: '3', label: 'Rue Chalon' },
    { num: '4', label: 'Place Louis-Armand', landmark: 'Hall 1 & Grandes Lignes' },
    { num: '5', label: 'Cour de Chalon' },
    { num: '6', label: 'Avenue Daumesnil', landmark: 'Coulée verte' },
    { num: '9', label: 'Place Henri-Frenay' },
    { num: '13', label: 'Rue Van-Gogh', landmark: 'Quai de la Rapée' },
  ],
  'Saint-Lazare': [
    { num: '1', label: 'Cour de Rome', landmark: 'Parvis Gare Saint-Lazare' },
    { num: '2', label: 'Place du Havre' },
    { num: '3', label: 'Rue du Havre', landmark: 'Grands Magasins' },
    { num: '4', label: 'Cour du Havre' },
    { num: '5', label: 'Passage du Havre' },
    { num: '6', label: 'Rue Saint-Lazare' },
    { num: '7', label: 'Rue d’Amsterdam' },
    { num: '8', label: 'Rue de Rome' },
    { num: '9', label: 'Place Gabriel-Péri' },
    { num: '10', label: 'Rue de l’Arcade' },
  ],
  'Montparnasse – Bienvenüe': [
    { num: '1', label: 'Place Raoul-Dautry', landmark: 'Gare Montparnasse' },
    { num: '2', label: 'Place Bienvenüe' },
    { num: '4', label: 'Boulevard du Montparnasse', landmark: 'Tour Montparnasse' },
    { num: '5', label: 'Boulevard Edgar-Quinet', landmark: 'Cimetière du Montparnasse' },
    { num: '6', label: 'Rue du Départ' },
    { num: '7', label: 'Rue d’Odessa' },
    { num: '8', label: 'Rue de Rennes' },
  ],
  République: [
    { num: '1', label: 'Place de la République', landmark: 'Monument à la République' },
    { num: '2', label: 'Avenue de la République' },
    { num: '3', label: 'Boulevard Voltaire' },
    { num: '4', label: 'Rue du Faubourg-du-Temple', landmark: 'Canal Saint-Martin' },
    { num: '5', label: 'Boulevard de Magenta' },
    { num: '6', label: 'Boulevard Saint-Martin' },
    { num: '7', label: 'Rue du Temple' },
    { num: '8', label: 'Boulevard du Temple' },
    { num: '9', label: 'Rue René-Boulanger' },
  ],
  Nation: [
    { num: '1', label: 'Place de la Nation', landmark: 'Triomphe de la République' },
    { num: '2', label: 'Avenue du Trône', landmark: 'Colonnes du Trône' },
    { num: '3', label: 'Cours de Vincennes' },
    { num: '4', label: 'Boulevard Voltaire' },
    { num: '5', label: 'Rue du Faubourg-Saint-Antoine' },
    { num: '6', label: 'Boulevard Diderot' },
    { num: '7', label: 'Avenue Dorian' },
  ],
  Bastille: [
    { num: '1', label: 'Rue de la Roquette' },
    { num: '2', label: 'Rue du Faubourg-Saint-Antoine' },
    { num: '3', label: 'Rue de Lyon', landmark: 'Opéra Bastille' },
    { num: '4', label: 'Boulevard Henri-IV', landmark: 'Port de l’Arsenal' },
    { num: '5', label: 'Boulevard Bourdon' },
    { num: '6', label: 'Boulevard Beaumarchais', landmark: 'Colonne de Juillet' },
    { num: '7', label: 'Boulevard Richard-Lenoir' },
    { num: '8', label: 'Rue Saint-Antoine' },
  ],
  'Charles de Gaulle – Étoile': [
    { num: '1', label: 'Avenue des Champs-Élysées', landmark: 'Arc de Triomphe' },
    { num: '2', label: 'Avenue de Friedland' },
    { num: '3', label: 'Avenue Hoche' },
    { num: '4', label: 'Avenue de Wagram' },
    { num: '5', label: 'Avenue Carnot' },
    { num: '6', label: 'Avenue de la Grande-Armée' },
    { num: '7', label: 'Avenue Foch' },
    { num: '8', label: 'Avenue Victor-Hugo' },
    { num: '9', label: 'Avenue Kléber' },
    { num: '10', label: 'Avenue Marceau' },
  ],
  Opéra: [
    { num: '1', label: 'Place de l’Opéra', landmark: 'Palais Garnier' },
    { num: '2', label: 'Avenue de l’Opéra' },
    { num: '3', label: 'Rue Scribe', landmark: 'Boulevard Haussmann' },
    { num: '4', label: 'Rue de la Paix', landmark: 'Place Vendôme' },
    { num: '5', label: 'Rue Halévy' },
  ],
  Concorde: [
    { num: '1', label: 'Place de la Concorde', landmark: 'Obélisque de Louxor' },
    { num: '2', label: 'Rue de Rivoli', landmark: 'Jardin des Tuileries' },
    { num: '3', label: 'Rue Royale', landmark: 'Hôtel de la Marine' },
    { num: '4', label: 'Rue Cambon' },
    { num: '5', label: 'Rue Saint-Florentin' },
    { num: '6', label: 'Cours la Reine', landmark: 'Pont de la Concorde' },
    { num: '7', label: 'Avenue Gabriel' },
  ],
  Trocadéro: [
    { num: '1', label: 'Avenue Paul-Doumer', landmark: 'Cimetière de Passy' },
    { num: '2', label: 'Avenue Kléber' },
    { num: '3', label: 'Avenue du Président-Wilson', landmark: 'Palais de Chaillot' },
    { num: '4', label: 'Avenue Georges-Mandel' },
    { num: '5', label: 'Avenue d’Eylau' },
    { num: '6', label: 'Esplanade du Trocadéro', landmark: 'Vue Tour Eiffel' },
  ],
  'Bir-Hakeim': [
    { num: '1', label: 'Boulevard de Grenelle', landmark: 'Tour Eiffel & Champ-de-Mars' },
    { num: '2', label: 'Quai Branly' },
    { num: '3', label: 'Place des Martyrs-Juifs-du-Vélodrome-d’Hiver' },
  ],
  Passy: [
    { num: '1', label: 'Rue de l’Alboni', landmark: 'Pont de Bir-Hakeim' },
    { num: '2', label: 'Avenue du Président-Kennedy', landmark: 'Maison de la Radio' },
  ],
  'Louvre – Rivoli': [
    { num: '1', label: 'Rue de Rivoli', landmark: 'Musée du Louvre · Cour Carrée' },
    { num: '2', label: 'Rue du Louvre', landmark: 'Saint-Germain-l’Auxerrois' },
  ],
  'Palais Royal – Musée du Louvre': [
    { num: '1', label: 'Place du Palais-Royal', landmark: 'Conseil d’État' },
    { num: '2', label: 'Place Colette', landmark: 'Comédie-Française · Kiosque des Noctambules' },
    { num: '3', label: 'Rue de Rivoli', landmark: 'Pyramide du Louvre' },
    { num: '4', label: 'Rue Saint-Honoré' },
    { num: '5', label: 'Carrousel du Louvre', landmark: 'Accès direct Musée' },
  ],
  Abbesses: [{ num: '1', label: 'Place des Abbesses', landmark: 'Sacré-Cœur · Édicule Guimard' }],
  'Porte Dauphine': [
    { num: '1', label: 'Avenue Foch', landmark: 'Édicule Guimard « Libellule »' },
    { num: '2', label: 'Avenue Bugeaud' },
    { num: '3', label: 'Boulevard Lannes', landmark: 'Université Paris-Dauphine' },
    { num: '4', label: 'Place du Maréchal-de-Lattre-de-Tassigny', landmark: 'Bois de Boulogne' },
  ],
  Cité: [
    { num: '1', label: 'Place Louis-Lépine', landmark: 'Notre-Dame de Paris · Sainte-Chapelle' },
    { num: '2', label: 'Marché aux Fleurs', landmark: 'Préfecture de Police' },
  ],
  'Arts et Métiers': [
    { num: '1', label: 'Rue Réaumur', landmark: 'Musée des Arts et Métiers' },
    { num: '2', label: 'Rue de Turbigo' },
    { num: '3', label: 'Rue Beaubourg' },
  ],
  'Saint-Michel': [
    { num: '1', label: 'Place Saint-Michel', landmark: 'Fontaine Saint-Michel' },
    { num: '2', label: 'Place Saint-André-des-Arts', landmark: 'Quartier Latin' },
    { num: '3', label: 'Quai Saint-Michel', landmark: 'Notre-Dame · Bouquinistes' },
    { num: '4', label: 'Boulevard Saint-Michel' },
    { num: '5', label: 'Rue de la Huchette' },
  ],
  Odéon: [
    { num: '1', label: 'Boulevard Saint-Germain', landmark: 'Carrefour de l’Odéon' },
    { num: '2', label: 'Rue de l’École-de-Médecine', landmark: 'Théâtre de l’Odéon' },
    { num: '3', label: 'Rue Danton' },
  ],
  'Denfert-Rochereau': [
    { num: '1', label: 'Place Denfert-Rochereau', landmark: 'Les Catacombes de Paris' },
    { num: '2', label: 'Avenue du Général-Leclerc' },
    { num: '3', label: 'Boulevard Raspail', landmark: 'Fondation Cartier' },
    { num: '4', label: 'Avenue René-Coty' },
    { num: '5', label: 'Boulevard Saint-Jacques' },
  ],
  "Place d'Italie": [
    { num: '1', label: 'Boulevard Vincent-Auriol', landmark: 'Centre commercial Italie Deux' },
    { num: '2', label: 'Boulevard Auguste-Blanqui', landmark: 'Butte-aux-Cailles' },
    { num: '3', label: 'Avenue d’Italie' },
    { num: '4', label: 'Avenue des Gobelins', landmark: 'Mairie du 13e' },
  ],
  "Gare de l'Est": [
    { num: '1', label: 'Rue du 8-Mai-1945', landmark: 'Parvis Gare de l’Est' },
    { num: '2', label: 'Boulevard de Strasbourg' },
    { num: '3', label: 'Rue d’Alsace' },
    { num: '4', label: 'Rue du Faubourg-Saint-Martin' },
    { num: '5', label: 'Boulevard de Magenta' },
  ],
  "Gare d'Austerlitz": [
    { num: '1', label: 'Boulevard de l’Hôpital', landmark: 'Hôpital Pitié-Salpêtrière' },
    { num: '2', label: 'Cour Muséum', landmark: 'Jardin des Plantes' },
    { num: '3', label: 'Quai d’Austerlitz', landmark: 'Cité de la Mode et du Design' },
    { num: '4', label: 'Cour Seine', landmark: 'Pont Charles-de-Gaulle' },
  ],
  'Bibliothèque François Mitterrand': [
    { num: '1', label: 'Rue du Chevaleret' },
    { num: '2', label: 'Avenue de France', landmark: 'BnF François-Mitterrand' },
    { num: '3', label: 'Rue René-Goscinny', landmark: 'Cinéma MK2 Bibliothèque' },
  ],
  'La Défense': [
    { num: '1', label: 'Grande Arche', landmark: 'Parvis de La Défense' },
    { num: '2', label: 'Dôme — Les Quatre Temps' },
    { num: '3', label: 'Sortie Calder-Miró', landmark: 'CNIT' },
    { num: '4', label: 'Parvis de la Défense' },
    { num: '5', label: 'Cœur Transport', landmark: 'Correspondances RER / Transilien' },
    { num: '6', label: 'Boieldieu' },
  ],
  Pigalle: [
    { num: '1', label: 'Boulevard de Clichy', landmark: 'Place Pigalle' },
    { num: '2', label: 'Rue Frochot' },
    { num: '3', label: 'Boulevard de Rochechouart', landmark: 'La Cigale' },
  ],
  Anvers: [
    { num: '1', label: 'Boulevard de Rochechouart', landmark: 'Square Louise-Michel · Sacré-Cœur' },
  ],
  'Franklin D. Roosevelt': [
    { num: '1', label: 'Avenue des Champs-Élysées', landmark: 'Rond-Point des Champs-Élysées' },
    { num: '2', label: 'Avenue Montaigne', landmark: 'Théâtre du Rond-Point' },
    { num: '3', label: 'Rue Jean-Mermoz' },
    { num: '4', label: 'Rue Marbeuf' },
    { num: '5', label: 'Rue de Ponthieu' },
    { num: '6', label: 'Rue du Colisée' },
    { num: '7', label: 'Avenue Franklin-D.-Roosevelt', landmark: 'Grand Palais' },
  ],
  'Champs-Élysées – Clemenceau': [
    { num: '1', label: 'Place Clemenceau', landmark: 'Grand Palais & Petit Palais' },
    { num: '2', label: 'Avenue Winston-Churchill' },
    { num: '3', label: 'Avenue des Champs-Élysées', landmark: 'Palais de la Découverte' },
  ],
  'Strasbourg – Saint-Denis': [
    { num: '1', label: 'Boulevard Saint-Denis', landmark: 'Porte Saint-Denis' },
    { num: '2', label: 'Boulevard de Strasbourg' },
    { num: '3', label: 'Boulevard Saint-Martin', landmark: 'Porte Saint-Martin' },
    { num: '4', label: 'Boulevard de Bonne-Nouvelle' },
    { num: '5', label: 'Rue du Faubourg-Saint-Denis' },
    { num: '6', label: 'Rue Saint-Denis' },
  ],
  'Havre – Caumartin': [
    { num: '1', label: 'Rue du Havre', landmark: 'Printemps Haussmann' },
    { num: '2', label: 'Rue de Caumartin', landmark: 'Galeries Lafayette' },
    { num: '3', label: 'Boulevard Haussmann' },
    { num: '4', label: 'Rue Auber' },
  ],
  Monceau: [
    { num: '1', label: 'Boulevard de Courcelles', landmark: 'Parc Monceau · Rotonde de Chartres' },
  ],
  Liège: [
    { num: '1', label: 'Rue de Liège', landmark: 'Céramiques belges de Welkenraedt' },
    { num: '2', label: 'Rue d’Amsterdam' },
  ],
};

export const GUIMARD_STATIONS: Record<string, GuimardInfo> = {
  'Porte Dauphine': {
    style: 'édicule',
    year: 1900,
    note: 'Édicule « libellule » à verrière en éventail d’origine, classé Monument historique.',
  },
  Abbesses: {
    style: 'édicule',
    year: 1900,
    note: 'Édicule « libellule » déplacé depuis la station Hôtel de Ville en 1974.',
  },
  Châtelet: {
    style: 'entourage-écussons',
    year: 1900,
    note: 'Entourage Guimard conservé place Sainte-Opportune (l’un des plus anciens du réseau).',
  },
  'Palais Royal – Musée du Louvre': {
    style: 'entourage-écussons',
    year: 1900,
    note: 'Entourage Art Nouveau rue de Rivoli, à deux pas du Kiosque des Noctambules.',
  },
  Cité: {
    style: 'entourage-écussons',
    year: 1910,
    note: 'Entourage en fonte verte place Louis-Lépine, avec candélabres à globes ambre.',
  },
  Nation: {
    style: 'entourage-écussons',
    year: 1900,
    note: 'Entourage à écussons conservé du côté de l’avenue du Trône.',
  },
  Bastille: {
    style: 'entourage-écussons',
    year: 1900,
    note: 'Entourage Guimard boulevard Beaumarchais (le pavillon d’origine fut démoli en 1962).',
  },
  Monceau: {
    style: 'entourage-écussons',
    year: 1902,
    note: 'Entourage Art Nouveau face aux grilles dorées du parc Monceau.',
  },
  Pigalle: {
    style: 'entourage-écussons',
    year: 1902,
    note: 'Entourage à cartouches sur le terre-plein central du boulevard de Clichy.',
  },
  Anvers: {
    style: 'entourage-écussons',
    year: 1902,
    note: 'Entourage Guimard sur le terre-plein du boulevard de Rochechouart vers Montmartre.',
  },
  "Place d'Italie": {
    style: 'entourage-écussons',
    year: 1906,
    note: 'Deux entourages Guimard conservés aux accès de la place d’Italie.',
  },
  'Saint-Michel': {
    style: 'entourage-écussons',
    year: 1910,
    note: 'Deux entourages Art Nouveau place Saint-Michel et boulevard Saint-Michel.',
  },
  Raspail: {
    style: 'entourage-écussons',
    year: 1906,
    note: 'Entourage à écussons sur le terre-plein du boulevard Raspail.',
  },
  Ternes: {
    style: 'entourage-écussons',
    year: 1902,
    note: 'Entourage Guimard sur la place des Ternes, face aux Champs-Élysées.',
  },
  'Victor Hugo': {
    style: 'entourage-écussons',
    year: 1900,
    note: 'Entourage à écussons conservé place Victor-Hugo.',
  },
  Courcelles: {
    style: 'entourage-écussons',
    year: 1902,
    note: 'Entourage Guimard boulevard de Courcelles.',
  },
  Villiers: {
    style: 'entourage-écussons',
    year: 1903,
    note: 'Entourage Guimard conservé boulevard de Courcelles.',
  },
  Rome: {
    style: 'entourage-écussons',
    year: 1902,
    note: 'Entourage Guimard sur le terre-plein du boulevard des Batignolles.',
  },
  Europe: {
    style: 'entourage-écussons',
    year: 1904,
    note: 'Entourage à écussons rue de Madrid, à deux pas de la place de l’Europe.',
  },
  Blanche: {
    style: 'entourage-écussons',
    year: 1902,
    note: 'Entourage Guimard sur le terre-plein devant le Moulin Rouge.',
  },
  "Château d'Eau": {
    style: 'entourage-écussons',
    year: 1908,
    note: 'Deux entourages Guimard conservés boulevard de Strasbourg.',
  },
  Parmentier: {
    style: 'entourage-écussons',
    year: 1904,
    note: 'Entourage à écussons sur le terre-plein de l’avenue Parmentier.',
  },
  'Père Lachaise': {
    style: 'entourage-écussons',
    year: 1903,
    note: 'Entourage Guimard boulevard de Ménilmontant face au cimetière.',
  },
  Daumesnil: {
    style: 'entourage-écussons',
    year: 1909,
    note: 'Entourage Guimard conservé place Félix-Éboué.',
  },
  'Louis Blanc': {
    style: 'entourage-écussons',
    year: 1910,
    note: 'Entourage à écussons à l’angle de la rue du Faubourg-Saint-Martin.',
  },
  Cadet: {
    style: 'entourage-écussons',
    year: 1910,
    note: 'Entourage Guimard rue La Fayette, inscrit aux Monuments historiques.',
  },
};

const NORMALIZED_EXITS_INDEX = new Map<string, StationExit[]>(
  Object.entries(PARIS_STATION_EXITS).map(([name, exits]) => [normalizeStationKey(name), exits])
);

const NORMALIZED_GUIMARD_INDEX = new Map<string, GuimardInfo>(
  Object.entries(GUIMARD_STATIONS).map(([name, info]) => [normalizeStationKey(name), info])
);

/**
 * Retourne les sorties RATP numérotées et la fiche Guimard éventuelle d'une station.
 */
export function getStationHeritage(stationName: string): StationHeritage {
  const key = normalizeStationKey(stationName);
  if (!key) return { exits: [], guimard: null };
  return {
    exits: NORMALIZED_EXITS_INDEX.get(key) ?? [],
    guimard: NORMALIZED_GUIMARD_INDEX.get(key) ?? null,
  };
}
