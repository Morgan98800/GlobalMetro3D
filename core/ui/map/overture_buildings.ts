import * as maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import { isMobileGpuDevice } from './device_perf';
import {
  getOvertureBuildingThemeColors,
  HERO_LANDMARK_OVERTURE_IDS,
  type MapTheme,
} from './vector_style';

const OVERTURE_INDEX_URL =
  'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=tiles/&delimiter=/';
const FALLBACK_OVERTURE_RELEASE = '2026-11-18.0';
const LOCAL_RELEASE_KEY = 'overture-pmtiles-release-v2';
const RELEASE_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_PARIS_PMTILES_PATH = '/data/paris-buildings-bdtopo.pmtiles';
const PARIS_PMTILES_BBOX = { minLng: 2.18, minLat: 48.74, maxLng: 2.52, maxLat: 48.96 } as const;

function isInParisPmtilesBounds(map: maplibregl.Map): boolean {
  try {
    const center = map.getCenter?.();
    if (!center) return false;
    return (
      center.lng >= PARIS_PMTILES_BBOX.minLng &&
      center.lng <= PARIS_PMTILES_BBOX.maxLng &&
      center.lat >= PARIS_PMTILES_BBOX.minLat &&
      center.lat <= PARIS_PMTILES_BBOX.maxLat
    );
  } catch {
    return false;
  }
}

export const OVERTURE_SOURCE_ID = 'overture-buildings';
export const OVERTURE_BUILDING_LAYER_ID = 'overture-building-3d';
export const OVERTURE_ROOF_LAYER_ID = 'overture-building-roof-3d';
export const OVERTURE_PART_LAYER_ID = 'overture-building-part-3d';
export const OVERTURE_OUTLINE_LAYER_ID = 'overture-building-outline';

let pmtilesProtocolRegistered = false;
let sharedPmtilesProtocol: Protocol | null = null;
const prewarmedPmtilesUrls = new Set<string>();
let backgroundRefreshStarted = false;
const mapDesiredVisibility = new WeakMap<maplibregl.Map, boolean>();
const mapXrayState = new WeakMap<maplibregl.Map, boolean>();
const mapThemeState = new WeakMap<maplibregl.Map, MapTheme>();
const mapCutoutKey = new WeakMap<maplibregl.Map, string>();
const mapBaseBuildingFilters = new WeakMap<maplibregl.Map, Map<string, any>>();

// Opaque Haussmannian buildings by default to eliminate alpha overdraw on the GPU.
// Semi-transparency is reserved for explicit Subsurface X-Ray mode.
const DEFAULT_OPACITY_EXPR: any = 1.0;

// Explicit opt-in Blueprint X-ray mode (only when user manually enables Subsurface X-Ray)
const XRAY_OPACITY_EXPR: any = 0.18;

const RESOLVED_HEIGHT_EXPR: any = [
  'coalesce',
  ['get', 'height'],
  ['*', ['coalesce', ['get', 'num_floors'], 5], 3.2],
  16,
];

// Clean 2-tier Parisian Haussmann silhouette (100% static solid colors, zero pattern shimmer):
// - 10–38 m Paris blocks: Lutetian limestone/slate body + 2.65 m Parisian zinc mansard crown
// - Taller towers (> 38 m): clean 0.6 m slate roof cap
const FACADE_HEIGHT_EXPR: any = [
  'case',
  ['all', ['>=', RESOLVED_HEIGHT_EXPR, 10], ['<=', RESOLVED_HEIGHT_EXPR, 38]],
  ['-', RESOLVED_HEIGHT_EXPR, 2.65],
  ['>', RESOLVED_HEIGHT_EXPR, 38],
  ['-', RESOLVED_HEIGHT_EXPR, 0.65],
  RESOLVED_HEIGHT_EXPR,
];

