import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiPauseLine,
  RiPlayLine,
} from '@remixicon/react';
import {
  METRO_HISTORY_CHAPTERS,
  ROLLING_STOCK_CATALOG,
  type RollingStockCatalogItem,
} from '../data/paris_library';
import { GRAND_PARIS_EXPRESS_LINES } from '../data/grand_paris_express';
import { BottomSheet, type DetentSheet } from './BottomSheet';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { formatNombre } from './format';
import { LineBadgeChip } from './LineBadgeChip';
import { resolveLine } from './lines';
import { Panneau } from './Panneau';
import { Segmented } from './Segmented';
import { TrainSilhouette } from './TrainSilhouette';
import type { LibraryTab } from './ui_store';
import { useIsDesktop } from './useMediaQuery';

const LazyTrainShowroom3D = lazy(() =>
  import('./TrainShowroom3D').then((m) => ({ default: m.TrainShowroom3D }))
);

export interface LibraryDrawerProps {
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  onClose: () => void;
  onDriveTrain?: (stock: RollingStockCatalogItem) => void;
  onFocusMapCamera?: (opts: {
    center: [number, number];
    zoom: number;
    pitch?: number;
    bearing?: number;
    highlightLineId?: string | null;
  }) => void;
  gpeVisible?: boolean;
  onToggleGpe?: (visible?: boolean) => void;
  className?: string;
}

const EASE_PORTES = [0.22, 1, 0.36, 1] as const;

