import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  VignetteEffect,
} from 'postprocessing';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import { getOptimalPixelRatio, isMobileGpuDevice } from '@core/ui/map/device_perf';
import type { TrainMarker } from '@core/ui/map/trains_layer';
import type { StationDeparture } from '@core/sim/browser_engine';
import { CabHud } from './ui/CabHud';
import { drawAfficheurVitesse, MATERIAUX } from './three/paris_palette';
import {
  createAsphaltPbrMaps,
  createBallastPbrMaps,
  createBrushedMetalNormalMap,
  createConcretePbrMaps,
  createContactShadowTexture,
} from './three/pbr_textures';
import {
  createBoulevardRoadTexture,
  createFriezeCeramiqueTexture,
  createHaussmannVariantMaps,
  createSortieSignTexture,
  createStopMarkerTexture,
  createZincRoofMaps,
} from './three/haussmann_textures';
import {
  buildAusterlitzViaductArch,
  buildBastilleColumn,
  buildBirHakeimViaductDetails,
  buildEiffelTower,
  buildGrandeArche,
  buildSeineEnvironment,
  createParisSkyDome,
  type ParisTimeOfDay,
} from './three/paris_landmarks';
import {
  buildParisBoulevard,
  buildParisCityBlocks,
  type CityBlockSpec,
} from './three/paris_cityscape';
import { buildStationStopMarkers, buildSweptTrack, type TrackSystem } from './three/paris_track';
import { buildTrackSignalsAndTiv, disposeSignalTextures } from './three/paris_signals';
import {
  NOTCH_LABELS,
  clampDriveNotch,
  computeTrackGradePercent,
  evaluateStopPrecision,
  stepManualTrain,
  type DriveNotch,
  type KvbStatus,
  type SignalAspect,
} from './ride/drive_physics';

import {
  ROUTES,
  computeLiveStepS,
  formatSielWaitTime,
  getGlbUrlsForFamily,
  getLibraryGlbUrlsForLine,
  isRerLineNum,
  normalizeStr,
  resolveParisStockSpec,
  resolveRideRouteKey,
  resolveTrainGlbFamily,
  selectDualSielBoards,
  shouldUseDetailedCarMesh,
  type DualSielBoards,
  type ParisGlbFamily,
  type ParisRideHandle,
  type ParisRideOptions,
  type ParisRollingStockSpec,
  type RouteDef,
  type RouteStationDef,
  type SielRow,
} from './ride/routes_and_stock';
import {
  addArchetypeDecorations,
  createArchetypeMaterials,
  resolveStationArchetype,
} from './ride/station_architectures';
import { AsvaAnnouncer } from './ride/asva_announcer';
import { RideSynthAudio } from './ride/synth_audio';

export {
  ROUTES,
  computeLiveStepS,
  formatSielWaitTime,
  getGlbUrlsForFamily,
  getLibraryGlbUrlsForLine,
  isRerLineNum,
  normalizeStr,
  resolveParisStockSpec,
  resolveRideRouteKey,
  resolveTrainGlbFamily,
  selectDualSielBoards,
  shouldUseDetailedCarMesh,
};
export type {
  DualSielBoards,
  ParisGlbFamily,
  ParisRideHandle,
  ParisRideOptions,
  ParisRollingStockSpec,
  RouteDef,
  RouteStationDef,
  SielRow,
};

interface TrackPiece {
  t: 'L' | 'A';
  s0: number;
  len: number;
  x?: number;
  z?: number;
  h?: number;
  cx?: number;
  cz?: number;
  R?: number;
  sg?: number;
  h0?: number;
}

interface StationPos {
  name: string;
  flag: '' | 'f' | 'b';
  air: boolean;
  s0: number;
  sc: number;
}

interface TunnelDef {
  s0: number;
  s1: number;
  curve: number;
  a: boolean;
  b: boolean;
  seine: boolean;
  tower: boolean;
  austerlitzArch: boolean;
  out: [number, number] | null;
}

interface BuiltPart {
  g: THREE.Object3D;
  env: 'in' | 'out' | 'plug';
}

interface BuiltSegment {
  parts: BuiltPart[];
  dispose: () => void;
}

const PI = Math.PI;
const GY = -7;
const AW = 7;
const AY = 1.1;
const AH = 5.4;
const SL = 124;
const HALF = 62;
const PE = 3.25;
const TW = 4.2;
const TY = 2.6;
const TH = 2.4;
const TL = 320;
const TAIL = 260;

const L = 13.6;
const CW = 2.4;
const SH = 2.15;
const BY = 0.95;
const GAP = 0.7;
const NC = 5;
const WR = 0.42;
const TRAIN_LEN = NC * L + (NC - 1) * GAP;

const DOORS: [number, number][] = [
  [1.55, 2.85],
  [6.15, 7.45],
  [10.75, 12.05],
];
const WINS: [number, number][] = [
  [0.35, 1.35],
  [3.05, 4.4],
  [4.6, 5.95],
  [7.65, 9.0],
  [9.2, 10.55],
  [12.25, 13.25],
];
const WY: [number, number] = [1.0, 1.8];
const DY: [number, number] = [0.08, 2.0];

