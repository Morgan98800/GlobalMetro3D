import { PathLayer, PolygonLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import type { LineMetadata, StationMetadata } from '@core/types';
import { isMobileGpuDevice } from './device_perf';
import { LATIN_CHARACTER_SET } from './labels_layer';
import {
  closestPointOnPath,
  makeCurvedQuad,
  sampleTrackSpine,
  type TrackSpine,
} from './platforms_layer';
import {
  buildHubRegistry,
  type HubRegistry,
  isAerialViaductLocation,
  projectMeters,
  resolveLineElevationAt,
  unprojectMeters,
} from './station_levels';

export { isAerialViaductLocation } from './station_levels';

export interface LocalStationDetailInput {
  lines: LineMetadata[];
  stations: StationMetadata[];
  tracksByLine: Map<string, [number, number][][]>;
  selectedLineId: string | null;
  zoom: number;
  mapCenter: [number, number];
  theme: 'dark' | 'light';
  followElevation?: { lineId: string | null; offset: number };
  hubRegistry?: HubRegistry | null;
  undergroundBeforeId?: string;
  xrayMode?: boolean;
}

interface CutawayPolygonDatum {
  polygon: [number, number, number][];
  fillColor: [number, number, number, number];
  lineColor: [number, number, number, number];
  elevationM: number;
  extruded: boolean;
  isUnderground: boolean;
}

interface SleeperDatum {
  polygon: [number, number, number][];
  color: [number, number, number, number];
  isUnderground: boolean;
}

interface RailPathDatum {
  path: [number, number, number][];
  color: [number, number, number, number];
  widthM: number;
  isUnderground: boolean;
}

export interface SielBoardAnchor {
  stationName: string;
  stationCoords: [number, number];
  lineId: string;
  lineShortName: string;
  tangent: [number, number];
  sideSign: 1 | -1;
  position: [number, number, number];
  isUnderground: boolean;
}

// 4x5 ceramic mosaic glyph map for Nord-Sud / RATP wall plaques
const MOSAIC_GLYPHS: Record<string, readonly string[]> = {
  A: ['0110', '1001', '1111', '1001', '1001'],
  B: ['1110', '1001', '1110', '1001', '1110'],
  C: ['0111', '1000', '1000', '1000', '0111'],
  D: ['1110', '1001', '1001', '1001', '1110'],
  E: ['1111', '1000', '1110', '1000', '1111'],
  F: ['1111', '1000', '1110', '1000', '1000'],
  G: ['0111', '1000', '1011', '1001', '0111'],
  H: ['1001', '1001', '1111', '1001', '1001'],
  I: ['111', '010', '010', '010', '111'],
  J: ['0011', '0001', '0001', '1001', '0110'],
  K: ['1001', '1010', '1100', '1010', '1001'],
  L: ['1000', '1000', '1000', '1000', '1111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  O: ['0110', '1001', '1001', '1001', '0110'],
  P: ['1110', '1001', '1110', '1000', '1000'],
  Q: ['0110', '1001', '1001', '1011', '0111'],
  R: ['1110', '1001', '1110', '1010', '1001'],
  S: ['0111', '1000', '0110', '0001', '1110'],
  T: ['11111', '00100', '00100', '00100', '00100'],
  U: ['1001', '1001', '1001', '1001', '0110'],
  V: ['1001', '1001', '1001', '0110', '0110'],
  W: ['10001', '10001', '10101', '11011', '10001'],
  X: ['1001', '1001', '0110', '1001', '1001'],
  Y: ['10001', '01010', '00100', '00100', '00100'],
  Z: ['1111', '0010', '0100', '1000', '1111'],
  '0': ['0110', '1001', '1001', '1001', '0110'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['1110', '0001', '0110', '1000', '1111'],
  '3': ['1110', '0001', '0110', '0001', '1110'],
  '4': ['1001', '1001', '1111', '0001', '0001'],
  '5': ['1111', '1000', '1110', '0001', '1110'],
  '6': ['0111', '1000', '1110', '1001', '0110'],
  '7': ['1111', '0001', '0010', '0100', '0100'],
  '8': ['0110', '1001', '0110', '1001', '0110'],
  '9': ['0110', '1001', '0111', '0001', '1110'],
  '-': ['000', '000', '111', '000', '000'],
  "'": ['1', '1', '0', '0', '0'],
  ' ': ['00', '00', '00', '00', '00'],
};

function normalizePlaqueText(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\-' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FAKE_AD_PALETTES: Array<{
  bg: [number, number, number, number];
  accent: [number, number, number, number];
  band: [number, number, number, number];
}> = [
  { bg: [34, 54, 104, 248], accent: [245, 200, 82, 248], band: [18, 28, 56, 250] },
  { bg: [143, 31, 43, 248], accent: [233, 196, 106, 248], band: [42, 15, 18, 250] },
  { bg: [47, 93, 70, 248], accent: [207, 227, 184, 248], band: [27, 53, 40, 250] },
  { bg: [201, 113, 59, 248], accent: [243, 230, 203, 248], band: [60, 35, 22, 250] },
];

export const STATION_DETAIL_ZOOM_MIN = 14.5;
const TRACK_HALF_SEP_M = 1.55;
const RAIL_HALF_GAUGE_M = 0.72; // 1.44m standard track gauge
const THIRD_RAIL_INNER_OFFSET_M = 1.02;
const SLEEPER_HALF_LEN_M = 1.02;
const SLEEPER_HALF_WIDTH_M = 0.12;
const WALL_BAY_COUNT = 6;
const PLATFORM_INNER_M = 3.18;
const PLATFORM_OUTER_M = 6.78;
const WALL_INNER_M = 7.08;
const WALL_OUTER_M = 7.52;

function projectM(point: [number, number], refLat: number): [number, number] {
  return projectMeters(point[0], point[1], 0, refLat);
}

function unprojectM(point: [number, number], refLat: number): [number, number] {
  return unprojectMeters(point[0], point[1], 0, refLat);
}

function hexToRgb(hex?: string): [number, number, number] {
  const clean = (hex || '#4B5563').replace('#', '');
  if (clean.length !== 6) return [75, 85, 99];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function quadM(
  origin: [number, number],
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
    [origin[0] + tx * s0 + nx * n0, origin[1] + ty * s0 + ny * n0],
    [origin[0] + tx * s1 + nx * n0, origin[1] + ty * s1 + ny * n0],
    [origin[0] + tx * s1 + nx * n1, origin[1] + ty * s1 + ny * n1],
    [origin[0] + tx * s0 + nx * n1, origin[1] + ty * s0 + ny * n1],
  ];
  return pts.map((pt) => {
    const [lng, lat] = unprojectM(pt, refLat);
    return [lng, lat, z];
  });
}

export function shouldEnableUndergroundXray(
  zoom: number,
  center: [number, number],
  selectedLineShortName?: string | null,
  isFollowingTrain = false
): boolean {
  // Never fade 3D city buildings during normal map exploration/zooming;
  // reserve X-ray translucency strictly for tight underground train-follow cameras.
  if (!isFollowingTrain || zoom < 15.0) return false;
  if (selectedLineShortName && isAerialViaductLocation(selectedLineShortName, center)) {
    return false;
  }
  if (
    !selectedLineShortName &&
    (isAerialViaductLocation('2', center) || isAerialViaductLocation('6', center))
  ) {
    return false;
  }
  return true;
}

export interface StationDetailLodResult {
  layers: any[];
  sielAnchors: SielBoardAnchor[];
}

export function createLocalStationDetailLayers(input: LocalStationDetailInput): any[] {
  return createLocalStationDetailBundle(input).layers;
}

export function createLocalStationDetailBundle(
  input: LocalStationDetailInput
): StationDetailLodResult {
  if (input.zoom < STATION_DETAIL_ZOOM_MIN) return { layers: [], sielAnchors: [] };

  const isMobile = isMobileGpuDevice();
  const radiusM = isMobile ? 350 : 480;
  const maxStations = isMobile ? 6 : 9;
  const sleeperStepM = isMobile ? 1.35 : 0.98;
  const maxSleepers = isMobile ? 420 : 680;
  const refLat = input.mapCenter[1];
  const centerM = projectM(input.mapCenter, refLat);
  const isLight = input.theme === 'light';
  const registry = input.hubRegistry ?? buildHubRegistry(input.stations, input.lines);

  const visibleLines = input.selectedLineId
    ? input.lines.filter((l) => l.id === input.selectedLineId)
    : input.lines;

  const offsetFor = (lineId: string) =>
    input.followElevation && input.followElevation.lineId === lineId
      ? input.followElevation.offset
      : 0;

  const cutouts: CutawayPolygonDatum[] = [];
  const viaductDecks: CutawayPolygonDatum[] = [];
  const stationStructures: CutawayPolygonDatum[] = [];
  const sleepers: SleeperDatum[] = [];
  const railPaths: RailPathDatum[] = [];
  const vaultRibs: RailPathDatum[] = [];
  const sielAnchors: SielBoardAnchor[] = [];

  // 1. Local twin tracks (±1.55 m), sleepers, third rails, Metroskop tunnel shell & viaduct piers
  let sleeperCount = 0;
  let viaductPierAccum = 0;

  for (const line of visibleLines) {
    if (line.mode !== 'metro' && line.mode !== 'tube' && line.mode !== 'rail') continue;
    const linePaths = input.tracksByLine.get(line.id);
    if (!linePaths || linePaths.length === 0) continue;
    const lineOffset = offsetFor(line.id);
    const isMetro = line.mode === 'metro' || line.mode === 'tube';
    const [lr, lg, lb] = hexToRgb(line.color);

    for (const path of linePaths) {
      if (path.length < 2) continue;

      const railStreams: Array<{
        left: [number, number, number][];
        right: [number, number, number][];
        third: [number, number, number][];
      }> = [
        { left: [], right: [], third: [] },
        { left: [], right: [], third: [] },
      ];
      let streamIsUnderground = true;
      let hasStreamStarted = false;

      const pushOffsetPt = (
        baseM: [number, number],
        nx: number,
        ny: number,
        offsetM: number,
        z: number,
        target: [number, number, number][]
      ) => {
        const pt = unprojectM([baseM[0] + nx * offsetM, baseM[1] + ny * offsetM], refLat);
        target.push([pt[0], pt[1], z]);
      };

      const flushRails = () => {
        if (input.zoom >= 16.1) {
          for (const stream of railStreams) {
            const railColor: [number, number, number, number] = isLight
              ? [102, 108, 118, 175]
              : [206, 212, 222, 175];
            if (stream.left.length >= 2) {
              railPaths.push({
                path: stream.left,
                color: railColor,
                widthM: 0.09,
                isUnderground: streamIsUnderground,
              });
            }
            if (stream.right.length >= 2) {
              railPaths.push({
                path: stream.right,
                color: railColor,
                widthM: 0.09,
                isUnderground: streamIsUnderground,
              });
            }
            if (isMetro && stream.third.length >= 2) {
              railPaths.push({
                path: stream.third,
                color: [176, 128, 74, 230],
                widthM: 0.08,
                isUnderground: streamIsUnderground,
              });
            }
          }
        }
        for (const stream of railStreams) {
          stream.left = [];
          stream.right = [];
          stream.third = [];
        }
        hasStreamStarted = false;
      };

      for (let i = 1; i < path.length; i += 1) {
        const p0 = path[i - 1];
        const p1 = path[i];
        const aM = projectM(p0, refLat);
        const bM = projectM(p1, refLat);
        const midM: [number, number] = [(aM[0] + bM[0]) * 0.5, (aM[1] + bM[1]) * 0.5];
        const segLen = Math.hypot(bM[0] - aM[0], bM[1] - aM[1]);
        const distCenter = Math.hypot(midM[0] - centerM[0], midM[1] - centerM[1]);

        if (segLen < 0.05 || distCenter > radiusM + segLen * 0.5) {
          flushRails();
          continue;
        }

        const tx = (bM[0] - aM[0]) / segLen;
        const ty = (bM[1] - aM[1]) / segLen;
        const nx = -ty;
        const ny = tx;
        const midLngLat: [number, number] = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5];
        const isViaduct = isAerialViaductLocation(line.short_name, midLngLat);
        const z0 = resolveLineElevationAt(p0, line, registry) + lineOffset;
        const z1 = resolveLineElevationAt(p1, line, registry) + lineOffset;
        const midZ = (z0 + z1) * 0.5;
        const segUnderground = midZ < 0;

        if (hasStreamStarted && segUnderground !== streamIsUnderground) {
          flushRails();
        }
        streamIsUnderground = segUnderground;

        const sides = [1, -1] as const;
        if (!hasStreamStarted) {
          hasStreamStarted = true;
          for (let sIdx = 0; sIdx < sides.length; sIdx++) {
            const trackCenterOff = sides[sIdx] * TRACK_HALF_SEP_M;
            const st = railStreams[sIdx];
            pushOffsetPt(aM, nx, ny, trackCenterOff + RAIL_HALF_GAUGE_M, z0 + 0.02, st.left);
            pushOffsetPt(aM, nx, ny, trackCenterOff - RAIL_HALF_GAUGE_M, z0 + 0.02, st.right);
            if (isMetro) {
              pushOffsetPt(
                aM,
                nx,
                ny,
                trackCenterOff - sides[sIdx] * THIRD_RAIL_INNER_OFFSET_M,
                z0 + 0.04,
                st.third
              );
            }
          }
        }

        for (let sIdx = 0; sIdx < sides.length; sIdx++) {
          const trackCenterOff = sides[sIdx] * TRACK_HALF_SEP_M;
          const st = railStreams[sIdx];
          pushOffsetPt(bM, nx, ny, trackCenterOff + RAIL_HALF_GAUGE_M, z1 + 0.02, st.left);
          pushOffsetPt(bM, nx, ny, trackCenterOff - RAIL_HALF_GAUGE_M, z1 + 0.02, st.right);
          if (isMetro) {
            pushOffsetPt(
              bM,
              nx,
              ny,
              trackCenterOff - sides[sIdx] * THIRD_RAIL_INNER_OFFSET_M,
              z1 + 0.04,
              st.third
            );
          }
        }

        // Elevated viaduct stone/concrete twin bridge piers (Lines 2 & 6)
        if (isViaduct && midZ > 1.2) {
          viaductPierAccum += segLen;
          if (viaductPierAccum >= 26) {
            viaductPierAccum = 0;
            viaductDecks.push({
              polygon: quadM(midM, [tx, ty], [nx, ny], -0.85, 0.85, -2.55, 2.55, 0, refLat),
              fillColor: isLight ? [138, 132, 124, 240] : [82, 78, 72, 240],
              lineColor: [lr, lg, lb, 150],
              elevationM: Math.max(0.5, midZ - 0.18),
              extruded: true,
              isUnderground: false,
            });
          }
        }

        // Twin-track sleepers (close zoom only to avoid sub-pixel aliasing in overviews)
        if (input.zoom >= 16.1 && sleeperCount < maxSleepers && distCenter <= radiusM * 0.88) {
          const steps = Math.max(1, Math.floor(segLen / sleeperStepM));
          for (let k = 0; k < steps && sleeperCount < maxSleepers; k += 1) {
            const frac = (k + 0.5) / steps;
            const sm: [number, number] = [
              aM[0] + (bM[0] - aM[0]) * frac,
              aM[1] + (bM[1] - aM[1]) * frac,
            ];
            if (Math.hypot(sm[0] - centerM[0], sm[1] - centerM[1]) > radiusM * 0.85) continue;
            const sleeperAlt = sleeperCount % 2 === 0;
            const sz = z0 + (z1 - z0) * frac;
            const sleeperColor: [number, number, number, number] = sleeperAlt
              ? isLight
                ? [102, 92, 80, 245]
                : [64, 58, 52, 245]
              : isLight
                ? [88, 78, 68, 245]
                : [54, 48, 43, 245];
            for (const trackSide of [1, -1] as const) {
              const centerOff = trackSide * TRACK_HALF_SEP_M;
              sleepers.push({
                polygon: quadM(
                  sm,
                  [tx, ty],
                  [nx, ny],
                  -SLEEPER_HALF_WIDTH_M,
                  SLEEPER_HALF_WIDTH_M,
                  centerOff - SLEEPER_HALF_LEN_M,
                  centerOff + SLEEPER_HALF_LEN_M,
                  sz - 0.11,
                  refLat
                ),
                color: sleeperColor,
                isUnderground: sz < 0,
              });
            }
            sleeperCount += 1;
          }
        }
      }
      flushRails();
    }
  }

  // 2. Local Architectural Station Dioramas (walls, columns, benches, plaques, SIEL boards, cutouts)
  const nearStations: Array<{
    station: StationMetadata;
    line: LineMetadata;
    distM: number;
    anchor: { point: [number, number]; tangent: [number, number] };
    spine: TrackSpine;
  }> = [];

  for (const station of input.stations) {
    const stM = projectM(station.coordinates, refLat);
    const distM = Math.hypot(stM[0] - centerM[0], stM[1] - centerM[1]);
    if (distM > radiusM) continue;

    for (const line of visibleLines) {
      if (!station.lines.includes(line.id)) continue;
      const linePaths = input.tracksByLine.get(line.id);
      if (!linePaths || linePaths.length === 0) continue;

      const spine = sampleTrackSpine(station.coordinates, linePaths, refLat);
      if (spine) {
        nearStations.push({
          station,
          line,
          distM,
          anchor: { point: spine.centerFrame.point, tangent: spine.centerFrame.tangent },
          spine,
        });
      }
    }
  }

  nearStations.sort((a, b) => a.distM - b.distM);
  const chosenStations = nearStations.slice(0, maxStations);

  const renderedHubShafts = new Set<string>();
  const renderedSurfaceTotems = new Set<string>();

  for (const item of chosenStations) {
    const { station, line, anchor, spine } = item;
    const baseZ = resolveLineElevationAt(station.coordinates, line, registry) + offsetFor(line.id);
    const hubInfo = registry.stationLineLevel.get(`${station.id}::${line.id}`);
    const isStackedUpper = Boolean(hubInfo && hubInfo.bottomUpIdx > 0);
    const deckZ = baseZ - 0.14;
    const isUndergroundStation = baseZ < 0;
    const tangent = anchor.tangent;
    const normal: [number, number] = [-tangent[1], tangent[0]];
    const len = station.is_hub || station.lines.length > 1 ? 114 : 90;
    const halfLen = len / 2;
    const isViaduct = isAerialViaductLocation(line.short_name, station.coordinates);
    const [lr, lg, lb] = hexToRgb(line.color);

    // Glazed brass vertical transfer shafts ("puits de correspondance") linking stacked hub platforms
    if (hubInfo && !input.selectedLineId && !renderedHubShafts.has(hubInfo.hub.id)) {
      renderedHubShafts.add(hubInfo.hub.id);
      const { hub } = hubInfo;
      for (let level = 0; level < hub.deepToShallowLineIds.length - 1; level += 1) {
        const lowerId = hub.deepToShallowLineIds[level];
        const upperId = hub.deepToShallowLineIds[level + 1];
        const zLow = (hub.zByLineId.get(lowerId) ?? 0) + offsetFor(lowerId);
        const zHigh = (hub.zByLineId.get(upperId) ?? 0) + offsetFor(upperId);
        const span = zHigh - zLow;
        if (span < 2.0) continue;
        const shaftCenterM = projectM(hub.coordinates, refLat);
        for (const sOffset of [-6.5, 6.5]) {
          stationStructures.push({
            polygon: quadM(
              shaftCenterM,
              tangent,
              normal,
              sOffset - 1.15,
              sOffset + 1.15,
              7.8,
              10.0,
              zLow - 0.1,
              refLat
            ),
            fillColor: [201, 162, 39, 86],
            lineColor: [228, 198, 108, 210],
            elevationM: span + 0.45,
            extruded: true,
            isUnderground: zLow < 0,
          });
        }
      }
    }

    // A. Excavated Ground Cutout Trench / Viaduct Deck built strictly around the curved track spine
    const deckBays = 6;
    const deckStart = -halfLen - (isViaduct ? 4 : 6);
    const deckEnd = halfLen + (isViaduct ? 4 : 6);
    const deckStep = (deckEnd - deckStart) / deckBays;
    for (let db = 0; db < deckBays; db += 1) {
      const fA = spine.frameAt(deckStart + db * deckStep);
      const fB = spine.frameAt(deckStart + (db + 1) * deckStep);
      if (!isViaduct) {
        cutouts.push({
          polygon: makeCurvedQuad(
            fA,
            fB,
            1,
            -(WALL_OUTER_M + 0.3),
            WALL_OUTER_M + 0.3,
            baseZ - 0.62,
            refLat
          ),
          fillColor: isStackedUpper
            ? isLight
              ? [44, 48, 56, 72]
              : [16, 18, 24, 78]
            : isLight
              ? [34, 37, 44, 210]
              : [8, 10, 14, 232],
          lineColor: [lr, lg, lb, isStackedUpper ? 130 : 68],
          elevationM: 0.04,
          extruded: false,
          isUnderground: isUndergroundStation,
        });
      } else {
        viaductDecks.push({
          polygon: makeCurvedQuad(fA, fB, 1, -WALL_OUTER_M, WALL_OUTER_M, baseZ - 0.72, refLat),
          fillColor: isLight ? [146, 140, 130, 235] : [74, 70, 64, 235],
          lineColor: [lr, lg, lb, 170],
          elevationM: 0.56,
          extruded: true,
          isUnderground: false,
        });
      }
    }

    // B-D. Symmetrical 2-sided platforms architecture (±normal for both train directions)
    const wallBayLen = len / WALL_BAY_COUNT;
    const pillarOffsets = [-halfLen * 0.72, -halfLen * 0.36, 0, halfLen * 0.36, halfLen * 0.72];
    const benchOffsets = [-halfLen * 0.54, -halfLen * 0.18, halfLen * 0.18, halfLen * 0.54];
    const lampOffsets = [-halfLen * 0.65, -halfLen * 0.22, halfLen * 0.22, halfLen * 0.65];
    const adOffsets = [-halfLen * 0.62, -halfLen * 0.14, halfLen * 0.34];
    const plaqueOffsets = [-halfLen * 0.38, halfLen * 0.1];
    const isAutomatedLine =
      line.short_name === '1' || line.short_name === '4' || line.short_name === '14';

    for (const side of [1, -1] as const) {
      const sideNormal: [number, number] = [normal[0] * side, normal[1] * side];

      // CMP Paris White-Tile Back Wall (curved along track spine)
      const wallHeightM = isViaduct ? 1.65 : 3.25;
      for (let wb = 0; wb < WALL_BAY_COUNT; wb += 1) {
        const s0 = -halfLen + wb * wallBayLen;
        const s1 = s0 + wallBayLen - 0.22;
        const fA = spine.frameAt(s0);
        const fB = spine.frameAt(s1);
        const alt = (wb + (side === -1 ? 1 : 0)) % 2 === 0;
        stationStructures.push({
          polygon: makeCurvedQuad(fA, fB, side, WALL_INNER_M, WALL_OUTER_M, deckZ, refLat),
          fillColor: isViaduct
            ? alt
              ? [118, 124, 134, 230]
              : [104, 110, 120, 230]
            : alt
              ? [194, 198, 204, 245]
              : [186, 190, 196, 245],
          lineColor: [lr, lg, lb, 180],
          elevationM: wallHeightM,
          extruded: true,
          isUnderground: isUndergroundStation,
        });
      }

      // Parisian bevelled white faïence tiles (quinconce / running bond) on underground walls
      if (!isViaduct && input.zoom >= 15.8) {
        // Ceramic plinth along base of wall
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            sideNormal,
            -halfLen,
            halfLen,
            WALL_INNER_M - 0.05,
            WALL_INNER_M + 0.01,
            deckZ,
            refLat
          ),
          fillColor: [64, 72, 84, 248],
          lineColor: [42, 48, 56, 210],
          elevationM: 0.34,
          extruded: true,
          isUnderground: isUndergroundStation,
        });

        const mobileGpu = isMobileGpuDevice();
        const tileW = mobileGpu ? 4.2 : 2.1;
        const tileRows = mobileGpu ? 3 : 6;
        const rowH = mobileGpu ? 0.86 : 0.43;
        const tileH = mobileGpu ? 0.8 : 0.39;
        for (let row = 0; row < tileRows; row += 1) {
          const z0 = deckZ + 0.38 + row * rowH;
          const stagger = row % 2 === 1 ? tileW * 0.5 : 0;
          for (let tx = -halfLen + stagger; tx < halfLen - 0.4; tx += tileW) {
            const x0 = Math.max(-halfLen + 0.1, tx + 0.04);
            const x1 = Math.min(halfLen - 0.1, tx + tileW - 0.04);
            if (x1 - x0 < 0.35) continue;
            const shade = ((row + Math.floor(tx)) & 1) === 0;
            stationStructures.push({
              polygon: quadM(
                anchor.point,
                tangent,
                sideNormal,
                x0,
                x1,
                WALL_INNER_M - 0.04,
                WALL_INNER_M + 0.01,
                z0,
                refLat
              ),
              fillColor: shade ? [247, 246, 242, 252] : [239, 238, 233, 252],
              lineColor: [184, 188, 195, 220],
              elevationM: tileH,
              extruded: true,
              isUnderground: isUndergroundStation,
            });
          }
        }
      }

      // Frieze top band along back wall
      stationStructures.push({
        polygon: quadM(
          anchor.point,
          tangent,
          sideNormal,
          -halfLen,
          halfLen,
          WALL_INNER_M - 0.06,
          WALL_OUTER_M + 0.04,
          deckZ + (isViaduct ? 1.66 : 3.26),
          refLat
        ),
        fillColor: [lr, lg, lb, 240],
        lineColor: [245, 242, 236, 180],
        elevationM: 0.34,
        extruded: true,
        isUnderground: isUndergroundStation,
      });

      // Structural Columns
      for (const px of pillarOffsets) {
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            sideNormal,
            px - 0.28,
            px + 0.28,
            5.15,
            5.65,
            deckZ,
            refLat
          ),
          fillColor: isLight ? [44, 48, 56, 250] : [26, 29, 34, 250],
          lineColor: [90, 96, 108, 160],
          elevationM: isViaduct ? 2.65 : 3.05,
          extruded: true,
          isUnderground: isUndergroundStation,
        });
      }

      // Timber Benches
      for (const bx of benchOffsets) {
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            sideNormal,
            bx - 1.15,
            bx + 1.15,
            6.05,
            6.58,
            deckZ,
            refLat
          ),
          fillColor: [176, 118, 68, 248],
          lineColor: [92, 58, 30, 220],
          elevationM: 0.52,
          extruded: true,
          isUnderground: isUndergroundStation,
        });
      }

      // End-of-platform safety railings
      for (const endSign of [-1, 1]) {
        const ex = endSign * (halfLen - 0.3);
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            sideNormal,
            ex - 0.12,
            ex + 0.12,
            PLATFORM_INNER_M + 0.04,
            PLATFORM_OUTER_M + 0.18,
            deckZ,
            refLat
          ),
          fillColor: [82, 88, 98, 235],
          lineColor: [215, 220, 228, 180],
          elevationM: 1.05,
          extruded: true,
          isUnderground: isUndergroundStation,
        });
      }

      // Tactile platform safety strip along trackside edge (curved along track spine)
      for (let wb = 0; wb < WALL_BAY_COUNT; wb += 1) {
        const s0 = -halfLen + 0.5 + wb * ((len - 1) / WALL_BAY_COUNT);
        const s1 = -halfLen + 0.5 + (wb + 1) * ((len - 1) / WALL_BAY_COUNT);
        stationStructures.push({
          polygon: makeCurvedQuad(
            spine.frameAt(s0),
            spine.frameAt(s1),
            side,
            PLATFORM_INNER_M,
            PLATFORM_INNER_M + 0.28,
            deckZ + 0.02,
            refLat
          ),
          fillColor: [232, 208, 128, 235],
          lineColor: [185, 162, 86, 180],
          elevationM: 0.04,
          extruded: true,
          isUnderground: isUndergroundStation,
        });
      }

      if (input.zoom >= 15.8) {
        // Automated line platform screen doors ("portes palières" on L1, L4, L14) on both curved sides
        if (isAutomatedLine) {
          const doorBayCount = 5;
          const doorBayLen = (len - 8) / doorBayCount;
          for (let db = 0; db < doorBayCount; db += 1) {
            const dx0 = -halfLen + 4 + db * doorBayLen;
            stationStructures.push({
              polygon: makeCurvedQuad(
                spine.frameAt(dx0 + 0.35),
                spine.frameAt(dx0 + doorBayLen - 0.35),
                side,
                PLATFORM_INNER_M + 0.08,
                PLATFORM_INNER_M + 0.2,
                deckZ + 0.06,
                refLat
              ),
              fillColor: [176, 218, 238, 92],
              lineColor: [215, 226, 235, 210],
              elevationM: 1.88,
              extruded: true,
              isUnderground: isUndergroundStation,
            });
          }
        }

        // Overhead warm light strips over both platforms
        if (!isViaduct) {
          for (const lx of lampOffsets) {
            stationStructures.push({
              polygon: quadM(
                anchor.point,
                tangent,
                sideNormal,
                lx - 3.6,
                lx + 3.6,
                3.95,
                4.45,
                deckZ + 3.45,
                refLat
              ),
              fillColor: [255, 244, 214, 215],
              lineColor: [235, 224, 198, 160],
              elevationM: 0.14,
              extruded: true,
              isUnderground: isUndergroundStation,
            });
          }
        }

        // Framed 4x3 "fausses pubs" mounted flush along tiled walls on both sides
        adOffsets.forEach((ax, adIdx) => {
          const pal = FAKE_AD_PALETTES[(adIdx + station.name.length) % FAKE_AD_PALETTES.length];
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              ax - 2.05,
              ax + 2.05,
              WALL_INNER_M - 0.12,
              WALL_INNER_M + 0.02,
              deckZ + 0.72,
              refLat
            ),
            fillColor: [24, 28, 34, 250],
            lineColor: [175, 178, 184, 210],
            elevationM: 2.05,
            extruded: true,
            isUnderground: isUndergroundStation,
          });
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              ax - 1.85,
              ax + 1.85,
              WALL_INNER_M - 0.19,
              WALL_INNER_M - 0.1,
              deckZ + 0.85,
              refLat
            ),
            fillColor: pal.bg,
            lineColor: pal.accent,
            elevationM: 1.78,
            extruded: true,
            isUnderground: isUndergroundStation,
          });
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              ax - 1.82,
              ax + 1.82,
              WALL_INNER_M - 0.23,
              WALL_INNER_M - 0.17,
              deckZ + 0.85,
              refLat
            ),
            fillColor: pal.band,
            lineColor: pal.accent,
            elevationM: 0.48,
            extruded: true,
            isUnderground: isUndergroundStation,
          });
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              ax - 0.9,
              ax + 0.9,
              WALL_INNER_M - 0.23,
              WALL_INNER_M - 0.17,
              deckZ + 1.56,
              refLat
            ),
            fillColor: pal.accent,
            lineColor: pal.bg,
            elevationM: 0.62,
            extruded: true,
            isUnderground: isUndergroundStation,
          });
        });

        // Navy-blue RATP/Nord-Sud faïence cartouches with white ceramic mosaic letters on the wall
        const plaqueText = normalizePlaqueText(station.name);
        const totalCols = plaqueText
          .split('')
          .reduce(
            (acc, ch, idx) => acc + (MOSAIC_GLYPHS[ch]?.[0]?.length ?? 2) + (idx > 0 ? 1 : 0),
            0
          );
        const plaqueBaseZ = deckZ + (isViaduct ? 0.85 : 1.72);
        const plaqueH = isViaduct ? 0.85 : 1.28;
        const cellW = Math.min(0.18, Math.max(0.11, 7.6 / Math.max(1, totalCols)));
        const textSpanM = totalCols * cellW;
        const plaqueHalfW = Math.max(2.6, textSpanM * 0.5 + 0.75);
        const cellH = (plaqueH * 0.62) / 5;
        const textBaseZ = plaqueBaseZ + (plaqueH - cellH * 5) * 0.5;
        // Left-to-right direction when facing the wall from the platform
        const ltrSign = tangent[0] * sideNormal[1] - tangent[1] * sideNormal[0] >= 0 ? 1 : -1;

        for (const qx of plaqueOffsets) {
          // Outer brown/cream Nord-Sud mosaic border
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              qx - plaqueHalfW - 0.16,
              qx + plaqueHalfW + 0.16,
              WALL_INNER_M - 0.18,
              WALL_INNER_M + 0.02,
              plaqueBaseZ - 0.12,
              refLat
            ),
            fillColor: [96, 62, 36, 252],
            lineColor: [216, 203, 184, 240],
            elevationM: plaqueH + 0.24,
            extruded: true,
            isUnderground: isUndergroundStation,
          });
          // Navy-blue faïence plaque
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              qx - plaqueHalfW,
              qx + plaqueHalfW,
              WALL_INNER_M - 0.21,
              WALL_INNER_M + 0.02,
              plaqueBaseZ,
              refLat
            ),
            fillColor: [20, 51, 102, 255],
            lineColor: [244, 246, 250, 245],
            elevationM: plaqueH,
            extruded: true,
            isUnderground: isUndergroundStation,
          });

          // White ceramic mosaic letters mounted flush on the blue faïence plaque
          let colCursor = 0;
          for (let ci = 0; ci < plaqueText.length; ci += 1) {
            const glyph = MOSAIC_GLYPHS[plaqueText[ci]] ?? MOSAIC_GLYPHS[' '];
            const gw = glyph[0].length;
            for (let row = 0; row < 5; row += 1) {
              const rowStr = glyph[row];
              let runStart = -1;
              for (let col = 0; col <= gw; col += 1) {
                const on = col < gw && rowStr[col] === '1';
                if (on && runStart < 0) {
                  runStart = col;
                } else if (!on && runStart >= 0) {
                  const u0 = (colCursor + runStart) * cellW - textSpanM * 0.5;
                  const u1 = (colCursor + col) * cellW - textSpanM * 0.5;
                  const xA = qx + ltrSign * u0;
                  const xB = qx + ltrSign * u1;
                  const zBottom = textBaseZ + (4 - row) * cellH;
                  stationStructures.push({
                    polygon: quadM(
                      anchor.point,
                      tangent,
                      sideNormal,
                      Math.min(xA, xB),
                      Math.max(xA, xB),
                      WALL_INNER_M - 0.25,
                      WALL_INNER_M - 0.19,
                      zBottom,
                      refLat
                    ),
                    fillColor: [248, 250, 252, 255],
                    lineColor: [220, 228, 240, 220],
                    elevationM: cellH * 0.92,
                    extruded: true,
                    isUnderground: isUndergroundStation,
                  });
                  runStart = -1;
                }
              }
            }
            colCursor += gw + 1;
          }
        }

        // Suspended 3D SIEL departure display boards hanging transversally across both platforms
        // Light brushed metal housing + dark charcoal bottom band + 2 amber LED train windows + clock
        const sielBaseZ = deckZ + (isViaduct ? 2.18 : 2.58);
        for (const sx of [-10.5, 10.5]) {
          // Light-grey metal SIEL cabinet housing (perpendicular to track, facing approaching riders)
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              sx - 0.18,
              sx + 0.18,
              3.55,
              5.45,
              sielBaseZ + 0.12,
              refLat
            ),
            fillColor: [224, 226, 230, 252],
            lineColor: [142, 148, 156, 220],
            elevationM: 0.68,
            extruded: true,
            isUnderground: isUndergroundStation,
          });
          // Dark charcoal bottom trim band (like real SIEL panels)
          stationStructures.push({
            polygon: quadM(
              anchor.point,
              tangent,
              sideNormal,
              sx - 0.19,
              sx + 0.19,
              3.54,
              5.46,
              sielBaseZ,
              refLat
            ),
            fillColor: [28, 31, 36, 252],
            lineColor: [18, 20, 24, 240],
            elevationM: 0.12,
            extruded: true,
            isUnderground: isUndergroundStation,
          });
          // On BOTH front & back faces: line color badge (left), 1er/2e train LED windows + clock (right)
          for (const faceOff of [-0.21, 0.16]) {
            // Line-colored badge on left side of panel
            stationStructures.push({
              polygon: quadM(
                anchor.point,
                tangent,
                sideNormal,
                sx + faceOff,
                sx + faceOff + 0.05,
                3.66,
                4.02,
                sielBaseZ + 0.44,
                refLat
              ),
              fillColor: [lr, lg, lb, 255],
              lineColor: [240, 244, 248, 200],
              elevationM: 0.24,
              extruded: true,
              isUnderground: isUndergroundStation,
            });
            // Top-right digital clock LED window
            stationStructures.push({
              polygon: quadM(
                anchor.point,
                tangent,
                sideNormal,
                sx + faceOff,
                sx + faceOff + 0.05,
                4.92,
                5.34,
                sielBaseZ + 0.58,
                refLat
              ),
              fillColor: [255, 178, 28, 250],
              lineColor: [16, 18, 22, 255],
              elevationM: 0.14,
              extruded: true,
              isUnderground: isUndergroundStation,
            });
            // Two recessed black LED windows (1er train & 2e train) with amber LED glow
            for (const [wStart, wEnd] of [
              [4.42, 4.82],
              [4.92, 5.32],
            ] as const) {
              stationStructures.push({
                polygon: quadM(
                  anchor.point,
                  tangent,
                  sideNormal,
                  sx + faceOff,
                  sx + faceOff + 0.04,
                  wStart,
                  wEnd,
                  sielBaseZ + 0.22,
                  refLat
                ),
                fillColor: [12, 13, 16, 255],
                lineColor: [40, 44, 52, 255],
                elevationM: 0.24,
                extruded: true,
                isUnderground: isUndergroundStation,
              });
              stationStructures.push({
                polygon: quadM(
                  anchor.point,
                  tangent,
                  sideNormal,
                  sx + faceOff - (faceOff < 0 ? 0.01 : -0.01),
                  sx + faceOff + 0.04,
                  wStart + 0.05,
                  wEnd - 0.05,
                  sielBaseZ + 0.26,
                  refLat
                ),
                fillColor: [255, 178, 28, 250],
                lineColor: [255, 214, 110, 230],
                elevationM: 0.15,
                extruded: true,
                isUnderground: isUndergroundStation,
              });
            }
          }
          // Dual steel ceiling hanger rods
          for (const rodOff of [3.85, 5.15]) {
            stationStructures.push({
              polygon: quadM(
                anchor.point,
                tangent,
                sideNormal,
                sx - 0.04,
                sx + 0.04,
                rodOff - 0.04,
                rodOff + 0.04,
                sielBaseZ + 0.8,
                refLat
              ),
              fillColor: [72, 78, 88, 240],
              lineColor: [130, 138, 150, 180],
              elevationM: isViaduct ? 0.55 : 0.85,
              extruded: true,
              isUnderground: isUndergroundStation,
            });
          }
        }

        // One live SIEL readout anchor per platform (staggered at ±10.5m so opposite boards never overlap)
        const sielOffsetS = side === 1 ? 10.5 : -10.5;
        const sielPosM: [number, number] = [
          anchor.point[0] + tangent[0] * sielOffsetS + sideNormal[0] * 4.45,
          anchor.point[1] + tangent[1] * sielOffsetS + sideNormal[1] * 4.45,
        ];
        const [sielLng, sielLat] = unprojectM(sielPosM, refLat);
        sielAnchors.push({
          stationName: station.name,
          stationCoords: station.coordinates,
          lineId: line.id,
          lineShortName: line.short_name,
          tangent,
          sideSign: side,
          position: [sielLng, sielLat, sielBaseZ + 0.95],
          isUnderground: isUndergroundStation,
        });
      }
    }

    // Translucent Metroskop Escalator / Access Shaft rising from platform floor right up to z = 0 + surface "M" totem
    if (!isViaduct) {
      const shaftStartS = halfLen * 0.36;
      const shaftBottomZ = deckZ + 0.1;
      const shaftRise = Math.max(2.6, 0.08 - shaftBottomZ);
      stationStructures.push({
        polygon: quadM(
          anchor.point,
          tangent,
          normal,
          shaftStartS - 1.6,
          shaftStartS + 5.2,
          5.95,
          7.65,
          shaftBottomZ,
          refLat
        ),
        fillColor: [110, 195, 255, 62],
        lineColor: [155, 220, 255, 195],
        elevationM: shaftRise,
        extruded: true,
        isUnderground: true,
      });

      const stepCount = 7;
      for (let st = 0; st < stepCount; st += 1) {
        const frac = st / stepCount;
        const stepS0 = shaftStartS - 1.2 + frac * 5.8;
        const stepZ = shaftBottomZ + frac * (shaftRise - 0.35);
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            normal,
            stepS0,
            stepS0 + 0.78,
            6.15,
            7.45,
            stepZ,
            refLat
          ),
          fillColor: [148, 154, 162, 238],
          lineColor: [201, 162, 39, 175],
          elevationM: Math.max(0.45, shaftRise / stepCount + 0.12),
          extruded: true,
          isUnderground: true,
        });
      }

      if (!renderedSurfaceTotems.has(station.id)) {
        renderedSurfaceTotems.add(station.id);
        const totemX = shaftStartS + 5.5;
        const totemY = 6.8;
        // Glazed sidewalk access mouth canopy at z >= 0
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            normal,
            shaftStartS + 2.6,
            shaftStartS + 5.1,
            6.0,
            7.6,
            0.02,
            refLat
          ),
          fillColor: [110, 195, 255, 76],
          lineColor: [201, 162, 39, 215],
          elevationM: 1.15,
          extruded: true,
          isUnderground: false,
        });
        // Emerald RATP/Val d'Osne entrance base post at surface (z >= 0)
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            normal,
            totemX - 0.24,
            totemX + 0.24,
            totemY - 0.24,
            totemY + 0.24,
            0.05,
            refLat
          ),
          fillColor: [28, 76, 56, 252],
          lineColor: [201, 162, 39, 240],
          elevationM: 3.1,
          extruded: true,
          isUnderground: false,
        });
        // Brass "M" medallion crown
        stationStructures.push({
          polygon: quadM(
            anchor.point,
            tangent,
            normal,
            totemX - 0.56,
            totemX + 0.56,
            totemY - 0.56,
            totemY + 0.56,
            3.15,
            refLat
          ),
          fillColor: [201, 162, 39, 252],
          lineColor: [248, 242, 224, 245],
          elevationM: 0.58,
          extruded: true,
          isUnderground: false,
        });
      }
    }

    // Symmetrical Cutaway CMP Elliptical Vault Ribs over twin-track + 2-sided underground station
    // Extended with architectural tunnel portal ribs 36m before/after each station
    if (!isViaduct && input.zoom >= 15.8) {
      const ribOffsets = [
        -halfLen - 34,
        -halfLen - 18,
        -halfLen * 0.66,
        -halfLen * 0.33,
        0,
        halfLen * 0.33,
        halfLen * 0.66,
        halfLen + 18,
        halfLen + 34,
      ];
      for (const rx of ribOffsets) {
        const isTunnelApproach = Math.abs(rx) > halfLen;
        const halfSpanM = isTunnelApproach ? 4.35 : 7.2;
        const archPeakM = isTunnelApproach ? 1.85 : 2.35;
        const wallTopM = isTunnelApproach ? 2.45 : 3.25;
        const arcPts: [number, number, number][] = [];
        const steps = 10;
        for (let step = 0; step <= steps; step += 1) {
          const frac = step / steps;
          const nPos = halfSpanM - frac * (halfSpanM * 2);
          const archZ = deckZ + wallTopM + Math.sin(frac * Math.PI) * archPeakM;
          const worldPt = unprojectM(
            [
              anchor.point[0] + tangent[0] * rx + normal[0] * nPos,
              anchor.point[1] + tangent[1] * rx + normal[1] * nPos,
            ],
            refLat
          );
          arcPts.push([worldPt[0], worldPt[1], archZ]);
        }
        vaultRibs.push({
          path: arcPts,
          color: input.xrayMode
            ? isTunnelApproach
              ? [lr, lg, lb, 210]
              : [175, 224, 255, 235]
            : isTunnelApproach
              ? [lr, lg, lb, 155]
              : isLight
                ? [196, 192, 184, 215]
                : [228, 224, 216, 195],
          widthM: isTunnelApproach ? 0.18 : 0.22,
          isUnderground: isUndergroundStation,
        });
      }
    }
  }

  const isValidWgs84Coord = (p: [number, number, number] | [number, number]): boolean =>
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) < 85 &&
    (p.length < 3 || Number.isFinite(p[2]));

  const isValidPolygon = (poly: [number, number, number][]): boolean =>
    Array.isArray(poly) && poly.length >= 3 && poly.every(isValidWgs84Coord);

  const isValidPath = (path: [number, number, number][]): boolean =>
    Array.isArray(path) && path.length >= 2 && path.every(isValidWgs84Coord);

  const safeCutouts = cutouts.filter((d) => isValidPolygon(d.polygon));
  const safeViaductDecks = viaductDecks.filter(
    (d) => isValidPolygon(d.polygon) && Number.isFinite(d.elevationM)
  );
  const safeSleepers = sleepers.filter((d) => isValidPolygon(d.polygon));
  const safeRailPaths = railPaths.filter((d) => isValidPath(d.path));
  const safeStationStructures = stationStructures.filter(
    (d) => isValidPolygon(d.polygon) && Number.isFinite(d.elevationM)
  );
  const safeVaultRibs = vaultRibs.filter((d) => isValidPath(d.path));

  const layers: any[] = [];
  const ugBeforeId = input.undergroundBeforeId;
  const pushSplit = <T extends { isUnderground: boolean }>(
    items: T[],
    build: (suffix: string, subset: T[], beforeId?: string) => any
  ) => {
    if (items.length === 0) return;
    if (!ugBeforeId) {
      layers.push(build('', items));
      return;
    }
    const underground = items.filter((item) => item.isUnderground);
    const surface = items.filter((item) => !item.isUnderground);
    if (underground.length > 0) {
      layers.push(build('-ug', underground, ugBeforeId));
    }
    if (surface.length > 0) {
      layers.push(build('', surface));
    }
  };

  pushSplit(
    safeCutouts,
    (suffix, data, beforeId) =>
      new PolygonLayer<CutawayPolygonDatum>({
        id: `station-lod-cutouts${suffix}`,
        data,
        ...(beforeId ? { beforeId } : {}),
        pickable: false,
        extruded: false,
        filled: true,
        stroked: true,
        lineWidthUnits: 'meters',
        getLineWidth: 0.35,
        getPolygon: (d: CutawayPolygonDatum) => d.polygon,
        getFillColor: (d: CutawayPolygonDatum) => d.fillColor,
        getLineColor: (d: CutawayPolygonDatum) => d.lineColor,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      } as any)
  );

  if (safeViaductDecks.length > 0) {
    layers.push(
      new PolygonLayer<CutawayPolygonDatum>({
        id: 'station-lod-viaducts',
        data: safeViaductDecks,
        pickable: false,
        extruded: true,
        filled: true,
        stroked: true,
        lineWidthUnits: 'meters',
        getLineWidth: 0.2,
        getPolygon: (d) => d.polygon,
        getElevation: (d) => d.elevationM,
        getFillColor: (d) => d.fillColor,
        getLineColor: (d) => d.lineColor,
        parameters: { depthTest: true, depthWriteEnabled: true } as any,
      })
    );
  }

  pushSplit(
    safeSleepers,
    (suffix, data, beforeId) =>
      new SolidPolygonLayer<SleeperDatum>({
        id: `station-lod-sleepers${suffix}`,
        data,
        ...(beforeId ? { beforeId } : {}),
        pickable: false,
        extruded: false,
        getPolygon: (d: SleeperDatum) => d.polygon,
        getFillColor: (d: SleeperDatum) => d.color,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      } as any)
  );

  pushSplit(
    safeRailPaths,
    (suffix, data, beforeId) =>
      new PathLayer<RailPathDatum>({
        id: `station-lod-rails${suffix}`,
        data,
        ...(beforeId ? { beforeId } : {}),
        pickable: false,
        widthUnits: 'meters',
        getWidth: (d: RailPathDatum) => d.widthM,
        getPath: (d: RailPathDatum) => d.path,
        getColor: (d: RailPathDatum) => d.color,
        capRounded: true,
        jointRounded: true,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      } as any)
  );

  pushSplit(
    safeStationStructures,
    (suffix, data, beforeId) =>
      new PolygonLayer<CutawayPolygonDatum>({
        id: `station-lod-architecture${suffix}`,
        data,
        ...(beforeId ? { beforeId } : {}),
        pickable: false,
        extruded: true,
        filled: true,
        stroked: true,
        lineWidthUnits: 'meters',
        getLineWidth: 0.08,
        getPolygon: (d: CutawayPolygonDatum) => d.polygon,
        getElevation: (d: CutawayPolygonDatum) => d.elevationM,
        getFillColor: (d: CutawayPolygonDatum) => d.fillColor,
        getLineColor: (d: CutawayPolygonDatum) => d.lineColor,
        material: {
          ambient: 0.72,
          diffuse: 0.55,
          shininess: 14,
          specularColor: [110, 108, 104],
        },
        parameters: { depthTest: true, depthWriteEnabled: true } as any,
      } as any)
  );

  pushSplit(
    safeVaultRibs,
    (suffix, data, beforeId) =>
      new PathLayer<RailPathDatum>({
        id: `station-lod-vault-ribs${suffix}`,
        data,
        ...(beforeId ? { beforeId } : {}),
        pickable: false,
        widthUnits: 'meters',
        getWidth: (d: RailPathDatum) => d.widthM,
        getPath: (d: RailPathDatum) => d.path,
        getColor: (d: RailPathDatum) => d.color,
        capRounded: true,
        jointRounded: true,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      } as any)
  );

  return { layers, sielAnchors };
}