const ROOF_BASE_EXPR: any = [
  'case',
  ['all', ['>=', RESOLVED_HEIGHT_EXPR, 10], ['<=', RESOLVED_HEIGHT_EXPR, 38]],
  ['-', RESOLVED_HEIGHT_EXPR, 2.65],
  ['-', RESOLVED_HEIGHT_EXPR, 0.65],
];

function getRoofColorExpr(theme: MapTheme): any {
  return [
    'match',
    ['coalesce', ['get', 'roof_mat'], 'zinc'],
    'slate',
    theme === 'light' ? '#586778' : '#35465b',
    'tile',
    theme === 'light' ? '#9c7364' : '#654a42',
    theme === 'light' ? '#6d7e90' : '#445a74',
  ];
}

export function applyBuildingsHaussmannStyle(
  map: maplibregl.Map,
  theme: MapTheme,
  xrayActive = mapXrayState.get(map) === true
): void {
  mapThemeState.set(map, theme);
  const zincColor = getRoofColorExpr(theme);
  const outlineColor = theme === 'light' ? 'rgba(92, 84, 72, 0.16)' : 'rgba(154, 184, 224, 0.16)';
  const desiredVisible = mapDesiredVisibility.get(map) ?? true;
  const roofVisibility = desiredVisible && !xrayActive ? 'visible' : 'none';

  try {
    if (map.getLayer(OVERTURE_ROOF_LAYER_ID)) {
      map.setPaintProperty(OVERTURE_ROOF_LAYER_ID, 'fill-extrusion-color', zincColor);
      map.setLayoutProperty(OVERTURE_ROOF_LAYER_ID, 'visibility', roofVisibility);
    }
    if (map.getLayer(OVERTURE_OUTLINE_LAYER_ID)) {
      map.setPaintProperty(OVERTURE_OUTLINE_LAYER_ID, 'line-color', outlineColor);
      map.setLayoutProperty(OVERTURE_OUTLINE_LAYER_ID, 'visibility', roofVisibility);
    }
  } catch {
    // Graceful no-op in stubbed/headless maps
  }
}

export function setBuildingsXrayMode(map: maplibregl.Map, xrayActive: boolean): void {
  if (mapXrayState.get(map) === xrayActive) return;
  mapXrayState.set(map, xrayActive);
  const expr = xrayActive ? XRAY_OPACITY_EXPR : DEFAULT_OPACITY_EXPR;
  const fallbackOpacity = xrayActive ? 0.18 : 1.0;
  const theme = mapThemeState.get(map) ?? 'dark';
  try {
    if (map.getLayer(OVERTURE_BUILDING_LAYER_ID)) {
      map.setPaintProperty(OVERTURE_BUILDING_LAYER_ID, 'fill-extrusion-opacity', expr);
    }
    if (map.getLayer(OVERTURE_PART_LAYER_ID)) {
      map.setPaintProperty(OVERTURE_PART_LAYER_ID, 'fill-extrusion-opacity', expr);
    }
    if (map.getLayer(OVERTURE_ROOF_LAYER_ID)) {
      map.setPaintProperty(OVERTURE_ROOF_LAYER_ID, 'fill-extrusion-opacity', expr);
    }
    if (map.getLayer('building-3d')) {
      map.setPaintProperty('building-3d', 'fill-extrusion-opacity', fallbackOpacity as any);
    }
    applyBuildingsHaussmannStyle(map, theme, xrayActive);
  } catch {
    // Graceful no-op in headless/stubbed maps
  }
}

const BUILDING_CUTOUT_LAYERS = [
  OVERTURE_BUILDING_LAYER_ID,
  OVERTURE_ROOF_LAYER_ID,
  OVERTURE_PART_LAYER_ID,
  'building-3d',
] as const;

function buildCirclePolygon(center: [number, number], radiusM: number) {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.2, Math.cos(latRad)));
  const coords: [number, number][] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return {
    type: 'Polygon' as const,
    coordinates: [coords],
  };
}

