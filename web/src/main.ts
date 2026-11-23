import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyMapTheme,
  areBuildingsVisible,
  computeSubsurfaceMix,
  createMap,
  MapBounds,
  maxPitchForZoom,
  setBuildingsVisible,
  setSubsurfaceMapMode,
} from '@core/ui/map/maplibre';
import { SubwayDeckOverlay, TrackItem } from '@core/ui/map/deck_overlay';
import { BrowserSubwayEngine } from '@core/sim/browser_engine';
import { SubwayRouter } from '@core/ui/router';
import { CITIES, getCityConfig } from '@cities/index';
import { createRealtimeAdapter } from '@cities/realtime';
import { coordAtDistance, loadShapes } from '@core/sim/shapes_loader';
import { loadRollingStock } from '@core/sim/rolling_stock';
import type { TrainMarker } from '@core/ui/map/trains_layer';
import type { LineMetadata, StationMetadata } from '@core/types';
import { DEFAULT_PITCH, DEFAULT_BEARING } from '@core/constants';
import '@/styles/globals.css';
import { auditLineContrast, LineLike, lineBadge } from '@core/ui/components/line_badge';
import { FollowCamera } from '@core/ui/map/follow_camera';
import { escapeHtml } from '@core/ui/utils';
import { findNearbyStations } from '@core/ui/utils/nearby_stations';
import type { PlaceCandidate } from '@core/ui/utils/geocoding';
import {
  computeTransitItineraries,
  type RoutePoint,
  type TransitItinerary,
} from '@core/ui/utils/transit_router';
import { SubwayAppShell } from './ui/SubwayAppShell';
import { applyFaienceBasemap } from './map/basemap_palette';
import { uiStore, type EdinburghPreset, type ThemePreference } from './ui/ui_store';
import { initMonitoring } from './monitoring/sentry';

initMonitoring();

const DATA_REVISION = '20260910-08';
const dataUrl = (path: string) => `${path}?v=${DATA_REVISION}`;

type Coordinate = [number, number];

