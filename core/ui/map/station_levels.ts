import type { LineMetadata, StationMetadata } from '@core/types';

export const HUB_LEVEL_STEP_M = 7.5;
export const HUB_BASE_Z_M = -7.5;
export const VIADUCT_Z_M = 10.5;
export const VIADUCT_RAMP_M = 180;
const HUB_FLAT_RADIUS_M = 74;
const HUB_RAMP_END_M = 175;
const HUB_CLUSTER_RADIUS_M = 85;
const LAT_SCALE = 111_320;

export function projectMeters(
  lng: number,
  lat: number,
  refLng: number,
  refLat: number
): [number, number] {
  const cosLat = Math.max(0.1, Math.cos((refLat * Math.PI) / 180));
  return [(lng - refLng) * LAT_SCALE * cosLat, (lat - refLat) * LAT_SCALE];
}

export function unprojectMeters(
  x: number,
  y: number,
  refLng: number,
  refLat: number
): [number, number] {
  const cosLat = Math.max(0.1, Math.cos((refLat * Math.PI) / 180));
  return [refLng + x / (LAT_SCALE * cosLat), refLat + y / LAT_SCALE];
}

/**
 * Shallow-to-deep architectural platform ordering for iconic Parisian multi-level hubs
 * (matching real RATP/AxoMaps depth strata, e.g. Strasbourg–Saint-Denis L4 > L8 > L9).
 */
const HUB_SHALLOW_TO_DEEP_OVERRIDES: Record<string, string[]> = {
  'strasbourg - saint-denis': ['4', '8', '9'],
  'strasbourg saint-denis': ['4', '8', '9'],
  opera: ['3', '7', '8'],
  chatelet: ['1', '7', '4', '11', '14', 'B', 'D', 'A'],
  'chatelet - les halles': ['1', '7', '4', '11', '14', 'B', 'D', 'A'],
  republique: ['3', '5', '8', '9', '11'],
  concorde: ['1', '8', '12'],
  bastille: ['1', '5', '8'],
  nation: ['1', '2', '6', '9', 'A'],
  'charles de gaulle - etoile': ['1', '2', '6', 'A'],
  "place d'italie": ['6', '5', '7'],
  'la motte-picquet - grenelle': ['6', '8', '10'],
  'montparnasse - bienvenue': ['4', '6', '12', '13'],
  'grands boulevards': ['8', '9'],
  'bonne nouvelle': ['8', '9'],
  'richelieu - drouot': ['8', '9'],
  'saint-lazare': ['3', '12', '13', '14', 'E'],
  'gare de lyon': ['1', '14', 'A', 'D'],
  'gare du nord': ['4', '5', 'B', 'D', 'E'],
  'denfert-rochereau': ['6', '4', 'B'],
};

export interface HubAnchor {
  id: string;
  name: string;
  coordinates: [number, number];
  /** Line IDs ordered deepest -> shallowest (bottom-up for X-ray vertical clearance). */
  deepToShallowLineIds: string[];
  levelByLineId: Map<string, number>;
  zByLineId: Map<string, number>;
}

export interface HubRegistry {
  anchors: HubAnchor[];
  anchorsByLineId: Map<string, HubAnchor[]>;
  stationLineLevel: Map<
    string,
    { bottomUpIdx: number; levelCount: number; targetZ: number; hub: HubAnchor }
  >;
}

function normalizeHubName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

