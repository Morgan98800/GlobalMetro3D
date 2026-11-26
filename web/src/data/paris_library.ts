export interface RollingStockCatalogItem {
  id: string;
  name: string;
  subtitle: string;
  year: number;
  manufacturer: string;
  driveType: 'pneu' | 'fer';
  driverless: boolean;
  maxSpeedKmh: number;
  carsCount: number;
  capacity: number;
  lines: string[];
  cabGlb: string;
  carGlb: string;
  defaultLineForRide: string;
  sprague?: boolean;
  audioProfile: 'pneu-moderne' | 'fer-moderne' | 'mf77' | 'sprague' | 'rer';
  audioSrc?: string;
  audioCredit?: string;
  summary: string;
  anecdote: string;
}

export const ROLLING_STOCK_CATALOG: RollingStockCatalogItem[] = [
  {
    id: 'mf19',
    name: 'MF 19',
    subtitle: 'La nouvelle génération du métro fer',
    year: 2025,
    manufacturer: 'Alstom · Bombardier',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 70,
    carsCount: 5,
    capacity: 580,
    lines: ['10', '7bis', '3bis', '13', '12', '8', '3', '7'],
    cabGlb: '/models/train/library/mf19_cab.glb',
    carGlb: '/models/train/library/mf19_car.glb',
    defaultLineForRide: '10',
    audioProfile: 'fer-moderne',
    audioSrc: '/audio/library/mf01.m4a',
    audioCredit: 'Wikimedia Commons · Matériel fer moderne',
    summary:
      'Matériel fer nouvelle génération déployé d’abord sur la ligne 10 à partir de 2025 pour remplacer les MF 67, MF 77 et MF 88 sur huit lignes du réseau parisien.',
    anecdote:
      'Disponible en version à conducteur ou automatique, le MF 19 adopte une intercirculation intégrale dite « boa », la climatisation et des ports USB.',
  },
  {
    id: 'mp14',
    name: 'MP 14 CA',
    subtitle: 'Métro automatique nouvelle génération',
    year: 2020,
    manufacturer: 'Alstom',
    driveType: 'pneu',
    driverless: true,
    maxSpeedKmh: 80,
    carsCount: 8,
    capacity: 932,
    lines: ['14', '4'],
    cabGlb: '/models/train/library/mp14_ca_cab.glb',
    carGlb: '/models/train/library/mp14_car.glb',
    defaultLineForRide: '14',
    audioProfile: 'pneu-moderne',
    audioSrc: '/audio/library/mp05.m4a',
    audioCredit: 'Wikimedia Commons · Arrivée et départ MP 05',
    summary:
      'Première rame de métro parisien à 8 voitures (120,3 m) sur la ligne 14 — le plus long métro de France — et en version 6 voitures sur la ligne 4. Éclairage 100 % LED et intercirculation intégrale « boa ».',
    anecdote:
      'Conçu pour 100 km/h (80 km/h en service) avec voitures de 15,04 m × 2,45 m et 3 portes par face, sa face avant verticale et sa livrée IDFM réduisent le bruit d’air en tunnel.',
  },
  {
    id: 'mp14_cc',
    name: 'MP 14 CC',
    subtitle: 'Version 5 voitures avec loge de conduite',
    year: 2023,
    manufacturer: 'Alstom',
    driveType: 'pneu',
    driverless: false,
    maxSpeedKmh: 80,
    carsCount: 5,
    capacity: 560,
    lines: ['11'],
    cabGlb: '/models/train/library/mp14_cc_cab.glb',
    carGlb: '/models/train/library/mp14_car.glb',
    defaultLineForRide: '11',
    audioProfile: 'pneu-moderne',
    audioSrc: '/audio/library/mp05.m4a',
    audioCredit: 'Wikimedia Commons · Arrivée et départ MP 05',
    summary:
      'Seule déclinaison du MP 14 dotée d’une loge de conduite, exploitée à 5 voitures sur la ligne 11 prolongée jusqu’à Rosny-Bois-Perrier, en remplacement des MP 59.',
    anecdote:
      'Comme ses cousines automatiques des lignes 14 et 4, chaque voiture mesure 15,04 m avec 3 portes par face et intercirculation intégrale.',
  },
  {
    id: 'mp05',
    name: 'MP 05 CA',
    subtitle: 'L’automatisation de la ligne 1',
    year: 2011,
    manufacturer: 'Alstom',
    driveType: 'pneu',
    driverless: true,
    maxSpeedKmh: 80,
    carsCount: 6,
    capacity: 722,
    lines: ['1'],
    cabGlb: '/models/train/library/mp05_cab.glb',
    carGlb: '/models/train/library/mp05_car.glb',
    defaultLineForRide: '1',
    audioProfile: 'pneu-moderne',
    audioSrc: '/audio/library/mp05.m4a',
    audioCredit: 'Wikimedia Commons · Arrivée et départ MP 05',
    summary:
      'Dérivé du MP 89, le MP 05 a permis d’automatiser intégralement la ligne historique n° 1 sans interrompre le trafic commercial.',
    anecdote:
      'Sur la ligne 1, les voyageurs peuvent s’asseoir tout à l’avant, là où se trouvait autrefois la loge du conducteur.',
  },
  {
    id: 'mf01',
    name: 'MF 01 (MF 2000)',
    subtitle: 'Le fer silencieux à intercirculation',
    year: 2008,
    manufacturer: 'Alstom · Bombardier',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 70,
    carsCount: 5,
    capacity: 557,
    lines: ['2', '5', '9'],
    cabGlb: '/models/train/library/mf01_cab.glb',
    carGlb: '/models/train/library/mf01_car.glb',
    defaultLineForRide: '2',
    audioProfile: 'fer-moderne',
    audioSrc: '/audio/library/mf01.m4a',
    audioCredit: 'Wikimedia Commons · Arrivée et départ MF 01',
    summary:
      'Matériel fer moderne reconnaissable à ses grandes baies vitrées et ses trois paires de larges portes par voiture, conçu pour absorber les pointes de fréquentation.',
    anecdote:
      'La première rame MF 01 de série a circulé sur la ligne 2 en juin 2008, passant sur les célèbres viaducs aériens de Barbès et Stalingrad.',
  },
  {
    id: 'mp89_ca',
    name: 'MP 89 CA',
    subtitle: 'Design Roger Tallon · Automatique sans cabine',
    year: 1997,
    manufacturer: 'GEC-Alsthom · Roger Tallon',
    driveType: 'pneu',
    driverless: true,
    maxSpeedKmh: 80,
    carsCount: 6,
    capacity: 722,
    lines: ['4', '14'],
    cabGlb: '/models/train/library/mp89_ca_cab.glb',
    carGlb: '/models/train/library/mp89_car.glb',
    defaultLineForRide: '4',
    audioProfile: 'pneu-moderne',
    audioSrc: '/audio/library/mp05.m4a',
    audioCredit: 'Wikimedia Commons · Métro automatique sur pneu',
    summary:
      'Rame automatique à 6 voitures (90,28 m, S-N-N-N-N-S, 8 moteurs) sans loge de conduite : les voyageurs accèdent jusqu’à la vitre frontale. Issues de la ligne 14, les 21 rames CA sont redéployées sur la ligne 4.',
    anecdote:
      'Dessiné par Roger Tallon, le MP 89 CA a inauguré en 1998 l’intercirculation intégrale et le pare-brise panoramique avant sur le métro parisien.',
  },
  {
    id: 'mp89_cc',
    name: 'MP 89 CC',
    subtitle: 'Design Roger Tallon · Conduite avec loge',
    year: 1997,
    manufacturer: 'GEC-Alsthom · Roger Tallon',
    driveType: 'pneu',
    driverless: false,
    maxSpeedKmh: 80,
    carsCount: 5,
    capacity: 580,
    lines: ['6'],
    cabGlb: '/models/train/library/mp89_cc_cab.glb',
    carGlb: '/models/train/library/mp89_car.glb',
    defaultLineForRide: '6',
    audioProfile: 'pneu-moderne',
    audioSrc: '/audio/metro/pneu_depart.m4a',
    audioCredit: 'Enregistrement terrain · Métro sur pneu',
    summary:
      'Version à conducteur des rames MP 89 CC recomposée à 5 voitures (75,32 m, 3 portes coulissantes de 1,65 m par face et bogies B’B’ sur pneus) pour les quais de la ligne 6 en remplacement des MP 73.',
    anecdote:
      'Le MP 89 CC conserve la loge de conduite derrière le grand pare-brise dessiné par Roger Tallon tout en offrant l’intercirculation intégrale entre les 6 voitures.',
  },
  {
    id: 'mf88',
    name: 'MF 88',
    subtitle: 'Le prototype articulé de la ligne 7bis',
    year: 1993,
    manufacturer: 'ANF Industrie',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 70,
    carsCount: 3,
    capacity: 330,
    lines: ['7bis'],
    cabGlb: '/models/train/library/mf88_cab.glb',
    carGlb: '/models/train/library/mf88_car.glb',
    defaultLineForRide: '7bis',
    audioProfile: 'fer-moderne',
    audioSrc: '/audio/library/mf01.m4a',
    audioCredit: 'Wikimedia Commons · Matériel fer',
    summary:
      'Conçu comme laboratoire roulant pour tester les essieux orientables et l’intercirculation entre voitures, le MF 88 circule exclusivement sur la courte ligne 7bis en formation à 3 caisses.',
    anecdote:
      'Seulement 9 rames MF 88 ont été construites (27 voitures au total), mais leurs innovations ont directement inspiré le MP 89 et le MF 01.',
  },
  {
    id: 'mf77',
    name: 'MF 77',
    subtitle: 'Le « métro blanc » des longues lignes',
    year: 1978,
    manufacturer: 'Alsthom · Franco-Belge',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 100,
    carsCount: 5,
    capacity: 574,
    lines: ['7', '8', '13'],
    cabGlb: '/models/train/library/mf77_cab.glb',
    carGlb: '/models/train/library/mf77_car.glb',
    defaultLineForRide: '7',
    audioProfile: 'mf77',
    audioSrc: '/audio/library/mf77.m4a',
    audioCredit: 'Wikimedia Commons · Arrivée et départ MF 77',
    summary:
      'Conçu pour les grandes extensions vers la banlieue, le MF 77 adopte une caisse galbée plus large à hauteur d’épaule et des hacheurs de courant à thyristors.',
    anecdote:
      'Son sifflement aigu caractéristique au démarrage vient de la modulation de fréquence de ses hacheurs électroniques de 1978.',
  },
  {
    id: 'mp73',
    name: 'MP 73',
    subtitle: 'Le spécialiste des viaducs de la ligne 6',
    year: 1974,
    manufacturer: 'CIMT · Alsthom',
    driveType: 'pneu',
    driverless: false,
    maxSpeedKmh: 70,
    carsCount: 5,
    capacity: 560,
    lines: ['6'],
    cabGlb: '/models/train/library/mp73_cab.glb',
    carGlb: '/models/train/library/mp73_car.glb',
    defaultLineForRide: '6',
    audioProfile: 'pneu-moderne',
    audioSrc: '/audio/metro/pneu_depart.m4a',
    audioCredit: 'Enregistrement terrain · Métro sur pneu',
    summary:
      'Le MP 73 a été spécialement dessiné pour les viaducs aériens de la ligne 6 (Passy, Bir-Hakeim, Nation) afin d’offrir une adhérence exceptionnelle et moins de vibrations.',
    anecdote:
      'Avec ses pneus Michelin à carcasse radiale gonflés à l’azote, il grimpe des rampes impossibles pour un métro fer classique.',
  },
  {
    id: 'mf67',
    name: 'MF 67',
    subtitle: 'Le pilier historique du réseau fer (R99)',
    year: 1968,
    manufacturer: 'CIMT · Brissonneau & Lotz',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 70,
    carsCount: 5,
    capacity: 560,
    lines: ['3', '10', '12'],
    cabGlb: '/models/train/library/mf67_cab.glb',
    carGlb: '/models/train/library/mf67_car.glb',
    defaultLineForRide: '3',
    audioProfile: 'fer-moderne',
    audioSrc: '/audio/library/mf67.m4a',
    audioCredit: 'Wikimedia Commons · Arrivée et départ MF 67',
    summary:
      'Matériel fer emblématique mis en service dès 1968 pour remplacer les rames Sprague-Thomson. Doté de bogies bimoteurs robustes et reconnaissable à sa face avant noire rénovée.',
    anecdote:
      'Plus de 1 400 voitures MF 67 ont été construites, ce qui en fait l’une des séries les plus prolifiques de l’histoire du métro parisien.',
  },
  {
    id: 'mp59',
    name: 'MP 59',
    subtitle: 'Le pionnier sur pneumatiques des lignes 1, 4 et 11',
    year: 1963,
    manufacturer: 'CIMT · Brissonneau & Lotz',
    driveType: 'pneu',
    driverless: false,
    maxSpeedKmh: 70,
    carsCount: 4,
    capacity: 530,
    lines: ['11', '4', '1'],
    cabGlb: '/models/train/library/mp59_cab.glb',
    carGlb: '/models/train/library/mp59_car.glb',
    defaultLineForRide: '11',
    audioProfile: 'pneu-moderne',
    audioSrc: '/audio/metro/pneu_depart.m4a',
    audioCredit: 'Enregistrement terrain · Métro sur pneu',
    summary:
      'Premier matériel sur pneus produit en grande série pour équiper les lignes 1 et 4 dès 1963, le MP 59 a ensuite assuré le service de la ligne 11 jusqu’en 2024.',
    anecdote:
      'Ses 61 ans de carrière sur la ligne 11 en font l’un des matériels les plus endurants jamais exploités par la RATP.',
  },
  {
    id: 'sprague',
    name: 'Sprague-Thomson',
    subtitle: 'L’icône historique (1908–1983)',
    year: 1930,
    manufacturer: 'CEM · Franco-Belge',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 60,
    carsCount: 5,
    capacity: 480,
    lines: ['1', '9'],
    cabGlb: '/models/train/library/sprague_cab.glb',
    carGlb: '/models/train/library/sprague_car.glb',
    defaultLineForRide: '1',
    sprague: true,
    audioProfile: 'sprague',
    audioSrc: '/audio/library/mf67.m4a',
    audioCredit: 'Wikimedia Commons · Matériel fer classique',
    summary:
      'La légende du métro parisien pendant 75 ans : caisse en acier riveté, banquettes en bois, portes à fermeture pneumatique et l’inoubliable livrée rouge de 1re classe.',
    anecdote:
      'La dernière rame Sprague-Thomson a circulé en service commercial sur la ligne 9 le 16 avril 1983. Plusieurs motrices sont aujourd’hui préservées par la RATP et l’ADEMAS.',
  },
  {
    id: 'rera',
    name: 'MI 09 (RER A)',
    subtitle: 'Géant à deux niveaux',
    year: 2011,
    manufacturer: 'Alstom · Bombardier',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 120,
    carsCount: 5,
    capacity: 1305,
    lines: ['A'],
    cabGlb: '/models/train/library/rer_a_mi09_cab.glb',
    carGlb: '/models/train/library/rer_a_mi09_car.glb',
    defaultLineForRide: '1',
    audioProfile: 'rer',
    audioSrc: '/audio/library/rer_a.m4a',
    audioCredit: 'Wikimedia Commons · Départ RER A (Neuilly-Plaisance)',
    summary:
      'Rame à deux niveaux exploitée en unité multiple (224 m de long !) sur la ligne ferroviaire la plus fréquentée d’Europe, avec plus de 1,2 million de voyageurs par jour.',
    anecdote:
      'Ses trois larges portes de 2 m par face permettent d’évacuer un niveau entier en moins de 40 secondes à Châtelet–Les Halles.',
  },
  {
    id: 'rerb',
    name: 'MI 79 / MI 84 (RER B)',
    subtitle: 'Le matériel d’interconnexion RATP / SNCF',
    year: 1980,
    manufacturer: 'Franco-Belge · Alsthom',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 120,
    carsCount: 4,
    capacity: 848,
    lines: ['B'],
    cabGlb: '/models/train/library/rer_b_mi79_cab.glb',
    carGlb: '/models/train/library/rer_b_mi79_car.glb',
    defaultLineForRide: '4',
    audioProfile: 'rer',
    audioSrc: '/audio/library/rer_b.m4a',
    audioCredit: 'Wikimedia Commons · Son MI 84 extérieur',
    summary:
      'Premier matériel bicourant (1 500 V continu au sud RATP, 25 000 V alternatif au nord SNCF) conçu pour relier directement la banlieue sud à Roissy-CDG sans changement.',
    anecdote:
      'Lors du passage en gare du Nord, le conducteur bascule d’une tension électrique à l’autre en quelques secondes.',
  },
  {
    id: 'rerc',
    name: 'Z 2N · Z 20500 (RER C)',
    subtitle: 'La grande rame Transilien Carmillon à deux niveaux',
    year: 1988,
    manufacturer: 'CIMT · Alsthom · ANF',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 140,
    carsCount: 4,
    capacity: 1050,
    lines: ['C'],
    cabGlb: '/models/train/library/rer_c_z2n_cab.glb',
    carGlb: '/models/train/library/rer_c_z2n_car.glb',
    defaultLineForRide: '1',
    audioProfile: 'rer',
    audioSrc: '/audio/library/rer_a.m4a',
    audioCredit: 'Wikimedia Commons · Automotrice Z 2N',
    summary:
      'Silhouette immédiatement reconnaissable avec ses deux larges portes placées aux extrémités sur les bogies et sa longue salle centrale surbaissée à deux niveaux longeant la Seine.',
    anecdote:
      'Exploitée jusqu’à 140 km/h, la famille Z 2N (Z 5600, Z 8800, Z 20500) dessert l’ensemble des branches du RER C de Pontoise à Dourdan et Versailles-Château.',
  },
  {
    id: 'rerd',
    name: 'Z 20500 IDFM (RER D)',
    subtitle: 'Livrée Île-de-France Mobilités à deux niveaux',
    year: 1990,
    manufacturer: 'GEC-Alsthom · ANF',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 140,
    carsCount: 5,
    capacity: 1280,
    lines: ['D'],
    cabGlb: '/models/train/library/rer_d_z20500_cab.glb',
    carGlb: '/models/train/library/rer_d_z20500_car.glb',
    defaultLineForRide: '4',
    audioProfile: 'rer',
    audioSrc: '/audio/library/rer_b.m4a',
    audioCredit: 'Wikimedia Commons · Automotrice Z 20500',
    summary:
      'Rame bicourant à deux niveaux en formation 5 caisses (jusqu’à 260 m en unité multiple) assurant la grande transversale nord-sud entre Creil, Châtelet–Les Halles et Melun.',
    anecdote:
      'Rénovées aux couleurs bleu ciel Île-de-France Mobilités avec éclairage LED et écrans voyageurs, les Z 20500 du RER D circulent dans le tunnel commun avec le RER B.',
  },
  {
    id: 'rere',
    name: 'RER NG · Z 58000 (RER E)',
    subtitle: 'Alstom X’Trapolis Cityduplex nouvelle génération',
    year: 2023,
    manufacturer: 'Alstom · Bombardier',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 140,
    carsCount: 6,
    capacity: 1563,
    lines: ['E'],
    cabGlb: '/models/train/library/rer_e_rerng_cab.glb',
    carGlb: '/models/train/library/rer_e_rerng_car.glb',
    defaultLineForRide: '14',
    audioProfile: 'rer',
    audioSrc: '/audio/library/rer_a.m4a',
    audioCredit: 'Wikimedia Commons · RER NG Eole',
    summary:
      'Matériel de nouvelle génération à intercirculation intégrale conçu pour le prolongement Eole vers Nanterre-La Folie : voitures d’extrémité à un niveau pour une accessibilité de plain-pied et voitures centrales à deux niveaux.',
    anecdote:
      'Son masque frontal noir brillant encadré de chevrons lumineux LED et ses portes de 2 mètres permettent d’accueillir plus de 1 560 voyageurs par rame simple.',
  },
  {
    id: 'ms61',
    name: 'MS 61 (RER A)',
    subtitle: 'Le pionnier du RER (livrée anti-graffiti)',
    year: 1967,
    manufacturer: 'Brissonneau & Lotz · ANF · CIMT',
    driveType: 'fer',
    driverless: false,
    maxSpeedKmh: 100,
    carsCount: 3,
    capacity: 600,
    lines: ['A', 'B'],
    cabGlb: '/models/train/library/ms61_cab.glb',
    carGlb: '/models/train/library/ms61_car.glb',
    defaultLineForRide: '1',
    audioProfile: 'rer',
    audioSrc: '/audio/library/rer_a.m4a',
    audioCredit: 'Wikimedia Commons · Matériel RER historique',
    summary:
      'Premier matériel conçu pour le RER (1967–2016 sur les lignes de Sceaux/B et A) : élément de 3 caisses (73,22 m, gabarit 2,80 m), 4 portes par face sur les motrices, 5 sur la voiture mixte, pantographes losangiques 1 500 V et attelage Scharfenberg.',
    anecdote:
      'Capable de circuler en unité multiple jusqu’à 3 éléments (9 voitures), le MS 61 alliait les accélérations d’un métro au gabarit ferroviaire national.',
  },
];

