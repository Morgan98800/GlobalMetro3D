import maplibregl from 'maplibre-gl';
import { PARIS_CENTER, DEFAULT_PITCH, DEFAULT_BEARING, DEFAULT_ZOOM } from '@paris-subway/shared';

export function createMap(containerId: string): maplibregl.Map {
  const map = new maplibregl.Map({
    container: containerId,
    style: {
      version: 8,
      sources: {
        'esri-dark': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': '#0E1512'
          }
        },
        {
          id: 'esri-dark-layer',
          type: 'raster',
          source: 'esri-dark',
          minzoom: 0,
          maxzoom: 18,
          paint: {
            'raster-opacity': 0.85,
            'raster-brightness-max': 0.75,
            'raster-contrast': 0.1
          }
        }
      ]
    },
    center: PARIS_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: DEFAULT_BEARING,
    maxPitch: 70,
    minZoom: 9,
    maxZoom: 18,
    attributionControl: false
  });

  // Add custom attribution bottom-right
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Données © Île-de-France Mobilités · OSM'
    }),
    'bottom-right'
  );

  return map;
}
