import { useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import {
  AProposModale, BandeauTelemetrie, BarreMobile, CabHud, FollowTrainHud, LinesDock, MapControls, MenuPrincipal, NearbyDrawer,
  RecordsModale, RoutePlannerDrawer, StationDrawer, StationSearchPalette, TopNavBar,
  type Experience, type JourType, type LineRef, type Rubrique, type ThemeChoix,
} from '../../web/src/ui';
import cabMf01 from './assets/cab_mf01.jpg';
import cabMp14 from './assets/cab_mp14.jpg';
import {
  HEURE, ITINERAIRES, LIGNE4_ARRETS, LIGNE4_RAMES, LIGNES, PASSAGES_BASTILLE, PASSAGES_STRASBOURG, RECHERCHE_GARE, RECORDS_MOINS,
  RECORDS_PLUS, ROUTES_CABINE, STATIONS_PROCHES,
} from './fixtures';
import { ATTRIBUTION, ParisBackdrop, type BackdropProps } from './ParisBackdrop';
import {
  RefonteMobileAccueil, RefonteMobileCabine, RefonteMobileItineraire, RefonteMobileStation,
  RefonteMobileSuivi,
} from './mobile_refonte';

const noop = () => {};
const VUE_PARIS = { center: [2.3488, 48.8635] as [number, number], zoom: 11.95, offset: [190, 30] as [number, number] };
const LABELS_PARIS = ['Châtelet', 'Gare du Nord', 'Montparnasse - Bienvenüe', 'Nation', 'La Défense', 'Saint-Lazare', 'République'];

function useViewport(): [number, number] {
  const sub = (n: () => void) => (addEventListener('resize', n), () => removeEventListener('resize', n));
  return [useSyncExternalStore(sub, () => innerWidth), useSyncExternalStore(sub, () => innerHeight)];
}

function Ecran({ theme, carte, children }: { theme: 'jour' | 'nuit'; carte?: Omit<BackdropProps, 'width' | 'height' | 'theme'>; children: ReactNode }) {
  const [w, h] = useViewport();
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-fond text-encre">
      {carte && <ParisBackdrop width={w} height={h} theme={theme} {...carte} />}
      {children}
      {carte && (
        <p
          className={
            w < 500
              ? 'pointer-events-none absolute left-3 top-[74px] max-w-[62%] truncate text-[8px] text-encre-3 opacity-80'
              : 'pointer-events-none absolute bottom-1 right-2 max-w-[60%] truncate text-[9px] text-encre-3 opacity-80'
          }
        >
          Fond de maquette. {ATTRIBUTION}
        </p>
      )}
    </div>
  );
}

function Barre({ actif, experience: e0 = 'simple', ligneActive, menuOuvert }: { actif?: Rubrique | null; experience?: Experience; ligneActive?: LineRef; menuOuvert?: boolean }) {
  const [experience, setExperience] = useState<Experience>(e0);
  return (
    <div className="absolute inset-x-0 top-0 z-10">
      <TopNavBar
        reseau="Paris"
        onReseau={noop}
        onSearch={noop}
        onRubrique={noop}
        actif={actif}
        experience={experience}
        onExperience={setExperience}
        onMenu={noop}
        menuOuvert={menuOuvert}
        ligneActive={ligneActive}
        horloge={HEURE}
      />
    </div>
  );
}

function Controles({ mobile, recentrer }: { mobile?: boolean; recentrer?: string }) {
  const [vue3d, setVue3d] = useState(true);
  const [bati, setBati] = useState(true);
  const [gps, setGps] = useState(false);
  return (
    <div className={mobile ? 'absolute right-3 top-[80px] z-10' : 'absolute right-4 top-[88px] z-10'}>
      <MapControls
        vue3d={vue3d}
        onVue3d={() => setVue3d((v) => !v)}
        batiments={bati}
        onBatiments={() => setBati((v) => !v)}
        gps={gps}
        onGps={() => setGps((v) => !v)}
        recentrer={recentrer ? { label: recentrer, onClick: noop } : null}
        onZoomIn={noop}
        onZoomOut={noop}
        zoom={!mobile}
      />
    </div>
  );
}

function DesktopOverview() {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Ecran theme="jour" carte={{ ...VUE_PARIS, labels: LABELS_PARIS }}>
      <Barre actif="lignes" />
      <div className="absolute left-4 top-[88px] z-10">
        <LinesDock lignes={LIGNES} selection={sel} onSelect={setSel} onClose={noop} onMonter={noop} />
      </div>
      <Controles />
    </Ecran>
  );
}