export function LibraryDrawer({
  tab,
  onTabChange,
  onClose,
  onDriveTrain,
  onFocusMapCamera,
  gpeVisible = false,
  onToggleGpe,
  className,
}: LibraryDrawerProps) {
  const desktop = useIsDesktop();
  const basse = !desktop;
  const [cran, setCran] = useState<DetentSheet>('haut');

  // Rames 3D accordion state (tous les tiroirs fermés à l'ouverture)
  const [expandedStockId, setExpandedStockId] = useState<string | null>(null);
  const [mounted3DId, setMounted3DId] = useState<string | null>(null);
  const [expandedGpeId, setExpandedGpeId] = useState<string | null>('gpe-15');
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!expandedStockId) {
      setMounted3DId(null);
      return;
    }
    setMounted3DId(null);
    const timer = window.setTimeout(() => {
      setMounted3DId(expandedStockId);
    }, 220);
    const scrollTimer = window.setTimeout(() => {
      cardRefs.current[expandedStockId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(scrollTimer);
    };
  }, [expandedStockId]);

  // Histoire state (no upcoming era spoiler pills)
  const [chapterIdx, setChapterIdx] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [storyPlaying, setStoryPlaying] = useState(false);
  const activeChapter = METRO_HISTORY_CHAPTERS[chapterIdx] ?? METRO_HISTORY_CHAPTERS[0];

  const onFocusMapCameraRef = useRef(onFocusMapCamera);
  onFocusMapCameraRef.current = onFocusMapCamera;

  useEffect(() => {
    if (tab !== 'histoire' || !onFocusMapCameraRef.current) return;
    onFocusMapCameraRef.current({
      ...activeChapter.camera,
      highlightLineId: activeChapter.highlightLineId,
    });
  }, [tab, activeChapter]);

  useEffect(() => {
    if (tab !== 'histoire' || !storyPlaying) return;
    const id = window.setInterval(() => {
      setDirection(1);
      setChapterIdx((prev) => {
        if (prev >= METRO_HISTORY_CHAPTERS.length - 1) {
          setStoryPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 5500);
    return () => window.clearInterval(id);
  }, [tab, storyPlaying]);

  const goToChapter = (nextIdx: number) => {
    setStoryPlaying(false);
    setDirection(nextIdx >= chapterIdx ? 1 : -1);
    setChapterIdx(nextIdx);
  };

  const pad = basse ? 'px-4' : 'px-5';

  const content = (
    <>
      <div
        className={cx('shrink-0 border-b border-joint', pad, basse ? 'pb-2.5 pt-0.5' : 'pb-3 pt-4')}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="library-titre" className="text-titre text-encre">
            Bibliothèque
          </h2>
          <IconButton
            size="sm"
            variant="secondaire"
            label="Fermer la bibliothèque"
            icon={<RiCloseLine aria-hidden />}
            onClick={onClose}
          />
        </div>
        <Segmented
          size="sm"
          label="Sections de la bibliothèque"
          value={tab}
          onChange={(t) => {
            setStoryPlaying(false);
            onTabChange(t);
          }}
          options={[
            { value: 'rames', label: 'Rames 3D' },
            { value: 'histoire', label: 'Histoire' },
            { value: 'gpe', label: 'Grand Paris' },
          ]}
          className={cx('w-full', basse ? 'mt-2' : 'mt-3')}
        />
      </div>

      <div
        className={cx(
          'pl-scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain',
          basse ? 'py-2.5' : 'py-3.5',
          pad
        )}
      >
        <AnimatePresence mode="wait">
          {tab === 'rames' ? (
            <motion.ul
              key="tab-rames"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE_PORTES }}
              className="space-y-2 pb-2"
            >
              {ROLLING_STOCK_CATALOG.map((item) => {
                const isOpen = expandedStockId === item.id;
                const primaryLine = resolveLine({ shortName: item.lines[0] ?? '1' });
                const lineColor = primaryLine.color;

                return (
                  <li
                    key={item.id}
                    ref={(el) => {
                      cardRefs.current[item.id] = el;
                    }}
                    className="list-none"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedStockId(isOpen ? null : item.id)}
                      className="pl-carte-trajet !flex min-h-[56px] items-center justify-between gap-2.5 !p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden className={cx('pl-lampe shrink-0', isOpen && 'is-on')} />
                        <div className="flex shrink-0 items-center gap-1">
                          {item.lines.slice(0, 2).map((ln) => (
                            <LineBadgeChip key={ln} shortName={ln} size="sm" />
                          ))}
                        </div>
                        <div className="min-w-0">
                          <p className="signaletique truncate text-[15px] font-bold leading-tight text-encre">
                            {item.name}
                          </p>
                          <p className="truncate text-[12px] text-encre-2">
                            {item.year} · {item.driveType === 'pneu' ? 'Pneu' : 'Fer'} ·{' '}
                            {item.maxSpeedKmh} km/h
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <TrainSilhouette stockId={item.id} lineColor={lineColor} />
                        <RiArrowDownSLine
                          aria-hidden
                          className={cx(
                            'size-5 shrink-0 text-encre-3 transition-transform duration-200',
                            isOpen && 'rotate-180 text-encre'
                          )}
                        />
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.22, ease: EASE_PORTES }}
                          className="overflow-hidden"
                        >
                          {/* Ligne animée de la couleur de la ligne reliant la pastille au cadre 3D */}
                          <div className="relative pl-6 pt-3 pb-2">
                            <motion.span
                              aria-hidden
                              initial={{ scaleY: 0 }}
                              animate={{ scaleY: 1 }}
                              exit={{ scaleY: 0 }}
                              transition={{ duration: 0.34, ease: EASE_PORTES }}
                              style={{ backgroundColor: lineColor, transformOrigin: 'top center' }}
                              className="absolute left-[19px] top-0 h-[34px] w-[4px] rounded-b-full"
                            />
                            <motion.span
                              aria-hidden
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              exit={{ scaleX: 0 }}
                              transition={{ duration: 0.24, delay: 0.14, ease: EASE_PORTES }}
                              style={{ backgroundColor: lineColor, transformOrigin: 'left center' }}
                              className="absolute left-[19px] top-[30px] h-[4px] w-[10px] rounded-r-full"
                            />
                            <motion.span
                              aria-hidden
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.2, delay: 0.2, ease: EASE_PORTES }}
                              style={{ borderColor: lineColor }}
                              className="absolute left-[14px] top-[25px] z-10 size-[14px] rounded-full border-[3px] bg-surface"
                            />

                            <div className="space-y-3">
                              {mounted3DId === item.id ? (
                                <Suspense
                                  fallback={
                                    <div
                                      className="flex h-[196px] w-full flex-col items-center justify-center gap-3 rounded-[14px] border bg-[#0f131a] md:h-[214px]"
                                      style={{ borderColor: `${lineColor}66` }}
                                    >
                                      <span className="text-[11px] font-medium text-white/70">
                                        Initialisation du showroom 3D…
                                      </span>
                                    </div>
                                  }
                                >
                                  <LazyTrainShowroom3D stock={item} accentColor={lineColor} />
                                </Suspense>
                              ) : (
                                <div
                                  className="dark relative flex h-[196px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border bg-[#0f131a] px-6 md:h-[214px]"
                                  style={{ borderColor: `${lineColor}88` }}
                                >
                                  <div className="relative flex w-full max-w-[220px] items-center justify-between">
                                    <span
                                      aria-hidden
                                      className="absolute inset-x-[5px] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15"
                                    />
                                    {[0, 1, 2, 3, 4].map((idx) => (
                                      <span
                                        key={idx}
                                        aria-hidden
                                        className={cx(
                                          'pl-lampe relative z-10',
                                          idx === 0 && 'is-on'
                                        )}
                                      />
                                    ))}
                                  </div>
                                  <p className="text-[12px] font-medium text-white/75">
                                    Préparation de la scène 3D…
                                  </p>
                                </div>
                              )}

                              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-bord bg-joint">
                                <div className="bg-surface px-3 py-2">
                                  <dt className="text-[11px] font-medium text-encre-3">
                                    Constructeur
                                  </dt>
                                  <dd className="chiffres text-[13.5px] font-semibold text-encre">
                                    {item.manufacturer}
                                  </dd>
                                </div>
                                <div className="bg-surface px-3 py-2">
                                  <dt className="text-[11px] font-medium text-encre-3">
                                    Exploitation
                                  </dt>
                                  <dd className="text-[13.5px] font-semibold text-encre">
                                    {item.driverless ? 'Automatique' : 'Conducteur'}
                                  </dd>
                                </div>
                                <div className="bg-surface px-3 py-2">
                                  <dt className="text-[11px] font-medium text-encre-3">
                                    Composition
                                  </dt>
                                  <dd className="chiffres text-[13.5px] font-semibold text-encre">
                                    {item.carsCount} voitures · {formatNombre(item.capacity)} pl.
                                  </dd>
                                </div>
                                <div className="bg-surface px-3 py-2">
                                  <dt className="text-[11px] font-medium text-encre-3">Lignes</dt>
                                  <dd className="mt-0.5 flex flex-wrap gap-1">
                                    {item.lines.map((ln) => (
                                      <LineBadgeChip key={ln} shortName={ln} size="xs" />
                                    ))}
                                  </dd>
                                </div>
                              </dl>

                              <p className="text-[13px] leading-[19px] text-encre-2">
                                {item.summary}
                              </p>

                              <div
                                className="rounded-[12px] border border-bord/80 bg-encart/75 p-3"
                                style={{ borderLeft: `3px solid ${lineColor}` }}
                              >
                                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-encre-2">
                                  Le saviez-vous ?
                                </p>
                                <p className="mt-1 text-[12.5px] leading-[18px] text-encre">
                                  {item.anecdote}
                                </p>
                              </div>

                              {onDriveTrain && (
                                <Button
                                  variant="afficheur"
                                  size={basse ? 'md' : 'sm'}
                                  fullWidth
                                  onClick={() => onDriveTrain(item)}
                                >
                                  Conduire cette rame en 3D
                                </Button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </motion.ul>
          ) : tab === 'histoire' ? (
            <motion.div
              key="tab-histoire"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE_PORTES }}
              className="space-y-3.5 pb-2"
            >
              {/* Rail de progression Plan Lumineux en succession de diodes ASVA (zéro spoiler) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11.5px] font-semibold text-encre-3">
                  <span>Chronologie du réseau</span>
                  <span className="chiffres">
                    {chapterIdx + 1} / {METRO_HISTORY_CHAPTERS.length}
                  </span>
                </div>
                <div
                  className="relative flex items-center justify-between px-1 py-1.5"
                  role="tablist"
                  aria-label="Étapes chronologiques du réseau"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-2.5 right-2.5 top-[13px] h-[3px] rounded-full bg-encart"
                  >
                    <motion.div
                      className="h-full rounded-full bg-[#00a98f]"
                      initial={false}
                      animate={{
                        width: `${(chapterIdx / Math.max(1, METRO_HISTORY_CHAPTERS.length - 1)) * 100}%`,
                      }}
                      transition={{ duration: 0.35, ease: EASE_PORTES }}
                    />
                  </div>
                  {METRO_HISTORY_CHAPTERS.map((chap, idx) => {
                    const isCurrent = idx === chapterIdx;
                    const isVisited = idx < chapterIdx;
                    const canJump = idx <= chapterIdx;
                    return (
                      <button
                        key={chap.id}
                        type="button"
                        role="tab"
                        aria-selected={isCurrent}
                        aria-label={
                          canJump
                            ? `${chap.year} — ${chap.title}`
                            : `Étape ${idx + 1} (à découvrir)`
                        }
                        disabled={!canJump}
                        onClick={() => canJump && goToChapter(idx)}
                        className={cx(
                          'relative z-10 flex flex-col items-center gap-1 focus-visible:outline-none',
                          canJump ? 'cursor-pointer' : 'cursor-default'
                        )}
                      >
                        <span
                          className="pl-lampe !h-3 !w-3 transition-transform duration-200"
                          aria-pressed={isCurrent ? 'true' : undefined}
                          data-actif={isCurrent || isVisited ? 'true' : undefined}
                          style={{
                            transform: isCurrent ? 'scale(1.22)' : 'scale(1)',
                          }}
                        />
                        <span
                          className={cx(
                            'chiffres text-[9.5px] font-semibold leading-none transition-opacity duration-200',
                            isCurrent
                              ? 'text-encre opacity-100'
                              : isVisited
                                ? 'text-encre-3 opacity-85'
                                : 'opacity-0'
                          )}
                        >
                          {chap.year.slice(0, 4)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Carte d'époque animée — révélation au clic sur Suivant */}
              <div className="overflow-hidden rounded-[14px] border border-bord bg-encart/60 p-4">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeChapter.id}
                    initial={{ opacity: 0, x: direction * 24, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: direction * -24, filter: 'blur(2px)' }}
                    transition={{ duration: 0.28, ease: EASE_PORTES }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="chiffres rounded-full bg-surface px-2.5 py-0.5 text-[12px] font-bold text-[#00a98f]">
                        {activeChapter.year}
                      </span>
                      {activeChapter.highlightLineId && (
                        <LineBadgeChip shortName={activeChapter.highlightLineId} size="xs" />
                      )}
                    </div>

                    <h3 className="signaletique mt-2.5 text-[20px] font-bold leading-tight text-encre">
                      {activeChapter.title}
                    </h3>
                    <p className="mt-0.5 text-[13px] font-medium text-encre-2">
                      {activeChapter.subtitle}
                    </p>

                    <p className="mt-3 text-[13.5px] leading-[20px] text-encre-2">
                      {activeChapter.summary}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Compteurs SIEL animés */}
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-[10px] bg-[#0e1015] p-3 text-[#ffb22e] [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-white/55">
                      Stations ouvertes
                    </span>
                    <NumberFlow
                      value={activeChapter.stationsCount}
                      className="chiffres text-[20px] font-bold"
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-white/55">
                      Longueur réseau
                    </span>
                    <span className="chiffres inline-flex items-baseline gap-1 text-[20px] font-bold">
                      <NumberFlow value={Math.round(activeChapter.networkKm)} />
                      <span className="text-[13px] font-semibold">km</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Contrôles Précédent / Lecture / Suivant */}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="secondaire"
                  size="sm"
                  icon={<RiArrowLeftSLine aria-hidden />}
                  disabled={chapterIdx === 0}
                  onClick={() => goToChapter(Math.max(0, chapterIdx - 1))}
                >
                  Précédent
                </Button>
                <Button
                  variant={storyPlaying ? 'primaire' : 'secondaire'}
                  size="sm"
                  lampe
                  pressed={storyPlaying}
                  icon={storyPlaying ? <RiPauseLine aria-hidden /> : <RiPlayLine aria-hidden />}
                  onClick={() => setStoryPlaying((p) => !p)}
                >
                  {storyPlaying ? 'Pause' : 'Lecture'}
                </Button>
                <Button
                  variant="secondaire"
                  size="sm"
                  iconEnd={<RiArrowRightSLine aria-hidden />}
                  disabled={chapterIdx >= METRO_HISTORY_CHAPTERS.length - 1}
                  onClick={() =>
                    goToChapter(Math.min(METRO_HISTORY_CHAPTERS.length - 1, chapterIdx + 1))
                  }
                >
                  Suivant
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="tab-gpe"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE_PORTES }}
              className="space-y-3 pb-2"
            >
              {/* Bandeau afficheur Plan Lumineux : synthèse réseau + interrupteur carte */}
              <div className="dark rounded-[14px] border border-white/12 bg-[#0f131a] p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white/60">
                      Réseau Grand Paris Express
                    </p>
                    <p className="chiffres mt-0.5 text-[15px] font-bold text-ambre-400 tabular-nums">
                      4 lignes · 123,5 km · 45 gares
                    </p>
                  </div>
                  <button
                    type="button"
                    data-gpe-toggle
                    data-size="sm"
                    aria-pressed={Boolean(gpeVisible)}
                    onClick={() => onToggleGpe?.()}
                    className={cx('pl-poussoir shrink-0', basse && 'min-h-[44px]')}
                  >
                    <span className="pl-calotte">
                      <span aria-hidden className={cx('pl-lampe', gpeVisible && 'is-on')} />
                      <span>{gpeVisible ? 'Sur la carte' : 'Afficher carte'}</span>
                    </span>
                  </button>
                </div>
              </div>

              <ul className="space-y-2">
                {GRAND_PARIS_EXPRESS_LINES.map((line) => {
                  const isOpen = expandedGpeId === line.id;
                  return (
                    <li key={line.id} className="list-none">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpandedGpeId(isOpen ? null : line.id)}
                        className="pl-carte-trajet !flex min-h-[56px] items-center justify-between gap-2.5 !p-3"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden
                            className={cx('pl-lampe shrink-0', isOpen && 'is-on')}
                          />
                          <span
                            aria-hidden
                            className="chiffres inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none tabular-nums shadow-sm"
                            style={{ backgroundColor: line.color, color: line.textColor }}
                          >
                            {line.shortName}
                          </span>
                          <div className="min-w-0">
                            <p className="signaletique truncate text-[15px] font-bold leading-tight text-encre">
                              {line.name}
                            </p>
                            <p className="chiffres truncate text-[12px] text-encre-2 tabular-nums">
                              {line.horizon} · {line.lengthKm} km · {line.stationsCount} gares
                            </p>
                          </div>
                        </div>
                        <RiArrowDownSLine
                          aria-hidden
                          className={cx(
                            'size-5 shrink-0 text-encre-3 transition-transform duration-200',
                            isOpen && 'rotate-180 text-encre'
                          )}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.22, ease: EASE_PORTES }}
                            className="overflow-hidden"
                          >
                            {/* Filet coloré officiel reliant la pastille à la fiche, identique à Rames 3D */}
                            <div className="relative pb-2 pl-6 pt-3">
                              <motion.span
                                aria-hidden
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                exit={{ scaleY: 0 }}
                                transition={{ duration: 0.34, ease: EASE_PORTES }}
                                style={{
                                  backgroundColor: line.color,
                                  transformOrigin: 'top center',
                                }}
                                className="absolute left-[19px] top-0 h-[34px] w-[4px] rounded-b-full"
                              />
                              <motion.span
                                aria-hidden
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                exit={{ scaleX: 0 }}
                                transition={{ duration: 0.24, delay: 0.14, ease: EASE_PORTES }}
                                style={{
                                  backgroundColor: line.color,
                                  transformOrigin: 'left center',
                                }}
                                className="absolute left-[19px] top-[30px] h-[4px] w-[10px] rounded-r-full"
                              />
                              <motion.span
                                aria-hidden
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.2, delay: 0.2, ease: EASE_PORTES }}
                                style={{ borderColor: line.color }}
                                className="absolute left-[14px] top-[25px] z-10 size-[14px] rounded-full border-[3px] bg-surface"
                              />

                              <div className="space-y-3">
                                {/* Thermomètre schématique Plan Lumineux des grands pôles */}
                                <div
                                  className="dark rounded-[12px] border bg-[#0f131a] px-3.5 py-3 text-white"
                                  style={{ borderColor: `${line.color}70` }}
                                >
                                  <p className="signaletique truncate text-[13px] font-semibold text-white">
                                    {line.route}
                                  </p>
                                  <div className="relative mt-3 flex items-center justify-between px-1">
                                    <span
                                      aria-hidden
                                      className="absolute inset-x-2 top-[5px] h-[3px] rounded-full"
                                      style={{ backgroundColor: line.color }}
                                    />
                                    {line.hubs.slice(0, 4).map((hub, idx) => (
                                      <div
                                        key={hub}
                                        className="relative z-10 flex min-w-0 max-w-[24%] flex-col items-center gap-1.5 text-center"
                                      >
                                        <span
                                          aria-hidden
                                          className={cx(
                                            'size-[12px] rounded-full border-[2.5px] bg-[#0f131a]',
                                            idx === 0 || idx === Math.min(3, line.hubs.length - 1)
                                              ? 'bg-white'
                                              : ''
                                          )}
                                          style={{ borderColor: line.color }}
                                        />
                                        <span className="line-clamp-2 text-[10px] font-medium leading-[12px] text-white/80">
                                          {hub}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-bord bg-joint">
                                  <div className="bg-surface px-3 py-2">
                                    <dt className="text-[11px] font-medium text-encre-3">
                                      Horizon
                                    </dt>
                                    <dd className="chiffres text-[13.5px] font-semibold text-encre tabular-nums">
                                      {line.horizon}
                                    </dd>
                                  </div>
                                  <div className="bg-surface px-3 py-2">
                                    <dt className="text-[11px] font-medium text-encre-3">
                                      Longueur
                                    </dt>
                                    <dd className="chiffres text-[13.5px] font-semibold text-encre tabular-nums">
                                      {line.lengthKm} km · {line.stationsCount} gares
                                    </dd>
                                  </div>
                                  <div className="col-span-2 bg-surface px-3 py-2">
                                    <dt className="text-[11px] font-medium text-encre-3">
                                      Matériel roulant
                                    </dt>
                                    <dd className="text-[13px] font-semibold text-encre">
                                      {line.stock}
                                    </dd>
                                  </div>
                                </dl>

                                <Button
                                  variant="primaire"
                                  size={basse ? 'md' : 'sm'}
                                  fullWidth
                                  className={basse ? 'min-h-[44px]' : undefined}
                                  onClick={() => {
                                    onToggleGpe?.(true);
                                    onFocusMapCamera?.({
                                      center: line.center,
                                      zoom: line.zoom,
                                      pitch: 45,
                                      bearing: -12,
                                      highlightLineId: null,
                                    });
                                  }}
                                >
                                  Voir le tracé sur la carte
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );

  if (basse) {
    return (
      <BottomSheet
        cran={cran}
        onCran={setCran}
        onDismiss={onClose}
        onSwipeBack={onClose}
        ariaLabel="Bibliothèque du métro"
        className={className}
      >
        {content}
      </BottomSheet>
    );
  }

  return (
    <Panneau
      matiere="feuille"
      as="section"
      role="dialog"
      aria-labelledby="library-titre"
      className={cx('flex max-h-full min-h-0 flex-col overflow-hidden animate-feuille', className)}
    >
      {content}
    </Panneau>
  );
}