export interface LiveSielTrainSample {
  line: string;
  pos: [number, number];
  brg: number;
  next: string;
  atStop?: boolean;
}

function formatPlatformSielText(anchor: SielBoardAnchor, trains: LiveSielTrainSample[]): string {
  const cosLat = Math.max(0.1, Math.cos((anchor.stationCoords[1] * Math.PI) / 180));
  const waitMins: number[] = [];
  let atPlatform = false;

  for (const tr of trains) {
    if (tr.line !== anchor.lineId) continue;
    const dx = (anchor.stationCoords[0] - tr.pos[0]) * 111_320 * cosLat;
    const dy = (anchor.stationCoords[1] - tr.pos[1]) * 111_320;
    const distM = Math.hypot(dx, dy);

    // Match platform side via train heading vs platform tangent
    const rad = (tr.brg * Math.PI) / 180;
    const hx = Math.sin(rad);
    const hy = Math.cos(rad);
    const headingAlongTangent = hx * anchor.tangent[0] + hy * anchor.tangent[1];
    if (anchor.sideSign === 1 ? headingAlongTangent < -0.15 : headingAlongTangent > 0.15) {
      continue;
    }

    if (distM < 75 && (tr.atStop || tr.next === anchor.stationName)) {
      atPlatform = true;
      continue;
    }
    if (distM > 9000) continue;

    // Only count trains approaching this station (dot product toward station > 0)
    const approachDot = dx * hx + dy * hy;
    if (approachDot <= 0) continue;

    // ~450 m/min (~27 km/h commercial metro speed including dwell time)
    const min = Math.max(1, Math.round(distM / 450));
    waitMins.push(min);
  }

  waitMins.sort((a, b) => a - b);
  const firstTwo = waitMins.slice(0, 2);
  if (atPlatform) {
    const next = firstTwo[0] != null ? ` · ${String(firstTwo[0]).padStart(2, '0')} MIN` : '';
    return `${anchor.lineShortName} · À QUAI${next}`;
  }
  if (firstTwo.length >= 2) {
    return `${anchor.lineShortName} · ${String(firstTwo[0]).padStart(2, '0')}  ${String(firstTwo[1]).padStart(2, '0')} MIN`;
  }
  if (firstTwo.length === 1) {
    return `${anchor.lineShortName} · ${String(firstTwo[0]).padStart(2, '0')} MIN`;
  }
  return `${anchor.lineShortName} · -- MIN`;
}