interface LngLatBox {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

const VIADUCT_BOXES: Record<string, LngLatBox[]> = {
  '2': [{ minLng: 2.341, maxLng: 2.376, minLat: 48.875, maxLat: 48.889 }],
  '6': [
    // Passy -> Bir-Hakeim -> Dupleix -> La Motte-Picquet -> Cambronne -> Sèvres-Lecourbe
    { minLng: 2.285, maxLng: 2.3105, minLat: 48.844, maxLat: 48.859 },
    // Saint-Jacques -> Glacière -> Corvisart (dips underground beneath Place d'Italie)
    { minLng: 2.3365, maxLng: 2.3515, minLat: 48.8285, maxLat: 48.834 },
    // Nationale -> Chevaleret -> Quai de la Gare -> Pont de Bercy (underground at Bercy)
    { minLng: 2.3618, maxLng: 2.3782, minLat: 48.832, maxLat: 48.8415 },
  ],
};

function distanceToBoxMeters(coord: [number, number], box: LngLatBox): number {
  const [lng, lat] = coord;
  const clampedLng = Math.max(box.minLng, Math.min(box.maxLng, lng));
  const clampedLat = Math.max(box.minLat, Math.min(box.maxLat, lat));
  if (clampedLng === lng && clampedLat === lat) return 0;
  const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  return Math.hypot((lng - clampedLng) * LAT_SCALE * cosLat, (lat - clampedLat) * LAT_SCALE);
}

/**
 * Smooth ramp factor `[0..1]` for aerial viaduct zones (1 inside viaduct corridor,
 * tapering to 0 over `VIADUCT_RAMP_M` outside portal approaches).
 */
export function viaductFactorAt(shortName: string, coord: [number, number]): number {
  const boxes = VIADUCT_BOXES[shortName.trim().toUpperCase()];
  if (!boxes) return 0;
  let minDist = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    const d = distanceToBoxMeters(coord, box);
    if (d <= 0) return 1;
    if (d < minDist) minDist = d;
  }
  if (minDist >= VIADUCT_RAMP_M) return 0;
  const t = minDist / VIADUCT_RAMP_M;
  return 1 - t * t * (3 - 2 * t);
}

export function hasViaductZones(shortName: string): boolean {
  return Boolean(VIADUCT_BOXES[shortName.trim().toUpperCase()]);
}

function isViaductZone(shortName: string, coord: [number, number]): boolean {
  return viaductFactorAt(shortName, coord) >= 0.5;
}

export function isAerialViaductLocation(shortName: string, coord: [number, number]): boolean {
  return isViaductZone(shortName, coord);
}

export function resolveSubsurfaceBaselineZ(line: LineMetadata): number {
  const shortKey = line.short_name.trim().toUpperCase();
  if (line.mode === 'rail' || ['A', 'B', 'C', 'D', 'E'].includes(shortKey)) {
    const rerIdx = Math.max(0, shortKey.charCodeAt(0) - 65);
    return -21.0 - rerIdx * 1.2;
  }
  return HUB_BASE_Z_M - Math.max(0, line.elevation_offset || 0) * 0.55;
}

