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
  stroked: boolean;
}

const LAT_SCALE = 111_320;
const TRACK_CLEARANCE_M = 1.52;
const PLATFORM_WIDTH_M = 4.0;
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
    }
  }

  return { point: bestPoint, tangent: bestTangent, distanceM: bestDistance };
}

function makeQuadPolygon(
  centerM: [number, number],
  tangent: [number, number],
  normal: [number, number],
  s0: number,
  s1: number,
  n0: number,
  n1: number,
  z: number,
  refLat: number
): [number, number, number][] {
  const [tx, ty] = tangent;
  const [nx, ny] = normal;
  const pts: [number, number][] = [
    [centerM[0] + tx * s0 + nx * n0, centerM[1] + ty * s0 + ny * n0],
    [centerM[0] + tx * s1 + nx * n0, centerM[1] + ty * s1 + ny * n0],
    [centerM[0] + tx * s1 + nx * n1, centerM[1] + ty * s1 + ny * n1],
    [centerM[0] + tx * s0 + nx * n1, centerM[1] + ty * s0 + ny * n1],
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
  let closest: { point: [number, number]; tangent: [number, number]; distanceM: number } | null =
    null;
  for (const path of paths) {
    const candidate = closestPointOnPath(station.coordinates, path);
    if (!candidate) continue;
    if (!closest || candidate.distanceM < closest.distanceM) {
      closest = candidate;
    }
  }
  if (!closest) return [];

  const length = station.is_hub || station.lines.length > 1 ? 114 : 90;
  const halfLength = length / 2;
  const [tx, ty] = closest.tangent;
  const normal: [number, number] = [-ty, tx];
  const center = closest.point;

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

  // Subdivided mineral concrete bays for visible granite tile grain on zoom-in
  for (let b = 0; b < TILE_BAY_COUNT; b += 1) {
    const s0 = -halfLength + b * bayLen;
    const s1 = s0 + bayLen - 0.14;
    const isAlt = b % 2 === 0;
    const fillColor: [number, number, number, number] =
      theme === 'light'
        ? isAlt
          ? [134, 129, 122, 224]
          : [122, 117, 110, 224]
        : isAlt
          ? [164, 159, 151, 222]
          : [151, 146, 138, 222];

    tiles.push({
      polygon: makeQuadPolygon(
        center,
        closest.tangent,
        normal,
        s0,
        s1,
        TRACK_CLEARANCE_M + SAFETY_STRIP_WIDTH_M,
        TRACK_CLEARANCE_M + PLATFORM_WIDTH_M,
        baseZ,
        station.coordinates[1]
      ),
      lineId: line.id,
      stationId: station.id,
      fillColor,
      lineColor: seamColor,
      elevationM: PLATFORM_HEIGHT_M,
      stroked: true,
    });
  }

  // Crisp trackside safety tactile coping strip along +1.52m .. +1.88m edge (clear of train envelope)
  const safetyFill: [number, number, number, number] =
    theme === 'light' ? [246, 242, 232, 245] : [232, 226, 212, 242];
  tiles.push({
    polygon: makeQuadPolygon(
      center,
      closest.tangent,
      normal,
      -halfLength,
      halfLength,
      TRACK_CLEARANCE_M,
      TRACK_CLEARANCE_M + SAFETY_STRIP_WIDTH_M,
      baseZ + 0.02,
      station.coordinates[1]
    ),
    lineId: line.id,
    stationId: station.id,
    fillColor: safetyFill,
    lineColor: accentColor,
    elevationM: PLATFORM_HEIGHT_M + 0.02,
    stroked: true,
  });

  return tiles;
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
  let data: PlatformTileDatum[] = [];
  const offsetFor = (lineId: string) =>
    followElevation && followElevation.lineId === lineId ? followElevation.offset : 0;

  if (line && paths.length > 0 && zoom >= 13.5) {
    const lineOff = offsetFor(line.id);
    for (const station of stations) {
      if (!station.lines.includes(line.id)) continue;
      data.push(...platformTilesForStation(station, line, paths, theme, lineOff, hubRegistry));
    }
  } else if (!line && allLines && zoom >= 15.0) {
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
  if (data.length === 0) return null;

  return new PolygonLayer<PlatformTileDatum>({
    id: 'subway-platforms',
    data,
    pickable: false,
    extruded: true,
    wireframe: false,
    filled: true,
    stroked: true,
    lineWidthUnits: 'meters',
    getLineWidth: 0.16,
    getLineColor: (datum) => datum.lineColor,
    getPolygon: (datum) => datum.polygon,
    getElevation: (datum) => datum.elevationM,
    getFillColor: (datum) => datum.fillColor,
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
  });
}