/**
 * Temporarily hides 3D buildings immediately surrounding a zoomed-in station
 * so the underground station architecture is unobstructed; restores them
 * automatically when zooming out or panning away.
 */
export function setStationBuildingCutout(
  map: maplibregl.Map,
  center: [number, number] | null,
  radiusM = 70
): void {
  const key = center ? `${center[0].toFixed(4)},${center[1].toFixed(4)},${radiusM}` : 'none';
  if (mapCutoutKey.get(map) === key) return;
  mapCutoutKey.set(map, key);

  let baseFilters = mapBaseBuildingFilters.get(map);
  if (!baseFilters) {
    baseFilters = new Map<string, any>();
    mapBaseBuildingFilters.set(map, baseFilters);
  }

  const pointGeom = center ? ({ type: 'Point', coordinates: center } as const) : null;
  try {
    for (const layerId of BUILDING_CUTOUT_LAYERS) {
      if (!map.getLayer(layerId)) continue;
      if (!baseFilters.has(layerId)) {
        baseFilters.set(layerId, map.getFilter(layerId) ?? null);
      }
      const base = baseFilters.get(layerId);
      if (pointGeom) {
        const excludeExpr: any = ['>', ['distance', pointGeom], radiusM];
        map.setFilter(layerId, base ? ['all', base, excludeExpr] : excludeExpr);
      } else {
        map.setFilter(layerId, base ?? null);
      }
    }
  } catch {
    // Graceful no-op in headless/stubbed maps
  }
}

function ensurePmtilesProtocol(): Protocol | null {
  if (pmtilesProtocolRegistered) return sharedPmtilesProtocol;
  if (typeof maplibregl.addProtocol !== 'function') return null;
  try {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    sharedPmtilesProtocol = protocol;
    pmtilesProtocolRegistered = true;
    return protocol;
  } catch {
    // Already registered or running inside a headless test stub
    return sharedPmtilesProtocol;
  }
}

function prewarmPmtilesArchive(httpUrl: string): void {
  if (prewarmedPmtilesUrls.has(httpUrl)) return;
  prewarmedPmtilesUrls.add(httpUrl);
  try {
    const protocol = ensurePmtilesProtocol();
    const archive = new PMTiles(httpUrl);
    protocol?.add(archive);
    // Warm header + root directory asynchronously so first z>=13 tile fetch skips handshake latency
    void archive.getHeader().catch(() => {
      prewarmedPmtilesUrls.delete(httpUrl);
    });
  } catch {
    // Ignore in headless/stubbed environments
  }
}

export function getCachedOvertureReleaseSync(): { release: string; stale: boolean } {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_RELEASE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { release?: string; ts?: number };
        if (
          parsed?.release &&
          /^\d{4}-\d{2}-\d{2}\.\d+$/.test(parsed.release) &&
          typeof parsed.ts === 'number'
        ) {
          return {
            release: parsed.release,
            stale: Date.now() - parsed.ts > RELEASE_TTL_MS,
          };
        }
      }
    } catch {
      // localStorage unavailable or malformed
    }
  }
  return { release: FALLBACK_OVERTURE_RELEASE, stale: true };
}

function refreshOvertureReleaseInBackground(): void {
  if (backgroundRefreshStarted || typeof fetch !== 'function') return;
  backgroundRefreshStarted = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  void fetch(OVERTURE_INDEX_URL, { signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) return;
      const xml = await res.text();
      const matches = Array.from(
        xml.matchAll(/<Prefix>tiles\/(\d{4}-\d{2}-\d{2}\.\d+)\/<\/Prefix>/g)
      )
        .map((m) => m[1])
        .sort();
      const latest = matches[matches.length - 1];
      if (latest && typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            LOCAL_RELEASE_KEY,
            JSON.stringify({ release: latest, ts: Date.now() })
          );
        } catch {
          // Ignore storage error
        }
      }
    })
    .catch(() => {
      // Background refresh is best-effort only
    })
    .finally(() => {
      clearTimeout(timer);
    });
}

