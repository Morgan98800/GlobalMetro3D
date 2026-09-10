import maplibregl from 'maplibre-gl';
import { createVectorDarkStyle } from './vector_style';

export const BUILDING_EXTRUSION_ZOOM = 13;
export const LOW_ZOOM_MAX_PITCH = 30;
export const HIGH_ZOOM_MAX_PITCH = 60;

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

export function createMap(
  containerId: string,
  options: { initialBounds?: MapBounds; maxBounds?: MapBounds } = {}
): maplibregl.Map {
  const map = new maplibregl.Map({
    container: containerId,
    style: createVectorDarkStyle(),
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

  // Terrain DEM pour les collines parisiennes (Montmartre, Belleville, Sainte-Geneviève)
  map.on('style.load', () => {
    try {
      if (map.getSource('terrain')) {
        map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
      }
    } catch (err) {
      console.warn('[map] Could not initialize terrain DEM:', err);
    }
  });

  return map;
}
