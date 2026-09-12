import { applyMapTheme, createMap, maxPitchForZoom, MapBounds } from './map/maplibre';
import { SubwayDeckOverlay, TrackItem } from './map/deck_overlay';
import { SubwayDock } from './ui/dock';
import { SubwaySearchBar } from './ui/search_bar';
import { BrowserSubwayEngine } from './sim/browser_engine';
import { SubwayRouter } from './state/router';
import { coordAtDistance, loadShapes } from './sim/shapes_loader';
import { loadRollingStock } from './sim/rolling_stock';
import type { TrainMarker } from './map/trains_layer';
import type { LineMetadata, StationMetadata } from '@paris-subway/shared';
import { DEFAULT_PITCH, DEFAULT_BEARING } from '@paris-subway/shared';
import './ui/chrome.css';
import { TopBar } from './ui/header';
import { auditLineContrast, LineLike, lineBadge } from './ui/line_badge';
import { FollowCamera } from './map/follow_camera';

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
      <div class="method-footer">
        <span class="method-footer-label">Page statique indexable</span>
        <a href="/methode" target="_blank" rel="noopener" class="method-footer-link">Consulter la page méthode complète →</a>
      </div>
    </div>
  `;
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
  modal.querySelector('.records-close')?.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function openAboutModal() {
  document.getElementById('about-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'about-modal';
  modal.className = 'records-modal about-modal';
  const ticketSvg = `
    <svg class="ticket-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 280" role="img" aria-label="Ticket de transport parisien">
      <defs>
        <filter id="ticket-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0"/>
        </filter>
      </defs>
      <rect x="4" y="4" width="642" height="272" rx="8" fill="#F5F0E8" stroke="#D1CFC8" stroke-width="2"/>
      <rect x="4" y="4" width="14" height="272" rx="4" fill="#0A0A0A" opacity="0.10"/>
      <rect x="4" y="4" width="642" height="272" rx="8" fill="#0A0A0A" opacity="0.12" filter="url(#ticket-grain)"/>
      <g fill="#0A0A0A" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="900" letter-spacing="2">
        <text x="36" y="60">T</text><text x="36" y="76">I</text><text x="36" y="92">C</text><text x="36" y="108">K</text><text x="36" y="124">E</text><text x="36" y="140">T</text>
      </g>
      <path d="M90 40V130Q90 160 60 160Q45 160 40 150L55 135Q60 140 70 140Q75 140 75 130V40Z" fill="#0A0A0A"/>
      <rect x="50" y="90" width="50" height="12" fill="#0A0A0A"/>
      <path d="M115 90h40v12h-40zM128 77h14v38h-14z" fill="#0A0A0A"/>
      <text x="200" y="55" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#0A0A0A">optile</text>
      <line x1="200" y1="60" x2="260" y2="60" stroke="#0A0A0A" stroke-width="2"/>
      <circle cx="385" cy="50" r="18" fill="none" stroke="#0A0A0A" stroke-width="2"/>
      <path d="M380 42Q390 42 390 50Q390 58 380 58" fill="none" stroke="#0A0A0A" stroke-width="2"/>
      <text x="412" y="56" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#0A0A0A">RATP</text>
      <rect x="530" y="32" width="90" height="36" rx="6" fill="#0A0A0A"/>
      <text x="550" y="57" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" fill="#FFFFFF">SNCF</text>
      <g fill="#0A0A0A">
        <circle cx="215" cy="100" r="18"/><circle cx="290" cy="100" r="18"/><circle cx="365" cy="100" r="18"/><circle cx="440" cy="100" r="18"/>
      </g>
      <g text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#FFFFFF">
        <text x="215" y="100" font-size="10">BUS</text><text x="290" y="100" font-size="14">T</text><text x="365" y="100" font-size="14">M</text><text x="440" y="100" font-size="10">RER</text>
      </g>
      <text x="470" y="96" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#0A0A0A">dans</text>
      <text x="470" y="110" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#0A0A0A">Paris</text>
      <g fill="#0075C9" font-family="Arial, Helvetica, sans-serif">
        <text x="40" y="195" font-size="18" font-weight="700">Île-de-France</text><text x="40" y="210" font-size="11">mobilités</text>
        <text x="360" y="195" font-size="18" font-weight="700">Île-de-France</text><text x="360" y="210" font-size="11">mobilités</text>
      </g>
      <rect x="180" y="180" width="32" height="32" rx="4" fill="#0075C9"/><text x="196" y="203" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">+</text>
      <rect x="500" y="180" width="32" height="32" rx="4" fill="#0075C9"/><text x="516" y="203" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">+</text>
      <text x="40" y="248" font-family="Courier New, monospace" font-size="16" font-weight="700" fill="#0A0A0A" letter-spacing="2">02070341 A 1111 A16</text>
      <text x="440" y="248" font-family="Courier New, monospace" font-size="16" font-weight="700" fill="#0A0A0A" letter-spacing="2">EUR 1,90 CB</text>
    </svg>`;
  modal.innerHTML = `
    <div class="about-sheet" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <header class="about-sheet__header">
        <h2 id="about-title">À propos</h2>
        <button type="button" class="about-sheet__close" aria-label="Fermer">×</button>
      </header>
      <div class="about-sheet__body">
        <section class="about-item">
          <div class="about-item__ticket">${ticketSvg}</div>
          <div class="about-item__content"><h3 class="about-item__title">Données</h3><p class="about-item__text">Données théoriques : <strong>GTFS Île-de-France Mobilités</strong></p><p class="about-item__text">Temps réel : <strong>API PRIM / SIRI-Lite</strong></p></div>
        </section>
        <section class="about-item">
          <div class="about-item__ticket">${ticketSvg}</div>
          <div class="about-item__content"><h3 class="about-item__title">Licences</h3><p class="about-item__text">Fond cartographique : <strong>OpenMapTiles · OpenStreetMap</strong> (ODbL)</p><p class="about-item__text">Hébergement tuiles : <strong>OpenFreeMap</strong></p><p class="about-item__text">Typographie : <strong>Switzer</strong> (Fontshare)</p></div>
        </section>
        <section class="about-item">
          <div class="about-item__ticket">${ticketSvg}</div>
          <div class="about-item__content"><h3 class="about-item__title">Mentions</h3><p class="about-item__text">Projet indépendant, non affilié à la <strong>RATP</strong> ni à <strong>Île-de-France Mobilités</strong>.</p><a href="/methode" target="_blank" rel="noopener" class="about-item__link">Consulter la méthode complète <span aria-hidden="true">→</span></a></div>
        </section>
      </div>
    </div>
  `;
  const closeButton = modal.querySelector<HTMLButtonElement>('.about-sheet__close');
  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
    document.querySelector<HTMLButtonElement>('.topbar__menu-btn')?.focus();
  };
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  closeButton?.addEventListener('click', closeModal);
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  closeButton?.focus();
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
  await engine.initialize(lines, shapesMap);
  const demoRer = new URLSearchParams(window.location.search).get('demo-rer');
  const demoRerColors: Record<string, { colorHex: string; textColorHex: string }> = {
    A: { colorHex: '#EB2132', textColorHex: '#FFFFFF' },
    B: { colorHex: '#5091CB', textColorHex: '#FFFFFF' },
    C: { colorHex: '#FFCC30', textColorHex: '#000000' },
    D: { colorHex: '#008B5B', textColorHex: '#FFFFFF' },
    E: { colorHex: '#B94E9A', textColorHex: '#FFFFFF' }
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
      atStop: false
    };
  };
  (window as any).__engine = engine;
  let isRealtimeEnabled = false;

  // 3. Initialize MapLibre
  // Keep the default frame on the metro core; RER remains available without
  // shrinking Paris to a point in the wider Île-de-France envelope.
  const map = createMap('map', { initialBounds: metroBounds || networkBounds || undefined, maxBounds: mapMaxBounds });
  (window as any).__map = map;
  (window as any).map = map;

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
    const dock = document.getElementById('dock')?.getBoundingClientRect();
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const top = (header?.height || 0) + 40;
    const right = 40;
    const bottom = isMobile ? (dock?.height || 0) + 40 : 40;
    const left = isMobile ? 40 : (dock?.width || 0) + 40;
    return { top, right, bottom, left };
  };

  const btnRecenter = document.getElementById('btn-recenter') as HTMLButtonElement | null;
  let activeLineId: string | null = null;
  let trackedTrain: TrainMarker | null = null;
  let nominalMetroCenter: [number, number] | null = null;
  let nominalMetroZoom: number = 12.5;
  let isRecenterVisible = false;

  const fitMetroNetwork = (duration = 750) => {
    const initialBounds = metroBounds || networkBounds;
    if (!initialBounds) return;
    map.fitBounds(initialBounds, { padding: mapPadding(), duration, maxZoom: 14 });
  };

  const updateRecenterState = () => {
    if (!btnRecenter) return;

    let label = "Recadrer sur l'ensemble du réseau de métro";
    let isContextActive = false;

    if (trackedTrain) {
      label = `Recentrer sur la rame ${trackedTrain.lineName} vers ${trackedTrain.dest}`;
      isContextActive = true;
    } else if (activeLineId) {
      const line = lines.find(l => l.id === activeLineId);
      label = `Recadrer sur la ligne ${line ? line.short_name : activeLineId}`;
      isContextActive = true;
    }

    if (isContextActive) {
      if (!isRecenterVisible) {
        isRecenterVisible = true;
        btnRecenter.classList.add('is-visible');
      }
      btnRecenter.setAttribute('aria-label', label);
      btnRecenter.setAttribute('title', label);
      return;
    }

    if (!nominalMetroCenter) {
      if (isRecenterVisible) {
        isRecenterVisible = false;
        btnRecenter.classList.remove('is-visible');
      }
      return;
    }

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentPitch = map.getPitch();
    const currentBearing = map.getBearing();

    const dLat = currentCenter.lat - nominalMetroCenter[1];
    const dLng = (currentCenter.lng - nominalMetroCenter[0]) * Math.cos(currentCenter.lat * Math.PI / 180);
    const distDeg = Math.hypot(dLat, dLng);
    const dZoom = Math.abs(currentZoom - nominalMetroZoom);
    const dPitch = Math.abs(currentPitch);
    const dBearing = Math.abs(currentBearing);

    // Hysteresis:
    // Seuil apparition (exceeds frame): dist > 0.0035° (~390m) OR dZoom > 0.35 OR pitch > 3° OR bearing > 3°
    // Seuil disparition (within frame ~15% plus strict): dist < 0.0030° AND dZoom < 0.30 AND pitch < 2.5° AND bearing < 2.5°
    const exceedsAppearThreshold = distDeg > 0.0035 || dZoom > 0.35 || dPitch > 3 || dBearing > 3;
    const withinDisappearThreshold = distDeg < 0.0030 && dZoom < 0.30 && dPitch < 2.5 && dBearing < 2.5;

    if (!isRecenterVisible && exceedsAppearThreshold) {
      isRecenterVisible = true;
      btnRecenter.classList.add('is-visible');
      btnRecenter.setAttribute('aria-label', label);
      btnRecenter.setAttribute('title', label);
    } else if (isRecenterVisible && withinDisappearThreshold) {
      isRecenterVisible = false;
      btnRecenter.classList.remove('is-visible');
    } else if (isRecenterVisible) {
      btnRecenter.setAttribute('aria-label', label);
      btnRecenter.setAttribute('title', label);
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
  const focusTrain = (train: TrainMarker) => {
    hideTooltip();
    trackedTrain = train;
    deckOverlay.setSelectedTrain(train.id);
    if (!followCamera?.startFollow(train)) {
      map.flyTo({
        center: train.pos,
        zoom: 15.5,
        pitch: 0,
        bearing: train.brg,
        duration: 900
      });
    }
    updateRecenterState();
  };

  // 4. Initialize deck.gl overlay with Station & Train Handlers
  const deckOverlay = new SubwayDeckOverlay({
    onStationHover: (info) => {
      if (info.object && Number.isFinite(info.x) && Number.isFinite(info.y)) {
        const st = (info.object.station || info.object) as StationMetadata;
        if (!st || !st.name) {
          hideTooltip();
          return;
        }
        const servedLines = (st.lines || [])
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
        hideTooltip();
      }
    },
    onStationClick: (station) => {
      hideTooltip();
      map.flyTo({
        center: station.coordinates,
        zoom: Math.max(map.getZoom(), 15),
        duration: 900
      });
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
            <div>Prochain arrêt : <strong>${tr.next || '—'}</strong></div>
            <div class="train-tooltip-meta">
              <span>Vitesse : <strong>${Number(tr.spd || 0).toLocaleString('fr-FR')} km/h</strong></span>
              <span>Écart : ${delayText}</span>
              ${confBadge}
            </div>
            <div class="train-tooltip-hint" style="margin-top: 0.35rem; font-size: 0.72rem; color: #94a3b8; display: flex; align-items: center; gap: 4px;">
              <span>👆</span><span>Cliquer pour suivre en 3D</span>
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
    onLineSelect: (lineId) => dock?.selectLine(lineId),
    onBackgroundClick: () => {
      if (!activeLineId && !trackedTrain) return;
      const wasFollowingTrain = Boolean(trackedTrain && followCamera?.isFollowing());
      hideTooltip();
      followCamera?.stopFollow();
      activeLineId = null;
      trackedTrain = null;
      deckOverlay.setSelectedLine(null);
      deckOverlay.setSelectedTrain(null);
      engine.setFocusedLine(null);
      router.setRoute(null, '0');
      dock?.selectLine(null);
      if (!wasFollowingTrain) fitMetroNetwork();
      updateRecenterState();
    }
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

  // 5. Initialize Dock ("Le Quai" Niveau 2 with Station Ladder)
  const dock = new SubwayDock({
    rollingStockDb,
    onRecordsOpen: () => openNetworkRecords(stationRankings),
    onLineSelect: (lineId, dir = '0') => {
      hideTooltip();
      activeLineId = lineId;
      trackedTrain = null;
      followCamera?.stopFollow();
      deckOverlay.setSelectedTrain(null);
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
      updateRecenterState();
    },
    onStationClick: (station) => {
      hideTooltip();
      trackedTrain = null;
      followCamera?.stopFollow();
      deckOverlay.setSelectedTrain(null);
      map.flyTo({
        center: station.coordinates,
        zoom: 15.5,
        duration: 900
      });
      updateRecenterState();
    },
    onTrainClick: (train) => {
      focusTrain(train);
    },
  });

  followCamera = new FollowCamera({
    map,
    getTrain: tripId => latestRenderedTrains.get(tripId),
    setFollowElevation: (lineId, offset) => deckOverlay.setFollowElevation(lineId, offset),
    dock: document.getElementById('dock')!,
    onStop: () => {
      deckOverlay.setSelectedTrain(null);
      updateRecenterState();
    }
  });

  dock.setData(lines, stations, laddersData);
  dock.setRealtimeState('standby');
  dock.setServiceStatus(engine.getServiceStatus());

  // 6. Initialize Search Bar Component (Instant Station Autocomplete)
  const searchBar = new SubwaySearchBar({
    triggerId: 'topbar-search-trigger',
    stations,
    lines,
    onStationSelect: (station) => {
      hideTooltip();
      trackedTrain = null;
      if (station.lines.length > 0) {
        activeLineId = station.lines[0];
        dock.selectLine(station.lines[0]);
      }
      map.flyTo({
        center: station.coordinates,
        zoom: 16,
        pitch: 0,
        duration: 900
      });
      updateRecenterState();
    }
  });

  // TopBar Component (header redesign)
  const topbar = new TopBar({
    lineCount: lines.length,
    stationCount: stations.length,
    onSearch: () => {
      hideTooltip();
      searchBar.open();
    },
    onAbout: () => {
      hideTooltip();
      openAboutModal();
    },
    onRecords: () => {
      hideTooltip();
      openNetworkRecords(stationRankings);
    },
    onToggleBuildings: (active: boolean) => {
      try {
        if (map.getLayer('building-3d')) {
          map.setLayoutProperty('building-3d', 'visibility', active ? 'visible' : 'none');
        }
      } catch (err) {
        console.warn('[map] Could not toggle building layer:', err);
      }
    },
    onToggleTheme: (theme) => {
      applyMapTheme(map, theme);
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
  const syncBuildingsState = () => {
    if (!map.getLayer('building-3d')) return;
    topbar.setBuildingsActive(map.getLayoutProperty('building-3d', 'visibility') !== 'none');
  };
  if (map.isStyleLoaded()) syncBuildingsState();
  else map.once('style.load', syncBuildingsState);

  const loader = document.getElementById('app-loader');
  const hideLoader = () => loader?.classList.add('is-hidden');
  if (map.loaded()) hideLoader();
  else map.once('load', hideLoader);

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
    fitMetroNetwork(0);
    setTimeout(() => {
      nominalMetroCenter = [map.getCenter().lng, map.getCenter().lat];
      nominalMetroZoom = map.getZoom();
      updateRecenterState();
    }, 200);

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
    const initialDemoTrain = demoRer ? createDemoRerTrain(demoRer) : null;
    if (initialDemoTrain) {
      latestRenderedTrains = new Map([[initialDemoTrain.id, initialDemoTrain]]);
      deckOverlay.setTrains([initialDemoTrain]);
      topbar.setTrainCount(1);
      dock.updateTrains([initialDemoTrain]);
    }
    deckOverlay.startTrackReveal(1200);

    const syncOverlayView = () => {
      const b = map.getBounds();
      const boundsTuple: [[number, number], [number, number]] | null = b
        ? [
            [b.getWest(), b.getSouth()],
            [b.getEast(), b.getNorth()]
          ]
        : null;
      deckOverlay.setViewState(map.getZoom(), [map.getCenter().lng, map.getCenter().lat], boundsTuple, map.getPitch());
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

  // 9. Contextual Recenter Action
  btnRecenter?.addEventListener('click', () => {
    followCamera?.stopFollow();
    if (trackedTrain) {
      map.flyTo({
        center: trackedTrain.pos,
        zoom: 15.5,
        pitch: 0,
        bearing: trackedTrain.brg,
        duration: 800
      });
    } else if (activeLineId) {
      const lineStations = stations.filter(s => s.lines.includes(activeLineId!));
      if (lineStations.length > 0) {
        const lngs = lineStations.map(s => s.coordinates[0]);
        const lats = lineStations.map(s => s.coordinates[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: mapPadding(), maxZoom: 14.5, duration: 800 }
        );
      }
    } else {
      dock.selectLine(null);
      deckOverlay.setSelectedLine(null);
      engine.setFocusedLine(null);
      fitMetroNetwork(800);
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
    setTimeout(updateRecenterState, 850);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideTooltip();
      document.getElementById('records-modal')?.remove();
      document.getElementById('method-modal')?.remove();
      topbar.closeMenu();
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'b' || e.key === 'B') {
      try {
        const currentVis = map.getLayoutProperty('building-3d', 'visibility');
        const nextActive = currentVis !== 'visible';
        map.setLayoutProperty('building-3d', 'visibility', nextActive ? 'visible' : 'none');
        topbar.setBuildingsActive(nextActive);
      } catch (err) {
        console.warn('[map] Error toggling buildings:', err);
      }
    }
  });

  // 10. Start Autonomous Subway Simulation Engine Loop
  let lastDomUpdateTime = 0;
  let lastDistanceDomUpdate = 0;
  let lastServiceStatusKey = '';
  engine.start({
    onTick: (trains, activeCount) => {
      const demoTrain = demoRer ? createDemoRerTrain(demoRer) : null;
      if (demoTrain) {
        trains = [demoTrain];
        activeCount = 1;
      }
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
    onRender: (trains, activeCount) => {
      const demoTrain = demoRer ? createDemoRerTrain(demoRer) : null;
      if (demoTrain) {
        trains = [demoTrain];
        activeCount = 1;
      }
      latestRenderedTrains = new Map(trains.map(train => [train.id, train]));
      deckOverlay.setTrains(trains);
      followCamera?.onSimulationFrame();
    },
    onPrimStatus: (status) => {
      dock.setRealtimeState(status);
      if (isRealtimeEnabled) {
        topbar.setRealtimeState(status);
      }
    }
  });

}

bootstrap().catch(err => {
  console.error('[app] Bootstrap error:', err);
});