export interface HistoryChapter {
  id: string;
  year: string;
  title: string;
  subtitle: string;
  summary: string;
  stationsCount: number;
  networkKm: number;
  highlightLineId: string | null;
  camera: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
}

export const METRO_HISTORY_CHAPTERS: HistoryChapter[] = [
  {
    id: '1900',
    year: '1900',
    title: 'La naissance : Ligne 1',
    subtitle: 'Porte Maillot – Porte de Vincennes en 28 minutes',
    summary:
      'Inaugurée le 19 juillet 1900 pour l’Exposition universelle, la première ligne traverse Paris d’ouest en est sous les Champs-Élysées, Châtelet et la Bastille. Les billets coûtent 15 centimes en 2e classe.',
    stationsCount: 18,
    networkKm: 10.6,
    highlightLineId: '1',
    camera: { center: [2.338, 48.862], zoom: 12.6, pitch: 46, bearing: -12 },
  },
  {
    id: '1903',
    year: '1903–1909',
    title: 'Les grands viaducs aériens',
    subtitle: 'Lignes 2 et 6 au-dessus des boulevards',
    summary:
      'Pour franchir les voies ferrées du Nord et de l’Est ainsi que la Seine, Fulgence Bienvenüe fait construire de spectaculaires viaducs métalliques à Barbès, Stalingrad, Passy et Bir-Hakeim.',
    stationsCount: 112,
    networkKm: 62.0,
    highlightLineId: '6',
    camera: { center: [2.292, 48.855], zoom: 13.4, pitch: 52, bearing: 28 },
  },
  {
    id: '1910',
    year: '1910',
    title: 'Sous la Seine : Ligne 4',
    subtitle: 'Premier franchissement sous-fluvial à Cité',
    summary:
      'Enfoncée dans des caissons métalliques foncés verticalement puis congelés dans la nappe phréatique, la ligne 4 relie pour la première fois la rive droite et la rive gauche sous le bras de la Seine.',
    stationsCount: 145,
    networkKm: 78.5,
    highlightLineId: '4',
    camera: { center: [2.346, 48.855], zoom: 13.8, pitch: 50, bearing: 10 },
  },
  {
    id: '1939',
    year: '1939–1945',
    title: 'L’Occupation et les stations fantômes',
    subtitle: 'Fermetures stratégiques et abris souterrains',
    summary:
      'Dès septembre 1939, des dizaines de stations sont fermées pour économiser l’électricité et le personnel. Certaines — comme Saint-Martin, Croix-Rouge ou Arsenal — ne rouvriront jamais.',
    stationsCount: 252,
    networkKm: 159.0,
    highlightLineId: '9',
    camera: { center: [2.356, 48.868], zoom: 13.6, pitch: 44, bearing: -18 },
  },
  {
    id: '1956',
    year: '1956',
    title: 'Révolution sur pneumatiques',
    subtitle: 'Première mondiale sur la ligne 11',
    summary:
      'Pour gravir les pentes abruptes vers Belleville et les Lilas tout en réduisant le bruit, la RATP invente le métro sur pneus (MP 55), rapidement étendu aux lignes 1, 4 et 6.',
    stationsCount: 271,
    networkKm: 169.0,
    highlightLineId: '11',
    camera: { center: [2.378, 48.872], zoom: 13.4, pitch: 48, bearing: 16 },
  },
  {
    id: '1977',
    year: '1969–1977',
    title: 'L’avènement du RER',
    subtitle: 'Interconnexion géante à Châtelet–Les Halles',
    summary:
      'Le Réseau Express Régional relie enfin les banlieues est-ouest et nord-sud en traversant Paris à grande vitesse, faisant de Châtelet–Les Halles la plus grande gare souterraine du monde.',
    stationsCount: 295,
    networkKm: 290.0,
    highlightLineId: 'A',
    camera: { center: [2.347, 48.861], zoom: 12.1, pitch: 48, bearing: -8 },
  },
  {
    id: '1998',
    year: '1998',
    title: 'Météor : la ligne 14 sans conducteur',
    subtitle: 'Première ligne automatique à grand gabarit',
    summary:
      'Inaugurée entre Madeleine et Bibliothèque François-Mitterrand, la ligne 14 introduit les façades de quai vitrées, l’automatisation intégrale et des stations monumentales en béton et verre.',
    stationsCount: 298,
    networkKm: 302.0,
    highlightLineId: '14',
    camera: { center: [2.358, 48.842], zoom: 13.0, pitch: 52, bearing: 22 },
  },
  {
    id: '2011',
    year: '2011–2020',
    title: 'L’automatisation des lignes historiques',
    subtitle: 'Ligne 1 (2011) puis Ligne 4 (2022)',
    summary:
      'Pour la première fois au monde, une ligne centenaire très fréquentée (la ligne 1) est entièrement automatisée sans interruption de service, suivie par la ligne 4.',
    stationsCount: 304,
    networkKm: 315.0,
    highlightLineId: '1',
    camera: { center: [2.322, 48.866], zoom: 12.8, pitch: 46, bearing: -25 },
  },
  {
    id: '2026',
    year: '2024–2030',
    title: 'Ligne 14 vers Orly & Grand Paris',
    subtitle: 'La colonne vertébrale du Grand Paris Express',
    summary:
      'Prolongée jusqu’à Saint-Denis Pleyel au nord et l’aéroport d’Orly au sud, la ligne 14 devient l’épine dorsale rapide reliant la capitale aux futures rocades 15, 16, 17 et 18.',
    stationsCount: 321,
    networkKm: 345.0,
    highlightLineId: '14',
    camera: { center: [2.352, 48.845], zoom: 11.7, pitch: 44, bearing: 0 },
  },
];

