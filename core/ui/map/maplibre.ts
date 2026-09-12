import maplibregl from 'maplibre-gl';
import { createVectorDarkStyle, MapTheme } from './vector_style';

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

export function applyMapTheme(map: maplibregl.Map, theme: MapTheme): void {
  const paints: Array<[string, string, any]> = theme === 'light'
    ? [
      ['background', 'background-color', '#E9E6DF'],
      ['paris-woods', 'fill-color', '#B8C9AF'], ['paris-parks', 'fill-color', '#B8C9AF'],
      ['paris-water', 'fill-color', '#A9C9D0'], ['paris-waterways', 'line-color', '#6E9EA5'],
      ['paris-ring-road', 'line-color', '#B1AAA0'], ['quiet-rail', 'line-color', '#A8A39B'],
      ['quiet-roads', 'line-color', '#B7B1A8'], ['paris-major-axes', 'line-color', '#8E887F'],
      ['quiet-boundary', 'line-color', '#A8A39B'], ['building-3d', 'fill-extrusion-color', '#F0CEAC']
    ]
    : [
      ['background', 'background-color', 'rgba(0, 0, 0, 0)'],
      ['paris-woods', 'fill-color', ['interpolate', ['linear'], ['zoom'], 10, '#2A3A25', 15, '#495E35', 18, '#495E35']],
      ['paris-parks', 'fill-color', '#495E35'],
      ['paris-water', 'fill-color', '#3A5056'], ['paris-waterways', 'line-color', '#2A4550'],
      ['paris-ring-road', 'line-color', '#2A2725'], ['quiet-rail', 'line-color', '#1C1A19'],
      ['quiet-roads', 'line-color', '#221E1A'], ['paris-major-axes', 'line-color', '#3A2E1C'],
      ['quiet-boundary', 'line-color', '#1C1A19'],
      ['building-3d', 'fill-extrusion-color', ['interpolate', ['linear'], ['zoom'], 14, '#8A7560', 14.5, '#8A7560', 15.5, '#C4A98A', 16.5, '#F0CEAC', 18, '#F0CEAC']]
    ];
  for (const [layer, property, value] of paints) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property as any, value);
  }
}

function facadesExperimentEnabled(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('facades') === '1';
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
      const isWindow = (x % horizontalGap >= 3 && x % horizontalGap < 3 + windowWidth)
        && (y % verticalGap >= 3 && y % verticalGap < 3 + windowHeight);
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

export function createMap(
  containerId: string,
  options: { initialBounds?: MapBounds; maxBounds?: MapBounds } = {}
): maplibregl.Map {
  const theme: MapTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const map = new maplibregl.Map({
    container: containerId,
    style: createVectorDarkStyle(theme),
    ...(options.initialBounds ? { bounds: options.initialBounds } : {}),
    ...(options.maxBounds ? { maxBounds: options.maxBounds } : {}),
    // The initial viewport is fitted from the loaded network geometry.
    pitch: 0,
    bearing: 0,
    maxPitch: HIGH_ZOOM_MAX_PITCH,
    maxZoom: 18,
    attributionControl: false
  });

  // Custom attribution bottom-right: OpenMapTiles, OpenStreetMap, IDFM
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '© <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · IDFM ODbL'
    }),
    'bottom-right'
  );

  map.on('style.load', () => {
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