function pairIs(p: [string, string], a: string, b: string): boolean {
  return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function mountParisRideView(
  container: HTMLElement,
  options: ParisRideOptions = {}
): ParisRideHandle {
  const root = document.createElement('div');
  root.className = 'paris-ride-overlay';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Vue 3D à bord du métro parisien');

  root.innerHTML = `
    <div class="paris-ride-stage" data-ride-stage></div>
    <div class="paris-ride-veil" data-ride-veil>Retournement au terminus</div>
    <div data-ride-hud-root></div>
  `;

  container.appendChild(root);

  const stage = root.querySelector('[data-ride-stage]') as HTMLElement;
  const veil = root.querySelector('[data-ride-veil]') as HTMLElement;
  const hudHost = root.querySelector('[data-ride-hud-root]') as HTMLElement;
  const hudRoot = createRoot(hudHost);

  const isMobileGpu = isMobileGpuDevice();
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isMobileGpu,
      powerPreference: 'default',
    });
  } catch {
    root.remove();
    options.onExit?.();
    return {
      setRoute: () => {},
      setView: () => {},
      syncFromSimulation: () => {},
      dispose: () => {},
    };
  }

  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const createEnamelMaterial = (
    params: THREE.MeshPhysicalMaterialParameters
  ): THREE.MeshPhysicalMaterial =>
    new CustomShaderMaterial({
      baseMaterial: THREE.MeshPhysicalMaterial,
      ...params,
      vertexShader: /* glsl */ `
        varying vec3 vEnamelPos;
        void main() {
          vEnamelPos = (modelMatrix * vec4(position, 1.0)).xyz;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vEnamelPos;
        void main() {
          float ripple = sin(vEnamelPos.x * 14.0 + vEnamelPos.z * 9.0) * cos(vEnamelPos.y * 16.0);
          csm_Roughness = clamp(csm_Roughness + ripple * 0.032, 0.04, 0.9);
        }
      `,
    }) as unknown as THREE.MeshPhysicalMaterial;

  const archMats = createArchetypeMaterials(trackMat, textures);
  const synthAudio = new RideSynthAudio();
  const asva = new AsvaAnnouncer();
  let audioEnabled = false;
  let doorWarnPlayed = false;

  renderer.setPixelRatio(getOptimalPixelRatio(1.6, 1.35));
  renderer.setSize(
    container.clientWidth || window.innerWidth,
    container.clientHeight || window.innerHeight
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  stage.appendChild(renderer.domElement);
  const maxAniso = Math.min(isMobileGpu ? 2 : 4, renderer.capabilities.getMaxAnisotropy());

  const makeCanvas = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  const toTex = (c: HTMLCanvasElement, rx = 1, ry = 1, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    textures.push(t);
    return t;
  };

  const fitText = (
    g: CanvasRenderingContext2D,
    s: string,
    x: number,
    y: number,
    maxW: number,
    px: number,
    weight: string,
    family: string,
    color: string,
    align: CanvasTextAlign = 'center'
  ) => {
    let size = px;
    g.font = `${weight} ${size}px ${family}`;
    while (g.measureText(s).width > maxW && size > 10) {
      size -= 2;
      g.font = `${weight} ${size}px ${family}`;
    }
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillText(s, x, y);
  };

  const poly = (
    g: CanvasRenderingContext2D,
    pts: [number, number][],
    fill: string | CanvasGradient
  ) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };

  const noise = (
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    n: number,
    alpha: number,
    dark: boolean
  ) => {
    const v = dark ? 0 : 255;
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      g.fillRect(
        Math.random() * w,
        Math.random() * h,
        1 + Math.random() * 2,
        1 + Math.random() * 2
      );
    }
  };

  const mergeGeos = (list: THREE.BufferGeometry[]) => {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    for (const g0 of list) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      const u = g.attributes.uv ? g.attributes.uv.array : null;
      for (let i = 0; i < p.length; i++) {
        pos.push(p[i]);
        nor.push(n[i]);
      }
      if (u) {
        for (let i = 0; i < u.length; i++) uv.push(u[i]);
      } else {
        for (let i = 0; i < (p.length / 3) * 2; i++) uv.push(0);
      }
      if (g !== g0) g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geo;
  };

  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };

  /* ---------- Textures ---------- */
  function tileCanvas(bump: boolean) {
    const S = 512;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    const tw = 128;
    const th = 64;
    const gr = 4;
    const bv = 11;
    g.fillStyle = bump ? '#000' : '#9d978a';
    g.fillRect(0, 0, S, S);
    for (let r = 0; r < 8; r++) {
      const off = (r % 2) * 64;
      for (let k = -1; k < 5; k++) {
        const x = k * tw + off + gr / 2;
        const y = r * th + gr / 2;
        const w = tw - gr;
        const h = th - gr;
        const top: [number, number][] = [
          [x, y],
          [x + w, y],
          [x + w - bv, y + bv],
          [x + bv, y + bv],
        ];
        const bot: [number, number][] = [
          [x, y + h],
          [x + w, y + h],
          [x + w - bv, y + h - bv],
          [x + bv, y + h - bv],
        ];
        const lef: [number, number][] = [
          [x, y],
          [x + bv, y + bv],
          [x + bv, y + h - bv],
          [x, y + h],
        ];
        const rig: [number, number][] = [
          [x + w, y],
          [x + w - bv, y + bv],
          [x + w - bv, y + h - bv],
          [x + w, y + h],
        ];
        if (bump) {
          g.fillStyle = '#fff';
          g.fillRect(x + bv, y + bv, w - 2 * bv, h - 2 * bv);
          let gd = g.createLinearGradient(0, y, 0, y + bv);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, top, gd);
          gd = g.createLinearGradient(0, y + h, 0, y + h - bv);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, bot, gd);
          gd = g.createLinearGradient(x, 0, x + bv, 0);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, lef, gd);
          gd = g.createLinearGradient(x + w, 0, x + w - bv, 0);
          gd.addColorStop(0, '#222');
          gd.addColorStop(1, '#fff');
          poly(g, rig, gd);
        } else {
          const v = 236 + Math.floor(Math.random() * 14);
          g.fillStyle = `rgb(${v},${v - 3},${v - 11})`;
          g.fillRect(x, y, w, h);
          poly(g, top, 'rgba(255,255,255,0.6)');
          poly(g, lef, 'rgba(255,255,250,0.32)');
          poly(g, bot, 'rgba(70,55,30,0.22)');
          poly(g, rig, 'rgba(70,55,30,0.16)');
          const hl = g.createLinearGradient(x, y, x + w, y + h);
          hl.addColorStop(0, 'rgba(255,255,255,0.18)');
          hl.addColorStop(0.5, 'rgba(255,255,255,0)');
          hl.addColorStop(1, 'rgba(120,100,70,0.05)');
          g.fillStyle = hl;
          g.fillRect(x + bv, y + bv, w - 2 * bv, h - 2 * bv);
        }
      }
    }
    if (!bump) noise(g, S, S, 2200, 0.05, true);
    return c;
  }

  function concreteCanvas(base: string, spots: number, streak: boolean) {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < spots; i++) {
      const r = 6 + Math.random() * 40;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      const d = Math.random() < 0.5;
      gr.addColorStop(0, d ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(Math.random() * S, Math.random() * S);
      g.fillStyle = gr;
      g.fillRect(-r, -r, 2 * r, 2 * r);
      g.restore();
    }
    if (streak) {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        g.fillRect(Math.random() * S, 0, 1 + Math.random() * 3, S);
      }
    }
    noise(g, S, S, 3000, 0.12, true);
    noise(g, S, S, 1200, 0.05, false);
    return c;
  }

  function slabCanvas() {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = '#4b4844';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const v = 118 + Math.floor(Math.random() * 18);
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
      }
    }
    noise(g, S, S, 4000, 0.12, true);
    noise(g, S, S, 1500, 0.08, false);
    return c;
  }

  function posterCanvas(k: number) {
    const W = 900;
    const H = 540;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    const serif = 'Georgia,"Times New Roman",serif';
    const sans = 'Switzer,"Avenir Next",Futura,Arial,sans-serif';
    let title = '';
    let sub = '';
    let band = '';
    let ink = '';
    if (k === 0) {
      const gr = g.createLinearGradient(0, 0, 0, H * 0.62);
      gr.addColorStop(0, '#2b2d5c');
      gr.addColorStop(0.55, '#d8665a');
      gr.addColorStop(1, '#f4b860');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffe3a3';
      g.beginPath();
      g.arc(W * 0.66, H * 0.6, 92, PI, 0);
      g.fill();
      g.fillStyle = '#1d2c4f';
      g.fillRect(0, H * 0.6, W, H * 0.4);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(255,214,150,${0.55 - i * 0.05})`;
        const w = 170 - i * 16;
        g.fillRect(W * 0.66 - w / 2, H * 0.6 + 10 + i * 15, w, 4);
      }
      poly(
        g,
        [
          [180, 322],
          [390, 322],
          [360, 350],
          [205, 350],
        ],
        '#0f1730'
      );
      poly(
        g,
        [
          [285, 318],
          [285, 170],
          [365, 318],
        ],
        '#f6ead0'
      );
      poly(
        g,
        [
          [278, 318],
          [278, 200],
          [215, 318],
        ],
        '#e9d7b3'
      );
      title = 'CROISIÈRES DU SOIR';
      sub = 'Départs chaque jeudi depuis le quai n° 3';
      band = '#141c36';
      ink = '#f6ead0';
    } else if (k === 1) {
      g.fillStyle = '#2f5d46';
      g.fillRect(0, 0, W, H);
      const cols = ['#7fb58a', '#cfe3b8', '#4f8a63', '#e8efd2'];
      for (let i = 0; i < 7; i++) {
        g.fillStyle = cols[i % 4];
        g.beginPath();
        g.arc(W / 2, H * 0.78, 380 - i * 52, PI, 0);
        g.fill();
      }
      for (let i = 0; i < 10; i++) {
        g.save();
        g.translate(90 + i * 80, 120 + (i % 2) * 40);
        g.rotate((i % 2 ? 1 : -1) * 0.5);
        g.fillStyle = i % 2 ? '#1e3f2f' : '#a9cf8f';
        g.beginPath();
        g.ellipse(0, 0, 22, 58, 0, 0, 2 * PI);
        g.fill();
        g.restore();
      }
      title = 'LE JARDIN D’HIVER';
      sub = 'Serres ouvertes jusqu’à minuit';
      band = '#1b3528';
      ink = '#f3ecd4';
    } else if (k === 2) {
      const gr = g.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, 520);
      gr.addColorStop(0, '#24386e');
      gr.addColorStop(1, '#060a18');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * 2 * PI;
        const b = a + PI / 28;
        poly(
          g,
          [
            [W / 2, H * 0.42],
            [W / 2 + Math.cos(a) * 900, H * 0.42 + Math.sin(a) * 900],
            [W / 2 + Math.cos(b) * 900, H * 0.42 + Math.sin(b) * 900],
          ],
          i % 2 ? 'rgba(255,214,110,0.16)' : 'rgba(255,255,255,0.03)'
        );
      }
      g.fillStyle = '#ffd56a';
      g.beginPath();
      g.arc(W / 2, H * 0.42, 58, 0, 2 * PI);
      g.fill();
      g.strokeStyle = '#ffd56a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(W / 2, H * 0.42, 86, 0, 2 * PI);
      g.stroke();
      title = 'EXPOSITION DES LUMIÈRES';
      sub = 'Palais d’Été · entrée libre le dimanche';
      band = '#0b1126';
      ink = '#ffd56a';
    } else if (k === 3) {
      g.fillStyle = '#efe2c6';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 14; i++) {
        const a = PI + (i / 13) * PI;
        poly(
          g,
          [
            [W / 2, 330],
            [W / 2 + Math.cos(a - 0.06) * 600, 330 + Math.sin(a - 0.06) * 600],
            [W / 2 + Math.cos(a + 0.06) * 600, 330 + Math.sin(a + 0.06) * 600],
          ],
          'rgba(214,150,70,0.22)'
        );
      }
      g.fillStyle = '#6b3b25';
      g.beginPath();
      g.ellipse(W / 2, 370, 190, 26, 0, 0, 2 * PI);
      g.fill();
      g.fillStyle = '#8a4b2c';
      g.beginPath();
      g.moveTo(W / 2 - 130, 250);
      g.lineTo(W / 2 + 130, 250);
      g.quadraticCurveTo(W / 2 + 120, 365, W / 2, 368);
      g.quadraticCurveTo(W / 2 - 120, 365, W / 2 - 130, 250);
      g.fill();
      g.strokeStyle = '#8a4b2c';
      g.lineWidth = 18;
      g.beginPath();
      g.arc(W / 2 + 138, 295, 36, -PI / 2, PI / 2);
      g.stroke();
      g.strokeStyle = '#6b3b25';
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(W / 2 + i * 55, 228);
        g.bezierCurveTo(W / 2 + i * 55 - 30, 190, W / 2 + i * 55 + 30, 160, W / 2 + i * 55, 110);
        g.stroke();
      }
      title = 'CAFÉ L’AURORE';
      sub = 'Le premier café du matin, servi dès 5 h';
      band = '#3c2316';
      ink = '#efe2c6';
    } else {
      g.fillStyle = '#1a0d0f';
      g.fillRect(0, 0, W, H);
      const sp = g.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, 260);
      sp.addColorStop(0, 'rgba(255,230,170,0.55)');
      sp.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = sp;
      g.fillRect(0, 0, W, H);
      for (const side of [0, 1]) {
        for (let i = 0; i < 7; i++) {
          const x = side ? W - 40 - i * 34 : i * 34;
          const gr = g.createLinearGradient(x, 0, x + 34, 0);
          gr.addColorStop(0, '#5c1016');
          gr.addColorStop(0.5, '#b3262f');
          gr.addColorStop(1, '#5c1016');
          g.fillStyle = gr;
          g.fillRect(x, 0, 40, H);
        }
      }
      g.fillStyle = '#d4a441';
      g.fillRect(0, 0, W, 44);
      for (let i = 0; i < 15; i++) {
        g.beginPath();
        g.arc(30 + i * 60, 44, 30, 0, PI);
        g.fill();
      }
      g.fillStyle = '#f4dca0';
      g.beginPath();
      g.arc(W / 2, H * 0.5, 34, 0, 2 * PI);
      g.fill();
      title = 'THÉÂTRE DU MIDI';
      sub = 'Ce soir : « La Lune en retard »';
      band = '#2a0f12';
      ink = '#e9c46a';
    }
    g.fillStyle = band;
    g.fillRect(0, H - 138, W, 138);
    g.fillStyle = ink;
    g.fillRect(36, H - 138, W - 72, 3);
    fitText(g, title, W / 2, H - 66, W - 90, 60, '700', serif, ink);
    fitText(g, sub, W / 2, H - 24, W - 120, 28, '500', sans, ink);
    return c;
  }

  function plaqueCanvas(text: string) {
    const W = 1024;
    const H = 192;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#1d3f7a';
    g.fillRect(0, 0, W, H);
    const gl = g.createLinearGradient(0, 0, 0, H);
    gl.addColorStop(0, 'rgba(255,255,255,0.12)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0)');
    gl.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.strokeRect(16, 16, W - 32, H - 32);
    fitText(
      g,
      text,
      W / 2,
      H / 2 + 34,
      W - 90,
      100,
      '600',
      'Switzer,"Arial Narrow",Arial,sans-serif',
      '#ffffff'
    );
    return c;
  }

  function signCanvas(text: string, bg: string, fg: string) {
    const W = 512;
    const H = 128;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    fitText(g, text, W / 2, H / 2 + 22, W - 50, 62, '600', 'Switzer,Arial,sans-serif', fg);
    return c;
  }

  function destCanvas(text: string) {
    const W = 512;
    const H = 96;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#0d0d0d';
    g.fillRect(0, 0, W, H);
    fitText(g, text, W / 2, H / 2 + 18, W - 30, 52, '600', 'Switzer,Arial,sans-serif', '#ffb547');
    return c;
  }

  function sielCanvas(
    lineNum: string,
    lineBg: string,
    lineFg: string,
    headingDest: string,
    rows: SielRow[]
  ) {
    const W = 512;
    const H = 204;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    // Boîtier noir-ardoise RATP + reflet de vitre supérieur
    g.fillStyle = '#091020';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1c2d6c';
    g.fillRect(10, 8, W - 20, 56);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1.5;
    g.strokeRect(10, 8, W - 20, 56);

    // Pastille de ligne
    g.fillStyle = lineBg;
    g.beginPath();
    g.arc(42, 36, 20, 0, 2 * PI);
    g.fill();
    fitText(g, lineNum, 42, 44, 32, 23, '700', "'Asap Variable',Asap,Arial,sans-serif", lineFg);
    fitText(
      g,
      `→ ${headingDest}`,
      74,
      44,
      W - 186,
      23,
      '600',
      "'Asap Variable',Asap,Arial,sans-serif",
      '#ffffff',
      'left'
    );
    fitText(
      g,
      'TEMPS RÉEL',
      W - 20,
      42,
      96,
      13,
      '600',
      "'Asap Variable',Asap,sans-serif",
      '#c9d7fb',
      'right'
    );

    // Écran verre noir + grille de LEDs éteintes (#4d3906)
    g.fillStyle = '#04070e';
    g.fillRect(12, 72, W - 24, 122);
    g.fillStyle = 'rgba(77, 57, 6, 0.28)';
    for (let y = 80; y < 188; y += 7) {
      for (let x = 20; x < W - 20; x += 7) {
        g.beginPath();
        g.arc(x, y, 1.4, 0, 2 * PI);
        g.fill();
      }
    }

    const row1 = rows[0] ?? { dest: headingDest, eta: 'À quai' };
    const row2 = rows[1] ?? { dest: headingDest, eta: '4 min' };
    const drawRow = (row: SielRow, baselineY: number, isFirst: boolean) => {
      const isAtPlatform = row.eta === 'À quai' || row.eta === '0 min';
      const etaColor = isAtPlatform ? '#ffe4a6' : '#ffb81c';
      g.save();
      g.shadowColor = isAtPlatform ? 'rgba(255, 228, 166, 0.7)' : 'rgba(255, 184, 28, 0.65)';
      g.shadowBlur = isFirst ? 9 : 6;
      fitText(
        g,
        row.dest,
        24,
        baselineY,
        W - 190,
        isFirst ? 21 : 18,
        '600',
        "'Asap Variable',Asap,Arial,sans-serif",
        isFirst ? '#f2f5ff' : '#94a8d6',
        'left'
      );
      fitText(
        g,
        row.eta,
        W - 24,
        baselineY + 2,
        146,
        isFirst ? 31 : 26,
        '700',
        "'Asap Variable',Asap,monospace",
        etaColor,
        'right'
      );
      g.restore();
    };
    drawRow(row1, 114, true);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(22, 132, W - 44, 1);
    drawRow(row2, 174, false);

    // Reflet de vitre en biais
    const glaze = g.createLinearGradient(0, 72, 0, 118);
    glaze.addColorStop(0, 'rgba(255,255,255,0.08)');
    glaze.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glaze;
    g.fillRect(12, 72, W - 24, 46);
    return c;
  }

  function woodCanvas() {
    const W = 256;
    const H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#6e4426';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,8' : '160,110,60'},${Math.random() * 0.25})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * H;
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
      g.stroke();
    }
    return c;
  }

  function classCanvas() {
    const S = 128;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = '#e9dcb4';
    g.beginPath();
    g.arc(64, 64, 60, 0, 2 * PI);
    g.fill();
    g.strokeStyle = '#7a5b22';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 64, 52, 0, 2 * PI);
    g.stroke();
    fitText(g, '1', 64, 94, 100, 84, '600', 'Georgia,serif', '#5a1414');
    return c;
  }

  function badgeCanvas(r: RouteDef) {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 4, 0, 2 * PI);
    g.fill();
    g.fillStyle = r.bg;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 16, 0, 2 * PI);
    g.fill();
    fitText(
      g,
      r.num,
      S / 2,
      S / 2 + (r.num.length > 2 ? 34 : 52),
      S - 70,
      r.num.length > 2 ? 96 : 150,
      '600',
      'Switzer,Arial,sans-serif',
      r.fg
    );
    return c;
  }

  const tileMap = toTex(tileCanvas(false), 1 / 0.6, 1 / 0.6);
  const tileBump = toTex(tileCanvas(true), 1 / 0.6, 1 / 0.6, false);
  const tunnelTex = toTex(concreteCanvas('#3a352f', 90, true), 1 / 4, 1 / 4);
  const bedTex = toTex(concreteCanvas('#2e2a26', 120, false), 1 / 3, 1 / 3);
  const slabTex = toTex(slabCanvas(), 1 / 1.2, 1 / 1.2);
  const groundTex = toTex(concreteCanvas('#77716a', 60, false), 1 / 6, 1 / 6);
  const classTex = toTex(classCanvas());

  const concretePbr = createConcretePbrMaps(maxAniso);
  const asphaltPbr = createAsphaltPbrMaps(maxAniso);
  const ballastPbr = createBallastPbrMaps(maxAniso);
  const steelNormal = createBrushedMetalNormalMap(maxAniso);
  const contactShadowTex = createContactShadowTexture();
  const haussmannCream = createHaussmannVariantMaps('cream', maxAniso);
  const haussmannOchre = createHaussmannVariantMaps('ochre', maxAniso);
  const haussmannModern = createHaussmannVariantMaps('modern', maxAniso);
  const zincRoofMaps = createZincRoofMaps(maxAniso);
  const boulevardRoadTex = createBoulevardRoadTexture(maxAniso);
  const stopMetroPosTex = createStopMarkerTexture('TÊTE', maxAniso);
  const stopMetroNegTex = createStopMarkerTexture('TÊTE', maxAniso);
  const friezeCeramiqueTex = createFriezeCeramiqueTexture(maxAniso);
  const sortieSignTex = createSortieSignTexture(maxAniso);
  textures.push(
    concretePbr.normalMap,
    concretePbr.roughnessMap,
    asphaltPbr.normalMap,
    asphaltPbr.roughnessMap,
    ballastPbr.normalMap,
    ballastPbr.roughnessMap,
    steelNormal,
    contactShadowTex,
    haussmannCream.map,
    haussmannCream.roughnessMap,
    haussmannOchre.map,
    haussmannOchre.roughnessMap,
    haussmannModern.map,
    haussmannModern.roughnessMap,
    zincRoofMaps.map,
    zincRoofMaps.roughnessMap,
    boulevardRoadTex,
    stopMetroPosTex,
    stopMetroNegTex,
    friezeCeramiqueTex,
    sortieSignTex
  );
  if (haussmannCream.normalMap) textures.push(haussmannCream.normalMap);
  if (haussmannOchre.normalMap) textures.push(haussmannOchre.normalMap);
  if (haussmannModern.normalMap) textures.push(haussmannModern.normalMap);

  /* ---------- Materials ---------- */
  const M = {
    tile: trackMat(
      new CustomShaderMaterial({
        baseMaterial: THREE.MeshPhysicalMaterial,
        map: tileMap,
        bumpMap: tileBump,
        bumpScale: 0.42,
        roughness: 0.16,
        metalness: 0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.05,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          varying vec2 vTileUv;
          varying vec3 vTileWorld;
          void main() {
            vTileUv = uv;
            vTileWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vTileUv;
          varying vec3 vTileWorld;
          float hashTile(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          void main() {
            // Pose quinconce 2:1 (carreaux 15 × 7.5 cm)
            vec2 grid = vTileUv * vec2(1.0 / 0.15, 1.0 / 0.075);
            float row = floor(grid.y);
            grid.x += mod(row, 2.0) * 0.5;
            vec2 cell = floor(grid);
            vec2 f = fract(grid);

            // Joint de ciment mat vs glaçure céramique brillante
            float gx = smoothstep(0.0, 0.045, f.x) * smoothstep(0.0, 0.045, 1.0 - f.x);
            float gy = smoothstep(0.0, 0.075, f.y) * smoothstep(0.0, 0.075, 1.0 - f.y);
            float glazeMask = gx * gy;

            // Variation déterministe ±3 % par carreau + légère patine en pied de paroi
            float jitter = (hashTile(cell) - 0.5) * 0.06;
            float basePatina = smoothstep(0.6, 2.2, vTileWorld.y);
            vec3 tint = vec3(1.0 + jitter, 1.0 + jitter * 0.9, 1.0 + jitter * 0.75);
            tint *= mix(0.92, 1.0, basePatina);

            csm_DiffuseColor.rgb *= mix(vec3(0.76, 0.77, 0.79), tint, glazeMask);
            csm_Roughness = mix(0.94, clamp(0.14 + jitter * 0.8, 0.08, 0.28), glazeMask);
          }
        `,
      }) as unknown as THREE.MeshPhysicalMaterial
    ),
    tunnel: trackMat(
      new THREE.MeshStandardMaterial({
        map: tunnelTex,
        normalMap: concretePbr.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: concretePbr.roughnessMap,
        roughness: 0.95,
        metalness: 0.04,
        envMapIntensity: 0.22,
        side: THREE.BackSide,
      })
    ),
    bed: trackMat(
      new THREE.MeshStandardMaterial({
        map: bedTex,
        normalMap: ballastPbr.normalMap,
        normalScale: new THREE.Vector2(1.2, 1.2),
        roughnessMap: ballastPbr.roughnessMap,
        roughness: 0.95,
        envMapIntensity: 0.14,
        side: THREE.DoubleSide,
      })
    ),
    slab: trackMat(
      new THREE.MeshStandardMaterial({
        map: slabTex,
        normalMap: asphaltPbr.normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughnessMap: asphaltPbr.roughnessMap,
        roughness: 0.78,
        envMapIntensity: 0.35,
      })
    ),
    platformFace: trackMat(
      new THREE.MeshStandardMaterial({
        color: MATERIAUX.quai.color,
        normalMap: asphaltPbr.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughnessMap: asphaltPbr.roughnessMap,
        roughness: MATERIAUX.quai.roughness,
        envMapIntensity: 0.18,
      })
    ),
    edge: trackMat(
      new THREE.MeshStandardMaterial({
        color: MATERIAUX.bordureQuai.color,
        roughness: MATERIAUX.bordureQuai.roughness,
        envMapIntensity: 0.4,
      })
    ),
    steel: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc2c8cf,
        normalMap: steelNormal,
        normalScale: new THREE.Vector2(0.24, 0.24),
        roughness: 0.16,
        metalness: 0.94,
        envMapIntensity: 1.45,
        side: THREE.DoubleSide,
      })
    ),
    railWeb: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b3530,
        roughness: 0.72,
        metalness: 0.65,
        envMapIntensity: 0.35,
        side: THREE.DoubleSide,
      })
    ),
    rollway: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x62676e,
        normalMap: steelNormal,
        normalScale: new THREE.Vector2(0.2, 0.2),
        roughness: 0.38,
        metalness: 0.82,
        envMapIntensity: 0.85,
        side: THREE.DoubleSide,
      })
    ),
    thirdShroud: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd9a81e,
        roughness: 0.48,
        metalness: 0.08,
        envMapIntensity: 0.45,
        side: THREE.DoubleSide,
      })
    ),
    catenaryMast: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4b5650,
        roughness: 0.46,
        metalness: 0.7,
        envMapIntensity: 0.65,
      })
    ),
    catenaryWire: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x727a7f,
        roughness: 0.35,
        metalness: 0.85,
        envMapIntensity: 0.9,
        side: THREE.DoubleSide,
      })
    ),
    cableTray: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x26292e,
        roughness: 0.7,
        metalness: 0.3,
        side: THREE.DoubleSide,
      })
    ),
    stopSignPos: trackMat(
      new THREE.MeshBasicMaterial({
        map: stopMetroPosTex,
        side: THREE.DoubleSide,
      })
    ),
    stopSignNeg: trackMat(
      new THREE.MeshBasicMaterial({
        map: stopMetroNegTex,
        side: THREE.DoubleSide,
      })
    ),
    contactShadow: trackMat(
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
      })
    ),
    headlightBeam: trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.93, 0.78),
        transparent: true,
        opacity: 0.068,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    ),
    signalGreen: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 2.9, 0.95) })),
    signalYellow: trackMat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.1, 2.05, 0.25) })
    ),
    signalRed: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.1, 0.24, 0.2) })),
    cabMask: trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x0e1117,
        roughness: 0.16,
        metalness: 0.15,
        clearcoat: 0.9,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.2,
      })
    ),
    headlightLed: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3.2, 2.7) })),
    taillightLed: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.2, 0.18) })),
    third: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5b5148,
        roughness: 0.6,
        metalness: 0.4,
        envMapIntensity: 0.3,
        side: THREE.DoubleSide,
      })
    ),
    sleeper: trackMat(
      new THREE.MeshStandardMaterial({
        color: MATERIAUX.tunnel.color,
        roughness: MATERIAUX.tunnel.roughness,
        envMapIntensity: 0.15,
      })
    ),
    frame: trackMat(
      new THREE.MeshStandardMaterial({
        color: MATERIAUX.laiton.color,
        roughness: MATERIAUX.laiton.roughness,
        metalness: MATERIAUX.laiton.metalness,
        envMapIntensity: 0.9,
        side: THREE.DoubleSide,
      })
    ),
    cream: trackMat(
      createEnamelMaterial({
        color: MATERIAUX.faience.color,
        roughness: MATERIAUX.faience.roughness,
        clearcoat: MATERIAUX.faience.clearcoat ?? 0.65,
        clearcoatRoughness: MATERIAUX.faience.clearcoatRoughness ?? 0.1,
        envMapIntensity: 0.7,
        side: THREE.DoubleSide,
      })
    ),
    housing: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x23262a,
        roughness: 0.5,
        metalness: 0.6,
        envMapIntensity: 0.5,
      })
    ),
    lamp: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.95, 2.5) })),
    tunnelLamp: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.3) })),
    paintGreen: trackMat(
      createEnamelMaterial({
        color: 0x24513c,
        roughness: 0.42,
        metalness: 0.05,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        envMapIntensity: 0.9,
      })
    ),
    paintRed: trackMat(
      createEnamelMaterial({
        color: 0x7e1f1d,
        roughness: 0.42,
        metalness: 0.05,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        envMapIntensity: 0.9,
      })
    ),
    roof: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b3d3f,
        roughness: 0.6,
        metalness: 0.2,
        envMapIntensity: 0.5,
      })
    ),
    under: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x171717,
        roughness: 0.8,
        metalness: 0.3,
        envMapIntensity: 0.3,
      })
    ),
    wood: trackMat(
      new THREE.MeshStandardMaterial({
        map: toTex(woodCanvas(), 1, 1),
        roughness: 0.4,
        envMapIntensity: 0.5,
        side: THREE.DoubleSide,
      })
    ),
    floor: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3a2a1f, roughness: 0.7, envMapIntensity: 0.3 })
    ),
    ceiling: trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.9, 1.65, 1.2),
        side: THREE.DoubleSide,
      })
    ),
    glass: trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x9fb3b0,
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.2,
        envMapIntensity: 1.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    ),
    stripe: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8c38a,
        roughness: 0.3,
        metalness: 0.4,
        envMapIntensity: 0.9,
      })
    ),
    chrome: trackMat(
      new THREE.MeshStandardMaterial({
        color: MATERIAUX.inox.color,
        roughness: MATERIAUX.inox.roughness,
        metalness: MATERIAUX.inox.metalness,
        envMapIntensity: 1.2,
      })
    ),
    rubber: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, envMapIntensity: 0.1 })
    ),
    head: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3.2) })),
    tail: trackMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.12, 0.08) })),
    viaduct: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9a9184,
        roughness: 0.85,
        envMapIntensity: 0.3,
        side: THREE.DoubleSide,
      })
    ),
    iron: trackMat(
      new THREE.MeshStandardMaterial({
        color: MATERIAUX.fonteVerte.color,
        roughness: MATERIAUX.fonteVerte.roughness,
        metalness: MATERIAUX.fonteVerte.metalness,
        envMapIntensity: 0.5,
      })
    ),
    canopy: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x41524a,
        roughness: 0.6,
        metalness: 0.3,
        envMapIntensity: 0.4,
        side: THREE.DoubleSide,
      })
    ),
    ground: trackMat(
      new THREE.MeshStandardMaterial({
        map: groundTex,
        roughness: 0.95,
        envMapIntensity: 0.2,
        side: THREE.DoubleSide,
      })
    ),
    water: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2d4e5c,
        roughness: 0.06,
        metalness: 0.62,
        envMapIntensity: 1.85,
        side: THREE.DoubleSide,
      })
    ),
    building: trackMat(
      new THREE.MeshStandardMaterial({
        map: haussmannCream.map,
        roughnessMap: haussmannCream.roughnessMap,
        normalMap: haussmannCream.normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 1.0,
        metalness: 0.04,
        envMapIntensity: 0.5,
      })
    ),
    buildingOchre: trackMat(
      new THREE.MeshStandardMaterial({
        map: haussmannOchre.map,
        roughnessMap: haussmannOchre.roughnessMap,
        normalMap: haussmannOchre.normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 1.0,
        metalness: 0.04,
        envMapIntensity: 0.5,
      })
    ),
    buildingModern: trackMat(
      new THREE.MeshStandardMaterial({
        map: haussmannModern.map,
        roughnessMap: haussmannModern.roughnessMap,
        normalMap: haussmannModern.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 1.0,
        metalness: 0.1,
        envMapIntensity: 0.72,
      })
    ),
    awningGreen: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e4231, roughness: 0.78, envMapIntensity: 0.25 })
    ),
    awningBordeaux: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x5c1a24, roughness: 0.78, envMapIntensity: 0.25 })
    ),
    boulevardRoad: trackMat(
      new THREE.MeshStandardMaterial({
        map: boulevardRoadTex,
        normalMap: asphaltPbr.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.85,
        envMapIntensity: 0.25,
        side: THREE.DoubleSide,
      })
    ),
    sidewalk: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9c968b,
        normalMap: concretePbr.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.88,
        envMapIntensity: 0.2,
        side: THREE.DoubleSide,
      })
    ),
    lawn: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4b6a3b,
        roughness: 0.94,
        envMapIntensity: 0.14,
      })
    ),
    gravel: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd1c7b2,
        roughness: 0.92,
        envMapIntensity: 0.18,
      })
    ),
    hull: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.6, metalness: 0.25 })
    ),
    cabinLit: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4ecd8,
        emissive: 0xffd27a,
        emissiveIntensity: 0.45,
        roughness: 0.3,
      })
    ),
    zinc: trackMat(
      new THREE.MeshStandardMaterial({
        map: zincRoofMaps.map,
        roughnessMap: zincRoofMaps.roughnessMap,
        roughness: 0.82,
        metalness: 0.52,
        envMapIntensity: 0.62,
      })
    ),
    cornice: trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe6decb, roughness: 0.82, envMapIntensity: 0.25 })
    ),
    ironRail: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x181c22,
        roughness: 0.45,
        metalness: 0.72,
        envMapIntensity: 0.6,
      })
    ),
    chimney: trackMat(
      new THREE.MeshStandardMaterial({ color: 0xa45d45, roughness: 0.88, envMapIntensity: 0.2 })
    ),
    foliage: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3b5c36, roughness: 0.92, envMapIntensity: 0.18 })
    ),
    trunk: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x4c3a2c, roughness: 0.95, envMapIntensity: 0.12 })
    ),
    friezeCeramique: trackMat(
      new THREE.MeshPhysicalMaterial({
        map: friezeCeramiqueTex,
        roughness: 0.18,
        metalness: 0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
        envMapIntensity: 0.95,
        side: THREE.DoubleSide,
      })
    ),
    sortieSign: trackMat(
      new THREE.MeshBasicMaterial({
        map: sortieSignTex,
        color: new THREE.Color(1.35, 1.4, 1.55),
        side: THREE.DoubleSide,
      })
    ),
    tactileBand: trackMat(
      new THREE.MeshStandardMaterial({ color: 0xebe6d8, roughness: 0.65, envMapIntensity: 0.3 })
    ),
    mound: trackMat(
      new THREE.MeshStandardMaterial({ color: 0x56603f, roughness: 1, envMapIntensity: 0.15 })
    ),
    plug: trackMat(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })),
    tower: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x79644f,
        roughness: 0.44,
        metalness: 0.68,
        envMapIntensity: 0.95,
        side: THREE.DoubleSide,
      })
    ),
    towerDark: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3f362d,
        roughness: 0.4,
        metalness: 0.72,
        envMapIntensity: 0.85,
        side: THREE.DoubleSide,
      })
    ),
    towerGlass: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffe4b3,
        emissive: 0xffb84d,
        emissiveIntensity: 0.75,
        roughness: 0.18,
        metalness: 0.35,
      })
    ),
    towerBeacon: trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(3.2, 2.45, 1.15),
      })
    ),
    towerRedLight: trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(3.5, 0.18, 0.12),
      })
    ),
    interiorLining: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6e7e9,
        roughness: 0.36,
        envMapIntensity: 0.65,
        side: THREE.DoubleSide,
      })
    ),
    interiorSeat: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x008b8d,
        roughness: 0.55,
        envMapIntensity: 0.45,
        side: THREE.DoubleSide,
      })
    ),
    cabinLed: trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.42, 1.34, 1.16),
      })
    ),
    passengerCoat: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262e3a,
        roughness: 0.82,
        metalness: 0.04,
        envMapIntensity: 0.3,
      })
    ),
    passengerHead: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc9a58c,
        roughness: 0.72,
        metalness: 0.02,
        envMapIntensity: 0.25,
      })
    ),
    doorLineMap: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      })
    ),
    frieze: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1d3f7a,
        roughness: 0.3,
        envMapIntensity: 0.75,
        side: THREE.DoubleSide,
      })
    ),
    psdFrame: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9aa2ad,
        roughness: 0.25,
        metalness: 0.78,
        envMapIntensity: 0.9,
      })
    ),
    psdGlass: trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xc2e2ea,
        roughness: 0.06,
        metalness: 0,
        transparent: true,
        opacity: 0.32,
        envMapIntensity: 1.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    ),
    cabDash: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e222a,
        roughness: 0.42,
        metalness: 0.35,
        envMapIntensity: 0.7,
      })
    ),
    cabButtonRed: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd92626,
        roughness: 0.3,
        metalness: 0.1,
        envMapIntensity: 0.8,
      })
    ),
    cabYellow: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4c430,
        roughness: 0.35,
        metalness: 0.15,
        envMapIntensity: 0.8,
      })
    ),
    sielBody: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x161b24,
        roughness: 0.38,
        metalness: 0.55,
        envMapIntensity: 0.7,
      })
    ),
  };

  /* ---------- Train geometry ---------- */
  function rectPath(x0: number, y0: number, x1: number, y1: number) {
    const p = new THREE.Path();
    p.moveTo(x0, y0);
    p.lineTo(x1, y0);
    p.lineTo(x1, y1);
    p.lineTo(x0, y1);
    p.lineTo(x0, y0);
    return p;
  }

  function rrPath(x0: number, y0: number, x1: number, y1: number, r: number) {
    const p = new THREE.Path();
    p.moveTo(x0 + r, y0);
    p.lineTo(x1 - r, y0);
    p.quadraticCurveTo(x1, y0, x1, y0 + r);
    p.lineTo(x1, y1 - r);
    p.quadraticCurveTo(x1, y1, x1 - r, y1);
    p.lineTo(x0 + r, y1);
    p.quadraticCurveTo(x0, y1, x0, y1 - r);
    p.lineTo(x0, y0 + r);
    p.quadraticCurveTo(x0, y0, x0 + r, y0);
    return p;
  }

  const sideShape = new THREE.Shape();
  sideShape.moveTo(0, 0);
  sideShape.lineTo(L, 0);
  sideShape.lineTo(L, SH);
  sideShape.lineTo(0, SH);
  WINS.forEach((w) => sideShape.holes.push(rrPath(w[0], WY[0], w[1], WY[1], 0.08)));
  DOORS.forEach((d) => sideShape.holes.push(rectPath(d[0], DY[0], d[1], DY[1])));

  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.lineTo(0.66, 0);
  leafShape.lineTo(0.66, 1.92);
  leafShape.lineTo(0, 1.92);
  leafShape.holes.push(rrPath(0.11, 1.0, 0.55, 1.76, 0.05));

  function endShape(mode: 'cab' | 'auto' | 'mid') {
    const s = new THREE.Shape();
    s.moveTo(-CW / 2, 0);
    s.lineTo(CW / 2, 0);
    s.lineTo(CW / 2, SH);
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      s.lineTo(CW / 2 - CW * t, SH + 0.36 * Math.sin(PI * t));
    }
    if (mode === 'cab') {
      s.holes.push(rrPath(-1.02, 1.05, -0.14, 1.85, 0.06));
      s.holes.push(rrPath(0.14, 1.05, 1.02, 1.85, 0.06));
    } else if (mode === 'auto') {
      s.holes.push(rrPath(-1.04, 0.86, 1.04, 1.9, 0.1));
    } else {
      s.holes.push(rectPath(-0.38, 0.08, 0.38, 1.95));
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 6 });
    g.rotateY(PI / 2);
    return g;
  }

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-CW / 2 - 0.04, 0);
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    roofShape.lineTo(-CW / 2 - 0.04 + (CW + 0.08) * t, i === 24 ? 0 : 0.4 * Math.sin(PI * t));
  }

  const wheelParts: THREE.BufferGeometry[] = [];
  [-0.72, 0.72].forEach((z) => {
    const w = new THREE.CylinderGeometry(WR, WR, 0.1, 24);
    w.rotateX(PI / 2);
    w.translate(0, 0, z);
    wheelParts.push(w);
    const f = new THREE.CylinderGeometry(WR + 0.035, WR + 0.035, 0.025, 24);
    f.rotateX(PI / 2);
    f.translate(0, 0, z - Math.sign(z) * 0.06);
    wheelParts.push(f);
    wheelParts.push(box(0.09, 0.62, 0.02, 0, 0, z + Math.sign(z) * 0.06));
  });
  const axGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.56, 10);
  axGeo.rotateX(PI / 2);
  wheelParts.push(axGeo);

  const seatParts: THREE.BufferGeometry[] = [];
  [
    [3.05, 5.95],
    [7.65, 10.55],
  ].forEach(([b0, b1]) =>
    [-0.66, 0.66].forEach((z) => {
      [
        [b0 + 0.32, b0 + 0.07],
        [b1 - 0.32, b1 - 0.07],
      ].forEach(([sx, bx]) => {
        seatParts.push(box(0.46, 0.07, 0.92, sx, BY + 0.47, z));
        seatParts.push(box(0.06, 0.55, 0.92, bx, BY + 0.78, z));
        seatParts.push(box(0.4, 0.4, 0.8, sx, BY + 0.24, z));
      });
    })
  );
  [
    [0.35, 1.35],
    [12.25, 13.25],
  ].forEach(([b0, b1]) =>
    [-0.85, 0.85].forEach((z) => {
      seatParts.push(box(b1 - b0, 0.07, 0.42, (b0 + b1) / 2, BY + 0.47, z));
      seatParts.push(box(b1 - b0, 0.5, 0.05, (b0 + b1) / 2, BY + 0.76, z + Math.sign(z) * 0.2));
    })
  );

  const G = {
    side: trackGeo(
      new THREE.ExtrudeGeometry(sideShape, { depth: 0.05, bevelEnabled: false, curveSegments: 6 })
    ),
    lining: trackGeo(
      new THREE.ExtrudeGeometry(sideShape, { depth: 0.02, bevelEnabled: false, curveSegments: 6 })
    ),
    sideGlass: trackGeo(
      mergeGeos(
        WINS.map((w) => {
          const g = new THREE.PlaneGeometry(w[1] - w[0] + 0.06, WY[1] - WY[0] + 0.06);
          g.translate((w[0] + w[1]) / 2, (WY[0] + WY[1]) / 2, 0);
          return g;
        })
      )
    ),
    leaf: trackGeo(
      new THREE.ExtrudeGeometry(leafShape, { depth: 0.035, bevelEnabled: false, curveSegments: 5 })
    ),
    leafGlass: trackGeo(
      (() => {
        const g = new THREE.PlaneGeometry(0.48, 0.8);
        g.translate(0.33, 1.38, 0.0175);
        return g;
      })()
    ),
    endCab: trackGeo(endShape('cab')),
    endAuto: trackGeo(endShape('auto')),
    endMid: trackGeo(endShape('mid')),
    cabGlass: trackGeo(
      mergeGeos(
        [-0.58, 0.58].map((z) => {
          const g = new THREE.PlaneGeometry(0.94, 0.86);
          g.rotateY(PI / 2);
          g.translate(0, 1.45, z);
          return g;
        })
      )
    ),
    cabGlassAuto: trackGeo(
      (() => {
        const g = new THREE.PlaneGeometry(2.08, 1.04);
        g.rotateY(PI / 2);
        g.translate(0, 1.38, 0);
        return g;
      })()
    ),
    roof: trackGeo(
      (() => {
        const g = new THREE.ExtrudeGeometry(roofShape, { depth: L + 0.06, bevelEnabled: false });
        g.rotateY(PI / 2);
        g.translate(-0.03, 0, 0);
        return g;
      })()
    ),
    vents: trackGeo(
      mergeGeos(
        [2.6, 6.8, 11.0].flatMap((x) => [
          // Caisson principal climatisation / ventilation
          box(2.15, 0.2, 1.38, x, 0.44, 0),
          // Carénage supérieur biseauté
          box(1.75, 0.06, 1.12, x, 0.56, 0),
          // Grilles latérales en relief
          box(1.5, 0.12, 0.04, x, 0.45, 0.7),
          box(1.5, 0.12, 0.04, x, 0.45, -0.7),
        ])
      )
    ),
    coupler: trackGeo(
      mergeGeos([
        // Barre d'attelage Scharfenberg
        box(0.46, 0.11, 0.14, 0.16, 0, 0),
        // Tête d'accouplement octogonale
        box(0.18, 0.22, 0.34, 0.42, 0.01, 0),
        // Cône de centrage
        box(0.14, 0.12, 0.14, 0.54, 0.02, 0.07),
        // Coffret de connexions électriques inférieur
        box(0.16, 0.11, 0.24, 0.4, -0.14, 0),
      ])
    ),
    pneuBogie: trackGeo(
      mergeGeos([
        // Pneus porteurs caoutchouc (essieux avant & arrière)
        ...[-0.95, 0.95].flatMap((ox) =>
          [-0.96, 0.96].map((z) => {
            const tyre = new THREE.CylinderGeometry(WR + 0.055, WR + 0.055, 0.22, 20);
            tyre.rotateX(PI / 2);
            tyre.translate(ox, WR + 0.02, z);
            return tyre;
          })
        ),
        // 4 roues horizontales de guidage latéral (spécifique métro sur pneus)
        ...[-1.32, 1.32].flatMap((ox) =>
          [-1.14, 1.14].map((z) => {
            const guide = new THREE.CylinderGeometry(0.24, 0.24, 0.11, 16);
            guide.translate(ox, 0.34, z);
            return guide;
          })
        ),
      ])
    ),
    windowTrim: trackGeo(
      mergeGeos(
        WINS.flatMap(([x0, x1]) => {
          const w = x1 - x0;
          const cx = (x0 + x1) / 2;
          const h = WY[1] - WY[0];
          const cy = (WY[0] + WY[1]) / 2;
          const t = 0.032;
          return [
            box(w + t * 2, t, 0.018, cx, WY[1] + t / 2, 0),
            box(w + t * 2, t, 0.018, cx, WY[0] - t / 2, 0),
            box(t, h, 0.018, x0 - t / 2, cy, 0),
            box(t, h, 0.018, x1 + t / 2, cy, 0),
          ];
        })
      )
    ),
    doorGasket: trackGeo(box(0.026, 1.94, 0.042, 0.65, 1.0, 0.018)),
    frontMask: trackGeo(
      mergeGeos([
        // Bandeau noir brillant encadrant le pare-brise (MP14 / MF01 / MP89)
        box(0.04, 0.14, CW - 0.16, 0.045, 1.98, 0),
        box(0.04, 0.14, CW - 0.16, 0.045, 0.86, 0),
        box(0.04, 1.24, 0.12, 0.045, 1.42, CW / 2 - 0.14),
        box(0.04, 1.24, 0.12, 0.045, 1.42, -(CW / 2 - 0.14)),
        // Boîtiers d'optiques avant bas
        box(0.05, 0.18, 0.34, 0.045, 0.44, 0.72),
        box(0.05, 0.18, 0.34, 0.045, 0.44, -0.72),
      ])
    ),
    headlightCluster: trackGeo(
      mergeGeos([
        box(0.025, 0.09, 0.22, 0.072, 0.45, 0.72),
        box(0.025, 0.09, 0.22, 0.072, 0.45, -0.72),
      ])
    ),
    floor: trackGeo(box(L, 0.06, CW - 0.1, L / 2, BY + 0.03, 0)),
    ceil: trackGeo(
      (() => {
        const g = new THREE.PlaneGeometry(L - 0.3, CW - 0.2);
        g.rotateX(PI / 2);
        g.translate(L / 2, BY + SH - 0.015, 0);
        return g;
      })()
    ),
    under: trackGeo(
      mergeGeos([
        box(L - 1.2, 0.3, CW - 0.5, L / 2, BY - 0.18, 0),
        box(2.2, 0.35, 0.8, L / 2 - 1.8, BY - 0.45, 0.4),
        box(1.6, 0.3, 0.7, L / 2 + 2.2, BY - 0.43, -0.45),
        box(1.0, 0.28, 0.5, L / 2 + 0.2, BY - 0.42, 0.6),
      ])
    ),
    bogie: trackGeo(
      mergeGeos([
        box(2.8, 0.22, 0.12, 0, 0.5, 0.92),
        box(2.8, 0.22, 0.12, 0, 0.5, -0.92),
        box(0.36, 0.2, 1.84, 0, 0.52, 0),
        box(0.5, 0.2, 0.3, 0, 0.68, 0.92),
        box(0.5, 0.2, 0.3, 0, 0.68, -0.92),
        box(0.5, 0.06, 0.18, 0, 0.12, 1.2),
      ])
    ),
    axle: trackGeo(mergeGeos(wheelParts)),
    seats: trackGeo(mergeGeos(seatParts)),
    poles: trackGeo(
      mergeGeos(
        DOORS.map((d) => {
          const c = new THREE.CylinderGeometry(0.022, 0.022, SH - 0.1, 10);
          c.translate((d[0] + d[1]) / 2, BY + SH / 2, 0);
          return c;
        })
      )
    ),
    handrails: trackGeo(
      mergeGeos([
        // Twin longitudinal stainless steel ceiling grab rails along passenger aisle
        ...[-0.52, 0.52].flatMap((z) => {
          const rail = new THREE.CylinderGeometry(0.015, 0.015, L - 1.4, 8);
          rail.rotateZ(PI / 2);
          rail.translate(L / 2, BY + SH - 0.28, z);
          // Ceiling stanchion drops & grab handles terminating cleanly inside the cabin roof
          const drops = [2.2, 4.5, 6.8, 9.1, 11.4].flatMap((hx) => {
            const st = new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6);
            st.translate(hx, BY + SH - 0.16, z);
            const loop = box(0.022, 0.15, 0.09, hx + 0.55, BY + SH - 0.36, z);
            return [st, loop];
          });
          return [rail, ...drops];
        }),
      ])
    ),
    cabinLedStrips: trackGeo(
      mergeGeos([
        box(L - 0.9, 0.03, 0.12, L / 2, BY + SH - 0.03, -0.44),
        box(L - 0.9, 0.03, 0.12, L / 2, BY + SH - 0.03, 0.44),
      ])
    ),
    doorMaps: trackGeo(
      mergeGeos(
        [-1, 1].flatMap((side) =>
          DOORS.map((d) => {
            const g = new THREE.PlaneGeometry(1.18, 0.17);
            if (side > 0) g.rotateY(PI);
            g.translate((d[0] + d[1]) / 2, BY + SH - 0.17, side * (CW / 2 - 0.09));
            return g;
          })
        )
      )
    ),
    seatedBody: trackGeo(
      mergeGeos([
        // 4 minimalist seated Parisian passengers in transverse bays
        ...[
          [3.38, 0.72, 1],
          [5.62, -0.72, -1],
          [7.98, -0.68, 1],
          [10.22, 0.7, -1],
        ].flatMap(([px, pz, facing]) => [
          // Torso
          box(0.24, 0.52, 0.38, px, BY + 0.76, pz),
          // Lap / legs
          box(0.36, 0.16, 0.34, px + facing * 0.18, BY + 0.56, pz),
          box(0.14, 0.42, 0.3, px + facing * 0.32, BY + 0.28, pz),
        ]),
      ])
    ),
    seatedHead: trackGeo(
      mergeGeos(
        [
          [3.38, 0.72],
          [5.62, -0.72],
          [7.98, -0.68],
          [10.22, 0.7],
        ].map(([px, pz]) => {
          const sp = new THREE.SphereGeometry(0.115, 10, 8);
          sp.translate(px, BY + 1.13, pz);
          return sp;
        })
      )
    ),
    stripe: trackGeo(
      mergeGeos(
        [
          [0, DOORS[0][0]],
          [DOORS[0][1], DOORS[1][0]],
          [DOORS[1][1], DOORS[2][0]],
          [DOORS[2][1], L],
        ].map(([a, b]) => box(b - a, 0.035, 0.012, (a + b) / 2, 0, 0))
      )
    ),
    gangway: trackGeo(
      mergeGeos([
        box(GAP + 0.1, 0.08, 1.0, 0, BY + 2.0, 0),
        box(GAP + 0.1, 0.06, 1.0, 0, BY + 0.03, 0),
        box(GAP + 0.1, 2.0, 0.06, 0, BY + 1.0, 0.5),
        box(GAP + 0.1, 2.0, 0.06, 0, BY + 1.0, -0.5),
      ])
    ),
  };

  function buildCar(
    paint: THREE.Material,
    frontCab: boolean,
    rearCab: boolean,
    firstClass: boolean
  ) {
    const car = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      car.add(m);
      return m;
    };
    add(G.side, paint, 0, BY, CW / 2 - 0.05);
    add(G.side, paint, 0, BY, -CW / 2);
    add(G.lining, M.interiorLining, 0, BY, CW / 2 - 0.075);
    add(G.lining, M.interiorLining, 0, BY, -CW / 2 + 0.055);
    add(G.sideGlass, M.glass, 0, BY, CW / 2 - 0.0525);
    add(G.sideGlass, M.glass, 0, BY, -CW / 2 + 0.0525);
    add(G.windowTrim, M.rubber, 0, BY, CW / 2 + 0.005);
    add(G.windowTrim, M.rubber, 0, BY, -CW / 2 - 0.005);
    add(G.stripe, M.stripe, 0, BY + 0.9, CW / 2 + 0.006);
    add(G.stripe, M.stripe, 0, BY + 0.9, -CW / 2 - 0.006);
    add(G.roof, M.roof, 0, BY + SH, 0);
    add(G.vents, M.roof, 0, BY + SH, 0);
    add(G.floor, M.floor);
    add(G.ceil, M.ceiling);
    add(G.under, M.under);
    add(G.seats, M.interiorSeat);
    add(G.poles, M.chrome);
    add(G.handrails, M.chrome);
    add(G.cabinLedStrips, M.cabinLed);
    add(G.doorMaps, M.doorLineMap);
    add(G.seatedBody, M.passengerCoat);
    add(G.seatedHead, M.passengerHead);
    const rearClassic = add(rearCab ? G.endCab : G.endMid, paint, 0, BY, 0);
    const rearAuto = rearCab ? add(G.endAuto, paint, 0, BY, 0) : null;
    const frontClassic = add(frontCab ? G.endCab : G.endMid, paint, L - 0.05, BY, 0);
    const frontAuto = frontCab ? add(G.endAuto, paint, L - 0.05, BY, 0) : null;
    const rearGlass = rearCab ? add(G.cabGlass, M.glass, 0.025, BY, 0) : null;
    const rearGlassAuto = rearCab ? add(G.cabGlassAuto, M.glass, 0.025, BY, 0) : null;
    const frontGlass = frontCab ? add(G.cabGlass, M.glass, L - 0.025, BY, 0) : null;
    const frontGlassAuto = frontCab ? add(G.cabGlassAuto, M.glass, L - 0.025, BY, 0) : null;
    if (rearAuto) rearAuto.visible = false;
    if (frontAuto) frontAuto.visible = false;
    if (rearGlassAuto) rearGlassAuto.visible = false;
    if (frontGlassAuto) frontGlassAuto.visible = false;

    // Masque frontal moderne, optiques LED HDR et attelage Scharfenberg
    const frontMasks: THREE.Mesh[] = [];
    if (frontCab) {
      frontMasks.push(add(G.frontMask, M.cabMask, L - 0.05, BY, 0));
      add(G.headlightCluster, M.headlightLed, L - 0.05, BY, 0);
      add(G.coupler, M.housing, L, BY - 0.16, 0);
    }
    if (rearCab) {
      const rm = add(G.frontMask, M.cabMask, 0.05, BY, 0);
      rm.rotation.y = PI;
      frontMasks.push(rm);
      const rl = add(G.headlightCluster, M.taillightLed, 0.05, BY, 0);
      rl.rotation.y = PI;
      const rc = add(G.coupler, M.housing, 0, BY - 0.16, 0);
      rc.rotation.y = PI;
    }

    const axles: THREE.Mesh[] = [];
    const pneuBogies: THREE.Mesh[] = [];
    [2.4, L - 2.4].forEach((bx) => {
      add(G.bogie, M.under, bx, 0, 0);
      const pb = add(G.pneuBogie, M.rubber, bx, 0, 0);
      pb.visible = false;
      pneuBogies.push(pb);
      [-0.95, 0.95].forEach((o) => axles.push(add(G.axle, M.under, bx + o, WR, 0)));
    });

    // Ombre de contact douce sous la caisse pour ancrer la rame sur la voie
    const shadowPlane = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(L * 1.06, CW * 1.38)),
      M.contactShadow
    );
    shadowPlane.rotation.x = -PI / 2;
    shadowPlane.position.set(L / 2, 0.025, 0);
    car.add(shadowPlane);

    const leaves: Array<{ obj: THREE.Group; base: number; dir: number }> = [];
    [1, -1].forEach((s) =>
      DOORS.forEach((d) => {
        const c = (d[0] + d[1]) / 2;
        [
          [c - 0.66, -1],
          [c, 1],
        ].forEach(([base, dir]) => {
          const lg = new THREE.Group();
          lg.add(new THREE.Mesh(G.leaf, paint));
          lg.add(new THREE.Mesh(G.leafGlass, M.glass));
          const gasket = new THREE.Mesh(G.doorGasket, M.rubber);
          if (dir > 0) gasket.position.x = -0.64;
          lg.add(gasket);
          lg.position.set(base, BY + 0.08, s > 0 ? CW / 2 + 0.004 : -CW / 2 - 0.039);
          car.add(lg);
          if (s > 0) leaves.push({ obj: lg, base, dir });
        });
      })
    );

    const classBadges: THREE.Mesh[] = [];
    if (firstClass) {
      const classGeo = trackGeo(new THREE.PlaneGeometry(0.34, 0.34));
      const classMat = trackMat(
        new THREE.MeshStandardMaterial({ map: classTex, roughness: 0.3, transparent: true })
      );
      [1, -1].forEach((s) =>
        [4.5, 9.1].forEach((x) => {
          const p = new THREE.Mesh(classGeo, classMat);
          p.position.set(x, BY + 0.55, s * (CW / 2 + 0.008));
          if (s < 0) p.rotation.y = PI;
          car.add(p);
          classBadges.push(p);
        })
      );
    }

    car.userData = {
      axles,
      leaves,
      pneuBogies,
      frontMasks,
      rearClassic,
      rearAuto,
      frontClassic,
      frontAuto,
      rearGlass,
      rearGlassAuto,
      frontGlass,
      frontGlassAuto,
      classBadges,
    };
    return car;
  }

  /* ---------- Scene & Lighting ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050404);
  scene.fog = new THREE.FogExp2(0x0c0a08, 0.0085);
  const camera = new THREE.PerspectiveCamera(
    55,
    (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
    0.05,
    1450
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 70;
  controls.minDistance = 0.4;
  controls.screenSpacePanning = true;

  // Battery-conscious rendering: direct WebGL MSAA on mobile/iPhone (zero FBO copy overhead),
  // lightweight Bloom-only EffectComposer on desktop without heavy N8AO screen-space raymarching.
  const composer = !isMobileGpu
    ? new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType })
    : null;
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new EffectPass(
        camera,
        new BloomEffect({ luminanceThreshold: 1.12, mipmapBlur: true, intensity: 0.32 }),
        new VignetteEffect({ offset: 0.38, darkness: 0.28 })
      )
    );
  }

  let envTarget: THREE.WebGLRenderTarget | null = null;
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const envBoxGeo = new THREE.BoxGeometry(30, 12, 30);
    const envBoxMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.14, 0.13, 0.12),
      side: THREE.BackSide,
    });
    const envWallGeo = new THREE.PlaneGeometry(30, 8);
    const envWallMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.42, 0.41, 0.39),
      side: THREE.DoubleSide,
    });
    const envStripGeo = new THREE.BoxGeometry(26, 0.22, 0.55);
    const warmStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.2, 4.4, 3.4) });
    const coolStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 4.4, 5.0) });
    const envFloorGeo = new THREE.PlaneGeometry(30, 30);
    const envFloorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.11, 0.1) });

    es.add(new THREE.Mesh(envBoxGeo, envBoxMat));
    [-14.8, 14.8].forEach((z) => {
      const wMesh = new THREE.Mesh(envWallGeo, envWallMat);
      wMesh.position.set(0, 0.4, z);
      es.add(wMesh);
    });
    for (let i = -2; i <= 2; i++) {
      const m = new THREE.Mesh(envStripGeo, i % 2 === 0 ? warmStripMat : coolStripMat);
      m.position.set(0, 5.6, i * 2.6);
      es.add(m);
    }
    const fl = new THREE.Mesh(envFloorGeo, envFloorMat);
    fl.rotation.x = -PI / 2;
    fl.position.y = -5.5;
    es.add(fl);
    envTarget = pm.fromScene(es, 0.03);
    scene.environment = envTarget.texture;
    envBoxGeo.dispose();
    envBoxMat.dispose();
    envWallGeo.dispose();
    envWallMat.dispose();
    envStripGeo.dispose();
    warmStripMat.dispose();
    coolStripMat.dispose();
    envFloorGeo.dispose();
    envFloorMat.dispose();
    pm.dispose();
  }

  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x3a2c1e, 0.42);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 0);
  scene.add(sun);
  scene.add(sun.target);

  const skyCtrl = createParisSkyDome(textures, trackGeo, trackMat);
  const sky = skyCtrl.mesh;
  scene.add(sky);

  let timeOfDay: ParisTimeOfDay = 'day';
  let rainEnabled = false;

  // Pooled open-air rain streaks centered around camera in outdoor sections
  const RAIN_COUNT = isMobileGpu ? 130 : 250;
  const rainPositions = new Float32Array(RAIN_COUNT * 6);
  const rainSeeds = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainSeeds[i * 3] = (rnd(i * 19 + 3) - 0.5) * 28;
    rainSeeds[i * 3 + 1] = rnd(i * 31 + 7) * 14;
    rainSeeds[i * 3 + 2] = (rnd(i * 47 + 11) - 0.5) * 32;
  }
  const rainGeo = trackGeo(new THREE.BufferGeometry());
  const rainPosAttr = new THREE.BufferAttribute(rainPositions, 3);
  rainGeo.setAttribute('position', rainPosAttr);
  const rainMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xcbe2f5,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  scene.add(rainLines);

  /* ---------- Station module geometries ---------- */
  function archPts(halfW: number, y0: number, h: number, seg: number, walls: boolean) {
    const pts: [number, number][] = [];
    if (walls) pts.push([halfW, 0]);
    for (let i = 0; i <= seg; i++) {
      const t = (PI * i) / seg;
      pts.push([halfW * Math.cos(t), y0 + h * Math.sin(t)]);
    }
    if (walls) pts.push([-halfW, 0]);
    return pts;
  }

  function profileTube(profile: [number, number][], x0: number, x1: number) {
    const lens = [0];
    for (let i = 1; i < profile.length; i++) {
      lens.push(
        lens[i - 1] +
          Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1])
      );
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const n = profile.length;
    [x0, x1].forEach((x) => {
      for (let i = 0; i < n; i++) {
        pos.push(x, profile[i][1], profile[i][0]);
        uv.push(x, lens[i]);
      }
    });
    for (let i = 0; i < n - 1; i++) idx.push(i, n + i, i + 1, i + 1, n + i, n + i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function wallPatch(xc: number, hw: number, y1: number, y2: number, side: number, inset: number) {
    const a = AW - inset;
    const b = AH - inset;
    const cl = (v: number) => Math.max(-1, Math.min(1, v));
    const t1 = Math.asin(cl((y1 - AY) / AH));
    const t2 = Math.asin(cl((y2 - AY) / AH));
    const seg = 16;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= 1; j++) {
      const x = xc - hw + 2 * hw * j;
      for (let i = 0; i <= seg; i++) {
        const t = t1 + ((t2 - t1) * i) / seg;
        pos.push(x, AY + b * Math.sin(t), side * a * Math.cos(t));
        uv.push(side > 0 ? 1 - j : j, i / seg);
      }
    }
    for (let i = 0; i < seg; i++) {
      const n = seg + 1;
      idx.push(i, n + i, i + 1, i + 1, n + i, n + i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
    const u = g.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * su, u.getY(i) * sv);
    return g;
  }

  function plane(w: number, h: number, ry: number, x: number, y: number, z: number) {
    const g = new THREE.PlaneGeometry(w, h);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  }

  const portalPts: [number, number][] = [
    [-AW, 0],
    [-AW, AY],
  ];
  for (let i = 1; i <= 60; i++) {
    const t = PI - (PI * i) / 60;
    portalPts.push([AW * Math.cos(t), AY + AH * Math.sin(t)]);
  }
  portalPts.push([AW, 0], [TW, 0], [TW, TY]);
  for (let i = 1; i <= 40; i++) {
    const t = (PI * i) / 40;
    portalPts.push([TW * Math.cos(t), TY + TH * Math.sin(t)]);
  }
  portalPts.push([-TW, 0]);
  const portalPg = new THREE.ShapeGeometry(
    new THREE.Shape(portalPts.map((p) => new THREE.Vector2(p[0], p[1])))
  );
  const portalPa = portalPg.clone();
  portalPa.rotateY(PI / 2);
  portalPa.translate(-HALF, 0, 0);
  const portalPb = portalPg.clone();
  portalPb.rotateY(-PI / 2);
  portalPb.translate(HALF, 0, 0);
  portalPg.dispose();

  const wPlat = AW - PE;
  const platBodies: THREE.BufferGeometry[] = [];
  const platTops: THREE.BufferGeometry[] = [];
  const platEdges: THREE.BufferGeometry[] = [];
  [-1, 1].forEach((s) => {
    const zc = s * (PE + wPlat / 2);
    platBodies.push(box(SL, AY, wPlat, 0, AY / 2, zc));
    const t = new THREE.PlaneGeometry(SL, wPlat);
    scaleUV(t, SL, wPlat);
    t.rotateX(-PI / 2);
    t.translate(0, AY + 0.002, zc);
    platTops.push(t);
    platEdges.push(box(SL, 0.03, 0.38, 0, AY + 0.012, s * (PE + 0.19)));
  });

  const posterX = [-48, -24, 0, 24, 48];
  const plaqueX = [-36, -12, 12, 36, -58, 58];
  const framesStn: THREE.BufferGeometry[] = [];
  const postersStn: THREE.BufferGeometry[][] = [[], [], [], [], []];
  const pframesStn: THREE.BufferGeometry[] = [];
  const plaquesStn: THREE.BufferGeometry[] = [];
  [-1, 1].forEach((s) => {
    posterX.forEach((x, i) => {
      framesStn.push(wallPatch(x, 1.78, 1.8, 3.92, s, 0.012));
      postersStn[(i + (s > 0 ? 0 : 2)) % 5].push(wallPatch(x, 1.6, 1.92, 3.8, s, 0.03));
    });
    plaqueX.forEach((x) => {
      pframesStn.push(wallPatch(x, 1.72, 2.28, 3.02, s, 0.012));
      plaquesStn.push(wallPatch(x, 1.6, 2.35, 2.95, s, 0.03));
    });
    plaquesStn.push(plane(3.4, 0.64, (-s * PI) / 2, s * (HALF - 0.03), 5.6, s * 0.4));
    pframesStn.push(plane(4.75, 0.8, (-s * PI) / 2, s * (HALF - 0.015), 5.6, -s * 0.175));
  });

  const plinthsStn: THREE.BufferGeometry[] = [];
  const seatsStn: THREE.BufferGeometry[][] = [[], [], [], [], []];
  [-1, 1].forEach((s) =>
    posterX.forEach((x, bi) => {
      plinthsStn.push(box(3.4, 0.42, 0.5, x, AY + 0.21, s * 6.3));
      for (let i = 0; i < 5; i++) {
        seatsStn[(i + bi) % 5].push(box(0.5, 0.08, 0.44, x - 1.3 + i * 0.65, AY + 0.46, s * 6.27));
      }
    })
  );

  const housStn: THREE.BufferGeometry[] = [];
  const diffStn: THREE.BufferGeometry[] = [];
  const rodsStn: THREE.BufferGeometry[] = [];
  [-2.4, 2.4].forEach((z) => {
    for (let i = 0; i < 26; i++) {
      const x = -57.5 + i * 4.6;
      housStn.push(box(3.3, 0.12, 0.32, x, 5.75, z));
      diffStn.push(box(3.1, 0.03, 0.24, x, 5.68, z));
      [-1.3, 1.3].forEach((o) => {
        const c = new THREE.CylinderGeometry(0.01, 0.01, 0.5, 5);
        c.translate(x + o, 6.05, z);
        rodsStn.push(c);
      });
    }
  });

  const signsStn: THREE.BufferGeometry[] = [];
  const sframesStn: THREE.BufferGeometry[] = [];
  [
    [-20, 5.05],
    [20, -5.05],
  ].forEach(([x, z]) => {
    signsStn.push(plane(2, 0.5, PI / 2, x + 0.031, 4, z));
    signsStn.push(plane(2, 0.5, -PI / 2, x - 0.031, 4, z));
    sframesStn.push(box(0.05, 0.56, 2.06, x, 4, z));
    [-0.8, 0.8].forEach((o) => {
      const c = new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6);
      c.translate(x, 4.88, z + o);
      sframesStn.push(c);
    });
  });

  // CMP-style colored enamel vault frieze above advertising/station plaques
  const friezeStn: THREE.BufferGeometry[] = [-1, 1].map((s) =>
    wallPatch(0, 3.68, 3.9, HALF - 0.4, s, 0.025)
  );

  // Suspended SIEL live departure boxes on both platforms (+Z dir=+1, -Z dir=-1)
  const sielBodyStn: THREE.BufferGeometry[] = [];
  const sielScreenPosStn: THREE.BufferGeometry[] = [];
  const sielScreenNegStn: THREE.BufferGeometry[] = [];
  [
    [-32, 4.95],
    [10, 4.95],
    [-10, -4.95],
    [32, -4.95],
  ].forEach(([x, z]) => {
    sielBodyStn.push(box(0.14, 0.62, 1.52, x, 3.55, z));
    const target = z > 0 ? sielScreenPosStn : sielScreenNegStn;
    target.push(plane(1.42, 0.56, PI / 2, x + 0.074, 3.55, z));
    target.push(plane(1.42, 0.56, -PI / 2, x - 0.074, 3.55, z));
    [-0.55, 0.55].forEach((o) => {
      const rod = new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6);
      rod.translate(x, 4.5, z + o);
      sielBodyStn.push(rod);
    });
  });

  // Portes palières (automatic lines 1 / 4 / 14) aligned with all 15 train door bays
  const psdPostsStn: THREE.BufferGeometry[] = [];
  const psdFixedGlassStn: THREE.BufferGeometry[] = [];
  const psdDoorCenters: Array<{ x: number; z: number; side: number }> = [];
  [-1, 1].forEach((side) => {
    const pz = side * (PE + 0.14);
    psdPostsStn.push(box(TRAIN_LEN + 1.4, 0.14, 0.12, 0, AY + 2.02, pz));
    psdFixedGlassStn.push(box(TRAIN_LEN + 1.4, 1.85, 0.025, 0, AY + 0.94, pz + side * 0.05));
    for (let ci = 0; ci < NC; ci++) {
      const carStart = -TRAIN_LEN / 2 + ci * (L + GAP);
      DOORS.forEach((d) => {
        const dx = carStart + (d[0] + d[1]) / 2;
        [-0.74, 0.74].forEach((ox) => {
          psdPostsStn.push(box(0.09, 2.04, 0.11, dx + ox, AY + 1.02, pz));
        });
        psdDoorCenters.push({ x: dx, z: pz - side * 0.02, side });
      });
    }
  });

  const colsAir: THREE.BufferGeometry[] = [];
  const lampsAir: THREE.BufferGeometry[] = [];
  const pfAir: THREE.BufferGeometry[] = [];
  const plAir: THREE.BufferGeometry[] = [];
  const pierAir: THREE.BufferGeometry[] = [];
  for (let x = -55; x <= 55; x += 10) {
    [-1, 1].forEach((s) => {
      const c = new THREE.CylinderGeometry(0.08, 0.1, 3.6, 10);
      c.translate(x, AY + 1.8, s * 6.95);
      colsAir.push(c);
    });
  }
  [-1, 1].forEach((s) => {
    lampsAir.push(box(SL - 12, 0.04, 0.2, 0, AY + 3.52, s * 4.3));
    [-45, -15, 15, 45].forEach((x) => {
      pfAir.push(plane(3.5, 0.82, s > 0 ? PI : 0, x, AY + 2.45, s * 6.99));
      plAir.push(plane(3.2, 0.6, s > 0 ? PI : 0, x, AY + 2.45, s * 6.97));
    });
  });
  for (let x = -60; x <= 60; x += 20) {
    [-1, 1].forEach((s) => pierAir.push(box(1.6, -GY - 1.3, 1.6, x, (GY - 1.3) / 2, s * 5.5)));
  }

  const STN = {
    vault: trackGeo(profileTube(archPts(AW, AY, AH, 120, false), -HALF, HALF)),
    portal: trackGeo(mergeGeos([portalPa, portalPb])),
    platBody: trackGeo(mergeGeos(platBodies)),
    platTop: trackGeo(mergeGeos(platTops)),
    edge: trackGeo(mergeGeos(platEdges)),
    bed: trackGeo(
      (() => {
        const b = new THREE.PlaneGeometry(SL, 14);
        scaleUV(b, SL, 14);
        b.rotateX(-PI / 2);
        return b;
      })()
    ),
    frames: trackGeo(mergeGeos(framesStn)),
    posters: postersStn.map((list) => trackGeo(mergeGeos(list))),
    pframes: trackGeo(mergeGeos(pframesStn)),
    plaques: trackGeo(mergeGeos(plaquesStn)),
    badges: trackGeo(
      mergeGeos(
        [-1, 1].map((s) => plane(0.6, 0.6, (-s * PI) / 2, s * (HALF - 0.03), 5.6, -s * 2.15))
      )
    ),
    plinths: trackGeo(mergeGeos(plinthsStn)),
    seats: seatsStn.map((list) => trackGeo(mergeGeos(list))),
    hous: trackGeo(mergeGeos(housStn)),
    diff: trackGeo(mergeGeos(diffStn)),
    rods: trackGeo(mergeGeos(rodsStn)),
    signs: trackGeo(mergeGeos(signsStn)),
    sframes: trackGeo(mergeGeos(sframesStn)),
    frieze: trackGeo(mergeGeos(friezeStn)),
    sielBody: trackGeo(mergeGeos(sielBodyStn)),
    sielScreensPos: trackGeo(mergeGeos(sielScreenPosStn)),
    sielScreensNeg: trackGeo(mergeGeos(sielScreenNegStn)),
    psdPosts: trackGeo(mergeGeos(psdPostsStn)),
    psdFixedGlass: trackGeo(mergeGeos(psdFixedGlassStn)),
    psdLeaf: trackGeo(box(0.66, 1.88, 0.03, 0, AY + 0.96, 0)),
    airDeck: trackGeo(box(SL + 0.2, 1.3, 14.8, 0, -0.65, 0)),
    airParapet: trackGeo(mergeGeos([-1, 1].map((s) => box(SL, 1.1, 0.18, 0, AY + 0.55, s * 7.25)))),
    canopy: trackGeo(mergeGeos([-1, 1].map((s) => box(SL - 6, 0.12, 4.5, 0, AY + 3.6, s * 5.15)))),
    cols: trackGeo(mergeGeos(colsAir)),
    airLamps: trackGeo(mergeGeos(lampsAir)),
    airPf: trackGeo(mergeGeos(pfAir)),
    airPl: trackGeo(mergeGeos(plAir)),
    airPiers: trackGeo(mergeGeos(pierAir)),
    airGround: trackGeo(
      (() => {
        const gr = new THREE.PlaneGeometry(260, 260);
        scaleUV(gr, 260, 260);
        gr.rotateX(-PI / 2);
        gr.translate(0, GY, 0);
        return gr;
      })()
    ),
  };

  const posterMats = [0, 1, 2, 3, 4].map((k) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        map: toTex(posterCanvas(k)),
        roughness: 0.3,
        envMapIntensity: 0.55,
        side: THREE.DoubleSide,
      })
    )
  );
  const seatMats = [0xc8352b, 0xe9a23b, 0xe0c03a, 0x3f7f5a, 0x2d5fa0].map((c) =>
    trackMat(new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, envMapIntensity: 0.7 }))
  );
  const signMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: toTex(signCanvas('Sortie', '#1d3f7a', '#ffffff')),
      roughness: 0.25,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide,
    })
  );
  let sielTexPos: THREE.CanvasTexture | null = null;
  let sielTexNeg: THREE.CanvasTexture | null = null;
  const sielMatPos = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    })
  );
  const sielMatNeg = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    })
  );
  function applySielTex(
    mat: THREE.MeshBasicMaterial,
    prevTex: THREE.CanvasTexture | null,
    heading: string,
    rows: SielRow[]
  ): THREE.CanvasTexture {
    if (prevTex) prevTex.dispose();
    const tex = new THREE.CanvasTexture(sielCanvas(route.num, route.bg, route.fg, heading, rows));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    mat.map = tex;
    mat.needsUpdate = true;
    return tex;
  }
  function refreshDualSielTextures(boards: DualSielBoards) {
    sielTexPos = applySielTex(sielMatPos, sielTexPos, boards.pos.heading, boards.pos.rows);
    sielTexNeg = applySielTex(sielMatNeg, sielTexNeg, boards.neg.heading, boards.neg.rows);
  }

  let badgeMat: THREE.MeshStandardMaterial | null = null;
  let route: RouteDef = ROUTES[0];
  let spragueMode = Boolean(options.initialStockGlb?.sprague);
  let customStockGlb: { cab: string; car: string; label?: string } | null =
    options.initialStockGlb && !options.initialStockGlb.sprague ? options.initialStockGlb : null;
  let activeStock: ParisRollingStockSpec = resolveParisStockSpec('6', false);
  const stationPsds = new Set<{
    sc: number;
    group: THREE.Group;
    leaves: Array<{ mesh: THREE.Mesh; base: number; dir: number; side: number }>;
  }>();
  let pieces: TrackPiece[] = [];
  let stations: StationPos[] = [];
  let tunnels: TunnelDef[] = [];
  let tailA = { s0: 0, s1: TAIL, out: null as [number, number] | null };
  let tailB = { s0: 0, s1: TAIL, out: null as [number, number] | null };
  let openIv: [number, number][] = [];

  function buildPath(r: RouteDef) {
    pieces = [];
    stations = [];
    tunnels = [];
    let s = 0;
    let x = 0;
    let z = 0;
    let h = 0;
    const line = (len: number) => {
      pieces.push({ t: 'L', s0: s, len, x, z, h });
      x += Math.cos(h) * len;
      z += Math.sin(h) * len;
      s += len;
    };
    const arc = (R: number, th: number) => {
      const sg = Math.sign(th);
      const len = R * Math.abs(th);
      const cx = x - sg * R * Math.sin(h);
      const cz = z + sg * R * Math.cos(h);
      pieces.push({ t: 'A', s0: s, len, cx, cz, R, sg, h0: h });
      h += th;
      x = cx + sg * R * Math.sin(h);
      z = cz - sg * R * Math.cos(h);
      s += len;
    };

    tailA = { s0: 0, s1: TAIL, out: null };
    line(TAIL);
    const base = hashStr(r.key);
    r.stations.forEach((st, k) => {
      stations.push({ name: st.name, flag: st.flag, air: st.air, s0: s, sc: s + HALF });
      line(SL);
      if (k < r.stations.length - 1) {
        const t0 = s;
        const seed = base + k * 977;
        let th = 0;
        let R = 200;
        if (rnd(seed) > 0.42) {
          th = (((15 + rnd(seed + 1) * 60) * PI) / 180) * (rnd(seed + 2) < 0.5 ? -1 : 1);
          R = 140 + rnd(seed + 3) * 90;
          if (R * Math.abs(th) > 250) R = 250 / Math.abs(th);
        }
        const al = R * Math.abs(th);
        const a = (TL - al) / 2;
        line(a);
        if (th) arc(R, th);
        line(TL - al - a);
        const nb = r.stations[k + 1];
        const sp = (r.open.seine ?? []).some((p) => pairIs(p, st.name, nb.name));
        tunnels.push({
          s0: t0,
          s1: s,
          curve: th,
          a: st.air,
          b: nb.air,
          seine: sp,
          tower: Boolean(r.open.tower && pairIs(r.open.tower, st.name, nb.name)),
          austerlitzArch: Boolean(
            r.open.austerlitzArch && pairIs(r.open.austerlitzArch, st.name, nb.name)
          ),
          out: null,
        });
      }
    });
    tailB = { s0: s, s1: s + TAIL, out: null };
    line(TAIL);

    const iv: [number, number][] = [];
    stations.forEach((st) => {
      if (st.air) iv.push([st.s0, st.s0 + SL]);
    });
    tunnels.forEach((t) => {
      const len = t.s1 - t.s0;
      const f = t.seine ? 0.75 : 0.35;
      if (t.a && t.b) t.out = [t.s0, t.s1];
      else if (t.a) t.out = [t.s0, t.s0 + f * len];
      else if (t.b) t.out = [t.s1 - f * len, t.s1];
      else t.out = null;
      if (t.out) iv.push([t.out[0], t.out[1]]);
    });
    tailA.out = stations[0].air ? [tailA.s1 - 150, tailA.s1] : null;
    tailB.out = stations[stations.length - 1].air ? [tailB.s0, tailB.s0 + 150] : null;
    if (tailA.out) iv.push([tailA.out[0], tailA.out[1]]);
    if (tailB.out) iv.push([tailB.out[0], tailB.out[1]]);
    iv.sort((x, y) => x[0] - y[0]);
    openIv = [];
    iv.forEach((seg) => {
      const last = openIv[openIv.length - 1];
      if (last && seg[0] <= last[1] + 0.5) last[1] = Math.max(last[1], seg[1]);
      else openIv.push(seg);
    });
  }

  function isOpen(s: number) {
    for (let i = 0; i < openIv.length; i++) {
      if (s >= openIv[i][0] && s <= openIv[i][1]) return true;
    }
    return false;
  }

  function portalDist(s: number) {
    let d = 1e9;
    openIv.forEach((v) => {
      d = Math.min(d, Math.abs(s - v[0]), Math.abs(s - v[1]));
    });
    return d;
  }

  function isInCurve(sVal: number): boolean {
    const s = Math.max(0, sVal);
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].s0 <= s) lo = mid;
      else hi = mid - 1;
    }
    return pieces[lo]?.t === 'A';
  }

  const _pose = { x: 0, z: 0, h: 0 };
  function pose(sVal: number, out = _pose) {
    const s = Math.max(0, sVal);
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].s0 <= s) lo = mid;
      else hi = mid - 1;
    }
    const p = pieces[lo];
    const d = Math.min(s - p.s0, p.len);
    if (p.t === 'L') {
      out.x = (p.x ?? 0) + Math.cos(p.h ?? 0) * d;
      out.z = (p.z ?? 0) + Math.sin(p.h ?? 0) * d;
      out.h = p.h ?? 0;
    } else {
      const hh = (p.h0 ?? 0) + ((p.sg ?? 1) * d) / (p.R ?? 200);
      out.x = (p.cx ?? 0) + (p.sg ?? 1) * (p.R ?? 200) * Math.sin(hh);
      out.z = (p.cz ?? 0) - (p.sg ?? 1) * (p.R ?? 200) * Math.cos(hh);
      out.h = hh;
    }
    return out;
  }

  function toWorld(
    P: { x: number; z: number; h: number },
    lx: number,
    ly: number,
    lz: number,
    v: THREE.Vector3
  ) {
    const c = Math.cos(P.h);
    const s = Math.sin(P.h);
    return v.set(P.x + c * lx - s * lz, ly, P.z + s * lx + c * lz);
  }

  function sweep(profile: [number, number][], s0: number, s1: number, step: number) {
    const lens = [0];
    for (let i = 1; i < profile.length; i++) {
      lens.push(
        lens[i - 1] +
          Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1])
      );
    }
    const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
    const m = profile.length;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const P = { x: 0, z: 0, h: 0 };
    for (let i = 0; i < n; i++) {
      const s = s0 + ((s1 - s0) * i) / (n - 1);
      pose(s, P);
      const nx = -Math.sin(P.h);
      const nz = Math.cos(P.h);
      for (let j = 0; j < m; j++) {
        pos.push(P.x + nx * profile[j][0], profile[j][1], P.z + nz * profile[j][0]);
        uv.push(s, lens[j]);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m - 1; j++) {
        const a = i * m + j;
        const b = a + 1;
        const c = a + m;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const tunnelProfile = archPts(TW, TY, TH, 48, true);
  const sleeperGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.12, 2.5));
  const lampGeo = trackGeo(new THREE.BoxGeometry(0.3, 0.12, 0.08));
  const unitBox = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const mansardUnitGeo = trackGeo(
    (() => {
      const geo = new THREE.CylinderGeometry(0.56, 0.72, 1, 4, 1);
      geo.rotateY(PI / 4);
      return geo;
    })()
  );
  const DECK: [number, number][] = [
    [-4.5, -1.3],
    [-4.5, 1.1],
    [-4.25, 1.1],
    [-4.25, 0],
    [4.25, 0],
    [4.25, 1.1],
    [4.5, 1.1],
    [4.5, -1.3],
    [-4.5, -1.3],
  ];

  function currentTrackSystem(): TrackSystem {
    if (isRerLineNum(route.num)) return 'rer';
    if (['1', '4', '6', '11', '14'].includes(route.num) && !spragueMode) return 'pneu';
    return 'fer';
  }

  function makeTrackMats() {
    return {
      railHead: M.steel,
      railWeb: M.railWeb,
      third: M.third,
      thirdShroud: M.thirdShroud,
      rollway: M.rollway,
      sleeper: M.sleeper,
      catenaryMast: M.catenaryMast,
      catenaryWire: M.catenaryWire,
      cableTray: M.cableTray,
      stopSignPos: M.stopSignPos,
      stopSignNeg: M.stopSignNeg,
      tactileBand: M.tactileBand,
    };
  }

  function makeCityMats() {
    return {
      buildings: [M.building, M.buildingOchre, M.buildingModern],
      zinc: M.zinc,
      cornice: M.cornice,
      ironRail: M.ironRail,
      chimney: M.chimney,
      awningGreen: M.awningGreen,
      awningBordeaux: M.awningBordeaux,
      road: M.boulevardRoad,
      sidewalk: M.sidewalk,
      trunk: M.trunk,
      foliage: M.foliage,
      lampPost: M.ironRail,
      lampGlobe: M.tunnelLamp,
    };
  }

  function makeLandmarkMats() {
    return {
      tower: M.tower,
      towerDark: M.towerDark,
      towerGlass: M.towerGlass,
      towerBeacon: M.towerBeacon,
      towerRedLight: M.towerRedLight,
      headlightBeam: M.headlightBeam,
      trunk: M.trunk,
      foliage: M.foliage,
      lawn: M.lawn,
      gravel: M.gravel,
      viaduct: M.viaduct,
      iron: M.iron,
      ironRail: M.ironRail,
      water: M.water,
      lamp: M.tunnelLamp,
      housing: M.housing,
      hull: M.hull,
      cabinLit: M.cabinLit,
    };
  }

  function addTrack(
    g: THREE.Group,
    geos: THREE.BufferGeometry[],
    s0: number,
    s1: number,
    inTunnel: boolean,
    isOpenAir: boolean
  ) {
    buildSweptTrack({
      g,
      geos,
      s0,
      s1,
      system: currentTrackSystem(),
      inTunnel,
      isOpenAir,
      tunnelHalfWidth: TW,
      sleeperGeo,
      sweepFn: sweep,
      poseFn: pose,
      mats: makeTrackMats(),
      isMobileGpu,
    });
  }

  function addStationTrack(
    g: THREE.Group,
    geos: THREE.BufferGeometry[],
    inTunnel: boolean,
    isOpenAir: boolean
  ) {
    const localPose = (lx: number, out = { x: 0, z: 0, h: 0 }) => {
      out.x = lx;
      out.z = 0;
      out.h = 0;
      return out;
    };
    const localSweep = (prof: [number, number][], a: number, b: number, _step: number) =>
      profileTube(prof, a, b);
    buildSweptTrack({
      g,
      geos,
      s0: -HALF,
      s1: HALF,
      system: currentTrackSystem(),
      inTunnel,
      isOpenAir,
      tunnelHalfWidth: AW,
      sleeperGeo,
      sweepFn: localSweep,
      poseFn: localPose,
      mats: makeTrackMats(),
      isMobileGpu,
    });
    buildStationStopMarkers(g, geos, makeTrackMats(), TRAIN_LEN);
  }

  const signalUpdaters = new Set<(aspect: SignalAspect) => void>();
  const makeSignalMats = () => ({
    housing: M.housing,
    iron: M.iron,
    green: M.signalGreen,
    yellow: M.signalYellow,
    red: M.signalRed,
    whitePole: M.cream,
  });

  function tunnelGroup(
    s0: number,
    s1: number,
    inCurve: boolean,
    geos: THREE.BufferGeometry[],
    disposables: Array<() => void>
  ) {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      geos.push(geo);
      g.add(new THREE.Mesh(geo, mat));
    };
    add(sweep(tunnelProfile, s0, s1, 4), M.tunnel);
    add(
      sweep(
        [
          [-TW, 0.001],
          [TW, 0.001],
        ],
        s0,
        s1,
        4
      ),
      M.bed
    );
    addTrack(g, geos, s0, s1, true, false);
    const P = { x: 0, z: 0, h: 0 };
    const m4 = new THREE.Matrix4();
    const lamps: number[] = [];
    for (let s = s0 + 9; s < s1; s += 18) lamps.push(s);
    if (lamps.length) {
      const lm = new THREE.InstancedMesh(lampGeo, M.tunnelLamp, lamps.length * 2);
      let k = 0;
      lamps.forEach((s) => {
        pose(s, P);
        [-1, 1].forEach((side) => {
          const lat = side * (TW - 0.05);
          m4.makeRotationY(-P.h);
          m4.setPosition(P.x - Math.sin(P.h) * lat, 2.3, P.z + Math.cos(P.h) * lat);
          lm.setMatrixAt(k++, m4);
        });
      });
      lm.instanceMatrix.needsUpdate = true;
      g.add(lm);
    }
    const sigHandle = buildTrackSignalsAndTiv({
      s0,
      s1,
      isOpenAir: false,
      isRer: isRerLineNum(route.num),
      inCurve,
      pose,
      geos,
      mats: makeSignalMats(),
      isMobileGpu,
    });
    sigHandle.updateAspect(currentSignalAspect);
    signalUpdaters.add(sigHandle.updateAspect);
    disposables.push(() => signalUpdaters.delete(sigHandle.updateAspect));
    g.add(sigHandle.group);
    return g;
  }

  function placeBox(
    im: THREE.InstancedMesh,
    i: number,
    P: { x: number; z: number; h: number },
    along: number,
    lat: number,
    y: number,
    sx: number,
    sy: number,
    sz: number
  ) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -P.h);
    const c = Math.cos(P.h);
    const sn = Math.sin(P.h);
    im.setMatrixAt(
      i,
      new THREE.Matrix4().compose(
        new THREE.Vector3(P.x + c * along - sn * lat, y, P.z + sn * along + c * lat),
        q,
        new THREE.Vector3(sx, sy, sz)
      )
    );
  }

  let towerWorldPos: THREE.Vector3 | null = null;
  const segmentUpdaters = new Set<(elapsedSec: number, mood: ParisTimeOfDay) => void>();

  function viaductGroup(
    s0: number,
    s1: number,
    t: { seine?: boolean; tower?: boolean; austerlitzArch?: boolean; curve?: number } | null,
    geos: THREE.BufferGeometry[],
    disposables: Array<() => void>
  ) {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      geos.push(geo);
      g.add(new THREE.Mesh(geo, mat));
    };
    add(sweep(DECK, s0, s1, 4), M.viaduct);
    addTrack(g, geos, s0, s1, false, true);
    const viaductSignals = buildTrackSignalsAndTiv({
      s0,
      s1,
      isOpenAir: true,
      isRer: isRerLineNum(route.num),
      inCurve: Boolean(t?.curve && Math.abs(t.curve) > 0.05),
      pose,
      geos,
      mats: makeSignalMats(),
      isMobileGpu,
    });
    viaductSignals.updateAspect(currentSignalAspect);
    signalUpdaters.add(viaductSignals.updateAspect);
    disposables.push(() => signalUpdaters.delete(viaductSignals.updateAspect));
    g.add(viaductSignals.group);
    const mid = (s0 + s1) / 2;
    const seine = Boolean(t && t.seine);
    const river: [number, number] | null = seine ? [mid - 75, mid + 75] : null;
    if (river) {
      if (river[0] > s0) {
        add(
          sweep(
            [
              [-130, GY],
              [130, GY],
            ],
            s0,
            river[0],
            6
          ),
          M.ground
        );
      }
      if (river[1] < s1) {
        add(
          sweep(
            [
              [-130, GY],
              [130, GY],
            ],
            river[1],
            s1,
            6
          ),
          M.ground
        );
      }
      const midP = pose(mid, { x: 0, z: 0, h: 0 });
      const seineEnv = buildSeineEnvironment(
        { x: midP.x, z: midP.z, h: midP.h },
        150,
        geos,
        makeLandmarkMats(),
        isMobileGpu
      );
      g.add(seineEnv.group);
      segmentUpdaters.add(seineEnv.update);
      disposables.push(() => segmentUpdaters.delete(seineEnv.update));
      g.add(
        t?.austerlitzArch
          ? buildAusterlitzViaductArch(s0, s1, river, pose, geos, makeLandmarkMats(), isMobileGpu)
          : buildBirHakeimViaductDetails(s0, s1, river, pose, geos, makeLandmarkMats(), isMobileGpu)
      );
    } else {
      add(
        sweep(
          [
            [-130, GY],
            [130, GY],
          ],
          s0,
          s1,
          6
        ),
        M.ground
      );
    }

    buildParisBoulevard(g, s0, s1, river, sweep, pose, makeCityMats(), geos, isMobileGpu);

    const piers: number[] = [];
    for (let s = s0 + 12; s < s1; s += seine ? 36 : 24) {
      if (t?.austerlitzArch && river && s >= river[0] + 6 && s <= river[1] - 6) continue;
      piers.push(s);
    }
    if (piers.length) {
      const im = new THREE.InstancedMesh(unitBox, M.viaduct, piers.length * 2);
      let i = 0;
      piers.forEach((s) => {
        const P = pose(s, { x: 0, z: 0, h: 0 });
        [-3, 3].forEach((lat) => placeBox(im, i++, P, 0, lat, (GY - 1.3) / 2, 1.5, -GY - 1.3, 1.5));
      });
      im.instanceMatrix.needsUpdate = true;
      g.add(im);
    }

    const list: CityBlockSpec[] = [];
    const seed = hashStr(route.key) + Math.floor(s0);
    let n = 0;
    for (let s = s0 + 10; s < s1 - 6; s += 26) {
      n++;
      if (river && s > river[0] - 40 && s < river[1] + 40) continue;
      [-1, 1].forEach((side) => {
        // Garde la berge côté Champ-de-Mars dégagée pour voir toute la Tour Eiffel depuis la rame
        if (t?.tower && side < 0) return;
        const q = seed + n * 13 + side * 7;
        list.push({
          P: { ...pose(s, { x: 0, z: 0, h: 0 }) },
          along: 0,
          lat: side * (28 + rnd(q) * 16),
          w: 20 + rnd(q + 1) * 5,
          h: 17 + rnd(q + 2) * 8,
          d: 14 + rnd(q + 3) * 8,
        });
      });
    }
    buildParisCityBlocks(
      g,
      list,
      makeCityMats(),
      { unitBox, mansardUnit: mansardUnitGeo },
      geos,
      isMobileGpu
    );

    if (t && t.tower) {
      const twPosS = s0 + (s1 - s0) * 0.62;
      const P = pose(twPosS, { x: 0, z: 0, h: 0 });
      const builtTower = buildEiffelTower(geos, makeLandmarkMats(), isMobileGpu);
      const lat = -190;
      builtTower.group.position.set(P.x - Math.sin(P.h) * lat, GY, P.z + Math.cos(P.h) * lat);
      towerWorldPos = new THREE.Vector3(
        builtTower.group.position.x,
        GY + 105,
        builtTower.group.position.z
      );
      g.add(builtTower.group);
      segmentUpdaters.add(builtTower.update);
      disposables.push(() => {
        segmentUpdaters.delete(builtTower.update);
        builtTower.dispose();
      });
      const padGeo = new THREE.CircleGeometry(210, 36);
      geos.push(padGeo);
      const pad = new THREE.Mesh(padGeo, M.ground);
      pad.rotation.x = -PI / 2;
      pad.position.set(builtTower.group.position.x, GY - 0.02, builtTower.group.position.z);
      g.add(pad);
    }
    return g;
  }

  function portalParts(sp: number, o: number, geos: THREE.BufferGeometry[]): BuiltPart[] {
    const P = pose(sp, { x: 0, z: 0, h: 0 });
    const d = new THREE.Vector3(Math.cos(P.h), 0, Math.sin(P.h));
    const n = new THREE.Vector3(-Math.sin(P.h), 0, Math.cos(P.h));
    const up = new THREE.Vector3(0, 1, 0);
    const basis = new THREE.Matrix4().makeBasis(
      o > 0 ? n.clone().negate() : n,
      up,
      o > 0 ? d : d.clone().negate()
    );
    basis.setPosition(P.x, 0, P.z);
    const sh = new THREE.Shape();
    sh.moveTo(-60, GY);
    sh.lineTo(60, GY);
    sh.lineTo(60, 12);
    sh.lineTo(-60, 12);
    const hole = new THREE.Path();
    hole.moveTo(TW, 0);
    hole.lineTo(TW, TY);
    for (let i = 1; i <= 32; i++) {
      const t = (PI * i) / 32;
      hole.lineTo(TW * Math.cos(t), TY + TH * Math.sin(t));
    }
    hole.lineTo(-TW, 0);
    hole.lineTo(TW, 0);
    sh.holes.push(hole);
    const wall = new THREE.ShapeGeometry(sh);
    wall.applyMatrix4(basis);
    geos.push(wall);
    const out = new THREE.Group();
    out.add(new THREE.Mesh(wall, M.viaduct));
    const moundGeo = new THREE.BoxGeometry(120, 19, 60);
    geos.push(moundGeo);
    const mound = new THREE.Mesh(moundGeo, M.mound);
    mound.applyMatrix4(basis);
    mound.translateZ(-30.2);
    mound.translateY(2.5);
    out.add(mound);
    const pg = new THREE.PlaneGeometry(2 * TW, TY + TH);
    pg.translate(0, (TY + TH) / 2, -2.5);
    pg.applyMatrix4(basis);
    geos.push(pg);
    const plug = new THREE.Group();
    plug.add(new THREE.Mesh(pg, M.plug));
    return [
      { g: out, env: 'out' },
      { g: plug, env: 'plug' },
    ];
  }

  function buildSegment(
    t: { out: [number, number] | null; seine?: boolean; tower?: boolean; curve?: number },
    s0: number,
    s1: number,
    tunnelIndex?: number
  ): BuiltSegment {
    const geos: THREE.BufferGeometry[] = [];
    const parts: BuiltPart[] = [];
    const disposables: Array<() => void> = [];
    const inCurve = Boolean(t.curve && Math.abs(t.curve) > 0.05);
    if (!t.out) parts.push({ g: tunnelGroup(s0, s1, inCurve, geos, disposables), env: 'in' });
    else if (t.out[0] <= s0 + 0.01 && t.out[1] >= s1 - 0.01)
      parts.push({ g: viaductGroup(s0, s1, t, geos, disposables), env: 'out' });
    else if (t.out[0] <= s0 + 0.01) {
      parts.push({ g: viaductGroup(s0, t.out[1], t, geos, disposables), env: 'out' });
      parts.push({ g: tunnelGroup(t.out[1], s1, inCurve, geos, disposables), env: 'in' });
      for (const p of portalParts(t.out[1], -1, geos)) parts.push(p);
    } else {
      parts.push({ g: tunnelGroup(s0, t.out[0], inCurve, geos, disposables), env: 'in' });
      parts.push({ g: viaductGroup(t.out[0], s1, t, geos, disposables), env: 'out' });
      for (const p of portalParts(t.out[0], 1, geos)) parts.push(p);
    }

    return {
      parts,
      dispose() {
        for (const d of disposables) d();
        for (const x of geos) x.dispose();
      },
    };
  }

  function buildAirStation(name: string, k: number): { group: THREE.Group; dispose: () => void } {
    const g = new THREE.Group();
    const stnGeos: THREE.BufferGeometry[] = [];
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas(name));
    plaqueTex.wrapS = THREE.RepeatWrapping;
    plaqueTex.wrapT = THREE.RepeatWrapping;
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = maxAniso;
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      roughness: 0.18,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => g.add(new THREE.Mesh(geo, mat));
    add(STN.airDeck, M.viaduct);
    add(STN.platBody, M.platformFace);
    add(STN.platTop, M.slab);
    add(STN.edge, M.edge);
    addStationTrack(g, stnGeos, false, true);
    add(STN.airParapet, M.iron);
    add(STN.canopy, M.canopy);
    add(STN.cols, M.iron);
    add(STN.airLamps, M.lamp);
    add(STN.airPf, M.cream);
    add(STN.airPl, plaqueMat);
    add(STN.plinths, M.cream);
    STN.seats.forEach((p, i) => add(p, seatMats[i]));
    add(STN.airPiers, M.viaduct);
    add(STN.airGround, M.ground);
    const airSiel = new THREE.Group();
    airSiel.position.y = -0.35;
    airSiel.add(
      new THREE.Mesh(STN.sielBody, M.sielBody),
      new THREE.Mesh(STN.sielScreensPos, sielMatPos),
      new THREE.Mesh(STN.sielScreensNeg, sielMatNeg)
    );
    g.add(airSiel);
    const list: CityBlockSpec[] = [];
    const seed = hashStr(route.key) + k * 101;
    const P0 = { x: 0, z: 0, h: 0 };
    const hasBastilleColumn = route.open.bastilleColumn === name;
    const hasGrandeArche = route.open.grandeArche === name;
    for (let x = -110, n = 0; x <= 110; x += 26, n++) {
      [-1, 1].forEach((side) => {
        if (route.open.tower && side < 0 && (name === 'Passy' || name === 'Bir-Hakeim')) return;
        if (hasBastilleColumn && side < 0 && Math.abs(x) < 52) return;
        if (hasGrandeArche && side < 0 && Math.abs(x) < 75) return;
        const q = seed + n * 13 + side * 7;
        list.push({
          P: P0,
          along: x,
          lat: side * (30 + rnd(q) * 14),
          w: 20 + rnd(q + 1) * 5,
          h: 17 + rnd(q + 2) * 8,
          d: 14 + rnd(q + 3) * 8,
        });
      });
    }
    buildParisCityBlocks(
      g,
      list,
      makeCityMats(),
      { unitBox, mansardUnit: mansardUnitGeo },
      stnGeos,
      isMobileGpu
    );
    if (hasBastilleColumn) {
      const col = buildBastilleColumn(stnGeos, makeLandmarkMats(), isMobileGpu);
      col.position.set(0, GY, -42);
      g.add(col);
    }
    if (hasGrandeArche) {
      const arche = buildGrandeArche(stnGeos, makeLandmarkMats(), isMobileGpu);
      arche.position.set(-18, GY, -125);
      arche.rotation.y = 0.22;
      g.add(arche);
    }
    return {
      group: g,
      dispose() {
        plaqueTex.dispose();
        plaqueMat.dispose();
        for (const sg of stnGeos) sg.dispose();
      },
    };
  }

  function buildStation(
    name: string,
    stationSc: number
  ): { group: THREE.Group; dispose: () => void } {
    const g = new THREE.Group();
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas(name));
    plaqueTex.wrapS = THREE.RepeatWrapping;
    plaqueTex.wrapT = THREE.RepeatWrapping;
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = maxAniso;
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      roughness: 0.18,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => g.add(new THREE.Mesh(geo, mat));
    const archetype = resolveStationArchetype(name, route.num);
    const vaultMat =
      archetype === 'arts_et_metiers'
        ? archMats.copperVault
        : archetype === 'louvre_rivoli'
          ? archMats.stoneVault
          : archetype === 'cite'
            ? archMats.citeVault
            : archetype === 'cathedral'
              ? archMats.cathedralVault
              : M.tile;
    const archGeos: THREE.BufferGeometry[] = [];
    add(STN.vault, vaultMat);
    add(STN.portal, vaultMat);
    addArchetypeDecorations(g, archetype, archMats, archGeos, name);
    add(STN.platBody, M.platformFace);
    add(STN.platTop, M.slab);
    add(STN.edge, M.edge);
    add(STN.bed, M.bed);
    addStationTrack(g, archGeos, true, false);
    add(STN.frames, M.frame);
    STN.posters.forEach((p, i) => add(p, posterMats[i]));
    // Cadres d'affiches en faïence céramique moulurée
    add(STN.pframes, archetype === 'faience' ? M.friezeCeramique : M.cream);
    add(STN.plaques, plaqueMat);
    if (badgeMat) add(STN.badges, badgeMat);
    add(STN.plinths, M.cream);
    STN.seats.forEach((p, i) => add(p, seatMats[i]));
    add(STN.hous, M.housing);
    add(STN.diff, M.lamp);
    add(STN.rods, M.housing);
    add(STN.signs, signMat);
    add(STN.sframes, M.housing);
    add(STN.frieze, M.frieze);
    add(STN.sielBody, M.sielBody);
    add(STN.sielScreensPos, sielMatPos);
    add(STN.sielScreensNeg, sielMatNeg);

    // Frise céramique 1900 à losanges sur les voûtes en faïence
    if (archetype === 'faience') {
      const friezeGeo = new THREE.PlaneGeometry(82, 0.28);
      archGeos.push(friezeGeo);
      [-1, 1].forEach((side) => {
        const strip = new THREE.Mesh(friezeGeo, M.friezeCeramique);
        strip.position.set(0, 3.65, side * 6.58);
        if (side > 0) strip.rotation.y = PI;
        g.add(strip);
      });
    }

    // Bande d'éveil podotactile en relief le long des deux quais + caissons « SORTIE » lumineux
    const tactileGeo = new THREE.BoxGeometry(84, 0.016, 0.24);
    const sortieGeo = new THREE.BoxGeometry(0.14, 0.44, 1.15);
    archGeos.push(tactileGeo, sortieGeo);
    [-1, 1].forEach((side) => {
      const band = new THREE.Mesh(tactileGeo, M.tactileBand);
      band.position.set(0, 1.072, side * 3.34);
      g.add(band);
      [-34, 34].forEach((sx) => {
        const sign = new THREE.Mesh(sortieGeo, M.sortieSign);
        sign.position.set(sx, 3.42, side * 4.75);
        g.add(sign);
      });
    });

    const psdGroup = new THREE.Group();
    psdGroup.add(new THREE.Mesh(STN.psdPosts, M.psdFrame));
    psdGroup.add(new THREE.Mesh(STN.psdFixedGlass, M.psdGlass));
    const psdLeaves: Array<{ mesh: THREE.Mesh; base: number; dir: number; side: number }> = [];
    psdDoorCenters.forEach(({ x, z, side }) => {
      [
        [x - 0.33, -1],
        [x + 0.33, 1],
      ].forEach(([base, dir]) => {
        const m = new THREE.Mesh(STN.psdLeaf, M.psdGlass);
        m.position.set(base, 0, z);
        psdGroup.add(m);
        psdLeaves.push({ mesh: m, base, dir, side });
      });
    });
    psdGroup.visible = activeStock.hasPsd && !spragueMode;
    g.add(psdGroup);
    const psdEntry = { sc: stationSc, group: psdGroup, leaves: psdLeaves };
    stationPsds.add(psdEntry);

    return {
      group: g,
      dispose() {
        stationPsds.delete(psdEntry);
        plaqueTex.dispose();
        plaqueMat.dispose();
        for (const ag of archGeos) ag.dispose();
      },
    };
  }

  const built = new Map<string, BuiltSegment>();
  function want(lo: number, hi: number) {
    const keys = new Set<string>();
    for (let k = Math.max(0, lo); k <= Math.min(stations.length - 1, hi); k++) keys.add(`s${k}`);
    for (let j = Math.max(0, lo - 1); j <= Math.min(tunnels.length - 1, hi); j++) keys.add(`t${j}`);
    if (lo <= 0) keys.add('ta');
    if (hi >= stations.length - 1) keys.add('tb');
    return keys;
  }

  function makePiece(key: string): BuiltSegment {
    if (key[0] === 's') {
      const k = +key.slice(1);
      const st = stations[k];
      const o = st.air ? buildAirStation(st.name, k) : buildStation(st.name, st.sc);
      const P = pose(st.sc, { x: 0, z: 0, h: 0 });
      o.group.position.set(P.x, 0, P.z);
      o.group.rotation.y = -P.h;
      return { parts: [{ g: o.group, env: st.air ? 'out' : 'in' }], dispose: o.dispose };
    }
    if (key === 'ta') return buildSegment(tailA, tailA.s0, tailA.s1);
    if (key === 'tb') return buildSegment(tailB, tailB.s0, tailB.s1);
    const tunnelIdx = +key.slice(1);
    const t = tunnels[tunnelIdx];
    return buildSegment(t, t.s0, t.s1, tunnelIdx);
  }

  function stream(lo: number, hi: number, limit: number): boolean {
    const keys = want(lo, hi);
    built.forEach((o, k) => {
      if (!keys.has(k)) {
        o.parts.forEach((p) => scene.remove(p.g));
        o.dispose();
        built.delete(k);
      }
    });
    let n = 0;
    let remaining = 0;
    keys.forEach((k) => {
      if (!built.has(k)) {
        if (n < limit) {
          const o = makePiece(k);
          o.parts.forEach((p) => scene.add(p.g));
          built.set(k, o);
          n++;
        } else {
          remaining++;
        }
      }
    });
    return remaining > 0;
  }

  let lastStreamLo = Number.NaN;
  let lastStreamHi = Number.NaN;
  let streamPending = true;
  let lastLightStation = -1;
  let lastCamEnv: 'in' | 'out' | 'edge' | null = null;

  function clearAll() {
    towerWorldPos = null;
    segmentUpdaters.clear();
    signalUpdaters.clear();
    lastStreamLo = Number.NaN;
    lastStreamHi = Number.NaN;
    streamPending = true;
    lastLightStation = -1;
    lastCamEnv = null;
    built.forEach((o) => {
      o.parts.forEach((p) => scene.remove(p.g));
      o.dispose();
    });
    built.clear();
  }

  const FOG_IN = new THREE.Color(0x0c0a08);
  const FOG_OUT_DAY = new THREE.Color(0xc3cbd0);
  const FOG_OUT_SUNSET = new THREE.Color(0xd29770);
  const FOG_OUT_NIGHT = new THREE.Color(0x0d1528);
  const HEMI_DAY_SKY = new THREE.Color(0xfff1dc);
  const HEMI_SUNSET_SKY = new THREE.Color(0xffcaa0);
  const HEMI_NIGHT_SKY = new THREE.Color(0x3a5182);
  const HEMI_DAY_GND = new THREE.Color(0x3a2c1e);
  const HEMI_SUNSET_GND = new THREE.Color(0x3d2433);
  const HEMI_NIGHT_GND = new THREE.Color(0x161b29);
  let camEnv: 'in' | 'out' | 'edge' = 'in';
  let openMix = 0;

  function setTimeOfDay(next: ParisTimeOfDay) {
    timeOfDay = next;
    skyCtrl.setMood(next);
    if (next === 'night') {
      M.towerGlass.emissiveIntensity = 1.85;
      M.cabinLit.emissiveIntensity = 1.45;
      M.building.emissive.setHex(0x1b140b);
      M.buildingOchre.emissive.setHex(0x1d140a);
      M.buildingModern.emissive.setHex(0x141b24);
    } else if (next === 'sunset') {
      M.towerGlass.emissiveIntensity = 1.15;
      M.cabinLit.emissiveIntensity = 0.85;
      M.building.emissive.setHex(0x0b0704);
      M.buildingOchre.emissive.setHex(0x0c0804);
      M.buildingModern.emissive.setHex(0x06080b);
    } else {
      M.towerGlass.emissiveIntensity = 0.75;
      M.cabinLit.emissiveIntensity = 0.45;
      M.building.emissive.setHex(0x000000);
      M.buildingOchre.emissive.setHex(0x000000);
      M.buildingModern.emissive.setHex(0x000000);
    }
    applyEnv(tr.s, 1);
    updateHud();
  }

  function applyEnv(cs: number, dt: number) {
    const open = isOpen(cs);
    const near = portalDist(cs) < 150;
    camEnv = near ? 'edge' : open ? 'out' : 'in';
    built.forEach((o) =>
      o.parts.forEach((p) => {
        p.g.visible =
          p.env === 'in' ? camEnv !== 'out' : p.env === 'out' ? camEnv !== 'in' : camEnv === 'out';
      })
    );
    const target = open ? 1 : near ? 0.25 * (1 - portalDist(cs) / 150) : 0;
    openMix += (target - openMix) * Math.min(1, dt * 2.5);
    const o = openMix;
    const outFog =
      timeOfDay === 'night' ? FOG_OUT_NIGHT : timeOfDay === 'sunset' ? FOG_OUT_SUNSET : FOG_OUT_DAY;
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(FOG_IN).lerp(outFog, o);
      const outDensity =
        timeOfDay === 'night' ? 0.00085 : timeOfDay === 'sunset' ? 0.00068 : 0.00055;
      scene.fog.density = 0.0085 + (outDensity - 0.0085) * o;
    }
    if (timeOfDay === 'night') {
      sun.color.setHex(0x7c9ad8);
      sun.intensity = 0.36 * o;
      hemi.color.copy(HEMI_DAY_SKY).lerp(HEMI_NIGHT_SKY, o);
      hemi.groundColor.copy(HEMI_DAY_GND).lerp(HEMI_NIGHT_GND, o);
      hemi.intensity = 0.42 + 0.16 * o;
      sun.position.set(camera.position.x - 120, camera.position.y + 165, camera.position.z + 60);
    } else if (timeOfDay === 'sunset') {
      sun.color.setHex(0xff9c54);
      sun.intensity = 1.65 * o;
      hemi.color.copy(HEMI_DAY_SKY).lerp(HEMI_SUNSET_SKY, o);
      hemi.groundColor.copy(HEMI_DAY_GND).lerp(HEMI_SUNSET_GND, o);
      hemi.intensity = 0.42 + 0.45 * o;
      sun.position.set(camera.position.x - 210, camera.position.y + 72, camera.position.z + 90);
    } else {
      sun.color.setHex(0xfff3e0);
      sun.intensity = 1.9 * o;
      hemi.color.copy(HEMI_DAY_SKY);
      hemi.groundColor.copy(HEMI_DAY_GND);
      hemi.intensity = 0.42 + 0.6 * o;
      sun.position.set(camera.position.x + 120, camera.position.y + 220, camera.position.z + 60);
    }
    sky.visible = camEnv !== 'in';
    sky.position.copy(camera.position);
    sun.target.position.copy(camera.position);
  }

  const lightPool = [-50, -30, -10, 10, 30, 50].map((x) => {
    const l = new THREE.PointLight(0xffe9cc, 1.35, 34, 1.5);
    scene.add(l);
    return { l, x };
  });

  function placeLights(k: number) {
    const P = pose(stations[k].sc, { x: 0, z: 0, h: 0 });
    lightPool.forEach((o) => toWorld(P, o.x, 5.2, 0, o.l.position));
  }

  /* ---------- The Trains (Primary + Crossing Opposite-Direction Consist) ---------- */
  type TrainCarEntry = { outer: THREE.Group; inner: THREE.Group; glbSlot: THREE.Group };
  interface SimTrainUnit {
    cars: TrainCarEntry[];
    gangways: THREE.Mesh[];
    s: number;
    dir: 1 | -1;
    v: number;
    state: 'dwell' | 'run';
    dwell: number;
    door: number;
    wheel: number;
    time: number;
    cur: number;
    target: { type: 'stn' | 'turn'; k?: number; front: number } | null;
    destMat: THREE.MeshBasicMaterial;
  }

  const headlightBeams: THREE.Mesh[] = [];

  function makeTrainUnitState(): SimTrainUnit {
    return {
      cars: [],
      gangways: [],
      s: 0,
      dir: 1,
      v: 0,
      state: 'dwell',
      dwell: 0,
      door: 0,
      wheel: 0,
      time: 0,
      cur: 0,
      target: null,
      destMat: trackMat(new THREE.MeshBasicMaterial({})),
    };
  }

  const tr = makeTrainUnitState();
  const counterTr = makeTrainUnitState();

  let disposed = false;
  let activeGlbKey = '';
  let activeGlbReady = false;
  const rideKtx2Loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
  const rideGlbLoader = new GLTFLoader();
  rideGlbLoader.setMeshoptDecoder(MeshoptDecoder);
  rideGlbLoader.setKTX2Loader(rideKtx2Loader);
  const rideGlbCache = new Map<string, Promise<{ cab: THREE.Group; car: THREE.Group }>>();

  function normalizeRideGlb(group: THREE.Group) {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        const std = mat as THREE.MeshStandardMaterial;
        if (std.map) {
          std.map.colorSpace = THREE.SRGBColorSpace;
          if (std.name?.startsWith('PaletteMaterial')) {
            std.map.magFilter = THREE.NearestFilter;
            std.map.minFilter = THREE.NearestFilter;
            std.map.generateMipmaps = false;
          }
          std.map.needsUpdate = true;
        }
        if (std.name?.toLowerCase().includes('vitre')) {
          std.transparent = true;
          std.opacity = std.opacity < 1 ? std.opacity : 0.32;
          std.depthWrite = false;
        }
        std.needsUpdate = true;
      }
    });
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.position.x -= center.x;
    group.position.z -= center.z;
    group.position.y -= box.min.y;
  }

  function loadSingleRideGlb(url: string): Promise<THREE.Group> {
    const sep = url.includes('?') ? '&' : '?';
    return new Promise((resolve, reject) => {
      rideGlbLoader.load(
        `${url}${sep}v=7`,
        (gltf) => {
          normalizeRideGlb(gltf.scene);
          resolve(gltf.scene);
        },
        undefined,
        reject
      );
    });
  }

  function loadLineGlbsIntoSlots(lineNum: string) {
    const { cab, car } = customStockGlb ?? getLibraryGlbUrlsForLine(lineNum);
    const key = `${cab}|${car}`;
    if (activeGlbKey === key && activeGlbReady) {
      syncCarVisibility(view);
      return;
    }
    activeGlbKey = key;
    activeGlbReady = false;
    syncCarVisibility(view);

    let promise = rideGlbCache.get(key);
    if (!promise) {
      promise = Promise.all([loadSingleRideGlb(cab), loadSingleRideGlb(car)]).then(
        ([cabScene, carScene]) => ({ cab: cabScene, car: carScene })
      );
      rideGlbCache.set(key, promise);
    }

    promise
      .then(({ cab: cabScene, car: carScene }) => {
        if (disposed || activeGlbKey !== key) return;
        for (const unit of [tr, counterTr]) {
          unit.cars.forEach((c, idx) => {
            while (c.glbSlot.children.length > 0) {
              c.glbSlot.remove(c.glbSlot.children[0]);
            }
            if (idx === 0) {
              c.glbSlot.add(cabScene.clone());
            } else if (idx === unit.cars.length - 1) {
              const tail = cabScene.clone();
              tail.rotation.y = Math.PI;
              c.glbSlot.add(tail);
            } else {
              c.glbSlot.add(carScene.clone());
            }
          });
        }
        activeGlbReady = true;
        syncCarVisibility(view);
      })
      .catch(() => {
        if (!disposed && activeGlbKey === key) {
          activeGlbReady = false;
          syncCarVisibility(view);
        }
      });
  }

  let lastTrDoorOpen: boolean | null = null;
  let lastCounterDoorOpen: boolean | null = null;

  function syncCarVisibility(v: 'vault' | 'ride' | 'passenger') {
    lastTrDoorOpen = tr.door > 0.02;
    lastCounterDoorOpen = counterTr.door > 0.02;
    for (const unit of [tr, counterTr]) {
      const useGlbForUnit = activeGlbReady && !spragueMode && unit.door <= 0.02;
      unit.cars.forEach((c, idx) => {
        const keepInnerForView =
          unit === tr && ((v === 'ride' && idx === 0) || (v === 'passenger' && idx === 1));
        const showGlb = useGlbForUnit && !keepInnerForView;
        c.glbSlot.visible = showGlb;
        c.inner.visible = !showGlb;
      });
    }
  }

  const cabPupitreGroup = new THREE.Group();
  const vueVoieGroup = new THREE.Group();
  const leverPivot = new THREE.Group();
  let cabWiperPivot: THREE.Group | null = null;
  const cabDoorLampMat = trackMat(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 2.2, 0.75) })
  );
  const cabKvbLampMat = trackMat(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.2, 0.15) })
  );
  const cabNotchLampMat = trackMat(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.9, 0.9) })
  );
  const cabSpotLights: THREE.SpotLight[] = [];
  const speedoCanvasEl = makeCanvas(512, 256);
  const speedoTex = new THREE.CanvasTexture(speedoCanvasEl);
  speedoTex.colorSpace = THREE.SRGBColorSpace;
  speedoTex.anisotropy = maxAniso;
  const speedoMat = trackMat(new THREE.MeshBasicMaterial({ map: speedoTex }));
  const camLocal = new THREE.Vector3(L / 2 - 1.0, BY + 1.62, 0.5);
  const lookLocal = new THREE.Vector3(L / 2 + 30, BY + 1.2, 0.5);

  function populateTrainConsist(unit: SimTrainUnit, withCabInterior: boolean) {
    const cls = [0, 0, 1, 0, 0];
    for (let i = 0; i < NC; i++) {
      const inner = buildCar(
        cls[i] ? M.paintRed : M.paintGreen,
        i === 0,
        i === NC - 1,
        Boolean(cls[i])
      );
      inner.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.frustumCulled = false;
      });
      inner.position.x = -L / 2;
      const glbSlot = new THREE.Group();
      glbSlot.position.y = 0.05;
      glbSlot.visible = false;
      const outer = new THREE.Group();
      outer.rotation.order = 'YXZ';
      outer.add(inner);
      outer.add(glbSlot);
      if (i < NC - 1) {
        const gw = new THREE.Mesh(G.gangway, M.rubber);
        gw.position.x = -L / 2 - GAP / 2;
        outer.add(gw);
        unit.gangways.push(gw);
      }
      scene.add(outer);
      unit.cars.push({ outer, inner, glbSlot });
    }
    const front = unit.cars[0].inner;
    const rear = unit.cars[NC - 1].inner;
    const headGeo = trackGeo(new THREE.SphereGeometry(0.085, 16, 10));
    const ringGeo = trackGeo(new THREE.TorusGeometry(0.1, 0.018, 8, 20));
    const tailGeo = trackGeo(new THREE.SphereGeometry(0.07, 14, 8));
    [-0.8, 0.8].forEach((z) => {
      const h = new THREE.Mesh(headGeo, M.head);
      h.position.set(L + 0.01, BY + 0.42, z);
      front.add(h);
      const ring = new THREE.Mesh(ringGeo, M.chrome);
      ring.rotation.y = PI / 2;
      ring.position.set(L + 0.01, BY + 0.42, z);
      front.add(ring);
      const t = new THREE.Mesh(tailGeo, M.tail);
      t.position.set(-0.01, BY + 0.42, z);
      rear.add(t);
    });
    const dpGeo = trackGeo(new THREE.PlaneGeometry(1.0, 0.19));
    const dp = new THREE.Mesh(dpGeo, unit.destMat);
    dp.rotation.y = PI / 2;
    dp.position.set(L + 0.003, BY + 1.97, 0);
    front.add(dp);

    if (!withCabInterior) {
      const counterGlow = new THREE.PointLight(0xffe0b0, 0.6, 10, 1.6);
      counterGlow.position.set(0, 2.3, 0);
      unit.cars[2].outer.add(counterGlow);
      return;
    }

    // Driver pupitre console (for driven RATP/IDFM rolling stock & Sprague 1930)
    const deskBase = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.62, 0.82, CW - 0.34)),
      M.cabDash
    );
    deskBase.position.set(L - 0.34, BY + 0.43, 0);
    cabPupitreGroup.add(deskBase);

    const deskTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 0.1, CW - 0.3)), M.cabDash);
    deskTop.position.set(L - 0.38, BY + 0.9, 0);
    deskTop.rotation.z = 0.36;
    cabPupitreGroup.add(deskTop);

    const binnacle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.2, 0.5)), M.cabDash);
    binnacle.position.set(L - 0.26, BY + 0.96, -0.44);
    binnacle.rotation.z = 0.22;
    cabPupitreGroup.add(binnacle);

    const screenMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.42, 0.21)), speedoMat);
    screenMesh.position.set(L - 0.44, BY + 1.0, -0.44);
    screenMesh.rotation.order = 'YXZ';
    screenMesh.rotation.y = -PI / 2;
    screenMesh.rotation.x = -0.34;
    cabPupitreGroup.add(screenMesh);

    const screenBezel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 0.23, 0.45)), M.chrome);
    screenBezel.position.set(L - 0.42, BY + 0.995, -0.44);
    screenBezel.rotation.z = -0.34;
    cabPupitreGroup.add(screenBezel);

    const kvbBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.06, 0.22)), M.cabYellow);
    kvbBar.position.set(L - 0.3, BY + 0.97, -0.06);
    cabPupitreGroup.add(kvbBar);

    const emergencyBtn = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 16)),
      M.cabButtonRed
    );
    emergencyBtn.position.set(L - 0.44, BY + 0.95, 0.26);
    cabPupitreGroup.add(emergencyBtn);

    // Socle cranté du manipulateur Traction / Freinage + barre LED d'effort
    const quadrantPlate = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.24, 0.03, 0.14)),
      M.housing
    );
    quadrantPlate.position.set(L - 0.48, BY + 0.935, 0.08);
    quadrantPlate.rotation.z = 0.26;
    cabPupitreGroup.add(quadrantPlate);

    const notchStrip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.18, 0.015, 0.025)),
      cabNotchLampMat
    );
    notchStrip.position.set(L - 0.48, BY + 0.955, 0.01);
    notchStrip.rotation.z = 0.26;
    cabPupitreGroup.add(notchStrip);

    leverPivot.position.set(L - 0.48, BY + 0.94, 0.08);
    const leverStem = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10)),
      M.chrome
    );
    leverStem.position.y = 0.1;
    const leverKnob = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10)),
      M.cabDash
    );
    leverKnob.rotation.x = PI / 2;
    leverKnob.position.y = 0.2;
    leverPivot.add(leverStem, leverKnob);
    cabPupitreGroup.add(leverPivot);

    // Essuie-glace avant pivotant (actif sur viaduc)
    cabWiperPivot = new THREE.Group();
    cabWiperPivot.position.set(L - 0.03, BY + 1.05, -0.52);
    const wiperArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.016, 0.58, 0.022)), M.housing);
    wiperArm.position.y = 0.28;
    cabWiperPivot.add(wiperArm);
    cabPupitreGroup.add(cabWiperPivot);

    // Pare-soleil supérieur de cabine + voyants Portes / KVB
    const sunVisor = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.28, 0.025, CW - 0.34)),
      M.cabDash
    );
    sunVisor.position.set(L - 0.16, BY + 1.9, 0);
    sunVisor.rotation.z = -0.18;
    cabPupitreGroup.add(sunVisor);

    // Enrichissement tableau de bord 3D : écran auxiliaire, rampe LED HDR, manomètres et montants
    const auxScreen = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.28, 0.16)), sielMatPos);
    auxScreen.position.set(L - 0.44, BY + 0.99, 0.42);
    auxScreen.rotation.order = 'YXZ';
    auxScreen.rotation.y = -PI / 2;
    auxScreen.rotation.x = -0.34;
    cabPupitreGroup.add(auxScreen);

    const doorLampMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.035, 0.022, 0.055)),
      cabDoorLampMat
    );
    doorLampMesh.position.set(L - 0.34, BY + 1.03, -0.2);
    const kvbLampMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.035, 0.022, 0.055)),
      cabKvbLampMat
    );
    kvbLampMesh.position.set(L - 0.34, BY + 1.03, -0.11);
    cabPupitreGroup.add(doorLampMesh, kvbLampMesh);

    const ledGeo = trackGeo(new THREE.SphereGeometry(0.014, 8, 6));
    [
      { z: -0.03, mat: M.signalGreen },
      { z: 0.02, mat: M.headlightLed },
    ].forEach(({ z, mat }) => {
      const led = new THREE.Mesh(ledGeo, mat);
      led.position.set(L - 0.34, BY + 1.03, z);
      cabPupitreGroup.add(led);
    });

    [-0.74, -0.88].forEach((gz) => {
      const gaugeRim = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 16)),
        M.chrome
      );
      gaugeRim.rotation.z = PI / 2 - 0.34;
      gaugeRim.position.set(L - 0.42, BY + 0.97, gz);
      cabPupitreGroup.add(gaugeRim);
    });

    const pillarGeo = trackGeo(new THREE.BoxGeometry(0.08, 1.15, 0.07));
    [-1.08, 1.08].forEach((pz) => {
      const pillar = new THREE.Mesh(pillarGeo, M.housing);
      pillar.position.set(L - 0.08, BY + 1.46, pz);
      cabPupitreGroup.add(pillar);
    });

    front.add(cabPupitreGroup);

    // Panoramic stainless hand-rail + compact telemetry pod for automatic driverless trains (L1/L4/L14)
    const railPostL = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.96, 12)),
      M.chrome
    );
    railPostL.position.set(L - 0.24, BY + 0.48, -0.82);
    const railPostR = railPostL.clone();
    railPostR.position.z = 0.82;
    const railTop = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.026, 0.026, 1.7, 12)),
      M.chrome
    );
    railTop.rotation.x = PI / 2;
    railTop.position.set(L - 0.24, BY + 0.96, 0);
    const autoPod = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.3, 0.56)), M.cabDash);
    autoPod.position.set(L - 0.2, BY + 0.82, 0);
    vueVoieGroup.add(railPostL, railPostR, railTop, autoPod);
    vueVoieGroup.visible = false;
    front.add(vueVoieGroup);

    const fo = unit.cars[0].outer;
    const spot = new THREE.SpotLight(0xfff0d2, isMobileGpu ? 3.0 : 5.2, 110, 0.56, 0.58, 1);
    spot.position.set(L / 2 + 0.2, BY + 0.6, 0);
    const tgt = new THREE.Object3D();
    tgt.position.set(L / 2 + 38, 0.4, 0);
    fo.add(spot);
    fo.add(tgt);
    spot.target = tgt;
    if (withCabInterior) cabSpotLights.push(spot);

    // Cônes volumétriques légers devant les deux phares avant (visibles en tunnel)
    if (withCabInterior) {
      const beamGeo = trackGeo(new THREE.ConeGeometry(1.55, 16, 16, 1, true));
      beamGeo.rotateZ(PI / 2);
      beamGeo.translate(8, 0, 0);
      [-0.72, 0.72].forEach((zOff) => {
        const beam = new THREE.Mesh(beamGeo, M.headlightBeam);
        beam.position.set(L / 2 + 0.15, BY + 0.42, zOff);
        fo.add(beam);
        headlightBeams.push(beam);
      });
    }

    const glow = new THREE.PointLight(0xffd9a0, 0.75, 12, 1.6);
    glow.position.set(0, 2.4, 2.0);
    unit.cars[2].outer.add(glow);
  }

  populateTrainConsist(tr, true);
  populateTrainConsist(counterTr, false);

  function applyStockVisuals() {
    activeStock = resolveParisStockSpec(route.num, spragueMode);
    loadLineGlbsIntoSlots(route.num);
    M.paintGreen.color.setHex(activeStock.bodyHex);
    M.paintRed.color.setHex(spragueMode ? 0x7e1f1d : activeStock.bodyHex);
    M.stripe.color.setHex(activeStock.stripeHex);
    M.roof.color.setHex(activeStock.roofHex);
    M.floor.color.setHex(activeStock.floorHex);
    M.interiorSeat.color.setHex(activeStock.seatHex);
    M.interiorLining.color.setHex(activeStock.liningHex);
    M.ceiling.color.setRGB(
      activeStock.ceilingTint[0],
      activeStock.ceilingTint[1],
      activeStock.ceilingTint[2]
    );
    M.frieze.color.set(route.bg);

    const autoMode = activeStock.driverless && !spragueMode;
    const showBoa = activeStock.boa && !spragueMode;
    const isPneuLine = ['1', '4', '6', '11', '14'].includes(route.num) && !spragueMode;
    for (const unit of [tr, counterTr]) {
      unit.cars.forEach((c) => {
        const ud = c.inner.userData as {
          rearClassic?: THREE.Mesh | null;
          rearAuto?: THREE.Mesh | null;
          frontClassic?: THREE.Mesh | null;
          frontAuto?: THREE.Mesh | null;
          rearGlass?: THREE.Mesh | null;
          rearGlassAuto?: THREE.Mesh | null;
          frontGlass?: THREE.Mesh | null;
          frontGlassAuto?: THREE.Mesh | null;
          pneuBogies?: THREE.Mesh[];
          frontMasks?: THREE.Mesh[];
          classBadges?: THREE.Mesh[];
        };
        if (ud.rearClassic) ud.rearClassic.visible = !autoMode;
        if (ud.rearAuto) ud.rearAuto.visible = autoMode;
        if (ud.frontClassic) ud.frontClassic.visible = !autoMode;
        if (ud.frontAuto) ud.frontAuto.visible = autoMode;
        if (ud.rearGlass) ud.rearGlass.visible = !autoMode;
        if (ud.rearGlassAuto) ud.rearGlassAuto.visible = autoMode;
        if (ud.frontGlass) ud.frontGlass.visible = !autoMode;
        if (ud.frontGlassAuto) ud.frontGlassAuto.visible = autoMode;
        ud.pneuBogies?.forEach((pb) => {
          pb.visible = isPneuLine;
        });
        ud.frontMasks?.forEach((fm) => {
          fm.visible = !spragueMode;
        });
        ud.classBadges?.forEach((b) => {
          b.visible = spragueMode;
        });
      });
      unit.gangways.forEach((gw) => {
        gw.visible = showBoa;
      });
    }
    cabPupitreGroup.visible = !autoMode || drivingMode;
    vueVoieGroup.visible = autoMode && !drivingMode;

    if (autoMode && !drivingMode) {
      camLocal.set(L / 2 - 1.18, BY + 1.56, 0);
      lookLocal.set(L / 2 + 16, BY + 0.88, 0);
    } else if (spragueMode) {
      camLocal.set(L / 2 - 1.28, BY + 1.58, -0.34);
      lookLocal.set(L / 2 + 16, BY + 0.88, -0.22);
    } else {
      camLocal.set(L / 2 - 1.38, BY + 1.56, autoMode ? 0 : -0.32);
      lookLocal.set(L / 2 + 16, BY + 0.86, autoMode ? 0 : -0.18);
    }

    stationPsds.forEach((psd) => {
      psd.group.visible = activeStock.hasPsd && !spragueMode;
    });
    syncCarVisibility(view);
  }

  let destTex: THREE.CanvasTexture | null = null;
  let counterDestTex: THREE.CanvasTexture | null = null;
  function updateDestTexFor(
    unit: SimTrainUnit,
    prevTex: THREE.CanvasTexture | null
  ): THREE.CanvasTexture {
    const name = unit.dir > 0 ? stations[stations.length - 1].name : stations[0].name;
    if (prevTex) prevTex.dispose();
    const tex = new THREE.CanvasTexture(destCanvas(name.toUpperCase()));
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    unit.destMat.map = tex;
    unit.destMat.needsUpdate = true;
    return tex;
  }
  function setDest() {
    destTex = updateDestTexFor(tr, destTex);
    counterDestTex = updateDestTexFor(counterTr, counterDestTex);
  }

  const A_BRAKE = 1.55;
  const ACC = 1.15;
  const VMAX = 16;
  const DWELL = 10;

  function serves(k: number, d: number) {
    const f = stations[k].flag;
    return d > 0 ? f !== 'b' : f !== 'f';
  }

  function nextFrom(cur: number, dir: number): { type: 'stn' | 'turn'; k?: number; front: number } {
    const N = stations.length;
    if (dir > 0) {
      for (let k = cur + 1; k < N; k++) {
        if (serves(k, 1)) return { type: 'stn', k, front: stations[k].sc + TRAIN_LEN / 2 };
      }
      return { type: 'turn', front: tailB.s0 + TAIL - 20 };
    }
    for (let k = cur - 1; k >= 0; k--) {
      if (serves(k, -1)) return { type: 'stn', k, front: stations[k].sc - TRAIN_LEN / 2 };
    }
    return { type: 'turn', front: tailA.s1 - TAIL + 20 };
  }

  function planNextFor(unit: SimTrainUnit) {
    unit.target = nextFrom(unit.cur, unit.dir);
  }

  function planNext() {
    planNextFor(tr);
  }

  let view: 'vault' | 'ride' | 'passenger' = options.initialView ?? 'ride';
  let paused = false;
  let speed = 1;
  let focusKey = '';
  let veilTimeout: ReturnType<typeof setTimeout> | null = null;
  let cabYaw = 0;
  let cabPitch = 0;
  let eiffelGlance = false;

  let liveMode = false;
  let liveActive = false;
  let liveTargetTrainId: string | null = options.initialTrainId ?? null;
  let latestLiveTrain: TrainMarker | null = null;
  let liveLegKey = '';

  let drivingMode = false;
  let driveNotch: DriveNotch = 0;
  let kvbStatus: KvbStatus = 'ok';
  let kvbBrakeLatched = false;
  let highBeam = true;
  let manualDoorTarget: 0 | 1 = 0;
  let distToStopM: number | null = null;
  let currentLimitKmh = 70;
  let doorAllowed = false;
  let tractionBlocked = false;
  let prevManualV = 0;
  let stopBanner: {
    label: string;
    detail: string;
    tone: 'ok' | 'good' | 'warn';
    untilMs: number;
  } | null = null;

  let prevManualAccel = 0;
  let currentSignalAspect: SignalAspect = 'VL';
  let currentTivKmh: number | null = null;
  let prevSignalAspect: SignalAspect = 'VL';
  const BOARDING_DURATION_SEC = 4.2;
  const BUZZER_LEAD_SEC = 1.1;
  let boardingElapsedSec = 0;
  let doorCloseCountdownSec = 0;

  type QuaiCameraPreset = 'head' | 'mid' | 'tail' | 'overpass';
  let quaiCamera: QuaiCameraPreset = 'head';
  let quaiSide: 1 | -1 = 1;

  function setDriveNotch(next: DriveNotch) {
    if (next === driveNotch) return;
    driveNotch = next;
    synthAudio.triggerNotchClick(next === -4);
    updateHud();
  }

  function maybeAnnounceAsva(
    target: { type: 'stn' | 'turn'; k?: number; front: number } | null,
    distM: number,
    speedMps: number
  ) {
    if (!audioEnabled || paused || view === 'vault') return;
    if (!target || target.type !== 'stn' || target.k === undefined) return;
    const st = stations[target.k];
    if (!st) return;
    const isTerminus = target.k === 0 || target.k === stations.length - 1;
    if (distM >= 70 && distM <= 195 && speedMps > 2.2) {
      asva.announceApproach(st.name, {
        isTerminus,
        onChime: () => synthAudio.triggerAsvaChime(),
      });
    } else if (distM >= -8 && distM <= 22 && (speedMps > 0.3 || tr.state === 'dwell')) {
      asva.announceArrival(st.name, { isTerminus });
    }
  }

  function repositionCounterTrainNear(anchorIdx: number) {
    const cDir: 1 | -1 = tr.dir > 0 ? -1 : 1;
    if (stations.length < 2) return;
    const clampedIdx = Math.max(0, Math.min(stations.length - 1, anchorIdx));
    const anchorSt = stations[clampedIdx];
    const altIdx = Math.max(0, Math.min(stations.length - 1, clampedIdx + tr.dir));
    const fromIdx = altIdx === clampedIdx ? (clampedIdx > 0 ? clampedIdx - 1 : 1) : altIdx;
    const aheadOfTarget = (stations[fromIdx].sc - anchorSt.sc) * cDir < 0;
    if (aheadOfTarget) {
      const span = Math.abs(stations[fromIdx].sc - anchorSt.sc);
      const cStartS = anchorSt.sc - cDir * Math.min(135, span * 0.45 + 45);
      Object.assign(counterTr, {
        dir: cDir,
        cur: fromIdx,
        v: 11.5,
        state: 'run' as const,
        dwell: 0,
        door: 0,
        s: cStartS,
        target: {
          type: 'stn' as const,
          k: clampedIdx,
          front: anchorSt.sc + (cDir * TRAIN_LEN) / 2,
        },
      });
    } else {
      Object.assign(counterTr, {
        dir: cDir,
        cur: fromIdx,
        v: 0,
        state: 'dwell' as const,
        dwell: 1.5,
        door: 0,
        s: stations[fromIdx].sc + (cDir * TRAIN_LEN) / 2,
        target: null,
      });
      planNextFor(counterTr);
    }
    setDest();
  }

  function reverseDriveDirection() {
    tr.dir = tr.dir === 1 ? -1 : 1;
    tr.v = 0;
    driveNotch = 0;
    kvbStatus = 'ok';
    kvbBrakeLatched = false;
    prevManualAccel = 0;
    prevManualV = 0;
    lastDoorMapKey = '';
    asva.reset();
    const nk = nearestStation();
    const st = stations[nk];
    if (st && Math.abs(tr.s - st.sc) <= 42) {
      tr.cur = nk;
      tr.s = st.sc + (tr.dir * TRAIN_LEN) / 2;
      tr.state = 'dwell';
      tr.dwell = 0;
      distToStopM = 0;
      stopBanner = {
        label: 'Sens inversé',
        detail: `${st.name} → ${tr.dir > 0 ? stations[stations.length - 1].name : stations[0].name}`,
        tone: 'ok',
        untilMs: performance.now() + 2600,
      };
    } else {
      // Find the nearest station strictly behind tr.s in the new travel direction
      // so planNext() always targets the very next station directly ahead.
      let behindIdx = tr.dir > 0 ? -1 : stations.length;
      if (tr.dir > 0) {
        for (let i = 0; i < stations.length; i++) {
          if (stations[i].sc + TRAIN_LEN / 2 < tr.s - 12) behindIdx = i;
        }
      } else {
        for (let i = stations.length - 1; i >= 0; i--) {
          if (stations[i].sc - TRAIN_LEN / 2 > tr.s + 12) behindIdx = i;
        }
      }
      tr.cur = behindIdx;
      tr.state = 'run';
      stopBanner = {
        label: 'Sens inversé',
        detail: `Direction ${tr.dir > 0 ? stations[stations.length - 1].name : stations[0].name}`,
        tone: 'ok',
        untilMs: performance.now() + 2600,
      };
    }
    planNext();
    repositionCounterTrainNear(Math.max(0, Math.min(stations.length - 1, nk)));
    setDest();
    focusKey = '';
    lastTrDoorOpen = null;
    syncCarVisibility(view);
    poseTrain();
    if (view === 'vault') aimVault(focusStation());
    updateHud();
  }

  function stepManualMode(dt: number) {
    tr.time += dt;
    if (!tr.target) planNext();
    const tg = tr.target!;
    const isRer = isRerLineNum(route.num);
    const isPneu = ['1', '4', '6', '11', '14'].includes(route.num) && !spragueMode;
    const frontS = tr.s;
    const open = isOpen(frontS);
    const inCurve = isInCurve(frontS);

    if (manualDoorTarget === 1 && tr.door > 0.7 && doorCloseCountdownSec <= 0) {
      boardingElapsedSec = Math.min(BOARDING_DURATION_SEC, boardingElapsedSec + dt);
    }
    if (doorCloseCountdownSec > 0) {
      doorCloseCountdownSec -= dt;
      if (doorCloseCountdownSec <= 0) {
        doorCloseCountdownSec = 0;
        manualDoorTarget = 0;
        if (tg.type === 'stn' && tg.k === tr.cur) planNext();
      }
    }

    const gradePct = computeTrackGradePercent(frontS, open);
    const res = stepManualTrain({
      s: tr.s,
      v: tr.v,
      dir: tr.dir,
      dt,
      notch: driveNotch,
      door: tr.door,
      targetFront: tg.front,
      isRer,
      isPneumatic: isPneu,
      isOpenAir: open,
      inCurve,
      kvbBrakeLatched,
      stockId: activeStock.id,
      prevAccel: prevManualAccel,
      gradePercent: gradePct,
    });

    prevManualAccel = res.accel;
    currentTivKmh = res.tivKmh;
    if (res.signalAspect !== currentSignalAspect) {
      currentSignalAspect = res.signalAspect;
      signalUpdaters.forEach((fn) => fn(currentSignalAspect));
      if (
        prevSignalAspect === 'VL' &&
        (currentSignalAspect === 'A' || currentSignalAspect === 'S')
      ) {
        synthAudio.triggerCrocodileChime();
      }
      prevSignalAspect = currentSignalAspect;
    }

    tr.s = res.s;
    tr.v = res.v;
    currentLimitKmh = res.limitKmh;
    kvbStatus = res.kvbStatus;
    kvbBrakeLatched = false;
    tractionBlocked = false;
    distToStopM = tg.type === 'stn' ? res.distToStopM : null;
    doorAllowed = true;

    if (res.v > 0.15) {
      tr.state = 'run';
      if (tg.type === 'stn' && tg.k !== undefined && tg.k === tr.cur && res.distToStopM < -16.5) {
        planNext();
      }
    } else if (tg.type === 'stn' && tg.k !== undefined && Math.abs(res.distToStopM) <= 16.0) {
      if (prevManualV >= 0.25) {
        const grade = evaluateStopPrecision(res.distToStopM);
        if (grade) {
          stopBanner = {
            label: grade.label,
            detail: `${grade.offsetM >= 0 ? '+' : ''}${grade.offsetM.toFixed(1)} m du repère · Portes [P]`,
            tone: grade.grade === 'perfect' ? 'good' : 'ok',
            untilMs: performance.now() + 3800,
          };
          window.dispatchEvent(
            new CustomEvent('paris-ride-stop-grade', {
              detail: { label: grade.label, offsetM: grade.offsetM, grade: grade.grade },
            })
          );
        }
      }
      tr.cur = tg.k;
      tr.state = 'dwell';
    }

    if (tg.type === 'stn' && tg.k !== undefined && res.overranStation && res.v > 0.2) {
      if (tg.k !== tr.cur) {
        stopBanner = {
          label: 'Station dépassée !',
          detail: stations[tg.k].name,
          tone: 'warn',
          untilMs: performance.now() + 3200,
        };
      }
      tr.cur = tg.k;
      planNext();
    } else if (tg.type === 'turn' && res.distToStopM < 5) {
      turnBackFor(tr, true);
      driveNotch = 0;
      manualDoorTarget = 0;
      doorCloseCountdownSec = 0;
      kvbBrakeLatched = false;
    }

    const sp = dt / 1.15;
    tr.door += Math.max(-sp, Math.min(sp, manualDoorTarget - tr.door));
    tr.wheel += (tr.v * dt) / WR;
    smoothEffort += (res.effort - smoothEffort) * Math.min(1, dt * 8);
    prevManualV = res.v;
    maybeAnnounceAsva(tg, res.distToStopM, res.v);
  }

  function toggleDrivingMode() {
    drivingMode = !drivingMode;
    if (drivingMode) {
      liveMode = false;
      paused = false;
      speed = 1;
      kvbBrakeLatched = false;
      kvbStatus = 'ok';
      manualDoorTarget = tr.door > 0.45 ? 1 : 0;
      boardingElapsedSec = manualDoorTarget === 1 ? BOARDING_DURATION_SEC : 0;
      doorCloseCountdownSec = 0;
      driveNotch = tr.v > 8 ? 1 : tr.v > 0.5 ? 0 : 0;
      prevManualV = tr.v;
      prevManualAccel = 0;
      if (!tr.target) planNext();
      if (view === 'vault') setView('ride');
    } else {
      kvbBrakeLatched = false;
      kvbStatus = 'ok';
      tractionBlocked = false;
      doorCloseCountdownSec = 0;
      distToStopM = null;
      stopBanner = null;
      if (!tr.target) planNext();
    }
    applyStockVisuals();
    updateHud();
  }

  function toggleManualDoors() {
    if (!drivingMode) return;
    if (manualDoorTarget === 1) {
      if (doorCloseCountdownSec > 0) {
        // Re-clicking during buzzer cancels closing and re-opens cleanly
        doorCloseCountdownSec = 0;
        synthAudio.triggerNotchClick(false);
        updateHud();
        return;
      }
      doorCloseCountdownSec = BUZZER_LEAD_SEC;
      synthAudio.triggerDoorChime();
      updateHud();
    } else {
      manualDoorTarget = 1;
      doorCloseCountdownSec = 0;
      boardingElapsedSec = 0;
      synthAudio.triggerNotchClick(false);
      updateHud();
    }
  }

  function updateLiveUi() {
    updateHud();
  }

  function turnBackFor(unit: SimTrainUnit, isPrimary: boolean) {
    unit.dir = unit.dir > 0 ? -1 : 1;
    if (unit.dir < 0) {
      unit.s = tailB.s0 + 180;
      unit.cur = stations.length;
    } else {
      unit.s = tailA.s1 - 180;
      unit.cur = -1;
    }
    unit.v = 0;
    unit.state = 'run';
    planNextFor(unit);
    setDest();
    if (isPrimary && (view === 'ride' || view === 'passenger')) {
      veil.style.opacity = '1';
      if (veilTimeout) clearTimeout(veilTimeout);
      veilTimeout = setTimeout(() => {
        veil.style.opacity = '0';
      }, 900);
    }
  }

  function stepAutonomousUnit(
    unit: SimTrainUnit,
    dt: number,
    dwellDuration: number,
    isPrimary: boolean
  ) {
    unit.time += dt;
    if (unit.state === 'dwell') {
      unit.dwell += dt;
      if (unit.dwell > dwellDuration) {
        unit.state = 'run';
        planNextFor(unit);
      }
    } else if (unit.target) {
      const tg = unit.target;
      const rem = (tg.front - unit.s) * unit.dir;
      if (isPrimary && tg.type === 'stn') {
        maybeAnnounceAsva(tg, rem, unit.v);
      }
      unit.v = Math.min(VMAX, unit.v + ACC * dt);
      if (rem <= (unit.v * unit.v) / (2 * A_BRAKE)) {
        unit.v = Math.min(unit.v, Math.sqrt(Math.max(0, 2 * A_BRAKE * rem)));
      }
      const st = Math.min(rem, Math.max(unit.v, 0.05) * dt);
      unit.s += unit.dir * st;
      if (rem - st < 0.01) {
        unit.s = tg.front;
        unit.v = 0;
        if (tg.type === 'stn' && tg.k !== undefined) {
          unit.cur = tg.k;
          unit.state = 'dwell';
          unit.dwell = 0;
        } else {
          turnBackFor(unit, isPrimary);
        }
      }
    }
    const targetDoor =
      unit.state === 'dwell' && unit.dwell > 1.1 && unit.dwell < dwellDuration - 2.0 ? 1 : 0;
    const sp = dt / 1.15;
    unit.door += Math.max(-sp, Math.min(sp, targetDoor - unit.door));
    unit.wheel += (unit.v * dt) / WR;
  }

  function stepTrain(dt: number) {
    stepAutonomousUnit(tr, dt, DWELL, true);
  }

  function stepLiveTrain(train: TrainMarker, dt: number) {
    tr.time += dt;
    const nextIdx = resolveStationIndex(train.next);
    const dir = resolveDirection(train.dest, nextIdx);
    const dirChanged = tr.dir !== dir;
    tr.dir = dir;
    if (dirChanged) setDest();

    const targetFront = stations[nextIdx].sc + (dir * TRAIN_LEN) / 2;
    const prevIdx = Math.max(0, Math.min(stations.length - 1, nextIdx - dir));
    const prevFront = stations[prevIdx].sc + (dir * TRAIN_LEN) / 2;
    const atStop = Boolean(train.atStop);
    const legKey = `${route.key}|${dir}|${nextIdx}`;

    if (legKey !== liveLegKey) {
      const wasAdjacent =
        liveLegKey.startsWith(`${route.key}|${dir}|`) &&
        Math.abs(nextIdx - Number(liveLegKey.split('|')[2])) <= 1;
      liveLegKey = legKey;
      if (!wasAdjacent) {
        tr.s = atStop ? targetFront : prevFront + (targetFront - prevFront) * 0.42;
      }
    }

    const speedMps = train.speedMps ?? Math.max(0, (train.spd || 0) / 3.6);
    tr.s = computeLiveStepS({
      prevFront,
      targetFront,
      curS: tr.s,
      dir,
      atStop,
      speedMps: atStop ? 0 : Math.max(4, speedMps),
      dt,
    });
    tr.v = atStop ? Math.max(0, tr.v - A_BRAKE * 2 * dt) : Math.max(1, speedMps);
    tr.cur = atStop ? nextIdx : prevIdx;
    tr.state = atStop ? 'dwell' : 'run';
    tr.target = { type: 'stn', k: nextIdx, front: targetFront };

    const targetDoor = atStop ? 1 : 0;
    const sp = dt / 1.1;
    tr.door += Math.max(-sp, Math.min(sp, targetDoor - tr.door));
    tr.wheel += (tr.v * dt) / WR;
  }

  function jumpToStation(stationName: string) {
    const idx = resolveStationIndex(stationName);
    if (idx < 0 || idx >= stations.length) return;
    asva.reset();
    liveMode = false;
    liveTargetTrainId = null;
    liveLegKey = '';
    eiffelGlance = false;
    cabYaw = 0;
    cabPitch = 0;
    focusKey = '';
    doorCloseCountdownSec = 0;
    boardingElapsedSec = BOARDING_DURATION_SEC;
    prevManualAccel = 0;
    prevManualV = 0;
    stopBanner = null;
    tr.cur = idx;
    tr.s = stations[idx].sc + (tr.dir * TRAIN_LEN) / 2;
    tr.v = 0;
    tr.state = 'dwell';
    tr.dwell = 0;
    tr.door = 1;
    tr.target = null;
    if (drivingMode) {
      driveNotch = 0;
      manualDoorTarget = 1;
      kvbBrakeLatched = false;
      kvbStatus = 'ok';
      distToStopM = 0;
      doorAllowed = true;
      planNext();
    }
    openMix = isOpen(tr.s) ? 1 : 0;
    lastStreamLo = Number.NaN;
    lastStreamHi = Number.NaN;
    streamPending = true;
    lastLightStation = -1;
    lastCamEnv = null;
    repositionCounterTrainNear(idx);
    setDest();
    lastTrDoorOpen = null;
    syncCarVisibility(view);
    stream(idx - 2, idx + 2, 99);
    poseTrain();
    placeLights(idx);
    lastLightStation = idx;
    applyEnv(stations[idx].sc, 1);
    if (view === 'vault') {
      aimVault(idx);
      focusKey = `${idx}:${tr.dir}:${quaiCamera}:${quaiSide}`;
    }
    updateHud();
  }

  function syncFromSimulation(trains: TrainMarker[]) {
    if (!trains.length) {
      latestLiveTrain = null;
      liveActive = false;
      updateLiveUi();
      return;
    }
    const routeNumNorm = route.num.trim().toLowerCase();
    const candidates = trains.filter(
      (t) =>
        !t.isGhost &&
        t.lineName
          .trim()
          .toLowerCase()
          .replace(/^rer\s+/, '') === routeNumNorm
    );
    let match: TrainMarker | undefined;
    if (liveTargetTrainId) {
      match = candidates.find((t) => t.id === liveTargetTrainId);
    }
    if (!match && candidates.length > 0) {
      const anchorIdx = focusStation();
      let bestScore = Number.POSITIVE_INFINITY;
      for (const t of candidates) {
        const idx = resolveStationIndex(t.next);
        const dir = resolveDirection(t.dest, idx);
        const dirPenalty = dir === tr.dir ? 0 : 1000;
        const score = dirPenalty + Math.abs(idx - anchorIdx);
        if (score < bestScore) {
          bestScore = score;
          match = t;
        }
      }
      if (match) liveTargetTrainId = match.id;
    }
    latestLiveTrain = match ?? null;
    liveActive = Boolean(match);
    updateLiveUi();
  }

  const PC = { x: 0, z: 0, h: 0 };
  const easeDoor = (d: number) => (d < 0.5 ? 2 * d * d : 1 - Math.pow(-2 * d + 2, 2) / 2);

  function poseTrainUnit(unit: SimTrainUnit) {
    const e = easeDoor(unit.door);
    const sway = Math.min(1, unit.v / 10);
    unit.cars.forEach((c, i) => {
      pose(unit.s - unit.dir * (i * (L + GAP) + L / 2), PC);
      const lat = unit.dir * 1.8;
      c.outer.position.set(PC.x - Math.sin(PC.h) * lat, 0.22, PC.z + Math.cos(PC.h) * lat);
      c.outer.rotation.y = -(PC.h + (unit.dir < 0 ? PI : 0));
      c.inner.rotation.x =
        Math.sin(unit.time * 2.7 + i * 1.3) * 0.006 * sway +
        Math.sin(unit.time * 7.1 + i) * 0.0015 * sway;
      const axles = c.inner.userData.axles as THREE.Mesh[];
      const leaves = c.inner.userData.leaves as Array<{
        obj: THREE.Group;
        base: number;
        dir: number;
      }>;
      axles.forEach((a) => {
        a.rotation.z = -unit.wheel;
      });
      leaves.forEach((l) => {
        l.obj.position.x = l.base + l.dir * 0.64 * e;
      });
    });
  }

  function doorForStationSide(stationSc: number, trackDir: 1 | -1): number {
    let open = 0;
    for (const unit of [tr, counterTr]) {
      if (unit.dir !== trackDir) continue;
      const dockedFront = stationSc + (trackDir * TRAIN_LEN) / 2;
      if (Math.abs(unit.s - dockedFront) < 16.5) {
        open = Math.max(open, unit.door);
      }
    }
    return easeDoor(open);
  }

  function poseTrain() {
    const trDoorOpen = tr.door > 0.02;
    const counterDoorOpen = counterTr.door > 0.02;
    if (trDoorOpen !== lastTrDoorOpen || counterDoorOpen !== lastCounterDoorOpen) {
      syncCarVisibility(view);
    }
    poseTrainUnit(tr);
    poseTrainUnit(counterTr);
    if (cabPupitreGroup.visible) {
      const targetTilt = drivingMode
        ? -driveNotch * 0.14
        : tr.state === 'dwell'
          ? 0.32
          : tr.v > 0.5
            ? -0.34
            : 0;
      leverPivot.rotation.z += (targetTilt - leverPivot.rotation.z) * 0.16;

      if (drivingMode) {
        if (driveNotch === -4 || kvbStatus === 'ebrake')
          cabNotchLampMat.color.setRGB(3.1, 0.25, 0.2);
        else if (driveNotch < 0) cabNotchLampMat.color.setRGB(2.6, 1.7, 0.25);
        else if (driveNotch > 0) cabNotchLampMat.color.setRGB(0.25, 2.5, 0.9);
        else cabNotchLampMat.color.setRGB(0.75, 0.8, 0.9);
      } else {
        cabNotchLampMat.color.setRGB(0.35, 0.65, 0.85);
      }

      if (tr.door > 0.04) cabDoorLampMat.color.setRGB(2.9, 1.85, 0.25);
      else cabDoorLampMat.color.setRGB(0.25, 2.2, 0.75);

      if (kvbStatus === 'ebrake') cabKvbLampMat.color.setRGB(3.3, 0.2, 0.18);
      else if (kvbStatus === 'warn') cabKvbLampMat.color.setRGB(3.0, 1.9, 0.22);
      else cabKvbLampMat.color.setRGB(0.12, 0.35, 0.2);
    }
    if (cabWiperPivot) {
      const wipe =
        rainEnabled && camEnv !== 'in' && !paused
          ? 1.26 - Math.abs(Math.sin(tr.time * 3.1)) * 0.86
          : 1.32;
      cabWiperPivot.rotation.x += (wipe - cabWiperPivot.rotation.x) * 0.16;
    }
    if (activeStock.hasPsd && !spragueMode) {
      stationPsds.forEach((psd) => {
        const ePos = doorForStationSide(psd.sc, 1);
        const eNeg = doorForStationSide(psd.sc, -1);
        psd.leaves.forEach((l) => {
          l.mesh.position.x = l.base + l.dir * 0.64 * (l.side > 0 ? ePos : eNeg);
        });
      });
    }
  }

  function focusStation() {
    if (tr.state === 'dwell') return Math.max(0, Math.min(stations.length - 1, tr.cur));
    if (tr.target?.type === 'stn' && tr.target.k !== undefined) return tr.target.k;
    return tr.dir > 0 ? stations.length - 1 : 0;
  }

  function nearestStation() {
    let lo = 0;
    let hi = stations.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (stations[mid].sc <= tr.s) lo = mid;
      else hi = mid - 1;
    }
    if (
      lo < stations.length - 1 &&
      Math.abs(stations[lo + 1].sc - tr.s) < Math.abs(stations[lo].sc - tr.s)
    ) {
      lo++;
    }
    return lo;
  }

  function aimVault(k: number) {
    const st = stations[k];
    const P = pose(st.sc, { x: 0, z: 0, h: 0 });
    const d = tr.dir;
    const side = d * quaiSide;
    if (quaiCamera === 'mid') {
      toWorld(P, d * 4, 2.25, side * 5.3, camera.position);
      toWorld(P, -d * 4, 1.75, side * 0.6, controls.target);
    } else if (quaiCamera === 'tail') {
      toWorld(P, -d * 34, 2.7, side * 4.95, camera.position);
      toWorld(P, d * 8, 1.85, side * 1.2, controls.target);
    } else if (quaiCamera === 'overpass') {
      toWorld(P, d * 47, st.air ? 5.9 : 4.15, side * 3.85, camera.position);
      toWorld(P, -d * 8, 1.75, side * 0.6, controls.target);
    } else {
      toWorld(P, d * 36, 2.75, side * 4.85, camera.position);
      toWorld(P, -d * 6, 1.85, side * 1.4, controls.target);
    }
    controls.update();
  }

  let prevTrainV = 0;
  let smoothPitchNod = 0;
  let smoothEffort = 0;
  let cabVibPhase = 0;
  const passCamLocal = new THREE.Vector3(0.4, BY + 1.28, 0.56);
  const passLookLocal = new THREE.Vector3(3.6, BY + 1.18, -3.4);

  function setView(v: 'vault' | 'ride' | 'passenger') {
    view = v;
    focusKey = '';
    eiffelGlance = false;
    controls.enabled = v === 'vault';
    cabYaw = 0;
    cabPitch = 0;
    camera.fov = v === 'ride' ? 62 : v === 'passenger' ? 68 : 52;
    camera.updateProjectionMatrix();
    syncCarVisibility(v);
    if (v === 'vault' && stations.length > 0) {
      const fk = focusStation();
      aimVault(fk);
      placeLights(fk);
      lastLightStation = fk;
      focusKey = `${fk}:${tr.dir}:${quaiCamera}:${quaiSide}`;
    }
    updateHud();
  }

  const routeOptions = ROUTES.map((r) => {
    const a = r.stations[0].name;
    const b = r.stations[r.stations.length - 1].name;
    const prefix = isRerLineNum(r.num) ? 'RER' : 'Ligne';
    return {
      value: r.key,
      label: `${prefix} ${r.num}${r.branch ? ` (${r.branch})` : ''} · ${a} – ${b}`,
    };
  });

  function resolveStationIndex(stationName?: string): number {
    if (!stationName) return 0;
    const needle = normalizeStr(stationName);
    if (!needle) return 0;
    const exact = stations.findIndex((s) => normalizeStr(s.name) === needle);
    if (exact >= 0) return exact;
    const partial = stations.findIndex((s) => {
      const hay = normalizeStr(s.name);
      return hay.includes(needle) || needle.includes(hay);
    });
    return partial >= 0 ? partial : 0;
  }

  function resolveDirection(destName?: string, startIndex = 0): 1 | -1 {
    if (destName) {
      const destNorm = normalizeStr(destName);
      const firstNorm = normalizeStr(stations[0].name);
      const lastNorm = normalizeStr(stations[stations.length - 1].name);
      if (firstNorm.includes(destNorm) || destNorm.includes(firstNorm)) return -1;
      if (lastNorm.includes(destNorm) || destNorm.includes(lastNorm)) return 1;
    }
    return startIndex >= stations.length - 1 ? -1 : 1;
  }

  let badgeTex: THREE.CanvasTexture | null = null;
  function setRoute(key: string, stationName?: string, destName?: string) {
    if (route && route.key !== key) customStockGlb = null;
    asva.reset();
    lastDoorMapKey = '';
    currentSignalAspect = 'VL';
    prevSignalAspect = 'VL';
    currentTivKmh = null;
    prevManualAccel = 0;
    doorCloseCountdownSec = 0;
    route = ROUTES.find((r) => r.key === key) || ROUTES[0];
    clearAll();
    if (badgeTex) badgeTex.dispose();
    if (badgeMat) badgeMat.dispose();
    badgeTex = new THREE.CanvasTexture(badgeCanvas(route));
    badgeTex.wrapS = THREE.RepeatWrapping;
    badgeTex.wrapT = THREE.RepeatWrapping;
    badgeTex.colorSpace = THREE.SRGBColorSpace;
    badgeTex.anisotropy = maxAniso;
    badgeMat = new THREE.MeshStandardMaterial({
      map: badgeTex,
      roughness: 0.2,
      envMapIntensity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
    });
    buildPath(route);

    const startIdx = resolveStationIndex(stationName);
    const dir = resolveDirection(destName, startIdx);
    const startSt = stations[startIdx];
    Object.assign(tr, {
      dir,
      cur: startIdx,
      v: 0,
      state: 'dwell' as const,
      dwell: 5.5,
      door: 0,
      s: startSt.sc + (dir * TRAIN_LEN) / 2,
      target: null,
    });
    liveLegKey = '';
    latestLiveTrain = null;
    liveActive = false;
    lastSpeedoKey = '';
    lastSielKey = '';
    driveNotch = 0;
    manualDoorTarget = 0;
    kvbBrakeLatched = false;
    kvbStatus = 'ok';
    tractionBlocked = false;
    doorAllowed = false;
    distToStopM = null;
    stopBanner = null;
    if (!stationName) liveTargetTrainId = null;
    updateLiveUi();
    eiffelGlance = false;
    cabYaw = 0;
    cabPitch = 0;

    planNext();
    const cDir: 1 | -1 = dir > 0 ? -1 : 1;
    if (stations.length >= 2) {
      const altIdx = Math.max(0, Math.min(stations.length - 1, startIdx + dir));
      const fromIdx = altIdx === startIdx ? (startIdx > 0 ? startIdx - 1 : 1) : altIdx;
      const aheadOfTarget = (stations[fromIdx].sc - startSt.sc) * cDir < 0;
      if (aheadOfTarget) {
        const span = Math.abs(stations[fromIdx].sc - startSt.sc);
        const cStartS = startSt.sc - cDir * Math.min(115, span * 0.45 + 35);
        Object.assign(counterTr, {
          dir: cDir,
          cur: fromIdx,
          v: 11.5,
          state: 'run' as const,
          dwell: 0,
          door: 0,
          s: cStartS,
          target: { type: 'stn' as const, k: startIdx, front: startSt.sc + (cDir * TRAIN_LEN) / 2 },
        });
      } else {
        Object.assign(counterTr, {
          dir: cDir,
          cur: fromIdx,
          v: 0,
          state: 'dwell' as const,
          dwell: 2,
          door: 0,
          s: stations[fromIdx].sc + (cDir * TRAIN_LEN) / 2,
          target: null,
        });
        planNextFor(counterTr);
      }
    } else {
      Object.assign(counterTr, {
        dir: cDir,
        cur: startIdx,
        v: 0,
        state: 'dwell' as const,
        dwell: 0,
        door: 0,
        s: startSt.sc + (cDir * TRAIN_LEN) / 2,
        target: null,
      });
    }
    setDest();
    applyStockVisuals();
    refreshDualSielTextures(buildDualSielSnapshot(startIdx));
    focusKey = '';
    openMix = isOpen(tr.s) ? 1 : 0;
    stream(startIdx - 2, startIdx + 2, 99);
    poseTrain();
    placeLights(startIdx);
    lastLightStation = startIdx;
    applyEnv(startSt.sc, 1);
    if (view === 'vault') {
      aimVault(startIdx);
      focusKey = `${startIdx}:${tr.dir}:${quaiCamera}:${quaiSide}`;
    }
    updateHud();
    options.onRouteChange?.(route.key);
  }

  function counterSielEta(focusIdx: number): string {
    const st = stations[focusIdx];
    if (!st) return '3 min';
    const dockedFront = st.sc + (counterTr.dir * TRAIN_LEN) / 2;
    if (counterTr.state === 'dwell' && Math.abs(counterTr.s - dockedFront) < 4.5) {
      return 'À quai';
    }
    if (counterTr.target?.type === 'stn' && counterTr.target.k === focusIdx) {
      const rem = Math.max(0, (counterTr.target.front - counterTr.s) * counterTr.dir);
      const sec = rem / Math.max(8, counterTr.v || 10);
      return sec <= 25 ? '< 1 min' : `${Math.max(1, Math.round(sec / 60))} min`;
    }
    return '3 min';
  }

  function buildDualSielSnapshot(focusIdx: number): DualSielBoards {
    const stName = stations[focusIdx]?.name ?? '';
    const kmh = Math.round(
      liveMode && liveActive && latestLiveTrain ? latestLiveTrain.spd || 0 : tr.v * 3.6
    );
    return selectDualSielBoards({
      departures: options.getStationDepartures?.(stName) ?? [],
      lineNum: route.num,
      posDest: stations[stations.length - 1]?.name ?? '',
      negDest: stations[0]?.name ?? '',
      simDir: tr.dir,
      simState: tr.state,
      simKmh: kmh,
      counterEtaText: counterSielEta(focusIdx),
    });
  }

  function trackText(s: number) {
    const speedSuffix =
      liveMode && liveActive && latestLiveTrain
        ? ` · ${Math.round(latestLiveTrain.spd || 0)} km/h`
        : '';
    for (const st of stations) {
      if (s >= st.s0 && s <= st.s0 + SL) {
        return `${st.air ? 'Station aérienne' : 'Station souterraine'}${speedSuffix}`;
      }
    }
    const t = tunnels.find((item) => s >= item.s0 && s < item.s1);
    if (isOpen(s)) {
      const base =
        t && t.seine
          ? t.tower
            ? 'Traversée de la Seine · vue Tour Eiffel'
            : 'Traversée de la Seine'
          : 'Sur le viaduc, plein air';
      return `${base}${speedSuffix}`;
    }
    return `En tunnel${speedSuffix}`;
  }

  let lastSpeedoKey = '';
  let lastSielKey = '';
  // Live interior plan thermomètre CanvasTexture mounted above every car door
  let doorMapCanvas: HTMLCanvasElement | null = null;
  let doorMapTex: THREE.CanvasTexture | null = null;
  let lastDoorMapKey = '';
  function refreshDoorLineMap(arrets: string[], curIdx: number, isDwell: boolean) {
    if (typeof document === 'undefined' || !route) return;
    const key = `${route.key}:${curIdx}:${isDwell ? 1 : 0}`;
    if (key === lastDoorMapKey) return;
    lastDoorMapKey = key;
    if (!doorMapCanvas) {
      doorMapCanvas = document.createElement('canvas');
      doorMapCanvas.width = 512;
      doorMapCanvas.height = 72;
      doorMapTex = new THREE.CanvasTexture(doorMapCanvas);
      doorMapTex.colorSpace = THREE.SRGBColorSpace;
      M.doorLineMap.map = doorMapTex;
      M.doorLineMap.needsUpdate = true;
    }
    const ctx = doorMapCanvas.getContext('2d');
    if (!ctx || !doorMapTex) return;

    // Clean RATP/IDFM white enamel interior header strip
    ctx.fillStyle = '#f5f4f0';
    ctx.fillRect(0, 0, 512, 72);
    ctx.strokeStyle = '#d4d2cb';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 510, 70);

    // Official line badge on left
    ctx.fillStyle = route.bg;
    if (isRerLineNum(route.num)) {
      ctx.beginPath();
      ctx.roundRect(12, 14, 44, 44, 11);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(34, 36, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = route.fg;
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(route.num, 34, 37);

    // Slice 7 stops centered around current stop for legible in-world thermometer
    const start = Math.max(0, Math.min(Math.max(0, arrets.length - 7), curIdx - 1));
    const slice = arrets.slice(start, start + 7);
    const x0 = 84;
    const x1 = 486;
    const yLine = 32;
    ctx.strokeStyle = route.bg;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, yLine);
    ctx.lineTo(x1, yLine);
    ctx.stroke();

    const step = slice.length > 1 ? (x1 - x0) / (slice.length - 1) : 0;
    slice.forEach((name, i) => {
      const absIdx = start + i;
      const sx = x0 + step * i;
      const isPast = absIdx < curIdx;
      const isTarget = absIdx === (isDwell ? curIdx : Math.min(arrets.length - 1, curIdx + 1));
      ctx.beginPath();
      ctx.arc(sx, yLine, isTarget ? 7.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? '#ffbe00' : isPast ? '#b8bcc4' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isTarget ? '#1c2430' : isPast ? '#8f949e' : route.bg;
      ctx.stroke();

      ctx.fillStyle = isPast ? '#8b909a' : '#181c22';
      ctx.font = isTarget
        ? 'bold 11px system-ui, -apple-system, sans-serif'
        : '600 10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name.length > 13 ? `${name.slice(0, 12)}…` : name, sx, 54);
    });
    doorMapTex.needsUpdate = true;
  }

  function updateHud() {
    const N = stations.length;
    const toward =
      liveMode && liveActive && latestLiveTrain?.dest
        ? latestLiveTrain.dest
        : tr.dir > 0
          ? stations[N - 1].name
          : stations[0].name;
    let now = '';
    let label = '';
    let next = '';
    if (tr.state === 'dwell') {
      label = 'À quai';
      now = stations[tr.cur].name;
    } else if (tr.target?.type === 'turn') {
      label = 'Manœuvre';
      now = 'Arrière-gare terminus';
    } else if (tr.target?.k !== undefined) {
      label = 'Prochaine';
      now = stations[tr.target.k].name;
    }
    let t: { type: 'stn' | 'turn'; k?: number } | null = null;
    if (tr.state === 'dwell') t = nextFrom(tr.cur, tr.dir);
    else if (tr.target?.type === 'stn' && tr.target.k !== undefined)
      t = nextFrom(tr.target.k, tr.dir);
    const nk = t && t.type === 'stn' && t.k !== undefined ? t.k : null;
    next =
      nk !== null
        ? stations[nk].name
        : tr.state !== 'dwell' && tr.target?.type === 'turn'
          ? tr.dir > 0
            ? stations[stations.length - 1].name
            : stations[0].name
          : 'Terminus, retournement';
    const k = focusStation();
    const kmh = Math.round(
      liveMode && liveActive && latestLiveTrain ? latestLiveTrain.spd || 0 : tr.v * 3.6
    );
    const stockTag = spragueMode ? 'Sprague 1930' : activeStock.label;
    const arrets =
      tr.dir > 0 ? stations.map((s) => s.name) : [...stations].reverse().map((s) => s.name);
    const curIndex = tr.dir > 0 ? tr.cur : Math.max(0, stations.length - 1 - tr.cur);
    refreshDoorLineMap(arrets, curIndex, tr.state === 'dwell');
    const voieText = trackText(tr.s - (tr.dir * TRAIN_LEN) / 2);

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (stopBanner && nowMs > stopBanner.untilMs) stopBanner = null;

    const sielBoards = buildDualSielSnapshot(k);

    hudRoot.render(
      createElement(CabHud, {
        ligne: { shortName: route.num, color: route.bg, textColor: route.fg },
        routes: routeOptions,
        route: route.key,
        onRoute: (val: string) => {
          if (!route || val !== route.key) {
            liveTargetTrainId = null;
            setRoute(val);
          }
        },
        station: stations[k].name,
        stations: stations.map((s) => s.name),
        onSelectStation: (stationName: string) => jumpToStation(stationName),
        aQuai: tr.state === 'dwell',
        prochaine: now,
        direction: toward,
        voie: voieText,
        vitesse: kmh,
        effort: smoothEffort,
        arrets,
        index: curIndex,
        progression: tr.state === 'dwell' ? 0 : 0.45,
        vue: view === 'vault' ? 'quai' : view === 'passenger' ? 'passager' : 'cabine',
        onVue: (v: 'quai' | 'cabine' | 'passager') =>
          setView(v === 'quai' ? 'vault' : v === 'passager' ? 'passenger' : 'ride'),
        quaiCamera,
        onQuaiCamera: (preset: QuaiCameraPreset) => {
          quaiCamera = preset;
          focusKey = '';
          updateHud();
        },
        onInverserQuai: () => {
          quaiSide = quaiSide === 1 ? -1 : 1;
          focusKey = '';
          updateHud();
        },
        sielBoards,
        materiel: stockTag,
        allure: `${speed}×`,
        onAllure: () => {
          if (drivingMode) return;
          liveMode = false;
          speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
          updateHud();
        },
        pause: paused,
        onPause: () => {
          paused = !paused;
          if (paused) asva.cancel();
          updateHud();
        },
        son: audioEnabled,
        onSon: () => {
          audioEnabled = synthAudio.setEnabled(!audioEnabled);
          if (!audioEnabled) asva.cancel();
          updateHud();
        },
        direct: !drivingMode && liveMode && liveActive,
        onDirect: () => {
          if (drivingMode) drivingMode = false;
          liveMode = !liveMode;
          applyStockVisuals();
          updateHud();
        },
        conduite: drivingMode,
        onConduite: () => toggleDrivingMode(),
        cran: driveNotch,
        cranLabel: NOTCH_LABELS[driveNotch],
        onCran: (n: number) => {
          if (!drivingMode) toggleDrivingMode();
          setDriveNotch(clampDriveNotch(n));
        },
        onCranDelta: (delta: number) => {
          if (!drivingMode) toggleDrivingMode();
          setDriveNotch(clampDriveNotch(driveNotch + delta));
        },
        onFreinUrgence: () => {
          if (!drivingMode) toggleDrivingMode();
          setDriveNotch(driveNotch === -4 && tr.v < 0.1 ? 0 : -4);
        },
        limiteVitesse: drivingMode ? currentLimitKmh : isRerLineNum(route.num) ? 90 : 70,
        kvbEtat: drivingMode ? kvbStatus : 'ok',
        distanceArretM: drivingMode ? distToStopM : null,
        signalAspect: drivingMode ? currentSignalAspect : 'VL',
        tivKmh: drivingMode ? currentTivKmh : null,
        embarquementPct:
          drivingMode && manualDoorTarget === 1
            ? Math.min(100, Math.round((boardingElapsedSec / BOARDING_DURATION_SEC) * 100))
            : null,
        ronfleurActif: drivingMode && doorCloseCountdownSec > 0,
        portesOuvertes: tr.door > 0.04 || manualDoorTarget === 1,
        portesAutorisees: drivingMode ? doorAllowed : false,
        onPortes: () => toggleManualDoors(),
        tractionBloqueePortes: drivingMode && tractionBlocked,
        phares: highBeam,
        onPhares: () => {
          highBeam = !highBeam;
          updateHud();
        },
        ambiance: timeOfDay,
        onAmbiance: (nextMood: ParisTimeOfDay) => setTimeOfDay(nextMood),
        pluie: rainEnabled,
        onPluie: () => {
          rainEnabled = !rainEnabled;
          updateHud();
        },
        onInverserSens: drivingMode ? () => reverseDriveDirection() : undefined,
        arretFeedback: stopBanner
          ? { label: stopBanner.label, detail: stopBanner.detail, tone: stopBanner.tone }
          : null,
        onQuitter: () => options.onExit?.(),
        pointDeVue:
          (view === 'ride' || view === 'passenger') && route.open.tower && camEnv === 'out'
            ? {
                label: eiffelGlance ? 'Recentrer la vue' : 'Regarder la tour Eiffel',
                onClick: () => {
                  eiffelGlance = !eiffelGlance;
                  if (!eiffelGlance) {
                    cabYaw = 0;
                    cabPitch = 0;
                  }
                  updateHud();
                },
              }
            : null,
      })
    );
    const speedoKey = `${route.key}|${stockTag}|${kmh}|${tr.state}|${drivingMode ? 1 : 0}|${driveNotch}|${kvbStatus}|${currentLimitKmh}|${distToStopM === null ? '' : Math.round(distToStopM)}|${tr.door > 0.05 ? 1 : 0}`;
    if (cabPupitreGroup.visible && speedoKey !== lastSpeedoKey) {
      lastSpeedoKey = speedoKey;
      const ctx = speedoCanvasEl.getContext('2d');
      if (ctx) {
        drawAfficheurVitesse(ctx, {
          vitesse: kmh,
          limite: drivingMode ? currentLimitKmh : isRerLineNum(route.num) ? 90 : 70,
          materiel: stockTag,
          etat: tr.state === 'dwell' ? 'À QUAI' : drivingMode ? 'CONDUITE' : 'PA / AUTO',
          couleurLigne: route.bg,
          libelleLigne: route.num,
          notch: drivingMode ? NOTCH_LABELS[driveNotch] : undefined,
          kvbStatus: drivingMode ? kvbStatus : 'ok',
          distToStopM: drivingMode ? distToStopM : null,
          doorsOpen: tr.door > 0.05,
          manualMode: drivingMode,
        });
      }
      speedoTex.needsUpdate = true;
    }

    const sielKey = [
      route.key,
      stations[k]?.name ?? '',
      ...sielBoards.pos.rows.map((r) => `${r.dest}:${r.eta}`),
      ...sielBoards.neg.rows.map((r) => `${r.dest}:${r.eta}`),
    ].join('|');
    if (sielKey !== lastSielKey) {
      lastSielKey = sielKey;
      refreshDualSielTextures(sielBoards);
    }
  }

  /* ---------- Event Listeners ---------- */
  let draggingCab = false;
  let lastPtrX = 0;
  let lastPtrY = 0;
  const onCanvasPointerDown = (e: PointerEvent) => {
    if (view === 'vault') return;
    draggingCab = true;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  };
  const onCanvasPointerMove = (e: PointerEvent) => {
    if (!draggingCab || view === 'vault') return;
    const dx = e.clientX - lastPtrX;
    const dy = e.clientY - lastPtrY;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    eiffelGlance = false;
    const maxYaw = view === 'passenger' ? 3.1 : 1.85;
    cabYaw = Math.max(-maxYaw, Math.min(maxYaw, cabYaw - dx * 0.0045));
    cabPitch = Math.max(-0.25, Math.min(0.75, cabPitch + dy * 0.0035));
  };
  const onCanvasPointerUp = (e: PointerEvent) => {
    draggingCab = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  };
  const onCanvasDblClick = () => {
    if (view === 'vault') return;
    cabYaw = 0;
    cabPitch = 0;
    eiffelGlance = false;
    updateHud();
  };
  renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
  renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
  renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);
  renderer.domElement.addEventListener('pointercancel', onCanvasPointerUp);
  renderer.domElement.addEventListener('dblclick', onCanvasDblClick);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      options.onExit?.();
      return;
    }
    const targetTag = (e.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') return;

    const k = e.key.toLowerCase();
    if (k === 'm') {
      e.preventDefault();
      toggleDrivingMode();
    } else if (k === '1') {
      setView('vault');
    } else if (k === '2') {
      setView('ride');
    } else if (k === '3') {
      setView('passenger');
    } else if (k === 'l') {
      e.preventDefault();
      highBeam = !highBeam;
      updateHud();
    } else if (drivingMode) {
      if (e.key === 'ArrowUp' || k === 'z' || k === 'w') {
        e.preventDefault();
        setDriveNotch(clampDriveNotch(driveNotch + 1));
      } else if (e.key === 'ArrowDown' || k === 's') {
        e.preventDefault();
        setDriveNotch(clampDriveNotch(driveNotch - 1));
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setDriveNotch(driveNotch === -4 && tr.v < 0.1 ? 0 : -4);
      } else if (k === '0' || k === 'n') {
        e.preventDefault();
        setDriveNotch(0);
      } else if (k === 'p' || k === 'o') {
        e.preventDefault();
        toggleManualDoors();
      } else if (k === 'r') {
        e.preventDefault();
        reverseDriveDirection();
      }
    }
  };
  window.addEventListener('keydown', onKeyDown, true);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer?.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  /* ---------- Bootstrap & Render Loop ---------- */
  const initialRouteKey = resolveRideRouteKey(options.initialLine, options.initialDest);
  setRoute(initialRouteKey, options.initialStation, options.initialDest);
  setView(options.initialView ?? 'ride');
  if (options.initialDriveMode && !drivingMode) {
    toggleDrivingMode();
  }
  updateLiveUi();

  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  const clock = new THREE.Clock();
  let hudT = 0;

  let lastRenderMs = 0;

  renderer.setAnimationLoop((nowMs) => {
    const minFrameMs = isMobileGpu && !drivingMode ? 24 : 16.5;
    if (disposed || document.hidden) return;
    if (nowMs - lastRenderMs < minFrameMs) return;
    lastRenderMs = nowMs;
    const dt = Math.min(0.05, clock.getDelta());
    if (!paused) {
      if (drivingMode) {
        stepManualMode(dt);
        stepAutonomousUnit(counterTr, dt, 6, false);
      } else if (liveMode && latestLiveTrain) {
        stepLiveTrain(latestLiveTrain, dt);
        stepAutonomousUnit(counterTr, dt, 6, false);
      } else {
        for (let i = 0; i < speed; i++) {
          stepTrain(dt);
          stepAutonomousUnit(counterTr, dt, 6, false);
        }
      }
      // Keep the opposite-direction train active near the player's current section
      // so it never disappears permanently at the far end of a long line.
      if (stations.length >= 2 && Math.abs(counterTr.s - tr.s) > 1050) {
        repositionCounterTrainNear(nearestStation());
      }
    }
    const elapsedSec = nowMs * 0.001;
    segmentUpdaters.forEach((fn) => fn(elapsedSec, timeOfDay));
    poseTrain();
    const near = nearestStation();
    const fk = focusStation();
    const streamRadius = isMobileGpu ? 1 : 2;
    const streamLo = Math.min(near, fk) - streamRadius;
    const streamHi = Math.max(near, fk) + streamRadius;
    if (streamLo !== lastStreamLo || streamHi !== lastStreamHi || streamPending) {
      lastStreamLo = streamLo;
      lastStreamHi = streamHi;
      streamPending = stream(streamLo, streamHi, isMobileGpu ? 2 : 3);
      lastCamEnv = null;
    }
    if (view === 'vault') {
      const key = `${fk}:${tr.dir}:${quaiCamera}:${quaiSide}`;
      if (key !== focusKey) {
        focusKey = key;
        aimVault(fk);
      }
      if (fk !== lastLightStation) {
        lastLightStation = fk;
        placeLights(fk);
      }
      controls.update();
      applyEnv(stations[fk].sc, dt);
    } else {
      if (near !== lastLightStation) {
        lastLightStation = near;
        placeLights(near);
      }
      const isPassenger = view === 'passenger';
      const car = (isPassenger && tr.cars[1] ? tr.cars[1] : tr.cars[0]).outer;
      car.updateWorldMatrix(true, false);
      car.localToWorld(tmpA.copy(isPassenger ? passCamLocal : camLocal));
      car.localToWorld(tmpB.copy(isPassenger ? passLookLocal : lookLocal));

      if (!drivingMode) {
        // Physique caméra cabine / passager : micro-vibrations rails, tangage freinage et FOV dynamique
        const curV = paused ? 0 : tr.v;
        const accel = dt > 0.0001 ? (curV - prevTrainV) / dt : 0;
        prevTrainV = curV;
        const targetEffort = Math.max(-1, Math.min(1, accel / 1.4));
        smoothEffort += (targetEffort - smoothEffort) * Math.min(1, dt * 6);
      } else {
        prevTrainV = tr.v;
      }
      const curV = paused ? 0 : tr.v;
      const targetNod = Math.max(-0.012, Math.min(0.012, smoothEffort * 0.0075));
      smoothPitchNod += (targetNod - smoothPitchNod) * Math.min(1, dt * 6.5);

      const isPneu = ['1', '4', '6', '11', '14'].includes(route.num);
      const speedRatio = Math.min(1, curV / 20);
      cabVibPhase += dt * (12 + speedRatio * 24);
      const vibAmp = (isPneu ? 0.0022 : 0.0046) * speedRatio;
      tmpA.y += Math.sin(cabVibPhase) * vibAmp + Math.sin(cabVibPhase * 2.3) * vibAmp * 0.35;

      const portraitBoost = camera.aspect < 1 ? Math.min(18, (1 - camera.aspect) * 32) : 0;
      const baseFov = (eiffelGlance ? 74 : isPassenger ? 68 : 62) + portraitBoost;
      const targetFov = baseFov + speedRatio * 2.5;
      if (Math.abs(camera.fov - targetFov) > 0.02) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
        camera.updateProjectionMatrix();
      }

      const fwdDir = tmpC.copy(tmpB).sub(tmpA).normalize();
      if (eiffelGlance && towerWorldPos) {
        // Place camera at panoramic front-left belvedere outside the cab lintel so the entire 330m Tour Eiffel frames unobstructed
        car.localToWorld(tmpA.set(L / 2 + 0.15, BY + 1.65, -0.95));
        fwdDir.copy(towerWorldPos).sub(tmpA).normalize();
      } else {
        if (!isPassenger && camera.aspect < 0.85) {
          tmpA.addScaledVector(fwdDir, 0.28);
        }
        if (Math.abs(cabYaw) > 0.0001) fwdDir.applyAxisAngle(WORLD_UP, cabYaw);
        const totalPitch = cabPitch + smoothPitchNod;
        if (Math.abs(totalPitch) > 0.0001) {
          fwdDir.y = Math.max(-0.55, Math.min(0.88, fwdDir.y + totalPitch));
          fwdDir.normalize();
        }
      }
      camera.position.copy(tmpA);
      camera.lookAt(tmpD.copy(tmpA).addScaledVector(fwdDir, 30));
      applyEnv(tr.s - tr.dir * 1.5, dt);
    }
    if (camEnv !== lastCamEnv) {
      lastCamEnv = camEnv;
    }
    const showBeams = camEnv !== 'out' || timeOfDay === 'night';
    const showRain = rainEnabled && camEnv !== 'in';
    rainLines.visible = showRain;
    if (showRain) {
      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;
      const dropPhase = (paused ? 0 : elapsedSec) * 21;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const sx = rainSeeds[i * 3];
        const sy = ((((rainSeeds[i * 3 + 1] - dropPhase) % 14) + 14) % 14) - 4;
        const sz = rainSeeds[i * 3 + 2];
        const idx = i * 6;
        rainPositions[idx] = cx + sx;
        rainPositions[idx + 1] = cy + sy;
        rainPositions[idx + 2] = cz + sz;
        rainPositions[idx + 3] = cx + sx - 0.12;
        rainPositions[idx + 4] = cy + sy - 0.65;
        rainPositions[idx + 5] = cz + sz - 0.14;
      }
      rainPosAttr.needsUpdate = true;
    }
    for (const b of headlightBeams) {
      b.visible = showBeams;
      b.scale.setScalar(highBeam ? 1.0 : 0.62);
    }
    for (const sp of cabSpotLights) {
      const base = isMobileGpu ? 3.2 : 5.6;
      sp.intensity = highBeam ? base : base * 0.42;
    }
    if (!drivingMode && tr.state === 'dwell') {
      const warnPhase = !paused && tr.dwell > DWELL - 2.3 && tr.dwell < DWELL - 0.5;
      if (warnPhase && !doorWarnPlayed) {
        doorWarnPlayed = true;
        synthAudio.triggerDoorChime();
      }
    } else if (!drivingMode) {
      doorWarnPlayed = false;
    }
    synthAudio.updateTelemetry({
      speedKmh: liveMode && liveActive && latestLiveTrain ? latestLiveTrain.spd || 0 : tr.v * 3.6,
      isOpenAir: camEnv === 'out',
      stockId: activeStock.id,
      isPneumatic: ['1', '4', '6', '11', '14'].includes(route.num),
      atStop: tr.state === 'dwell',
      paused,
      view,
    });
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.25;
      updateHud();
    }
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  });

  return {
    setRoute,
    setView,
    syncFromSimulation,
    dispose() {
      if (disposed) return;
      disposed = true;
      asva.dispose();
      synthAudio.dispose();
      composer?.dispose();
      if (veilTimeout) clearTimeout(veilTimeout);
      renderer.setAnimationLoop(null);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove);
      renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onCanvasPointerUp);
      renderer.domElement.removeEventListener('dblclick', onCanvasDblClick);
      hudRoot.unmount();
      controls.dispose();
      clearAll();
      disposeSignalTextures();
      if (badgeTex) badgeTex.dispose();
      if (badgeMat) badgeMat.dispose();
      if (destTex) destTex.dispose();
      if (counterDestTex) counterDestTex.dispose();
      if (sielTexPos) sielTexPos.dispose();
      if (sielTexNeg) sielTexNeg.dispose();
      if (doorMapTex) doorMapTex.dispose();
      speedoTex.dispose();
      textures.forEach((t) => t.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      if (envTarget) envTarget.dispose();
      renderer.dispose();
      root.remove();
    },
  };
}
