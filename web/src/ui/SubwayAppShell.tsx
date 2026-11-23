import { useEffect, useMemo, useRef, useState } from 'react';
import { RiMenuLine, RiWifiOffLine } from '@remixicon/react';
import { cityClock } from '@core/sim/paris_time';
import { searchPlaces, type PlaceCandidate } from '@core/ui/utils/geocoding';
import type { RoutePoint } from '@core/ui/utils/transit_router';
import { BandeauTelemetrie } from './BandeauTelemetrie';
import type { DetentSheet } from './BottomSheet';
import { FollowTrainHud } from './FollowTrainHud';
import { AProposModale } from './InfoModals';
import { LibraryDrawer } from './LibraryDrawer';
import { LinesDock } from './LinesDock';
import { MapControls } from './MapControls';
import { Marque } from './Marque';
import { MenuPrincipal, type ThemeChoix } from './MenuPrincipal';
import { MobileHomeSheet } from './MobileHomeSheet';
import { NearbyDrawer, type ErreurPosition } from './NearbyDrawer';
import { Panneau } from './Panneau';
import { PlanLumineuxRacine, Poussoir } from './plan-lumineux/PlanLumineux';
import { RoutePlannerDrawer } from './RoutePlannerDrawer';
import { ShareItineraryModal } from './ShareItineraryModal';
import {
  buildLigneDetail,
  buildNearbyStations,
  grouperPassages,
  mapItineraires,
  mapLineToEtat,
  mapTrafficAlert,
  toLineRef,
} from './shell_mappers';
import { StationDrawer } from './StationDrawer';
import { StationSearchPalette, type ResultatRecherche } from './StationSearchPalette';
import { TopNavBar, type Rubrique } from './TopNavBar';
import { cx } from './cx';
import { uiStore, useUiStore, type EdinburghPreset, type ThemePreference } from './ui_store';
import { useIsDesktop } from './useMediaQuery';

const EDINBURGH_PRESETS: { id: EdinburghPreset; label: string }[] = [
  { id: 'waverley', label: 'Vallée de Waverley' },
  { id: 'castle', label: 'Castle Rock & Princes St' },
  { id: 'calton', label: 'Calton Hill' },
  { id: 'scotland', label: 'Panorama Écosse' },
  { id: 'overview', label: 'Vue d’ensemble' },
];

const THEME_TO_CHOIX: Record<ThemePreference, ThemeChoix> = {
  system: 'systeme',
  light: 'clair',
  dark: 'sombre',
};

const CHOIX_TO_THEME: Record<ThemeChoix, ThemePreference> = {
  systeme: 'system',
  clair: 'light',
  sombre: 'dark',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function cityClockDate(timezone: string): Date {
  const clock = cityClock(new Date(), timezone);
  const d = new Date();
  const h = Math.floor(clock.secondsSinceMidnight / 3600);
  const m = Math.floor((clock.secondsSinceMidnight % 3600) / 60);
  const s = Math.floor(clock.secondsSinceMidnight % 60);
  d.setHours(h, m, s, 0);
  return d;
}

function inferNearbyError(msg: string | null): ErreurPosition {
  if (!msg) return 'indisponible';
  const low = msg.toLowerCase();
  if (low.includes('refus') || low.includes('permission') || low.includes('bloqu')) return 'refus';
  if (low.includes('délai') || low.includes('timeout') || low.includes('expir')) return 'delai';
  return 'indisponible';
}

function copyShareUrl(url: string, title?: string) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && title) {
    void navigator.share({ title, url }).catch(() => {
      void navigator.clipboard?.writeText(url).catch(() => {});
    });
    return;
  }
  void navigator.clipboard?.writeText(url).catch(() => {});
}

