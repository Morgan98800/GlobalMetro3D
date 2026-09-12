import { IconLayer } from '@deck.gl/layers';
import type { Confidence } from '@core/rt/rt_matching';

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
  isGhost?: boolean;
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
): IconLayer<TrainMarker>[] {
  const filtered = selectedLineId ? trains.filter(t => t.line === selectedLineId) : trains;

  const isLowZoom = zoom < 11.5 && !selectedLineId;
  const iconCache = new Map<string, { url: string; width: number; height: number; anchorY: number }>();
  const iconFor = (train: TrainMarker) => {
    const key = `${train.colorHex}-${train.conf}`;
    const cached = iconCache.get(key);
    if (cached) return cached;
    const border = train.conf === 'measured' ? '#FFD700'
      : train.conf === 'bracketed' ? '#C9A227'
        : train.conf === 'extrapolated' ? '#C9A227' : '#F1EFEA';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 2 30 16 16 30 2 16Z" fill="${train.colorHex}" stroke="${border}" stroke-width="2.5"/><path d="M16 8 24 16 16 24 8 16Z" fill="none" stroke="#F4F1EB" stroke-opacity=".72" stroke-width="1.5"/></svg>`;
    const icon = { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 32, height: 32, anchorY: 16 };
    iconCache.set(key, icon);
    return icon;
  };

  const markerLayer = new IconLayer<TrainMarker>({
    id: 'subway-trains-fallback',
    data: filtered,
    pickable: true,
    opacity: 1.0,
    getPosition: (d: TrainMarker) => [d.pos[0], d.pos[1], (d.elevation || 0) + 4],
    getIcon: iconFor,
    getSize: isLowZoom ? 28 : zoom < 13 ? 24 : 30,
    sizeUnits: 'pixels',
    sizeMinPixels: isLowZoom ? 20 : 18,
    sizeMaxPixels: 36,
    billboard: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 80],
    parameters: { depthTest: false, depthWriteEnabled: false } as any,
    onHover,
    onClick: (info: any) => {
      if (info.object) {
        onClick(info.object as TrainMarker);
      }
    },
    updateTriggers: {
      getPosition: [trains],
      getIcon: [trains],
      getSize: [zoom, selectedLineId]
    }
  });

  return [markerLayer];
}
