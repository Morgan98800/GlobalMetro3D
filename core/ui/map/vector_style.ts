import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'dark' | 'light';

/**
 * Overture Maps `id` / `building_id` values for our 6 hero 3D GLB landmarks
 * (Tour Eiffel, Arc de Triomphe, Sacré-Cœur, Invalides, Tour Montparnasse, Panthéon)
 * so Overture extrusions never render overlapping blocks on top of our GLBs.
 */
export const HERO_LANDMARK_OVERTURE_IDS: readonly string[] = [
  '930b868b-1163-4f10-b7ee-d3e3bf82bf7a', // Tour Eiffel
  '0b56b855-1a46-4415-97a8-a5dac4b11874', // Arc de Triomphe
  'f37ff5b3-0277-4a36-aa41-e4f9fad6244b', // Sacré-Cœur
  '842cd9ed-f546-4fea-a518-c0fa0233db28', // Hôtel des Invalides
  '54387c0a-6cb3-4e6c-a607-342198dc81a2', // Tour Montparnasse
  '74b3ba3c-91cd-47df-9112-959c3a130a97', // Ensemble Maine-Montparnasse
  '1be3a05e-d464-4298-8612-5ada3442c735', // Panthéon
];

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
    // Apple Maps Dark / Obsidian neutral graphite (zero electric cobalt wash)
    background: '#131518',
    landuseUrban: '#181b1f',
    landuseCivic: '#1d2026',
    landuseRail: '#181a1e',
    landuseCemetery: '#17231c',
    woods: '#142219',
    parks: '#1a2d21',
    water: '#12283d',
    waterLine: '#1b3a57',
    canalCore: '#16314a',
    boundary: '#2c3038',
    tunnelRoad: '#1b1e24',
    pedestrian: '#22262e',
    roadMinorCasing: '#0e1013',
    roadMinor: '#23272f',
    roadSecondaryCasing: '#0c0e11',
    roadSecondary: '#2d323c',
    roadMajorCasing: '#0a0c0e',
    roadMajor: '#383f4c',
    roadDivider: 'rgba(235, 237, 242, 0.16)',
    rail: '#2a2d34',
    bridgeCasing: '#0b0d10',
    bridgeCore: '#3e4654',
    labelWater: '#639ec9',
    labelPlace: 'rgba(236, 238, 242, 0.72)',
    labelRoad: 'rgba(205, 208, 216, 0.56)',
    labelHalo: 'rgba(15, 17, 21, 0.92)',
    bldgLow: '#1d222d',
    bldgMid: '#2a3242',
    bldgHigh: '#3c485e',
    bldgPartLow: '#34323b',
    bldgPartHigh: '#5e5447',
  },
  light: {
    // Apple Maps Day / Parchment crisp architectural stone & soft greenery
    background: '#f2f1ed',
    landuseUrban: '#eae8e2',
    landuseCivic: '#e5e2da',
    landuseRail: '#e4e2dc',
    landuseCemetery: '#d5e4cf',
    woods: '#bed8b5',
    parks: '#cde3c5',
    water: '#a6cfee',
    waterLine: '#84bce6',
    canalCore: '#95c6ea',
    boundary: '#c2bfb6',
    tunnelRoad: '#dedcd5',
    pedestrian: '#ebe7de',
    roadMinorCasing: '#d9d6ce',
    roadMinor: '#ffffff',
    roadSecondaryCasing: '#cac6bc',
    roadSecondary: '#ffffff',
    roadMajorCasing: '#d1c6a5',
    roadMajor: '#fffaf0',
    roadDivider: 'rgba(140, 134, 122, 0.28)',
    rail: '#c4c1b8',
    bridgeCasing: '#c0bcb2',
    bridgeCore: '#ffffff',
    labelWater: '#2f6ea2',
    labelPlace: 'rgba(42, 42, 46, 0.80)',
    labelRoad: 'rgba(66, 66, 72, 0.72)',
    labelHalo: 'rgba(255, 255, 255, 0.95)',
    bldgLow: '#e6e2da',
    bldgMid: '#ddd8ce',
    bldgHigh: '#d1cbc0',
    bldgPartLow: '#e0dbd1',
    bldgPartHigh: '#c8c1b4',
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
    ['roads-pedestrian', 'line-color', p.pedestrian],
    ['roads-pedestrian-area', 'fill-color', p.pedestrian],
    ['roads-minor-casing', 'line-color', p.roadMinorCasing],
    ['roads-minor', 'line-color', p.roadMinor],
    ['roads-secondary-casing', 'line-color', p.roadSecondaryCasing],
    ['roads-secondary', 'line-color', p.roadSecondary],
    ['roads-major-casing', 'line-color', p.roadMajorCasing],
    ['roads-major', 'line-color', p.roadMajor],
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

/**
 * Computes opacity paint overrides for smooth Metroskop-style subsurface transparency
 * when pitched in 3D (`mix` in `[0..1]`), restoring crisp opaque surface styling at `mix === 0`.
 */
export function getSubsurfacePaints(
  mix: number,
  theme: MapTheme
): Array<[string, string, unknown]> {
  const m = Math.max(0, Math.min(1, mix));
  const lerp = (a: number, b: number) => Number((a + (b - a) * m).toFixed(3));
  const light = theme === 'light';
  const restoreFull = m <= 0.01;

  return [
    ['landuse-urban', 'fill-opacity', restoreFull ? 0.68 : lerp(0.68, 0.28)],
    ['landuse-civic', 'fill-opacity', restoreFull ? 0.78 : lerp(0.78, 0.3)],
    ['landuse-rail', 'fill-opacity', restoreFull ? 0.84 : lerp(0.84, 0.28)],
    ['landuse-cemetery', 'fill-opacity', restoreFull ? 0.78 : lerp(0.78, 0.34)],
    [
      'paris-woods',
      'fill-opacity',
      restoreFull
        ? light
          ? 0.82
          : ['interpolate', ['linear'], ['zoom'], 10, 0.45, 14, 0.78, 17, 0.88]
        : lerp(0.82, 0.48),
    ],
    [
      'paris-parks',
      'fill-opacity',
      restoreFull
        ? light
          ? 0.8
          : ['interpolate', ['linear'], ['zoom'], 10, 0.48, 14, 0.8, 17, 0.9]
        : lerp(0.8, 0.5),
    ],
    ['paris-water', 'fill-opacity', lerp(light ? 0.9 : 0.94, 0.66)],
    ['paris-waterways', 'line-opacity', lerp(0.82, 0.62)],
    ['paris-canal-core', 'line-opacity', lerp(0.8, 0.62)],
    ['roads-pedestrian-area', 'fill-opacity', lerp(0.74, 0.34)],
    ['roads-pedestrian', 'line-opacity', lerp(0.88, 0.58)],
    ['roads-minor-casing', 'line-opacity', lerp(0.88, 0.46)],
    ['roads-secondary-casing', 'line-opacity', lerp(0.92, 0.52)],
    ['roads-major-casing', 'line-opacity', lerp(0.96, 0.58)],
    ['roads-minor', 'line-opacity', lerp(0.96, 0.64)],
    ['roads-secondary', 'line-opacity', lerp(1.0, 0.72)],
    ['roads-major', 'line-opacity', lerp(1.0, 0.8)],
    ['roads-bridge-casing', 'line-opacity', lerp(1.0, 0.82)],
    ['roads-bridge', 'line-opacity', lerp(1.0, 0.82)],
  ];
}

/**
 * Architectural Blueprint / Cutaway paints for explicit opt-in Subsurface X-Ray mode:
 * crisp fine wireframe road grid over deep slate/blueprint ground so underground
 * multi-level stations, transfer shafts, and glowing tunnels stand out effortlessly.
 */
export function getBlueprintXrayPaints(theme: MapTheme): Array<[string, string, unknown]> {
  const light = theme === 'light';
  const wireMinor = light ? '#7b93b2' : '#3a6b9e';
  const wireMajor = light ? '#4a6b94' : '#58a6e8';
  return [
    ['background', 'background-color', light ? '#e7edf5' : '#060c18'],
    ['landuse-urban', 'fill-opacity', 0.08],
    ['landuse-civic', 'fill-opacity', 0.1],
    ['landuse-rail', 'fill-opacity', 0.12],
    ['landuse-cemetery', 'fill-opacity', 0.1],
    ['paris-woods', 'fill-opacity', 0.16],
    ['paris-parks', 'fill-opacity', 0.16],
    ['paris-water', 'fill-opacity', light ? 0.36 : 0.42],
    ['paris-waterways', 'line-opacity', 0.32],
    ['paris-canal-core', 'line-opacity', 0.32],
    ['roads-pedestrian-area', 'fill-opacity', 0.1],
    ['roads-pedestrian', 'line-opacity', 0.3],
    ['roads-minor-casing', 'line-opacity', 0.08],
    ['roads-secondary-casing', 'line-opacity', 0.1],
    ['roads-major-casing', 'line-opacity', 0.14],
    ['roads-minor', 'line-color', wireMinor],
    ['roads-minor', 'line-opacity', light ? 0.42 : 0.38],
    ['roads-secondary', 'line-color', wireMajor],
    ['roads-secondary', 'line-opacity', light ? 0.52 : 0.48],
    ['roads-major', 'line-color', wireMajor],
    ['roads-major', 'line-opacity', light ? 0.62 : 0.58],
    ['roads-bridge-casing', 'line-opacity', 0.18],
    ['roads-bridge', 'line-color', wireMajor],
    ['roads-bridge', 'line-opacity', 0.62],
  ];
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
      minzoom: 13.2,
      maxzoom: 16,
      filter: ['in', 'class', 'suburb', 'quarter', 'neighbourhood'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13.2, 10, 15.5, 12],
        'text-letter-spacing': 0.04,
        'text-allow-overlap': false,
        'symbol-sort-key': 10,
      },
      paint: {
        'text-color': p.labelPlace,
        'text-opacity': 0.52,
        'text-halo-color': p.labelHalo,
        'text-halo-width': 1.2,
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
      id: 'poi-landmarks',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 12.8,
      filter: [
        'all',
        ['<=', ['coalesce', ['get', 'rank'], 10], 5],
        [
          'match',
          ['get', 'class'],
          ['railway', 'park', 'attraction', 'museum', 'stadium', 'monument'],
          true,
          false,
        ],
      ] as any,
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12.8, 10, 16, 12],
        'text-max-width': 10,
        'text-optional': true,
      },
      paint: {
        'text-color': p.labelPlace,
        'text-halo-color': p.labelHalo,
        'text-halo-width': 1.3,
      },
    },
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13.0,
      layout: { visibility: 'visible' },
      filter: [
        'all',
        ['!=', ['get', 'hide_3d'], true],
        ['<', ['coalesce', ['get', 'render_height'], 0], 190],
      ] as any,
      paint: {
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 16],
        'fill-extrusion-color': buildingHeightColorExpr(p.bldgLow, p.bldgMid, p.bldgHigh),
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': 0.8,
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
