import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  applyBuildingsHaussmannStyle,
  areBuildingsVisible,
  attachOvertureBuildings,
  setBuildingsVisible,
  setBuildingsXrayMode,
} from './overture_buildings';
import { ensureHaussmannPatterns } from './haussmann_patterns';
import { getOptimalPixelRatio, isMobileGpuDevice } from './device_perf';
import {
  createVectorDarkStyle,
  getBlueprintXrayPaints,
  getMapThemePaints,
  getSubsurfacePaints,
  MapTheme,
} from './vector_style';

export { areBuildingsVisible, setBuildingsVisible, setBuildingsXrayMode };

export interface ParisDaylightProfile {
  phase: 'day' | 'golden-morning' | 'golden-evening' | 'night';
  lightColor: string;
  lightIntensity: number;
  lightPosition: [number, number, number];
  skyColor: string;
  horizonColor: string;
  fogColor: string;
}

/**
 * Computes lighting & sky strictly preserving Obsidian Night when `theme === 'dark'`.
 * Only applies subtle Paris Golden Hour warmth when `theme === 'light'` during morning
 * (06:30–09:30) or late afternoon/evening (17:00–21:00) Paris local time.
 */
export function computeParisDaylightProfile(
  theme: MapTheme,
  now: Date = new Date()
): ParisDaylightProfile {
  if (theme === 'dark') {
    return {
      phase: 'night',
      lightColor: '#d6e6ff',
      lightIntensity: 0.66,
      lightPosition: [1.35, 215, 42],
      skyColor: '#0b0c0f',
      horizonColor: '#181b21',
      fogColor: '#131518',
    };
  }

  let parisHour = now.getHours() + now.getMinutes() / 60;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    if (Number.isFinite(h) && Number.isFinite(m)) {
      parisHour = h + m / 60;
    }
  } catch {
    // Fallback to local clock if Intl timeZone unsupported
  }

  // Morning golden hour (sun from East-Southeast)
  if (parisHour >= 6.5 && parisHour < 9.5) {
    return {
      phase: 'golden-morning',
      lightColor: '#ffe0b2',
      lightIntensity: 0.68,
      lightPosition: [1.5, 118, 56],
      skyColor: '#c7dbf2',
      horizonColor: '#f6e7d4',
      fogColor: '#f3ede3',
    };
  }

  // Evening golden hour (low warm sun from West along Champs-Élysées / Tour Eiffel axis)
  if (parisHour >= 17.0 && parisHour <= 21.0) {
    return {
      phase: 'golden-evening',
      lightColor: '#ffd49b',
      lightIntensity: 0.70,
      lightPosition: [1.55, 268, 60],
      skyColor: '#bfd2ea',
      horizonColor: '#f5dec6',
      fogColor: '#f2e8dc',
    };
  }

  return {
    phase: 'day',
    lightColor: '#fffaf0',
    lightIntensity: 0.64,
    lightPosition: [1.45, 222, 36],
    skyColor: '#cfe2f7',
    horizonColor: '#eef2f6',
    fogColor: '#f2f1ed',
  };
}

const mapSubsurfaceState = new WeakMap<
  maplibregl.Map,
  { mix: number; theme: MapTheme; buildingsXray: boolean }
>();

export function computeSubsurfaceMix(pitch: number, isFollowing = false): number {
  if (isFollowing) return Math.max(0.85, Math.min(1, (pitch - 8) / 14));
  if (pitch < 12) return 0;
  return Math.min(1, (pitch - 12) / 14);
}

