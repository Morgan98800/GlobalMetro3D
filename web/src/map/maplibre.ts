import maplibregl from 'maplibre-gl';
import { PARIS_CENTER, DEFAULT_PITCH, DEFAULT_BEARING, DEFAULT_ZOOM } from '@paris-subway/shared';
import { createVectorDarkStyle } from './vector_style';

export function createMap(containerId: string): maplibregl.Map {
  const map = new maplibregl.Map({
    container: containerId,
    style: createVectorDarkStyle(),
    center: PARIS_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: DEFAULT_BEARING,
    maxPitch: 70,
    minZoom: 9,
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

  return map;
}
