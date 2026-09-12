import { PolygonLayer } from '@deck.gl/layers';
import type { LineMetadata, StationMetadata } from '@core/types';

export interface PlatformPath {
  coordinates: [number, number][];
  lineId: string;
  elevation: number;
}

interface PlatformDatum {
  polygon: [number, number, number][];
  lineId: string;
  stationId: string;
}

const LAT_SCALE = 111_320;
const PLATFORM_WIDTH_M = 5.5;
const PLATFORM_HEIGHT_M = 0.9;

function project(point: [number, number], latitude: number): [number, number] {
  const lonScale = LAT_SCALE * Math.cos((latitude * Math.PI) / 180);
  return [point[0] * lonScale, point[1] * LAT_SCALE];
}

function unproject(point: [number, number], latitude: number): [number, number] {
  const lonScale = LAT_SCALE * Math.cos((latitude * Math.PI) / 180);
  return [point[0] / lonScale, point[1] / LAT_SCALE];
}

function closestPointOnPath(
  target: [number, number],
  path: [number, number][]
): { point: [number, number]; tangent: [number, number] } | null {
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
    const t = Math.max(0, Math.min(1, ((targetMeters[0] - a[0]) * vx + (targetMeters[1] - a[1]) * vy) / (length * length)));
    const point: [number, number] = [a[0] + vx * t, a[1] + vy * t];
    const distance = Math.hypot(targetMeters[0] - point[0], targetMeters[1] - point[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = point;
      bestTangent = [vx / length, vy / length];
    }
  }

  return { point: bestPoint, tangent: bestTangent };
}

function platformForStation(
  station: StationMetadata,
  line: LineMetadata,
  paths: [number, number][][]
): PlatformDatum | null {
  let closest: { point: [number, number]; tangent: [number, number] } | null = null;
  for (const path of paths) {
    const candidate = closestPointOnPath(station.coordinates, path);
    if (!candidate) continue;
    if (!closest || Math.hypot(candidate.point[0] - project(station.coordinates, station.coordinates[1])[0], candidate.point[1] - project(station.coordinates, station.coordinates[1])[1]) < Math.hypot(closest.point[0] - project(station.coordinates, station.coordinates[1])[0], closest.point[1] - project(station.coordinates, station.coordinates[1])[1])) {
      closest = candidate;
    }
  }
  if (!closest) return null;

  const length = station.is_hub || station.lines.length > 1 ? 115 : 90;
  const halfLength = length / 2;
  const [tx, ty] = closest.tangent;
  const nx = -ty;
  const ny = tx;
  const center = closest.point;
  const corners: [number, number][] = [
    [center[0] - tx * halfLength - nx * PLATFORM_WIDTH_M / 2, center[1] - ty * halfLength - ny * PLATFORM_WIDTH_M / 2],
    [center[0] + tx * halfLength - nx * PLATFORM_WIDTH_M / 2, center[1] + ty * halfLength - ny * PLATFORM_WIDTH_M / 2],
    [center[0] + tx * halfLength + nx * PLATFORM_WIDTH_M / 2, center[1] + ty * halfLength + ny * PLATFORM_WIDTH_M / 2],
    [center[0] - tx * halfLength + nx * PLATFORM_WIDTH_M / 2, center[1] - ty * halfLength + ny * PLATFORM_WIDTH_M / 2]
  ];
  const polygon = corners.map((corner) => {
    const [longitude, latitude] = unproject(corner, station.coordinates[1]);
    return [longitude, latitude, line.elevation_offset + PLATFORM_HEIGHT_M] as [number, number, number];
  });
  return { polygon, lineId: line.id, stationId: station.id };
}

export function createPlatformsLayer(
  stations: StationMetadata[],
  line: LineMetadata | null,
  paths: [number, number][][],
  zoom: number
): PolygonLayer<PlatformDatum> | null {
  if (!line || paths.length === 0 || zoom < 13.5) return null;
  const data = stations
    .filter((station) => station.lines.includes(line.id))
    .map((station) => platformForStation(station, line, paths))
    .filter((platform): platform is PlatformDatum => platform !== null);
  if (data.length === 0) return null;

  return new PolygonLayer<PlatformDatum>({
    id: 'subway-platforms',
    data,
    pickable: false,
    extruded: true,
    wireframe: false,
    filled: true,
    getPolygon: (datum) => datum.polygon,
    getElevation: PLATFORM_HEIGHT_M,
    getFillColor: [169, 162, 154, 205],
    material: {
      ambient: 0.65,
      diffuse: 0.45,
      shininess: 8,
      specularColor: [80, 76, 70]
    },
    parameters: { depthTest: false, depthWriteEnabled: false } as any,
    updateTriggers: {
      getPolygon: [line.id, zoom]
    }
  });
}