export type StationCategory = 'records' | 'fantomes' | 'architecture';

export interface RemarkableStationItem {
  id: string;
  name: string;
  category: StationCategory;
  lines: string[];
  depthLabel: string;
  year: string;
  coordinates: [number, number];
  highlightLineId?: string;
  summary: string;
  didYouKnow: string;
  rideSupported: boolean;
}

export const REMARKABLE_STATIONS: RemarkableStationItem[] = [
  {
    id: 'abbesses',
    name: 'Abbesses',
    category: 'records',
    lines: ['12'],
    depthLabel: '-36 m',
    year: '1912',
    coordinates: [2.3385, 48.8844],
    highlightLineId: '12',
    summary:
      'La station la plus profonde du métro parisien, creusée sous la butte Montmartre. Son célèbre escalier en colimaçon compte 176 marches décorées de fresques.',
    didYouKnow:
      'Son édicule Guimard en fonte verte ne vient pas d’origine d’Abbesses : il a été déplacé depuis Hôtel de Ville en 1974.',
    rideSupported: true,
  },
  {
    id: 'chatelet',
    name: 'Châtelet',
    category: 'records',
    lines: ['1', '4', '7', '11', '14', 'A', 'B', 'D'],
    depthLabel: '-23 m',
    year: '1900',
    coordinates: [2.3472, 48.8586],
    highlightLineId: '14',
    summary:
      'Le plus grand pôle souterrain du monde en trafic, reliant 5 lignes de métro et 3 lignes de RER à travers près d’un kilomètre de couloirs.',
    didYouKnow:
      'Le trottoir roulant reliant Châtelet à Les Halles permet de parcourir plus de 150 mètres sous terre en moins de deux minutes.',
    rideSupported: true,
  },
  {
    id: 'bir-hakeim',
    name: 'Bir-Hakeim',
    category: 'architecture',
    lines: ['6'],
    depthLabel: '+10,5 m (Viaduc)',
    year: '1906',
    coordinates: [2.2892, 48.8539],
    highlightLineId: '6',
    summary:
      'Station aérienne emblématique posée sur le viaduc de Passy, juste avant la traversée de la Seine face à la tour Eiffel.',
    didYouKnow:
      'Depuis le quai et les rames de la ligne 6 entre Passy et Bir-Hakeim, on profite de l’une des plus célèbres vues ferroviaires sur la Dame de Fer.',
    rideSupported: true,
  },
  {
    id: 'arts-et-metiers',
    name: 'Arts et Métiers',
    category: 'architecture',
    lines: ['3', '11'],
    depthLabel: '-18 m',
    year: '1904 / 1994',
    coordinates: [2.3562, 48.8655],
    highlightLineId: '11',
    summary:
      'À l’occasion du bicentenaire du Conservatoire national des arts et métiers en 1994, les quais de la ligne 11 ont été entièrement habillés de plaques de cuivre riveté façon sous-marin Nautilus.',
    didYouKnow:
      'L’artiste belge François Schuiten a intégré des hublots en laiton au plafond et des engrenages géants au-dessus des voies.',
    rideSupported: true,
  },
  {
    id: 'cite',
    name: 'Cité',
    category: 'architecture',
    lines: ['4'],
    depthLabel: '-20 m',
    year: '1910',
    coordinates: [2.3471, 48.8552],
    highlightLineId: '4',
    summary:
      'Seule station bâtie sous l’île de la Cité, logée dans d’immenses caissons d’acier descendus verticalement à 20 m sous le niveau de la Seine.',
    didYouKnow:
      'Ses trois grands puits cylindriques abritent les célèbres candélabres à globes ambrés qui donnent au quai une atmosphère unique.',
    rideSupported: true,
  },
  {
    id: 'saint-martin',
    name: 'Saint-Martin',
    category: 'fantomes',
    lines: ['8', '9'],
    depthLabel: '-12 m',
    year: '1931 (Fermée 1939)',
    coordinates: [2.3556, 48.8691],
    highlightLineId: '9',
    summary:
      'Située à seulement 100 mètres de Strasbourg–Saint-Denis, Saint-Martin a fermé dès 1939 et n’a jamais rouvert en raison de sa trop grande proximité avec sa voisine.',
    didYouKnow:
      'En regardant par la fenêtre d’une rame sur les lignes 8 ou 9 entre République et Strasbourg–Saint-Denis, on aperçoit encore ses quais carrelés et ses anciennes publicités.',
    rideSupported: false,
  },
  {
    id: 'croix-rouge',
    name: 'Croix-Rouge',
    category: 'fantomes',
    lines: ['10'],
    depthLabel: '-14 m',
    year: '1923 (Fermée 1939)',
    coordinates: [2.3279, 48.852],
    highlightLineId: '10',
    summary:
      'Ancien premier terminus de la ligne 10, fermé à la mobilisation de 1939 et jugé trop proche de Sèvres–Babylone et Mabillon pour rouvrir.',
    didYouKnow:
      'Elle doit son nom au carrefour de la Croix-Rouge (aujourd’hui place Michel-Debré), et sert parfois de décor de tournage.',
    rideSupported: false,
  },
  {
    id: 'haxo',
    name: 'Haxo',
    category: 'fantomes',
    lines: ['3bis', '7bis'],
    depthLabel: '-16 m',
    year: '1921 (Jamais ouverte)',
    coordinates: [2.4046, 48.8756],
    highlightLineId: '3bis',
    summary:
      'Station construite sur la « Voie navette » reliant la ligne 3bis à la ligne 7bis, mais qui n’a jamais reçu aucun accès vers la rue ni aucun voyageur.',
    didYouKnow:
      'Un projet étudie régulièrement la fusion des lignes 3bis et 7bis, ce qui pourrait enfin ouvrir Haxo au public plus d’un siècle après son creusement.',
    rideSupported: false,
  },
  {
    id: 'arsenal',
    name: 'Arsenal',
    category: 'fantomes',
    lines: ['5'],
    depthLabel: '-11 m',
    year: '1906 (Fermée 1939)',
    coordinates: [2.3659, 48.8501],
    highlightLineId: '5',
    summary:
      'Petite station coincée entre Bastille et Quai de la Rapée, fermée en 1939 et restée dans l’ombre juste avant la sortie de la ligne 5 à l’air libre vers la Seine.',
    didYouKnow:
      'Elle apparaît dans plusieurs films et romans policiers parisiens pour son ambiance figée dans les années 1930.',
    rideSupported: false,
  },
];
