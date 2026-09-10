import { createMap, maxPitchForZoom, MapBounds } from './map/maplibre';
import { SubwayDeckOverlay, TrackItem } from './map/deck_overlay';
import { SubwayDock } from './ui/dock';
import { SubwaySearchBar } from './ui/search_bar';
import { BrowserSubwayEngine } from './sim/browser_engine';
import { SubwayRouter } from './state/router';
import { loadShapes } from './sim/shapes_loader';
import { loadRollingStock } from './sim/rolling_stock';
import type { TrainMarker } from './map/trains_layer';
import type { LineMetadata, StationMetadata } from '@paris-subway/shared';
import { DEFAULT_PITCH, DEFAULT_BEARING } from '@paris-subway/shared';
import './ui/chrome.css';
import { TopBar } from './ui/header';
import { auditLineContrast, LineLike, lineBadge } from './ui/line_badge';

const DATA_REVISION = '20260910-07';
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
  return [[minLng, minLat], [maxLng, maxLat]];
}

function expandBounds(bounds: MapBounds, marginKm = 30): MapBounds {
  const centerLat = (bounds[0][1] + bounds[1][1]) / 2;
  const latMargin = marginKm / 111;
  const lngMargin = marginKm / (111 * Math.max(0.25, Math.cos(centerLat * Math.PI / 180)));
  return [[bounds[0][0] - lngMargin, bounds[0][1] - latMargin], [bounds[1][0] + lngMargin, bounds[1][1] + latMargin]];
}