function approxDistM(a: [number, number], b: [number, number]): number {
  const lonScale = LAT_SCALE * Math.cos(((a[1] + b[1]) * 0.5 * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * lonScale, (a[1] - b[1]) * LAT_SCALE);
}

function rankShallowToDeep(
  line: LineMetadata,
  overrideOrder?: string[],
  coord?: [number, number]
): number {
  const shortKey = line.short_name.trim().toUpperCase();
  if (coord && isViaductZone(shortKey, coord)) return -100;
  if (overrideOrder) {
    const idx = overrideOrder.indexOf(shortKey);
    if (idx !== -1) return idx;
  }
  if (line.mode === 'rail') return 200 + shortKey.charCodeAt(0);
  const match = shortKey.match(/^(\d+)([A-Z]*)$/);
  if (match) {
    return 50 + Number(match[1]) * 2 + (match[2] ? 1 : 0);
  }
  return 120;
}

/**
 * Build vertical multi-level stacking anchors for every interchange hub in the active city.
 * Guarantees >= HUB_LEVEL_STEP_M (7.5m) clearance between crossing or parallel superposed stations.
 */
export function buildHubRegistry(stations: StationMetadata[], lines: LineMetadata[]): HubRegistry {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const clusters: Array<{
    stations: StationMetadata[];
    lineIds: Set<string>;
    center: [number, number];
  }> = [];

  for (const station of stations) {
    const existing = clusters.find(
      (c) => approxDistM(c.center, station.coordinates) <= HUB_CLUSTER_RADIUS_M
    );
    if (existing) {
      existing.stations.push(station);
      for (const lId of station.lines) existing.lineIds.add(lId);
    } else {
      clusters.push({
        stations: [station],
        lineIds: new Set(station.lines),
        center: station.coordinates,
      });
    }
  }

  const anchors: HubAnchor[] = [];
  const anchorsByLineId = new Map<string, HubAnchor[]>();
  const stationLineLevel = new Map<
    string,
    { bottomUpIdx: number; levelCount: number; targetZ: number; hub: HubAnchor }
  >();

  for (const cluster of clusters) {
    if (cluster.lineIds.size <= 1) continue;

    const primaryStation = cluster.stations[0];
    const normName = normalizeHubName(primaryStation.name);
    const override = HUB_SHALLOW_TO_DEEP_OVERRIDES[normName];

    const servingLines = [...cluster.lineIds]
      .map((id) => lineById.get(id))
      .filter((l): l is LineMetadata => Boolean(l));
    if (servingLines.length <= 1) continue;

    // Sort shallowest first -> reverse so index 0 is deepest bottom tier (`HUB_BASE_Z_M`)
    const shallowToDeep = servingLines
      .slice()
      .sort(
        (a, b) =>
          rankShallowToDeep(a, override, cluster.center) -
            rankShallowToDeep(b, override, cluster.center) ||
          a.short_name.localeCompare(b.short_name, 'fr')
      );

    const deepToShallow = shallowToDeep.slice().reverse();
    const levelByLineId = new Map<string, number>();
    const zByLineId = new Map<string, number>();

    let undergroundRank = 0;
    const targetZByLineId = new Map<string, number>();
    for (const line of shallowToDeep) {
      const isViaduct = isViaductZone(line.short_name, cluster.center);
      const targetZ = isViaduct
        ? Math.max(line.elevation_offset, VIADUCT_Z_M)
        : HUB_BASE_Z_M - undergroundRank * HUB_LEVEL_STEP_M;
      if (!isViaduct) undergroundRank += 1;
      targetZByLineId.set(line.id, targetZ);
    }

    for (let bottomUpIdx = 0; bottomUpIdx < deepToShallow.length; bottomUpIdx += 1) {
      const line = deepToShallow[bottomUpIdx];
      const targetZ = targetZByLineId.get(line.id) ?? HUB_BASE_Z_M;
      levelByLineId.set(line.id, bottomUpIdx);
      zByLineId.set(line.id, targetZ);
    }

    const anchor: HubAnchor = {
      id: primaryStation.id,
      name: primaryStation.name,
      coordinates: cluster.center,
      deepToShallowLineIds: deepToShallow.map((l) => l.id),
      levelByLineId,
      zByLineId,
    };
    anchors.push(anchor);

    for (const line of deepToShallow) {
      const list = anchorsByLineId.get(line.id);
      if (list) list.push(anchor);
      else anchorsByLineId.set(line.id, [anchor]);
    }

    for (const st of cluster.stations) {
      for (const lId of st.lines) {
        const bottomUpIdx = levelByLineId.get(lId);
        const targetZ = zByLineId.get(lId);
        if (bottomUpIdx === undefined || targetZ === undefined) continue;
        stationLineLevel.set(`${st.id}::${lId}`, {
          bottomUpIdx,
          levelCount: deepToShallow.length,
          targetZ,
          hub: anchor,
        });
      }
    }
  }

  return { anchors, anchorsByLineId, stationLineLevel };
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Resolve continuous track / train / platform elevation (meters) at any coordinate on a line,
 * placing underground tracks beneath `z = 0`, stacking interchange hubs downward in `-7.5 m`
 * steps, and smoothly climbing tunnel portals up onto `L2` / `L6` viaducts (`+10.5 m`).
 */
export function resolveLineElevationAt(
  coord: [number, number],
  line: LineMetadata,
  registry: HubRegistry | null | undefined
): number {
  const vf = viaductFactorAt(line.short_name, coord);
  const viaductZ = Math.max(line.elevation_offset, VIADUCT_Z_M);
  const baseline = resolveSubsurfaceBaselineZ(line);

  let undergroundZ = baseline;
  const lineAnchors = registry?.anchorsByLineId.get(line.id);
  if (lineAnchors && lineAnchors.length > 0) {
    let weightedDelta = 0;
    let maxWeight = 0;

    for (const anchor of lineAnchors) {
      const targetZ = anchor.zByLineId.get(line.id);
      if (targetZ === undefined || targetZ > 0) continue;
      const dist = approxDistM(coord, anchor.coordinates);
      if (dist >= HUB_RAMP_END_M) continue;

      const w =
        dist <= HUB_FLAT_RADIUS_M
          ? 1
          : smoothstep01(1 - (dist - HUB_FLAT_RADIUS_M) / (HUB_RAMP_END_M - HUB_FLAT_RADIUS_M));
      if (w > maxWeight) {
        maxWeight = w;
        weightedDelta = targetZ - baseline;
      }
    }
    undergroundZ = baseline + weightedDelta * maxWeight;
  }

  if (vf <= 0) return undergroundZ;
  if (vf >= 1) return viaductZ;
  return undergroundZ * (1 - vf) + viaductZ * vf;
}

/**
 * Subdivide long polyline segments near multi-level hubs or viaduct portals so track ramps
 * follow smooth elevation curves.
 */
export function elevateTrackPath(
  coordinates: [number, number][],
  line: LineMetadata,
  registry: HubRegistry | null | undefined
): [number, number, number][] {
  if (coordinates.length === 0) return [];
  const lineAnchors = registry?.anchorsByLineId.get(line.id);
  const hasViaduct = hasViaductZones(line.short_name);
  if ((!lineAnchors || lineAnchors.length === 0) && !hasViaduct) {
    const z = resolveSubsurfaceBaselineZ(line);
    return coordinates.map(([lng, lat]) => [lng, lat, z]);
  }

  const out: [number, number, number][] = [];
  for (let i = 0; i < coordinates.length; i += 1) {
    const cur = coordinates[i];
    if (i > 0) {
      const prev = coordinates[i - 1];
      const segM = approxDistM(prev, cur);
      if (segM > 45) {
        const mid: [number, number] = [(prev[0] + cur[0]) * 0.5, (prev[1] + cur[1]) * 0.5];
        const nearHub = Boolean(
          lineAnchors?.some((a) => approxDistM(mid, a.coordinates) <= HUB_RAMP_END_M + segM * 0.5)
        );
        const crossesViaductRamp =
          hasViaduct &&
          (Math.abs(
            viaductFactorAt(line.short_name, prev) - viaductFactorAt(line.short_name, cur)
          ) > 0.01 ||
            (viaductFactorAt(line.short_name, mid) > 0.01 &&
              viaductFactorAt(line.short_name, mid) < 0.99));
        if (nearHub || crossesViaductRamp) {
          const steps = Math.min(8, Math.ceil(segM / 35));
          for (let s = 1; s < steps; s += 1) {
            const f = s / steps;
            const pt: [number, number] = [
              prev[0] + (cur[0] - prev[0]) * f,
              prev[1] + (cur[1] - prev[1]) * f,
            ];
            out.push([pt[0], pt[1], resolveLineElevationAt(pt, line, registry)]);
          }
        }
      }
    }
    out.push([cur[0], cur[1], resolveLineElevationAt(cur, line, registry)]);
  }
  return out;
}