export function SubwayAppShell() {
  const snap = useUiStore();
  const desktop = useIsDesktop();

  const [shareModalUrl, setShareModalUrl] = useState<string | null>(null);
  const {
    cityConfig,
    cities,
    lines,
    stations,
    ladders,
    rollingStockDb,
    trafficByLine,
    trains,
    totalTrainCount,
    dailyKm,
    activeLineId,
    activeDir,
    selectedStation,
    stationDepartures,
    nearbyOpen,
    nearbyLoading,
    nearbyError,
    nearbyStations,
    nearbyDepartures,
    lineDrawerOpen,
    libraryOpen,
    libraryTab,
    routePlannerOpen,
    routeOrigin,
    routeDestination,
    routeCandidates,
    activeItineraryIndex,
    trackedTrain,
    isFollowing,
    expertMode,
    themePreference,
    pitch3D,
    bearingDeg,
    buildingsVisible,
    xrayMode,
    realtimeEnabled,
    userLocation,
    gpsWatchActive,
    savedPlaces,
    searchOpen,
    activeModal,
    handlers,
  } = snap;

  const [menuOpen, setMenuOpen] = useState(false);
  const [homeCran, setHomeCran] = useState<DetentSheet>('bas');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [clockDate, setClockDate] = useState(() =>
    cityClockDate(cityConfig?.timezone ?? 'Europe/Paris')
  );

  // Search palette state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPlacesRes, setSearchPlacesRes] = useState<PlaceCandidate[]>([]);

  const isImplicitOrigin = (o?: RoutePoint | null) =>
    Boolean(
      o &&
        (o.kind === 'user' ||
          o.label === 'Ma position' ||
          o.label === 'Centre (paris)' ||
          o.label === 'Centre (Paris)')
    );

  // Route planner text state
  const [departText, setDepartText] = useState(
    isImplicitOrigin(routeOrigin) ? '' : (routeOrigin?.label ?? '')
  );
  const [arriveeText, setArriveeText] = useState(routeDestination?.label ?? '');
  const [activeRouteField, setActiveRouteField] = useState<'depart' | 'arrivee' | null>(null);
  const [routeSuggestions, setRouteSuggestions] = useState<
    Array<{ id: string; label: string; subtitle?: string; point: RoutePoint }>
  >([]);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    setDepartText(isImplicitOrigin(routeOrigin) ? '' : (routeOrigin?.label ?? ''));
  }, [routeOrigin]);

  useEffect(() => {
    setArriveeText(routeDestination?.label ?? '');
  }, [routeDestination?.label]);

  useEffect(() => {
    const tz = cityConfig?.timezone ?? 'Europe/Paris';
    const update = () => setClockDate(cityClockDate(tz));
    update();
    const timer = window.setInterval(update, expertMode ? 1000 : 15000);
    return () => window.clearInterval(timer);
  }, [cityConfig?.timezone, expertMode]);

  // Global ⌘K / Ctrl+K shortcut for search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        uiStore.setSearchOpen(!uiStore.getSnapshot().searchOpen);
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close popovers on outside pointerdown
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuContainerRef.current && !menuContainerRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // Geocode places for StationSearchPalette
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!searchOpen || trimmed.length < 3) {
      setSearchPlacesRes([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPlaces(trimmed, {
        cityId: cityConfig?.id,
        center: cityConfig?.map?.center,
        limit: 6,
        signal: controller.signal,
      })
        .then((res) => {
          if (!controller.signal.aborted) setSearchPlacesRes(res);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchPlacesRes([]);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, searchOpen, cityConfig?.id, cityConfig?.map?.center]);

  // Route planner endpoint suggestions (stations + geocoding)
  useEffect(() => {
    if (!routePlannerOpen || !activeRouteField) {
      setRouteSuggestions([]);
      return;
    }
    const raw = activeRouteField === 'depart' ? departText : arriveeText;
    const currentLabel =
      activeRouteField === 'depart' ? routeOrigin?.label : routeDestination?.label;
    const q = normalizeText(raw);
    if (q.length < 2 || raw === currentLabel) {
      setRouteSuggestions([]);
      return;
    }

    const stationMatches = stations
      .filter((s) => normalizeText(s.name).includes(q))
      .slice(0, 4)
      .map((s) => ({
        id: `st:${s.id}`,
        label: s.name,
        subtitle: 'Station',
        point: {
          label: s.name,
          subtitle: 'Station',
          coordinates: s.coordinates,
          kind: 'station' as const,
          station: s,
        },
      }));

    setRouteSuggestions(stationMatches);

    if (raw.trim().length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPlaces(raw.trim(), {
        cityId: cityConfig?.id,
        center: cityConfig?.map?.center,
        limit: 4,
        signal: controller.signal,
      })
        .then((places) => {
          if (controller.signal.aborted) return;
          const placeMatches = places.map((pl) => ({
            id: pl.id,
            label: pl.name,
            subtitle: pl.subtitle,
            point: {
              label: pl.name,
              subtitle: pl.subtitle,
              coordinates: pl.coordinates,
              kind: 'place' as const,
            },
          }));
          setRouteSuggestions([...stationMatches, ...placeMatches].slice(0, 6));
        })
        .catch(() => {});
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    routePlannerOpen,
    activeRouteField,
    departText,
    arriveeText,
    routeOrigin?.label,
    routeDestination?.label,
    stations,
    cityConfig?.id,
    cityConfig?.map?.center,
  ]);

  const linesById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const linesByShort = useMemo(
    () => new Map(lines.map((l) => [l.short_name, l])),
    [lines]
  );

  const activeLine = activeLineId ? (linesById.get(activeLineId) ?? null) : null;
  const isParis = cityConfig?.id === 'paris';

  const lignesEtat = useMemo(
    () =>
      lines
        .map((line) => mapLineToEtat(line, trafficByLine[line.id]))
        .sort((a, b) => a.shortName.localeCompare(b.shortName, 'fr', { numeric: true })),
    [lines, trafficByLine]
  );

  const ligneDetail = useMemo(() => {
    if (!activeLine) return null;
    return buildLigneDetail({
      activeLine,
      activeLadder: ladders[activeLine.id] ?? null,
      activeDir,
      traffic: trafficByLine[activeLine.id] ?? null,
      rollingStockDb,
      trains,
      stations,
      linesById,
      expertMode,
      onInverser: () =>
        handlers.onLineDirChange?.(activeLine.id, activeDir === '1' ? '0' : '1'),
      onArret: (stationName) => {
        const found = stations.find((s) => s.name === stationName);
        if (found) handlers.onStationSelect?.(found);
      },
      onRame: (train) => handlers.onTrainFollow?.(train),
      onCorrespondance: (shortName) => {
        const target = linesByShort.get(shortName);
        if (target) handlers.onLineSelect?.(target.id, '0');
      },
    });
  }, [
    activeLine,
    ladders,
    activeDir,
    trafficByLine,
    rollingStockDb,
    trains,
    stations,
    linesById,
    linesByShort,
    expertMode,
    handlers,
  ]);

  const stationPassages = useMemo(
    () => grouperPassages(stationDepartures),
    [stationDepartures]
  );

  const nearbyProches = useMemo(
    () => buildNearbyStations(nearbyStations, nearbyDepartures, linesById),
    [nearbyStations, nearbyDepartures, linesById]
  );

  const itinerairesProps = useMemo(() => mapItineraires(routeCandidates), [routeCandidates]);

  const searchResults = useMemo(() => {
    const q = normalizeText(searchQuery);
    const POPULAR_DESTINATIONS = [
      'chatelet',
      'gare du nord',
      'gare de lyon',
      'saint lazare',
      'montparnasse bienvenue',
      'republique',
      'nation',
      'charles de gaulle etoile',
      'opera',
      'bastille',
      'la defense',
      'gare de l est',
      'place d italie',
      'denfert rochereau',
    ];
    const rankStation = (name: string, lineCount: number) => {
      const norm = normalizeText(name).replace(/[^a-z0-9]+/g, ' ').trim();
      const idx = POPULAR_DESTINATIONS.findIndex((p) => norm === p || norm.startsWith(p));
      return idx >= 0 ? idx : 1000 - lineCount * 10;
    };
    const baseStations = q
      ? stations.filter((s) => normalizeText(s.name).includes(q))
      : [...stations].sort((a, b) => rankStation(a.name, a.lines.length) - rankStation(b.name, b.lines.length));
    const matchedStations = baseStations
      .slice(0, 10)
      .map((s) => ({
        type: 'station' as const,
        id: s.id,
        nom: s.name,
        lignes: s.lines
          .map((id) => linesById.get(id))
          .filter((l): l is (typeof lines)[number] => Boolean(l))
          .slice(0, 5)
          .map(toLineRef),
      }));

    const matchedLines = (
      q
        ? lines.filter(
            (l) =>
              normalizeText(l.short_name).includes(q) ||
              normalizeText(l.long_name || '').includes(q) ||
              normalizeText(`ligne ${l.short_name}`).includes(q)
          )
        : lines.slice(0, 4)
    )
      .slice(0, 6)
      .map((l) => ({
        type: 'ligne' as const,
        ligne: toLineRef(l),
        termini: [l.destinations?.['0'] || '', l.destinations?.['1'] || ''] as [string, string],
      }));

    const matchedPlaces = searchPlacesRes.map((pl) => ({
      type: 'lieu' as const,
      id: pl.id,
      nom: pl.name,
      detail: pl.subtitle || pl.category,
    }));

    return { matchedStations, matchedLines, matchedPlaces };
  }, [searchQuery, stations, lines, linesById, searchPlacesRes]);

  if (!cityConfig) return null;

  const actifRubrique: Rubrique | null = routePlannerOpen
    ? 'itineraire'
    : libraryOpen
      ? 'bibliotheque'
      : lineDrawerOpen
        ? 'lignes'
        : null;

  const handleRubrique = (r: Rubrique) => {
    if (r === 'itineraire') {
      uiStore.setLibraryOpen(false);
      if (routePlannerOpen) {
        uiStore.setRoutePlannerOpen(false);
        setActiveRouteField(null);
        setRouteSuggestions([]);
        handlers.onComputeItinerary?.(null, null);
      } else {
        handlers.onOpenRoutePlanner?.();
      }
    } else if (r === 'bibliotheque') {
      const next = !libraryOpen;
      if (next) {
        uiStore.setRoutePlannerOpen(false);
        uiStore.setSelectedStation(null);
        uiStore.setNearbyOpen(false);
      }
      uiStore.setLibraryOpen(next);
    } else {
      uiStore.setLibraryOpen(false);
      uiStore.setLineDrawerOpen(!lineDrawerOpen);
    }
  };

  const rtSource =
    cityConfig.realtime.provider === 'prim'
      ? realtimeEnabled
        ? 'PRIM'
        : undefined
      : cityConfig.realtime.provider === 'tfl-unified'
        ? 'TfL'
        : cityConfig.id === 'washington'
          ? 'WMATA'
          : cityConfig.id === 'berlin'
            ? 'VBB'
            : undefined;

  const dockVisible = lineDrawerOpen && !isFollowing;
  const anyDrawerOpen = Boolean(selectedStation || nearbyOpen || routePlannerOpen || libraryOpen);

  const menuProps = {
    experience: (expertMode ? 'passionne' : 'simple') as 'passionne' | 'simple',
    onExperience: (exp: 'passionne' | 'simple') => uiStore.setExpertMode(exp === 'passionne'),
    theme: THEME_TO_CHOIX[themePreference],
    onTheme: (t: ThemeChoix) => handlers.onSetThemePreference?.(CHOIX_TO_THEME[t]),
    batiments3d: buildingsVisible,
    onBatiments3d: (visible: boolean) => {
      if (visible !== buildingsVisible) handlers.onToggleBuildings?.();
    },
    reseaux: cities.map((c) => ({
      id: c.id,
      nom: c.displayName,
      actif: c.id === cityConfig.id,
      onSelect: () => {
        setMenuOpen(false);
        if (c.id !== cityConfig.id) handlers.onCitySelect?.(c.id);
      },
    })),
    onAPropos: () => {
      setMenuOpen(false);
      uiStore.setActiveModal('about');
    },
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <PlanLumineuxRacine />
      {/* Barre supérieure : bureau (TopNavBar unifiée) vs mobile (pastille unique) */}
      {desktop ? (
        <div className="fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 pt-3.5">
          <div ref={menuContainerRef} className="relative inline-flex max-w-full flex-col items-start">
            <TopNavBar
              reseau={cityConfig.displayName}
              onSearch={() => {
                setMenuOpen(false);
                uiStore.setSearchOpen(true);
              }}
              onRubrique={(r) => {
                setMenuOpen(false);
                handleRubrique(r);
              }}
              actif={actifRubrique}
              experience={expertMode ? 'passionne' : 'simple'}
              onExperience={(exp) => uiStore.setExpertMode(exp === 'passionne')}
              onMenu={() => {
                const next = !menuOpen;
                setMenuOpen(next);
                if (next && desktop) {
                  uiStore.setLineDrawerOpen(false);
                  uiStore.setLibraryOpen(false);
                  uiStore.setRoutePlannerOpen(false);
                  uiStore.setSelectedStation(null);
                  uiStore.setNearbyOpen(false);
                }
              }}
              menuOuvert={menuOpen}
              ligneActive={activeLine ? toLineRef(activeLine) : null}
              horloge={clockDate}
              compact
              className="px-0 pt-0 md:px-0 md:pt-0"
            />

            {menuOpen && (
              <MenuPrincipal
                {...menuProps}
                className="pointer-events-auto absolute right-0 top-[calc(100%+8px)]"
              />
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* État hors ligne */}
            {isOffline && (
              <Panneau
                role="status"
                className="pointer-events-auto flex items-center gap-2 rounded-pill px-3 py-1.5 text-[12px] text-encre"
              >
                <RiWifiOffLine aria-hidden className="size-3.5 shrink-0 text-vigilance" />
                <span>Hors ligne</span>
              </Panneau>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={menuContainerRef}
          className="fixed left-3 top-[max(12px,env(safe-area-inset-top))] z-30 flex max-w-[calc(100vw-80px)] flex-col items-start gap-2"
        >
          <Poussoir
            onClick={() => setMenuOpen((v) => !v)}
            expanded={menuOpen}
            aria-label={`${cityConfig.displayName} — Menu`}
            icone={<Marque size={20} />}
            className="pointer-events-auto max-md:min-h-[44px]"
          >
            <span className="signaletique capitalize truncate">{cityConfig.displayName}</span>
            {rtSource && (
              <span
                aria-hidden
                className={cx('size-1.5 shrink-0 rounded-full', realtimeEnabled ? 'bg-normal' : 'bg-encre-3')}
              />
            )}
            <RiMenuLine aria-hidden className="size-4 shrink-0 text-icone-2" />
          </Poussoir>

          {menuOpen && (
            <MenuPrincipal
              {...menuProps}
              className="pointer-events-auto"
            />
          )}

          {isOffline && (
            <Panneau
              role="status"
              className="pointer-events-auto flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12px] text-encre"
            >
              <RiWifiOffLine aria-hidden className="size-3.5 shrink-0 text-vigilance" />
              <span>Hors ligne</span>
            </Panneau>
          )}
        </div>
      )}

      {/* Contrôles de carte (toujours fixes en bas à droite) */}
      <MapControls
        vue3d={pitch3D}
        onVue3d={() => handlers.onTogglePitch?.()}
        gps={gpsWatchActive}
        onGps={() => handlers.onToggleGpsFollow?.()}
        recentrer={null}
        pointsDeVue={
          cityConfig.id === 'edinburgh'
            ? EDINBURGH_PRESETS.map((pr) => ({
                label: pr.label,
                onSelect: () => handlers.onEdinburghPreset?.(pr.id),
              }))
            : undefined
        }
        className="fixed right-3 top-[max(12px,env(safe-area-inset-top))] z-20 md:right-4 md:bottom-12 md:top-auto"
      />

      {/* Panneau des lignes : bureau latéral (repliable) ou feuille 3 crans mobile */}
      {dockVisible && (desktop || !anyDrawerOpen) && (
        desktop ? (
          <div
            id="dock"
            className={cx(
              'pointer-events-auto fixed left-4 top-[84px] z-20 w-[348px] transition-[transform,opacity] duration-200 ease-portes will-change-[transform,opacity]',
              activeLine ? 'bottom-4' : 'max-h-[calc(100dvh-90px)]',
            )}
          >
            <LinesDock
              lignes={lignesEtat}
              selection={activeLine?.short_name ?? null}
              onSelect={(shortName) => {
                if (!shortName) {
                  handlers.onLineSelect?.(null, '0');
                  return;
                }
                const target = linesByShort.get(shortName);
                if (target) handlers.onLineSelect?.(target.id, '0');
              }}
              onClose={() => uiStore.setLineDrawerOpen(false)}
              detail={ligneDetail}
              onMonter={
                isParis
                  ? (shortName) =>
                      handlers.onOpenParisRide?.({
                        initialLine: shortName,
                        initialView: expertMode ? 'ride' : 'vault',
                      })
                  : undefined
              }
              presentation="cote"
              className={activeLine ? 'h-full' : undefined}
            />
          </div>
        ) : (
          <LinesDock
            lignes={lignesEtat}
            selection={activeLine?.short_name ?? null}
            onSelect={(shortName) => {
              if (!shortName) {
                handlers.onLineSelect?.(null, '0');
                return;
              }
              const target = linesByShort.get(shortName);
              if (target) handlers.onLineSelect?.(target.id, '0');
            }}
            onClose={() => uiStore.setLineDrawerOpen(false)}
            detail={ligneDetail}
            onMonter={
              isParis
                ? (shortName) =>
                    handlers.onOpenParisRide?.({
                      initialLine: shortName,
                      initialView: expertMode ? 'ride' : 'vault',
                    })
                : undefined
            }
            presentation="basse"
            replie={dockCollapsed}
            onReplier={() => setDockCollapsed((v) => !v)}
          />
        )
      )}

      {/* Suivi de rame */}
      {isFollowing && trackedTrain && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-20 flex justify-center px-3">
          {(() => {
            const trLine = linesById.get(trackedTrain.line);
            const trLadder = ladders[trackedTrain.line];
            const d0 = trLadder?.directions?.['0'];
            const d1 = trLadder?.directions?.['1'];
            const matchedDir =
              d1 && d1.terminus === trackedTrain.dest ? d1 : (d0 ?? d1);
            const stops = (matchedDir?.stations ?? []).map((s) => s.name);
            const nextIdx = Math.max(0, stops.indexOf(trackedTrain.next));
            const speedKmh = Math.round(trackedTrain.spd || (trackedTrain.speedMps ?? 0) * 3.6);
            const isLive =
              trackedTrain.conf === 'measured' || trackedTrain.conf === 'bracketed';
            const confLabel =
              trackedTrain.conf === 'measured' || trackedTrain.conf === 'bracketed'
                ? 'Direct'
                : 'Théorique';

            return (
              <FollowTrainHud
                ligne={
                  trLine
                    ? toLineRef(trLine)
                    : {
                        shortName: trackedTrain.lineName || '?',
                        color: trackedTrain.colorHex,
                        textColor: trackedTrain.textColorHex,
                      }
                }
                direction={trackedTrain.dest}
                prochaine={trackedTrain.next}
                arrivee={{
                  minutes: trackedTrain.atStop ? 0 : 1,
                  statut: trackedTrain.atStop ? 'quai' : undefined,
                  source: isLive ? 'temps-reel' : 'theorique',
                }}
                arrets={stops.length > 0 ? stops : [trackedTrain.next]}
                index={nextIdx}
                progression={trackedTrain.atStop ? 0 : 0.45}
                vitesse={expertMode ? speedKmh : undefined}
                confiance={expertMode ? confLabel : undefined}
                onMonter={
                  isParis && trackedTrain.lineName?.trim()
                    ? () =>
                        handlers.onOpenParisRide?.({
                          initialLine: trackedTrain.lineName,
                          initialDest: trackedTrain.dest,
                          initialStation: trackedTrain.next,
                          initialTrainId: trackedTrain.id,
                          initialView: 'ride',
                        })
                    : undefined
                }
                onArreter={() => handlers.onStopFollow?.()}
                className="pointer-events-auto"
              />
            );
          })()}
        </div>
      )}

      {/* Tiroir station */}
      {selectedStation && (() => {
        const stLines = selectedStation.lines
          .map((id) => linesById.get(id))
          .filter((l): l is (typeof lines)[number] => Boolean(l));
        const primaryLine = stLines[0] ?? null;
        const firstAlert = stLines
          .map((l) => trafficByLine[l.id])
          .find((r) => r && r.status !== 'normal');
        const stPoint: RoutePoint = {
          label: selectedStation.name,
          subtitle: 'Station',
          coordinates: selectedStation.coordinates,
          kind: 'station',
          station: selectedStation,
        };
        const isHome = savedPlaces.home?.label === selectedStation.name;
        const isWork = savedPlaces.work?.label === selectedStation.name;

        const drawerNode = (
          <StationDrawer
            station={{
              nom: selectedStation.name,
              lignes: stLines.map((l) => ({
                ...toLineRef(l),
                alert: mapTrafficAlert(trafficByLine[l.id]),
              })),
              accessible: selectedStation.wheelchair_boarding === 1,
              alerte: firstAlert
                ? {
                    niveau: mapTrafficAlert(firstAlert) ?? 'vigilance',
                    texte: firstAlert.message || firstAlert.title,
                  }
                : null,
            }}
            groupes={stationPassages.groupes}
            direct={realtimeEnabled}
            passionne={expertMode}
            domicile={isHome}
            travail={isWork}
            onDomicile={() => uiStore.setPresetPlace('home', isHome ? null : stPoint)}
            onTravail={() => uiStore.setPresetPlace('work', isWork ? null : stPoint)}
            onPartager={() => {
              const slug = cityConfig.slug || 'paris';
              copyShareUrl(
                `${window.location.origin}/${encodeURIComponent(slug)}?station=${encodeURIComponent(selectedStation.name)}`
              );
            }}
            onYAller={() => {
              handlers.onOpenRoutePlanner?.({ destination: stPoint });
              uiStore.setSelectedStation(null);
            }}
            onPartir={() => {
              handlers.onOpenRoutePlanner?.({ origin: stPoint });
              uiStore.setSelectedStation(null);
            }}
            onQuai3D={
              isParis && primaryLine
                ? () => {
                    const name = selectedStation.name;
                    uiStore.setSelectedStation(null);
                    handlers.onOpenParisRide?.({
                      initialLine: primaryLine.short_name,
                      initialStation: name,
                      initialView: 'vault',
                    });
                  }
                : undefined
            }
            onLigne={(shortName) => {
              const target = linesByShort.get(shortName);
              if (target) {
                handlers.onLineSelect?.(target.id, '0');
                uiStore.setLineDrawerOpen(true);
                uiStore.setSelectedStation(null);
              }
            }}
            onSuivre={
              expertMode
                ? (gIdx, pIdx) => {
                    const ref = stationPassages.refs[gIdx]?.[pIdx];
                    if (ref) {
                      handlers.onTrainFollowById?.(ref.tripId, ref.lineId);
                      uiStore.setSelectedStation(null);
                    }
                  }
                : undefined
            }
            onClose={() => uiStore.setSelectedStation(null)}
            className={desktop ? 'h-full' : undefined}
          />
        );

        return desktop ? (
          <div className="pointer-events-auto fixed right-4 top-[84px] bottom-[156px] z-30 w-[356px]">
            {drawerNode}
          </div>
        ) : (
          drawerNode
        );
      })()}

      {/* Tiroir Autour de moi */}
      {nearbyOpen && (() => {
        const nearbyNode = (
          <NearbyDrawer
            etat={nearbyLoading ? 'chargement' : nearbyError ? 'erreur' : 'pret'}
            erreur={nearbyError ? inferNearbyError(nearbyError) : undefined}
            stations={nearbyProches}
            precision={userLocation ? Math.round(userLocation.accuracyM) : undefined}
            onStation={(id) => {
              const found = stations.find((s) => s.id === id);
              if (found) {
                uiStore.setNearbyOpen(false);
                handlers.onStationSelect?.(found);
              }
            }}
            onReessayer={() => handlers.onRequestNearby?.()}
            onRechercher={() => {
              uiStore.setNearbyOpen(false);
              uiStore.setSearchOpen(true);
            }}
            onClose={() => uiStore.setNearbyOpen(false)}
            className={desktop ? 'h-full' : undefined}
          />
        );

        return desktop ? (
          <div className="pointer-events-auto fixed right-4 top-[84px] bottom-[156px] z-30 w-[356px]">
            {nearbyNode}
          </div>
        ) : (
          nearbyNode
        );
      })()}

      {/* Tiroir Itinéraire */}
      {routePlannerOpen && (
        <div
          className={cx(
            'pointer-events-auto fixed z-30 flex flex-col gap-2',
            desktop
              ? itinerairesProps.length > 0
                ? 'right-4 top-[84px] bottom-[156px] w-[368px]'
                : 'right-4 top-[84px] max-h-[calc(100dvh-240px)] w-[368px]'
              : 'inset-x-0 bottom-0'
          )}
        >
          <RoutePlannerDrawer
            depart={departText}
            departPlaceholder={isImplicitOrigin(routeOrigin) ? routeOrigin?.label : 'Ma position'}
            arrivee={arriveeText}
            onDepart={(v) => {
              setDepartText(v);
              setActiveRouteField('depart');
              if (!v) handlers.onComputeItinerary?.(null, routeDestination);
            }}
            onArrivee={(v) => {
              setArriveeText(v);
              setActiveRouteField('arrivee');
              if (!v) handlers.onComputeItinerary?.(routeOrigin, null);
            }}
            onInverser={() => {
              const prevDepart = departText;
              const prevArrivee = arriveeText;
              setDepartText(prevArrivee);
              setArriveeText(prevDepart);
              setActiveRouteField(null);
              handlers.onComputeItinerary?.(routeDestination, routeOrigin);
            }}
            onMaPosition={() =>
              handlers.onOpenRoutePlanner?.({ origin: null, destination: routeDestination })
            }
            domicile={savedPlaces.home?.label ?? null}
            travail={savedPlaces.work?.label ?? null}
            onRaccourci={(kind) => {
              const saved = kind === 'domicile' ? savedPlaces.home : savedPlaces.work;
              if (saved) {
                if (routeOrigin && !routeDestination) {
                  handlers.onComputeItinerary?.(routeOrigin, saved);
                } else {
                  handlers.onOpenRoutePlanner?.({ destination: saved });
                }
              } else if (routeDestination) {
                uiStore.setPresetPlace(kind === 'domicile' ? 'home' : 'work', routeDestination);
              }
            }}
            favoris={savedPlaces.favorites.slice(0, 4).map((fav) => ({
              nom: fav.label,
              onClick: () => {
                if (routeOrigin && !routeDestination) {
                  handlers.onComputeItinerary?.(routeOrigin, fav);
                } else {
                  handlers.onOpenRoutePlanner?.({ destination: fav });
                }
              },
            }))}
            itineraires={itinerairesProps}
            selection={activeItineraryIndex}
            onSelection={(idx) => handlers.onSelectItineraryIndex?.(idx)}
            onPartager={() => {
              if (!routeOrigin || !routeDestination) return;
              const slug = cityConfig.slug || 'paris';
              const enc = (p: RoutePoint) =>
                `${p.label}@${p.coordinates[1].toFixed(5)},${p.coordinates[0].toFixed(5)}`;
              const sp = new URLSearchParams({
                from: enc(routeOrigin),
                to: enc(routeDestination),
              });
              setShareModalUrl(`${window.location.origin}/${encodeURIComponent(slug)}?${sp}`);
            }}
            onVoirEn3D={
              isParis
                ? (seg) =>
                    handlers.onOpenParisRide?.({
                      initialLine: seg.ligne.shortName,
                      initialDest: seg.direction,
                      initialStation: seg.de,
                      initialView: 'ride',
                    })
                : undefined
            }
            onClose={() => {
              uiStore.setRoutePlannerOpen(false);
              setActiveRouteField(null);
              setRouteSuggestions([]);
              handlers.onComputeItinerary?.(null, null);
            }}
            className={desktop && itinerairesProps.length > 0 ? 'h-full' : undefined}
          />

          <ShareItineraryModal
            open={shareModalUrl !== null}
            onClose={() => setShareModalUrl(null)}
            depart={routeOrigin?.label ?? departText}
            arrivee={routeDestination?.label ?? arriveeText}
            itineraire={itinerairesProps[activeItineraryIndex] ?? itinerairesProps[0] ?? null}
            shareUrl={shareModalUrl ?? ''}
            reseau={
              cityConfig.displayName
                ? cityConfig.displayName.charAt(0).toUpperCase() + cityConfig.displayName.slice(1)
                : 'Paris'
            }
          />

          {routeSuggestions.length > 0 && activeRouteField && (
            <Panneau
              matiere="feuille"
              className={cx(
                'z-40 max-h-56 overflow-y-auto p-1.5 shadow-xl',
                desktop ? 'absolute left-4 right-4 top-[176px]' : 'fixed inset-x-4 top-[calc(14dvh+196px)]',
              )}
            >
              {routeSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (activeRouteField === 'depart') {
                      setDepartText(s.label);
                      handlers.onComputeItinerary?.(s.point, routeDestination);
                    } else {
                      setArriveeText(s.label);
                      handlers.onComputeItinerary?.(routeOrigin, s.point);
                    }
                    setActiveRouteField(null);
                    setRouteSuggestions([]);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-controle px-3 py-2 text-left text-corps-sm text-encre hover:bg-encart"
                >
                  <span className="truncate font-medium">{s.label}</span>
                  {s.subtitle && (
                    <span className="shrink-0 text-legende text-encre-3">{s.subtitle}</span>
                  )}
                </button>
              ))}
            </Panneau>
          )}
        </div>
      )}

      {/* Feuille d'accueil mobile à 3 crans + repli (hors tiroirs et hors suivi) */}
      {!desktop && !anyDrawerOpen && !dockVisible && !isFollowing && (
        <MobileHomeSheet
          cran={homeCran}
          onCran={setHomeCran}
          onSearch={() => uiStore.setSearchOpen(true)}
          hasHome={Boolean(savedPlaces.home)}
          hasWork={Boolean(savedPlaces.work)}
          onDomicile={() => {
            if (savedPlaces.home) {
              handlers.onOpenRoutePlanner?.({ destination: savedPlaces.home });
            } else {
              handlers.onOpenRoutePlanner?.();
            }
          }}
          onTravail={() => {
            if (savedPlaces.work) {
              handlers.onOpenRoutePlanner?.({ destination: savedPlaces.work });
            } else {
              handlers.onOpenRoutePlanner?.();
            }
          }}
          onLignes={() => uiStore.setLineDrawerOpen(true)}
          onItineraire={() => handlers.onOpenRoutePlanner?.()}
          onBibliotheque={() => uiStore.setLibraryOpen(true)}
          lignes={lignesEtat}
          onSelectLine={(shortName) => {
            const target = linesByShort.get(shortName);
            if (target) {
              handlers.onLineSelect?.(target.id, '0');
              uiStore.setLineDrawerOpen(true);
            }
          }}
          expertMode={expertMode}
          totalTrains={totalTrainCount}
          dailyKm={Math.round(dailyKm)}
          direct={realtimeEnabled}
          directDisponible={cityConfig.realtime.provider !== 'none'}
          onDirect={() => handlers.onToggleRealtime?.()}
          rtSource={rtSource}
        />
      )}

      {/* Tiroir Bibliothèque (Rames 3D & Histoire) */}
      {libraryOpen && (() => {
        const libNode = (
          <LibraryDrawer
            tab={libraryTab}
            onTabChange={(t) => uiStore.setLibraryOpen(true, t)}
            onClose={() => uiStore.setLibraryOpen(false)}
            onDriveTrain={
              isParis
                ? (stock) => {
                    uiStore.setLibraryOpen(false);
                    handlers.onOpenParisRide?.({
                      initialLine: stock.defaultLineForRide,
                      initialView: 'ride',
                    });
                  }
                : undefined
            }
            onFocusMapCamera={(opts) => handlers.onFocusMapCamera?.(opts)}
            className={desktop ? 'h-full' : undefined}
          />
        );

        return desktop ? (
          <div className="pointer-events-auto fixed right-4 top-[84px] bottom-[156px] z-30 w-[412px]">
            {libNode}
          </div>
        ) : (
          libNode
        );
      })()}

      {/* Palette de recherche ⌘K */}
      <StationSearchPalette
        ouverte={searchOpen}
        requete={searchQuery}
        onRequete={setSearchQuery}
        stations={searchResults.matchedStations}
        lignes={searchResults.matchedLines}
        lieux={searchResults.matchedPlaces}
        onChoisir={(res: ResultatRecherche) => {
          uiStore.setSearchOpen(false);
          setSearchQuery('');
          if (res.type === 'itineraire') {
            handlers.onOpenRoutePlanner?.();
          } else if (res.type === 'station') {
            const st = stations.find((s) => s.id === res.id);
            if (st) handlers.onStationSelect?.(st);
          } else if (res.type === 'ligne') {
            const ln = linesByShort.get(res.ligne.shortName);
            if (ln) {
              handlers.onLineSelect?.(ln.id, '0');
              uiStore.setLineDrawerOpen(true);
            }
          } else if (res.type === 'lieu') {
            const pl = searchPlacesRes.find((p) => p.id === res.id);
            if (pl) handlers.onSelectPlace?.(pl, true);
          }
        }}
        onClose={() => {
          uiStore.setSearchOpen(false);
          setSearchQuery('');
        }}
      />

      {/* Modales d'information */}
      <AProposModale
        ouverte={activeModal === 'about' || activeModal === 'method'}
        onClose={() => uiStore.setActiveModal(null)}
        methodeHref="/methode"
      />
    </div>
  );
}
