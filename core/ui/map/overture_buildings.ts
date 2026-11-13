import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { getOvertureBuildingThemeColors, type MapTheme } from './vector_style';

const OVERTURE_INDEX_URL =
  'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=tiles/&delimiter=/';
const FALLBACK_OVERTURE_RELEASE = '2026-10-21.0';
const LOCAL_RELEASE_KEY = 'overture-pmtiles-release-v2';
const RELEASE_TTL_MS = 24 * 60 * 60 * 1000;

export const OVERTURE_SOURCE_ID = 'overture-buildings';
export const OVERTURE_BUILDING_LAYER_ID = 'overture-building-3d';
export const OVERTURE_PART_LAYER_ID = 'overture-building-part-3d';

let pmtilesProtocolRegistered = false;
let backgroundRefreshStarted = false;
const mapDesiredVisibility = new WeakMap<maplibregl.Map, boolean>();
const mapXrayState = new WeakMap<maplibregl.Map, boolean>();

const DEFAULT_OPACITY_EXPR: any = [
  'interpolate',
  ['linear'],
  ['zoom'],
  13.5,
  0,
  14.3,
  0.42,
  15.5,
  0.74,
  16.8,
  0.9,
];

const XRAY_OPACITY_EXPR: any = [
  'interpolate',
  ['linear'],
  ['zoom'],
  13.5,
  0,
  14.5,
  0.46,
  16.5,
  0.42,
];

export function setBuildingsXrayMode(map: maplibregl.Map, xrayActive: boolean): void {
  if (mapXrayState.get(map) === xrayActive) return;
  mapXrayState.set(map, xrayActive);
  const expr = xrayActive ? XRAY_OPACITY_EXPR : DEFAULT_OPACITY_EXPR;
  const fallbackOpacity = xrayActive ? 0.44 : 0.82;
  try {
    if (map.getLayer(OVERTURE_BUILDING_LAYER_ID)) {
      map.setPaintProperty(OVERTURE_BUILDING_LAYER_ID, 'fill-extrusion-opacity', expr);
    }
    if (map.getLayer(OVERTURE_PART_LAYER_ID)) {
      map.setPaintProperty(OVERTURE_PART_LAYER_ID, 'fill-extrusion-opacity', expr);
    }
    if (map.getLayer('building-3d')) {
      map.setPaintProperty('building-3d', 'fill-extrusion-opacity', fallbackOpacity as any);
    }
  } catch {
    // Graceful no-op in headless/stubbed maps
  }
}

function ensurePmtilesProtocol(): void {
  if (pmtilesProtocolRegistered) return;
  if (typeof maplibregl.addProtocol !== 'function') return;
  try {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    pmtilesProtocolRegistered = true;
  } catch {
    // Already registered or running inside a headless test stub
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

  if (hasOverture) {
    try {
      map.setLayoutProperty(OVERTURE_BUILDING_LAYER_ID, 'visibility', value);
      if (map.getLayer(OVERTURE_PART_LAYER_ID)) {
        map.setLayoutProperty(OVERTURE_PART_LAYER_ID, 'visibility', value);
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
  if (!map.getStyle() || map.getSource(OVERTURE_SOURCE_ID)) return;

  const { release, stale } = getCachedOvertureReleaseSync();
  if (stale) refreshOvertureReleaseInBackground();

  const pmtilesUrl = `pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${release}/buildings.pmtiles`;
  const colors = getOvertureBuildingThemeColors(theme);
  const desiredVisible = mapDesiredVisibility.get(map) ?? true;
  const visibility = desiredVisible ? 'visible' : 'none';

  try {
    map.addSource(OVERTURE_SOURCE_ID, {
      type: 'vector',
      url: pmtilesUrl,
      minzoom: 13,
      maxzoom: 14,
      attribution:
        '<a href="https://docs.overturemaps.org/attribution" target="_blank">© Overture Maps</a>',
    });

    const xrayActive = mapXrayState.get(map) === true;
    const opacityExpr: any = xrayActive ? XRAY_OPACITY_EXPR : DEFAULT_OPACITY_EXPR;

    const beforeId = map.getLayer('building-3d') ? 'building-3d' : undefined;

    map.addLayer(
      {
        id: OVERTURE_BUILDING_LAYER_ID,
        type: 'fill-extrusion',
        source: OVERTURE_SOURCE_ID,
        'source-layer': 'building',
        minzoom: 13.5,
        filter: [
          'all',
          ['!=', ['get', 'is_underground'], true],
          ['!=', ['get', 'has_parts'], true],
        ],
        layout: { visibility },
        paint: {
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-height': [
            'coalesce',
            ['get', 'height'],
            ['*', ['coalesce', ['get', 'num_floors'], 4], 3.4],
            14,
          ],
          'fill-extrusion-color': colors.buildingColor as any,
          'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-opacity': opacityExpr,
        },
      },
      beforeId
    );

    map.addLayer(
      {
        id: OVERTURE_PART_LAYER_ID,
        type: 'fill-extrusion',
        source: OVERTURE_SOURCE_ID,
        'source-layer': 'building_part',
        minzoom: 13.5,
        filter: ['!=', ['get', 'is_underground'], true],
        layout: { visibility },
        paint: {
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-height': [
            'coalesce',
            ['get', 'height'],
            ['*', ['coalesce', ['get', 'num_floors'], 4], 3.4],
            14,
          ],
          'fill-extrusion-color': colors.partColor as any,
          'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-opacity': opacityExpr,
        },
      },
      beforeId
    );

    // Keep OpenFreeMap building-3d visible until Overture tiles in the active viewport settle,
    // avoiding a visual flash or missing buildings while Overture PMTiles streams in.
    const onSourceData = (e: any) => {
      if (e.sourceId !== OVERTURE_SOURCE_ID || !e.isSourceLoaded) return;
      map.off('sourcedata', onSourceData);
      const hideFallback = () => {
        if (map.getLayer('building-3d') && map.getLayer(OVERTURE_BUILDING_LAYER_ID)) {
          map.setLayoutProperty('building-3d', 'visibility', 'none');
        }
      };
      if (typeof map.once === 'function') {
        map.once('idle', hideFallback);
      } else {
        hideFallback();
      }
    };
    const onSourceError = (e: any) => {
      if (e.sourceId !== OVERTURE_SOURCE_ID) return;
      map.off('sourcedata', onSourceData);
      map.off('error', onSourceError);
      try {
        if (map.getLayer(OVERTURE_PART_LAYER_ID)) map.removeLayer(OVERTURE_PART_LAYER_ID);
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
    map.on('error', onSourceError);
  } catch (err) {
    console.warn('[map] Overture 3D buildings unavailable, keeping OpenFreeMap extrusion:', err);
  }
}