export function setBuildingsVisible(map: maplibregl.Map, visible: boolean): void {
  mapDesiredVisibility.set(map, visible);
  const value = visible ? 'visible' : 'none';
  const hasOverture = Boolean(map.getLayer(OVERTURE_BUILDING_LAYER_ID));
  const xrayActive = mapXrayState.get(map) === true;

  if (hasOverture) {
    try {
      map.setLayoutProperty(OVERTURE_BUILDING_LAYER_ID, 'visibility', value);
      if (map.getLayer(OVERTURE_ROOF_LAYER_ID)) {
        map.setLayoutProperty(
          OVERTURE_ROOF_LAYER_ID,
          'visibility',
          visible && !xrayActive ? 'visible' : 'none'
        );
      }
      if (map.getLayer(OVERTURE_PART_LAYER_ID)) {
        map.setLayoutProperty(OVERTURE_PART_LAYER_ID, 'visibility', value);
      }
      if (map.getLayer(OVERTURE_OUTLINE_LAYER_ID)) {
        map.setLayoutProperty(
          OVERTURE_OUTLINE_LAYER_ID,
          'visibility',
          visible && !xrayActive ? 'visible' : 'none'
        );
      }
      if (map.getLayer('building-3d')) {
        map.setLayoutProperty('building-3d', 'visibility', 'none');
      }
    } catch {
      // Safe fallback if style is mid-reload
    }
    return;
  }

  if (map.getLayer('building-3d')) {
    try {
      map.setLayoutProperty('building-3d', 'visibility', value);
    } catch {
      // Ignore
    }
  }
}

export function areBuildingsVisible(map: maplibregl.Map): boolean {
  if (mapDesiredVisibility.has(map)) {
    return mapDesiredVisibility.get(map) !== false;
  }
  const layerId = map.getLayer(OVERTURE_BUILDING_LAYER_ID)
    ? OVERTURE_BUILDING_LAYER_ID
    : 'building-3d';
  if (!map.getLayer(layerId)) return true;
  return map.getLayoutProperty(layerId, 'visibility') !== 'none';
}

