import NumberFlow from '@number-flow/react';
import {
  RiAddLine,
  RiAlarmWarningLine,
  RiArrowDownSLine,
  RiArrowLeftRightLine,
  RiArrowLeftSLine,
  RiCameraLine,
  RiCloseLine,
  RiDoorClosedLine,
  RiDoorOpenLine,
  RiEyeLine,
  RiLightbulbFlashLine,
  RiLightbulbLine,
  RiLogoutBoxRLine,
  RiMoonClearLine,
  RiMore2Fill,
  RiPauseLine,
  RiPlayLine,
  RiRainyLine,
  RiRefreshLine,
  RiSteering2Line,
  RiSubtractLine,
  RiSunFoggyLine,
  RiSunLine,
  RiVolumeMuteLine,
  RiVolumeUpLine,
} from '@remixicon/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { InterrupteurDirect } from './InterrupteurDirect';
import { Kbd } from './Kbd';
import { LineBadgeChip } from './LineBadgeChip';
import { resolveLine, type LineRef } from './lines';
import { Panneau } from './Panneau';
import { PlanDeLigneHorizontal } from './PlanDeLigne';
import { Plaque } from './Plaque';
import { Segmented } from './Segmented';
import { useIsDesktop } from './useMediaQuery';

const NOTCH_SEQUENCE: ReadonlyArray<{ value: number; label: string }> = [
  { value: -3, label: 'F3' },
  { value: -2, label: 'F2' },
  { value: -1, label: 'F1' },
  { value: 0, label: '0' },
  { value: 1, label: 'T1' },
  { value: 2, label: 'T2' },
  { value: 3, label: 'T3' },
];

export type QuaiCameraPreset = 'head' | 'mid' | 'tail' | 'overpass';

const QUAI_CAMERA_PRESETS: ReadonlyArray<{ id: QuaiCameraPreset; label: string }> = [
  { id: 'head', label: 'Tête' },
  { id: 'mid', label: 'Milieu' },
  { id: 'tail', label: 'Queue' },
  { id: 'overpass', label: 'Hauteur' },
];

export interface SielQuaiBoards {
  pos: { heading: string; rows: Array<{ dest: string; eta: string }> };
  neg: { heading: string; rows: Array<{ dest: string; eta: string }> };
}

/**
 * HUD of the Quai 3D / Cabine view. Always dark opaque Plan Lumineux island (`.pl-hud`),
 * whatever the app theme: the `.dark` island re-resolves every token.
 * Dedicated streamlined layouts for PC (Mac) and iPhone across Quai 3D, Auto, and Mode Conduite.
 */
export interface CabHudProps {
  ligne: LineRef;
  routes: { value: string; label: string }[];
  route: string;
  onRoute: (value: string) => void;
  /** Name on the plate: the station you are at, or the next one */
  station: string;
  stations?: string[];
  onSelectStation?: (stationName: string) => void;
  aQuai: boolean;
  prochaine: string;
  direction: string;
  /** "En tunnel", "Station souterraine", "Sur le viaduc, plein air" */
  voie: string;
  vitesse: number;
  /** Effort lissé de -1 (freinage) à +1 (traction) */
  effort?: number;
  arrets?: string[];
  index?: number;
  progression?: number;
  vue: 'quai' | 'cabine' | 'passager';
  onVue: (v: 'quai' | 'cabine' | 'passager') => void;
  materiel: string;
  allure: string;
  onAllure?: () => void;
  pause: boolean;
  onPause: () => void;
  son?: boolean;
  onSon?: () => void;
  direct: boolean;
  onDirect: () => void;
  onQuitter: () => void;
  /** Point de vue contextuel (ligne 6 vers Bir-Hakeim : la tour Eiffel). Absent hors tronçon. */
  pointDeVue?: { label: string; onClick: () => void } | null;

  /* --- Mode Quai 3D --- */
  quaiCamera?: QuaiCameraPreset;
  onQuaiCamera?: (preset: QuaiCameraPreset) => void;
  onInverserQuai?: () => void;
  sielBoards?: SielQuaiBoards | null;

  /* --- Mode Conduite --- */
  conduite?: boolean;
  onConduite?: () => void;
  cran?: number;
  cranLabel?: string;
  onCran?: (notch: number) => void;
  onCranDelta?: (delta: number) => void;
  onFreinUrgence?: () => void;
  limiteVitesse?: number;
  kvbEtat?: 'ok' | 'warn' | 'ebrake';
  distanceArretM?: number | null;
  signalAspect?: 'VL' | 'A' | 'S';
  tivKmh?: number | null;
  embarquementPct?: number | null;
  ronfleurActif?: boolean;
  portesOuvertes?: boolean;
  portesAutorisees?: boolean;
  onPortes?: () => void;
  tractionBloqueePortes?: boolean;
  phares?: boolean;
  onPhares?: () => void;
  ambiance?: 'day' | 'sunset' | 'night';
  onAmbiance?: (next: 'day' | 'sunset' | 'night') => void;
  pluie?: boolean;
  onPluie?: () => void;
  onInverserSens?: () => void;
  arretFeedback?: { label: string; detail: string; tone: 'ok' | 'good' | 'warn' } | null;

  className?: string;
}

