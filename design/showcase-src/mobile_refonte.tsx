import {
  RiArrowDownSLine, RiArrowLeftSLine, RiArrowUpDownLine, RiBox3Line, RiBriefcase4Line,
  RiBuilding2Line, RiCloseLine, RiGitCommitLine, RiHome5Line, RiMapPinUserLine, RiMore2Line,
  RiNavigationFill, RiNavigationLine, RiPauseLine, RiPlayLine, RiRouteLine,
  RiShareForwardLine, RiStarFill, RiStarLine,
} from '@remixicon/react';
import { useRef, useState, type ReactNode } from 'react';
import {
  Afficheur, Button, cx, IconButton, InterrupteurDirect, LineBadgeChip, Marque, MenuBouton,
  MenuPrincipal, Panneau, Passages, PlanDeLigne, PlanDeLigneHorizontal, Plaque, resolveLine,
  SearchTrigger, Segmented, Thermometre, VoitureConseillee,
  type DepartGroupe, type Experience, type ThemeChoix,
} from '../../web/src/ui';
import cabMf01 from './assets/cab_mf01.jpg';
import cabMp14 from './assets/cab_mp14.jpg';
import {
  LIGNE4_ARRETS, LIGNE4_RAMES, LIGNES, PASSAGES_BASTILLE, ROUTES_CABINE,
} from './fixtures';
import { ParisBackdrop, type BackdropProps } from './ParisBackdrop';

const noop = () => {};

type Cran = 'bas' | 'moyen' | 'haut';

const CRAN_H: Record<Cran, number> = {
  bas: 342,
  moyen: 536,
  haut: 736,
};

const CRAN_LABEL: Record<Cran, string> = {
  bas: 'Bas',
  moyen: 'Moyen',
  haut: 'Haut',
};

const PASSAGES_BASTILLE_PASSIONNE: DepartGroupe[] = PASSAGES_BASTILLE.map((g, i) => ({
  ...g,
  detail: [
    'Mesuré PRIM · 1 min 40 s',
    'Encadré en direct',
    'Mesuré PRIM · 2 min 05 s',
    'Mesuré PRIM · à quai',
    'Extrapolé · 3 min 10 s',
    'Théorique GTFS',
  ][i],
}));

