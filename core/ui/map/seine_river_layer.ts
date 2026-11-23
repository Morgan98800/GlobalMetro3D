import { PathLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { GLTFLoader } from '@loaders.gl/gltf';
import { compassBearingToDeckYaw } from './train_model_geometry';

export const BATEAU_MOUCHE_MODEL_URL = '/models/landmarks/bateau_mouche.glb';

/**
 * Geodesic centerline of the Seine through central Paris (Grand Bras),
 * from Pont de Bercy / Viaduc d'Austerlitz past Notre-Dame, Louvre,
 * Pont Alexandre III, Tour Eiffel & Pont de Bir-Hakeim to Pont de Grenelle.
 */
export const SEINE_CENTERLINE: readonly [number, number][] = [
  [2.3712, 48.8404], // Quai d'Austerlitz / Bercy
  [2.3662, 48.8439], // Viaduc d'Austerlitz (L5)
  [2.3638, 48.8458], // Pont d'Austerlitz
  [2.3596, 48.8492], // Pont de Sully
  [2.3550, 48.8529], // Pont Marie
  [2.3506, 48.8548], // Pont d'Arcole
  [2.3468, 48.8562], // Pont au Change
  [2.3418, 48.8576], // Pont Neuf (Grand Bras)
  [2.3374, 48.8584], // Pont des Arts
  [2.3332, 48.8594], // Pont du Carrousel
  [2.3296, 48.8602], // Pont Royal
  [2.3245, 48.8615], // Solférino
  [2.3195, 48.8628], // Concorde
  [2.3135, 48.8639], // Pont Alexandre III
  [2.3095, 48.8638], // Pont des Invalides
  [2.3016, 48.8631], // Pont de l'Alma
  [2.2968, 48.8618], // Passerelle Debilly
  [2.2921, 48.8597], // Pont d'Iéna (Tour Eiffel)
  [2.2874, 48.8559], // Pont de Bir-Hakeim (L6)
  [2.2804, 48.8504], // Pont de Grenelle
];

interface CumulativeSegment {
  cumM: number[];
  totalM: number;
}

const LAT_SCALE = 111_320;

function buildCumulative(coords: readonly [number, number][]): CumulativeSegment {
  const cumM: number[] = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const cosLat = Math.cos(((a[1] + b[1]) * 0.5 * Math.PI) / 180);
    const dx = (b[0] - a[0]) * LAT_SCALE * cosLat;
    const dy = (b[1] - a[1]) * LAT_SCALE;
    total += Math.hypot(dx, dy);
    cumM.push(total);
  }
  return { cumM, totalM: total };
}

const SEINE_METRICS = buildCumulative(SEINE_CENTERLINE);

export interface SeineBoatPose {
  id: string;
  position: [number, number, number];
  orientation: [number, number, number];
  wakePath: [number, number, number][];
}

interface BoatSpec {
  id: string;
  phaseFrac: number;
  dir: 1 | -1;
  speedMps: number;
  laneOffsetM: number;
}

// 8 Parisian Bateaux-Mouches / Batobus gliding smoothly in both directions
const SEINE_FLEET: readonly BoatSpec[] = [
  { id: 'bm-1', phaseFrac: 0.06, dir: 1, speedMps: 3.8, laneOffsetM: 10 },
  { id: 'bm-2', phaseFrac: 0.31, dir: 1, speedMps: 3.5, laneOffsetM: 11 },
  { id: 'bm-3', phaseFrac: 0.58, dir: 1, speedMps: 4.1, laneOffsetM: 9 },
  { id: 'bm-4', phaseFrac: 0.84, dir: 1, speedMps: 3.6, laneOffsetM: 10 },
  { id: 'bm-5', phaseFrac: 0.14, dir: -1, speedMps: 3.4, laneOffsetM: -10 },
  { id: 'bm-6', phaseFrac: 0.42, dir: -1, speedMps: 3.9, laneOffsetM: -11 },
  { id: 'bm-7', phaseFrac: 0.69, dir: -1, speedMps: 3.5, laneOffsetM: -9 },
  { id: 'bm-8', phaseFrac: 0.92, dir: -1, speedMps: 3.7, laneOffsetM: -10 },
];

