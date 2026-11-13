import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  areBuildingsVisible,
  attachOvertureBuildings,
  setBuildingsVisible,
} from './overture_buildings';
import { getOptimalPixelRatio, isMobileGpuDevice } from './device_perf';
import { createVectorDarkStyle, getMapThemePaints, MapTheme } from './vector_style';

export { areBuildingsVisible, setBuildingsVisible };

if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

export const BUILDING_EXTRUSION_ZOOM = 14;
export const LOW_ZOOM_MAX_PITCH = 30;
export const HIGH_ZOOM_MAX_PITCH = 75;

/**
 * Option A camera policy: keep the city-scale view shallow, then open it only
 * while the 3D building layer is visible. The ramp avoids a hard pitch jump.
 */
export function maxPitchForZoom(zoom: number): number {
  if (zoom <= BUILDING_EXTRUSION_ZOOM) return LOW_ZOOM_MAX_PITCH;
  const ramp = Math.min(1, (zoom - BUILDING_EXTRUSION_ZOOM) / 2.5);
  return LOW_ZOOM_MAX_PITCH + ramp * (HIGH_ZOOM_MAX_PITCH - LOW_ZOOM_MAX_PITCH);
}

export type MapBounds = [[number, number], [number, number]];

export function applyMapLighting(map: maplibregl.Map, theme: MapTheme): void {
  if (typeof map.setLight !== 'function') return;
  try {
    map.setLight({
      anchor: 'viewport',
      color: theme === 'light' ? '#fff8ec' : '#ffd5a8',
      intensity: theme === 'light' ? 0.55 : 0.44,
      position: [1.35, 215, 42],
    });
  } catch {
    // Graceful no-op in mocked or minimal GL environments
  }
}

export function applyMapTheme(map: maplibregl.Map, theme: MapTheme): void {
  for (const [layer, property, value] of getMapThemePaints(theme)) {
    if (map.getLayer(layer)) {
      map.setPaintProperty(layer, property as any, value);
    }
  }
  applyMapLighting(map, theme);
  applyMapSky(map, theme);
}

function facadesExperimentEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('facades') === '1'
  );
}

function createFacadePattern(size = 64): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  const windowWidth = 7;
  const windowHeight = 13;
  const horizontalGap = 13;
  const verticalGap = 20;
  const stone = [64, 58, 49, 255];
  const windowColor = [18, 16, 14, 255];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const isWindow =
        x % horizontalGap >= 3 &&
        x % horizontalGap < 3 + windowWidth &&
        y % verticalGap >= 3 &&
        y % verticalGap < 3 + windowHeight;
      const color = isWindow ? windowColor : stone;
      const offset = (y * size + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }
  return { width: size, height: size, data };
}

export function applyMapSky(map: maplibregl.Map, theme: MapTheme): void {
  if (typeof (map as { setSky?: unknown }).setSky !== 'function') return;
  try {
    if (theme === 'light') {
      map.setSky({
        'sky-color': '#dce4ef',
        'horizon-color': '#f4f1ea',
        'fog-color': '#eeeae2',
        'sky-horizon-blend': 0.5,
        'horizon-fog-blend': 0.7,
        'fog-ground-blend': 0.65,
        'atmosphere-blend': 0.5,
      });
    } else {
      map.setSky({
        'sky-color': '#08090c',
        'horizon-color': '#161a24',
        'fog-color': '#11141c',
        'sky-horizon-blend': 0.45,
        'horizon-fog-blend': 0.7,
        'fog-ground-blend': 0.65,
        'atmosphere-blend': 0.6,
      });
    }
  } catch {
    // Graceful no-op in mocked or minimal GL environments
  }
}

export interface CreateMapOptions {
  initialBounds?: MapBounds;
  maxBounds?: MapBounds;
  center?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  attribution?: string;
}

export function createMap(containerId: string, options: CreateMapOptions = {}): maplibregl.Map {
  const theme: MapTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const customAttribution =
    options.attribution ||
    '© <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · IDFM ODbL';
  const map = new maplibregl.Map({
    container: containerId,
    style: createVectorDarkStyle(theme),
    ...(options.center ? { center: options.center } : {}),
    ...(options.zoom !== undefined ? { zoom: options.zoom } : {}),
    ...(options.initialBounds
      ? {
          bounds: options.initialBounds,
          fitBoundsOptions: {
            pitch: options.pitch ?? 0,
            bearing: options.bearing ?? 0,
          },
        }
      : {}),
    ...(options.maxBounds ? { maxBounds: options.maxBounds } : {}),
    // The initial viewport is fitted from the loaded network geometry or config center.
    pitch: options.pitch ?? 0,
    bearing: options.bearing ?? 0,
    maxPitch: HIGH_ZOOM_MAX_PITCH,
    maxZoom: 18,
    pixelRatio: getOptimalPixelRatio(2, 1.5),
    fadeDuration: isMobileGpuDevice() ? 120 : 300,
    attributionControl: false,
  });

  // Custom attribution bottom-right
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution,
    }),
    'bottom-right'
  );

  map.on('style.load', () => {
    const activeTheme: MapTheme =
      document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    applyMapSky(map, activeTheme);
    applyMapLighting(map, activeTheme);
    void attachOvertureBuildings(map, activeTheme);
    try {
      if (facadesExperimentEnabled() && map.getLayer('building-3d')) {
        map.addImage('paris-facade-grid', createFacadePattern(), { pixelRatio: 1 });
        map.setPaintProperty('building-3d', 'fill-extrusion-pattern', 'paris-facade-grid' as any);
        console.info('[map] Facades experiment enabled: repeated window grid');
      }
    } catch (err) {
      console.warn('[map] Could not initialize terrain DEM:', err);
    }
  });

  return map;
}
