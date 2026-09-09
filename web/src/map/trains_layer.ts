import { ScatterplotLayer } from '@deck.gl/layers';
import { hexToRgba } from './deck_overlay';

export interface TrainMarker {
  id: string;
  line: string;
  lineName: string;
  colorHex: string;
  textColorHex: string;
  pos: [number, number];
  elevation?: number;
  brg: number;
  spd: number;
  speedMps?: number;
  delay: number;
  dest: string;
  next: string;
  conf: 'rt' | 'sched';
  shapeId?: string;
  currentDistM?: number;
  direction?: 0 | 1;
}

/**
 * Creates high-contrast train layers:
 * 1. Base Layer: Luminous high-contrast porcelain white marker with dark contrast outline,
 *    ensuring trains never blend into the track lines.
 * 2. Core Layer: Distinct line-colored jewel in the center with real-time gold/amber ring.
 */
export function createTrainsLayers(
  trains: TrainMarker[],
  selectedLineId: string | null,
  onHover: (info: any) => void,
  onClick: (train: TrainMarker) => void
): ScatterplotLayer[] {
  const filtered = selectedLineId ? trains.filter(t => t.line === selectedLineId) : trains;

  // 1. High-contrast white base with dark border (visible against any background and any colored track)
  const baseLayer = new ScatterplotLayer({
    id: 'subway-trains-base',
    data: filtered,
    pickable: true,
    opacity: 1.0,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 6,
    radiusMaxPixels: 15,
    getPosition: (d: TrainMarker) => [d.pos[0], d.pos[1], (d.elevation || 0) + 3],
    getRadius: 68,
    getFillColor: [255, 255, 255, 255], // Brilliant white body: maximum contrast over colored tracks
    getLineColor: [10, 16, 13, 255], // Deep charcoal border to cleanly separate from the track beneath
    getLineWidth: 2.5,
    lineWidthUnits: 'pixels',
    onHover,
    onClick: (info: any) => {
      if (info.object) {
        onClick(info.object as TrainMarker);
      }
    },
    updateTriggers: {
      getPosition: [trains],
      getLineColor: [trains]
    }
  });

  // 2. Line color core with real-time confidence ring
  const coreLayer = new ScatterplotLayer({
    id: 'subway-trains-core',
    data: filtered,
    pickable: false,
    opacity: 1.0,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 3.5,
    radiusMaxPixels: 9,
    getPosition: (d: TrainMarker) => [d.pos[0], d.pos[1], (d.elevation || 0) + 3.5],
    getRadius: 38,
    getFillColor: (d: TrainMarker) => hexToRgba(d.colorHex, 255), // Line identity
    getLineColor: (d: TrainMarker) => (d.conf === 'rt' ? [250, 204, 21, 255] : [255, 255, 255, 230]),
    getLineWidth: 1.5,
    lineWidthUnits: 'pixels',
    updateTriggers: {
      getPosition: [trains],
      getFillColor: [trains],
      getLineColor: [trains]
    }
  });

  return [baseLayer, coreLayer];
}
