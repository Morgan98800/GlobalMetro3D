import { createMap } from './map/maplibre';
import { SubwayDeckOverlay, TrackItem } from './map/deck_overlay';
import { SubwayDock } from './ui/dock';
import { SubwaySearchBar } from './ui/search_bar';
import { BrowserSubwayEngine } from './sim/browser_engine';
import { SubwayRouter } from './state/router';
import { loadShapesBin } from './sim/shapes';
import { loadRollingStock } from './sim/rolling_stock';
import type { TrainMarker } from './map/trains_layer';
import type { LineMetadata, StationMetadata } from '@paris-subway/shared';
import { PARIS_CENTER, DEFAULT_PITCH, DEFAULT_BEARING, DEFAULT_ZOOM } from '@paris-subway/shared';
import { PARIS_LANDMARKS_GLTF } from './map/landmarks_layer';

// API Key for IDFM PRIM SIRI-Lite feed (injected via Vite env or empty)
const PRIM_API_KEY = import.meta.env.VITE_PRIM_API_KEY || '';

async function bootstrap() {
  console.log('[app] Initializing Paris Subway 3D...');

  // 1. Fetch metadata in parallel (tracks.json replaces 9.4MB control_network.geojson)
  const [linesRes, stationsRes, tracksRes, laddersRes, rerRes, shapesMap, rollingStockDb] = await Promise.all([
    fetch('/data/lines.json'),
    fetch('/data/stations.json'),
    fetch('/data/tracks.json'),
    fetch('/data/line_ladders.json'),
    fetch('/data/rer_lines.json'),
    loadShapesBin('/data/shapes.bin'),
    loadRollingStock('/data/rolling-stock.json')
  ]);

  const lines: LineMetadata[] = await linesRes.json();
  const stations: StationMetadata[] = await stationsRes.json();
  const tracks: TrackItem[] = await tracksRes.json();
  const laddersData = await laddersRes.json();
  const rerLines = await rerRes.json();

  console.log(
    `[app] Loaded ${lines.length} lines, ${stations.length} stations, ${tracks.length} tracks, ${rerLines.length} RER segments`
  );

  // DOM Elements
  const statsEl = document.getElementById('network-stats');
  if (statsEl) {
    statsEl.textContent = `${lines.length} lignes · ${stations.length} stations`;
  }
  const trainsStatsEl = document.getElementById('trains-stats');
  const rtToggleBtn = (document.getElementById('rt-toggle-btn') || document.getElementById('rt-badge')) as HTMLButtonElement | HTMLElement | null;
  const rtBadgeTextEl = document.getElementById('rt-badge-text');
  const mapEl = document.getElementById('map')!;
  const tooltipEl = document.getElementById('tooltip')!;
  const studioNavBar = document.getElementById('studio-nav-bar')!;

  // 2. Initialize MapLibre
  const map = createMap('map');
  (window as any).__map = map;
  (window as any).map = map;

  // 4. Initialize deck.gl overlay with Station & Train Handlers
  const deckOverlay = new SubwayDeckOverlay({
    onStationHover: (info) => {
      if (info.object && info.x && info.y) {
        const st = info.object as StationMetadata;
        const servedLines = st.lines
          .map(lid => lines.find(l => l.id === lid))
          .filter((l): l is LineMetadata => !!l);

        const badgesHtml = servedLines
          .map(
            l =>
              `<span class="pill-mini" style="background-color: ${l.color}; color: ${l.text_color};">${l.short_name}</span>`
          )
          .join('');

        tooltipEl.innerHTML = `
          <div class="tooltip-name">${st.name}</div>
          <div class="tooltip-lines">${badgesHtml}</div>
        `;
        tooltipEl.style.left = `${info.x}px`;
        tooltipEl.style.top = `${info.y}px`;
        tooltipEl.style.display = 'block';
      } else {
        tooltipEl.style.display = 'none';
      }
    },
    onStationClick: (station) => {
      map.flyTo({
        center: station.coordinates,
        zoom: Math.max(map.getZoom(), 15),
        duration: 900
      });
    },
    onTrainHover: (info) => {
      if (info.object && info.x && info.y) {
        const tr = info.object as TrainMarker;
        const delayText =
          tr.delay === 0
            ? '<span style="color: #4ade80;">À l\'heure</span>'
            : tr.delay > 0
            ? `<span style="color: #facc15;">+${Math.round(tr.delay / 60)} min</span>`
            : `<span style="color: #60a5fa;">-${Math.round(Math.abs(tr.delay) / 60)} min</span>`;

        const confBadge =
          tr.conf === 'rt'
            ? '<span class="badge-rt">PRIM SIRI-Lite</span>'
            : '<span class="badge-sched">Théorique GTFS</span>';

        tooltipEl.innerHTML = `
          <div class="train-tooltip-header">
            <span class="train-tooltip-line" style="background-color: ${tr.colorHex}; color: ${tr.textColorHex};">
              ${tr.lineName}
            </span>
            <span class="train-tooltip-dest">${tr.dest}</span>
          </div>
          <div class="train-tooltip-body">
            <div>Prochain arrêt : <strong>${tr.next}</strong></div>
            <div class="train-tooltip-meta">
              <span>Vitesse : <strong>${tr.spd} km/h</strong></span>
              <span>Retard : ${delayText}</span>
              ${confBadge}
            </div>
          </div>
        `;
        tooltipEl.style.left = `${info.x}px`;
        tooltipEl.style.top = `${info.y}px`;
        tooltipEl.style.display = 'block';
      } else {
        tooltipEl.style.display = 'none';
      }
    },
    onTrainClick: (train) => {
      map.flyTo({
        center: train.pos,
        zoom: Math.max(map.getZoom(), 15),
        pitch: 55,
        bearing: train.brg,
        duration: 1000
      });
    }
  });

  // 5. Initialize Dock ("Le Quai" Niveau 2 with Station Ladder)
  const dock = new SubwayDock({
    onLineSelect: (lineId, dir = '0') => {
      deckOverlay.setSelectedLine(lineId);
      engine.setFocusedLine(lineId);

      const line = lines.find(l => l.id === lineId);
      router.setRoute(line ? line.short_name : null, dir);

      if (lineId) {
        const lineStations = stations.filter(s => s.lines.includes(lineId));
        if (lineStations.length > 0) {
          const lngs = lineStations.map(s => s.coordinates[0]);
          const lats = lineStations.map(s => s.coordinates[1]);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);

          map.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: { top: 80, bottom: 80, left: 360, right: 80 }, maxZoom: 13.5, duration: 900 }
          );
        }
      }
    },
    onStationClick: (station) => {
      map.flyTo({
        center: station.coordinates,
        zoom: 15.5,
        duration: 900
      });
    },
    onTrainClick: (train) => {
      map.flyTo({
        center: train.pos,
        zoom: 15.5,
        pitch: 55,
        bearing: train.brg,
        duration: 900
      });
    }
  });

  dock.setData(lines, stations, laddersData);

  // 6. Initialize Search Bar Component (Instant Station Autocomplete)
  new SubwaySearchBar({
    containerId: 'search-container',
    stations,
    lines,
    onStationSelect: (station) => {
      if (station.lines.length > 0) {
        dock.selectLine(station.lines[0]);
      }
      map.flyTo({
        center: station.coordinates,
        zoom: 16,
        pitch: 45,
        duration: 900
      });
    }
  });

  // 7. Router initialization
  const router = new SubwayRouter(({ lineShortName, dir }) => {
    if (lineShortName) {
      const line = lines.find(l => l.short_name.toLowerCase() === lineShortName.toLowerCase());
      if (line) {
        dock.selectLine(line.id, dir || '0', false);
        deckOverlay.setSelectedLine(line.id);
        engine.setFocusedLine(line.id);
      }
    } else {
      dock.selectLine(null, '0', false);
      deckOverlay.setSelectedLine(null);
      engine.setFocusedLine(null);
    }
  });

  // 8. Connect deck.gl to map
  map.on('load', () => {
    map.addControl(deckOverlay.getOverlay() as any);
    deckOverlay.setData({ lines, stations, tracks, shapes: shapesMap, rollingStockDb });

    const syncOverlayView = () => {
      const b = map.getBounds();
      const boundsTuple: [[number, number], [number, number]] | null = b
        ? [
            [b.getWest(), b.getSouth()],
            [b.getEast(), b.getNorth()]
          ]
        : null;
      deckOverlay.setViewState(map.getZoom(), [map.getCenter().lng, map.getCenter().lat], boundsTuple);
    };
    map.on('move', syncOverlayView);
    syncOverlayView();

    // Handle initial route
    const initialRoute = router.getInitialRoute();
    if (initialRoute.lineShortName) {
      const line = lines.find(l => l.short_name.toLowerCase() === initialRoute.lineShortName?.toLowerCase());
      if (line) {
        dock.selectLine(line.id, initialRoute.dir || '0', true);
      }
    }
  });

  // 9. Camera Controls & Landmark Navigator
  const btnPitch = document.getElementById('btn-pitch')!;
  let is3D = true;
  btnPitch.addEventListener('click', () => {
    is3D = !is3D;
    map.easeTo({
      pitch: is3D ? DEFAULT_PITCH : 0,
      bearing: is3D ? DEFAULT_BEARING : 0,
      duration: 800
    });
    btnPitch.textContent = is3D ? '3D' : '2D';
  });

  const btnRecenter = document.getElementById('btn-recenter')!;
  btnRecenter.addEventListener('click', () => {
    dock.selectLine(null);
    deckOverlay.setSelectedLine(null);
    engine.setFocusedLine(null);
    if (studioNavBar) {
      studioNavBar.querySelectorAll('.landmark-btn').forEach(b => b.classList.remove('active'));
    }
    map.flyTo({
      center: PARIS_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: is3D ? DEFAULT_PITCH : 0,
      bearing: is3D ? DEFAULT_BEARING : 0,
      duration: 1000
    });
  });

  // Landmark navigation bar listeners (MapLibre flyTo)
  if (studioNavBar) {
    studioNavBar.querySelectorAll('.landmark-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lmName = btn.getAttribute('data-landmark');
        studioNavBar.querySelectorAll('.landmark-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (lmName === 'Overview') {
          btnRecenter.click();
        } else if (lmName) {
          const lm = PARIS_LANDMARKS_GLTF.find(l => l.name.toLowerCase().includes(lmName.toLowerCase()));
          if (lm) {
            map.flyTo({
              center: lm.coords,
              zoom: 16,
              pitch: 55,
              bearing: (lm.yaw || 0) + 35,
              duration: 1200
            });
          }
        }
      });
    });
  }

  // 10. Initialize Autonomous Subway Simulation Engine (Realtime is disabled by default to save quota)
  const engine = new BrowserSubwayEngine(PRIM_API_KEY);
  await engine.initialize(lines);

  let isRealtimeEnabled = false;

  const updateRealtimeUI = (status?: any) => {
    if (!rtToggleBtn || !rtBadgeTextEl) return;

    if (!isRealtimeEnabled) {
      rtToggleBtn.className = 'rt-badge rt-btn standby';
      rtToggleBtn.setAttribute('aria-pressed', 'false');
      rtToggleBtn.title = "Cliquer pour activer le suivi en direct PRIM (économise le quota d'API)";
      rtBadgeTextEl.textContent = '⚡ Métro Temps Réel : OFF';
    } else {
      rtToggleBtn.setAttribute('aria-pressed', 'true');
      if (status && status.lastError) {
        rtToggleBtn.className = 'rt-badge rt-btn offline';
        rtToggleBtn.title = `${status.lastError} — Cliquer pour couper`;
        rtBadgeTextEl.textContent = 'PRIM : Hors Ligne';
      } else if (status && status.active) {
        rtToggleBtn.className = 'rt-badge rt-btn';
        const lineCount = Object.keys(status.delays || {}).length;
        rtToggleBtn.title = `Suivi en direct actif (${status.requestCount || 0} requêtes) — Cliquer pour couper (économiser quota)`;
        rtBadgeTextEl.textContent = lineCount > 0 ? `⚡ PRIM : ${lineCount} lignes sync` : '⚡ PRIM : Connexion...';
      } else {
        rtToggleBtn.className = 'rt-badge rt-btn syncing';
        rtToggleBtn.title = 'Connexion au flux SIRI-Lite en cours...';
        rtBadgeTextEl.textContent = '⚡ PRIM : Connexion...';
      }
    }
  };

  // Initial state: OFF
  updateRealtimeUI();

  if (rtToggleBtn) {
    rtToggleBtn.addEventListener('click', () => {
      isRealtimeEnabled = !isRealtimeEnabled;
      if (isRealtimeEnabled) {
        engine.startRealtime();
        updateRealtimeUI();
      } else {
        engine.stopRealtime();
        updateRealtimeUI();
      }
    });
  }

  let lastDomUpdateTime = 0;
  engine.start({
    onTick: (trains, activeCount) => {
      deckOverlay.setTrains(trains);
      const now = performance.now();
      if (now - lastDomUpdateTime >= 1000) {
        lastDomUpdateTime = now;
        dock.updateTrains(trains);
        if (trainsStatsEl) {
          trainsStatsEl.textContent = `${activeCount} rames en circulation`;
        }
      }
    },
    onPrimStatus: (status) => {
      if (isRealtimeEnabled) {
        updateRealtimeUI(status);
      }
    }
  });
}

bootstrap().catch(err => {
  console.error('[app] Bootstrap error:', err);
});
