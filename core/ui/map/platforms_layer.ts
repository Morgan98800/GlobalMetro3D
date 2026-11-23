import { PolygonLayer } from '@deck.gl/layers';
import type { LineMetadata, StationMetadata } from '@core/types';
import { type HubRegistry, resolveLineElevationAt } from './station_levels';

export interface PlatformPath {
  coordinates: [number, number][];
  lineId: string;
  elevation: number;
}

interface PlatformTileDatum {
  polygon: [number, number, number][];
  lineId: string;
  stationId: string;
  fillColor: [number, number, number, number];
  lineColor: [number, number, number, number];
  elevationM: number;
  baseZ: number;
  stroked: boolean;
}

const LAT_SCALE = 111_320;
const TRACK_CLEARANCE_M = 3.18;
const PLATFORM_WIDTH_M = 3.6;
const PLATFORM_HEIGHT_M = 0.45;
const PLATFORM_TOP_OFFSET_M = -0.14;
const SAFETY_STRIP_WIDTH_M = 0.36;
const TILE_BAY_COUNT = 6;

function project(point: [number, number], latitude: number): [number, number] {
  const lonScale = LAT_SCALE * Math.cos((latitude * Math.PI) / 180);
  return [point[0] * lonScale, point[1] * LAT_SCALE];
}

function unproject(point: [number, number], latitude: number): [number, number] {
  const lonScale = LAT_SCALE * Math.cos((latitude * Math.PI) / 180);
  return [point[0] / lonScale, point[1] / LAT_SCALE];
}

export function closestPointOnPath(
  target: [number, number],
  path: [number, number][]
): { point: [number, number]; tangent: [number, number]; distanceM: number } | null {
  if (path.length < 2) return null;
  const targetMeters = project(target, target[1]);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPoint: [number, number] = targetMeters;
  let bestTangent: [number, number] = [1, 0];
  let bestIndex = 1;
  let bestT = 0;
  let bestSegLen = 1;

  for (let index = 1; index < path.length; index += 1) {
    const a = project(path[index - 1], target[1]);
    const b = project(path[index], target[1]);
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const length = Math.hypot(vx, vy);
    if (length < 0.001) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((targetMeters[0] - a[0]) * vx + (targetMeters[1] - a[1]) * vy) / (length * length)
      )
    );
    const point: [number, number] = [a[0] + vx * t, a[1] + vy * t];
    const distance = Math.hypot(targetMeters[0] - point[0], targetMeters[1] - point[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = point;
      bestTangent = [vx / length, vy / length];
      bestIndex = index;
      bestT = t;
      bestSegLen = length;
    }
  }

  // Smooth the station tangent across polyline vertices so 90-114 m stations
  // bisect curves cleanly instead of snapping solely to the incoming segment.
  const distFromStart = bestT * bestSegLen;
  const distFromEnd = (1 - bestT) * bestSegLen;
  if (distFromStart < 12 && bestIndex > 1) {
    const pPrev = project(path[bestIndex - 2], target[1]);
    const pCurr = project(path[bestIndex - 1], target[1]);
    const pvx = pCurr[0] - pPrev[0];
    const pvy = pCurr[1] - pPrev[1];
    const plen = Math.hypot(pvx, pvy);
    if (plen > 0.001) {
      const prevT: [number, number] = [pvx / plen, pvy / plen];
      const w = 0.5 * (1 - distFromStart / 12);
      const bx = bestTangent[0] * (1 - w) + prevT[0] * w;
      const by = bestTangent[1] * (1 - w) + prevT[1] * w;
      const blen = Math.hypot(bx, by);
      if (blen > 0.001) bestTangent = [bx / blen, by / blen];
    }
  } else if (distFromEnd < 12 && bestIndex < path.length - 1) {
    const pCurr = project(path[bestIndex], target[1]);
    const pNext = project(path[bestIndex + 1], target[1]);
    const nvx = pNext[0] - pCurr[0];
    const nvy = pNext[1] - pCurr[1];
    const nlen = Math.hypot(nvx, nvy);
    if (nlen > 0.001) {
      const nextT: [number, number] = [nvx / nlen, nvy / nlen];
      const w = 0.5 * (1 - distFromEnd / 12);
      const bx = bestTangent[0] * (1 - w) + nextT[0] * w;
      const by = bestTangent[1] * (1 - w) + nextT[1] * w;
      const blen = Math.hypot(bx, by);
      if (blen > 0.001) bestTangent = [bx / blen, by / blen];
    }
  }

  return { point: bestPoint, tangent: bestTangent, distanceM: bestDistance };
}

