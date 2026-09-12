import { PathLayer, TextLayer, ScatterplotLayer } from '@deck.gl/layers';
import { PathStyleExtension, CollisionFilterExtension } from '@deck.gl/extensions';
import type { TrainMarker } from './trains_layer';
import { createTrainsLayers } from './trains_layer';
import type { ShapeEntry } from '@core/sim/shapes';
import { sliceShape, splitIntoCars } from '@core/sim/shapes';
import { coordAtDistance } from '@core/sim/shapes_loader';
import type { RollingStockDatabase, LineRollingStock } from '@core/sim/rolling_stock';
import { getRollingStockForLine } from '@core/sim/rolling_stock';
import { hexToRgba } from './deck_overlay';
import { LATIN_CHARACTER_SET } from './labels_layer';

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const NEUTRAL_BODY_COLORS = [
  '#F1EFEA', '#FFFFFF', '#767676', '#6E6E6E', '#686868',
  '#646464', '#5F5F5F', '#4E4E4E', '#3B3D3D'
];

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const firstLum = relativeLuminance(first);
  const secondLum = relativeLuminance(second);
  const lighter = Math.max(firstLum, secondLum);
  const darker = Math.min(firstLum, secondLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function getNeutralBodyColor(lineColor: string): [number, number, number, number] {
  const normalized = lineColor.toUpperCase();
  const selected = NEUTRAL_BODY_COLORS.find((neutral) => contrastRatio(neutral, normalized) >= 3) ?? '#3B3D3D';
  return hexToRgba(selected, 255);
}

function getNeutralNoseColor(bodyColor: [number, number, number, number]): [number, number, number, number] {
  const isLight = bodyColor[0] + bodyColor[1] + bodyColor[2] > 450;
  return isLight ? [59, 61, 61, 255] : [241, 239, 234, 255];
}

function pointToTrackDistanceM(point: [number, number], path: [number, number][]): number {
  const latScale = 111320;
  const lonScale = latScale * Math.cos((point[1] * Math.PI) / 180);
  const px = point[0] * lonScale;
  const py = point[1] * latScale;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][0] * lonScale;
    const ay = path[i - 1][1] * latScale;
    const bx = path[i][0] * lonScale;
    const by = path[i][1] * latScale;
    const vx = bx - ax;
    const vy = by - ay;
    const lengthSquared = vx * vx + vy * vy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSquared)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * vx), py - (ay + t * vy)));
  }
  return best;
}

export interface CapsuleLayerParams {
  trains: TrainMarker[];
  shapes: Map<string, ShapeEntry>;
  tracks?: Array<{ line_id: string; coordinates: [number, number][] }>;
  rollingStockDb: RollingStockDatabase;
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

export interface RenderLightPoint {
  pos: [number, number];
  radiusM: number;
  color: [number, number, number, number];
  elevation: number;
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
 * Computes dual headlights and taillights points positioned on the left and right
 * edges of the front and rear cabs.
 */
function computeTrainLights(
  shape: ShapeEntry,
  headD: number,
  tailD: number,
  widthM: number,
  elevation: number
): RenderLightPoint[] {
  const points: RenderLightPoint[] = [];
  const latFactor = 111320;

  // 1. Dual Headlights (Avant / Tête de rame)
  const pHead = coordAtDistance(shape, headD);
  const pPrev = coordAtDistance(shape, Math.max(0, headD - 1.5));
  const cosLatHead = Math.cos((pHead[1] * Math.PI) / 180);
  const dxHead = (pHead[0] - pPrev[0]) * cosLatHead * latFactor;
  const dyHead = (pHead[1] - pPrev[1]) * latFactor;
  const lenHead = Math.hypot(dxHead, dyHead);

  if (lenHead > 0.001) {
    const nx = -dyHead / lenHead;
    const ny = dxHead / lenHead;
    const lateralDist = widthM * 0.32;
    const offLng = (nx * lateralDist) / (latFactor * cosLatHead);
    const offLat = (ny * lateralDist) / latFactor;

    // Luminous bright warm white LED headlights (100% opaque)
    const headlightColor: [number, number, number, number] = [255, 255, 210, 255];
    points.push(
      {
        pos: [pHead[0] + offLng, pHead[1] + offLat],
        radiusM: 0.75,
        color: headlightColor,
        elevation: elevation + 3.2
      },
      {
        pos: [pHead[0] - offLng, pHead[1] - offLat],
        radiusM: 0.75,
        color: headlightColor,
        elevation: elevation + 3.2
      }
    );
  }

  return points;
}

/**
 * Creates the high-contrast Deck.gl rolling stock rendering stack:
 * - PathLayer car bodies sliced directly from the canonical shape
 * - PathLayer roofs following the same per-car slices
 * - High-visibility outline halo
 * - Inter-car gangways & LED headlights/taillights
 */
export function createCapsuleLayers(params: CapsuleLayerParams): any[] {
  const {
    trains,
    shapes,
    tracks = [],
    rollingStockDb,
    mapCenter,
    selectedLineId,
    selectedTrainId,
    onHover,
    onClick
  } = params;

  const map = typeof window !== 'undefined' ? (window as any).__map : null;
  const zoom = typeof map?.getZoom === 'function' ? map.getZoom() : 13;
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'trains') {
    const overlayZoom = Number((window as any).__deckOverlayZoom ?? zoom);
    if (Math.abs(overlayZoom - zoom) > 0.1) {
      console.warn('[trains-debug] zoom désynchronisé', { mapZoom: zoom, overlayZoom });
    }
  }

