import type { DepartGroupe, Itineraire, LigneEtat } from '../../web/src/ui';

/** Demo content. Times are illustrative; colours come from the line table. */
export const HEURE = new Date(2026, 10, 14, 21, 20);

const ORDRE = ['1', '2', '3', '3b', '4', '5', '6', '7', '7b', '8', '9', '10', '11', '12', '13', '14', 'A', 'B', 'C', 'D', 'E'];
const TERMINI: Record<string, [string, string]> = {
  '1': ['La Défense', 'Château de Vincennes'],
  '4': ['Porte de Clignancourt', 'Bagneux – Lucie Aubrac'],
  '9': ['Pont de Sèvres', 'Mairie de Montreuil'],
  '14': ['Saint-Denis Pleyel', 'Aéroport d’Orly'],
};

export const LIGNES: LigneEtat[] = ORDRE.map((s) => ({ shortName: s, termini: TERMINI[s] }));
const ligne13 = LIGNES.find((l) => l.shortName === '13')!;
ligne13.alert = 'vigilance';
ligne13.message = 'Trafic ralenti entre Saint-Lazare et Châtillon – Montrouge, incident technique.';
const rerB = LIGNES.find((l) => l.shortName === 'B')!;
rerB.alert = 'signal';
rerB.message = 'Trafic interrompu entre Gare du Nord et Aéroport CDG 2 jusqu’à 23 h, travaux.';
const ligne14 = LIGNES.find((l) => l.shortName === '14')!;
ligne14.message = 'Trafic normal. Un train toutes les 85 secondes en moyenne.';

export const PASSAGES_BASTILLE: DepartGroupe[] = [
  { ligne: { shortName: '1' }, direction: 'Château de Vincennes', passages: [{ minutes: 1 }, { minutes: 4 }] },
  { ligne: { shortName: '1' }, direction: 'La Défense', passages: [{ minutes: 0 }, { minutes: 3 }] },
  { ligne: { shortName: '5' }, direction: 'Bobigny – Pablo Picasso', passages: [{ minutes: 2 }, { minutes: 7 }] },
  { ligne: { shortName: '5' }, direction: 'Place d’Italie', passages: [{ statut: 'quai' }, { minutes: 6 }] },
  { ligne: { shortName: '8' }, direction: 'Créteil – Pointe du Lac', passages: [{ minutes: 3 }, { minutes: 11 }] },
  { ligne: { shortName: '8' }, direction: 'Balard', passages: [{ minutes: 5 }, { minutes: 12, source: 'theorique' }] },
];

export const PASSAGES_STRASBOURG: DepartGroupe[] = [
  { ligne: { shortName: '4' }, direction: 'Bagneux – Lucie Aubrac', passages: [{ minutes: 2 }, { minutes: 9 }] },
  { ligne: { shortName: '4' }, direction: 'Porte de Clignancourt', passages: [{ minutes: 0 }, { minutes: 5 }] },
  { ligne: { shortName: '8' }, direction: 'Balard', passages: [{ statut: 'quai' }, { minutes: 6 }] },
  { ligne: { shortName: '8' }, direction: 'Créteil – Pointe du Lac', passages: [{ minutes: 3 }, { minutes: 11 }] },
  { ligne: { shortName: '9' }, direction: 'Pont de Sèvres', passages: [{ minutes: 4 }, { minutes: 10, source: 'theorique' }] },
  { ligne: { shortName: '9' }, direction: 'Mairie de Montreuil', passages: [{ minutes: 1 }, { minutes: 7 }] },
];

export const ITINERAIRES: Itineraire[] = [
  {
    minutes: 6,
    arrivee: '21:26',
    segments: [
      {
        type: 'ligne',
        ligne: { shortName: '1' },
        direction: 'Château de Vincennes',
        de: 'Châtelet',
        a: 'Bastille',
        arrets: ['Hôtel de Ville', 'Saint-Paul'],
        minutes: 5,
        attente: { minutes: 1 },
        voiture: 'milieu',
        raisonVoiture: 'pour la sortie rue de Lyon',
      },
      { type: 'marche', minutes: 1, metres: 70, consigne: 'Sortie 1, rue de Lyon' },
    ],
  },
  {
    minutes: 11,
    arrivee: '21:31',
    segments: [
      {
        type: 'ligne',
        ligne: { shortName: '14' },
        direction: 'Aéroport d’Orly',
        de: 'Châtelet',
        a: 'Gare de Lyon',
        arrets: [],
        minutes: 3,
        attente: { minutes: 2 },
        voiture: 'tete',
        raisonVoiture: 'pour la correspondance',
      },
      { type: 'marche', minutes: 3, metres: 210, consigne: 'Correspondance ligne 1' },
      {
        type: 'ligne',
        ligne: { shortName: '1' },
        direction: 'La Défense',
        de: 'Gare de Lyon',
        a: 'Bastille',
        arrets: [],
        minutes: 2,
        attente: { minutes: 4, source: 'theorique' },
      },
    ],
  },
];

export const ROUTES_CABINE = [
  { value: '14', label: 'Ligne 14, Saint-Denis Pleyel – Aéroport d’Orly' },
  { value: '9', label: 'Ligne 9, Pont de Sèvres – Mairie de Montreuil' },
  { value: '1', label: 'Ligne 1, La Défense – Château de Vincennes' },
];

/* ---------- v2.1 : écrans ajoutés après l’arbitrage (contenus illustratifs) ---------- */
import type { ArretThermo, RameThermo, StationProche, StationRecord } from '../../web/src/ui';

const L = (...s: string[]) => s.map((shortName) => ({ shortName }));