export interface SpineFrame {
  point: [number, number];
  tangent: [number, number];
  normal: [number, number];
}

export interface TrackSpine {
  refLat: number;
  centerFrame: SpineFrame;
  frameAt: (sOffsetM: number) => SpineFrame;
}

/**
 * Samples a curved track-aligned spine centered on the closest point to `target`.
 * Guarantees stations are built strictly around the real curved track centerline
 * (Hierarchy: 1. Track -> 2. Twin Rails -> 3. Station built around track).
 */
export function sampleTrackSpine(
  target: [number, number],
  paths: [number, number][][],
  refLat: number = target[1]
): TrackSpine | null {
  let bestPath: [number, number][] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const path of paths) {
    const c = closestPointOnPath(target, path);
    if (c && c.distanceM < bestDist) {
      bestDist = c.distanceM;
      bestPath = path;
    }
  }
  if (!bestPath || bestPath.length < 2) return null;

  const ptsM = bestPath.map((p) => project(p, refLat));
  const targetM = project(target, refLat);
  const segLens: number[] = [];
  const cumS: number[] = [0];
  const segTangents: [number, number][] = [];

  for (let i = 1; i < ptsM.length; i += 1) {
    const dx = ptsM[i][0] - ptsM[i - 1][0];
    const dy = ptsM[i][1] - ptsM[i - 1][1];
    const len = Math.hypot(dx, dy);
    segLens.push(len);
    cumS.push(cumS[i - 1] + len);
    segTangents.push(len > 0.001 ? [dx / len, dy / len] : [1, 0]);
  }

  let s0 = 0;
  let minD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < segLens.length; i += 1) {
    const len = segLens[i];
    if (len < 0.001) continue;
    const a = ptsM[i];
    const [tx, ty] = segTangents[i];
    const proj = Math.max(0, Math.min(len, (targetM[0] - a[0]) * tx + (targetM[1] - a[1]) * ty));
    const px = a[0] + tx * proj;
    const py = a[1] + ty * proj;
    const d = Math.hypot(targetM[0] - px, targetM[1] - py);
    if (d < minD) {
      minD = d;
      s0 = cumS[i] + proj;
    }
  }

  const totalLen = cumS[cumS.length - 1];
  const frameAtArc = (sAbs: number): SpineFrame => {
    if (sAbs <= 0) {
      const t = segTangents[0];
      return {
        point: [ptsM[0][0] + t[0] * sAbs, ptsM[0][1] + t[1] * sAbs],
        tangent: t,
        normal: [-t[1], t[0]],
      };
    }
    if (sAbs >= totalLen) {
      const t = segTangents[segTangents.length - 1];
      const over = sAbs - totalLen;
      const last = ptsM[ptsM.length - 1];
      return {
        point: [last[0] + t[0] * over, last[1] + t[1] * over],
        tangent: t,
        normal: [-t[1], t[0]],
      };
    }

    let idx = 0;
    while (idx < segLens.length - 1 && cumS[idx + 1] < sAbs) idx += 1;
    const len = segLens[idx] || 1;
    const localS = sAbs - cumS[idx];
    const a = ptsM[idx];
    let t = segTangents[idx];
    const pt: [number, number] = [a[0] + t[0] * localS, a[1] + t[1] * localS];

    // Smooth tangent across vertices so curved station bays align cleanly without kinks
    if (localS < 10 && idx > 0) {
      const prev = segTangents[idx - 1];
      const w = 0.5 * (1 - localS / 10);
      const bx = t[0] * (1 - w) + prev[0] * w;
      const by = t[1] * (1 - w) + prev[1] * w;
      const bl = Math.hypot(bx, by);
      if (bl > 0.001) t = [bx / bl, by / bl];
    } else if (len - localS < 10 && idx < segTangents.length - 1) {
      const next = segTangents[idx + 1];
      const w = 0.5 * (1 - (len - localS) / 10);
      const bx = t[0] * (1 - w) + next[0] * w;
      const by = t[1] * (1 - w) + next[1] * w;
      const bl = Math.hypot(bx, by);
      if (bl > 0.001) t = [bx / bl, by / bl];
    }

    return { point: pt, tangent: t, normal: [-t[1], t[0]] };
  };

  return {
    refLat,
    centerFrame: frameAtArc(s0),
    frameAt: (sOffsetM: number) => frameAtArc(s0 + sOffsetM),
  };
}