function openNetworkRecords(rankings: any) {
  document.getElementById('records-modal')?.remove();
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
  const dayLabels: Record<string, string> = { weekday: 'Semaine', saturday: 'Samedi', sunday: 'Dimanche' };
  const sections = Object.entries(dayLabels).map(([day, label]) => {
    const rows = rankings.by_station?.[day] || [];
    const top = rows.slice(0, 5);
    const bottom = rows.slice(-5).reverse();
    const renderRows = (items: any[]) => items.map((row: any) => `<li><span>${escapeHtml(row.station_name)}</span><strong>${Number(row.counts?.[day] || 0).toLocaleString('fr-FR')}</strong></li>`).join('');
    return `<section><h3>${label}</h3><div class="records-columns"><div><h4>Plus desservies</h4><ol>${renderRows(top)}</ol></div><div><h4>Moins desservies</h4><ol>${renderRows(bottom)}</ol></div></div></section>`;
  }).join('');
  const modal = document.createElement('div');
  modal.id = 'records-modal';
  modal.className = 'records-modal';
  modal.innerHTML = `<div class="records-dialog" role="dialog" aria-modal="true" aria-labelledby="records-title"><button type="button" class="records-close" aria-label="Fermer">×</button><h2 id="records-title">Records du réseau</h2><p class="records-method">Desserte théorique GTFS : passages planifiés par station, tous sens et lignes confondus. Les données de fréquentation annuelle IDFM/RATP ne sont pas affichées car le jeu 2015 disponible ne fournit pas d’identifiant station fiable pour une jointure.</p>${sections}</div>`;
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
  modal.querySelector('.records-close')?.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function openMethodologyModal() {
  document.getElementById('method-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'method-modal';
  modal.className = 'records-modal';
  modal.innerHTML = `
    <div class="records-dialog method-dialog" role="dialog" aria-modal="true" aria-labelledby="method-title">
      <button type="button" class="records-close" aria-label="Fermer">×</button>
      <h2 id="method-title">Méthode & Données</h2>
      
      <div class="method-section">
        <h3>1. Pourquoi il n'y a pas de GPS dans le métro parisien</h3>
        <p>
          Il n'existe <strong>aucune position GPS des rames de métro en open data</strong>. En tunnel sous-terrain, la réception satellite est nulle, et la RATP/IDFM n'opère ni ne publie de flux <em>GTFS-RT VehiclePositions</em> pour le réseau ferré souterrain. Tout service prétendant afficher un « suivi satellite en direct » des rames est une tromperie.
        </p>
      </div>

      <div class="method-section">
        <h3>2. L'encadrement mathématique par les prédictions PRIM</h3>
        <p>
          La position affichée résulte d'un calcul cinématique continu rigoureux, articulé en 4 niveaux :
        </p>
        <ul class="method-list">
          <li><strong>Niveau 1 — Tracé 3D & GTFS théorique :</strong> Les rames parcourent les profils réels en plan et altitude selon les horaires théoriques de <em>schedule.json</em> (11 252 courses modélisées).</li>
          <li><strong>Niveau 2 — Rapprochement course par course :</strong> Un relais serveur interroge l'API PRIM SIRI-Lite <em>EstimatedTimetable</em> toutes les 3 minutes. Le module d'appariement global apparie chaque train en circulation avec la course théorique correspondante (taux de rapprochement mesuré de 95 à 100 % en heure de pointe).</li>
          <li><strong>Niveau 3 — Encadrement entre deux mesures :</strong> Plutôt que d'appliquer un retard uniforme, la position est encadrée entre le dernier passage réel mesuré en station N et le passage attendu en station N+1. L'écart d'incertitude passe de l'ordre de la minute à ~10–15 secondes.</li>
          <li><strong>Niveau 4 — Rames fantômes & Info Trafic :</strong> Une course supprimée disparaît de la carte par un fondu de 240 ms. Les interruptions de trafic signalées par l'API PRIM suspendent automatiquement les circulations sur les tronçons fermés.</li>
        </ul>
      </div>

      <div class="method-section">
        <h3>3. Les 4 niveaux de confiance visuels</h3>
        <ul class="method-badges-list">
          <li><span class="badge-conf badge-conf--measured">Arrêt mesuré</span> Rame à quai dont le passage est confirmé par l'API PRIM.</li>
          <li><span class="badge-conf badge-conf--bracketed">Encadré (2 mesures)</span> Rame en tunnel encadrée par deux horaires estimés réels.</li>
          <li><span class="badge-conf badge-conf--extrapolated">Extrapolé</span> Au-delà de la dernière observation, avec amortissement spatial.</li>
          <li><span class="badge-conf badge-conf--scheduled">Théorique GTFS</span> Circulation nominale basée sur la grille horaire officielle.</li>
        </ul>
      </div>

      <div class="method-section">
        <h3>4. Licences & Attributions</h3>
        <p>
          Données d'offre horaire et prédictions temps réel sous licence <strong>ODbL Île-de-France Mobilités / RATP</strong>.<br>
          Géométrie des voies et infrastructures sous licence <strong>OpenStreetMap contributors (ODbL)</strong>.
        </p>
      </div>

      <div class="method-section method-disclaimer">
        <p>
          <em>Mention légale :</em> Ce projet est une initiative indépendante et bénévole de cartographie et de visualisation. Il n'est ni affilié, ni approuvé, ni sponsorisé par la Régie Autonome des Transports Parisiens (RATP) ou Île-de-France Mobilités (IDFM).
        </p>
      <div class="method-section" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.2rem;">
        <span style="font-size: 0.74rem; color: var(--opale-dim);">Page statique indexable</span>
        <a href="/methode" target="_blank" rel="noopener" style="color: var(--laiton); font-size: 0.82rem; font-weight: 600; text-decoration: underline;">Consulter la page méthode complète →</a>
      </div>
    </div>
  `;
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
  modal.querySelector('.records-close')?.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

async function bootstrap() {
  console.log('[app] Initializing Métro de Paris 3D...');

  // 1. Fetch metadata in parallel (memoized loadShapes, deferred rer_lines)
  const [linesRes, stationsRes, tracksRes, laddersRes, rerTracksRes, rankingsRes, shapesMap, rollingStockDb] = await Promise.all([
    fetch(dataUrl('/data/lines.json')),
    fetch(dataUrl('/data/stations.json')),
    fetch(dataUrl('/data/tracks.json')),
    fetch(dataUrl('/data/line_ladders.json')),
    fetch(dataUrl('/data/rer_lines.json')),
    fetch(dataUrl('/data/station-rankings.json')),
    loadShapes(dataUrl('/data/shapes.bin')),
    loadRollingStock(dataUrl('/data/rolling-stock.json'))
  ]);

  const lines: LineMetadata[] = await linesRes.json();
  const stations: StationMetadata[] = await stationsRes.json();
  const tracks: TrackItem[] = await tracksRes.json();
  const laddersData = await laddersRes.json();
  const rerTracks = await rerTracksRes.json();
  const stationRankings = await rankingsRes.json();

  const metroBounds = boundsFromPolylines(tracks.map(track => track.coordinates));
  const networkBounds = boundsFromPolylines([
    ...tracks.map(track => track.coordinates),
    ...rerTracks.map((track: any) => track.coordinates as Coordinate[])
  ]);
  const mapMaxBounds = networkBounds ? expandBounds(networkBounds) : undefined;

  console.log(
    `[app] Loaded ${lines.length} lines, ${stations.length} stations, ${tracks.length} tracks`
  );

  // DOM Elements
  const mapEl = document.getElementById('map')!;
  const tooltipEl = document.getElementById('tooltip')!;
  // 2. Initialize Simulation Engine (pure theoretical by default, or reading server relay snapshot)
  const engine = new BrowserSubwayEngine();
  await engine.initialize(lines);
  (window as any).__engine = engine;
  let isRealtimeEnabled = false;

  // 3. Initialize MapLibre
  // Keep the default frame on the metro core; RER remains available without
  // shrinking Paris to a point in the wider Île-de-France envelope.
  const map = createMap('map', { initialBounds: metroBounds || networkBounds || undefined, maxBounds: mapMaxBounds });
  (window as any).__map = map;
  (window as any).map = map;

  const mapPadding = (): { top: number; right: number; bottom: number; left: number } => {
    const header = document.getElementById('topbar')?.getBoundingClientRect();
    const dock = document.getElementById('dock')?.getBoundingClientRect();
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const top = (header?.height || 0) + 40;
    const right = 40;
    const bottom = isMobile ? (dock?.height || 0) + 40 : 40;
    const left = isMobile ? 40 : (dock?.width || 0) + 40;
    return { top, right, bottom, left };
  };
  const btnRecenter = document.getElementById('btn-recenter')!;
  let isLineSelected = false;
  let hasUserMoved = false;

  const updateRecenterVisibility = () => {
    btnRecenter.classList.toggle('is-visible', isLineSelected || hasUserMoved);
  };

  const fitNetwork = (duration = 700) => {
    const initialBounds = metroBounds || networkBounds;
    if (!initialBounds) return;
    map.fitBounds(initialBounds, { padding: mapPadding(), duration, maxZoom: 14 });
  };
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitNetwork(450), 140);
  });

  map.on('dragstart', () => {
    hasUserMoved = true;
    updateRecenterVisibility();
  });
  map.on('zoomstart', (e) => {
    if (e.originalEvent) {
      hasUserMoved = true;
      updateRecenterVisibility();
    }
  });
  map.on('rotatestart', () => {
    hasUserMoved = true;
    updateRecenterVisibility();
  });
  map.on('pitchstart', () => {
    hasUserMoved = true;
    updateRecenterVisibility();
  });

  // Option A: the low-zoom camera remains at 30°. Once the building extrusion
  // is visible, the allowed pitch opens progressively rather than jumping.
  const syncPitchPolicy = (animateCorrection = true) => {
    const maxPitch = maxPitchForZoom(map.getZoom());
    map.setMaxPitch(maxPitch);
    if (map.getPitch() > maxPitch + 0.1) {
      map.easeTo({ pitch: maxPitch, duration: animateCorrection ? 600 : 0 });
    }
  };
  map.on('zoom', () => syncPitchPolicy(true));
  map.on('load', () => syncPitchPolicy(false));

  // 4. Initialize deck.gl overlay with Station & Train Handlers
  const deckOverlay = new SubwayDeckOverlay({
    onStationHover: (info) => {
      if (info.object && info.x && info.y) {
        const st = info.object as StationMetadata;
        const servedLines = st.lines
          .map(lid => lines.find(l => l.id === lid))
          .filter((l): l is LineMetadata => !!l);

        const badgesHtml = servedLines
          .map(l => lineBadge({
            line_id: l.id,
            short_name: l.short_name,
            route_color: l.color,
            route_text_color: l.text_color
          }, { interactive: false }).outerHTML)
          .join('');
        const dayKey = new Date().getDay() === 0 ? 'sunday' : new Date().getDay() === 6 ? 'saturday' : 'weekday';
        const serviceCount = st.service_counts?.[dayKey] ?? 0;
        const serviceRank = st.service_rank?.[dayKey];
        const serviceHtml = serviceCount > 0
          ? `<div class="tooltip-service" title="Passages planifiés dans le GTFS, tous sens et toutes lignes confondus."><span>Desserte théorique</span><strong>${serviceCount.toLocaleString('fr-FR')} passages/jour · rang ${serviceRank ?? '—'}</strong></div>`
          : '';

        tooltipEl.innerHTML = `
          <div class="tooltip-name">${st.name}</div>
          <div class="tooltip-lines">${badgesHtml}</div>
          ${serviceHtml}
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
        const delaySeconds = Math.round(tr.delay);
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
        if (tr.conf === 'measured') {
          confBadge = '<span class="badge-conf badge-conf--measured" title="Passage mesuré au quai par PRIM">Arrêt mesuré (PRIM)</span>';
        } else if (tr.conf === 'bracketed') {
          confBadge = '<span class="badge-conf badge-conf--bracketed" title="Encadré par deux passages mesurés">Encadré (2 mesures)</span>';
        } else if (tr.conf === 'extrapolated') {
          confBadge = '<span class="badge-conf badge-conf--extrapolated" title="Extrapolation au-delà de la dernière mesure">Extrapolé</span>';
        } else {
          confBadge = '<span class="badge-conf badge-conf--scheduled" title="Horaire théorique GTFS sans mesure directe">Théorique GTFS</span>';
        }

        const trainBadge = lineBadge({
          line_id: tr.line,
          short_name: tr.lineName,
          route_color: tr.colorHex,
          route_text_color: tr.textColorHex
        }, { interactive: false }).outerHTML;

        tooltipEl.innerHTML = `
          <div class="train-tooltip-header">
            ${trainBadge}
            <span class="train-tooltip-dest">${tr.dest}</span>
          </div>
          <div class="train-tooltip-body">
            <div>Prochain arrêt : <strong>${tr.next}</strong></div>
            <div class="train-tooltip-meta">
              <span>Vitesse : <strong>${Number(tr.spd).toLocaleString('fr-FR')} km/h</strong></span>
              <span>Écart : ${delayText}</span>
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
        pitch: Math.min(55, maxPitchForZoom(Math.max(map.getZoom(), 15))),
        bearing: train.brg,
        duration: 1000
      });
    }
  });

  // 5. Initialize Dock ("Le Quai" Niveau 2 with Station Ladder)
  const dock = new SubwayDock({
    rollingStockDb,
    onRecordsOpen: () => openNetworkRecords(stationRankings),
    onMethodOpen: () => openMethodologyModal(),
    onLineSelect: (lineId, dir = '0') => {
      isLineSelected = Boolean(lineId);
      updateRecenterVisibility();
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
            { padding: mapPadding(), maxZoom: 14.5, duration: 900 }
          );
        }
      }
    },
    onStationClick: (station) => {
      hasUserMoved = true;
      updateRecenterVisibility();
      map.flyTo({
        center: station.coordinates,
        zoom: 15.5,
        duration: 900
      });
    },
    onTrainClick: (train) => {
      hasUserMoved = true;
      updateRecenterVisibility();
      map.flyTo({
        center: train.pos,
        zoom: 15.5,
        pitch: Math.min(55, maxPitchForZoom(Math.max(map.getZoom(), 15))),
        bearing: train.brg,
        duration: 900
      });
    },
  });

  dock.setData(lines, stations, laddersData);
  dock.setRealtimeState('standby');
  dock.setServiceStatus(engine.getServiceStatus());

  // 6. Initialize Search Bar Component (Instant Station Autocomplete)
  const searchBar = new SubwaySearchBar({
    containerId: 'search-container',
    stations,
    lines,
    onStationSelect: (station) => {
      hasUserMoved = true;
      updateRecenterVisibility();
      if (station.lines.length > 0) {
        dock.selectLine(station.lines[0]);
      }
      map.flyTo({
        center: station.coordinates,
        zoom: 16,
        pitch: Math.min(45, maxPitchForZoom(16)),
        duration: 900
      });
    }
  });

  // TopBar Component (header redesign)
  const topbar = new TopBar({
    lineCount: lines.length,
    stationCount: stations.length,
    onSearch: () => {
      searchBar.open();
    },
    onMethod: () => {
      openMethodologyModal();
    },
    onToggleRealtime: () => {
      isRealtimeEnabled = !isRealtimeEnabled;
      if (isRealtimeEnabled) {
        engine.startRealtime();
        topbar.setRealtimeState({ active: true, delays: {} });
        dock.setRealtimeState({ active: true, minutesAgo: 0 });
      } else {
        engine.stopRealtime();
        topbar.setRealtimeState('standby');
        dock.setRealtimeState('standby');
      }
    }
  });
  topbar.mount();

  if (import.meta.env.DEV) {
    const lineLikes: LineLike[] = lines.map(l => ({
      line_id: l.id,
      short_name: l.short_name,
      route_color: l.color,
      route_text_color: l.text_color
    }));
    auditLineContrast(lineLikes);
  }

  // 7. Router initialization
  const router = new SubwayRouter(({ lineShortName, dir }) => {
    if (lineShortName) {
      const line = lines.find(l => l.short_name.toLowerCase() === lineShortName.toLowerCase());
      if (line) {
        dock.selectLine(line.id, dir || '0');
        deckOverlay.setSelectedLine(line.id);
        engine.setFocusedLine(line.id);
      }
    } else {
      dock.selectLine(null, '0');
      deckOverlay.setSelectedLine(null);
      engine.setFocusedLine(null);
    }
  });

  // 8. Connect deck.gl to map
  map.on('load', () => {
    fitNetwork(0);
    map.addControl(deckOverlay.getOverlay() as any);
    deckOverlay.setData({
    lines,
    stations,
    tracks,
      lineLadders: laddersData,
      shapes: shapesMap,
      rollingStockDb
    });
    deckOverlay.setRerData(rerTracks);
    deckOverlay.startTrackReveal(1200);

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
        dock.selectLine(line.id, initialRoute.dir || '0');
      }
    }
  });

  // 9. Camera controls. The 3D button is a real pitch toggle: the MapLibre
  // extrusion layer becomes visible as the camera opens above zoom 13.
  const btnPitch = document.getElementById('btn-pitch')!;
  let is3D = true;
  btnPitch.addEventListener('click', () => {
    is3D = !is3D;
    map.easeTo({
      pitch: is3D ? Math.min(DEFAULT_PITCH, maxPitchForZoom(map.getZoom())) : 0,
      bearing: is3D ? DEFAULT_BEARING : 0,
      duration: 800
    });
    btnPitch.innerHTML = is3D
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z M4 7.5 12 12l8-4.5 M12 12v9"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    btnPitch.setAttribute('aria-label', is3D ? 'Passer en vue 2D' : 'Activer la vue 3D');
    btnPitch.setAttribute('aria-pressed', String(is3D));
  });

  btnRecenter.addEventListener('click', () => {
    isLineSelected = false;
    hasUserMoved = false;
    updateRecenterVisibility();
    dock.selectLine(null);
    deckOverlay.setSelectedLine(null);
    engine.setFocusedLine(null);
    fitNetwork(900);
    map.easeTo({ pitch: is3D ? Math.min(DEFAULT_PITCH, maxPitchForZoom(map.getZoom())) : 0, bearing: is3D ? DEFAULT_BEARING : 0, duration: 700 });
  });

  // 10. Start Autonomous Subway Simulation Engine Loop
  let lastDomUpdateTime = 0;
  let lastDistanceDomUpdate = 0;
  let lastServiceStatusKey = '';
  let currentActiveTrainsCount = 0;
  engine.start({
    onTick: (trains, activeCount) => {
      currentActiveTrainsCount = trains.length;
      deckOverlay.setTrains(trains);
      topbar.setTrainCount(activeCount);
      const serviceStatus = engine.getServiceStatus();
      const serviceStatusKey = `${serviceStatus.state}:${Math.floor(serviceStatus.secondsUntilFirst / 60)}`;
      if (serviceStatusKey !== lastServiceStatusKey) {
        lastServiceStatusKey = serviceStatusKey;
        dock.setServiceStatus(serviceStatus);
      }
      const now = performance.now();
      if (now - lastDistanceDomUpdate >= 1000) {
        lastDistanceDomUpdate = now;
        topbar.setNetworkDistance(engine.getServiceDistanceKm(), !isRealtimeEnabled);
      }
      if (now - lastDomUpdateTime >= 1000) {
        lastDomUpdateTime = now;
        dock.updateTrains(trains);
      }
    },
    onPrimStatus: (status) => {
      dock.setRealtimeState(status);
      if (isRealtimeEnabled) {
        topbar.setRealtimeState(status);
      }
    }
  });

  if (import.meta.env.DEV) {
    import('./dev/fps_probe').then(({ installFpsProbe }) => {
      installFpsProbe({
        getTrainCount: () => currentActiveTrainsCount
      });
    });
  }
}

bootstrap().catch(err => {
  console.error('[app] Bootstrap error:', err);
});
