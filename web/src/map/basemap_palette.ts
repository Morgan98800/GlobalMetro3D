/**
 * Faïence basemap. The map is the ground the lines are drawn on: it must
 * recede so line colours carry the information. Cool slate by day, ink by night.
 *
 * applyFaienceBasemap() restyles any OpenMapTiles-schema style
 * (OpenFreeMap, MapTiler, Stadia…) by source-layer, so it survives
 * upstream style updates that rename layer ids.
 */
import { hexToRgba } from '../design/tokens';

export interface BasemapPalette {
  fond: string;
  eau: string;
  parc: string;
  bois: string;
  bati: string;
  bati3dBas: string;
  bati3dHaut: string;
  route: string;
  routeMajeure: string;
  ferre: string;
  limite: string;
  texte: string;
  texteEau: string;
  halo: string;
  /** Casing under metro lines and station discs */
  lisere: string;
  station: string;
  stationBord: string;
}

export const BASEMAP: Record<'jour' | 'nuit', BasemapPalette> = {
  jour: {
    fond: '#f2f1ed',
    eau: '#a6cfee',
    parc: '#cde3c5',
    bois: '#bed8b5',
    bati: '#eae8e2',
    bati3dBas: '#e6e2da',
    bati3dHaut: '#d1cbc0',
    route: '#ffffff',
    routeMajeure: '#fffaf0',
    ferre: '#c4c1b8',
    limite: '#c2bfb6',
    texte: '#3c3c43',
    texteEau: '#2f6ea2',
    halo: '#ffffff',
    lisere: '#ffffff',
    station: '#ffffff',
    stationBord: '#1d1d1f',
  },
  nuit: {
    fond: '#131518',
    eau: '#12283d',
    parc: '#1a2d21',
    bois: '#142219',
    bati: '#181b1f',
    bati3dBas: '#23262d',
    bati3dHaut: '#3a404c',
    route: '#23272f',
    routeMajeure: '#383f4c',
    ferre: '#2a2d34',
    limite: '#2c3038',
    texte: '#d1d3da',
    texteEau: '#639ec9',
    halo: '#131518',
    lisere: '#131518',
    station: '#f5f5f7',
    stationBord: '#131518',
  },
};

type Layer = { id: string; type: string; 'source-layer'?: string };
export interface MapLike {
  getStyle(): { layers?: Layer[] } | undefined;
  setPaintProperty(layerId: string, name: string, value: unknown): void;
}

function safe(map: MapLike, id: string, prop: string, value: unknown) {
  try {
    map.setPaintProperty(id, prop, value);
  } catch {
    /* layer without this property: ignore */
  }
}

export function applyFaienceBasemap(map: MapLike, theme: 'jour' | 'nuit') {
  const c = BASEMAP[theme];
  for (const l of map.getStyle()?.layers ?? []) {
    const sl = l['source-layer'] ?? '';
    if (l.type === 'background') safe(map, l.id, 'background-color', c.fond);
    else if (sl === 'water' && l.type === 'fill') safe(map, l.id, 'fill-color', c.eau);
    else if (sl === 'waterway' && l.type === 'line') safe(map, l.id, 'line-color', c.eau);
    else if ((sl === 'park' || sl === 'landcover' || sl === 'landuse') && l.type === 'fill') {
      const wood = /wood|forest/.test(l.id);
      safe(map, l.id, 'fill-color', wood ? c.bois : c.parc);
      safe(map, l.id, 'fill-opacity', 1);
    } else if (sl === 'building' && l.type === 'fill') safe(map, l.id, 'fill-color', c.bati);
    else if (sl === 'building' && l.type === 'fill-extrusion') {
      if (l.id.startsWith('overture-building')) {
        safe(map, l.id, 'fill-extrusion-color', [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'height'], ['*', ['coalesce', ['get', 'num_floors'], 4], 3.4], 14],
          0,
          c.bati3dBas,
          60,
          c.bati3dHaut,
        ]);
      } else {
        safe(map, l.id, 'fill-extrusion-color', [
          'interpolate',
          ['linear'],
          ['get', 'render_height'],
          6,
          c.bati3dBas,
          45,
          c.bati3dHaut,
        ]);
        safe(map, l.id, 'fill-extrusion-opacity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          13.4,
          0,
          14.0,
          1.0,
        ]);
      }
    } else if (sl === 'transportation' && l.type === 'line') {
      const rail = /rail|transit/.test(l.id);
      const major = /motorway|trunk|primary/.test(l.id);
      safe(map, l.id, 'line-color', rail ? c.ferre : major ? c.routeMajeure : c.route);
    } else if (sl === 'boundary' && l.type === 'line') safe(map, l.id, 'line-color', c.limite);
    else if (l.type === 'symbol') {
      safe(map, l.id, 'text-color', sl === 'water_name' ? c.texteEau : c.texte);
      safe(map, l.id, 'text-halo-color', c.halo);
      safe(map, l.id, 'text-halo-width', 1.4);
    }
  }
}

/** Width in px of a metro line by zoom: hairline at region scale, bold in town. */
export const LINE_WIDTH = [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  9,
  1.4,
  12,
  3,
  14,
  5,
  16,
  9,
] as const;
export const CASING_WIDTH = [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  9,
  2.6,
  12,
  5,
  14,
  8,
  16,
  13,
] as const;

/** MapLibre paint for a metro line drawn over its casing. */
export function metroLinePaint(color: string) {
  return { 'line-color': color, 'line-width': LINE_WIDTH, 'line-opacity': 1 };
}
export function metroCasingPaint(theme: 'jour' | 'nuit') {
  return { 'line-color': BASEMAP[theme].lisere, 'line-width': CASING_WIDTH };
}

/** Stations: white disc, ink ring. Interchanges read as bigger discs. */
export function stationPaint(theme: 'jour' | 'nuit') {
  const c = BASEMAP[theme];
  return {
    'circle-color': c.station,
    'circle-stroke-color': c.stationBord,
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      11,
      ['case', ['>', ['get', 'nbLignes'], 1], 3, 0],
      15,
      ['case', ['>', ['get', 'nbLignes'], 1], 7, 4.5],
    ],
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 15, 2],
  };
}

/** deck.gl PathLayer props for metro lines (pixel widths, rounded joints). */
export function deckLineProps(opts: { dimmed?: boolean } = {}) {
  return {
    widthUnits: 'pixels' as const,
    widthMinPixels: 1.5,
    capRounded: true,
    jointRounded: true,
    getColor: (d: { color: string }) => hexToRgba(d.color, opts.dimmed ? 70 : 255),
  };
}