function DesktopLigne() {
  const [inverse, setInverse] = useState(false);
  const arrets = inverse ? [...LIGNE4_ARRETS].reverse() : LIGNE4_ARRETS;
  return (
    <Ecran
      theme="jour"
      carte={{
        center: [2.3445, 48.8605],
        zoom: 12.9,
        offset: [210, 40],
        highlight: ['4'],
        labels: ['Gare du Nord', 'Châtelet', 'Montparnasse - Bienvenüe', 'Denfert-Rochereau'],
        trains: [
          { line: '4', from: 'Simplon', to: 'Marcadet', t: 0.5 },
          { line: '4', from: 'Château Rouge', to: 'Barbès', t: 0.35 },
          { line: '4', from: 'Gare de l', to: 'Château d', t: 0.6 },
          { line: '4', from: 'Étienne Marcel', to: 'Les Halles', t: 0.2 },
          { line: '4', from: 'Saint-Michel', to: 'Odéon', t: 0.7 },
          { line: '4', from: 'Saint-Placide', to: 'Montparnasse', t: 0.4 },
          { line: '4', from: 'Denfert', to: 'Mouton', t: 0.8 },
        ],
      }}
    >
      <Barre experience="passionne" ligneActive={{ shortName: '4' }} actif="lignes" />
      <div className="absolute left-4 top-[80px] z-10">
        <BandeauTelemetrie rames={312} kilometres={18450} direct onDirect={noop} source="PRIM" />
      </div>
      <div className="absolute bottom-4 left-4 top-[136px] z-10 flex items-start">
        <LinesDock
          lignes={LIGNES}
          selection="4"
          onSelect={noop}
          onMonter={noop}
          detail={{
            direction: inverse ? 'Porte de Clignancourt' : 'Bagneux – Lucie Aubrac',
            onInverser: () => setInverse((v) => !v),
            trafic: { niveau: 'normal', texte: 'Trafic normal, 27 rames en ligne.' },
            indicateurs: [
              { label: 'Rames en ligne', valeur: '27' },
              { label: 'Longueur', valeur: '14 km, 29 stations' },
              { label: 'Matériel', valeur: 'MP 89 CA, MP 05' },
              { label: 'Exploitation', valeur: 'Automatique intégrale' },
            ],
            arrets,
            rames: inverse ? [] : LIGNE4_RAMES,
          }}
        />
      </div>
      <Controles />
    </Ecran>
  );
}

function DesktopSuivi() {
  return (
    <Ecran
      theme="jour"
      carte={{
        center: [2.3575, 48.8792],
        zoom: 14.7,
        offset: [0, -80],
        highlight: ['4'],
        labels: ['Barbès - Rochechouart', 'Gare du Nord', "Gare de l'Est - Verdun", "Château d'Eau"],
        trains: [
          { line: '4', from: 'Gare du Nord', to: 'Gare de l', t: 0.55, suivi: true },
          { line: '4', from: 'Château Rouge', to: 'Barbès', t: 0.35 },
          { line: '4', from: 'Strasbourg', to: 'Réaumur', t: 0.3 },
        ],
      }}
    >
      <Barre />
      <Controles recentrer="Recentrer sur la rame suivie" />
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
        <FollowTrainHud
          ligne={{ shortName: '4' }}
          direction="Bagneux – Lucie Aubrac"
          prochaine="Gare de l’Est"
          arrivee={{ minutes: 1 }}
          arrets={['Barbès', 'Gare du Nord', 'Gare de l’Est', 'Château d’Eau', 'Strasbourg – St-Denis']}
          index={1}
          progression={0.55}
          vitesse={41}
          confiance="Position mesurée il y a 12 s"
          onMonter={noop}
          onArreter={noop}
        />
      </div>
    </Ecran>
  );
}

function DesktopRoute() {
  const [sel, setSel] = useState(0);
  const [a, setA] = useState('Châtelet');
  const [b, setB] = useState('Bastille');
  return (
    <Ecran
      theme="nuit"
      carte={{
        center: [2.3585, 48.8567],
        zoom: 14.55,
        offset: [215, 20],
        highlight: ['1'],
        route: { line: '1', stops: ['Châtelet', 'Hôtel de Ville', 'Saint-Paul', 'Bastille'] },
        labels: ['Châtelet', 'Hôtel de Ville', 'Saint-Paul', 'Bastille'],
      }}
    >
      <Barre actif="itineraire" />
      <div className="absolute bottom-4 left-4 top-[88px] z-10 flex w-[400px] items-start">
        <RoutePlannerDrawer
          presentation="cote"
          className="w-full"
          depart={a}
          arrivee={b}
          onDepart={setA}
          onArrivee={setB}
          onInverser={() => (setA(b), setB(a))}
          onMaPosition={noop}
          domicile="12 rue de la Roquette"
          travail={null}
          onRaccourci={noop}
          itineraires={ITINERAIRES}
          selection={sel}
          onSelection={setSel}
          onPartager={noop}
          onClose={noop}
        />
      </div>
      <Controles />
    </Ecran>
  );
}