export function sampleSeineAtDistance(
  distM: number,
  dir: 1 | -1,
  laneOffsetM: number
): { lng: number; lat: number; bearingDeg: number } {
  const clamped = Math.max(0, Math.min(SEINE_METRICS.totalM, distM));
  const { cumM } = SEINE_METRICS;
  let segIdx = 0;
  for (let i = 1; i < cumM.length; i += 1) {
    if (cumM[i] >= clamped) {
      segIdx = i - 1;
      break;
    }
    segIdx = cumM.length - 2;
  }
  const a = SEINE_CENTERLINE[segIdx];
  const b = SEINE_CENTERLINE[segIdx + 1];
  const segLen = Math.max(1e-3, cumM[segIdx + 1] - cumM[segIdx]);
  const t = Math.max(0, Math.min(1, (clamped - cumM[segIdx]) / segLen));

  const baseLng = a[0] + (b[0] - a[0]) * t;
  const baseLat = a[1] + (b[1] - a[1]) * t;
  const cosLat = Math.cos((baseLat * Math.PI) / 180);
  const dx = (b[0] - a[0]) * LAT_SCALE * cosLat;
  const dy = (b[1] - a[1]) * LAT_SCALE;
  const len = Math.max(1e-3, Math.hypot(dx, dy));
  // Unit forward vector along centerline
  const fx = (dx / len) * dir;
  const fy = (dy / len) * dir;
  // Lateral normal (right/starboard offset)
  const rx = fy;
  const ry = -fx;

  const lng = baseLng + (rx * laneOffsetM) / (LAT_SCALE * cosLat);
  const lat = baseLat + (ry * laneOffsetM) / LAT_SCALE;
  const bearingDeg = ((Math.atan2(fx, fy) * 180) / Math.PI + 360) % 360;
  return { lng, lat, bearingDeg };
}

export function computeSeineBoatPoses(nowMs: number): SeineBoatPose[] {
  const totalM = SEINE_METRICS.totalM;
  const elapsedS = nowMs / 1000;
  return SEINE_FLEET.map((spec) => {
    const rawDist = spec.phaseFrac * totalM + spec.dir * spec.speedMps * elapsedS;
    const wrappedDist = ((rawDist % totalM) + totalM) % totalM;
    const head = sampleSeineAtDistance(wrappedDist, spec.dir, spec.laneOffsetM);

    // Build a gentle 48m wake trail behind the stern
    const wakePath: [number, number, number][] = [];
    for (let step = 1; step <= 4; step += 1) {
      const d = wrappedDist - spec.dir * (14 + step * 11);
      if (d < 0 || d > totalM) continue;
      const pt = sampleSeineAtDistance(d, spec.dir, spec.laneOffsetM);
      wakePath.push([pt.lng, pt.lat, 0.14]);
    }
    return {
      id: spec.id,
      position: [head.lng, head.lat, 0.12],
      orientation: [0, compassBearingToDeckYaw(head.bearingDeg), 0],
      wakePath,
    };
  });
}

export interface SeineRiverLayerOptions {
  zoom: number;
  pitch: number;
  theme: 'dark' | 'light';
  cityId?: string;
  xrayMode?: boolean;
  bounds?: [[number, number], [number, number]] | null;
  nowMs?: number;
}

// Seine road bridges are rendered cleanly by the base vector style (`roads-bridge`),
// while elevated metro viaducts (L2 / L6) are rendered by `station_detail_lod.ts`.

/**
 * Renders animated Seine water shimmer/reflections and 8 illuminated Parisian
 * Bateaux-Mouches gliding smoothly along the river (zero extra timers; updates
 * seamlessly on the existing train/camera render cadence).
 */