function boundsFromPolylines(polylines: Coordinate[][]): MapBounds | null {
  // Do not spread every GTFS vertex into Math.min/Math.max: the complete RER
  // branch geometry contains enough points to exceed JavaScript's argument
  // stack limit. A streaming reduction is both bounded and faster.
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const polyline of polylines) {
    for (const point of polyline) {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
      minLng = Math.min(minLng, point[0]);
      minLat = Math.min(minLat, point[1]);
      maxLng = Math.max(maxLng, point[0]);
      maxLat = Math.max(maxLat, point[1]);
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function expandBounds(bounds: MapBounds, marginKm = 30): MapBounds {
  const centerLat = (bounds[0][1] + bounds[1][1]) / 2;
  const latMargin = marginKm / 111;
  const lngMargin = marginKm / (111 * Math.max(0.25, Math.cos((centerLat * Math.PI) / 180)));
  return [
    [bounds[0][0] - lngMargin, bounds[0][1] - latMargin],
    [bounds[1][0] + lngMargin, bounds[1][1] + latMargin],
  ];
}

async function bootstrap() {
  let deckOverlay: SubwayDeckOverlay;
  let engine: BrowserSubwayEngine;
  let lines: LineMetadata[] = [];
  let selectLine: (lineId: string | null, dir?: string) => void = () => {};

  const router = new SubwayRouter(({ lineShortName, dir }) => {
    if (lineShortName && lines.length > 0) {
      const line = lines.find((l) => l.short_name.toLowerCase() === lineShortName.toLowerCase());
      if (line) {
        selectLine(line.id, dir || '0');
        return;
      }
    }
    selectLine(null, '0');
  });

  const requestedCity = router.getCurrentCity();
  const cityConfig = getCityConfig(requestedCity);
  if (requestedCity.toLowerCase() !== cityConfig.slug.toLowerCase() && typeof window !== 'undefined') {
    window.history.replaceState(null, '', `/${cityConfig.slug}${window.location.search}`);
  }
  console.log(`[app] Initializing ${cityConfig.networkName} 3D (${cityConfig.displayName})...`);

  // Redirect train model requests to high-fidelity Scottish Class 385 EMU in Edinburgh
  if (cityConfig.id === 'edinburgh') {
    const origFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (
        typeof input === 'string' &&
        (input.includes('wmata_generic__neutral.glb') ||
          input.includes('steel_classic__neutral.glb'))
      ) {
        return origFetch('/models/train/scotrail_class_385__neutral.glb', init);
      }
      return origFetch(input, init);
    };
  }

  // 1. Phase 1 (Critical Path, ~330 KB raw / ~70 KB compressed):
  // Create the MapLibre instance immediately in parallel with lightweight metadata
  // so the 3D map & UI become interactive in < 400 ms without waiting for schedule.json (8 MB).
  const dataDir = cityConfig.paths.dataDir;
  const rerLinesPath = cityConfig.paths.rer?.linesJson;

  const mapEl = document.getElementById('map')!;
  const tooltipEl = document.getElementById('tooltip')!;

  const configBounds = cityConfig.map.bounds
    ? Array.isArray(cityConfig.map.bounds[0])
      ? (cityConfig.map.bounds as [[number, number], [number, number]])
      : ([
          [cityConfig.map.bounds[0], cityConfig.map.bounds[1]],
          [cityConfig.map.bounds[2], cityConfig.map.bounds[3]],
        ] as [[number, number], [number, number]])
    : undefined;

  const map = createMap('map', {
    initialBounds: configBounds,
    center: cityConfig.map.center,
    zoom: cityConfig.map.zoom,
    pitch: cityConfig.map.pitch,
    bearing: cityConfig.map.bearing,
    attribution: `© <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · ${cityConfig.attribution.licenseText}`,
  });
  (window as any).__map = map;
  (window as any).map = map;

  const [linesRes, stationsRes, tracksRes, rollingStockDb] = await Promise.all([
    fetch(dataUrl(`${dataDir}/lines.json`)),
    fetch(dataUrl(`${dataDir}/stations.json`)),
    fetch(dataUrl(`${dataDir}/tracks.json`)),
    loadRollingStock(dataUrl(`${dataDir}/rolling-stock.json`)),
  ]);

  lines = await linesRes.json();
  const stations: StationMetadata[] = await stationsRes.json();
  const tracks: TrackItem[] = await tracksRes.json();
  let laddersData: Record<string, any> = {};
  let rerTracks: any[] = [];
  let shapesMap = new Map<string, any>();
  const stationRankings = null;

  const metroBounds = configBounds ?? boundsFromPolylines(tracks.map((track) => track.coordinates));
  let networkBounds = metroBounds;
  const mapMaxBounds = networkBounds ? expandBounds(networkBounds, 40) : undefined;
  if (mapMaxBounds) {
    try {
      map.setMaxBounds(mapMaxBounds);
    } catch {
      // Ignore in mocked maps
    }
  }

  console.log(
    `[app] Fast-boot loaded ${lines.length} lines, ${stations.length} stations, ${tracks.length} tracks`
  );

  // 2. Instantiate Simulation Engine (heavy schedule.json & shapes.bin hydrate in Phase 2 off-thread)
  engine = new BrowserSubwayEngine(cityConfig, createRealtimeAdapter(cityConfig));
  const demoRer = new URLSearchParams(window.location.search).get('demo-rer');
  const demoRerColors: Record<string, { colorHex: string; textColorHex: string }> = {
    A: { colorHex: '#E3051C', textColorHex: '#FFFFFF' },
    B: { colorHex: '#5291CE', textColorHex: '#FFFFFF' },
    C: { colorHex: '#FFCE00', textColorHex: '#25303B' },
    D: { colorHex: '#00814F', textColorHex: '#FFFFFF' },
    E: { colorHex: '#C04191', textColorHex: '#FFFFFF' },
  };
  const createDemoRerTrain = (line: string) => {
    const color = demoRerColors[line];
    const [shapeId, shape] = [...shapesMap.entries()][0] || [];
    if (!color || !shapeId || !shape) return null;
    const headDistance = Math.min(shape.length * 0.65, shape.length - 1);
    const coord = coordAtDistance(shape, headDistance);
    return {
      id: `demo-rer-${line}`,
      line,
      lineName: `RER ${line}`,
      colorHex: color.colorHex,
      textColorHex: color.textColorHex,
      pos: [coord[0], coord[1]] as [number, number],
      brg: 0,
      spd: 18,
      speedMps: 18,
      delay: 0,
      dest: `Démo RER ${line}`,
      next: 'Station de démonstration',
      conf: 'scheduled' as const,
      shapeId,
      currentDistM: headDistance,
      direction: 0 as const,
      atStop: false,
    };
  };
  (window as any).__engine = engine;
  let isRealtimeEnabled = false;

  // --- Mention légale MapLibre (LOT 1, point 2) -----------------------------
  // Le contrôle d'attribution est posé dans le bas-droite de la carte (créé
  // par maplibre.ts), il est le seul contenu de #map qui ne doit jamais être
  // recouvert, et sa hauteur mesurée varie (replié/déplié selon la largeur).
  // #map créant un contexte d'empilement (z-index: 1), aucun descendant ne
  // peut passer au-dessus du tiroir (z-index: 150) : la seule correction
  // possible est géométrique. On publie donc sa hauteur dans --attrib-h, que
  // .dock consomme en bas de viewport (cf. main.css).
  const attribEl = mapEl.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
  attribEl?.classList.remove('maplibregl-compact-show');
  let lastAttribH = -1;
  const publishAttributionHeight = () => {
    if (!attribEl) return;
    const h = Math.ceil(attribEl.getBoundingClientRect().height);
    if (h > 0 && h !== lastAttribH) {
      lastAttribH = h;
      document.documentElement.style.setProperty('--attrib-h', `${h}px`);
    }
  };
  publishAttributionHeight();
  map.on('load', publishAttributionHeight);
  map.on('idle', publishAttributionHeight);
  window.addEventListener('resize', publishAttributionHeight);
  if (attribEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(publishAttributionHeight).observe(attribEl);
  }

  const mapPadding = (): { top: number; right: number; bottom: number; left: number } => {
    const header = document.getElementById('topbar')?.getBoundingClientRect();
    const dockEl = document.getElementById('dock');
    const dockRect = dockEl && dockEl.offsetWidth > 0 ? dockEl.getBoundingClientRect() : null;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const sheetEl = isMobile
      ? (document.querySelector('[data-mobile-sheet]') as HTMLElement | null)
      : null;
    const sheetAttrH = Number(sheetEl?.dataset.sheetHeight || 0);
    const sheetRectH = sheetEl ? sheetEl.getBoundingClientRect().height : 0;
    const mobileBottomH = Math.max(sheetAttrH, sheetRectH, dockRect?.height || 0);
    const top = isMobile ? 64 : (header?.height || 56) + 28;
    const right = isMobile ? 24 : 40;
    const bottom = isMobile
      ? Math.min(Math.round(window.innerHeight * 0.65), Math.round(mobileBottomH) + 24)
      : 40;
    const left = isMobile ? 24 : (dockRect?.width || 0) + 40;
    return { top, right, bottom, left };
  };

  let activeLineId: string | null = null;
  let activeDir: string = '0';
  let trackedTrain: TrainMarker | null = null;
  let nominalMetroCenter: [number, number] | null = null;
  let nominalMetroZoom: number = 12.5;
  let nominalMetroPitch: number = cityConfig.map.pitch ?? 30;
  let nominalMetroBearing: number = cityConfig.map.bearing ?? 0;
  let isRecenterVisible = false;

  const fitMetroNetwork = (duration = 750) => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      map.flyTo({
        center: cityConfig.map.center,
        zoom: Math.max(11.8, (cityConfig.map.zoom ?? 12.2) - 0.3),
        pitch: cityConfig.map.pitch ?? 30,
        bearing: cityConfig.map.bearing ?? 0,
        duration,
      });
      return;
    }
    const initialBounds = metroBounds || networkBounds;
    if (!initialBounds) return;
    map.fitBounds(initialBounds, {
      padding: mapPadding(),
      duration,
      maxZoom: 14,
      pitch: cityConfig.map.pitch ?? 30,
      bearing: cityConfig.map.bearing ?? 0,
    });
  };

  const updateRecenterState = () => {
    let label = "Recadrer sur l'ensemble du réseau de métro";
    let isContextActive = false;

    if (trackedTrain) {
      label = `Recentrer sur la rame ${trackedTrain.lineName} vers ${trackedTrain.dest}`;
      isContextActive = true;
    } else if (activeLineId) {
      const line = lines.find((l) => l.id === activeLineId);
      label = `Recadrer sur la ligne ${line ? line.short_name : activeLineId}`;
      isContextActive = true;
    }

    if (isContextActive) {
      isRecenterVisible = true;
      uiStore.patch({ recenterVisible: true, recenterLabel: label });
      return;
    }

    if (!nominalMetroCenter) {
      if (isRecenterVisible) {
        isRecenterVisible = false;
        uiStore.patch({ recenterVisible: false });
      }
      return;
    }

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentPitch = map.getPitch();
    const currentBearing = map.getBearing();

    const dLat = currentCenter.lat - nominalMetroCenter[1];
    const dLng =
      (currentCenter.lng - nominalMetroCenter[0]) * Math.cos((currentCenter.lat * Math.PI) / 180);
    const distDeg = Math.hypot(dLat, dLng);
    const dZoom = Math.abs(currentZoom - nominalMetroZoom);
    const dPitch = Math.abs(currentPitch - nominalMetroPitch);
    const dBearing = Math.abs(currentBearing - nominalMetroBearing);

    const exceedsAppearThreshold = distDeg > 0.0035 || dZoom > 0.35 || dPitch > 3 || dBearing > 3;
    const withinDisappearThreshold =
      distDeg < 0.003 && dZoom < 0.3 && dPitch < 2.5 && dBearing < 2.5;

    if (!isRecenterVisible && exceedsAppearThreshold) {
      isRecenterVisible = true;
      uiStore.patch({ recenterVisible: true, recenterLabel: label });
    } else if (isRecenterVisible && withinDisappearThreshold) {
      isRecenterVisible = false;
      uiStore.patch({ recenterVisible: false });
    } else if (isRecenterVisible) {
      uiStore.patch({ recenterLabel: label });
    }
  };

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fitMetroNetwork(450);
      setTimeout(() => {
        nominalMetroCenter = [map.getCenter().lng, map.getCenter().lat];
        nominalMetroZoom = map.getZoom();
        nominalMetroPitch = map.getPitch();
        nominalMetroBearing = map.getBearing();
        updateRecenterState();
      }, 500);
    }, 140);
  });

  map.on('move', () => {
    updateRecenterState();
  });

  // Option A: the low-zoom camera remains at 30°. Once the building extrusion
  // is visible, the allowed pitch opens progressively rather than jumping.
  const syncPitchPolicy = (animateCorrection = true) => {
    if (followCamera?.isFollowing()) return;
    const maxPitch = maxPitchForZoom(map.getZoom());
    map.setMaxPitch(maxPitch);
    if (map.getPitch() > maxPitch + 0.1) {
      map.easeTo({ pitch: maxPitch, duration: animateCorrection ? 600 : 0 });
    }
  };
  map.on('zoom', () => syncPitchPolicy(true));
  map.on('load', () => syncPitchPolicy(false));

  const hideTooltip = () => {
    tooltipEl.style.display = 'none';
    tooltipEl.innerHTML = '';
  };

  let latestRenderedTrains = new Map<string, TrainMarker>();
  let followCamera: FollowCamera | null = null;
  let edinburghHandle: any = null;
  let parisRideHandle: {
    setRoute: (k: string, s?: string, d?: string) => void;
    setView: (v: 'vault' | 'ride') => void;
    syncFromSimulation: (trains: TrainMarker[]) => void;
    dispose: () => void;
  } | null = null;
  let parisRideOpening = false;
  const isParisMetroLine = (lineName?: string | null) =>
    Boolean(lineName && !['A', 'B', 'C', 'D', 'E'].includes(lineName.toUpperCase()));

  const closeParisRideMode = () => {
    if (!parisRideHandle) return;
    parisRideHandle.dispose();
    parisRideHandle = null;
    const uiRoot = document.getElementById('ui-root');
    if (uiRoot) uiRoot.style.display = '';
    engine.setRenderContext({ suspended: document.hidden });
    if (latestRenderedTrains.size > 0) {
      deckOverlay.setTrains(Array.from(latestRenderedTrains.values()), true);
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      engine.setRenderContext({ suspended: document.hidden || Boolean(parisRideHandle) });
    });
  }

  const openParisRideMode = async (opts?: {
    initialLine?: string;
    initialDest?: string;
    initialStation?: string;
    initialTrainId?: string;
    initialView?: 'ride' | 'vault';
  }) => {
    if (cityConfig.id !== 'paris' || parisRideHandle || parisRideOpening) return;
    parisRideOpening = true;
    uiStore.patch({ parisRideLoading: true });
    try {
      const { mountParisRideView } = await import('./paris_ride_view');
      if (parisRideHandle) return;
      const uiRoot = document.getElementById('ui-root');
      if (uiRoot) uiRoot.style.display = 'none';
      engine.setRenderContext({ suspended: true });
      parisRideHandle = mountParisRideView(document.body, {
        ...opts,
        getStationDepartures: (stationName: string) => engine.getStationDepartures(stationName, 2),
        onExit: () => {
          closeParisRideMode();
        },
      });
      if (latestRenderedTrains.size > 0) {
        parisRideHandle.syncFromSimulation(Array.from(latestRenderedTrains.values()));
      }
    } finally {
      parisRideOpening = false;
      uiStore.patch({ parisRideLoading: false });
    }
  };

  const updateFollowHud = (train: TrainMarker | null) => {
    uiStore.patch({
      trackedTrain: train,
      isFollowing: Boolean(train && followCamera?.isFollowing()),
    });
  };

  const focusTrain = (train: TrainMarker) => {
    hideTooltip();
    trackedTrain = train;
    deckOverlay.setSelectedTrain(train.id);
    edinburghHandle?.startFollowTrain(train.id);
    if (!followCamera?.startFollow(train)) {
      map.flyTo({
        center: train.pos,
        zoom: 15.5,
        pitch: 0,
        bearing: train.brg,
        duration: 900,
      });
    }
    updateFollowHud(train);
    updateRecenterState();
  };

  const selectStation = (station: StationMetadata, zoom20 = false) => {
    hideTooltip();
    trackedTrain = null;
    followCamera?.stopFollow();
    deckOverlay.setSelectedTrain(null);
    edinburghHandle?.focusStation(station.name);
    const isMobileVp = typeof window !== 'undefined' && window.innerWidth < 768;
    const dockEl = !isMobileVp ? document.getElementById('dock') : null;
    const leftDockW = dockEl && dockEl.offsetWidth > 0 ? Math.round(dockEl.getBoundingClientRect().width) : 0;
    const mobileBottomPad = isMobileVp
      ? Math.min(Math.round(window.innerHeight * 0.48), 408)
      : 32;
    const targetZoom = zoom20
      ? isMobileVp
        ? 17.6
        : 18.8
      : Math.max(map.getZoom(), isMobileVp ? 17.0 : 18.0);
    map.flyTo({
      center: station.coordinates,
      zoom: targetZoom,
      pitch: zoom20 ? 54 : Math.max(map.getPitch(), 46),
      padding: isMobileVp
        ? { top: 72, bottom: mobileBottomPad, left: 16, right: 16 }
        : { top: 76, bottom: 36, left: leftDockW > 0 ? leftDockW + 32 : 24, right: 380 },
      duration: 850,
    });
    const departures = engine.getStationDepartures(station.name, 2);
    uiStore.setSelectedStation(station, departures);
    updateRecenterState();
  };

  const refreshSelectedStationDepartures = () => {
    const snap = uiStore.getSnapshot();
    if (snap.selectedStation) {
      uiStore.patch({
        stationDepartures: engine.getStationDepartures(snap.selectedStation.name, 2),
      });
    }
    if (snap.nearbyOpen && snap.nearbyStations.length > 0) {
      const nextDeps: Record<string, ReturnType<BrowserSubwayEngine['getStationDepartures']>> = {};
      for (const item of snap.nearbyStations) {
        nextDeps[item.station.name] = engine.getStationDepartures(item.station.name, 1);
      }
      uiStore.patch({ nearbyDepartures: nextDeps });
    }
  };

  const requestNearby = () => {
    hideTooltip();
    uiStore.patch({
      nearbyOpen: true,
      selectedStation: null,
      nearbyLoading: true,
      nearbyError: null,
    });

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      uiStore.patch({
        nearbyLoading: false,
        nearbyError:
          'La géolocalisation n’est pas disponible sur cet appareil. Utilisez la recherche (⌘K).',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const results = findNearbyStations(stations, coords, 4);
        const deps: Record<string, ReturnType<BrowserSubwayEngine['getStationDepartures']>> = {};
        for (const item of results) {
          deps[item.station.name] = engine.getStationDepartures(item.station.name, 1);
        }
        uiStore.patch({
          nearbyLoading: false,
          nearbyError: null,
          nearbyStations: results,
          nearbyDepartures: deps,
        });
        if (results[0]) {
          map.flyTo({
            center: results[0].station.coordinates,
            zoom: 15.5,
            duration: 900,
          });
        }
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Autorisez l’accès à votre position pour afficher les stations les plus proches.'
            : 'Impossible de déterminer votre position actuelle. Réessayez ou recherchez une station.';
        uiStore.patch({
          nearbyLoading: false,
          nearbyError: message,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  // 4. Initialize deck.gl overlay with Station & Train Handlers
  deckOverlay = new SubwayDeckOverlay({
    onStationHover: (info) => {
      if (info.object && Number.isFinite(info.x) && Number.isFinite(info.y)) {
        const st = (info.object.station || info.object) as StationMetadata;
        if (!st || !st.name) {
          hideTooltip();
          return;
        }
        const servedLines = (st.lines || [])
          .map((lid) => lines.find((l) => l.id === lid || l.short_name === lid))
          .filter((l): l is LineMetadata => !!l);

        const badgesHtml = servedLines
          .map(
            (l) =>
              lineBadge(
                {
                  line_id: l.id,
                  short_name: l.short_name,
                  route_color: l.color,
                  route_text_color: l.text_color,
                },
                { interactive: false }
              ).outerHTML
          )
          .join('');
        tooltipEl.innerHTML = `
          <div class="tooltip-name">${escapeHtml(st.name)}</div>
          <div class="tooltip-lines">${badgesHtml}</div>
        `;
        tooltipEl.style.left = `${info.x}px`;
        tooltipEl.style.top = `${info.y}px`;
        tooltipEl.style.display = 'block';
      } else {
        hideTooltip();
      }
    },
    onStationClick: (station) => {
      selectStation(station, false);
    },
    onTrainHover: (info) => {
      if (info.object && Number.isFinite(info.x) && Number.isFinite(info.y)) {
        const tr = (info.object.train || info.object) as TrainMarker;
        if (!tr || !tr.lineName || !tr.dest) {
          hideTooltip();
          return;
        }
        const delaySeconds = Math.round(tr.delay || 0);
        let delayText = '<span style="color: #4ade80;">À l\'heure</span>';
        if (Math.abs(delaySeconds) >= 15) {
          const sign = delaySeconds > 0 ? '+' : '-';
          const abs = Math.abs(delaySeconds);
          if (abs < 60) {
            delayText = `<span style="color: #facc15;">${sign}${abs} s</span>`;
          } else {
            const m = Math.floor(abs / 60);
            const s = abs % 60;
            delayText = `<span style="color: #facc15;">${sign}${m} min ${s > 0 ? s + 's' : ''}</span>`;
          }
        }

        let confBadge = '';
        if (tr.conf === 'measured' || tr.conf === 'bracketed') {
          confBadge = '<span class="badge-conf badge-conf--measured">Direct</span>';
        } else {
          confBadge = '<span class="badge-conf badge-conf--scheduled">Théorique</span>';
        }

        const trainBadge = lineBadge(
          {
            line_id: tr.line,
            short_name: tr.lineName,
            route_color: tr.colorHex,
            route_text_color: tr.textColorHex,
          },
          { interactive: false }
        ).outerHTML;

        const speedHtml =
          cityConfig.id === 'paris' && isParisMetroLine(tr.lineName)
            ? ''
            : `<span><strong>${Number(tr.spd || 0).toLocaleString('fr-FR')} km/h</strong></span>`;

        tooltipEl.innerHTML = `
          <div class="train-tooltip-header">
            ${trainBadge}
            <span class="train-tooltip-dest">${escapeHtml(tr.dest)}</span>
          </div>
          <div class="train-tooltip-body">
            <div>${escapeHtml(tr.next || '—')}</div>
            <div class="train-tooltip-meta">
              ${speedHtml}
              <span>${delayText}</span>
              ${confBadge}
            </div>
          </div>
        `;
        tooltipEl.style.left = `${info.x}px`;
        tooltipEl.style.top = `${info.y}px`;
        tooltipEl.style.display = 'block';
      } else {
        hideTooltip();
      }
    },
    onTrainClick: (train) => {
      focusTrain(train);
    },
    onLineSelect: (lineId) => selectLine(lineId, '0'),
    onBackgroundClick: () => {
      const hadSelectedStation = Boolean(uiStore.getSnapshot().selectedStation);
      const wasFollowingTrain = Boolean(trackedTrain && followCamera?.isFollowing());
      const hadSelection = Boolean(hadSelectedStation || activeLineId || trackedTrain || wasFollowingTrain);
      const wasZoomedIn = map.getZoom() > 13.2;
      hideTooltip();
      if (hadSelection) {
        uiStore.setSelectedStation(null);
        followCamera?.stopFollow();
        activeLineId = null;
        trackedTrain = null;
        deckOverlay.setSelectedLine(null);
        deckOverlay.setSelectedTrain(null);
        engine.setFocusedLine(null);
        router.setRoute(null, '0', cityConfig.slug);
        uiStore.patch({ activeLineId: null, activeDir: '0', isFollowing: false, trackedTrain: null });
        updateRecenterState();
        return;
      }
      if (!wasZoomedIn) return;
      fitMetroNetwork();
      updateRecenterState();
    },
  });

  // Global dismiss listeners for tooltips
  map.on('movestart', hideTooltip);
  map.on('zoomstart', hideTooltip);
  map.on('dragstart', hideTooltip);
  map.on('rotatestart', hideTooltip);
  map.on('pitchstart', hideTooltip);
  map.on('click', hideTooltip);
  mapEl.addEventListener('mouseleave', hideTooltip);
  mapEl.addEventListener('pointerleave', hideTooltip);
  window.addEventListener('blur', hideTooltip);

  // 5. Wire unified React + BoardUI shell and state store
  selectLine = (lineId: string | null, dir = '0') => {
    hideTooltip();
    activeLineId = lineId;
    activeDir = dir;
    trackedTrain = null;
    followCamera?.stopFollow();
    deckOverlay.setSelectedTrain(null);
    deckOverlay.setSelectedLine(lineId);
    engine.setFocusedLine(lineId);
    edinburghHandle?.selectLine(lineId);

    const line = lines.find((l) => l.id === lineId);
    router.setRoute(line ? line.short_name : null, dir, cityConfig.slug);
    uiStore.patch({
      activeLineId: lineId,
      activeDir: dir,
      isFollowing: false,
      trackedTrain: null,
    });

    if (lineId) {
      const lineStations = stations.filter((s) => s.lines.includes(lineId));
      if (lineStations.length > 0) {
        const lngs = lineStations.map((s) => s.coordinates[0]);
        const lats = lineStations.map((s) => s.coordinates[1]);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ];
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (activeLineId !== lineId) return;
            const cam = map.cameraForBounds(bounds, { padding: mapPadding(), maxZoom: 14.5 });
            if (cam && typeof cam.zoom === 'number') {
              map.flyTo({
                center: cam.center,
                zoom: Math.max(10.8, Math.min(14.5, cam.zoom)),
                bearing: cam.bearing ?? map.getBearing(),
                pitch: map.getPitch(),
                duration: 750,
              });
            } else {
              map.fitBounds(bounds, { padding: mapPadding(), maxZoom: 14.5, duration: 750 });
            }
          });
        });
      }
    }
    updateRecenterState();
  };

  followCamera = new FollowCamera({
    map,
    getTrain: (tripId) => latestRenderedTrains.get(tripId),
    setFollowElevation: (lineId, offset) => deckOverlay.setFollowElevation(lineId, offset),
    dock: document.getElementById('dock') || document.body,
    onStop: () => {
      deckOverlay.setSelectedTrain(null);
      trackedTrain = null;
      updateFollowHud(null);
      updateRecenterState();
    },
  });

  function setBuildingsEnabled(active: boolean) {
    setBuildingsVisible(map, active);
    deckOverlay.setBuildingsVisible(active);
    uiStore.patch({ buildingsVisible: active });
  }

  function setXrayEnabled(active: boolean) {
    deckOverlay.setXrayMode(active);
    uiStore.patch({ xrayMode: active });
  }

  const THEME_PREF_KEY = 'paris-subway-theme-pref';
  const systemColorSchemeQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  function resolveThemeFromPref(pref: ThemePreference): 'dark' | 'light' {
    if (pref === 'light' || pref === 'dark') return pref;
    return systemColorSchemeQuery?.matches ? 'dark' : 'light';
  }

  function applyResolvedTheme(theme: 'dark' | 'light') {
    document.documentElement.dataset.themeSwitching = 'true';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    uiStore.patch({ theme });
    applyMapTheme(map, theme);
    applyFaienceBasemap(map, theme === 'dark' ? 'nuit' : 'jour');
    const xray = uiStore.getSnapshot().xrayMode;
    const baseMix = computeSubsurfaceMix(map.getPitch(), Boolean(followCamera?.isFollowing()));
    setSubsurfaceMapMode(map, xray ? Math.max(baseMix, 1) : baseMix, theme, true, xray);
    deckOverlay.setTheme(theme);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        delete document.documentElement.dataset.themeSwitching;
      });
    });
  }

  function applyThemePreference(pref: ThemePreference) {
    try {
      localStorage.setItem(THEME_PREF_KEY, pref);
    } catch {
      // Ignore storage failures
    }
    uiStore.patch({ themePreference: pref });
    applyResolvedTheme(resolveThemeFromPref(pref));
  }

  systemColorSchemeQuery?.addEventListener?.('change', () => {
    if (uiStore.getSnapshot().themePreference === 'system') {
      applyResolvedTheme(resolveThemeFromPref('system'));
    }
  });

  function resolveUserRoutePoint(): Promise<RoutePoint> {
    const liveFix = uiStore.getSnapshot().userLocation;
    if (liveFix && Date.now() - liveFix.updatedAt < 120_000) {
      return Promise.resolve({
        label: 'Ma position',
        subtitle: 'Position GPS en direct',
        coordinates: [liveFix.lng, liveFix.lat],
        kind: 'user',
      });
    }
    const displayCity = cityConfig.displayName
      ? cityConfig.displayName.charAt(0).toUpperCase() + cityConfig.displayName.slice(1)
      : 'Paris';
    const fallbackPoint: RoutePoint = {
      label: `Centre (${displayCity})`,
      subtitle: 'Position par défaut (géolocalisation indisponible)',
      coordinates: cityConfig.map.center,
      kind: 'place',
    };
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(fallbackPoint);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix = {
            lng: pos.coords.longitude,
            lat: pos.coords.latitude,
            accuracyM: pos.coords.accuracy || 25,
            headingDeg: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
            updatedAt: Date.now(),
          };
          uiStore.patch({ userLocation: fix });
          deckOverlay.setUserLocation(fix);
          resolve({
            label: 'Ma position',
            subtitle: 'Position actuelle GPS',
            coordinates: [fix.lng, fix.lat],
            kind: 'user',
          });
        },
        () => resolve(fallbackPoint),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
    });
  }

  let gpsWatchId: number | null = null;
  let gpsFollowCamera = false;

  map.on('dragstart', () => {
    gpsFollowCamera = false;
  });

  function toggleGpsFollow() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
      gpsFollowCamera = false;
      uiStore.patch({ gpsWatchActive: false });
      return;
    }
    gpsFollowCamera = true;
    uiStore.patch({ gpsWatchActive: true });
    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracyM: pos.coords.accuracy || 20,
          headingDeg:
            pos.coords.heading !== null && Number.isFinite(pos.coords.heading)
              ? pos.coords.heading
              : null,
          updatedAt: Date.now(),
        };
        if (fix.accuracyM > 350 && uiStore.getSnapshot().userLocation) return;
        uiStore.patch({ userLocation: fix });
        deckOverlay.setUserLocation(fix);
        if (gpsFollowCamera) {
          map.easeTo({
            center: [fix.lng, fix.lat],
            zoom: Math.max(map.getZoom(), 15.8),
            duration: 650,
          });
        }
      },
      () => {
        if (gpsWatchId !== null) {
          navigator.geolocation.clearWatch(gpsWatchId);
          gpsWatchId = null;
        }
        gpsFollowCamera = false;
        uiStore.patch({ gpsWatchActive: false });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  function fitMapToItinerary(itinerary: TransitItinerary) {
    const pts: Coordinate[] = [itinerary.origin.coordinates, itinerary.destination.coordinates];
    for (const leg of itinerary.legs) {
      pts.push(leg.fromCoords, leg.toCoords);
      if (leg.path) pts.push(...leg.path);
    }
    const bounds = boundsFromPolylines([pts]);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: mapPadding(),
        maxZoom: 15.8,
        duration: 900,
      });
    }
  }

  function runItineraryComputation(origin: RoutePoint | null, destination: RoutePoint | null) {
    uiStore.patch({
      routeOrigin: origin,
      routeDestination: destination,
      routeError: null,
    });
    if (!origin || !destination) {
      uiStore.patch({
        routeLoading: false,
        routeCandidates: [],
        activeItineraryIndex: 0,
      });
      deckOverlay.setActiveItinerary(null);
      return;
    }

    const candidates = computeTransitItineraries(origin, destination, {
      stations,
      lines,
      ladders: laddersData,
      trafficByLine: uiStore.getSnapshot().trafficByLine,
      getNextDepartures: (stationName) => engine.getStationDepartures(stationName, 2),
    });
    if (candidates.length === 0) {
      uiStore.patch({
        routeLoading: false,
        routeCandidates: [],
        activeItineraryIndex: 0,
        routeError: 'Aucun itinéraire trouvé à proximité sur le réseau.',
      });
      deckOverlay.setActiveItinerary(null);
      return;
    }

    uiStore.patch({
      routeLoading: false,
      routeError: null,
      routeCandidates: candidates,
      activeItineraryIndex: 0,
    });
    deckOverlay.setActiveItinerary(candidates[0]);
    fitMapToItinerary(candidates[0]);
  }

  let routeOriginRequestSeq = 0;
  async function openRoutePlannerWith(opts?: {
    origin?: RoutePoint | null;
    destination?: RoutePoint | null;
  }) {
    hideTooltip();
    uiStore.setRoutePlannerOpen(true);

    const snap = uiStore.getSnapshot();
    const hasExplicitOrigin = opts !== undefined && 'origin' in opts;
    const hasExplicitDest = opts !== undefined && 'destination' in opts;
    const nextDest = hasExplicitDest ? (opts?.destination ?? null) : snap.routeDestination;

    if (hasExplicitOrigin && opts?.origin) {
      runItineraryComputation(opts.origin, nextDest);
      return;
    }

    const shouldResolveUser = (hasExplicitOrigin && opts?.origin === null) || !snap.routeOrigin;
    if (!shouldResolveUser && snap.routeOrigin) {
      runItineraryComputation(snap.routeOrigin, nextDest);
      return;
    }

    const seq = ++routeOriginRequestSeq;
    uiStore.patch({
      routeDestination: nextDest,
      routeLoading: true,
      routeError: null,
    });
    const resolvedOrigin = await resolveUserRoutePoint();
    if (seq !== routeOriginRequestSeq) return;
    runItineraryComputation(resolvedOrigin, nextDest);
  }

  const syncPitchButton = () => {
    uiStore.patch({ pitch3D: map.getPitch() > 8 });
  };
  map.on('pitch', syncPitchButton);
  syncPitchButton();

  const syncBearing = () => {
    uiStore.patch({ bearingDeg: map.getBearing() });
  };
  map.on('rotate', syncBearing);
  syncBearing();

  const initialPref = uiStore.getSnapshot().themePreference;
  const initialTheme: 'dark' | 'light' = resolveThemeFromPref(initialPref);
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.classList.toggle('dark', initialTheme === 'dark');

  const onStyleLoadFaience = () => {
    const snap = uiStore.getSnapshot();
    const activeTheme = snap.theme;
    applyFaienceBasemap(map, activeTheme === 'dark' ? 'nuit' : 'jour');
    const baseMix = computeSubsurfaceMix(map.getPitch(), Boolean(followCamera?.isFollowing()));
    setSubsurfaceMapMode(
      map,
      snap.xrayMode ? Math.max(baseMix, 1) : baseMix,
      activeTheme,
      true,
      snap.xrayMode
    );
  };
  if (map.isStyleLoaded()) onStyleLoadFaience();
  map.on('style.load', onStyleLoadFaience);

  const syncBuildingsState = () => {
    uiStore.patch({ buildingsVisible: areBuildingsVisible(map) });
  };
  if (map.isStyleLoaded()) syncBuildingsState();
  else map.once('style.load', syncBuildingsState);

  uiStore.patch({
    cityConfig,
    cities: CITIES.filter((c) => c.id === 'paris').map((c) => ({
      id: c.id,
      slug: c.slug,
      displayName: c.displayName,
    })),
    lines,
    stations,
    ladders: laddersData,
    rollingStockDb,
    stationRankings,
    serviceStatus: engine.getServiceStatus(),
    realtimeState: 'standby',
    realtimeEnabled: false,
    themePreference: initialPref,
    theme: initialTheme,
  });

  uiStore.setHandlers({
    onCitySelect: (cityId: string) => {
      router.setCity(cityId);
      window.location.href = `/${encodeURIComponent(cityId)}`;
    },
    onLineSelect: (lineId, dir = '0') => selectLine(lineId, dir),
    onLineDirChange: (lineId, dir) => {
      activeDir = dir;
      const line = lines.find((l) => l.id === lineId);
      router.setRoute(line ? line.short_name : null, dir, cityConfig.slug);
      uiStore.patch({ activeDir: dir });
    },
    onStationSelect: (station) => selectStation(station, uiStore.getSnapshot().expertMode),
    onStationZoom20: (station) => selectStation(station, true),
    onTrainFollow: (train) => focusTrain(train),
    onTrainFollowById: (tripId, lineId) => {
      const exact = latestRenderedTrains.get(tripId);
      if (exact) {
        focusTrain(exact);
        return;
      }
      const sameLine = [...latestRenderedTrains.values()].find((tr) => tr.line === lineId);
      if (sameLine) {
        focusTrain(sameLine);
        return;
      }
      selectLine(lineId, '0');
    },
    onStopFollow: () => followCamera?.stopFollow(),
    onToggleRealtime: () => {
      isRealtimeEnabled = !isRealtimeEnabled;
      if (isRealtimeEnabled) {
        engine.startRealtime();
        uiStore.patch({
          realtimeEnabled: true,
          realtimeState: { active: true, delays: {} },
        });
      } else {
        engine.stopRealtime();
        uiStore.patch({
          realtimeEnabled: false,
          realtimeState: 'standby',
        });
      }
    },
    onSetThemePreference: (pref) => {
      applyThemePreference(pref);
    },
    onTogglePitch: () => {
      const is3d = map.getPitch() > 8;
      const targetPitch = is3d ? 0 : Math.min(52, maxPitchForZoom(map.getZoom()));
      map.easeTo({ pitch: targetPitch, duration: 480 });
    },
    onToggleBuildings: () => {
      setBuildingsEnabled(!uiStore.getSnapshot().buildingsVisible);
    },
    onToggleXray: () => {
      setXrayEnabled(!uiStore.getSnapshot().xrayMode);
    },
    onFocusMapCamera: ({ center, zoom, pitch, bearing, highlightLineId }) => {
      followCamera?.stopFollow();
      if (highlightLineId !== undefined) {
        const lineObj = highlightLineId
          ? lines.find(
              (l) =>
                l.id === highlightLineId ||
                l.short_name.toLowerCase() === highlightLineId.toLowerCase()
            )
          : null;
        deckOverlay.setSelectedLine(lineObj ? lineObj.id : null);
        engine.setFocusedLine(lineObj ? lineObj.id : null);
        uiStore.patch({ activeLineId: lineObj ? lineObj.id : null });
      }
      map.flyTo({
        center,
        zoom,
        pitch: pitch ?? map.getPitch(),
        bearing: bearing ?? map.getBearing(),
        duration: 950,
      });
    },
    onZoomIn: () => map.zoomIn({ duration: 240 }),
    onZoomOut: () => map.zoomOut({ duration: 240 }),
    onResetNorth: () => map.easeTo({ bearing: 0, duration: 360 }),
    onRecenter: () => {
      followCamera?.stopFollow();
      if (trackedTrain) {
        map.flyTo({
          center: trackedTrain.pos,
          zoom: 15.5,
          pitch: 0,
          bearing: trackedTrain.brg,
          duration: 800,
        });
      } else if (activeLineId) {
        const lineStations = stations.filter((s) => s.lines.includes(activeLineId!));
        if (lineStations.length > 0) {
          const lngs = lineStations.map((s) => s.coordinates[0]);
          const lats = lineStations.map((s) => s.coordinates[1]);
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: mapPadding(), maxZoom: 14.5, duration: 800 }
          );
        }
      } else {
        selectLine(null, '0');
        fitMetroNetwork(800);
      }
      setTimeout(updateRecenterState, 850);
    },
    onOpenParisRide: (opts) => {
      void openParisRideMode(opts);
    },
    onRequestNearby: () => requestNearby(),
    onSelectPlace: (place: PlaceCandidate, routeFromUser = true) => {
      hideTooltip();
      map.flyTo({
        center: place.coordinates,
        zoom: 16.4,
        pitch: Math.max(45, map.getPitch()),
        duration: 850,
      });
      if (routeFromUser) {
        void openRoutePlannerWith({
          destination: {
            label: place.name,
            subtitle: place.subtitle || place.category,
            coordinates: place.coordinates,
            kind: 'place',
          },
        });
      }
    },
    onOpenRoutePlanner: (opts) => {
      void openRoutePlannerWith(opts);
    },
    onComputeItinerary: (origin, destination) => {
      runItineraryComputation(origin, destination);
    },
    onSelectItineraryIndex: (index) => {
      const cand = uiStore.getSnapshot().routeCandidates[index];
      if (!cand) return;
      uiStore.patch({ activeItineraryIndex: index });
      deckOverlay.setActiveItinerary(cand);
      fitMapToItinerary(cand);
    },
    onClearItinerary: () => {
      uiStore.patch({
        routeCandidates: [],
        activeItineraryIndex: 0,
        routeError: null,
        routeLoading: false,
      });
      deckOverlay.setActiveItinerary(null);
    },
    onToggleGpsFollow: () => toggleGpsFollow(),
    onEdinburghPreset: (preset: EdinburghPreset) => {
      edinburghHandle?.setCameraPreset(preset);
    },
    onEdinburghFollow: () => {
      edinburghHandle?.toggleFollowTrain();
    },
  });

  const uiRootEl = document.getElementById('ui-root');
  if (uiRootEl) {
    createRoot(uiRootEl).render(createElement(SubwayAppShell));
  }

  const loader = document.getElementById('app-loader');
  const hideLoader = () => loader?.classList.add('is-hidden');
  // Hide loader as soon as map style loads OR after 450 ms max so UI is immediately interactive
  if (map.loaded() || map.isStyleLoaded()) hideLoader();
  else {
    map.once('style.load', hideLoader);
    map.once('load', hideLoader);
    setTimeout(hideLoader, 450);
  }

  if (import.meta.env.DEV) {
    const lineLikes: LineLike[] = lines.map((l) => ({
      line_id: l.id,
      short_name: l.short_name,
      route_color: l.color,
      route_text_color: l.text_color,
    }));
    auditLineContrast(lineLikes);
  }

  // 7. Route & deep-link resolution for initial line, station, or shared itinerary
  const normalizeLookup = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[-–—’']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const findStationByName = (rawName: string) => {
    const needle = normalizeLookup(rawName);
    if (!needle) return undefined;
    return (
      stations.find((s) => normalizeLookup(s.name) === needle) ??
      stations.find((s) => normalizeLookup(s.name).includes(needle))
    );
  };

  const parseEndpointParam = (raw: string | null): RoutePoint | null => {
    if (!raw) return null;
    const atIdx = raw.lastIndexOf('@');
    if (atIdx > 0) {
      const label = raw.slice(0, atIdx).trim();
      const coordsPart = raw.slice(atIdx + 1).split(',');
      const lat = Number(coordsPart[0]);
      const lng = Number(coordsPart[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { label: label || 'Point partagé', coordinates: [lng, lat], kind: 'place' };
      }
    }
    const matchedStation = findStationByName(raw);
    if (matchedStation) {
      return {
        label: matchedStation.name,
        subtitle: 'Station',
        coordinates: matchedStation.coordinates,
        kind: 'station',
        station: matchedStation,
      };
    }
    return null;
  };

  const applyInitialRoute = () => {
    const initialRoute = router.getInitialRoute();
    if (initialRoute.lineShortName) {
      const line = lines.find(
        (l) => l.short_name.toLowerCase() === initialRoute.lineShortName?.toLowerCase()
      );
      if (line) {
        selectLine(line.id, initialRoute.dir || '0');
        uiStore.setLineDrawerOpen(true);
      }
    } else if (initialRoute.from && initialRoute.to) {
      const fromPt = parseEndpointParam(initialRoute.from);
      const toPt = parseEndpointParam(initialRoute.to);
      if (fromPt && toPt) {
        uiStore.setRoutePlannerOpen(true);
        runItineraryComputation(fromPt, toPt);
      }
    } else if (initialRoute.station) {
      const targetStation = findStationByName(initialRoute.station);
      if (targetStation) {
        selectStation(targetStation, true);
      }
    }
  };

  // Context menu (right-click) on map to quickly route from/to any point on the 3D map
  let ctxMenuEl: HTMLDivElement | null = null;
  const dismissCtxMenu = () => {
    ctxMenuEl?.remove();
    ctxMenuEl = null;
  };
  map.on('movestart', dismissCtxMenu);
  map.on('click', dismissCtxMenu);
  map.on('contextmenu', (ev) => {
    dismissCtxMenu();
    const lngLat: [number, number] = [ev.lngLat.lng, ev.lngLat.lat];
    const point: RoutePoint = {
      label: `Repère carte (${lngLat[1].toFixed(4)}, ${lngLat[0].toFixed(4)})`,
      subtitle: 'Point sélectionné sur la carte 3D',
      coordinates: lngLat,
      kind: 'place',
    };
    const menu = document.createElement('div');
    menu.className =
      'fixed z-50 flex flex-col gap-1 rounded-xl border border-border-button-default bg-background-primary-default/95 p-1.5 shadow-xl backdrop-blur-md';
    menu.style.left = `${Math.min(window.innerWidth - 180, Math.max(8, ev.point.x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 96, Math.max(8, ev.point.y))}px`;
    const mkBtn = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className =
        'cursor-pointer rounded-lg px-3 py-1.5 text-start text-body-2-medium text-text-primary hover:bg-background-secondary-hover';
      b.onclick = () => {
        dismissCtxMenu();
        onClick();
      };
      return b;
    };
    menu.appendChild(mkBtn('Partir d’ici (A)', () => void openRoutePlannerWith({ origin: point })));
    menu.appendChild(
      mkBtn('Aller ici (B)', () => void openRoutePlannerWith({ destination: point }))
    );
    document.body.appendChild(menu);
    ctxMenuEl = menu;
  });

  // PRIM disabled by default for now (explicit ?rt=1 only)
  const rtOverride = new URLSearchParams(window.location.search).get('rt');
  if (
    cityConfig.id === 'paris' &&
    cityConfig.realtime.provider === 'prim' &&
    !demoRer &&
    rtOverride === '1'
  ) {
    isRealtimeEnabled = true;
    engine.startRealtime();
    uiStore.patch({
      realtimeEnabled: true,
      realtimeState: { active: true, delays: {} },
    });
  }

  // Register offline PWA service worker in production
  if (!import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  // 8. Connect deck.gl to map
  const initOverlay = () => {
    fitMetroNetwork(0);
    nominalMetroCenter = [map.getCenter().lng, map.getCenter().lat];
    nominalMetroZoom = map.getZoom();
    nominalMetroPitch = map.getPitch();
    nominalMetroBearing = map.getBearing();
    updateRecenterState();

    map.addControl(deckOverlay.getOverlay() as any);
    deckOverlay.setCityId(cityConfig.id);
    deckOverlay.setBuildingsVisible(areBuildingsVisible(map));
    deckOverlay.setMap(map);
    deckOverlay.setData({
      lines,
      stations,
      tracks,
      lineLadders: laddersData,
      shapes: shapesMap,
      rollingStockDb,
    });
    if (rerTracks.length > 0) {
      deckOverlay.setRerData(rerTracks);
    }
    const initialDemoTrain = demoRer ? createDemoRerTrain(demoRer) : null;
    if (initialDemoTrain) {
      latestRenderedTrains = new Map([[initialDemoTrain.id, initialDemoTrain]]);
      deckOverlay.setTrains([initialDemoTrain]);
      uiStore.patch({
        trains: [initialDemoTrain],
        totalTrainCount: 1,
      });
    }
    deckOverlay.startTrackReveal(420);

    const syncOverlayView = () => {
      const b = map.getBounds();
      const zoom = map.getZoom();
      const center: [number, number] = [map.getCenter().lng, map.getCenter().lat];
      const boundsTuple: [[number, number], [number, number]] | null = b
        ? [
            [b.getWest(), b.getSouth()],
            [b.getEast(), b.getNorth()],
          ]
        : null;
      deckOverlay.setViewState(zoom, center, boundsTuple, map.getPitch());
      engine.setRenderContext({
        zoom,
        isFollowing: Boolean(followCamera?.isFollowing()),
      });
    };
    map.on('move', syncOverlayView);
    syncOverlayView();

    // Capture nominal city-wide framing synchronously after fitMetroNetwork(0), then apply any deep link
    nominalMetroCenter = [map.getCenter().lng, map.getCenter().lat];
    nominalMetroZoom = map.getZoom();
    nominalMetroPitch = map.getPitch();
    nominalMetroBearing = map.getBearing();
    updateRecenterState();

    // Handle initial route (?line=, ?from=&to=, ?station=) after map load so fitMetroNetwork(0) cannot cancel it
    setTimeout(() => applyInitialRoute(), 80);
  };

  let overlayInitialized = false;
  const ensureOverlayInitialized = () => {
    if (overlayInitialized) return;
    overlayInitialized = true;
    initOverlay();
  };

  if (map.loaded() || map.isStyleLoaded()) {
    ensureOverlayInitialized();
  } else {
    map.once('style.load', ensureOverlayInitialized);
    map.once('load', ensureOverlayInitialized);
    setTimeout(ensureOverlayInitialized, 1200);
  }

  // 9. Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideTooltip();
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'b' || e.key === 'B') {
      try {
        setBuildingsEnabled(!areBuildingsVisible(map));
      } catch (err) {
        console.warn('[map] Error toggling buildings:', err);
      }
    }
  });

  // Phase 2 (Non-blocking background hydration): fetch ladders, RER lines, shapes, and schedule.json
  // off the main thread via Web Worker, then start live simulation seamlessly.
  const startSimulationLoop = () => {
    let lastDomUpdateTime = 0;
    let lastDistanceDomUpdate = 0;
    let lastServiceStatusKey = '';
    engine.start({
      onTick: (trains, activeCount) => {
        if (parisRideHandle) return;
        const demoTrain = demoRer ? createDemoRerTrain(demoRer) : null;
        if (demoTrain) {
          trains = [demoTrain];
          activeCount = 1;
        }
        const serviceStatus = engine.getServiceStatus();
        const serviceStatusKey = `${serviceStatus.state}:${Math.floor(serviceStatus.secondsUntilFirst / 60)}`;
        const now = performance.now();

        if (now - lastDistanceDomUpdate >= 1000) {
          lastDistanceDomUpdate = now;
          uiStore.patch({
            totalTrainCount: activeCount,
            dailyKm: engine.getServiceDistanceKm(),
            ...(serviceStatusKey !== lastServiceStatusKey ? { serviceStatus } : {}),
          });
          lastServiceStatusKey = serviceStatusKey;
        }

        if (now - lastDomUpdateTime >= 1000) {
          lastDomUpdateTime = now;
          if (
            latestRenderedTrains.size === 0 ||
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ) {
            latestRenderedTrains.clear();
            for (const train of trains) {
              latestRenderedTrains.set(train.id, train);
            }
            deckOverlay.setTrains(trains, Boolean(followCamera?.isFollowing()));
          }
          uiStore.patch({ trains });
          refreshSelectedStationDepartures();
          if (followCamera?.isFollowing() && trackedTrain) {
            const freshTrain = latestRenderedTrains.get(trackedTrain.id) ?? trackedTrain;
            trackedTrain = freshTrain;
            updateFollowHud(freshTrain);
          }
        }
      },
      onRender: (trains) => {
        const demoTrain = demoRer ? createDemoRerTrain(demoRer) : null;
        if (demoTrain) {
          trains = [demoTrain];
        }
        latestRenderedTrains.clear();
        for (const train of trains) {
          latestRenderedTrains.set(train.id, train);
        }
        if (parisRideHandle) {
          parisRideHandle.syncFromSimulation(trains);
          return;
        }
        followCamera?.onSimulationFrame();
        deckOverlay.setTrains(trains, Boolean(followCamera?.isFollowing()));
        edinburghHandle?.updateSimulationTrains(trains);
      },
      onPrimStatus: (status) => {
        const nextTraffic =
          status && typeof status === 'object' && 'trafficByLine' in status && status.trafficByLine
            ? status.trafficByLine
            : engine.getRealtimeAdapter()?.getTrafficByLine?.();
        uiStore.patch({
          ...(nextTraffic ? { trafficByLine: nextTraffic } : {}),
          ...(isRealtimeEnabled ? { realtimeState: status } : {}),
        });
      },
      onRealtimeStatus: (status) => {
        const nextTraffic =
          status && typeof status === 'object' && 'trafficByLine' in status && status.trafficByLine
            ? status.trafficByLine
            : engine.getRealtimeAdapter()?.getTrafficByLine?.();
        uiStore.patch({
          ...(nextTraffic ? { trafficByLine: nextTraffic } : {}),
          ...(isRealtimeEnabled ? { realtimeState: status } : {}),
        });
      },
    });
  };

  void (async () => {
    // Load line_ladders.json & rer_lines.json in parallel with shapes + schedule worker
    const laddersPromise = fetch(dataUrl(`${dataDir}/line_ladders.json`))
      .then((r) => (r.ok ? r.json() : {}))
      .then((ld) => {
        laddersData = ld;
        uiStore.patch({ ladders: ld });
        deckOverlay.setLineLadders(ld);
      })
      .catch(() => {});

    const rerLinesPromise = rerLinesPath
      ? fetch(dataUrl(rerLinesPath))
          .then((r) => (r.ok ? r.json() : []))
          .then((rt) => {
            rerTracks = rt;
            deckOverlay.setRerData(rt);
            networkBounds = boundsFromPolylines([
              ...tracks.map((track) => track.coordinates),
              ...rt.map((track: any) => track.coordinates as Coordinate[]),
            ]);
            if (networkBounds) {
              try {
                map.setMaxBounds(expandBounds(networkBounds));
              } catch {
                // Ignore in mocked maps
              }
            }
          })
          .catch(() => {})
      : Promise.resolve();

    const shapesAndEnginePromise = loadShapes(dataUrl(`${dataDir}/shapes.bin`))
      .then(async (loadedShapes) => {
        shapesMap = loadedShapes;
        deckOverlay.setShapes(loadedShapes);
        await engine.initialize(lines, loadedShapes);
        uiStore.patch({ serviceStatus: engine.getServiceStatus() });
        refreshSelectedStationDepartures();
        startSimulationLoop();
      })
      .catch((err) => {
        console.error('[app] Background simulation hydration failed:', err);
      });

    await Promise.all([laddersPromise, rerLinesPromise, shapesAndEnginePromise]);
  })();

  // 11. Edinburgh 3D View (City 3D + Regional Scotland Landscape + Trains)
  if (cityConfig.id === 'edinburgh') {
    const { initEdinburghThreeView } = await import('./edinburgh_three_view');
    const threeContainer = document.createElement('div');
    threeContainer.id = 'edinburgh-three-container';
    threeContainer.style.position = 'absolute';
    threeContainer.style.inset = '0';
    threeContainer.style.zIndex = '2'; // Above map (z-index: 1), below UI
    threeContainer.style.width = '100%';
    threeContainer.style.height = '100%';
    document.getElementById('app')?.appendChild(threeContainer);

    edinburghHandle = initEdinburghThreeView(threeContainer, {
      onTrainClick: (trainId, lineId) => {
        const train = latestRenderedTrains.get(trainId);
        if (train) {
          focusTrain(train);
        } else {
          selectLine(lineId, '0');
        }
      },
      onStationClick: (stationName) => {
        const st = stations.find((s) => s.name === stationName);
        if (st) {
          selectStation(st, false);
        }
      },
    });
  }
}

bootstrap().catch((err) => {
  console.error('[app] Bootstrap error:', err);
});