  const isMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

  const minCapsuleZoom = 9.0;
  const detailedZoom = isMobile ? 14.2 : 13.5;
  const labelZoom = isMobile ? 14.0 : 13.0;

  // Branch LOD BEFORE slicing loop: zero slicing computation for trains rendered as points
  if (zoom < minCapsuleZoom) {
    return createTrainsLayers(trains, selectedLineId, onHover, onClick, zoom);
  }

  let activeTrains = selectedLineId
    ? trains.filter(t => t.line === selectedLineId || (selectedTrainId && t.id === selectedTrainId))
    : trains;

  // Mobile capping: max 150 closest to map center
  if (isMobile && activeTrains.length > 150) {
    const [cLon, cLat] = mapCenter;
    const selected = selectedTrainId ? activeTrains.find(t => t.id === selectedTrainId) : null;
    activeTrains = [...activeTrains]
      .sort((a, b) => {
        const dA = (a.pos[0] - cLon) ** 2 + (a.pos[1] - cLat) ** 2;
        const dB = (b.pos[0] - cLon) ** 2 + (b.pos[1] - cLat) ** 2;
        return dA - dB;
      })
      .slice(0, 150);
    if (selected && !activeTrains.some(t => t.id === selected.id)) {
      activeTrains.push(selected);
    }
  }

  const isDetailed = zoom >= detailedZoom;
  const showLabels = zoom >= labelZoom;

