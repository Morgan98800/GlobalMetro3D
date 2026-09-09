import { PathLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension, CollisionFilterExtension } from '@deck.gl/extensions';
import type { TrainMarker } from './trains_layer';
import { createTrainsLayers } from './trains_layer';
import type { ShapeEntry } from '../sim/shapes';
import { sliceShape, splitIntoCars } from '../sim/shapes';
import type { RollingStockDatabase, LineRollingStock } from '../sim/rolling_stock';
import { getRollingStockForLine } from '../sim/rolling_stock';
import { hexToRgba } from './deck_overlay';

export interface CapsuleLayerParams {
  trains: TrainMarker[];
  shapes: Map<string, ShapeEntry>;
  rollingStockDb: RollingStockDatabase;
  zoom: number;
  mapCenter: [number, number];
  selectedLineId: string | null;
  selectedTrainId?: string | null;
  onHover: (info: any) => void;
  onClick: (train: TrainMarker) => void;
}

export interface RenderOutlineSegment {
  path: [number, number][];
  widthM: number;
  color: [number, number, number, number];
  isSched: boolean;
  elevation: number;
  train: TrainMarker;
}

export interface RenderCarSegment {
  path: [number, number][];
  widthM: number;
  color: [number, number, number, number];
  elevation: number;
  train: TrainMarker;
}

export interface RenderTrainLabel {
  headPos: [number, number];
  lineName: string;
  colorHex: string;
  textColorHex: string;
  alpha: number;
  elevation: number;
  isSelected: boolean;
}

/**
 * Lightens a hex color by a given percentage in HSL color space.
 * Used for the train roof highlight (Layer 3).
 */
export function lightenHexToRgba(hex: string, percent: number = 25, alpha: number = 255): [number, number, number, number] {
  const c = hex.replace('#', '');
  if (c.length !== 6) return [255, 255, 255, alpha];
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  l = Math.min(1.0, l + percent / 100);

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let rOut: number, gOut: number, bOut: number;
  if (s === 0) {
    rOut = gOut = bOut = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rOut = hue2rgb(p, q, h + 1 / 3);
    gOut = hue2rgb(p, q, h);
    bOut = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(rOut * 255), Math.round(gOut * 255), Math.round(bOut * 255), alpha];
}

/**
 * Darkens a hex color by a given percentage in HSL color space.
 * Used for train body color (Layer 2, ~35% darker than line color).
 */
export function darkenHexToRgba(hex: string, percent: number = 35, alpha: number = 255): [number, number, number, number] {
  const c = hex.replace('#', '');
  if (c.length !== 6) return [30, 30, 30, alpha];
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  l = Math.max(0.0, l * (1 - percent / 100));

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let rOut: number, gOut: number, bOut: number;
  if (s === 0) {
    rOut = gOut = bOut = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rOut = hue2rgb(p, q, h + 1 / 3);
    gOut = hue2rgb(p, q, h);
    bOut = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(rOut * 255), Math.round(gOut * 255), Math.round(bOut * 255), alpha];
}

/**
 * Creates the 5-layer deck.gl capsule rendering stack:
 * 1. contour   — tranche entière non découpée, largeur = width + 1,2 m, teinte sombre
 * 2. caisses   — sous-tranches par voiture, largeur = width, couleur de ligne assombrie d'environ 35 %
 * 3. toit      — sous-tranches par voiture, largeur = width × 0,35, teinte éclaircie
 * 4. nez       — 2,5 m à la tête de la rame, largeur = width, teinte de livrée
 * 5. étiquettes — TextLayer positionné sur la tête de la rame
 */
