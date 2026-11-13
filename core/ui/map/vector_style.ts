import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'dark' | 'light';

interface ThemePalette {
  background: string;
  landuseUrban: string;
  landuseCivic: string;
  landuseRail: string;
  landuseCemetery: string;
  woods: string;
  parks: string;
  water: string;
  waterLine: string;
  canalCore: string;
  boundary: string;
  tunnelRoad: string;
  pedestrian: string;
  roadMinorCasing: string;
  roadMinor: string;
  roadSecondaryCasing: string;
  roadSecondary: string;
  roadMajorCasing: string;
  roadMajor: string;
  roadDivider: string;
  rail: string;
  bridgeCasing: string;
  bridgeCore: string;
  labelWater: string;
  labelPlace: string;
  labelRoad: string;
  labelHalo: string;
  bldgLow: string;
  bldgMid: string;
  bldgHigh: string;
  bldgPartLow: string;
  bldgPartHigh: string;
}

const PALETTES: Record<MapTheme, ThemePalette> = {
  dark: {
    background: '#0d0f14',
    landuseUrban: '#12151c',
    landuseCivic: '#171b24',
    landuseRail: '#15141a',
    landuseCemetery: '#162119',
    woods: '#1d2d20',
    parks: '#233726',
    water: '#162834',
    waterLine: '#1d3646',
    canalCore: '#19303e',
    boundary: '#272a32',
    tunnelRoad: '#181b22',
    pedestrian: '#23262e',
    roadMinorCasing: '#0c0e13',
    roadMinor: '#1d2129',
    roadSecondaryCasing: '#0a0c10',
    roadSecondary: '#252a34',
    roadMajorCasing: '#090b0f',
    roadMajor: '#2d3340',
    roadDivider: 'rgba(218, 212, 200, 0.16)',
    rail: '#242329',
    bridgeCasing: '#090b0f',
    bridgeCore: '#323845',
    labelWater: '#4f7a92',
    labelPlace: 'rgba(222, 216, 204, 0.52)',
    labelRoad: 'rgba(205, 199, 188, 0.42)',
    labelHalo: 'rgba(11, 13, 18, 0.85)',
    bldgLow: '#47413a',
    bldgMid: '#5e5347',
    bldgHigh: '#7a6b5b',
    bldgPartLow: '#665a4d',
    bldgPartHigh: '#8e7c67',
  },
  light: {
    background: '#ece9e1',
    landuseUrban: '#e5e1d8',
    landuseCivic: '#dfd9ce',
    landuseRail: '#dedad2',
    landuseCemetery: '#d5dfcf',
    woods: '#bccfb2',
    parks: '#c7d9bd',
    water: '#a9c7d2',
    waterLine: '#7ba7b7',
    canalCore: '#88b3c2',
    boundary: '#bcb6ab',
    tunnelRoad: '#d6d1c8',
    pedestrian: '#dfd9ce',
    roadMinorCasing: '#cfc9be',
    roadMinor: '#f9f7f2',
    roadSecondaryCasing: '#c2bbb0',
    roadSecondary: '#ffffff',
    roadMajorCasing: '#b2aba0',
    roadMajor: '#fffdf9',
    roadDivider: 'rgba(140, 132, 120, 0.28)',
    rail: '#b9b3a8',
    bridgeCasing: '#a59e92',
    bridgeCore: '#ffffff',
    labelWater: '#4b7a8c',
    labelPlace: 'rgba(62, 58, 52, 0.62)',
    labelRoad: 'rgba(84, 78, 70, 0.54)',
    labelHalo: 'rgba(246, 243, 237, 0.9)',
    bldgLow: '#e3dcd0',
    bldgMid: '#dad0c0',
    bldgHigh: '#cfc3b0',
    bldgPartLow: '#d7cdbd',
    bldgPartHigh: '#c7b8a2',
  },
};

function buildingHeightColorExpr(
  low: string,
  mid: string,
  high: string,
  heightProp = 'render_height'
): any {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', heightProp], 14],
    6,
    low,
    22,
    mid,
    45,
    high,
  ];
}