export function createSeineRiverLayers(options: SeineRiverLayerOptions): any[] {
  const {
    zoom,
    pitch,
    theme,
    cityId = 'paris',
    xrayMode = false,
    bounds,
    nowMs = Date.now(),
  } = options;

  if (cityId !== 'paris' || xrayMode || zoom < 12.6) {
    return [];
  }

  const layers: any[] = [];
  const isLight = theme === 'light';
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0014);

  // 1. Dynamic Seine specular reflection ribbons (warm golden bridge/city reflections at night,
  // crisp sunlit silver shimmer by day)
  const reflectionSegments = [
    // Core illuminated river channel shimmer
    {
      path: SEINE_CENTERLINE.map(([lng, lat]) => [lng, lat, 0.06] as [number, number, number]),
      width: isLight ? 24 : 34,
      color: isLight
        ? ([224, 240, 255, Math.round(28 + pulse * 14)] as [number, number, number, number])
        : ([120, 168, 224, Math.round(26 + pulse * 14)] as [number, number, number, number]),
    },
    // Warm golden waterfront reflection band (Louvre → Alexandre III → Eiffel → Bir-Hakeim)
    {
      path: SEINE_CENTERLINE.slice(7, 19).map(
        ([lng, lat]) => [lng, lat, 0.08] as [number, number, number]
      ),
      width: isLight ? 10 : 18,
      color: isLight
        ? ([255, 250, 236, Math.round(34 + (1 - pulse) * 18)] as [number, number, number, number])
        : ([252, 200, 114, Math.round(32 + (1 - pulse) * 20)] as [number, number, number, number]),
    },
  ];

  layers.push(
    new PathLayer({
      id: 'seine-water-reflections',
      data: reflectionSegments,
      pickable: false,
      widthUnits: 'meters',
      getPath: (d: any) => d.path,
      getWidth: (d: any) => d.width,
      getColor: (d: any) => d.color,
      capRounded: true,
      jointRounded: true,
      parameters: { depthTest: false, depthWriteEnabled: false } as any,
    })
  );

  // 1b. Bridges are rendered cleanly by the base vector map (`roads-bridge` / `roads-bridge-casing`)
  // and elevated metro viaducts (`station-lod-viaducts`) — no oversized placeholder GLB bridges.

  // 2. Animated Bateaux-Mouches + translucent white wakes
  if (zoom >= 13.0 && pitch >= 8) {
    const allPoses = computeSeineBoatPoses(nowMs);
    const visiblePoses = bounds
      ? allPoses.filter(({ position }) => {
          const [[west, south], [east, north]] = bounds;
          const pad = 0.004;
          return (
            position[0] >= west - pad &&
            position[0] <= east + pad &&
            position[1] >= south - pad &&
            position[1] <= north + pad
          );
        })
      : allPoses;

    if (visiblePoses.length > 0) {
      const wakes = visiblePoses.filter((p) => p.wakePath.length >= 2);
      if (wakes.length > 0) {
        layers.push(
          new PathLayer<SeineBoatPose>({
            id: 'seine-boat-wakes',
            data: wakes,
            pickable: false,
            widthUnits: 'meters',
            getPath: (d) => d.wakePath,
            getWidth: 4.2,
            getColor: isLight ? [255, 255, 255, 92] : [188, 218, 248, 72],
            capRounded: true,
            parameters: { depthTest: true, depthWriteEnabled: false } as any,
          })
        );
      }

      layers.push(
        new ScenegraphLayer<SeineBoatPose>({
          id: 'seine-bateaux-mouches',
          data: visiblePoses,
          scenegraph: BATEAU_MOUCHE_MODEL_URL,
          loaders: [GLTFLoader],
          getPosition: (d) => d.position,
          getOrientation: (d) => d.orientation,
          sizeScale: 1,
          pickable: false,
          _lighting: 'pbr',
          parameters: { depthTest: true, depthWriteEnabled: true } as any,
        })
      );
    }
  }

  return layers;
}