export function attachOvertureBuildings(map: maplibregl.Map, theme: MapTheme): void {
  ensurePmtilesProtocol();
  mapThemeState.set(map, theme);
  if (!map.getStyle() || map.getSource(OVERTURE_SOURCE_ID)) return;

  const useLocalParisArchive =
    typeof window !== 'undefined' &&
    Boolean(window.location?.origin) &&
    isInParisPmtilesBounds(map);

  let pmtilesUrl: string;
  if (useLocalParisArchive) {
    const httpUrl = `${window.location.origin}${LOCAL_PARIS_PMTILES_PATH}`;
    prewarmPmtilesArchive(httpUrl);
    pmtilesUrl = `pmtiles://${httpUrl}`;
  } else {
    const { release, stale } = getCachedOvertureReleaseSync();
    if (stale) refreshOvertureReleaseInBackground();
    const httpUrl = `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${release}/buildings.pmtiles`;
    prewarmPmtilesArchive(httpUrl);
    pmtilesUrl = `pmtiles://${httpUrl}`;
  }
  const colors = getOvertureBuildingThemeColors(theme);
  const desiredVisible = mapDesiredVisibility.get(map) ?? true;
  const visibility = desiredVisible ? 'visible' : 'none';

  try {
    map.addSource(OVERTURE_SOURCE_ID, {
      type: 'vector',
      url: pmtilesUrl,
      minzoom: 13,
      maxzoom: 14,
      attribution: useLocalParisArchive
        ? '<a href="https://geoservices.ign.fr/bdtopo" target="_blank">© IGN BD TOPO®</a>'
        : '<a href="https://docs.overturemaps.org/attribution" target="_blank">© Overture Maps</a>',
    });

    const xrayActive = mapXrayState.get(map) === true;
    const opacityExpr: any = xrayActive ? XRAY_OPACITY_EXPR : DEFAULT_OPACITY_EXPR;
    const zincColor = getRoofColorExpr(theme);
    const outlineColor = theme === 'light' ? 'rgba(92, 84, 72, 0.16)' : 'rgba(154, 184, 224, 0.16)';

    const beforeId = map.getLayer('building-3d') ? 'building-3d' : undefined;

    // 1. Haussmann limestone / slate facade body (starts fetching at z=13.0 for faster load)
    map.addLayer(
      {
        id: OVERTURE_BUILDING_LAYER_ID,
        type: 'fill-extrusion',
        source: OVERTURE_SOURCE_ID,
        'source-layer': 'building',
        minzoom: 13.0,
        filter: [
          'all',
          ['!=', ['get', 'is_underground'], true],
          ['!=', ['get', 'has_parts'], true],
          ['<', ['coalesce', ['get', 'height'], 0], 290],
          ['!', ['in', ['get', 'id'], ['literal', HERO_LANDMARK_OVERTURE_IDS]]],
        ] as any,
        layout: { visibility },
        paint: {
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-height': FACADE_HEIGHT_EXPR,
          'fill-extrusion-color': colors.buildingColor as any,
          'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-opacity': opacityExpr,
        },
      },
      beforeId
    );

    const mobileGpu = isMobileGpuDevice();

    // 2. Inset Parisian Mansart roof crown (BD TOPO inset layer for Paris, fallback to building crown elsewhere)
    map.addLayer(
      {
        id: OVERTURE_ROOF_LAYER_ID,
        type: 'fill-extrusion',
        source: OVERTURE_SOURCE_ID,
        'source-layer': useLocalParisArchive ? 'mansard_roof' : 'building',
        minzoom: useLocalParisArchive ? (mobileGpu ? 15.2 : 13.8) : mobileGpu ? 15.6 : 14.8,
        filter: useLocalParisArchive
          ? (['>=', ['coalesce', ['get', 'height'], 0], 10] as any)
          : ([
              'all',
              ['!=', ['get', 'is_underground'], true],
              ['!=', ['get', 'has_parts'], true],
              ['>=', RESOLVED_HEIGHT_EXPR, 10],
              ['<', ['coalesce', ['get', 'height'], 0], 290],
              ['!', ['in', ['get', 'id'], ['literal', HERO_LANDMARK_OVERTURE_IDS]]],
            ] as any),
        layout: { visibility: desiredVisible && !xrayActive ? 'visible' : 'none' },
        paint: {
          'fill-extrusion-base': useLocalParisArchive
            ? ['coalesce', ['get', 'min_height'], 0]
            : ROOF_BASE_EXPR,
          'fill-extrusion-height': useLocalParisArchive
            ? ['coalesce', ['get', 'height'], 14]
            : RESOLVED_HEIGHT_EXPR,
          'fill-extrusion-color': zincColor,
          'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-opacity': opacityExpr,
        },
      },
      beforeId
    );

    // 3. Detailed multi-part architectural monuments (Overture fallback outside local Paris BD TOPO)
    if (!useLocalParisArchive) {
      map.addLayer(
        {
          id: OVERTURE_PART_LAYER_ID,
          type: 'fill-extrusion',
          source: OVERTURE_SOURCE_ID,
          'source-layer': 'building_part',
          minzoom: mobileGpu ? 15.0 : 14.6,
          filter: [
            'all',
            ['!=', ['get', 'is_underground'], true],
            ['<', ['coalesce', ['get', 'height'], 0], 290],
            [
              '!',
              [
                'in',
                ['coalesce', ['get', 'building_id'], ['get', 'id']],
                ['literal', HERO_LANDMARK_OVERTURE_IDS],
              ],
            ],
          ] as any,
          layout: { visibility },
          paint: {
            'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
            'fill-extrusion-height': RESOLVED_HEIGHT_EXPR,
            'fill-extrusion-color': colors.partColor as any,
            'fill-extrusion-vertical-gradient': true,
            'fill-extrusion-opacity': opacityExpr,
          },
        },
        beforeId
      );
    }

    // 4. Crisp architectural footprint / courtyard outline (Mapbox Standard Night/Day feel)
    map.addLayer(
      {
        id: OVERTURE_OUTLINE_LAYER_ID,
        type: 'line',
        source: OVERTURE_SOURCE_ID,
        'source-layer': 'building',
        minzoom: mobileGpu ? 15.4 : 14.4,
        filter: [
          'all',
          ['!=', ['get', 'is_underground'], true],
          ['<', ['coalesce', ['get', 'height'], 0], 290],
          ['!', ['in', ['get', 'id'], ['literal', HERO_LANDMARK_OVERTURE_IDS]]],
        ] as any,
        layout: { visibility: desiredVisible && !xrayActive ? 'visible' : 'none' },
        paint: {
          'line-color': outlineColor,
          'line-width': ['interpolate', ['linear'], ['zoom'], 14.4, 0.55, 17, 1.05],
        },
      },
      OVERTURE_BUILDING_LAYER_ID
    );

    // Keep OpenFreeMap building-3d visible only until Overture actually renders its first
    // 3D building in the viewport (at z >= 13.0), then hide building-3d immediately to prevent z-fighting.
    // Avoid synchronous queryRenderedFeatures in the per-frame `render` loop (causes mobile stalls).
    const trySwapToOverture = () => {
      if (!map.getLayer(OVERTURE_BUILDING_LAYER_ID) || !map.getLayer('building-3d')) return;
      if (map.getZoom() < 13.0) return;
      try {
        const rendered = map.queryRenderedFeatures({
          layers: [OVERTURE_BUILDING_LAYER_ID],
        });
        if (rendered.length > 0) {
          map.setLayoutProperty('building-3d', 'visibility', 'none');
          map.off('idle', trySwapToOverture);
          map.off('sourcedata', onSourceData);
        }
      } catch {
        // Ignore in stubbed/headless maps
      }
    };
    const onSourceData = (e: any) => {
      if (e.sourceId !== OVERTURE_SOURCE_ID || !e.isSourceLoaded) return;
      trySwapToOverture();
    };
    const onSourceError = (e: any) => {
      if (e.sourceId !== OVERTURE_SOURCE_ID) return;
      map.off('sourcedata', onSourceData);
      map.off('idle', trySwapToOverture);
      map.off('error', onSourceError);
      try {
        if (map.getLayer(OVERTURE_OUTLINE_LAYER_ID)) map.removeLayer(OVERTURE_OUTLINE_LAYER_ID);
        if (map.getLayer(OVERTURE_PART_LAYER_ID)) map.removeLayer(OVERTURE_PART_LAYER_ID);
        if (map.getLayer(OVERTURE_ROOF_LAYER_ID)) map.removeLayer(OVERTURE_ROOF_LAYER_ID);
        if (map.getLayer(OVERTURE_BUILDING_LAYER_ID)) map.removeLayer(OVERTURE_BUILDING_LAYER_ID);
        if (map.getSource(OVERTURE_SOURCE_ID)) map.removeSource(OVERTURE_SOURCE_ID);
      } catch {
        // Ignore cleanup failures
      }
      if (map.getLayer('building-3d')) {
        map.setLayoutProperty('building-3d', 'visibility', desiredVisible ? 'visible' : 'none');
      }
    };
    map.on('sourcedata', onSourceData);
    map.on('idle', trySwapToOverture);
    map.on('error', onSourceError);
  } catch (err) {
    console.warn('[map] Overture 3D buildings unavailable, keeping OpenFreeMap extrusion:', err);
  }
}