function MobileShell({
  theme = 'jour',
  carte,
  children,
}: {
  theme?: 'jour' | 'nuit';
  carte?: Omit<BackdropProps, 'width' | 'height' | 'theme'>;
  children: ReactNode;
}) {
  return (
    <div className={cx('relative h-[844px] w-[390px] overflow-hidden bg-fond text-encre', theme === 'nuit' && 'dark')}>
      {carte && <ParisBackdrop width={390} height={844} theme={theme} {...carte} />}
      {children}
      {/* Simulateur discret d'indicateur d'accueil iPhone pour juger la marge de 34 px */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 left-1/2 z-50 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-encre/25"
      />
    </div>
  );
}

/**
 * Feuille basse interactive à 3 crans (bas, moyen, haut) :
 * gère le glisser tactile/souris avec vélocité + le tap sur la poignée.
 */
function ThreeDetentSheet({
  cran,
  onCran,
  minCran = 'bas',
  children,
  footer,
}: {
  cran: Cran;
  onCran: (c: Cran) => void;
  minCran?: Cran;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const drag = useRef<{ y0: number; h0: number; t0: number; moved: boolean } | null>(null);
  const [liveH, setLiveH] = useState<number | null>(null);

  const crans: Cran[] = minCran === 'moyen' ? ['moyen', 'haut'] : ['bas', 'moyen', 'haut'];
  const minH = CRAN_H[minCran];
  const maxH = CRAN_H.haut;

  const snapFrom = (h: number, velocityY: number): Cran => {
    // velocityY > 0 means swiping down
    if (Math.abs(velocityY) > 0.35) {
      const idx = crans.indexOf(cran);
      const next = velocityY > 0 ? Math.max(0, idx - 1) : Math.min(crans.length - 1, idx + 1);
      return crans[next];
    }
    return crans.reduce((best, c) =>
      Math.abs(CRAN_H[c] - h) < Math.abs(CRAN_H[best] - h) ? c : best,
    );
  };

  const height = liveH ?? CRAN_H[cran];

  return (
    <Panneau
      matiere="feuille"
      as="section"
      style={{ height }}
      className={cx(
        'absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-b-none',
        liveH === null && 'transition-[height] duration-300 ease-portes',
      )}
    >
      {/* Zone de saisie tactile >= 44px autour de la poignée */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Hauteur de la feuille"
        aria-valuemin={1}
        aria-valuemax={crans.length}
        aria-valuenow={crans.indexOf(cran) + 1}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { y0: e.clientY, h0: CRAN_H[cran], t0: performance.now(), moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dy = e.clientY - drag.current.y0;
          if (Math.abs(dy) > 4) drag.current.moved = true;
          const clamped = Math.max(minH - 24, Math.min(maxH + 16, drag.current.h0 - dy));
          setLiveH(clamped);
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const dt = Math.max(16, performance.now() - drag.current.t0);
          const dy = e.clientY - drag.current.y0;
          const velocityY = dy / dt;
          const finalH = liveH ?? drag.current.h0;
          const wasClick = !drag.current.moved;
          drag.current = null;
          setLiveH(null);
          if (wasClick) {
            const idx = crans.indexOf(cran);
            onCran(crans[(idx + 1) % crans.length]);
          } else {
            onCran(snapFrom(finalH, velocityY));
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setLiveH(null);
        }}
        className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-between px-4 active:cursor-grabbing"
      >
        <span className="w-16" aria-hidden />
        <span aria-hidden className="h-[5px] w-10 rounded-full bg-bord-fort" />
        <div className="flex w-16 justify-end gap-1">
          {crans.map((c) => (
            <button
              key={c}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCran(c)}
              aria-label={`Cran ${CRAN_LABEL[c]}`}
              className={cx(
                'h-2 rounded-full transition-all',
                c === cran ? 'w-4 bg-action' : 'w-2 bg-bord-fort hover:bg-encre-3',
              )}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

      {footer && (
        <footer className="shrink-0 border-t border-joint bg-surface px-4 pt-3 pb-[34px]">
          {footer}
        </footer>
      )}
    </Panneau>
  );
}

/* ============================================================================
 * 1 · Accueil (cran bas — ~60% carte vivante + feuille Passionné 3 crans)
 * ========================================================================== */
export function RefonteMobileAccueil() {
  const [cran, setCran] = useState<Cran>('bas');
  const [menuOpen, setMenuOpen] = useState(false);
  const [experience, setExperience] = useState<Experience>('passionne');
  const [theme, setTheme] = useState<ThemeChoix>('clair');
  const [vue3d, setVue3d] = useState(true);
  const [bati, setBati] = useState(true);
  const [gps, setGps] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [inverse, setInverse] = useState(false);

  const isDark = theme === 'sombre';
  const arrets = inverse ? [...LIGNE4_ARRETS].reverse() : LIGNE4_ARRETS;
  const activeLigne = selectedLine ? LIGNES.find((l) => l.shortName === selectedLine) ?? LIGNES[4] : null;
  const alertes = LIGNES.filter((l) => l.alert);

  return (
    <MobileShell
      theme={isDark ? 'nuit' : 'jour'}
      carte={{
        center: selectedLine ? [2.3455, 48.8615] : [2.3488, 48.861],
        zoom: selectedLine ? 12.6 : 11.75,
        offset: [0, -140],
        highlight: selectedLine ? [selectedLine] : [],
        labels: selectedLine
          ? ['Gare du Nord', 'Châtelet', 'Montparnasse - Bienvenüe', 'Denfert-Rochereau']
          : ['Châtelet', 'Bastille', 'Gare du Nord', 'Montparnasse - Bienvenüe'],
        trains: [
          { line: '1', from: 'Châtelet', to: 'Hôtel de Ville', t: 0.4 },
          { line: '1', from: 'Bastille', to: 'Gare de Lyon', t: 0.65 },
          { line: '4', from: 'Simplon', to: 'Marcadet', t: 0.5 },
          { line: '4', from: 'Gare du Nord', to: 'Gare de l', t: 0.55, suivi: selectedLine === '4' },
          { line: '4', from: 'Saint-Michel', to: 'Odéon', t: 0.7 },
          { line: '9', from: 'République', to: 'Oberkampf', t: 0.45 },
          { line: '14', from: 'Châtelet', to: 'Pyramides', t: 0.6 },
        ],
      }}
    >
      {/* Zone haute épurée : zéro TopNavBar pleine largeur, zéro BarreMobile */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Réseau Paris, 312 rames en temps réel PRIM. Ouvrir le menu"
            className="flottant pointer-events-auto flex h-11 items-center gap-2 rounded-full pl-2.5 pr-3 text-[13px] font-semibold text-encre shadow-flotte"
          >
            <Marque size={22} />
            <span className="signaletique text-[15px] font-[650]">Paris</span>
            <span aria-hidden className="h-3.5 w-px bg-joint" />
            <span className="chiffres text-encre-2">
              <strong className="font-bold text-encre">312</strong> rames
            </span>
            <span
              aria-hidden
              className="size-2 rounded-full bg-normal shadow-[0_0_0_3px_rgb(47_154_86/0.18)]"
            />
            <span className="text-[12px] font-semibold text-normal-encre">PRIM</span>
            <RiArrowDownSLine aria-hidden className="size-4 text-icone-2" />
          </button>

          {menuOpen && (
            <MenuPrincipal
              experience={experience}
              onExperience={setExperience}
              theme={theme}
              onTheme={setTheme}
              reseaux={[
                { id: 'paris', nom: 'Paris', actif: true, onSelect: noop },
                { id: 'london', nom: 'Londres', actif: false, onSelect: noop },
                { id: 'montreal', nom: 'Montréal', actif: false, onSelect: noop },
                { id: 'berlin', nom: 'Berlin', actif: false, onSelect: noop },
              ]}
              onRecords={() => setMenuOpen(false)}
              onAPropos={() => setMenuOpen(false)}
              className="pointer-events-auto absolute left-0 top-[calc(100%+8px)]"
            />
          )}
        </div>

        <Panneau matiere="flottant" className="flex flex-col gap-0.5 p-1">
          <IconButton
            label="Vue en 3D"
            pressed={vue3d}
            onClick={() => setVue3d((v) => !v)}
            icon={<RiBox3Line aria-hidden />}
          />
          {experience === 'passionne' && (
            <IconButton
              label="Bâtiments en relief"
              pressed={bati}
              onClick={() => setBati((v) => !v)}
              icon={<RiBuilding2Line aria-hidden />}
            />
          )}
          <span aria-hidden className="mx-2 my-0.5 h-px bg-joint" />
          <IconButton
            label="Suivre ma position"
            pressed={gps}
            onClick={() => setGps((v) => !v)}
            icon={gps ? <RiNavigationFill aria-hidden /> : <RiNavigationLine aria-hidden />}
          />
        </Panneau>
      </div>

      <ThreeDetentSheet
        cran={cran}
        onCran={(c) => {
          setCran(c);
          if (c === 'bas' && selectedLine) setSelectedLine(null);
        }}
        footer={
          activeLigne ? (
            <Button
              variant="afficheur"
              size="lg"
              fullWidth
              icon={<RiBox3Line aria-hidden />}
              onClick={noop}
            >
              Monter à bord · Ligne {activeLigne.shortName}
            </Button>
          ) : undefined
        }
      >
        {activeLigne ? (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between">
              <Button
                variant="discret"
                size="sm"
                icon={<RiArrowLeftSLine aria-hidden />}
                onClick={() => {
                  setSelectedLine(null);
                  setCran('bas');
                }}
              >
                Toutes les lignes
              </Button>
              <span className="chiffres text-[12px] font-semibold text-encre-3">
                312 rames actives
              </span>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <LineBadgeChip {...activeLigne} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-titre-sm text-encre">Ligne {activeLigne.shortName}</h2>
                <p className="signaletique truncate text-[14px] text-encre-2">
                  {activeLigne.termini ? `${activeLigne.termini[0]} – ${activeLigne.termini[1]}` : 'Réseau Île-de-France'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-[12px] bg-encart py-1.5 pl-3 pr-1.5">
              <p className="min-w-0 text-[12px] font-semibold text-encre-3">
                Direction
                <span className="signaletique block truncate text-[16px] font-[650] text-encre">
                  {inverse ? 'Porte de Clignancourt' : 'Bagneux – Lucie Aubrac'}
                </span>
              </p>
              <IconButton
                size="md"
                variant="secondaire"
                label="Inverser la direction"
                icon={<RiArrowUpDownLine aria-hidden />}
                onClick={() => setInverse((v) => !v)}
              />
            </div>

            {experience === 'passionne' && (
              <dl className="mt-3 grid grid-cols-2 border-y border-joint">
                {[
                  ['Rames en ligne', '27'],
                  ['Longueur', '14 km · 29 stations'],
                  ['Matériel', 'MP 89 CA, MP 05'],
                  ['Exploitation', 'Automatique intégrale'],
                ].map(([label, valeur], i) => (
                  <div
                    key={label}
                    className={cx(
                      'py-2',
                      i % 2 === 0 ? 'border-r border-joint pr-3' : 'pl-3',
                      i > 1 && 'border-t border-joint',
                    )}
                  >
                    <dt className="text-legende text-encre-3">{label}</dt>
                    <dd className="chiffres truncate text-[15px] font-semibold text-encre">{valeur}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-3">
              <Thermometre
                couleur={resolveLine({ shortName: '4' }).color}
                arrets={LIGNE4_ARRETS.slice(0, 14)}
                rames={LIGNE4_RAMES.slice(0, 4)}
                onArret={noop}
                onRame={noop}
                onCorrespondance={(s) => setSelectedLine(s)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 px-4 pb-[34px]">
            {/* Recherche unifiée sous le pouce */}
            <SearchTrigger onOpen={noop} size="lg" shortcut={false} className="w-full" />

            {/* Raccourcis orientés exploration réseau (vs Domicile/Travail de Plans) */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCran(cran === 'haut' ? 'bas' : 'haut')}
                className="flex h-11 items-center justify-center gap-1.5 rounded-controle border border-bord bg-surface px-2 text-[13px] font-semibold text-encre transition-colors hover:bg-encart"
              >
                <RiGitCommitLine aria-hidden className="size-[18px] text-icone" />
                <span>Lignes</span>
              </button>
              <button
                type="button"
                onClick={noop}
                className="flex h-11 items-center justify-center gap-1.5 rounded-controle border border-bord bg-surface px-2 text-[13px] font-semibold text-encre transition-colors hover:bg-encart"
              >
                <RiMapPinUserLine aria-hidden className="size-[18px] text-icone" />
                <span>Autour</span>
              </button>
              <button
                type="button"
                onClick={noop}
                className="flex h-11 items-center justify-center gap-1.5 rounded-controle border border-bord bg-surface px-2 text-[13px] font-semibold text-encre transition-colors hover:bg-encart"
              >
                <RiRouteLine aria-hidden className="size-[18px] text-icone" />
                <span>Itinéraire</span>
              </button>
            </div>

            {/* Cœur Passionné dès l'accueil : réseau vivant + pastilles interactives */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.04em] text-encre-3">
                  Réseau en direct
                </h2>
                <span className="chiffres text-[12px] font-semibold text-encre-2">
                  19/21 normales · {alertes.length} alertes
                </span>
              </div>

              {cran === 'bas' ? (
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1">
                  {LIGNES.map((l) => (
                    <div key={l.shortName} className="flex shrink-0 items-center justify-center">
                      <LineBadgeChip
                        {...l}
                        size="lg"
                        onClick={() => {
                          setSelectedLine(l.shortName);
                          setCran('moyen');
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h3 className="mb-1.5 text-[12px] font-semibold text-encre-3">Métro</h3>
                    <div className="flex flex-wrap gap-2">
                      {LIGNES.slice(0, 16).map((l) => (
                        <LineBadgeChip
                          key={l.shortName}
                          {...l}
                          size="lg"
                          onClick={() => setSelectedLine(l.shortName)}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-[12px] font-semibold text-encre-3">RER</h3>
                    <div className="flex flex-wrap gap-2">
                      {LIGNES.slice(16).map((l) => (
                        <LineBadgeChip
                          key={l.shortName}
                          {...l}
                          size="lg"
                          onClick={() => setSelectedLine(l.shortName)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* État trafic synthétique / détaillé au cran moyen-haut */}
            <div className="border-t border-joint pt-3">
              {cran === 'bas' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-encre">
                      Tirer vers le haut : état &amp; thermomètre
                    </p>
                    <p className="chiffres truncate text-[12px] text-encre-3">
                      18 450 km simulés · MP 14, MP 89, MF 01, Sprague
                    </p>
                  </div>
                  <Button
                    variant="afficheur"
                    size="sm"
                    icon={<RiBox3Line aria-hidden />}
                    onClick={noop}
                  >
                    Vue 3D
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="flex items-center gap-2 text-[14px] text-encre-2">
                    <span aria-hidden className="size-2 rounded-full bg-normal" />
                    Trafic normal sur 19 lignes sur 21.
                  </p>
                  <ul className="space-y-2">
                    {alertes.map((l) => (
                      <li key={l.shortName} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
                        <LineBadgeChip {...l} size="xs" className="mt-0.5" />
                        <p className="text-[13px] leading-[18px] text-encre-2">
                          <span className={cx('font-semibold', l.alert === 'signal' ? 'text-signal-encre' : 'text-vigilance-encre')}>
                            {l.alert === 'signal' ? 'Interrompu. ' : 'Perturbé. '}
                          </span>
                          {l.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="afficheur"
                    size="lg"
                    fullWidth
                    icon={<RiBox3Line aria-hidden />}
                    onClick={noop}
                  >
                    Monter à bord d’une rame en 3D
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </ThreeDetentSheet>
    </MobileShell>
  );
}

/* ============================================================================
 * 2 · Station (cran moyen — Plaque émail + Afficheurs cliquables + pied 1 ligne)
 * ========================================================================== */
export function RefonteMobileStation() {
  const [cran, setCran] = useState<Cran>('moyen');
  const [favori, setFavori] = useState(true);
  const [followedHint, setFollowedHint] = useState<string | null>(null);

  return (
    <MobileShell
      carte={{
        center: [2.369, 48.8531],
        zoom: 15.3,
        offset: [0, -250],
        highlight: ['1', '5', '8'],
        focus: 'Bastille',
        labels: ['Bastille', 'Saint-Paul', 'Bréguet - Sabin'],
        trains: [
          { line: '1', from: 'Saint-Paul', to: 'Bastille', t: 0.72 },
          { line: '5', from: 'Bréguet', to: 'Bastille', t: 0.45 },
        ],
      }}
    >
      {/* Barre haute minimale : zéro TopNavBar, place maximale pour la carte */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between">
        <button
          type="button"
          className="flottant pointer-events-auto flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-encre shadow-flotte"
        >
          <RiArrowLeftSLine aria-hidden className="size-4" />
          Carte
        </button>
        <IconButton
          label="Vue en 3D"
          pressed
          onClick={noop}
          className="flottant pointer-events-auto rounded-full shadow-flotte"
          icon={<RiBox3Line aria-hidden />}
        />
      </div>

      <ThreeDetentSheet
        cran={cran}
        onCran={setCran}
        minCran="moyen"
        footer={
          <div className="grid grid-cols-[1.15fr_1fr_1fr] gap-2">
            <Button variant="primaire" size="lg" icon={<RiRouteLine aria-hidden />} className="px-2.5 text-[15px]">
              Y aller
            </Button>
            <Button variant="secondaire" size="lg" className="px-2 text-[14px]">
              Partir d’ici
            </Button>
            <Button variant="afficheur" size="lg" icon={<RiBox3Line aria-hidden />} className="px-2 text-[14px]">
              Quai 3D
            </Button>
          </div>
        }
      >
        <div className="px-4 pb-3">
          {/* Identité Faïence préservée : Plaque émail + actions rares dans ⋯ */}
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1 pr-1">
              <Plaque as="h2" size="md">Bastille</Plaque>
            </div>
            <IconButton
              size="md"
              label="Favori"
              pressed={favori}
              onClick={() => setFavori((v) => !v)}
              icon={favori ? <RiStarFill aria-hidden /> : <RiStarLine aria-hidden />}
              className="size-11"
            />
            <MenuBouton
              size="md"
              label="Plus d’actions"
              icon={<RiMore2Line aria-hidden />}
              entrees={[
                { label: 'Partager la station', icon: <RiShareForwardLine aria-hidden />, onSelect: noop },
                { label: 'Utiliser comme domicile', icon: <RiHome5Line aria-hidden />, onSelect: noop },
                { label: 'Utiliser comme travail', icon: <RiBriefcase4Line aria-hidden />, onSelect: noop },
              ]}
            />
            <IconButton size="md" label="Fermer la fiche" icon={<RiCloseLine aria-hidden />} onClick={noop} className="size-11" />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {['1', '5', '8'].map((s) => (
              <LineBadgeChip key={s} shortName={s} size="md" onClick={noop} />
            ))}
            <span className="ml-1 text-[13px] text-encre-2">Paris 4e · 11e · 12e</span>
          </div>

          {followedHint && (
            <p className="mt-2.5 rounded-controle bg-selection px-3 py-1.5 text-[13px] font-semibold text-selection-encre">
              {followedHint}
            </p>
          )}

          <div className="mt-4">
            <Passages
              groupes={PASSAGES_BASTILLE_PASSIONNE}
              direct
              onLigne={noop}
              onSuivre={(gIdx, pIdx) => {
                const grp = PASSAGES_BASTILLE_PASSIONNE[gIdx];
                setFollowedHint(`Suivi de la rame ligne ${grp.ligne.shortName} → ${grp.direction} (#${pIdx + 1})`);
              }}
            />
          </div>
        </div>
      </ThreeDetentSheet>
    </MobileShell>
  );
}

/* ============================================================================
 * 3 · Itinéraire (cran haut avec bande de carte + voiture intégrée + alt 1 ligne)
 * ========================================================================== */
export function RefonteMobileItineraire() {
  const [cran, setCran] = useState<Cran>('haut');
  const [depart, setDepart] = useState('Saint-Lazare');
  const [arrivee, setArrivee] = useState('Bastille');
  const [altSelected, setAltSelected] = useState(false);

  return (
    <MobileShell
      carte={{
        center: [2.346, 48.864],
        zoom: 12.85,
        offset: [0, -342],
        highlight: ['14', '1'],
        route: { line: '1', stops: ['Châtelet', 'Hôtel de Ville', 'Saint-Paul', 'Bastille'] },
        labels: ['Saint-Lazare', 'Châtelet', 'Bastille'],
      }}
    >
      {/* Bande de carte lisible au-dessus du cran haut */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between">
        <button
          type="button"
          className="flottant pointer-events-auto flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-encre shadow-flotte"
        >
          <RiArrowLeftSLine aria-hidden className="size-4" />
          Carte
        </button>
        <span className="flottant chiffres pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-encre-2 shadow-flotte">
          <span aria-hidden className="size-2 rounded-full bg-normal" />
          PRIM actif
        </span>
      </div>

      <ThreeDetentSheet
        cran={cran}
        onCran={setCran}
        minCran="moyen"
        footer={
          <div className="grid grid-cols-[1fr_1.3fr] gap-2">
            <Button variant="secondaire" size="lg" icon={<RiShareForwardLine aria-hidden />}>
              Partager
            </Button>
            <Button variant="afficheur" size="lg" icon={<RiBox3Line aria-hidden />}>
              Quai départ 3D
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 px-4 pb-3">
          {/* Champs A/B compacts + inverser */}
          <div className="relative rounded-[14px] bg-encart p-0.5">
            <div className="flex h-10 items-center gap-2.5 pl-3 pr-12">
              <span aria-hidden className="size-[10px] shrink-0 rounded-full border-[3px] border-encre" />
              <input
                aria-label="Départ"
                value={depart}
                onChange={(e) => setDepart(e.target.value)}
                className="signaletique min-w-0 flex-1 bg-transparent text-[15px] font-[650] text-encre outline-none"
              />
            </div>
            <span aria-hidden className="absolute left-[17px] top-[28px] h-[22px] border-l-2 border-dotted border-bord-fort" />
            <span aria-hidden className="mx-3 ml-10 mr-14 block h-px bg-joint" />
            <div className="flex h-10 items-center gap-2.5 pl-3 pr-12">
              <span aria-hidden className="size-[10px] shrink-0 rounded-full bg-action" />
              <input
                aria-label="Arrivée"
                value={arrivee}
                onChange={(e) => setArrivee(e.target.value)}
                className="signaletique min-w-0 flex-1 bg-transparent text-[15px] font-[650] text-encre outline-none"
              />
            </div>
            <IconButton
              size="md"
              variant="secondaire"
              label="Inverser départ et arrivée"
              icon={<RiArrowUpDownLine aria-hidden />}
              onClick={() => {
                setDepart(arrivee);
                setArrivee(depart);
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            />
          </div>

          {/* Raccourcis personnels restent ici (hors écran d'accueil) */}
          <div className="flex gap-1.5 overflow-x-auto">
            <Button size="sm" icon={<RiHome5Line aria-hidden />} onClick={() => setArrivee('Voltaire (Domicile)')}>
              Domicile
            </Button>
            <Button size="sm" icon={<RiBriefcase4Line aria-hidden />} onClick={() => setArrivee('La Défense (Travail)')}>
              Travail
            </Button>
          </div>

          {/* Trajet principal retenu : voiture conseillée intégrée à l'étape */}
          <div className="rounded-panneau bg-surface p-3 [box-shadow:inset_0_0_0_2px_var(--color-action)]">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2.5">
                <span className="chiffres text-[24px] font-bold leading-none text-encre">
                  {altSelected ? '22 min' : '15 min'}
                </span>
                <span className="chiffres text-[13px] font-medium text-encre-2">
                  {altSelected ? '21:24 → 21:46' : '21:23 → 21:38'}
                </span>
              </div>
              <span className="rounded-[7px] bg-selection px-2 py-0.5 text-[12px] font-semibold text-selection-encre">
                {altSelected ? 'Moins de marche' : 'Le plus rapide'}
              </span>
            </div>

            <div className="mt-2.5 space-y-2">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <LineBadgeChip shortName="14" size="sm" />
                  <span className="text-[13px] font-semibold text-encre-2">
                    Dir. Aéroport d’Orly · 3 arrêts · 6 min
                  </span>
                  <Afficheur passages={[{ minutes: 2 }]} max={1} size="sm" className="ml-auto" />
                </div>
                <PlanDeLigne
                  couleur={resolveLine({ shortName: '14' }).color}
                  replier
                  arrets={[
                    {
                      nom: 'Saint-Lazare',
                      role: 'depart',
                      detail: (
                        <VoitureConseillee
                          position="tete"
                          raison="pour la correspondance ligne 1"
                        />
                      ),
                    },
                    { nom: 'Madeleine' },
                    { nom: 'Pyramides' },
                    { nom: 'Châtelet', role: 'arrivee', correspondances: [{ shortName: '1' }] },
                  ]}
                />
              </div>

              <div className="flex items-center gap-2 border-y border-joint py-1 text-[12px] text-encre-2">
                <span>Correspondance à Châtelet · 4 min à pied (140 m)</span>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <LineBadgeChip shortName={altSelected ? '8' : '1'} size="sm" />
                  <span className="text-[13px] font-semibold text-encre-2">
                    {altSelected ? 'Dir. Pointe du Lac · 6 arrêts · 9 min' : 'Dir. Château de Vincennes · 3 arrêts · 5 min'}
                  </span>
                </div>
                <PlanDeLigne
                  couleur={resolveLine({ shortName: altSelected ? '8' : '1' }).color}
                  replier
                  arrets={[
                    { nom: 'Châtelet', role: 'depart' },
                    { nom: 'Hôtel de Ville' },
                    { nom: 'Saint-Paul' },
                    { nom: 'Bastille', role: 'arrivee' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Alternative repliée en 1 ligne (44px+ tactile) */}
          <button
            type="button"
            onClick={() => setAltSelected((v) => !v)}
            className="flex min-h-[48px] items-center gap-2.5 rounded-panneau border border-bord bg-surface px-3.5 text-left transition-colors hover:bg-encart"
          >
            <span className="chiffres text-[18px] font-bold text-encre">
              {altSelected ? '15 min' : '22 min'}
            </span>
            <span className="flex items-center gap-1">
              <LineBadgeChip shortName="14" size="xs" />
              <span aria-hidden className="text-encre-3">›</span>
              <LineBadgeChip shortName={altSelected ? '1' : '8'} size="xs" />
            </span>
            <span className="ml-auto text-[13px] font-medium text-encre-2">
              {altSelected ? 'Le plus rapide' : 'Moins de marche'}
            </span>
          </button>
        </div>
      </ThreeDetentSheet>
    </MobileShell>
  );
}

/* ============================================================================
 * 4 · Suivi d'une rame (carte flottante compacte + télémétrie Passionné)
 * ========================================================================== */
export function RefonteMobileSuivi() {
  const [recentrerOk, setRecentrerOk] = useState(false);

  return (
    <MobileShell
      carte={{
        center: [2.3568, 48.876],
        zoom: 14.55,
        offset: [0, -110],
        highlight: ['4'],
        labels: ['Barbès - Rochechouart', 'Gare du Nord', "Gare de l'Est - Verdun", "Château d'Eau", 'Strasbourg - Saint-Denis'],
        trains: [
          { line: '4', from: 'Gare du Nord', to: 'Gare de l', t: 0.55, suivi: true },
          { line: '4', from: 'Château Rouge', to: 'Barbès', t: 0.35 },
          { line: '4', from: 'Strasbourg', to: 'Réaumur', t: 0.3 },
        ],
      }}
    >
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between">
        <span className="flottant chiffres flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold text-encre shadow-flotte">
          <span aria-hidden className="size-2 rounded-full bg-normal" />
          Suivi en direct · Ligne 4
        </span>
        <Panneau matiere="flottant" className="flex flex-col gap-0.5 p-1">
          <IconButton label="Vue en 3D" pressed onClick={noop} icon={<RiBox3Line aria-hidden />} />
          <span aria-hidden className="mx-2 my-0.5 h-px bg-joint" />
          <IconButton
            label="Recentrer sur la rame suivie"
            pressed={recentrerOk}
            onClick={() => setRecentrerOk((v) => !v)}
            icon={<RiNavigationFill aria-hidden />}
          />
        </Panneau>
      </div>

      {/* Pas de feuille pleine largeur : carte flottante compacte au-dessus de la barre d'accueil iOS */}
      <Panneau
        as="section"
        matiere="feuille"
        aria-label="Suivi de la rame"
        className="absolute inset-x-3 bottom-[34px] z-20 flex flex-col gap-3 p-4"
      >
        <div className="flex items-start gap-2.5">
          <LineBadgeChip shortName="4" size="md" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-encre-3">Vers Bagneux – Lucie Aubrac</p>
            <p className="signaletique truncate text-[20px] font-[650] leading-[24px] text-encre">
              Gare de l’Est
            </p>
          </div>
          <Afficheur passages={[{ minutes: 1 }]} max={1} size="md" />
          <IconButton size="md" label="Arrêter le suivi" icon={<RiCloseLine aria-hidden />} onClick={noop} />
        </div>

        <PlanDeLigneHorizontal
          couleur={resolveLine({ shortName: '4' }).color}
          arrets={['Barbès', 'Gare du Nord', 'Gare de l’Est', 'Château d’Eau', 'Strasbourg']}
          index={1}
          progression={0.55}
        />

        {/* Valeur ajoutée Passionné conservée : vitesse en afficheur ambre + confiance + matériel */}
        <div className="flex items-center gap-2.5 border-t border-joint pt-2.5">
          <span className="afficheur chiffres inline-flex h-8 items-baseline gap-1 px-2 pt-[7px] font-bold">
            <span className="text-[19px] leading-none">41</span>
            <span className="signaletique text-[10px] font-semibold">km/h</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-encre-2">
              Position mesurée il y a 12 s
            </p>
            <p className="truncate text-[11px] text-encre-3">
              Matériel MP 89 CA · Course PRIM #4182
            </p>
          </div>
        </div>

        <Button variant="afficheur" size="lg" fullWidth icon={<RiBox3Line aria-hidden />}>
          Monter dans cette rame
        </Button>
      </Panneau>
    </MobileShell>
  );
}

/* ============================================================================
 * 5 · Vue 3D Cabine mobile (2 zones verre, zéro chevauchement, Faïence .dark)
 * ========================================================================== */
const CAB_ARRETS = ['Châtelet', 'Pyramides', 'Madeleine', 'Saint-Lazare'];

export function RefonteMobileCabine() {
  const [route, setRoute] = useState<'14' | '9'>('14');
  const [vue, setVue] = useState<'quai' | 'cabine'>('cabine');
  const [sprague, setSprague] = useState(false);
  const [allure, setAllure] = useState<'1×' | '2×' | '4×'>('1×');
  const [pause, setPause] = useState(false);
  const [direct, setDirect] = useState(true);
  const [stopIdx, setStopIdx] = useState(0);

  const img = route === '14' ? cabMp14 : cabMf01;
  const line = resolveLine({ shortName: route });
  const stationsRoute = route === '14' ? CAB_ARRETS : ['Pont de Sèvres', 'Billancourt', 'Marcel Sembat', 'Exelmans'];
  const currentStation = stationsRoute[Math.min(stopIdx + 1, stationsRoute.length - 1)];
  const materiel = sprague ? 'Sprague 1930' : route === '14' ? 'MP 14 CA' : 'MF 01';
  const vitesse = pause ? 0 : route === '14' ? 65 : 38;

  return (
    <div className="dark relative h-[844px] w-[390px] overflow-hidden bg-black text-encre">
      <img src={img} alt="" className="absolute inset-0 size-full object-cover" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/65"
      />

      {/* Zone 1 (Haut) : Quitter × (44px) + Plaque émail tappable + Pastille ligne */}
      <div className="absolute inset-x-3 top-3 z-20 flex items-center gap-2">
        <IconButton
          size="md"
          label="Revenir à la carte"
          icon={<RiCloseLine aria-hidden />}
          onClick={noop}
          className="verre shrink-0 rounded-full text-white"
        />

        <div className="relative flex min-w-0 flex-1 justify-center">
          <Plaque as="p" size="md" className="shadow-[0_8px_24px_-8px_rgb(0_0_0/0.65)]">
            <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap">
              <span className="truncate">{currentStation}</span>
              <RiArrowDownSLine aria-hidden className="size-4 shrink-0 opacity-80" />
            </span>
          </Plaque>
          <select
            aria-label="Choisir une station"
            value={currentStation}
            onChange={(e) => {
              const i = stationsRoute.indexOf(e.target.value);
              if (i >= 0) setStopIdx(Math.max(0, i - 1));
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {stationsRoute.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setRoute((r) => (r === '14' ? '9' : '14'))}
          aria-label={`Ligne ${route}. Changer de ligne ou de sens`}
          title={ROUTES_CABINE.find((r) => r.value === route)?.label}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-white/85 shadow-[0_6px_18px_rgb(0_0_0/0.5)]"
        >
          <LineBadgeChip shortName={route} size="lg" />
        </button>
      </div>

      {/* Zone 2 (Bas) : HUD verre unique unifié (état + vitesse + ruban + pilotage) */}
      <Panneau
        matiere="verre"
        className="absolute inset-x-3 bottom-[34px] z-20 flex flex-col gap-3 p-3.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-encre-3">
              {pause ? 'À l’arrêt · en ligne' : 'En tunnel · prochaine station'}
            </p>
            <p className="signaletique truncate text-[22px] font-[650] leading-[26px] text-white">
              {currentStation}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <InterrupteurDirect direct={direct} onChange={setDirect} source="PRIM" />
              <span className="truncate text-[12px] text-encre-2">
                Dir. {route === '14' ? 'Aéroport d’Orly' : 'Mairie de Montreuil'}
              </span>
            </div>
          </div>

          <span className="afficheur chiffres flex h-12 shrink-0 items-baseline gap-1 px-2.5 pt-[10px] font-bold">
            <span className="text-[28px] leading-none">{vitesse}</span>
            <span className="signaletique text-[11px] font-semibold">km/h</span>
          </span>
        </div>

        {/* Ruban d'arrêts avec confort tactile */}
        <div className="py-0.5">
          <PlanDeLigneHorizontal
            couleur={line.color}
            arrets={stationsRoute}
            index={stopIdx}
            progression={pause ? 0.25 : 0.55}
            onSelectStop={(name) => {
              const i = stationsRoute.indexOf(name);
              if (i >= 0) setStopIdx(Math.max(0, i - 1));
            }}
          />
        </div>

        <div className="flex items-center gap-1.5 border-t border-joint pt-2.5">
          <Segmented
            size="sm"
            label="Point de vue"
            value={vue}
            onChange={setVue}
            options={[
              { value: 'quai', label: 'Quai' },
              { value: 'cabine', label: 'Cabine' },
            ]}
            className="w-[138px] shrink-0"
          />

          <Button
            variant="secondaire"
            size="md"
            onClick={() => setSprague((v) => !v)}
            aria-label={`Matériel roulant : ${materiel}. Changer`}
            className="chiffres min-w-0 flex-1 px-2 text-[12px]"
          >
            <span className="truncate">{materiel}</span>
          </Button>

          <Button
            variant="secondaire"
            size="md"
            onClick={() => setAllure((a) => (a === '1×' ? '2×' : a === '2×' ? '4×' : '1×'))}
            aria-label={`Allure ${allure}`}
            className="chiffres w-11 shrink-0 px-0 text-[13px]"
          >
            {allure}
          </Button>

          <IconButton
            size="md"
            variant="primaire"
            label={pause ? 'Reprendre' : 'Mettre en pause'}
            icon={pause ? <RiPlayLine aria-hidden /> : <RiPauseLine aria-hidden />}
            onClick={() => setPause((v) => !v)}
            className="size-11 shrink-0"
          />
        </div>
      </Panneau>

      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 left-1/2 z-50 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-white/35"
      />
    </div>
  );
}