export const LIGNE4_ARRETS: ArretThermo[] = [
  ['Porte de Clignancourt'], ['Simplon'], ['Marcadet – Poissonniers', '12'], ['Château Rouge'], ['Barbès – Rochechouart', '2'],
  ['Gare du Nord', '5', 'B', 'D'], ['Gare de l’Est', '5', '7'], ['Château d’Eau'], ['Strasbourg – Saint-Denis', '8', '9'],
  ['Réaumur – Sébastopol', '3'], ['Étienne Marcel'], ['Les Halles', 'A', 'B', 'D'], ['Châtelet', '1', '7', '11', '14'], ['Cité'],
  ['Saint-Michel', 'B', 'C'], ['Odéon', '10'], ['Saint-Germain-des-Prés'], ['Saint-Sulpice'], ['Saint-Placide'],
  ['Montparnasse – Bienvenüe', '6', '12', '13'], ['Vavin'], ['Raspail', '6'], ['Denfert-Rochereau', '6', 'B'], ['Mouton-Duvernet'],
  ['Alésia'], ['Porte d’Orléans'], ['Mairie de Montrouge'], ['Barbara'], ['Bagneux – Lucie Aubrac'],
].map(([nom, ...c], i) => ({ id: `l4-${i}`, nom, correspondances: c.length ? L(...c) : undefined }));

const entre = (i: number) => `entre ${LIGNE4_ARRETS[i].nom} et ${LIGNE4_ARRETS[i + 1].nom}`;
export const LIGNE4_RAMES: RameThermo[] = [
  [1, 0.5], [4, 0.35], [7, 0.6], [11, 0.2], [15, 0.7], [19, 0.4], [23, 0.8], [26, 0.3],
].map(([apres, progression], i) => ({ id: `r${i}`, apres, progression, description: `Suivre la rame vers Bagneux, ${entre(apres)}` }));

export const STATIONS_PROCHES: StationProche[] = [
  { id: 'bastille', nom: 'Bastille', lignes: L('1', '5', '8'), minutes: 3, metres: 230, passages: [{ ligne: { shortName: '1' }, minutes: 1 }, { ligne: { shortName: '5' }, statut: 'quai' }] },
  { id: 'breguet', nom: 'Bréguet – Sabin', lignes: L('5'), minutes: 5, metres: 390, passages: [{ ligne: { shortName: '5' }, minutes: 3 }, { ligne: { shortName: '5' }, minutes: 9 }] },
  { id: 'ledru', nom: 'Ledru-Rollin', lignes: L('8'), minutes: 7, metres: 560, passages: [{ ligne: { shortName: '8' }, minutes: 2 }, { ligne: { shortName: '8' }, minutes: 8 }] },
  { id: 'chemin-vert', nom: 'Chemin Vert', lignes: L('8'), minutes: 8, metres: 640, passages: [{ ligne: { shortName: '8' }, minutes: 4 }, { ligne: { shortName: '8' }, minutes: 10, source: 'theorique' }] },
  { id: 'gare-de-lyon', nom: 'Gare de Lyon', lignes: L('1', '14', 'A', 'D'), minutes: 14, metres: 1100, passages: [{ ligne: { shortName: '14' }, minutes: 1 }, { ligne: { shortName: '1' }, minutes: 2 }] },
];

export const RECHERCHE_GARE = {
  stations: [
    { type: 'station' as const, id: 'gdn', nom: 'Gare du Nord', lignes: L('4', '5', 'B', 'D'), detail: 'Paris 10e' },
    { type: 'station' as const, id: 'gdl', nom: 'Gare de Lyon', lignes: L('1', '14', 'A', 'D'), detail: 'Paris 12e' },
    { type: 'station' as const, id: 'gde', nom: 'Gare de l’Est', lignes: L('4', '5', '7'), detail: 'Paris 10e' },
    { type: 'station' as const, id: 'gda', nom: 'Gare d’Austerlitz', lignes: L('5', '10', 'C'), detail: 'Paris 13e' },
  ],
  lignes: [],
  lieux: [
    { type: 'lieu' as const, id: 'gsl', nom: 'Gare Saint-Lazare', detail: 'Rue Saint-Lazare, Paris 8e' },
    { type: 'lieu' as const, id: 'gmp', nom: 'Gare Montparnasse', detail: 'Place Raoul-Dautry, Paris 15e' },
    { type: 'lieu' as const, id: 'gdb', nom: 'Gare de Bercy', detail: 'Boulevard de Bercy, Paris 12e' },
  ],
};

/** Chiffres de démonstration, pas des données réelles. */
export const RECORDS_PLUS: StationRecord[] = [
  { nom: 'Gare du Nord', lignes: L('4', '5', 'B', 'D'), valeur: 142000 },
  { nom: 'Saint-Lazare', lignes: L('3', '12', '13', '14'), valeur: 118000 },
  { nom: 'Gare de Lyon', lignes: L('1', '14', 'A', 'D'), valeur: 101000 },
  { nom: 'Montparnasse – Bienvenüe', lignes: L('4', '6', '12', '13'), valeur: 86000 },
  { nom: 'Gare de l’Est', lignes: L('4', '5', '7'), valeur: 61000 },
];
export const RECORDS_MOINS: StationRecord[] = [
  { nom: 'Église d’Auteuil', lignes: L('10'), valeur: 1100 },
  { nom: 'Pré-Saint-Gervais', lignes: L('7b'), valeur: 1400 },
  { nom: 'Rennes', lignes: L('12'), valeur: 1900 },
  { nom: 'Danube', lignes: L('7b'), valeur: 2000 },
  { nom: 'Buttes Chaumont', lignes: L('7b'), valeur: 2300 },
];
