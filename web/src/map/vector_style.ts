import type { StyleSpecification } from 'maplibre-gl';

/** Dark, quiet vector style: neutral palette aligned with --fond, --surface, --bord, --inactif */
export function createVectorDarkStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Métro de Paris 3D — Noir Fonte Vectoriel',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      terrain: {
        type: 'raster-dem',
        tiles: ['https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 12
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': 'rgba(0, 0, 0, 0)' } },
      // Outside the core, water and vegetation are deliberately subdued in neutral tones
      {
        id: 'paris-woods', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'forest', 'scrub'],
        paint: { 'fill-color': '#22351E', 'fill-opacity': 0.45 }
      },
      {
        id: 'paris-parks', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', minzoom: 11,
        paint: { 'fill-color': '#22351E', 'fill-opacity': 0.40 }
      },
      {
        id: 'paris-water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', minzoom: 10,
        paint: { 'fill-color': '#18292B', 'fill-opacity': 0.55 }
      },
      {
        id: 'paris-waterways', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', minzoom: 10,
        filter: ['in', 'class', 'river', 'canal', 'stream'],
        paint: {
          'line-color': '#1E3234', 'line-opacity': 0.50,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 2.2, 17, 4]
        }
      },
      {
        id: 'paris-canal-core', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', minzoom: 11,
        filter: ['in', 'class', 'canal', 'stream'],
        paint: {
          'line-color': '#24413E', 'line-opacity': 0.50,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 15, 1.4, 17, 2.4]
        }
      },
      {
        id: 'paris-ring-road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 9,
        filter: ['all', ['in', 'class', 'motorway', 'trunk', 'primary'], [
          'any', ['==', 'name', 'Boulevard périphérique'], ['==', 'name', 'Boulevard Périphérique'],
          ['==', 'name', 'Périphérique'], ['==', 'name:fr', 'Boulevard périphérique'],
          ['==', 'name:fr', 'Boulevard Périphérique'], ['==', 'ref', 'BP']
        ]] as any,
        paint: {
          'line-color': '#2A2725', 'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 13, 1.1, 17, 1.8]
        }
      },
      {
        id: 'quiet-rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 11,
        filter: ['==', 'class', 'rail'],
        paint: { 'line-color': '#1C1A19', 'line-opacity': 0.50, 'line-width': 1, 'line-dasharray': [3, 2] }
      },
      {
        id: 'quiet-roads', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 10,
        filter: ['in', 'class', 'minor', 'service', 'track', 'secondary', 'tertiary', 'primary', 'trunk', 'motorway'],
        paint: {
          'line-color': '#221E1A', 'line-opacity': 0.60,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.7, 17, 3.5]
        }
      },
      {
        id: 'paris-major-axes', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 13,
        filter: ['in', 'class', 'primary', 'trunk', 'motorway'],
        paint: {
          'line-color': '#3A2E1C', 'line-opacity': 0.35,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.1, 16, 2.2, 18, 3.4]
        }
      },
      {
        id: 'quiet-boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', minzoom: 10,
        filter: ['in', 'admin_level', 4, 6, 8],
        paint: { 'line-color': '#1C1A19', 'line-opacity': 0.35, 'line-width': 1, 'line-dasharray': [4, 3] }
      },
      {
        id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
        layout: { visibility: 'visible' },
        filter: ['!=', 'hide_3d', true] as any,
        paint: {
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 18],
          'fill-extrusion-color': '#403A31',
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 0.28, 16, 0.70, 18, 0.70]
        }
      }
    ]
  };
}
