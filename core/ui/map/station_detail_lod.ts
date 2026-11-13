import { IconLayer, PathLayer, PolygonLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { LineMetadata, StationMetadata } from '@core/types';
import { isMobileGpuDevice } from './device_perf';
import { closestPointOnPath } from './platforms_layer';

export interface LocalStationDetailInput {
  lines: LineMetadata[];
  stations: StationMetadata[];
  tracksByLine: Map<string, [number, number][][]>;
  selectedLineId: string | null;
  zoom: number;
  mapCenter: [number, number];
  theme: 'dark' | 'light';
  followElevation?: { lineId: string | null; offset: number };
}

interface CutawayPolygonDatum {
  polygon: [number, number, number][];
  fillColor: [number, number, number, number];
  lineColor: [number, number, number, number];
  elevationM: number;
  extruded: boolean;
}

interface SleeperDatum {
  polygon: [number, number, number][];
  color: [number, number, number, number];
}

interface RailPathDatum {
  path: [number, number, number][];
  color: [number, number, number, number];
  widthM: number;
}

interface SignSpriteDatum {
  position: [number, number, number];
  url: string;
  key: string;
  width: number;
  height: number;
  sizePx: number;
}

export const STATION_DETAIL_ZOOM_MIN = 14.5;
const LAT_SCALE = 111_320;
const RAIL_HALF_GAUGE_M = 0.72; // 1.44m standard track gauge
const THIRD_RAIL_OFFSET_M = -1.08;
const SLEEPER_HALF_LEN_M = 1.08;
const SLEEPER_HALF_WIDTH_M = 0.12;
const WALL_BAY_COUNT = 6;

const signSpriteCache = new Map<string, string>();
const MAX_SIGN_CACHE = 48;

function projectM(point: [number, number], refLat: number): [number, number] {
  const lonScale = LAT_SCALE * Math.cos((refLat * Math.PI) / 180);
  return [point[0] * lonScale, point[1] * LAT_SCALE];
}

function unprojectM(point: [number, number], refLat: number): [number, number] {
  const lonScale = LAT_SCALE * Math.cos((refLat * Math.PI) / 180);
  return [point[0] / lonScale, point[1] / LAT_SCALE];
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

/**
 * Identify Paris elevated viaduct sections on Lines 2 & 6 so they stay above-ground
 * with bridge piers while underground corridors use excavated X-ray cutaway trenches.
 */
export function isAerialViaductLocation(lineShortName: string, coord: [number, number]): boolean {
  const name = lineShortName.trim().toUpperCase();
  const [lng, lat] = coord;
  if (name === '2') {
    // Barbès-Rochechouart -> La Chapelle -> Stalingrad -> Jaurès -> Colonel Fabien
    return lng >= 2.341 && lng <= 2.376 && lat >= 48.875 && lat <= 48.889;
  }
  if (name === '6') {
    // Passy / Bir-Hakeim / Dupleix / La Motte-Picquet / Cambronne viaduct
    const westViaduct = lng >= 2.282 && lng <= 2.309 && lat >= 48.844 && lat <= 48.862;
    // Corvisart / Nationale / Chevaleret / Quai de la Gare / Bercy viaduct
    const eastViaduct = lng >= 2.346 && lng <= 2.383 && lat >= 48.828 && lat <= 48.843;
    return westViaduct || eastViaduct;
  }
  return false;
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

function getOrCreateStationPlaqueSprite(
  line: LineMetadata,
  stationName: string
): { key: string; url: string } | null {
  if (typeof document === 'undefined') return null;
  const key = `plaque:${line.short_name}:${stationName}`;
  const cached = signSpriteCache.get(key);
  if (cached) return { key, url: cached };

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Classic Parisian dark-blue enameled station plaque (#183b75) with crisp white rule
  ctx.fillStyle = '#143366';
  ctx.beginPath();
  ctx.roundRect(2, 2, 252, 52, 10);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(6, 6, 244, 44, 7);
  ctx.stroke();

  // Line badge circle
  ctx.fillStyle = line.color || '#FFCD00';
  ctx.beginPath();
  ctx.arc(30, 28, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = line.text_color || '#FFFFFF';
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line.short_name, 30, 29);

  // Truncate long station names cleanly
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  let label = stationName;
  while (label.length > 4 && ctx.measureText(label).width > 186) {
    label = `${label.slice(0, -2)}…`;
  }
  ctx.fillText(label, 52, 29);

  const dataUrl = canvas.toDataURL('image/png');
  if (signSpriteCache.size >= MAX_SIGN_CACHE) {
    const firstKey = signSpriteCache.keys().next().value;
    if (firstKey) signSpriteCache.delete(firstKey);
  }
  signSpriteCache.set(key, dataUrl);
  return { key, url: dataUrl };
}

function getOrCreateSielSprite(stationId: string): { key: string; url: string } | null {
  if (typeof document === 'undefined') return null;
  // Deterministic realistic countdown minute pairs (1-4 min) per station hash
  let h = 0;
  for (let i = 0; i < stationId.length; i += 1) {
    h = (h * 31 + stationId.charCodeAt(i)) | 0;
  }
  const m1 = 1 + (Math.abs(h) % 3);
  const m2 = m1 + 2 + (Math.abs(h >> 3) % 3);
  const key = `siel:${m1}:${m2}`;
  const cached = signSpriteCache.get(key);
  if (cached) return { key, url: cached };

  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 44;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#121418';
  ctx.beginPath();
  ctx.roundRect(2, 2, 140, 40, 7);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#9aa1ad';
  ctx.font = '600 10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PROCHAIN', 11, 16);

  ctx.fillStyle = '#ff9f2e';
  ctx.font = '700 16px ui-monospace, SFMono-Regular, monospace';
  ctx.fillText(`${m1} mn   ${m2} mn`, 11, 33);

  const dataUrl = canvas.toDataURL('image/png');
  if (signSpriteCache.size >= MAX_SIGN_CACHE) {
    const firstKey = signSpriteCache.keys().next().value;
    if (firstKey) signSpriteCache.delete(firstKey);
  }
  signSpriteCache.set(key, dataUrl);
  return { key, url: dataUrl };
}

export function shouldEnableUndergroundXray(
  zoom: number,
  center: [number, number],
  selectedLineShortName?: string | null
): boolean {
  if (zoom < 15.0) return false;
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

export function createLocalStationDetailLayers(input: LocalStationDetailInput): any[] {
  if (input.zoom < STATION_DETAIL_ZOOM_MIN) return [];

  const isMobile = isMobileGpuDevice();
  const radiusM = isMobile ? 350 : 480;
  const maxStations = isMobile ? 4 : 6;
  const sleeperStepM = isMobile ? 1.2 : 0.92;
  const maxSleepers = isMobile ? 340 : 540;
  const refLat = input.mapCenter[1];
  const centerM = projectM(input.mapCenter, refLat);
  const isLight = input.theme === 'light';

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
  const sprites: SignSpriteDatum[] = [];

  // 1. Local track sleepers, twin running rails, third rail, and cutaway/viaduct decks
  let sleeperCount = 0;
  let viaductPierAccum = 0;

  for (const line of visibleLines) {
    if (line.mode !== 'metro' && line.mode !== 'tube' && line.mode !== 'rail') continue;
    const linePaths = input.tracksByLine.get(line.id);
    if (!linePaths || linePaths.length === 0) continue;
    const baseZ = line.elevation_offset + offsetFor(line.id);
    const isMetro = line.mode === 'metro' || line.mode === 'tube';
    const [lr, lg, lb] = hexToRgb(line.color);

    for (const path of linePaths) {
      if (path.length < 2) continue;

      let leftRail: [number, number, number][] = [];
      let rightRail: [number, number, number][] = [];
      let thirdRail: [number, number, number][] = [];
      let bedPath: [number, number, number][] = [];

      const flushRails = () => {
        if (bedPath.length >= 2) {
          railPaths.push({
            path: bedPath,
            color: isLight ? [88, 84, 78, 225] : [20, 22, 28, 235],
            widthM: 2.9,
          });
        }
        if (leftRail.length >= 2) {
          railPaths.push({
            path: leftRail,
            color: isLight ? [122, 128, 138, 255] : [206, 212, 222, 245],
            widthM: 0.12,
          });
        }
        if (rightRail.length >= 2) {
          railPaths.push({
            path: rightRail,
            color: isLight ? [122, 128, 138, 255] : [206, 212, 222, 245],
            widthM: 0.12,
          });
        }
        if (isMetro && thirdRail.length >= 2) {
          railPaths.push({
            path: thirdRail,
            color: [176, 128, 74, 230],
            widthM: 0.08,
          });
        }
        leftRail = [];
        rightRail = [];
        thirdRail = [];
        bedPath = [];
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

        if (bedPath.length === 0) {
          bedPath.push([p0[0], p0[1], baseZ - 0.15]);
          const l0 = unprojectM(
            [aM[0] + nx * RAIL_HALF_GAUGE_M, aM[1] + ny * RAIL_HALF_GAUGE_M],
            refLat
          );
          const r0 = unprojectM(
            [aM[0] - nx * RAIL_HALF_GAUGE_M, aM[1] - ny * RAIL_HALF_GAUGE_M],
            refLat
          );
          leftRail.push([l0[0], l0[1], baseZ - 0.02]);
          rightRail.push([r0[0], r0[1], baseZ - 0.02]);
          if (isMetro) {
            const t0 = unprojectM(
              [aM[0] + nx * THIRD_RAIL_OFFSET_M, aM[1] + ny * THIRD_RAIL_OFFSET_M],
              refLat
            );
            thirdRail.push([t0[0], t0[1], baseZ + 0.03]);
          }
        }

        bedPath.push([p1[0], p1[1], baseZ - 0.15]);
        const l1 = unprojectM(
          [bM[0] + nx * RAIL_HALF_GAUGE_M, bM[1] + ny * RAIL_HALF_GAUGE_M],
          refLat
        );
        const r1 = unprojectM(
          [bM[0] - nx * RAIL_HALF_GAUGE_M, bM[1] - ny * RAIL_HALF_GAUGE_M],
          refLat
        );
        leftRail.push([l1[0], l1[1], baseZ - 0.02]);
        rightRail.push([r1[0], r1[1], baseZ - 0.02]);
        if (isMetro) {
          const t1 = unprojectM(
            [bM[0] + nx * THIRD_RAIL_OFFSET_M, bM[1] + ny * THIRD_RAIL_OFFSET_M],
            refLat
          );
          thirdRail.push([t1[0], t1[1], baseZ + 0.03]);
        }

        // Elevated viaduct stone/concrete bridge piers (Lines 2 & 6)
        if (isViaduct && baseZ > 1.2) {
          viaductPierAccum += segLen;
          if (viaductPierAccum >= 26) {
            viaductPierAccum = 0;
            viaductDecks.push({
              polygon: quadM(midM, [tx, ty], [nx, ny], -0.8, 0.8, -1.35, 1.35, 0, refLat),
              fillColor: isLight ? [138, 132, 124, 240] : [82, 78, 72, 240],
              lineColor: [lr, lg, lb, 150],
              elevationM: Math.max(0.5, baseZ - 0.18),
              extruded: true,
            });
          }
        }

        // Sleepers along local visible track
        if (sleeperCount < maxSleepers && distCenter <= radiusM * 0.88) {
          const steps = Math.max(1, Math.floor(segLen / sleeperStepM));
          for (let k = 0; k < steps && sleeperCount < maxSleepers; k += 1) {
            const frac = (k + 0.5) / steps;
            const sm: [number, number] = [
              aM[0] + (bM[0] - aM[0]) * frac,
              aM[1] + (bM[1] - aM[1]) * frac,
            ];
            if (Math.hypot(sm[0] - centerM[0], sm[1] - centerM[1]) > radiusM * 0.85) continue;
            const sleeperAlt = sleeperCount % 2 === 0;
            sleepers.push({
              polygon: quadM(
                sm,
                [tx, ty],
                [nx, ny],
                -SLEEPER_HALF_WIDTH_M,
                SLEEPER_HALF_WIDTH_M,
                -SLEEPER_HALF_LEN_M,
                SLEEPER_HALF_LEN_M,
                baseZ - 0.11,
                refLat
              ),
              color: sleeperAlt
                ? isLight
                  ? [102, 92, 80, 245]
                  : [64, 58, 52, 245]
                : isLight
                  ? [88, 78, 68, 245]
                  : [54, 48, 43, 245],
            });
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
  }> = [];

  for (const station of input.stations) {
    const stM = projectM(station.coordinates, refLat);
    const distM = Math.hypot(stM[0] - centerM[0], stM[1] - centerM[1]);
    if (distM > radiusM) continue;

    for (const line of visibleLines) {
      if (!station.lines.includes(line.id)) continue;
      const linePaths = input.tracksByLine.get(line.id);
      if (!linePaths || linePaths.length === 0) continue;

      let bestAnchor: {
        point: [number, number];
        tangent: [number, number];
        distanceM: number;
      } | null = null;
      for (const path of linePaths) {
        const c = closestPointOnPath(station.coordinates, path);
        if (c && (!bestAnchor || c.distanceM < bestAnchor.distanceM)) {
          bestAnchor = c;
        }
      }
      if (bestAnchor) {
        nearStations.push({
          station,
          line,
          distM,
          anchor: { point: bestAnchor.point, tangent: bestAnchor.tangent },
        });
      }
    }
  }

  nearStations.sort((a, b) => a.distM - b.distM);
  const chosenStations = nearStations.slice(0, maxStations);

  for (const item of chosenStations) {
    const { station, line, anchor } = item;
    const baseZ = line.elevation_offset + offsetFor(line.id);
    const deckZ = baseZ - 0.14;
    const tangent = anchor.tangent;
    const normal: [number, number] = [-tangent[1], tangent[0]];
    const len = station.is_hub || station.lines.length > 1 ? 114 : 90;
    const halfLen = len / 2;
    const isViaduct = isAerialViaductLocation(line.short_name, station.coordinates);
    const [lr, lg, lb] = hexToRgb(line.color);

    // A. Excavated Ground Cutout Trench for Underground Stations OR Concrete Viaduct Deck
    if (!isViaduct) {
      cutouts.push({
        polygon: quadM(
          anchor.point,
          tangent,
          normal,
          -halfLen - 6,
          halfLen + 6,
          -2.4,
          6.45,
          baseZ - 0.62,
          refLat
        ),
        fillColor: isLight ? [34, 37, 44, 210] : [8, 10, 14, 232],
        lineColor: [lr, lg, lb, 130],
        elevationM: 0.04,
        extruded: false,
      });
    } else {
      viaductDecks.push({
        polygon: quadM(
          anchor.point,
          tangent,
          normal,
          -halfLen - 4,
          halfLen + 4,
          -1.85,
          5.85,
          baseZ - 0.72,
          refLat
        ),
        fillColor: isLight ? [146, 140, 130, 235] : [74, 70, 64, 235],
        lineColor: [lr, lg, lb, 170],
        elevationM: 0.56,
        extruded: true,
      });
    }

    // B. CMP Paris White-Tile Back Wall along +5.45m .. +5.90m (strictly clear of rails!)
    const wallBayLen = len / WALL_BAY_COUNT;
    for (let wb = 0; wb < WALL_BAY_COUNT; wb += 1) {
      const s0 = -halfLen + wb * wallBayLen;
      const s1 = s0 + wallBayLen - 0.22;
      const alt = wb % 2 === 0;
      stationStructures.push({
        polygon: quadM(anchor.point, tangent, normal, s0, s1, 5.46, 5.9, deckZ, refLat),
        fillColor: isViaduct
          ? alt
            ? [118, 124, 134, 230]
            : [104, 110, 120, 230]
          : alt
            ? [234, 230, 222, 245]
            : [219, 214, 206, 245],
        lineColor: [lr, lg, lb, 180],
        elevationM: isViaduct ? 1.65 : 3.25,
        extruded: true,
      });
    }

    // Frieze top band along back wall
    stationStructures.push({
      polygon: quadM(
        anchor.point,
        tangent,
        normal,
        -halfLen,
        halfLen,
        5.4,
        5.94,
        deckZ + (isViaduct ? 1.66 : 3.26),
        refLat
      ),
      fillColor: [lr, lg, lb, 240],
      lineColor: [245, 242, 236, 180],
      elevationM: 0.34,
      extruded: true,
    });

    // C. Structural Columns + Timber Benches along platform interior (+3.8m .. +4.9m)
    const pillarOffsets = [-halfLen * 0.72, -halfLen * 0.36, 0, halfLen * 0.36, halfLen * 0.72];
    for (const px of pillarOffsets) {
      stationStructures.push({
        polygon: quadM(
          anchor.point,
          tangent,
          normal,
          px - 0.28,
          px + 0.28,
          3.62,
          4.18,
          deckZ,
          refLat
        ),
        fillColor: isLight ? [44, 48, 56, 250] : [26, 29, 34, 250],
        lineColor: [90, 96, 108, 160],
        elevationM: isViaduct ? 2.65 : 3.05,
        extruded: true,
      });
    }

    const benchOffsets = [-halfLen * 0.54, -halfLen * 0.18, halfLen * 0.18, halfLen * 0.54];
    for (const bx of benchOffsets) {
      stationStructures.push({
        polygon: quadM(
          anchor.point,
          tangent,
          normal,
          bx - 1.15,
          bx + 1.15,
          4.55,
          5.08,
          deckZ,
          refLat
        ),
        fillColor: [176, 118, 68, 248],
        lineColor: [92, 58, 30, 220],
        elevationM: 0.52,
        extruded: true,
      });
    }

    // End-of-platform safety railings
    for (const endSign of [-1, 1]) {
      const ex = endSign * (halfLen - 0.3);
      stationStructures.push({
        polygon: quadM(
          anchor.point,
          tangent,
          normal,
          ex - 0.12,
          ex + 0.12,
          1.72,
          5.35,
          deckZ,
          refLat
        ),
        fillColor: [82, 88, 98, 235],
        lineColor: [215, 220, 228, 180],
        elevationM: 1.05,
        extruded: true,
      });
    }

    // Translucent Metroskop-style Escalator / Access Shaft Ring at platform entrance corner
    if (!isViaduct) {
      stationStructures.push({
        polygon: quadM(
          anchor.point,
          tangent,
          normal,
          halfLen * 0.42 - 1.7,
          halfLen * 0.42 + 1.7,
          4.25,
          6.15,
          deckZ + 0.1,
          refLat
        ),
        fillColor: [110, 195, 255, 68],
        lineColor: [155, 220, 255, 190],
        elevationM: 4.8,
        extruded: true,
      });
    }

    // D. Floating Enameled Paris Station Plaque + Digital SIEL Countdown Sprite
    const plaqueSprite = getOrCreateStationPlaqueSprite(line, station.name);
    if (plaqueSprite) {
      const plaquePosM: [number, number] = [
        anchor.point[0] + normal[0] * 3.85,
        anchor.point[1] + normal[1] * 3.85,
      ];
      const [lng, lat] = unprojectM(plaquePosM, refLat);
      sprites.push({
        position: [lng, lat, baseZ + 2.95],
        url: plaqueSprite.url,
        key: plaqueSprite.key,
        width: 256,
        height: 56,
        sizePx: input.zoom >= 16.5 ? 56 : 42,
      });
    }

    const sielSprite = getOrCreateSielSprite(station.id);
    if (sielSprite && input.zoom >= 15.2) {
      const sielPosM: [number, number] = [
        anchor.point[0] + tangent[0] * (halfLen * 0.28) + normal[0] * 3.15,
        anchor.point[1] + tangent[1] * (halfLen * 0.28) + normal[1] * 3.15,
      ];
      const [lng, lat] = unprojectM(sielPosM, refLat);
      sprites.push({
        position: [lng, lat, baseZ + 2.45],
        url: sielSprite.url,
        key: sielSprite.key,
        width: 144,
        height: 44,
        sizePx: input.zoom >= 16.5 ? 40 : 32,
      });
    }
  }

  const layers: any[] = [];

  if (cutouts.length > 0) {
    layers.push(
      new PolygonLayer<CutawayPolygonDatum>({
        id: 'station-lod-cutouts',
        data: cutouts,
        pickable: false,
        extruded: false,
        filled: true,
        stroked: true,
        lineWidthUnits: 'meters',
        getLineWidth: 0.35,
        getPolygon: (d) => d.polygon,
        getFillColor: (d) => d.fillColor,
        getLineColor: (d) => d.lineColor,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      })
    );
  }

  if (viaductDecks.length > 0) {
    layers.push(
      new PolygonLayer<CutawayPolygonDatum>({
        id: 'station-lod-viaducts',
        data: viaductDecks,
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

  if (sleepers.length > 0) {
    layers.push(
      new SolidPolygonLayer<SleeperDatum>({
        id: 'station-lod-sleepers',
        data: sleepers,
        pickable: false,
        extruded: false,
        getPolygon: (d) => d.polygon,
        getFillColor: (d) => d.color,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      })
    );
  }

  if (railPaths.length > 0) {
    layers.push(
      new PathLayer<RailPathDatum>({
        id: 'station-lod-rails',
        data: railPaths,
        pickable: false,
        widthUnits: 'meters',
        getWidth: (d) => d.widthM,
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        capRounded: true,
        jointRounded: true,
        parameters: { depthTest: true, depthWriteEnabled: false } as any,
      })
    );
  }

  if (stationStructures.length > 0) {
    layers.push(
      new PolygonLayer<CutawayPolygonDatum>({
        id: 'station-lod-architecture',
        data: stationStructures,
        pickable: false,
        extruded: true,
        filled: true,
        stroked: true,
        lineWidthUnits: 'meters',
        getLineWidth: 0.08,
        getPolygon: (d) => d.polygon,
        getElevation: (d) => d.elevationM,
        getFillColor: (d) => d.fillColor,
        getLineColor: (d) => d.lineColor,
        material: {
          ambient: 0.72,
          diffuse: 0.55,
          shininess: 14,
          specularColor: [110, 108, 104],
        },
        parameters: { depthTest: true, depthWriteEnabled: true } as any,
      })
    );
  }

  if (sprites.length > 0) {
    layers.push(
      new IconLayer<SignSpriteDatum>({
        id: 'station-lod-plaques',
        data: sprites,
        pickable: false,
        billboard: true,
        sizeUnits: 'pixels',
        getPosition: (d) => d.position,
        getIcon: (d) => ({
          url: d.url,
          id: d.key,
          width: d.width,
          height: d.height,
          mask: false,
        }),
        getSize: (d) => d.sizePx,
        parameters: { depthTest: false, depthWriteEnabled: false } as any,
      })
    );
  }

  return layers;
}