export function createCapsuleLayers(params: CapsuleLayerParams): any[] {
  const {
    trains,
    shapes,
    rollingStockDb,
    zoom,
    mapCenter,
    selectedLineId,
    selectedTrainId,
    onHover,
    onClick
  } = params;

  const isMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

  // LOD thresholds:
  // Desktop: pastille < 12, capsule entière 12–13.5, pile complète > 13.5, étiquettes >= 13
  // Mobile:  pastille < 13, capsule entière 13–14.5, pile complète > 14.5, étiquettes >= 14
  const minCapsuleZoom = isMobile ? 13.0 : 12.0;
  const detailedZoom = isMobile ? 14.5 : 13.5;
  const labelZoom = isMobile ? 14.0 : 13.0;

  // Branch LOD BEFORE slicing loop: zero slicing computation for trains rendered as points
  if (zoom < minCapsuleZoom) {
    return createTrainsLayers(trains, selectedLineId, onHover, onClick);
  }

  let activeTrains = selectedLineId ? trains.filter(t => t.line === selectedLineId) : trains;

  // Mobile capping: max 150 closest to map center
  if (isMobile && activeTrains.length > 150) {
    const [cLon, cLat] = mapCenter;
    activeTrains = [...activeTrains]
      .sort((a, b) => {
        const dA = (a.pos[0] - cLon) ** 2 + (a.pos[1] - cLat) ** 2;
        const dB = (b.pos[0] - cLon) ** 2 + (b.pos[1] - cLat) ** 2;
        return dA - dB;
      })
      .slice(0, 150);
  }

  const isMonolithic = zoom < detailedZoom;
  const isDetailed = zoom >= detailedZoom;
  const showLabels = zoom >= labelZoom;

  const outlineSegments: RenderOutlineSegment[] = [];
  const bodySegments: RenderCarSegment[] = [];
  const roofSegments: RenderCarSegment[] = [];
  const noseSegments: RenderCarSegment[] = [];
  const labelsData: RenderTrainLabel[] = [];

  for (const train of activeTrains) {
    if (!train.shapeId) continue;
    const shape = shapes.get(train.shapeId);
    if (!shape) continue;

    const stock: LineRollingStock = getRollingStockForLine(rollingStockDb, train.line || train.lineName);
    const headD = train.currentDistM ?? 0;
    const tailD = Math.max(0, headD - stock.total_length_m);
    const elev = train.elevation || 0;
    const alpha = train.conf === 'sched' ? 166 : 255; // 65% opacity for GTFS theoretical confidence

    // 1. Full train slice (always continuous for Layer 1 contour and monolithic body)
    const fullPath = sliceShape(shape, tailD, headD);
    if (fullPath.length < 2) continue;

    // Layer 1: Outline segment (entire train, width = width + 1.2m)
    // Recalage PRIM: golden contour for real-time, dark charcoal for theoretical
    outlineSegments.push({
      path: fullPath,
      widthM: stock.width_m + 1.2,
      color: train.conf === 'rt' ? [250, 204, 21, 255] : [15, 23, 42, alpha],
      isSched: train.conf === 'sched',
      elevation: elev + 1.0,
      train
    });

    if (isMonolithic) {
      // Monolithic LOD (12-13.5): single capsule without car cuts, roof, or nose
      bodySegments.push({
        path: fullPath,
        widthM: stock.width_m,
        color: darkenHexToRgba(train.colorHex, 35, alpha),
        elevation: elev + 1.1,
        train
      });
    } else {
      // Detailed LOD (> 13.5): individual cars split with inter-car gaps
      const cars = splitIntoCars(shape, headD, stock.cars_count, stock.car_length_m, stock.inter_car_gap_m, 1);
      for (const carPath of cars) {
        if (carPath.length >= 2) {
          // Layer 2: Caisses
          bodySegments.push({
            path: carPath,
            widthM: stock.width_m,
            color: darkenHexToRgba(train.colorHex, 35, alpha),
            elevation: elev + 1.1,
            train
          });

          // Layer 3: Toit (width = width * 0.35, lightened)
          roofSegments.push({
            path: carPath,
            widthM: stock.width_m * 0.35,
            color: lightenHexToRgba(train.colorHex, 25, alpha),
            elevation: elev + 1.2,
            train
          });
        }
      }

      // Layer 4: Nez (2.5m band at the head of the train)
      const noseTailD = Math.max(0, headD - 2.5);
      const nosePath = sliceShape(shape, noseTailD, headD);
      if (nosePath.length >= 2) {
        noseSegments.push({
          path: nosePath,
          widthM: stock.width_m,
          color: [255, 255, 255, alpha],
          elevation: elev + 1.3,
          train
        });
      }
    }

    // Layer 5: Labels
    if (showLabels) {
      labelsData.push({
        headPos: train.pos,
        lineName: train.lineName,
        colorHex: train.colorHex,
        textColorHex: train.textColorHex,
        alpha,
        elevation: elev + 2.0,
        isSelected: train.id === selectedTrainId || train.line === selectedLineId
      });
    }
  }

  const layers: any[] = [];
  const commonPathProps = {
    widthUnits: 'meters' as const,
    widthMinPixels: 3,
    widthMaxPixels: 60,
    capRounded: true,
    jointRounded: true,
    billboard: false,
    _pathType: 'open' as const,
    parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any
  };

  // ---------------------------------------------------------------------------
  // Layer 1: Contour (Tranche entière, largeur = width + 1.2m, bague dorée / pointillés)
  // ---------------------------------------------------------------------------
  layers.push(
    new PathLayer<any>({
      id: 'subway-trains-capsule-outline',
      data: outlineSegments,
      ...commonPathProps,
      pickable: true,
      getWidth: (d: RenderOutlineSegment) => d.widthM,
      getPath: ((d: RenderOutlineSegment) => d.path.map((p) => [p[0], p[1], d.elevation])) as any,
      getColor: (d: RenderOutlineSegment) => d.color,
      extensions: [new PathStyleExtension({ dash: true })],
      getDashArray: (d: RenderOutlineSegment) => (d.isSched ? [3, 2] : [0, 0]),
      dashUnits: 'widths',
      onHover,
      onClick: (info: any) => {
        if (info.object && info.object.train) {
          onClick(info.object.train);
        }
      },
      updateTriggers: {
        getPath: [trains],
        getColor: [trains],
        getDashArray: [trains]
      }
    } as any)
  );

  // ---------------------------------------------------------------------------
  // Layer 2: Caisses (Couleur de ligne assombrie d'environ 35%, largeur = width)
  // ---------------------------------------------------------------------------
  layers.push(
    new PathLayer<any>({
      id: 'subway-trains-capsule-body',
      data: bodySegments,
      ...commonPathProps,
      pickable: false,
      getWidth: (d: RenderCarSegment) => d.widthM,
      getPath: ((d: RenderCarSegment) => d.path.map((p) => [p[0], p[1], d.elevation])) as any,
      getColor: (d: RenderCarSegment) => d.color,
      updateTriggers: {
        getPath: [trains],
        getColor: [trains]
      }
    })
  );

  // ---------------------------------------------------------------------------
  // Layer 3: Toit (Sous-tranches, largeur = width × 0.35, teinte éclaircie)
  // ---------------------------------------------------------------------------
  if (isDetailed && roofSegments.length > 0) {
    layers.push(
      new PathLayer<any>({
        id: 'subway-trains-capsule-roof',
        data: roofSegments,
        ...commonPathProps,
        pickable: false,
        getWidth: (d: RenderCarSegment) => d.widthM,
        getPath: ((d: RenderCarSegment) => d.path.map((p) => [p[0], p[1], d.elevation])) as any,
        getColor: (d: RenderCarSegment) => d.color,
        updateTriggers: {
          getPath: [trains],
          getColor: [trains]
        }
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Layer 4: Nez (2.5m tête de rame, largeur = width, livrée blanche éclatante)
  // ---------------------------------------------------------------------------
  if (isDetailed && noseSegments.length > 0) {
    layers.push(
      new PathLayer<any>({
        id: 'subway-trains-capsule-nose',
        data: noseSegments,
        ...commonPathProps,
        pickable: false,
        getWidth: (d: RenderCarSegment) => d.widthM,
        getPath: ((d: RenderCarSegment) => d.path.map((p) => [p[0], p[1], d.elevation])) as any,
        getColor: (d: RenderCarSegment) => d.color,
        updateTriggers: {
          getPath: [trains]
        }
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Layer 5: Étiquettes (TextLayer tête de rame, offset [0, -22], collisionFilter)
  // ---------------------------------------------------------------------------
  if (showLabels && labelsData.length > 0) {
    layers.push(
      new TextLayer<any>({
        id: 'subway-trains-capsule-labels',
        data: labelsData,
        pickable: false,
        getPosition: (d: RenderTrainLabel) => [d.headPos[0], d.headPos[1], d.elevation],
        getText: (d: RenderTrainLabel) => d.lineName,
        getPixelOffset: [0, -22],
        getSize: 12,
        getColor: (d: RenderTrainLabel) => hexToRgba(d.textColorHex, d.alpha),
        getBackgroundColor: (d: RenderTrainLabel) => hexToRgba(d.colorHex, Math.min(235, d.alpha)),
        background: true,
        backgroundPadding: [6, 4],
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 700,
        billboard: true,
        extensions: [new CollisionFilterExtension()],
        collisionGroup: 'train-labels',
        getCollisionPriority: (d: RenderTrainLabel) => (d.isSelected ? 1000 : 1),
        parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any,
        updateTriggers: {
          getPosition: [trains],
          getCollisionPriority: [selectedLineId, selectedTrainId]
        }
      } as any)
    );
  }

  return layers;
}