function stationProps(favori: boolean, setFavori: (v: boolean) => void) {
  return {
    onFavori: () => setFavori(!favori),
    onDomicile: noop, onTravail: noop, onPartager: noop, onYAller: noop, onPartir: noop, onQuai3D: noop, onLigne: noop, onClose: noop,
    favori,
  };
}

function DesktopStation() {
  const [favori, setFavori] = useState(true);
  const detail = ['Mesuré PRIM, 2 min 14 s', 'Encadré, à l’approche', 'Mesuré PRIM, à quai', 'Extrapolé, 3 min 40 s', 'Théorique GTFS', 'Mesuré PRIM, 1 min 05 s'];
  return (
    <Ecran
      theme="nuit"
      carte={{
        center: [2.3546, 48.8697],
        zoom: 15.1,
        offset: [215, 30],
        highlight: ['4', '8', '9'],
        focus: 'Strasbourg - Saint-Denis',
        labels: ['Strasbourg - Saint-Denis', "Château d'Eau", 'Réaumur - Sébastopol', 'République'],
      }}
    >
      <Barre experience="passionne" />
      <div className="absolute bottom-4 left-4 top-[88px] z-10 flex w-[400px] items-start">
        <StationDrawer
          presentation="cote"
          className="w-full"
          station={{
            nom: 'Strasbourg – Saint-Denis',
            lignes: [{ shortName: '4' }, { shortName: '8' }, { shortName: '9' }],
            contexte: 'Paris 2e, 3e et 10e. Sortie conseillée : boulevard de Strasbourg.',
          }}
          groupes={PASSAGES_STRASBOURG.map((g, i) => ({ ...g, detail: detail[i] }))}
          onSuivre={noop}
          {...stationProps(favori, setFavori)}
        />
      </div>
      <Controles recentrer="Recentrer sur Strasbourg – Saint-Denis" />
    </Ecran>
  );
}

function DesktopRecherche() {
  const [q, setQ] = useState('gare');
  return (
    <Ecran theme="nuit" carte={{ ...VUE_PARIS, labels: LABELS_PARIS }}>
      <Barre />
      <Controles />
      <StationSearchPalette ouverte requete={q} onRequete={setQ} {...RECHERCHE_GARE} onChoisir={noop} onClose={noop} actifInitial={1} />
    </Ecran>
  );
}

function DesktopAPropos() {
  return (
    <Ecran theme="jour" carte={{ ...VUE_PARIS, labels: LABELS_PARIS }}>
      <Barre menuOuvert={false} />
      <Controles />
      <AProposModale ouverte onClose={noop} />
    </Ecran>
  );
}

function DesktopRecords() {
  const [jour, setJour] = useState<JourType>('semaine');
  return (
    <Ecran theme="nuit" carte={{ ...VUE_PARIS, labels: LABELS_PARIS }}>
      <Barre />
      <Controles />
      <RecordsModale ouverte onClose={noop} jour={jour} onJour={setJour} plus={RECORDS_PLUS} moins={RECORDS_MOINS} source="Entrées moyennes par jour. Chiffres de démonstration." />
    </Ecran>
  );
}

function Cabine({ img, ...hud }: { img: string } & Partial<Parameters<typeof CabHud>[0]>) {
  const [vue, setVue] = useState<'quai' | 'cabine'>('cabine');
  const [pause, setPause] = useState(false);
  const [direct, setDirect] = useState(hud.direct ?? false);
  const [route, setRoute] = useState(hud.route ?? '14');
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <img src={img} alt="" className="absolute inset-0 size-full object-cover" />
      <CabHud
        ligne={{ shortName: route }}
        routes={ROUTES_CABINE}
        route={route}
        onRoute={setRoute}
        station=""
        aQuai={false}
        prochaine=""
        direction=""
        voie=""
        vitesse={0}
        materiel=""
        allure="1×"
        {...hud}
        vue={vue}
        onVue={setVue}
        pause={pause}
        onPause={() => setPause((v) => !v)}
        direct={direct}
        onDirect={() => setDirect((v) => !v)}
        onQuitter={noop}
      />
    </div>
  );
}

