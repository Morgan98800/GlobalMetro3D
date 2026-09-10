import { ScatterplotLayer } from '@deck.gl/layers';
import { hexToRgba } from './deck_overlay';
import type { Confidence } from '../sim/rt_matching';

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
  conf: Confidence;
  shapeId?: string;
  currentDistM?: number;
  direction?: 0 | 1;
  atStop?: boolean;
}

/**
 * Creates high-contrast train layers with 4 confidence levels:
 * - measured: Rame à quai / arrêt mesuré par PRIM (bague or éclatante #C9A227)
 * - bracketed: Rame encadrée entre 2 mesures réelles (bague laiton affirmée)
 * - extrapolated: Au-delà de la dernière mesure (bague ambrée discrète)
 * - scheduled: Horaire théorique GTFS sans mesure directe (bague opaline)
 */
export function createTrainsLayers(
  trains: TrainMarker[],
  selectedLineId: string | null,
  onHover: (info: any) => void,
  onClick: (train: TrainMarker) => void,
  zoom: number = 13
): ScatterplotLayer[] {
  const filtered = selectedLineId ? trains.filter(t => t.line === selectedLineId) : trains;

  const isLowZoom = zoom < 11.5 && !selectedLineId;
  const baseRadiusMin = isLowZoom ? 3 : zoom < 13 ? 4.5 : 6;
  const coreRadiusMin = isLowZoom ? 2 : zoom < 13 ? 3 : 4;

  // 1. High-contrast opaline white base with dark border
  const baseLayer = new ScatterplotLayer({
    id: 'subway-trains-base',
    data: filtered,
    pickable: true,
    opacity: 1.0,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: baseRadiusMin,
    radiusMaxPixels: 14,
    getPosition: (d: TrainMarker) => [d.pos[0], d.pos[1], (d.elevation || 0) + 4],
    getRadius: isLowZoom ? 35 : 68,
    getFillColor: [241, 239, 234, 255], // --opale
    getLineColor: [21, 14, 18, 255], // --laque border
    getLineWidth: isLowZoom ? 1.2 : 2.0,
    lineWidthUnits: 'pixels',
    autoHighlight: true,
    highlightColor: [255, 255, 255, 80],
    transitions: { getFillColor: { duration: 140 } },
    parameters: { depthTest: false, depthWriteEnabled: false } as any,
    onHover,
    onClick: (info: any) => {
      if (info.object) {
        onClick(info.object as TrainMarker);
      }
    },
    updateTriggers: {
      getPosition: [trains],
      getRadius: [zoom, selectedLineId],
      getLineColor: [trains]
    }
  });

  // 2. Line color core with 4-level confidence ring
  const coreLayer = new ScatterplotLayer({
    id: 'subway-trains-core',
    data: filtered,
    pickable: false,
    opacity: 1.0,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: coreRadiusMin,
    radiusMaxPixels: 9,
    getPosition: (d: TrainMarker) => [d.pos[0], d.pos[1], (d.elevation || 0) + 4.5],
    getRadius: isLowZoom ? 20 : 38,
    getFillColor: (d: TrainMarker) => hexToRgba(d.colorHex, 255), // Line identity
    getLineColor: (d: TrainMarker) => {
      if (d.conf === 'measured') return [255, 215, 0, 255]; // Or franc éclatant
      if (d.conf === 'bracketed') return [201, 162, 39, 240]; // Laiton affirmé
      if (d.conf === 'extrapolated') return [201, 162, 39, 130]; // Ambre discret
      return [241, 239, 234, 190]; // Opaline blanche théorique
    },
    getLineWidth: (d: TrainMarker) => {
      if (d.conf === 'measured' || d.conf === 'bracketed') return isLowZoom ? 1.4 : 2.0;
      if (d.conf === 'extrapolated') return isLowZoom ? 1.0 : 1.4;
      return isLowZoom ? 0.8 : 1.0;
    },
    lineWidthUnits: 'pixels',
    parameters: { depthTest: false, depthWriteEnabled: false } as any,
    updateTriggers: {
      getPosition: [trains],
      getRadius: [zoom, selectedLineId],
      getFillColor: [trains],
      getLineColor: [trains],
      getLineWidth: [trains]
    }
  });

  return [baseLayer, coreLayer];
}