  const outlineSegments: RenderOutlineSegment[] = [];
  const carBodies: RenderCarSegment[] = [];
  const carRoofs: RenderCarSegment[] = [];
  const gangwaySegments: RenderCarSegment[] = [];
  const noseSegments: RenderCarSegment[] = [];
  const lightPoints: RenderLightPoint[] = [];
  const labelsData: RenderTrainLabel[] = [];
  const fallbackTrains: TrainMarker[] = [];
  const debugTrains = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'trains';
  const debugRows: Array<Record<string, unknown>> = [];
  const debugSlices: Array<{ path: [number, number][]; color: [number, number, number, number]; widthM: number }> = [];
  const debugShapeIds = new Set<string>();
  for (const train of activeTrains) {
    if (!train.shapeId) {
      fallbackTrains.push(train);
      continue;
    }
    const shape = shapes.get(train.shapeId);
    if (!shape) {
      fallbackTrains.push(train);
      continue;
    }

    const stock: LineRollingStock = getRollingStockForLine(rollingStockDb, train.line || train.lineName);
    const trainDirection = (train.direction ?? 1) as 0 | 1;
    const referenceDistance = (train.currentDistM ?? 0)
      + (trainDirection === 1 ? stock.total_length_m / 2 : -stock.total_length_m / 2);
    const headD = referenceDistance;
    const tailD = trainDirection === 1
      ? headD - stock.total_length_m
      : headD + stock.total_length_m;
    const elev = train.elevation || 0;
    const lodLevel = zoom < minCapsuleZoom ? 'dot' : zoom >= detailedZoom ? 'full' : 'capsule';
    const debugShape = shapes.get(train.shapeId);
    const debugSlice = debugShape ? sliceShape(debugShape, tailD, headD) : [];
    if (debugTrains) {
      debugShapeIds.add(train.shapeId);
      debugRows.push({
        tripId: train.id,
        lineId: train.line,
        dir: train.direction,
        shapeId: train.shapeId,
        d: Number(headD.toFixed(1)),
        shapeLength: Number((debugShape?.length ?? 0).toFixed(1)),
        sliceLength: debugSlice.length,
        carsCount: stock.cars_count,
        widthM: stock.width_m,
        lodLevel,
        confidence: train.conf,
        coordAtD: debugShape ? coordAtDistance(debugShape, headD) : null,
        zoom: Number(zoom.toFixed(2)),
        color: train.colorHex,
        model: stock.model_id,
        orphanShape: !debugShape,
        outOfBounds: Boolean(debugShape && (headD < 0 || headD > debugShape.length)),
        distanceToDisplayTrackM: Math.min(
          ...tracks.filter((track) => track.line_id === train.line).map((track) => pointToTrackDistanceM(train.pos, track.coordinates)),
          Number.POSITIVE_INFINITY
        )
      });
      if (debugSlice.length >= 2) {
        debugSlices.push({ path: debugSlice, color: [255, 255, 255, 255], widthM: 2 });
      }
    }

    // 1. Full train slice (always continuous for outline halo)
    const fullPath = sliceShape(shape, tailD, headD);
    if (fullPath.length < 2) {
      fallbackTrains.push(train);
      continue;
    }

    const isRealtime = train.conf === 'measured' || train.conf === 'bracketed';
    const lineColorRgba = hexToRgba(train.colorHex, 255);
    const bodyColor = getNeutralBodyColor(train.colorHex);
    const noseColor = getNeutralNoseColor(bodyColor);

    // Layer 1: Outline halo (Wider than the track to ensure 100% visibility)
    outlineSegments.push({
      path: fullPath,
      widthM: stock.width_m + 1.2,
      color: isRealtime ? [255, 215, 0, 255] : [240, 240, 240, 240],
      isSched: train.conf === 'scheduled',
      elevation: elev + 0.5,
      train
    });

    if (!isDetailed) {
      // Monolithic path body for the intermediate LOD.
      carBodies.push({
        path: fullPath,
        widthM: Math.max(stock.width_m, 3.2),
        color: bodyColor,
        elevation: elev + 1.0,
        train
      });
      carRoofs.push({
        path: fullPath,
        widthM: Math.max(stock.width_m * 0.30, 0.8),
        color: lineColorRgba,
        elevation: elev + 1.2,
        train
      });
    } else {
      // -----------------------------------------------------------------------
      // Detailed 3D Model LOD (>= 13.5 desktop / 14.2 mobile):
      // Individual 3D extruded cars, gangways, and LED lighting
      // -----------------------------------------------------------------------
      const cars = splitIntoCars(
        shape,
        headD,
        stock.cars_count,
        stock.car_length_m,
        stock.inter_car_gap_m,
        trainDirection
      );

      // A. Car bodies are path slices, never screen-aligned polygons.
      for (const carPath of cars) {
        if (carPath.length >= 2) {
          carBodies.push({
            path: carPath,
            widthM: Math.max(stock.width_m, 3.2),
            color: bodyColor,
            elevation: elev + 1.0,
            train
          });
          carRoofs.push({
            path: carPath,
            widthM: Math.max(stock.width_m * 0.30, 0.8),
            color: lineColorRgba,
            elevation: elev + 1.2,
            train
          });
        }
      }

      // C. Inter-car rubber gangways / soufflets
      for (let i = 0; i < stock.cars_count - 1; i++) {
        const carTailD = headD - i * (stock.car_length_m + stock.inter_car_gap_m) - stock.car_length_m;
        const nextCarHeadD = headD - (i + 1) * (stock.car_length_m + stock.inter_car_gap_m);
        const gangwayPath = sliceShape(shape, Math.max(0, nextCarHeadD), Math.max(0, carTailD));
        if (gangwayPath.length >= 2) {
          gangwaySegments.push({
            path: gangwayPath,
            widthM: Math.max(stock.width_m * 0.70, 2.2),
            color: [40, 40, 42, 255],
            elevation: elev + 1.6,
            train
          });
        }
      }

      // D. Front cab aerodynamic nose highlight
      const noseTailD = Math.max(0, headD - 2.5);
      const nosePath = sliceShape(shape, noseTailD, headD);
      if (nosePath.length >= 2) {
        noseSegments.push({
          path: nosePath,
          widthM: Math.max(stock.width_m * 0.90, 2.9),
          color: noseColor,
          elevation: elev + 3.8,
          train
        });
      }

      // E. LED Headlights & Taillights
      const lights = computeTrainLights(shape, headD, tailD, stock.width_m, elev);
      lightPoints.push(...lights);
    }

    // Layer: Labels
    if (showLabels) {
      labelsData.push({
        headPos: train.pos,
        lineName: train.lineName,
        colorHex: train.colorHex,
        textColorHex: train.textColorHex,
        alpha: 255,
        elevation: elev + 4.5,
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
    autoHighlight: true,
    highlightColor: [255, 255, 255, 75],
    transitions: { getColor: { duration: 140, easing: easeOut } },
    _pathType: 'open' as const,
    parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any
  };

  // ---------------------------------------------------------------------------
  // Layer 1: Outline Halo (High contrast base on the tracks)
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
  // Layer 2: Car bodies as canonical shape slices.
  // ---------------------------------------------------------------------------
  if (carBodies.length > 0) {
    layers.push(
      new PathLayer<RenderCarSegment>({
        id: 'subway-trains-car-bodies',
        data: carBodies,
        ...commonPathProps,
        getWidth: (d: RenderCarSegment) => d.widthM,
        getPath: ((d: RenderCarSegment) => d.path.map((p) => [p[0], p[1], d.elevation])) as any,
        getColor: (d: RenderCarSegment) => d.color,
        parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any,
        onHover,
        onClick: (info: any) => {
          if (info.object && info.object.train) {
            onClick(info.object.train);
          }
        },
        updateTriggers: {
          getPath: [trains],
          getFillColor: [trains],
          getWidth: [trains]
        }
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Layer 3: line identity on the same canonical path slices.
  // ---------------------------------------------------------------------------
  if (carRoofs.length > 0) {
    layers.push(
      new PathLayer<RenderCarSegment>({
        id: 'subway-trains-car-roofs',
        data: carRoofs,
        ...commonPathProps,
        pickable: false,
        getWidth: (d: RenderCarSegment) => d.widthM,
        getPath: ((d: RenderCarSegment) => d.path.map((p) => [p[0], p[1], d.elevation])) as any,
        getColor: (d: RenderCarSegment) => d.color,
        parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any,
        updateTriggers: {
          getPath: [trains],
          getFillColor: [trains],
          getWidth: [trains]
        }
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Layer 4: Intercirculations / Soufflets en caoutchouc
  // ---------------------------------------------------------------------------
  if (gangwaySegments.length > 0) {
    layers.push(
      new PathLayer<any>({
        id: 'subway-trains-capsule-gangways',
        data: gangwaySegments,
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
  // Layer 5: Nez blanc éclatant
  // ---------------------------------------------------------------------------
  if (noseSegments.length > 0) {
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
  // Layer 6: Phares avant LED & feux arrière LED
  // ---------------------------------------------------------------------------
  if (lightPoints.length > 0) {
    layers.push(
      new ScatterplotLayer<RenderLightPoint>({
        id: 'subway-trains-capsule-lights',
        data: lightPoints,
        pickable: false,
        radiusUnits: 'meters',
        getRadius: (d: RenderLightPoint) => d.radiusM,
        radiusMinPixels: 4,
        radiusMaxPixels: 14,
        getPosition: (d: RenderLightPoint) => [d.pos[0], d.pos[1], d.elevation],
        getFillColor: (d: RenderLightPoint) => d.color,
        parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any,
        updateTriggers: {
          getPosition: [trains],
          getFillColor: [trains]
        }
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Layer 7: Étiquettes de rame
  // ---------------------------------------------------------------------------
  if (showLabels && labelsData.length > 0) {
    layers.push(
      new TextLayer<any>({
        id: 'subway-trains-capsule-labels',
        data: labelsData,
        pickable: false,
        getPosition: (d: RenderTrainLabel) => [d.headPos[0], d.headPos[1], d.elevation],
        getText: (d: RenderTrainLabel) => d.lineName,
        getPixelOffset: [0, -24],
        getSize: 12,
        getColor: (d: RenderTrainLabel) => hexToRgba(d.textColorHex, d.alpha),
        getBackgroundColor: (d: RenderTrainLabel) => hexToRgba(d.colorHex, 245),
        background: true,
        backgroundPadding: [6, 4],
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: 700,
        characterSet: LATIN_CHARACTER_SET,
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

  if (fallbackTrains.length > 0) {
    layers.push(...createTrainsLayers(fallbackTrains, selectedLineId, onHover, onClick));
  }

  if (debugTrains) {
    const line1Rows = debugRows.filter((row) => row.lineId === 'IDFM:C01371').slice(0, 10);
    console.table(line1Rows);
    const orphanByLine: Record<string, number> = {};
    const outOfBoundsByLine: Record<string, number> = {};
    for (const row of debugRows) {
      if (row.orphanShape) orphanByLine[String(row.lineId)] = (orphanByLine[String(row.lineId)] || 0) + 1;
      if (row.outOfBounds) outOfBoundsByLine[String(row.lineId)] = (outOfBoundsByLine[String(row.lineId)] || 0) + 1;
    }
    const debugReport = {
      mapZoom: typeof map?.getZoom === 'function' ? map.getZoom() : null,
      overlayZoom: typeof window !== 'undefined' ? (window as any).__deckOverlayZoom ?? null : null,
      activeTrains: debugRows.length,
      emptySlices: debugRows.filter((row) => Number(row.sliceLength) < 2).length,
      emptySliceRate: debugRows.length ? debugRows.filter((row) => Number(row.sliceLength) < 2).length / debugRows.length : 0,
      orphanShapes: debugRows.filter((row) => row.orphanShape).length,
      orphanByLine,
      outOfBounds: debugRows.filter((row) => row.outOfBounds).length,
      outOfBoundsByLine,
      shapeIdsLoaded: debugShapeIds.size,
      lodAtCurrentZoom: debugRows[0]?.lodLevel ?? null,
      colors: debugRows.map((row) => ({ lineId: row.lineId, color: row.color, model: row.model }))
    };
    (window as any).__trainDebugRows = debugRows;
    (window as any).__trainDebugReport = debugReport;
    console.log('[trains-debug] report', debugReport);

    const debugSourcePaths = [...debugShapeIds].map((shapeId) => {
      const shape = shapes.get(shapeId);
      return shape ? { path: Array.from({ length: shape.coords.length / 2 }, (_, i) => [shape.coords[i * 2], shape.coords[i * 2 + 1]] as [number, number]), color: [255, 0, 255, 220] } : null;
    }).filter(Boolean);
    const debugDisplayPaths = tracks
      .filter((track) => !selectedLineId || track.line_id === selectedLineId)
      .map((track) => ({ path: track.coordinates, color: [0, 255, 255, 220] }));
    layers.push(new PathLayer<any>({
      id: 'trains-debug-source-magenta', data: debugSourcePaths, widthUnits: 'pixels', getWidth: 1,
      getPath: (d: any) => d.path, getColor: (d: any) => d.color, pickable: false,
      parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any
    }));
    layers.push(new PathLayer<any>({
      id: 'trains-debug-display-cyan', data: debugDisplayPaths, widthUnits: 'pixels', getWidth: 1,
      getPath: (d: any) => d.path, getColor: (d: any) => d.color, pickable: false,
      parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any
    }));
    layers.push(new PathLayer<any>({
      id: 'trains-debug-slice-white', data: debugSlices, widthUnits: 'pixels', getWidth: (d: any) => d.widthM,
      getPath: (d: any) => d.path, getColor: (d: any) => d.color, pickable: false,
      parameters: { depthTest: false, depthWriteEnabled: false, depthCompare: 'always' } as any
    }));
  }

  return layers;
}