/**
 * Lightweight live TextLayer for suspended 3D SIEL boards, always upright (billboard: true)
 * and dynamically updated from live train positions.
 */
export function createStationSielTextLayers(
  anchors: SielBoardAnchor[],
  trains: LiveSielTrainSample[],
  undergroundBeforeId?: string,
  xrayMode?: boolean
): any[] {
  if (anchors.length === 0) return [];
  const data = anchors.map((a) => ({
    position: a.position,
    text: formatPlatformSielText(a, trains),
    isUnderground: a.isUnderground,
  }));

  const split = (isUnderground: boolean) => {
    const sub = data.filter((d) => d.isUnderground === isUnderground);
    if (sub.length === 0) return null;
    const beforeId = isUnderground && !xrayMode ? undergroundBeforeId : undefined;
    return new TextLayer<{ position: [number, number, number]; text: string }>({
      id: `station-lod-siel-live${isUnderground ? '-ug' : '-ag'}`,
      data: sub,
      ...(beforeId ? { beforeId } : {}),
      pickable: false,
      billboard: true,
      sizeUnits: 'pixels',
      sizeMinPixels: 11,
      sizeMaxPixels: 11,
      fontFamily: '"Asap Variable", "Asap", ui-monospace, SFMono-Regular, monospace',
      fontWeight: 700,
      getPosition: (d: { position: [number, number, number]; text: string }) => d.position,
      getText: (d: { position: [number, number, number]; text: string }) => d.text,
      getSize: 11,
      getColor: [255, 178, 46, 255],
      background: true,
      getBackgroundColor: [10, 11, 13, 245],
      backgroundPadding: [6, 3],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      parameters: { depthTest: true, depthWriteEnabled: false } as any,
    } as any);
  };

  return [split(true), split(false)].filter(Boolean);
}