export function getMapThemePaints(theme: MapTheme): Array<[string, string, unknown]> {
  const p = PALETTES[theme];
  return [
    ['background', 'background-color', p.background],
    ['landuse-urban', 'fill-color', p.landuseUrban],
    ['landuse-civic', 'fill-color', p.landuseCivic],
    ['landuse-rail', 'fill-color', p.landuseRail],
    ['landuse-cemetery', 'fill-color', p.landuseCemetery],
    ['paris-woods', 'fill-color', p.woods],
    ['paris-parks', 'fill-color', p.parks],
    ['paris-water', 'fill-color', p.water],
    ['paris-waterways', 'line-color', p.waterLine],
    ['paris-canal-core', 'line-color', p.canalCore],
    ['quiet-boundary', 'line-color', p.boundary],
    ['roads-tunnel', 'line-color', p.tunnelRoad],
    ['roads-pedestrian', 'line-color', p.pedestrian],
    ['roads-pedestrian-area', 'fill-color', p.pedestrian],
    ['roads-minor-casing', 'line-color', p.roadMinorCasing],
    ['roads-minor', 'line-color', p.roadMinor],
    ['roads-secondary-casing', 'line-color', p.roadSecondaryCasing],
    ['roads-secondary', 'line-color', p.roadSecondary],
    ['roads-major-casing', 'line-color', p.roadMajorCasing],
    ['roads-major', 'line-color', p.roadMajor],
    ['roads-centerlines', 'line-color', p.roadDivider],
    ['quiet-rail', 'line-color', p.rail],
    ['roads-bridge-casing', 'line-color', p.bridgeCasing],
    ['roads-bridge', 'line-color', p.bridgeCore],
    ['water-label', 'text-color', p.labelWater],
    ['water-label', 'text-halo-color', p.labelHalo],
    ['place-label', 'text-color', p.labelPlace],
    ['place-label', 'text-halo-color', p.labelHalo],
    ['road-label', 'text-color', p.labelRoad],
    ['road-label', 'text-halo-color', p.labelHalo],
    [
      'building-3d',
      'fill-extrusion-color',
      buildingHeightColorExpr(p.bldgLow, p.bldgMid, p.bldgHigh),
    ],
    [
      'overture-building-3d',
      'fill-extrusion-color',
      buildingHeightColorExpr(p.bldgLow, p.bldgMid, p.bldgHigh, 'height'),
    ],
    [
      'overture-building-part-3d',
      'fill-extrusion-color',
      buildingHeightColorExpr(p.bldgPartLow, p.bldgMid, p.bldgPartHigh, 'height'),
    ],
  ];
}

export function getOvertureBuildingThemeColors(theme: MapTheme) {
  const p = PALETTES[theme];
  return {
    buildingColor: buildingHeightColorExpr(p.bldgLow, p.bldgMid, p.bldgHigh, 'height'),
    partColor: buildingHeightColorExpr(p.bldgPartLow, p.bldgMid, p.bldgPartHigh, 'height'),
  };
}