const CabMp14 = () => (
  <Cabine
    img={cabMp14}
    route="14"
    station="Villejuif – Gustave Roussy"
    aQuai={false}
    prochaine="Villejuif – Gustave Roussy"
    direction="Aéroport d’Orly"
    voie="En tunnel, conduite automatique"
    vitesse={65}
    arrets={['Maison-Blanche', 'Hôpital Bicêtre', 'Villejuif', 'L’Haÿ-les-Roses', 'Chevilly-Larue']}
    index={1}
    progression={0.55}
    materiel="MP 14 CA"
    direct={false}
  />
);

const CabMf01 = () => (
  <Cabine
    img={cabMf01}
    route="9"
    station="Pont de Sèvres"
    aQuai
    prochaine="Billancourt"
    direction="Mairie de Montreuil"
    voie="Station souterraine, portes ouvertes"
    vitesse={0}
    arrets={['Pont de Sèvres', 'Billancourt', 'Marcel Sembat', 'Porte de Saint-Cloud', 'Exelmans']}
    index={0}
    progression={0}
    materiel="MF 01"
    direct
  />
);

function MobileOverview() {
  return (
    <Ecran theme="jour" carte={{ center: [2.3488, 48.8606], zoom: 11.35, offset: [0, -30], labels: ['Châtelet', 'Gare du Nord', 'Nation', 'Montparnasse - Bienvenüe'] }}>
      <Barre />
      <Controles mobile />
      <div className="absolute inset-x-0 bottom-0 z-10">
        <BarreMobile onSearch={noop} onRubrique={noop} />
      </div>
    </Ecran>
  );
}

function MobileMenu() {
  const [experience, setExperience] = useState<Experience>('passionne');
  const [theme, setTheme] = useState<ThemeChoix>('systeme');
  return (
    <Ecran theme="jour" carte={{ center: [2.3488, 48.8606], zoom: 11.35, offset: [0, -30], labels: ['Châtelet', 'Gare du Nord', 'Nation'] }}>
      <Barre menuOuvert />
      <div className="absolute inset-x-0 bottom-0 z-10">
        <BarreMobile onSearch={noop} onRubrique={noop} />
      </div>
      <div className="absolute right-3 top-[80px] z-20">
        <MenuPrincipal experience={experience} onExperience={setExperience} theme={theme} onTheme={setTheme} onRecords={noop} onAPropos={noop} />
      </div>
    </Ecran>
  );
}

function MobileStation() {
  const [favori, setFavori] = useState(false);
  return (
    <Ecran theme="jour" carte={{ center: [2.369, 48.8531], zoom: 15.4, offset: [0, -300], highlight: ['1', '5', '8'], focus: 'Bastille', labels: ['Bastille'] }}>
      <Barre />
      <div className="absolute inset-x-0 bottom-0 z-20">
        <StationDrawer
          presentation="basse"
          station={{
            nom: 'Bastille',
            lignes: [{ shortName: '1' }, { shortName: '5' }, { shortName: '8' }],
            contexte: 'Paris 4e, 11e et 12e. Sortie conseillée : place de la Bastille.',
          }}
          groupes={PASSAGES_BASTILLE}
          {...stationProps(favori, setFavori)}
        />
      </div>
    </Ecran>
  );
}

function MobileAutour() {
  return (
    <Ecran
      theme="jour"
      carte={{ center: [2.3712, 48.8538], zoom: 15.6, offset: [0, -250], highlight: ['1', '5', '8', '14'], labels: ['Bastille', 'Bréguet-Sabin', 'Ledru-Rollin'], utilisateur: [2.3733, 48.8549] }}
    >
      <Barre actif="autour" />
      <div className="absolute inset-x-0 bottom-0 z-20">
        <NearbyDrawer presentation="basse" etat="pret" precision={15} stations={STATIONS_PROCHES} onStation={noop} onReessayer={noop} onRechercher={noop} onClose={noop} />
      </div>
    </Ecran>
  );
}

export interface ScreenDef {
  id: string;
  titre: string;
  note?: string;
  groupe?: 'v2.1' | 'refonte-mobile';
  theme: 'jour' | 'nuit';
  width: number;
  height: number;
  file: string;
  Component: ComponentType;
}

