import type { LineMetadata, StationMetadata } from '@core/types';

export const HUB_LEVEL_STEP_M = 7.5;
export const HUB_BASE_Z_M = 0.7;
const HUB_FLAT_RADIUS_M = 74;
const HUB_RAMP_END_M = 175;
const HUB_CLUSTER_RADIUS_M = 85;
const LAT_SCALE = 111_320;

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

function isViaductZone(shortName: string, coord: [number, number]): boolean {
  const s = shortName.trim().toUpperCase();
  const [lng, lat] = coord;
  if (s === '2') return lng >= 2.341 && lng <= 2.376 && lat >= 48.875 && lat <= 48.889;
  if (s === '6') {
    return (
      (lng >= 2.282 && lng <= 2.309 && lat >= 48.844 && lat <= 48.862) ||
      (lng >= 2.346 && lng <= 2.383 && lat >= 48.828 && lat <= 48.843)
    );
  }
  return false;
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

    for (let bottomUpIdx = 0; bottomUpIdx < deepToShallow.length; bottomUpIdx += 1) {
      const line = deepToShallow[bottomUpIdx];
      const isViaduct = isViaductZone(line.short_name, cluster.center);
      const nominalZ = HUB_BASE_Z_M + bottomUpIdx * HUB_LEVEL_STEP_M;
      const targetZ = isViaduct ? Math.max(nominalZ, line.elevation_offset, 10.5) : nominalZ;
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
 * smoothly ramping from baseline line elevation into stacked multi-level hub platforms.
 */
export function resolveLineElevationAt(
  coord: [number, number],
  line: LineMetadata,
  registry: HubRegistry | null | undefined
): number {
  const baseline = line.elevation_offset;
  if (!registry) return baseline;
  const lineAnchors = registry.anchorsByLineId.get(line.id);
  if (!lineAnchors || lineAnchors.length === 0) return baseline;

  let weightedDelta = 0;
  let maxWeight = 0;

  for (const anchor of lineAnchors) {
    const dist = approxDistM(coord, anchor.coordinates);
    if (dist >= HUB_RAMP_END_M) continue;
    const targetZ = anchor.zByLineId.get(line.id);
    if (targetZ === undefined) continue;

    const w =
      dist <= HUB_FLAT_RADIUS_M
        ? 1
        : smoothstep01(1 - (dist - HUB_FLAT_RADIUS_M) / (HUB_RAMP_END_M - HUB_FLAT_RADIUS_M));
    if (w > maxWeight) {
      maxWeight = w;
      weightedDelta = targetZ - baseline;
    }
  }

  return baseline + weightedDelta * maxWeight;
}

/**
 * Subdivide long polyline segments near multi-level hubs so track ramps follow smooth elevation curves.
 */
export function elevateTrackPath(
  coordinates: [number, number][],
  line: LineMetadata,
  registry: HubRegistry | null | undefined
): [number, number, number][] {
  if (coordinates.length === 0) return [];
  const lineAnchors = registry?.anchorsByLineId.get(line.id);
  if (!lineAnchors || lineAnchors.length === 0) {
    const z = line.elevation_offset;
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
        const nearHub = lineAnchors.some(
          (a) => approxDistM(mid, a.coordinates) <= HUB_RAMP_END_M + segM * 0.5
        );
        if (nearHub) {
          const steps = Math.min(6, Math.ceil(segM / 35));
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
