import { TextLayer } from '@deck.gl/layers';
import type { StationMetadata } from '@core/types';

type Point = [number, number];

// Complete Latin-1 Supplement + Latin Extended-A + French punctuation & typography
// (covers Montparnasse - Bienvenüe, Pont de Sèvres, Saint-Denis–Université, etc.)
export const LATIN_CHARACTER_SET = [
  ...Array.from({ length: 0x0180 - 0x20 }, (_, index) => String.fromCodePoint(0x20 + index)),
  '–', '—', '’', '‘', '“', '”', '…', '«', '»', '•', '·'
].join('');

const isUltraHub = (station: StationMetadata) =>
  station.lines.length >= 4 ||
  /^(Châtelet|Gare du Nord|Montparnasse|Saint-Lazare|Gare de Lyon|Gare de l'Est|Gare d'Austerlitz|République|Nation|Bastille|Charles de Gaulle|La Défense|Opéra|Denfert-Rochereau)$/i.test(station.name) ||
  /Châtelet - Les Halles|Montparnasse - Bienvenüe|Charles de Gaulle - Étoile|La Défense \(Grande Arche\)/i.test(station.name);

/**
 * Build a small, deterministic label set. deck.gl's TextLayer v9 does not
 * expose a collision filter, so labels are greedily packed in screen pixels
 * with a priority order (hub > interchange > simple > distance from center).
 */
export function createStationLabelsLayer(
  stations: StationMetadata[],
  selectedLineId: string | null,
  zoom: number,
  mapCenter: Point,
  lineElevation = 0
): TextLayer | null {
  const candidates = stations.filter(station => {
    // 1. Ligne sélectionnée : toutes les stations de la ligne sont candidates prioritaires
    if (selectedLineId) {
      return station.lines.includes(selectedLineId);
    }
    // 2. Vue éloignée (z < 12.5) : uniquement les 15 grands pôles ultra-majeurs
    if (zoom < 12.5) {
      return isUltraHub(station);
    }
    // 3. Zoom intermédiaire (12.5 <= z < 14.0) : correspondances (>= 2 lignes)
    if (zoom < 14.0) {
      return isUltraHub(station) || station.lines.length >= 2 || Boolean(station.is_hub);
    }
    // 4. Zoom rapproché (z >= 14.0) : toutes les stations et leurs noms
    return true;
  });
  if (!candidates.length) return null;

  const scale = 256 * Math.pow(2, zoom) / 360;
  const toPixels = (point: Point): Point => [
    (point[0] - mapCenter[0]) * scale,
    (point[1] - mapCenter[1]) * scale
  ];
  const mapEl = typeof document !== 'undefined' ? document.getElementById('map') : null;
  const dockEl = typeof document !== 'undefined' ? document.getElementById('dock') : null;
  const viewportWidth = mapEl?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
  const dockRect = dockEl?.getBoundingClientRect();
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  // Desktop dock overlays the left edge of the map; keep labels out of its
  // actual measured width. On mobile the dock is a bottom sheet, so no left
  // padding is needed.
  const leftLabelBoundary = !isMobile && dockRect ? dockRect.width + 28 : 0;
  const priority = (station: StationMetadata) => {
    const selected = selectedLineId && station.lines.includes(selectedLineId) ? 3 : 0;
    const hub = isUltraHub(station) ? 2 : station.lines.length >= 2 ? 1 : 0;
    const [x, y] = toPixels(station.coordinates);
    return selected * 100 + hub * 10 - Math.hypot(x, y) * 0.001;
  };
  const placed: Array<{ rect: [number, number, number, number]; selected: boolean }> = [];
  const pixelOffsets = new Map<string, [number, number]>();
  let selectedLabelIndex = 0;
  const selectedLanes = [-32, -16, 0, 16, 32];
  const ordered = candidates.slice().sort((a, b) => priority(b) - priority(a));
  // Selection raises priority, but every label still goes through the same
  // collision pass. Returning the complete selected list created a wall of
  // overlapping station names at high zoom.
  const visible = ordered.filter(station => {
      const [x, y] = toPixels(station.coordinates);
      // Reserve a little more than the nominal glyph width. Deck's SDF atlas
      // and anti-aliasing make tight rectangles look overlapped on dense hubs.
      const width = Math.max(28, station.name.length * 8.2) + 22;
      const selected = Boolean(selectedLineId && station.lines.includes(selectedLineId));
      const labelIndex = selected ? selectedLabelIndex++ : 0;
      const offsetY = selected ? selectedLanes[labelIndex % selectedLanes.length] : 0;
      const offsetX = selected && labelIndex % 2 === 1 ? -width - 12 : 12;
      pixelOffsets.set(station.id, [offsetX, offsetY]);
      const rect: [number, number, number, number] = [x + offsetX, y - 11 + offsetY, x + offsetX + width, y + 11 + offsetY];
      if (viewportWidth > 0 && viewportWidth / 2 + rect[0] < leftLabelBoundary) return false;
      const collides = placed.some(other => {
        const [ox1, oy1, ox2, oy2] = other.rect;
        return !(rect[2] < ox1 || rect[0] > ox2 || rect[3] < oy1 || rect[1] > oy2);
      });
      if (collides) return false;
      placed.push({ rect, selected });
      return true;
    });

  return new TextLayer<StationMetadata>({
    id: 'subway-station-labels',
    data: visible,
    pickable: false,
    billboard: true,
    getPosition: (d: StationMetadata) => [d.coordinates[0], d.coordinates[1], lineElevation + 8],
    getText: (d: StationMetadata) => d.name,
    getSize: 12,
    sizeUnits: 'pixels',
    sizeMinPixels: 11,
    sizeMaxPixels: 13,
    getColor: [241, 239, 234, 255], // --opale
    fontFamily: "'Switzer', 'Inter', -apple-system, sans-serif",
    fontWeight: 500,
    characterSet: LATIN_CHARACTER_SET,
    fontSettings: { sdf: true },
    outlineWidth: 1.4,
    outlineColor: [21, 14, 18, 255], // --laque
    maxWidth: -1,
    wordBreak: 'break-word',
    getTextAnchor: 'start',
    getAlignmentBaseline: 'center',
    getPixelOffset: (d: StationMetadata) => pixelOffsets.get(d.id) || [12, 0],
    background: false,
    updateTriggers: { getPosition: [selectedLineId, lineElevation, zoom, mapCenter], getText: [selectedLineId] }
  });
}