export function makeCurvedQuad(
  frameA: SpineFrame,
  frameB: SpineFrame,
  side: 1 | -1,
  n0: number,
  n1: number,
  z: number,
  refLat: number
): [number, number, number][] {
  const [nax, nay] = [frameA.normal[0] * side, frameA.normal[1] * side];
  const [nbx, nby] = [frameB.normal[0] * side, frameB.normal[1] * side];
  const pts: [number, number][] = [
    [frameA.point[0] + nax * n0, frameA.point[1] + nay * n0],
    [frameB.point[0] + nbx * n0, frameB.point[1] + nby * n0],
    [frameB.point[0] + nbx * n1, frameB.point[1] + nby * n1],
    [frameA.point[0] + nax * n1, frameA.point[1] + nay * n1],
  ];
  return pts.map((corner) => {
    const [lng, lat] = unproject(corner, refLat);
    return [lng, lat, z];
  });
}

function platformTilesForStation(
  station: StationMetadata,
  line: LineMetadata,
  paths: [number, number][][],
  theme: 'dark' | 'light',
  followOffsetM: number,
  hubRegistry?: HubRegistry | null
): PlatformTileDatum[] {
  const spine = sampleTrackSpine(station.coordinates, paths, station.coordinates[1]);
  if (!spine) return [];

  const length = station.is_hub || station.lines.length > 1 ? 114 : 90;
  const halfLength = length / 2;

  const lineElev = resolveLineElevationAt(station.coordinates, line, hubRegistry);
  const baseZ = lineElev + followOffsetM + PLATFORM_TOP_OFFSET_M - PLATFORM_HEIGHT_M;
  const hex = (line.color || '#A9A29A').replace('#', '');
  const lr = hex.length === 6 ? parseInt(hex.slice(0, 2), 16) : 169;
  const lg = hex.length === 6 ? parseInt(hex.slice(2, 4), 16) : 162;
  const lb = hex.length === 6 ? parseInt(hex.slice(4, 6), 16) : 154;
  const accentColor: [number, number, number, number] = [lr, lg, lb, 230];
  const seamColor: [number, number, number, number] =
    theme === 'light' ? [95, 90, 84, 150] : [58, 56, 54, 165];

  const tiles: PlatformTileDatum[] = [];
  const bayLen = length / TILE_BAY_COUNT;
  const safetyFill: [number, number, number, number] =
    theme === 'light' ? [246, 242, 232, 245] : [232, 226, 212, 242];

  // Symmetrical dual platforms (±normal) built along the curved track spine
  for (const side of [1, -1] as const) {
    for (let b = 0; b < TILE_BAY_COUNT; b += 1) {
      const s0 = -halfLength + b * bayLen;
      const s1 = s0 + bayLen - 0.14;
      const fA = spine.frameAt(s0);
      const fB = spine.frameAt(s1);
      const isAlt = (b + (side === -1 ? 1 : 0)) % 2 === 0;
      const fillColor: [number, number, number, number] =
        theme === 'light'
          ? isAlt
            ? [134, 129, 122, 224]
            : [122, 117, 110, 224]
          : isAlt
            ? [164, 159, 151, 222]
            : [151, 146, 138, 222];

      tiles.push({
        polygon: makeCurvedQuad(
          fA,
          fB,
          side,
          TRACK_CLEARANCE_M + SAFETY_STRIP_WIDTH_M,
          TRACK_CLEARANCE_M + PLATFORM_WIDTH_M,
          baseZ,
          spine.refLat
        ),
        lineId: line.id,
        stationId: station.id,
        fillColor,
        lineColor: seamColor,
        elevationM: PLATFORM_HEIGHT_M,
        baseZ,
        stroked: true,
      });

      // Crisp trackside safety tactile coping strip along curved ±3.18m..±3.54m edge
      tiles.push({
        polygon: makeCurvedQuad(
          fA,
          fB,
          side,
          TRACK_CLEARANCE_M,
          TRACK_CLEARANCE_M + SAFETY_STRIP_WIDTH_M,
          baseZ + 0.02,
          spine.refLat
        ),
        lineId: line.id,
        stationId: station.id,
        fillColor: safetyFill,
        lineColor: accentColor,
        elevationM: PLATFORM_HEIGHT_M + 0.02,
        baseZ: baseZ + 0.02,
        stroked: true,
      });
    }
  }

  return tiles;
}