export function CabHud(p: CabHudProps) {
  const { color } = resolveLine(p.ligne);
  const desktop = useIsDesktop();
  const reduceMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const cycleVue = () => {
    const order: Array<'cabine' | 'passager' | 'quai'> = ['cabine', 'passager', 'quai'];
    const next = order[(order.indexOf(p.vue) + 1) % order.length];
    p.onVue(next);
  };

  const vueShortLabel = p.vue === 'cabine' ? 'Cabine' : p.vue === 'passager' ? 'Passager' : 'Quai';
  const isQuaiMode = p.vue === 'quai' && !p.conduite;
  const isEmergency = (p.cran ?? 0) === -4;
  const mood: 'day' | 'sunset' | 'night' = p.ambiance ?? 'day';
  const nextMood: 'day' | 'sunset' | 'night' =
    mood === 'day' ? 'sunset' : mood === 'sunset' ? 'night' : 'day';
  const moodLabel = mood === 'day' ? 'Jour' : mood === 'sunset' ? 'Soir' : 'Nuit';
  const moodIcon =
    mood === 'night' ? (
      <RiMoonClearLine aria-hidden />
    ) : mood === 'sunset' ? (
      <RiSunFoggyLine aria-hidden />
    ) : (
      <RiSunLine aria-hidden />
    );

  const showDistBar =
    Boolean(p.conduite) &&
    p.distanceArretM !== undefined &&
    p.distanceArretM !== null &&
    p.distanceArretM < 260;

  const showBoardingBar =
    Boolean(p.conduite) &&
    (Boolean(p.ronfleurActif) ||
      (Boolean(p.portesOuvertes) && p.embarquementPct !== undefined && p.embarquementPct !== null));

  const boardingReady =
    Boolean(p.portesOuvertes) &&
    !p.ronfleurActif &&
    p.embarquementPct !== undefined &&
    p.embarquementPct !== null &&
    p.embarquementPct >= 100;

  const hasContextFeedback = Boolean(
    p.tractionBloqueePortes || p.arretFeedback || showBoardingBar || showDistBar
  );

  /* ---------- MOBILE (iPhone 390×844 — ergonomie pouce) ---------- */
  if (!desktop) {
    return (
      <div className={cx('dark pointer-events-none absolute inset-0 text-encre', p.className)}>
        {/* Zone haute mobile : Carte, Plaque station cliquable, Pastille ligne */}
        <div className="pointer-events-auto absolute inset-x-3 top-[max(10px,env(safe-area-inset-top))] flex items-center gap-2">
          <Button
            data-ride-exit
            size="sm"
            variant="secondaire"
            aria-label="Revenir à la carte"
            icon={<RiArrowLeftSLine aria-hidden />}
            onClick={p.onQuitter}
            className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Carte
          </Button>

          <div
            className={cx(
              'relative flex min-h-[44px] min-w-0 flex-1 items-center justify-center',
              p.stations &&
                p.stations.length > 1 &&
                p.onSelectStation &&
                'transition-transform duration-100 ease-signal active:scale-[0.97] motion-reduce:active:scale-100'
            )}
          >
            <Plaque
              as="p"
              size="sm"
              className="!inline-flex min-h-[44px] max-w-full items-center gap-1 whitespace-nowrap px-3 py-1.5 text-[15px] leading-[20px] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]"
            >
              <span className="truncate">{p.station}</span>
              {p.stations && p.stations.length > 1 && p.onSelectStation && (
                <RiArrowDownSLine aria-hidden className="size-4 shrink-0 opacity-80" />
              )}
            </Plaque>
            {p.stations && p.stations.length > 1 && p.onSelectStation && (
              <select
                aria-label="Choisir une station"
                value={p.station}
                onChange={(e) => p.onSelectStation?.(e.target.value)}
                className="absolute inset-0 h-full min-h-[44px] w-full cursor-pointer opacity-0"
              >
                {p.stations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>

          <label className="pl-hud relative flex h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center gap-1.5 !rounded-pill !px-2.5 !py-0 transition-transform duration-100 ease-signal active:scale-[0.97] motion-reduce:active:scale-100">
            <span className="sr-only">Ligne et parcours</span>
            <LineBadgeChip {...p.ligne} size="sm" />
            <RiArrowDownSLine aria-hidden className="size-4 text-icone-2" />
            <select
              data-ride-route
              value={p.route}
              onChange={(e) => p.onRoute(e.target.value)}
              className="absolute inset-0 h-full min-h-[44px] w-full cursor-pointer opacity-0"
            >
              {p.routes.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Bandeau télémétrie épuré en haut en Mode Conduite : champ 3D maximal au centre */}
        {p.conduite && (
          <div className="pointer-events-none absolute inset-x-3 top-[calc(max(10px,env(safe-area-inset-top))+52px)] flex flex-col gap-1.5">
            <Panneau matiere="verre" className="px-3 py-2">
              <div className="flex items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="signaletique truncate text-[16px] font-[650] leading-[20px] text-white">
                    {p.prochaine}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-encre-2">
                    → <span className="signaletique font-semibold text-encre">{p.direction}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SpeedLimitBadge etat={p.kvbEtat ?? 'ok'} limite={p.limiteVitesse ?? 70} />
                  <span className="afficheur chiffres flex h-10 shrink-0 items-baseline gap-1 px-2.5 pt-[7px] font-bold">
                    <NumberFlow
                      value={Math.round(p.vitesse)}
                      className="text-[22px] leading-none"
                    />
                    <span className="signaletique text-[10px] font-semibold">km/h</span>
                  </span>
                </div>
              </div>

              {showBoardingBar ? (
                <BoardingBar
                  pct={p.embarquementPct ?? 0}
                  ronfleur={Boolean(p.ronfleurActif)}
                  compact
                  className="mt-1.5"
                />
              ) : (
                showDistBar && (
                  <StopDistanceBar distanceM={p.distanceArretM ?? 0} className="mt-1.5" />
                )
              )}
            </Panneau>

            {(p.tractionBloqueePortes || p.arretFeedback) && (
              <StatusPill
                tone={p.tractionBloqueePortes ? 'warn' : (p.arretFeedback?.tone ?? 'ok')}
                label={
                  p.tractionBloqueePortes
                    ? 'Fermez les portes avant de tracter'
                    : p.arretFeedback!.label
                }
                detail={p.tractionBloqueePortes ? undefined : p.arretFeedback?.detail}
              />
            )}
          </div>
        )}

        {/* Popover d'options secondaires mobile (Vues, Phares, Vitesse/Direct en Auto) */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              key="mobile-cab-options"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
              className="pointer-events-auto absolute inset-x-3 bottom-[calc(max(10px,env(safe-area-inset-bottom))+134px)] z-20 origin-bottom-right"
            >
              <Panneau matiere="verre" className="p-3 shadow-[0_14px_34px_rgba(0,0,0,0.65)]">
                <div className="mb-2 flex items-center justify-between">
                  <p className="signaletique text-[13px] font-semibold text-white">
                    Options · {p.materiel}
                  </p>
                  <IconButton
                    size="sm"
                    variant="discret"
                    label="Fermer les options"
                    icon={<RiCloseLine aria-hidden />}
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-h-[44px] min-w-[44px] active:scale-[0.97] motion-reduce:active:scale-100"
                  />
                </div>
                <div className="mb-2.5">
                  <Segmented
                    size="sm"
                    label="Point de vue caméra"
                    value={p.vue}
                    onChange={(v) => {
                      p.onVue(v);
                      setMobileMenuOpen(false);
                    }}
                    options={[
                      { value: 'cabine', label: 'Cabine' },
                      { value: 'passager', label: 'Passager' },
                      { value: 'quai', label: 'Quai' },
                    ]}
                    className="w-full"
                  />
                </div>
                {p.onAmbiance && (
                  <div className="mb-2.5">
                    <Segmented
                      size="sm"
                      label="Moment de la journée"
                      value={mood}
                      onChange={(m) => p.onAmbiance?.(m)}
                      options={[
                        { value: 'day', label: 'Jour' },
                        { value: 'sunset', label: 'Soir' },
                        { value: 'night', label: 'Nuit' },
                      ]}
                      className="w-full"
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {p.onPhares && (
                    <Button
                      variant="secondaire"
                      size="sm"
                      pressed={Boolean(p.phares)}
                      lampe
                      icon={
                        p.phares ? (
                          <RiLightbulbFlashLine aria-hidden />
                        ) : (
                          <RiLightbulbLine aria-hidden />
                        )
                      }
                      onClick={p.onPhares}
                      className="min-h-[44px] flex-1 active:scale-[0.97] motion-reduce:active:scale-100"
                    >
                      Phares
                    </Button>
                  )}
                  {p.onPluie && (
                    <Button
                      data-ride-rain
                      variant="secondaire"
                      size="sm"
                      pressed={Boolean(p.pluie)}
                      lampe
                      icon={<RiRainyLine aria-hidden />}
                      onClick={p.onPluie}
                      className="min-h-[44px] flex-1 active:scale-[0.97] motion-reduce:active:scale-100"
                    >
                      Pluie
                    </Button>
                  )}
                  {p.conduite && p.onInverserSens && (
                    <Button
                      data-ride-reverse
                      variant="secondaire"
                      size="sm"
                      icon={<RiArrowLeftRightLine aria-hidden />}
                      onClick={() => {
                        p.onInverserSens?.();
                        setMobileMenuOpen(false);
                      }}
                      className="min-h-[44px] w-full active:scale-[0.97] motion-reduce:active:scale-100"
                    >
                      Inverser le sens
                    </Button>
                  )}
                  {!p.conduite && p.onAllure && (
                    <Button
                      data-ride-speed
                      variant="secondaire"
                      size="sm"
                      aria-label={`Vitesse de simulation : ${p.allure}`}
                      icon={<RiRefreshLine aria-hidden />}
                      onClick={p.onAllure}
                      className="chiffres min-h-[44px] active:scale-[0.97] motion-reduce:active:scale-100"
                    >
                      {p.allure}
                    </Button>
                  )}
                  {!p.conduite && (
                    <div className="flex min-h-[44px] items-center">
                      <InterrupteurDirect
                        data-ride-live
                        direct={p.direct}
                        onChange={() => p.onDirect()}
                        source="PRIM"
                      />
                    </div>
                  )}
                </div>
              </Panneau>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Zone basse mobile : Pupitre Conduite OU Mode Quai 3D OU HUD Auto */}
        <div className="pointer-events-none absolute inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] flex flex-col gap-2">
          {p.pointDeVue && (
            <div className="flex justify-start">
              <Button
                data-ride-eiffel
                variant="secondaire"
                size="sm"
                icon={<RiEyeLine aria-hidden />}
                onClick={p.pointDeVue.onClick}
                className="pointer-events-auto min-h-[44px] active:scale-[0.97] motion-reduce:active:scale-100"
              >
                {p.pointDeVue.label}
              </Button>
            </div>
          )}

          {p.conduite ? (
            <Panneau matiere="verre" className="pointer-events-auto overflow-hidden p-2.5">
              {/* Rangée 1 : Manipulateur 7 crans + FU dédié */}
              <div className="flex items-center gap-1.5">
                <IconButton
                  data-ride-brake
                  variant="secondaire"
                  size="sm"
                  label="Réduire l’allure / freiner"
                  icon={<RiSubtractLine aria-hidden />}
                  onClick={() => p.onCranDelta?.(-1)}
                  className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                />
                <ManipulateurRail
                  value={p.cran ?? 0}
                  onChange={(n) => p.onCran?.(n)}
                  className="min-w-0 flex-1"
                />
                <IconButton
                  data-ride-throttle-up
                  variant="secondaire"
                  size="sm"
                  label="Augmenter la traction"
                  icon={<RiAddLine aria-hidden />}
                  onClick={() => p.onCranDelta?.(1)}
                  className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                />
                <Button
                  data-ride-ebrake
                  variant="alerte"
                  size="sm"
                  pressed={isEmergency}
                  aria-label="FU : Frein d’urgence"
                  onClick={p.onFreinUrgence}
                  className={cx(
                    'chiffres min-h-[44px] min-w-[44px] shrink-0 px-2 font-bold active:scale-[0.97] motion-reduce:active:scale-100',
                    isEmergency && 'ring-2 ring-signal-300'
                  )}
                >
                  FU
                </Button>
              </div>

              {/* Rangée 2 : 5 contrôles essentiels à portée de pouce (>= 44×44 px) */}
              <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-joint pt-2">
                <Button
                  data-ride-doors
                  variant={p.ronfleurActif ? 'alerte' : boardingReady ? 'primaire' : 'secondaire'}
                  size="sm"
                  pressed={Boolean(p.portesOuvertes)}
                  aria-label={
                    p.ronfleurActif
                      ? 'Fermeture des portes en cours'
                      : p.portesOuvertes
                        ? 'Portes : fermer'
                        : 'Portes : ouvrir'
                  }
                  icon={
                    p.portesOuvertes ? (
                      <RiDoorOpenLine aria-hidden />
                    ) : (
                      <RiDoorClosedLine aria-hidden />
                    )
                  }
                  onClick={p.onPortes}
                  className="min-h-[44px] min-w-0 flex-1 px-2 active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  {p.ronfleurActif ? 'Ronfleur' : 'Portes'}
                </Button>
                <IconButton
                  data-ride-view
                  variant="secondaire"
                  size="sm"
                  label={`Vue actuelle : ${vueShortLabel}. Changer de point de vue`}
                  icon={<RiCameraLine aria-hidden />}
                  onClick={cycleVue}
                  className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                />
                {p.onSon && (
                  <IconButton
                    data-ride-audio
                    variant="secondaire"
                    size="sm"
                    pressed={Boolean(p.son)}
                    label={p.son ? 'Couper le son' : 'Activer le son moteur'}
                    icon={p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
                    onClick={p.onSon}
                    className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                  />
                )}
                <Button
                  data-ride-drive-mode
                  variant="primaire"
                  size="sm"
                  pressed
                  aria-label="Auto : revenir en pilotage automatique"
                  icon={<RiSteering2Line aria-hidden />}
                  onClick={p.onConduite}
                  className="min-h-[44px] min-w-[44px] shrink-0 px-2.5 active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  Auto
                </Button>
                <IconButton
                  variant="secondaire"
                  size="sm"
                  expanded={mobileMenuOpen}
                  label="Plus d'options de cabine"
                  icon={<RiMore2Fill aria-hidden />}
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                />
              </div>
            </Panneau>
          ) : isQuaiMode ? (
            /* Mobile Quai 3D : vue dégagée + mini SIEL + 4 caméras de quai + Conduire */
            <Panneau matiere="verre" className="pointer-events-auto p-2.5">
              <SielQuaiBoard
                boards={p.sielBoards ?? null}
                prochaine={p.prochaine}
                direction={p.direction}
                aQuai={p.aQuai}
                voie={p.voie}
                vitesse={p.vitesse}
                compact
              />

              {p.onQuaiCamera && (
                <div
                  role="group"
                  aria-label="Caméras de quai"
                  className="mt-2 grid grid-cols-4 gap-1.5"
                >
                  {QUAI_CAMERA_PRESETS.map((preset) => {
                    const active = (p.quaiCamera ?? 'mid') === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => p.onQuaiCamera?.(preset.id)}
                        className={cx(
                          'flex min-h-[44px] items-center justify-center rounded-controle border px-1.5 text-[12px] font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-signal outline-none focus-visible:outline-2 focus-visible:outline-focus active:scale-[0.97] motion-reduce:active:scale-100',
                          active
                            ? 'border-normal-500 bg-normal-300 text-[#08140d] shadow-sm'
                            : 'border-joint bg-encart text-encre hover:bg-encart-survol'
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-joint pt-2">
                {p.onConduite && (
                  <Button
                    data-ride-drive-mode
                    variant="primaire"
                    size="sm"
                    icon={<RiSteering2Line aria-hidden />}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      p.onConduite?.();
                    }}
                    className="min-h-[44px] flex-1 active:scale-[0.97] motion-reduce:active:scale-100"
                  >
                    Conduire
                  </Button>
                )}
                {p.onInverserQuai && (
                  <Button
                    variant="secondaire"
                    size="sm"
                    icon={<RiArrowLeftRightLine aria-hidden />}
                    onClick={p.onInverserQuai}
                    className="min-h-[44px] shrink-0 px-2.5 active:scale-[0.97] motion-reduce:active:scale-100"
                  >
                    Quai
                  </Button>
                )}
                {p.onSon && (
                  <IconButton
                    data-ride-audio
                    variant="secondaire"
                    size="sm"
                    pressed={Boolean(p.son)}
                    label={p.son ? 'Couper le son' : 'Activer le son moteur'}
                    icon={p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
                    onClick={p.onSon}
                    className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                  />
                )}
                <IconButton
                  variant="secondaire"
                  size="sm"
                  expanded={mobileMenuOpen}
                  label="Options (vue, phares, direct)"
                  icon={<RiMore2Fill aria-hidden />}
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                />
              </div>
            </Panneau>
          ) : (
            /* Mobile Auto (Cabine / Passager) */
            <Panneau matiere="verre" className="pointer-events-auto p-3">
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-encre-2">
                    {p.aQuai ? 'À quai' : p.voie}
                  </p>
                  <p className="signaletique truncate text-[19px] font-[650] leading-[23px] text-white">
                    {p.prochaine}
                  </p>
                  <p className="truncate text-[12px] text-encre-2">
                    → <span className="signaletique font-semibold text-encre">{p.direction}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="afficheur chiffres flex h-10 shrink-0 items-baseline gap-1 px-2.5 pt-[7px] font-bold">
                    <NumberFlow
                      value={Math.round(p.vitesse)}
                      className="text-[22px] leading-none"
                    />
                    <span className="signaletique text-[10px] font-semibold">km/h</span>
                  </span>
                  <EffortBar effort={p.effort ?? 0} />
                </div>
              </div>

              {p.arrets && p.arrets.length > 1 && (
                <PlanDeLigneHorizontal
                  couleur={color}
                  arrets={p.arrets}
                  index={p.index ?? 0}
                  progression={p.progression}
                  maxVisible={3}
                  compact
                  className="mt-2.5"
                />
              )}

              <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-joint pt-2.5">
                {p.onConduite && (
                  <Button
                    data-ride-drive-mode
                    variant="primaire"
                    size="sm"
                    icon={<RiSteering2Line aria-hidden />}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      p.onConduite?.();
                    }}
                    className="min-h-[44px] flex-1 active:scale-[0.97] motion-reduce:active:scale-100"
                  >
                    Conduire
                  </Button>
                )}
                <Button
                  data-ride-view
                  variant="secondaire"
                  size="sm"
                  aria-label={`Vue actuelle : ${vueShortLabel}. Changer`}
                  icon={<RiCameraLine aria-hidden />}
                  onClick={cycleVue}
                  className="min-h-[44px] min-w-[44px] px-2.5 active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  {vueShortLabel}
                </Button>
                {p.onSon && (
                  <IconButton
                    data-ride-audio
                    variant="secondaire"
                    size="sm"
                    label={p.son ? 'Couper le son' : 'Activer le son moteur'}
                    icon={p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
                    onClick={p.onSon}
                    className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                  />
                )}
                <IconButton
                  data-ride-pause
                  variant="secondaire"
                  size="sm"
                  label={p.pause ? 'Reprendre' : 'Mettre en pause'}
                  icon={p.pause ? <RiPlayLine aria-hidden /> : <RiPauseLine aria-hidden />}
                  onClick={p.onPause}
                  className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                />
                <IconButton
                  variant="secondaire"
                  size="sm"
                  expanded={mobileMenuOpen}
                  label="Options (vitesse, phares, direct)"
                  icon={<RiMore2Fill aria-hidden />}
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                />
              </div>
            </Panneau>
          )}
        </div>
      </div>
    );
  }

  /* ---------- DESKTOP HUD (Mac) ---------- */
  return (
    <div className={cx('dark pointer-events-none absolute inset-0 text-encre', p.className)}>
      {/* Top-left: Station Plate + Conduire toggle */}
      <div className="pointer-events-none absolute left-4 top-4 flex max-w-[52%] flex-wrap items-center gap-2.5">
        <div className="relative inline-flex max-w-full items-center">
          <Plaque
            as="p"
            size="lg"
            className="pointer-events-auto !inline-flex items-center gap-1.5 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]"
          >
            <span className="truncate">{p.station}</span>
            {p.stations && p.stations.length > 1 && p.onSelectStation && (
              <RiArrowDownSLine aria-hidden className="size-4 shrink-0 opacity-75" />
            )}
          </Plaque>
          {p.stations && p.stations.length > 1 && p.onSelectStation && (
            <select
              aria-label="Choisir une station"
              value={p.station}
              onChange={(e) => p.onSelectStation?.(e.target.value)}
              className="pointer-events-auto absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {p.stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        {p.onConduite && (
          <Button
            data-ride-drive-mode
            variant={p.conduite ? 'primaire' : 'secondaire'}
            size="sm"
            lampe
            pressed={Boolean(p.conduite)}
            icon={<RiSteering2Line aria-hidden />}
            iconEnd={<Kbd className="ml-0.5">M</Kbd>}
            onClick={p.onConduite}
            className="pointer-events-auto h-10 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            {p.conduite ? 'Mode Conduite' : 'Conduire'}
          </Button>
        )}
      </div>

      {/* Top-right: Line Selector + Carte [Esc] */}
      <Panneau
        matiere="verre"
        className="absolute right-4 top-4 flex h-14 items-center gap-2 pl-3 pr-2"
      >
        <LineBadgeChip {...p.ligne} size="sm" />
        <label className="relative flex items-center">
          <span className="sr-only">Ligne et parcours</span>
          <select
            data-ride-route
            value={p.route}
            onChange={(e) => p.onRoute(e.target.value)}
            className="h-10 max-w-[340px] cursor-pointer appearance-none truncate rounded-controle bg-transparent pl-2 pr-8 text-[14px] font-semibold text-encre outline-none hover:bg-encart focus-visible:outline-2 focus-visible:outline-focus"
          >
            {p.routes.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <RiArrowDownSLine
            aria-hidden
            className="pointer-events-none absolute right-2 size-4 text-icone-2"
          />
        </label>
        <span aria-hidden className="h-6 w-px bg-joint" />
        <Button
          data-ride-exit
          variant="discret"
          icon={<RiLogoutBoxRLine aria-hidden />}
          iconEnd={<Kbd className="ml-0.5">Esc</Kbd>}
          onClick={p.onQuitter}
          className="active:scale-[0.97] motion-reduce:active:scale-100"
        >
          Carte
        </Button>
      </Panneau>

      {/* Bottom Desktop Area */}
      {p.conduite ? (
        /* ---------- DESKTOP CONDUITE: Compact 2-column RATP Pupitre ---------- */
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-col items-center gap-2">
          {p.pointDeVue && (
            <div className="flex w-full max-w-[920px] justify-start">
              <Button
                data-ride-eiffel
                variant="secondaire"
                size="sm"
                icon={<RiEyeLine aria-hidden />}
                onClick={p.pointDeVue.onClick}
                className="pointer-events-auto active:scale-[0.97] motion-reduce:active:scale-100"
              >
                {p.pointDeVue.label}
              </Button>
            </div>
          )}

          <Panneau matiere="verre" className="pointer-events-auto w-full max-w-[920px] p-3.5">
            <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[332px_1fr]">
              {/* Col 1 — Station, Vitesse & Plan de ligne épuré */}
              <div className="flex min-w-0 flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="signaletique truncate text-[22px] font-[650] leading-[26px] text-white">
                      {p.prochaine}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-encre-2">
                      → <span className="signaletique font-semibold text-encre">{p.direction}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="afficheur chiffres flex h-11 shrink-0 items-baseline gap-1 px-3 pt-[8px] font-bold">
                      <NumberFlow
                        value={Math.round(p.vitesse)}
                        className="text-[28px] leading-none"
                      />
                      <span className="signaletique text-[11px] font-semibold">km/h</span>
                    </span>
                    <SpeedLimitBadge etat={p.kvbEtat ?? 'ok'} limite={p.limiteVitesse ?? 70} />
                  </div>
                </div>

                {p.arrets && p.arrets.length > 1 && (
                  <PlanDeLigneHorizontal
                    couleur={color}
                    arrets={p.arrets}
                    index={p.index ?? 0}
                    progression={p.progression}
                    maxVisible={3}
                    compact
                    onSelectStop={p.onSelectStation}
                  />
                )}
              </div>

              {/* Col 2 — Manipulateur 7 crans + FU + Commandes essentielles */}
              <div className="flex min-w-0 flex-col justify-between gap-2.5 border-t border-joint pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                {hasContextFeedback && (
                  <div className="flex flex-col gap-1.5">
                    {showBoardingBar ? (
                      <BoardingBar
                        pct={p.embarquementPct ?? 0}
                        ronfleur={Boolean(p.ronfleurActif)}
                      />
                    ) : (
                      showDistBar && <StopDistanceBar distanceM={p.distanceArretM ?? 0} />
                    )}

                    {(p.tractionBloqueePortes || p.arretFeedback) && (
                      <StatusPill
                        tone={p.tractionBloqueePortes ? 'warn' : (p.arretFeedback?.tone ?? 'ok')}
                        label={
                          p.tractionBloqueePortes
                            ? 'Fermez les portes [P] avant de tracter'
                            : p.arretFeedback!.label
                        }
                        detail={p.tractionBloqueePortes ? undefined : p.arretFeedback?.detail}
                      />
                    )}
                  </div>
                )}

                {/* Rangée 1 : Manipulateur 7 crans + FU unique */}
                <div className="flex items-center gap-2">
                  <IconButton
                    data-ride-brake
                    variant="secondaire"
                    size="sm"
                    label="Freiner / réduire le cran (S)"
                    icon={<RiSubtractLine aria-hidden />}
                    onClick={() => p.onCranDelta?.(-1)}
                    className="active:scale-[0.97] motion-reduce:active:scale-100"
                  />
                  <ManipulateurRail
                    value={p.cran ?? 0}
                    onChange={(n) => p.onCran?.(n)}
                    className="min-w-0 flex-1"
                  />
                  <IconButton
                    data-ride-throttle-up
                    variant="secondaire"
                    size="sm"
                    label="Tracter / augmenter le cran (Z)"
                    icon={<RiAddLine aria-hidden />}
                    onClick={() => p.onCranDelta?.(1)}
                    className="active:scale-[0.97] motion-reduce:active:scale-100"
                  />
                  <Button
                    data-ride-ebrake
                    variant="alerte"
                    size="sm"
                    pressed={isEmergency}
                    aria-label="FU : Frein d’urgence (Espace)"
                    onClick={p.onFreinUrgence}
                    className={cx(
                      'chiffres shrink-0 px-3 font-bold active:scale-[0.97] motion-reduce:active:scale-100',
                      isEmergency && 'ring-2 ring-signal-300'
                    )}
                  >
                    FU
                  </Button>
                </div>

                {/* Rangée 2 : Actions rame à gauche, Vues complètes à droite */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-joint pt-2.5">
                  <div className="flex items-center gap-1.5">
                    <Button
                      data-ride-doors
                      variant={
                        p.ronfleurActif ? 'alerte' : boardingReady ? 'primaire' : 'secondaire'
                      }
                      size="sm"
                      lampe
                      pressed={Boolean(p.portesOuvertes)}
                      icon={
                        p.portesOuvertes ? (
                          <RiDoorOpenLine aria-hidden />
                        ) : (
                          <RiDoorClosedLine aria-hidden />
                        )
                      }
                      iconEnd={<Kbd className="ml-0.5">P</Kbd>}
                      onClick={p.onPortes}
                      className="active:scale-[0.97] motion-reduce:active:scale-100"
                    >
                      {p.ronfleurActif ? 'Ronfleur…' : 'Portes'}
                    </Button>
                    {p.onPhares && (
                      <IconButton
                        variant="secondaire"
                        size="sm"
                        pressed={Boolean(p.phares)}
                        label={p.phares ? 'Feux de route (L)' : 'Feux de croisement (L)'}
                        icon={
                          p.phares ? (
                            <RiLightbulbFlashLine aria-hidden />
                          ) : (
                            <RiLightbulbLine aria-hidden />
                          )
                        }
                        onClick={p.onPhares}
                        className="active:scale-[0.97] motion-reduce:active:scale-100"
                      />
                    )}
                    {p.onInverserSens && (
                      <IconButton
                        data-ride-reverse
                        variant="secondaire"
                        size="sm"
                        label="Inverser le sens de marche (R)"
                        icon={<RiArrowLeftRightLine aria-hidden />}
                        onClick={p.onInverserSens}
                        className="active:scale-[0.97] motion-reduce:active:scale-100"
                      />
                    )}
                    {p.onAmbiance && (
                      <IconButton
                        data-ride-ambiance
                        variant="secondaire"
                        size="sm"
                        pressed={mood !== 'day'}
                        label={`Ambiance ${moodLabel} — changer de lumière`}
                        icon={moodIcon}
                        onClick={() => p.onAmbiance?.(nextMood)}
                        className="active:scale-[0.97] motion-reduce:active:scale-100"
                      />
                    )}
                    {p.onPluie && (
                      <IconButton
                        data-ride-rain
                        variant="secondaire"
                        size="sm"
                        pressed={Boolean(p.pluie)}
                        label={p.pluie ? 'Arrêter la pluie' : 'Activer pluie & essuie-glace'}
                        icon={<RiRainyLine aria-hidden />}
                        onClick={p.onPluie}
                        className="active:scale-[0.97] motion-reduce:active:scale-100"
                      />
                    )}
                    {p.onSon && (
                      <IconButton
                        data-ride-audio
                        variant="secondaire"
                        size="sm"
                        pressed={Boolean(p.son)}
                        label={p.son ? 'Couper le son' : 'Activer le son moteur'}
                        icon={
                          p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />
                        }
                        onClick={p.onSon}
                        className="active:scale-[0.97] motion-reduce:active:scale-100"
                      />
                    )}
                  </div>

                  <div data-ride-view>
                    <Segmented
                      size="sm"
                      label="Point de vue"
                      value={p.vue}
                      onChange={p.onVue}
                      options={[
                        { value: 'quai', label: 'Quai' },
                        { value: 'cabine', label: 'Cabine' },
                        { value: 'passager', label: 'Passager' },
                      ]}
                      className="w-[252px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Panneau>
        </div>
      ) : isQuaiMode ? (
        /* ---------- DESKTOP QUAI 3D: Unobstructed vault + SIEL + 4 Camera Presets ---------- */
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
          <Panneau matiere="verre" className="pointer-events-auto w-[372px] max-w-full p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="pl-lampe is-on !h-[7.5px] !w-[7.5px] shrink-0" />
                <p className="signaletique truncate text-[14px] font-[650] text-white">
                  SIEL · Quai en direct
                </p>
              </div>
              <span className="truncate text-[11.5px] font-medium text-encre-2">{p.materiel}</span>
            </div>

            <SielQuaiBoard
              boards={p.sielBoards ?? null}
              prochaine={p.prochaine}
              direction={p.direction}
              aQuai={p.aQuai}
              voie={p.voie}
              vitesse={p.vitesse}
            />

            <div className="mt-2.5 flex items-center justify-between gap-2 text-[12px] text-encre-2">
              {p.pointDeVue ? (
                <Button
                  data-ride-eiffel
                  variant="secondaire"
                  size="sm"
                  icon={<RiEyeLine aria-hidden />}
                  onClick={p.pointDeVue.onClick}
                  className="active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  {p.pointDeVue.label}
                </Button>
              ) : (
                <span className="truncate text-[11.5px] text-encre-2">
                  {p.aQuai ? 'Rame à quai' : p.voie}
                </span>
              )}
              <InterrupteurDirect
                data-ride-live
                direct={p.direct}
                onChange={() => p.onDirect()}
                source="PRIM"
                className="pointer-events-auto"
              />
            </div>
          </Panneau>

          <Panneau
            matiere="verre"
            className="pointer-events-auto flex flex-wrap items-center gap-1.5 px-2.5 py-2"
          >
            {p.onQuaiCamera && (
              <>
                <div role="group" aria-label="Caméras de quai" className="flex items-center gap-1">
                  {QUAI_CAMERA_PRESETS.map((preset) => {
                    const active = (p.quaiCamera ?? 'mid') === preset.id;
                    return (
                      <Button
                        key={preset.id}
                        variant={active ? 'primaire' : 'discret'}
                        size="sm"
                        pressed={active}
                        onClick={() => p.onQuaiCamera?.(preset.id)}
                        className="active:scale-[0.97] motion-reduce:active:scale-100"
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>
                <span aria-hidden className="mx-0.5 h-6 w-px bg-joint" />
              </>
            )}

            {p.onInverserQuai && (
              <Button
                variant="secondaire"
                size="sm"
                icon={<RiArrowLeftRightLine aria-hidden />}
                onClick={p.onInverserQuai}
                className="active:scale-[0.97] motion-reduce:active:scale-100"
              >
                Autre quai
              </Button>
            )}

            <div data-ride-view>
              <Segmented
                size="sm"
                label="Point de vue"
                value={p.vue}
                onChange={p.onVue}
                options={[
                  { value: 'quai', label: 'Quai' },
                  { value: 'cabine', label: 'Cabine' },
                  { value: 'passager', label: 'Passager' },
                ]}
                className="w-[252px]"
              />
            </div>
            <span aria-hidden className="mx-0.5 h-6 w-px bg-joint" />
            {p.onAmbiance && (
              <IconButton
                data-ride-ambiance
                variant="secondaire"
                size="sm"
                pressed={mood !== 'day'}
                label={`Ambiance ${moodLabel} — changer de lumière`}
                icon={moodIcon}
                onClick={() => p.onAmbiance?.(nextMood)}
                className="active:scale-[0.97] motion-reduce:active:scale-100"
              />
            )}
            {p.onPluie && (
              <IconButton
                data-ride-rain
                variant="secondaire"
                size="sm"
                pressed={Boolean(p.pluie)}
                label={p.pluie ? 'Arrêter la pluie' : 'Activer pluie & essuie-glace'}
                icon={<RiRainyLine aria-hidden />}
                onClick={p.onPluie}
                className="active:scale-[0.97] motion-reduce:active:scale-100"
              />
            )}
            {p.onSon && (
              <IconButton
                data-ride-audio
                variant="secondaire"
                size="sm"
                label={p.son ? 'Couper le son' : 'Activer le son moteur'}
                icon={p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
                onClick={p.onSon}
                className="active:scale-[0.97] motion-reduce:active:scale-100"
              />
            )}
            <IconButton
              data-ride-pause
              variant="secondaire"
              size="sm"
              label={p.pause ? 'Reprendre' : 'Mettre en pause'}
              icon={p.pause ? <RiPlayLine aria-hidden /> : <RiPauseLine aria-hidden />}
              onClick={p.onPause}
              className="active:scale-[0.97] motion-reduce:active:scale-100"
            />
          </Panneau>
        </div>
      ) : (
        /* ---------- DESKTOP AUTO RIDE (Cabine / Passager) ---------- */
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
          <Panneau matiere="verre" className="pointer-events-auto w-[372px] max-w-full p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-encre-2">
                  {p.aQuai ? 'À quai' : p.voie}
                </p>
                <p className="signaletique mt-0.5 truncate text-[22px] font-[650] leading-[26px] text-white">
                  {p.prochaine}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-encre-2">
                  → <span className="signaletique font-semibold text-encre">{p.direction}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="afficheur chiffres flex h-11 shrink-0 items-baseline gap-1 px-2.5 pt-[9px] font-bold">
                  <NumberFlow value={Math.round(p.vitesse)} className="text-[26px] leading-none" />
                  <span className="signaletique text-[11px] font-semibold">km/h</span>
                </span>
                <EffortBar effort={p.effort ?? 0} />
              </div>
            </div>

            {p.arrets && p.arrets.length > 1 && (
              <PlanDeLigneHorizontal
                couleur={color}
                arrets={p.arrets}
                index={p.index ?? 0}
                progression={p.progression}
                maxVisible={3}
                compact
                onSelectStop={p.onSelectStation}
                className="mt-3.5"
              />
            )}

            <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-encre-2">
              {p.pointDeVue ? (
                <Button
                  data-ride-eiffel
                  variant="secondaire"
                  size="sm"
                  icon={<RiEyeLine aria-hidden />}
                  onClick={p.pointDeVue.onClick}
                  className="active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  {p.pointDeVue.label}
                </Button>
              ) : (
                <span className="min-w-0 truncate">{p.materiel}</span>
              )}
              <InterrupteurDirect
                data-ride-live
                direct={p.direct}
                onChange={() => p.onDirect()}
                source="PRIM"
                className="pointer-events-auto"
              />
            </div>
          </Panneau>

          <Panneau
            matiere="verre"
            className="pointer-events-auto flex h-14 shrink-0 items-center gap-1.5 px-2"
          >
            <div data-ride-view>
              <Segmented
                size="sm"
                label="Point de vue"
                value={p.vue}
                onChange={p.onVue}
                options={[
                  { value: 'quai', label: 'Quai' },
                  { value: 'cabine', label: 'Cabine' },
                  { value: 'passager', label: 'Passager' },
                ]}
                className="w-[252px]"
              />
            </div>
            <span aria-hidden className="mx-0.5 h-6 w-px bg-joint" />
            {p.onAllure && (
              <Button
                data-ride-speed
                variant="secondaire"
                size="sm"
                aria-label={`Vitesse de simulation : ${p.allure}`}
                iconEnd={<RiRefreshLine aria-hidden className="size-3.5 text-encre-2" />}
                onClick={p.onAllure}
                className="chiffres active:scale-[0.97] motion-reduce:active:scale-100"
              >
                {p.allure}
              </Button>
            )}
            {p.onAmbiance && (
              <IconButton
                data-ride-ambiance
                variant="secondaire"
                size="sm"
                pressed={mood !== 'day'}
                label={`Ambiance ${moodLabel} — changer de lumière`}
                icon={moodIcon}
                onClick={() => p.onAmbiance?.(nextMood)}
                className="active:scale-[0.97] motion-reduce:active:scale-100"
              />
            )}
            {p.onPluie && (
              <IconButton
                data-ride-rain
                variant="secondaire"
                size="sm"
                pressed={Boolean(p.pluie)}
                label={p.pluie ? 'Arrêter la pluie' : 'Activer pluie & essuie-glace'}
                icon={<RiRainyLine aria-hidden />}
                onClick={p.onPluie}
                className="active:scale-[0.97] motion-reduce:active:scale-100"
              />
            )}
            {p.onSon && (
              <IconButton
                data-ride-audio
                variant="secondaire"
                size="sm"
                label={p.son ? 'Couper le son' : 'Activer le son moteur'}
                icon={p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
                onClick={p.onSon}
                className="active:scale-[0.97] motion-reduce:active:scale-100"
              />
            )}
            <IconButton
              data-ride-pause
              variant="secondaire"
              size="sm"
              label={p.pause ? 'Reprendre' : 'Mettre en pause'}
              icon={p.pause ? <RiPlayLine aria-hidden /> : <RiPauseLine aria-hidden />}
              onClick={p.onPause}
              className="active:scale-[0.97] motion-reduce:active:scale-100"
            />
          </Panneau>
        </div>
      )}
    </div>
  );
}

/** Authentic RATP SIEL dual-direction platform departure board. */
function SielQuaiBoard({
  boards,
  prochaine,
  direction,
  aQuai,
  voie,
  vitesse,
  compact = false,
}: {
  boards: SielQuaiBoards | null;
  prochaine: string;
  direction: string;
  aQuai: boolean;
  voie: string;
  vitesse: number;
  compact?: boolean;
}) {
  const formatEtaClass = (eta: string) => {
    const low = eta.toLowerCase();
    if (low.includes('quai')) return 'text-normal-300';
    return 'text-ambre-400';
  };

  if (boards) {
    if (compact) {
      const topRows = [boards.pos.rows[0], boards.neg.rows[0]].filter(
        (r): r is { dest: string; eta: string } => Boolean(r)
      );
      if (topRows.length > 0) {
        return (
          <div className="rounded-controle border border-white/12 bg-afficheur px-2.5 py-2">
            <div className="space-y-1">
              {topRows.map((row, idx) => (
                <div
                  key={`${row.dest}-${idx}`}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span className="signaletique min-w-0 truncate font-semibold text-white">
                    → {row.dest}
                  </span>
                  <span
                    className={cx(
                      'chiffres shrink-0 text-[12px] font-bold leading-none',
                      formatEtaClass(row.eta)
                    )}
                  >
                    {row.eta}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      }
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        {[boards.pos, boards.neg].map((board, bIdx) => (
          <div
            key={bIdx}
            className="min-w-0 rounded-controle border border-white/12 bg-afficheur px-2.5 py-2"
          >
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.04em] text-encre-2">
              {board.heading}
            </p>
            <div className="mt-1.5 space-y-1">
              {board.rows.slice(0, 2).map((row, rIdx) => (
                <div key={rIdx} className="flex items-baseline justify-between gap-1.5 text-[12px]">
                  <span className="signaletique min-w-0 truncate font-semibold text-white">
                    {row.dest}
                  </span>
                  <span
                    className={cx(
                      'chiffres shrink-0 font-bold leading-none',
                      formatEtaClass(row.eta)
                    )}
                  >
                    {row.eta}
                  </span>
                </div>
              ))}
              {board.rows.length === 0 && (
                <p className="chiffres text-[11px] text-encre-2">En approche…</p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2.5 rounded-controle border border-white/12 bg-afficheur px-3 py-2">
      <div className="min-w-0">
        <p className="signaletique truncate text-[14px] font-[650] text-white">→ {direction}</p>
        <p className="truncate text-[11.5px] text-encre-2">
          {prochaine} · {aQuai ? 'À quai' : voie}
        </p>
      </div>
      <span
        className={cx(
          'chiffres shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[12px] font-bold',
          aQuai ? 'text-normal-300' : 'text-ambre-400'
        )}
      >
        {aQuai ? 'À quai' : `${Math.round(vitesse)} km/h`}
      </span>
    </div>
  );
}

/** Door boarding & RATP ronfleur buzzer progress indicator. */
function BoardingBar({
  pct,
  ronfleur,
  compact = false,
  className,
}: {
  pct: number;
  ronfleur: boolean;
  compact?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const ready = !ronfleur && clamped >= 100;

  if (ronfleur) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'flex items-center justify-between gap-2 rounded-controle bg-ambre-400 px-2.5 py-1 text-[11.5px] font-bold text-[#12151b]',
          className
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-signal-700 motion-safe:animate-ping"
          />
          <span>{compact ? 'Ronfleur · fermeture…' : 'Ronfleur — fermeture portes…'}</span>
        </span>
        <span className="chiffres text-[10.5px] uppercase">Signal sonore</span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cx('flex items-center gap-2', className)}>
      <span
        className={cx(
          'chiffres shrink-0 text-[11px] font-semibold',
          ready ? 'text-normal-300' : 'text-encre'
        )}
      >
        {ready ? (
          compact ? (
            'Prêt · Fermer portes'
          ) : (
            'Prêt au départ · Fermer [P]'
          )
        ) : (
          <>
            Échange voyageurs <NumberFlow value={clamped} /> %
          </>
        )}
      </span>
      <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-white/14">
        <span
          className={cx(
            'block h-full w-full origin-left rounded-full transition-transform duration-150',
            ready ? 'bg-normal-300' : 'bg-ambre-400'
          )}
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
    </div>
  );
}

/** Tactile 7-notch RATP/SNCF Master Controller (F3..T3); dedicated FU button sits right of +. */
function ManipulateurRail({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (notch: number) => void;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const pickFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / Math.max(1, rect.width)));
    const idx = Math.floor(ratio * NOTCH_SEQUENCE.length);
    const chosen = NOTCH_SEQUENCE[idx];
    if (chosen) onChange(chosen.value);
  };

  const activeEntry = NOTCH_SEQUENCE.find((n) => n.value === value);

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Manipulateur de traction et freinage"
      aria-valuemin={-3}
      aria-valuemax={3}
      aria-valuenow={Math.max(-3, Math.min(3, value))}
      aria-valuetext={value === -4 ? 'FU' : (activeEntry?.label ?? '0')}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(Math.min(3, value + 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(Math.max(-3, value - 1));
        }
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pickFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1 && e.pressure === 0) return;
        e.stopPropagation();
        pickFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      className={cx(
        'relative grid h-[44px] touch-none select-none grid-cols-7 items-center rounded-full bg-encart/95 p-[3px] [box-shadow:inset_0_1px_2px_var(--pl-ombre),0_0_0_1px_var(--color-joint)] outline-none focus-visible:outline-2 focus-visible:outline-focus',
        className
      )}
    >
      {NOTCH_SEQUENCE.map((n) => {
        const active = n.value === value;
        const isBrake = n.value < 0;
        const isTrac = n.value > 0;
        const pillCls = active
          ? isBrake
            ? 'bg-ambre-400 text-[#12151b] shadow-sm'
            : isTrac
              ? 'bg-normal-300 text-[#08140d] shadow-sm'
              : 'bg-white text-[#12151b] shadow-sm'
          : 'text-encre-2';
        return (
          <span
            key={n.value}
            className={cx(
              'chiffres flex h-full items-center justify-center rounded-full text-[11.5px] font-bold tracking-tight transition-colors duration-150',
              pillCls
            )}
          >
            {n.label}
          </span>
        );
      })}
    </div>
  );
}

function SpeedLimitBadge({ etat, limite }: { etat: 'ok' | 'warn' | 'ebrake'; limite: number }) {
  const cls =
    etat === 'ebrake'
      ? 'bg-signal-700 text-white'
      : etat === 'warn'
        ? 'bg-ambre-400 text-[#12151b]'
        : 'bg-encart text-encre';
  const text = etat === 'ebrake' ? `FU KVB · ${limite}` : `Max ${limite}`;
  return (
    <span
      className={cx(
        'chiffres inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold leading-none',
        cls
      )}
    >
      {etat !== 'ok' && <RiAlarmWarningLine aria-hidden className="size-3.5 shrink-0" />}
      {text}
    </span>
  );
}

function StopDistanceBar({ distanceM, className }: { distanceM: number; className?: string }) {
  const clamped = Math.max(-20, Math.min(260, distanceM));
  const progress = Math.max(0, Math.min(1, 1 - Math.max(0, clamped) / 260));
  const inZone = Math.abs(distanceM) <= 6.5;
  const overshot = distanceM < -2.2;
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <span className="chiffres inline-flex shrink-0 items-baseline gap-1 text-[11px] font-semibold text-encre-2">
        <span>{distanceM >= 0 ? 'Repère' : 'Dépassé'}</span>
        <NumberFlow value={Math.abs(Math.round(distanceM))} />
        <span>m</span>
      </span>
      <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-white/14">
        <span
          className={cx(
            'block h-full w-full origin-left rounded-full transition-transform duration-150',
            overshot ? 'bg-signal-500' : inZone ? 'bg-normal-500' : 'bg-ambre-500'
          )}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}

function StatusPill({
  tone,
  label,
  detail,
  className,
}: {
  tone: 'ok' | 'good' | 'warn';
  label: string;
  detail?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const cls =
    tone === 'good'
      ? 'bg-normal-300 text-[#08140d]'
      : tone === 'warn'
        ? 'bg-signal-700 text-white'
        : 'bg-ambre-400 text-[#12151b]';
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
      className={cx(
        'flex items-center justify-between gap-2 rounded-controle px-3 py-1.5 text-[12px] font-semibold shadow-sm',
        cls,
        className
      )}
    >
      <span>{label}</span>
      {detail && <span className="chiffres text-[11px] opacity-90">{detail}</span>}
    </motion.div>
  );
}

function EffortBar({ effort }: { effort: number }) {
  const clamped = Math.max(-1, Math.min(1, effort));
  const braking = clamped < -0.06;
  const accelerating = clamped > 0.06;
  return (
    <div
      aria-hidden
      title={braking ? 'Freinage' : accelerating ? 'Traction' : 'Marche sur l’erre'}
      className="relative h-[4px] w-[72px] overflow-hidden rounded-full bg-white/12"
    >
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
      {braking && (
        <span
          className="absolute inset-y-0 right-1/2 w-1/2 origin-right rounded-l-full bg-signal-500 transition-transform duration-150"
          style={{ transform: `scaleX(${Math.abs(clamped)})` }}
        />
      )}
      {accelerating && (
        <span
          className="absolute inset-y-0 left-1/2 w-1/2 origin-left rounded-r-full bg-normal-500 transition-transform duration-150"
          style={{ transform: `scaleX(${Math.abs(clamped)})` }}
        />
      )}
    </div>
  );
}