/** Rich urban OpenFreeMap vector style with casings, bridges, plazas, labels, and light parity. */
export function createVectorDarkStyle(theme: MapTheme = 'dark'): StyleSpecification {
  const p = PALETTES[theme];
  const light = theme === 'light';

  const layers: LayerSpecification[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': p.background },
    },
    {
      id: 'landuse-urban',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      minzoom: 10,
      filter: ['in', 'class', 'residential', 'commercial', 'retail', 'industrial', 'suburb'],
      paint: { 'fill-color': p.landuseUrban, 'fill-opacity': 0.55 },
    },
    {
      id: 'landuse-civic',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      minzoom: 12,
      filter: ['in', 'class', 'hospital', 'school', 'university', 'college', 'stadium', 'pitch'],
      paint: { 'fill-color': p.landuseCivic, 'fill-opacity': 0.72 },
    },
    {
      id: 'landuse-rail',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      minzoom: 11,
      filter: ['==', 'class', 'railway'],
      paint: { 'fill-color': p.landuseRail, 'fill-opacity': 0.8 },
    },
    {
      id: 'landuse-cemetery',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      minzoom: 12,
      filter: ['==', 'class', 'cemetery'],
      paint: { 'fill-color': p.landuseCemetery, 'fill-opacity': 0.72 },
    },
    {
      id: 'paris-woods',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      minzoom: 10,
      filter: ['in', 'class', 'wood', 'forest', 'scrub', 'grass'],
      paint: {
        'fill-color': p.woods,
        'fill-opacity': light
          ? 0.72
          : ['interpolate', ['linear'], ['zoom'], 10, 0.35, 14, 0.7, 17, 0.82],
      },
    },
    {
      id: 'paris-parks',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      minzoom: 10,
      paint: {
        'fill-color': p.parks,
        'fill-opacity': light
          ? 0.68
          : ['interpolate', ['linear'], ['zoom'], 10, 0.38, 14, 0.72, 17, 0.85],
      },
    },
    {
      id: 'paris-water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      minzoom: 8,
      paint: { 'fill-color': p.water, 'fill-opacity': light ? 0.86 : 0.92 },
    },
    {
      id: 'paris-waterways',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      minzoom: 10,
      filter: ['in', 'class', 'river', 'canal', 'stream'],
      paint: {
        'line-color': p.waterLine,
        'line-opacity': 0.75,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 14, 2.4, 17, 4.5],
      },
    },
    {
      id: 'paris-canal-core',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      minzoom: 11,
      filter: ['in', 'class', 'canal', 'stream'],
      paint: {
        'line-color': p.canalCore,
        'line-opacity': 0.72,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.5, 17, 2.6],
      },
    },
    {
      id: 'quiet-boundary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      minzoom: 10,
      filter: ['in', 'admin_level', 4, 6, 8],
      paint: {
        'line-color': p.boundary,
        'line-opacity': 0.42,
        'line-width': 1,
        'line-dasharray': [4, 3],
      },
    },
    {
      id: 'roads-tunnel',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', ['==', 'brunnel', 'tunnel'], ['!=', 'class', 'rail']],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': p.tunnelRoad,
        'line-opacity': 0.55,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 1, 17, 6],
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'roads-pedestrian-area',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 13.5,
      filter: ['all', ['==', '$type', 'Polygon'], ['in', 'class', 'pedestrian', 'path', 'service']],
      paint: { 'fill-color': p.pedestrian, 'fill-opacity': 0.85 },
    },
    {
      id: 'roads-pedestrian',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 13.5,
      filter: [
        'all',
        ['==', '$type', 'LineString'],
        ['in', 'class', 'pedestrian', 'path', 'steps'],
        ['!=', 'brunnel', 'bridge'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.pedestrian,
        'line-opacity': 0.78,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13.5, 0.8, 17, 3.8],
      },
    },
    {
      id: 'roads-minor-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: [
        'all',
        ['!=', 'brunnel', 'bridge'],
        ['!=', 'brunnel', 'tunnel'],
        ['in', 'class', 'minor', 'service', 'track'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.roadMinorCasing,
        'line-opacity': 0.85,
        'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 12, 0.8, 15, 3.4, 18, 9.5],
      },
    },
    {
      id: 'roads-secondary-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: [
        'all',
        ['!=', 'brunnel', 'bridge'],
        ['!=', 'brunnel', 'tunnel'],
        ['in', 'class', 'tertiary', 'secondary'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.roadSecondaryCasing,
        'line-opacity': 0.9,
        'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 11, 1.0, 15, 5.2, 18, 13.5],
      },
    },
    {
      id: 'roads-major-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 9,
      filter: [
        'all',
        ['!=', 'brunnel', 'bridge'],
        ['!=', 'brunnel', 'tunnel'],
        ['in', 'class', 'primary', 'trunk', 'motorway'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.roadMajorCasing,
        'line-opacity': 0.95,
        'line-width': [
          'interpolate',
          ['exponential', 1.55],
          ['zoom'],
          9,
          0.9,
          13,
          3.6,
          16,
          9.5,
          18,
          18.5,
        ],
      },
    },
    {
      id: 'roads-minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: [
        'all',
        ['!=', 'brunnel', 'bridge'],
        ['!=', 'brunnel', 'tunnel'],
        ['in', 'class', 'minor', 'service', 'track'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.roadMinor,
        'line-opacity': 0.95,
        'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 12, 0.5, 15, 2.3, 18, 7.6],
      },
    },
    {
      id: 'roads-secondary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 10.5,
      filter: [
        'all',
        ['!=', 'brunnel', 'bridge'],
        ['!=', 'brunnel', 'tunnel'],
        ['in', 'class', 'tertiary', 'secondary'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.roadSecondary,
        'line-opacity': 0.96,
        'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 10.5, 0.65, 15, 3.9, 18, 11],
      },
    },
    {
      id: 'roads-major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 9,
      filter: [
        'all',
        ['!=', 'brunnel', 'bridge'],
        ['!=', 'brunnel', 'tunnel'],
        ['in', 'class', 'primary', 'trunk', 'motorway'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.roadMajor,
        'line-opacity': 0.98,
        'line-width': [
          'interpolate',
          ['exponential', 1.55],
          ['zoom'],
          9,
          0.6,
          13,
          2.5,
          16,
          7.6,
          18,
          15.5,
        ],
      },
    },
    {
      id: 'roads-centerlines',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 15.5,
      filter: [
        'all',
        ['!=', 'brunnel', 'tunnel'],
        ['in', 'class', 'primary', 'trunk', 'motorway', 'secondary'],
      ],
      paint: {
        'line-color': p.roadDivider,
        'line-width': 1,
        'line-dasharray': [4, 4],
      },
    },
    {
      id: 'quiet-rail',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', ['==', 'class', 'rail'], ['!=', 'brunnel', 'tunnel']],
      paint: {
        'line-color': p.rail,
        'line-opacity': 0.65,
        'line-width': 1.2,
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'roads-bridge-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', ['==', 'brunnel', 'bridge'], ['!=', 'class', 'rail']],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': p.bridgeCasing,
        'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 11, 1.4, 15, 5.4, 18, 14.5],
      },
    },
    {
      id: 'roads-bridge',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', ['==', 'brunnel', 'bridge'], ['!=', 'class', 'rail']],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': p.bridgeCore,
        'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 11, 0.9, 15, 4.0, 18, 12],
      },
    },
    {
      id: 'water-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      minzoom: 11.5,
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Italic'],
        'text-size': 11,
        'symbol-placement': 'line',
        'text-max-angle': 30,
      },
      paint: {
        'text-color': p.labelWater,
        'text-halo-color': p.labelHalo,
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 11.5,
      maxzoom: 16,
      filter: ['in', 'class', 'suburb', 'quarter', 'neighbourhood', 'borough'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10.5, 15, 13],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
      },
      paint: {
        'text-color': p.labelPlace,
        'text-halo-color': p.labelHalo,
        'text-halo-width': 1.4,
      },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 15.2,
      filter: ['in', 'class', 'primary', 'secondary', 'pedestrian'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'symbol-placement': 'line',
        'text-rotation-alignment': 'map',
      },
      paint: {
        'text-color': p.labelRoad,
        'text-halo-color': p.labelHalo,
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13.5,
      layout: { visibility: 'visible' },
      filter: ['!=', 'hide_3d', true] as any,
      paint: {
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 15],
        'fill-extrusion-color': buildingHeightColorExpr(p.bldgLow, p.bldgMid, p.bldgHigh),
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13.5,
          0,
          14.3,
          0.35,
          15.5,
          0.68,
          16.8,
          0.86,
        ],
      },
    },
  ];

  return {
    version: 8,
    name: 'Métro de Paris 3D — Noir Fonte Vectoriel',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers,
  };
}