export const SCREENS: ScreenDef[] = [
  { id: 'desktop-overview', titre: 'Accueil, lignes et état du trafic', theme: 'jour', width: 1440, height: 900, file: '01_bureau_jour_accueil.png', Component: DesktopOverview },
  { id: 'desktop-route', titre: 'Itinéraire A → B, de nuit', theme: 'nuit', width: 1440, height: 900, file: '02_bureau_nuit_itineraire.png', Component: DesktopRoute },
  { id: 'desktop-station', titre: 'Fiche station, mode Passionné, de nuit', theme: 'nuit', width: 1440, height: 900, file: '03_bureau_nuit_station.png', Component: DesktopStation },
  { id: 'cab-mp14', titre: 'Cabine ligne 14 (MP 14 CA)', theme: 'nuit', width: 1440, height: 900, file: '04_bureau_cabine_mp14.png', Component: CabMp14 },
  { id: 'cab-mf01', titre: 'Cabine ligne 9 (MF 01), à quai', theme: 'nuit', width: 1440, height: 900, file: '05_bureau_cabine_mf01.png', Component: CabMf01 },
  { id: 'mobile-overview', titre: 'Accueil mobile', theme: 'jour', width: 390, height: 844, file: '06_mobile_accueil.png', Component: MobileOverview },
  { id: 'mobile-station', titre: 'Fiche station mobile', theme: 'jour', width: 390, height: 844, file: '07_mobile_station.png', Component: MobileStation },
  { id: 'desktop-ligne', titre: 'Ligne 4, mode Passionné, thermomètre', theme: 'jour', width: 1440, height: 900, file: '08_bureau_jour_ligne.png', Component: DesktopLigne },
  { id: 'desktop-suivi', titre: 'Suivi d’une rame', theme: 'jour', width: 1440, height: 900, file: '09_bureau_jour_suivi.png', Component: DesktopSuivi },
  { id: 'desktop-recherche', titre: 'Recherche ⌘K, de nuit', theme: 'nuit', width: 1440, height: 900, file: '10_bureau_nuit_recherche.png', Component: DesktopRecherche },
  { id: 'desktop-apropos', titre: 'À propos et méthode', theme: 'jour', width: 1440, height: 900, file: '11_bureau_jour_apropos.png', Component: DesktopAPropos },
  { id: 'desktop-records', titre: 'Records de fréquentation, de nuit', theme: 'nuit', width: 1440, height: 900, file: '12_bureau_nuit_records.png', Component: DesktopRecords },
  { id: 'mobile-autour', titre: 'Autour de moi', theme: 'jour', width: 390, height: 844, file: '13_mobile_autour.png', Component: MobileAutour },
  { id: 'mobile-menu', titre: 'Menu et réglages, mobile', theme: 'jour', width: 390, height: 844, file: '14_mobile_menu.png', Component: MobileMenu },
  {
    id: 'refonte-mobile-accueil',
    titre: '1 · Accueil — carte vivante & feuille 3 crans',
    note: 'Pastille unique « Paris · 312 rames · PRIM », 60 % de carte, recherche + pastilles réseau cliquables (tirer la poignée ou toucher une ligne).',
    groupe: 'refonte-mobile',
    theme: 'jour',
    width: 390,
    height: 844,
    file: '15_refonte_mobile_accueil.png',
    Component: RefonteMobileAccueil,
  },
  {
    id: 'refonte-mobile-station',
    titre: '2 · Station Bastille — cran moyen',
    note: 'Plaque émail + ⋯ conservés, afficheurs cliquables avec source PRIM, pied compact sur 1 ligne.',
    groupe: 'refonte-mobile',
    theme: 'jour',
    width: 390,
    height: 844,
    file: '16_refonte_mobile_station.png',
    Component: RefonteMobileStation,
  },
  {
    id: 'refonte-mobile-itineraire',
    titre: '3 · Itinéraire — cran haut',
    note: 'Bande carte avec tracé, voiture conseillée dans l’étape, alternative repliée en 1 ligne cliquable (sans faux Démarrer GPS).',
    groupe: 'refonte-mobile',
    theme: 'jour',
    width: 390,
    height: 844,
    file: '17_refonte_mobile_itineraire.png',
    Component: RefonteMobileItineraire,
  },
  {
    id: 'refonte-mobile-suivi',
    titre: '4 · Suivi d’une rame',
    note: 'Carte flottante compacte avec vitesse en afficheur ambre, confiance PRIM, matériel et accès direct 3D.',
    groupe: 'refonte-mobile',
    theme: 'jour',
    width: 390,
    height: 844,
    file: '18_refonte_mobile_suivi.png',
    Component: RefonteMobileSuivi,
  },
  {
    id: 'refonte-mobile-cabine',
    titre: '5 · Vue 3D cabine mobile — 2 zones',
    note: 'Zéro chevauchement sur 390 px : quitter × + Plaque émail + pastille en haut ; HUD verre unifié avec InterrupteurDirect et matériel en bas.',
    groupe: 'refonte-mobile',
    theme: 'nuit',
    width: 390,
    height: 844,
    file: '19_refonte_mobile_cabine.png',
    Component: RefonteMobileCabine,
  },
];