export function setSubsurfaceMapMode(
  map: maplibregl.Map,
  mix: number,
  theme: MapTheme,
  force = false,
  buildingsXray = false
): void {
  const quantized = Math.round(Math.max(0, Math.min(1, mix)) * 20) / 20;
  const prev = mapSubsurfaceState.get(map);
  if (
    !force &&
    prev &&
    prev.mix === quantized &&
    prev.theme === theme &&
    prev.buildingsXray === buildingsXray
  ) {
    return;
  }
  const exitingBlueprint = Boolean(prev?.buildingsXray && !buildingsXray);
  mapSubsurfaceState.set(map, { mix: quantized, theme, buildingsXray });
  try {
    if (exitingBlueprint) {
      // Restore base theme colors when leaving Blueprint X-Ray mode
      for (const [layer, property, value] of getMapThemePaints(theme)) {
        if (map.getLayer(layer)) {
          map.setPaintProperty(layer, property as any, value);
        }
      }
    }
    const paints = buildingsXray
      ? getBlueprintXrayPaints(theme)
      : getSubsurfacePaints(quantized, theme);
    for (const [layer, property, value] of paints) {
      if (map.getLayer(layer)) {
        map.setPaintProperty(layer, property as any, value);
      }
    }
    // Keep 3D buildings 100% opaque Haussmann unless the user explicitly enables X-Ray mode.
    setBuildingsXrayMode(map, buildingsXray);
  } catch {
    // Graceful no-op in headless/stubbed maps
  }
}

if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

export const BUILDING_EXTRUSION_ZOOM = 14;
export const LOW_ZOOM_MAX_PITCH = 55;
export const HIGH_ZOOM_MAX_PITCH = 85;

/**
 * Allows deep 3D horizon tilt (up to 85°) as soon as 3D buildings are visible,
 * while still allowing comfortable 55° tilt at city/district zoom.
 */
export function maxPitchForZoom(zoom: number): number {
  if (zoom <= BUILDING_EXTRUSION_ZOOM) return LOW_ZOOM_MAX_PITCH;
  const ramp = Math.min(1, (zoom - BUILDING_EXTRUSION_ZOOM) / 1.2);
  return LOW_ZOOM_MAX_PITCH + ramp * (HIGH_ZOOM_MAX_PITCH - LOW_ZOOM_MAX_PITCH);
}

export type MapBounds = [[number, number], [number, number]];

export function applyMapLighting(map: maplibregl.Map, theme: MapTheme): void {
  if (typeof map.setLight !== 'function') return;
  try {
    const profile = computeParisDaylightProfile(theme);
    map.setLight({
      anchor: 'map',
      color: profile.lightColor,
      intensity: profile.lightIntensity,
      position: profile.lightPosition,
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
  const activeSubsurface = mapSubsurfaceState.get(map);
  const xrayActive = Boolean(activeSubsurface?.buildingsXray);
  applyBuildingsHaussmannStyle(map, theme, xrayActive);
  if (activeSubsurface && (activeSubsurface.mix > 0 || xrayActive)) {
    setSubsurfaceMapMode(map, activeSubsurface.mix, theme, true, xrayActive);
  }
  applyMapLighting(map, theme);
  applyMapSky(map, theme);
}

export function applyMapSky(map: maplibregl.Map, theme: MapTheme): void {
  if (typeof (map as { setSky?: unknown }).setSky !== 'function') return;
  try {
    const profile = computeParisDaylightProfile(theme);
    map.setSky({
      'sky-color': profile.skyColor,
      'horizon-color': profile.horizonColor,
      'fog-color': profile.fogColor,
      'sky-horizon-blend': 0.45,
      'horizon-fog-blend': 0.68,
      'fog-ground-blend': 0.65,
      'atmosphere-blend': theme === 'light' ? 0.45 : 0.55,
    });
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
    maxZoom: 20.5,
    pixelRatio: getOptimalPixelRatio(2, 1.5),
    maxTileCacheSize: isMobileGpuDevice() ? 96 : 256,
    fadeDuration: isMobileGpuDevice() ? 100 : 180,
    dragPan: {
      linearity: 0.11,
      maxSpeed: 420,
      deceleration: 4800,
    },
    attributionControl: false,
  });

  // Calm scroll/pinch zoom speed for precision around 3D stations
  map.scrollZoom.setWheelZoomRate(1 / 780);
  map.scrollZoom.setZoomRate(1 / 175);

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
    ensureHaussmannPatterns(map);
    applyMapSky(map, activeTheme);
    applyMapLighting(map, activeTheme);
    attachOvertureBuildings(map, activeTheme);
  });

  return map;
}
