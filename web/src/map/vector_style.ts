import type { StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'dark' | 'light';

/** Dark, quiet vector style: neutral palette aligned with --fond, --surface, --bord, --inactif */
export function createVectorDarkStyle(theme: MapTheme = 'dark'): StyleSpecification {
  const light = theme === 'light';
  return {
    version: 8,
    name: 'Métro de Paris 3D — Noir Fonte Vectoriel',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': light ? '#E9E6DF' : 'rgba(0, 0, 0, 0)' } },
      // Palette parisienne : pierre calcaire, jardins et eau bleu-vert.
      {
        id: 'paris-woods', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'forest', 'scrub'],
        paint: {
          'fill-color': light ? '#B8C9AF' : ['interpolate', ['linear'], ['zoom'], 10, '#2A3A25', 15, '#495E35', 18, '#495E35'],
          'fill-opacity': light ? 0.65 : ['interpolate', ['linear'], ['zoom'], 10, 0.15, 13, 0.30, 15, 0.55, 18, 0.70]
        }
      },
      {
        id: 'paris-parks', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', minzoom: 11,
        paint: {
          'fill-color': light ? '#B8C9AF' : '#495E35',
          'fill-opacity': light ? 0.58 : ['interpolate', ['linear'], ['zoom'], 10, 0.20, 13, 0.35, 15, 0.55, 18, 0.70]
        }
      },
      {
        id: 'paris-water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', minzoom: 10,
        paint: { 'fill-color': light ? '#A9C9D0' : '#3A5056', 'fill-opacity': light ? 0.72 : 0.55 }
      },
      {
        id: 'paris-waterways', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', minzoom: 10,
        filter: ['in', 'class', 'river', 'canal', 'stream'],
        paint: {
          'line-color': light ? '#6E9EA5' : '#2A4550', 'line-opacity': light ? 0.65 : 0.60,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 2.2, 17, 4]
        }
      },
      {
        id: 'paris-canal-core', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', minzoom: 11,
        filter: ['in', 'class', 'canal', 'stream'],
        paint: {
          'line-color': '#2A4550', 'line-opacity': 0.60,
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
          'line-color': light ? '#B1AAA0' : '#2A2725', 'line-opacity': light ? 0.75 : 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 13, 1.1, 17, 1.8]
        }
      },
      {
        id: 'quiet-rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 11,
        filter: ['==', 'class', 'rail'],
        paint: { 'line-color': light ? '#A8A39B' : '#1C1A19', 'line-opacity': light ? 0.55 : 0.50, 'line-width': 1, 'line-dasharray': [3, 2] }
      },
      {
        id: 'quiet-roads', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 10,
        filter: ['in', 'class', 'minor', 'service', 'track', 'secondary', 'tertiary', 'primary', 'trunk', 'motorway'],
        paint: {
          'line-color': light ? '#B7B1A8' : '#221E1A', 'line-opacity': light ? 0.72 : 0.60,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.7, 17, 3.5]
        }
      },
      {
        id: 'paris-major-axes', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 13,
        filter: ['in', 'class', 'primary', 'trunk', 'motorway'],
        paint: {
          'line-color': light ? '#8E887F' : '#3A2E1C', 'line-opacity': light ? 0.48 : 0.35,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.1, 16, 2.2, 18, 3.4]
        }
      },
      {
        id: 'quiet-boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', minzoom: 10,
        filter: ['in', 'admin_level', 4, 6, 8],
        paint: { 'line-color': light ? '#A8A39B' : '#1C1A19', 'line-opacity': light ? 0.45 : 0.35, 'line-width': 1, 'line-dasharray': [4, 3] }
      },
      {
        id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
        layout: { visibility: 'visible' },
        filter: ['!=', 'hide_3d', true] as any,
        paint: {
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 18],
          'fill-extrusion-color': light ? '#F0CEAC' : ['interpolate', ['linear'], ['zoom'], 14, '#8A7560', 14.5, '#8A7560', 15.5, '#C4A98A', 16.5, '#F0CEAC', 18, '#F0CEAC'],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 0.15, 15.5, 0.35, 16.5, 0.65, 18, 0.75]
        }
      }
    ]
  };
}