function collectPlatformTiles(
  stations: StationMetadata[],
  line: LineMetadata | null,
  paths: [number, number][][],
  zoom: number,
  theme: 'dark' | 'light' = 'dark',
  allLines?: { lines: LineMetadata[]; tracksByLine: Map<string, [number, number][][]> },
  followElevation?: { lineId: string | null; offset: number },
  hubRegistry?: HubRegistry | null
): PlatformTileDatum[] {
  const data: PlatformTileDatum[] = [];
  const offsetFor = (lineId: string) =>
    followElevation && followElevation.lineId === lineId ? followElevation.offset : 0;

  if (line && paths.length > 0 && zoom >= 13.5) {
    const lineOff = offsetFor(line.id);
    for (const station of stations) {
      if (!station.lines.includes(line.id)) continue;
      data.push(...platformTilesForStation(station, line, paths, theme, lineOff, hubRegistry));
    }
  } else if (!line && allLines && zoom >= 14.5) {
    for (const candidateLine of allLines.lines) {
      if (candidateLine.mode !== 'metro' && candidateLine.mode !== 'tube') continue;
      const linePaths = allLines.tracksByLine.get(candidateLine.id);
      if (!linePaths || linePaths.length === 0) continue;
      const lineOff = offsetFor(candidateLine.id);
      for (const station of stations) {
        if (!station.lines.includes(candidateLine.id)) continue;
        data.push(
          ...platformTilesForStation(station, candidateLine, linePaths, theme, lineOff, hubRegistry)
        );
      }
    }
  }
  return data;
}

function buildPlatformPolygonLayer(
  id: string,
  data: PlatformTileDatum[],
  line: LineMetadata | null,
  zoom: number,
  theme: 'dark' | 'light',
  followElevation?: { lineId: string | null; offset: number },
  beforeId?: string
): PolygonLayer<PlatformTileDatum> {
  return new PolygonLayer<PlatformTileDatum>({
    id,
    data,
    ...(beforeId ? { beforeId } : {}),
    pickable: false,
    extruded: true,
    wireframe: false,
    filled: true,
    stroked: true,
    lineWidthUnits: 'meters',
    getLineWidth: 0.16,
    getLineColor: (datum: PlatformTileDatum) => datum.lineColor,
    getPolygon: (datum: PlatformTileDatum) => datum.polygon,
    getElevation: (datum: PlatformTileDatum) => datum.elevationM,
    getFillColor: (datum: PlatformTileDatum) => datum.fillColor,
    material: {
      ambient: 0.68,
      diffuse: 0.48,
      shininess: 10,
      specularColor: [90, 86, 78],
    },
    parameters: { depthTest: true, depthWriteEnabled: true } as any,
    updateTriggers: {
      getPolygon: [line?.id ?? 'all', Math.floor(zoom * 2), followElevation?.lineId ?? ''],
      getFillColor: [theme],
    },
  } as any);
}

export function createPlatformsLayers(
  stations: StationMetadata[],
  line: LineMetadata | null,
  paths: [number, number][][],
  zoom: number,
  theme: 'dark' | 'light' = 'dark',
  allLines?: { lines: LineMetadata[]; tracksByLine: Map<string, [number, number][][]> },
  followElevation?: { lineId: string | null; offset: number },
  hubRegistry?: HubRegistry | null,
  undergroundBeforeId?: string
): PolygonLayer<PlatformTileDatum>[] {
  const data = collectPlatformTiles(
    stations,
    line,
    paths,
    zoom,
    theme,
    allLines,
    followElevation,
    hubRegistry
  );
  if (data.length === 0) return [];
  if (!undergroundBeforeId) {
    return [buildPlatformPolygonLayer('subway-platforms', data, line, zoom, theme, followElevation)];
  }
  const underground = data.filter((d) => d.baseZ < 0);
  const surface = data.filter((d) => d.baseZ >= 0);
  const layers: PolygonLayer<PlatformTileDatum>[] = [];
  if (underground.length > 0) {
    layers.push(
      buildPlatformPolygonLayer(
        'subway-platforms-ug',
        underground,
        line,
        zoom,
        theme,
        followElevation,
        undergroundBeforeId
      )
    );
  }
  if (surface.length > 0) {
    layers.push(
      buildPlatformPolygonLayer('subway-platforms', surface, line, zoom, theme, followElevation)
    );
  }
  return layers;
}

export function createPlatformsLayer(
  stations: StationMetadata[],
  line: LineMetadata | null,
  paths: [number, number][][],
  zoom: number,
  theme: 'dark' | 'light' = 'dark',
  allLines?: { lines: LineMetadata[]; tracksByLine: Map<string, [number, number][][]> },
  followElevation?: { lineId: string | null; offset: number },
  hubRegistry?: HubRegistry | null
): PolygonLayer<PlatformTileDatum> | null {
  const layers = createPlatformsLayers(
    stations,
    line,
    paths,
    zoom,
    theme,
    allLines,
    followElevation,
    hubRegistry
  );
  return layers[0] ?? null;
}
