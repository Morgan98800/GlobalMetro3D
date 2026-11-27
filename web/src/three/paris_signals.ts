import * as THREE from 'three';

export interface SignalPose2D {
  x: number;
  z: number;
  h: number;
}

export interface TrackSignalMaterials {
  housing: THREE.Material;
  iron: THREE.Material;
  green: THREE.Material;
  yellow: THREE.Material;
  red: THREE.Material;
  whitePole: THREE.Material;
}

export interface TrackSignalHandle {
  group: THREE.Group;
  updateAspect: (aspect: 'VL' | 'A' | 'S') => void;
}

const tivTextureCache = new Map<number, THREE.CanvasTexture>();
const tivMaterialCache = new Map<number, THREE.MeshStandardMaterial>();

function mergeGeosLocal(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
}

function pushMergedMesh(
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  bucket: THREE.BufferGeometry[],
  material: THREE.Material,
  name: string
): THREE.Mesh | null {
  if (bucket.length === 0) return null;
  const merged = mergeGeosLocal(bucket);
  for (let i = 0; i < bucket.length; i++) {
    bucket[i].dispose();
  }
  geos.push(merged);
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = name;
  group.add(mesh);
  return mesh;
}

/**
 * Renders and caches an authentic French RATP/SNCF TIV (Tableau Indicateur de Vitesse):
 * matte signal-black board with crisp white enamel border and bold white tabular speed digits.
 */
export function createTivTexture(speedKmh: number): THREE.CanvasTexture {
  const key = Math.max(10, Math.min(300, Math.round(speedKmh)));
  const cached = tivTextureCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Deep matte RATP/SNCF signal black field
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, size, size);

    // Crisp outer white enamel border
    const outerInset = 12;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 14;
    ctx.strokeRect(outerInset, outerInset, size - outerInset * 2, size - outerInset * 2);

    // Subtle secondary dark hairline inside the white frame for high-contrast definition
    ctx.strokeStyle = 'rgba(10, 13, 18, 0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(21, 21, size - 42, size - 42);

    // Bold tabular white speed digits centered optically
    const label = String(key);
    const fontSize = label.length >= 3 ? 104 : 134;
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${fontSize}px "Helvetica Neue", "Inter", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2 + 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;

  tivTextureCache.set(key, tex);
  return tex;
}

function getCachedTivMaterial(speedKmh: number): THREE.MeshStandardMaterial {
  const key = Math.max(10, Math.min(300, Math.round(speedKmh)));
  const cached = tivMaterialCache.get(key);
  if (cached) return cached;

  const tex = createTivTexture(key);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.5,
    roughness: 0.42,
    metalness: 0.05,
  });

  tivMaterialCache.set(key, mat);
  return mat;
}

/**
 * Disposes all cached TIV CanvasTextures and MeshStandardMaterials cleanly on unmount.
 */
export function disposeSignalTextures(): void {
  tivMaterialCache.forEach((mat) => mat.dispose());
  tivMaterialCache.clear();
  tivTextureCache.forEach((tex) => tex.dispose());
  tivTextureCache.clear();
}

export const disposeSignalAssets = disposeSignalTextures;

/**
 * Builds merged RATP/SNCF 3-aspect block signals (VL / A / S) and 3D TIV speed boards
 * along `[s0, s1]` on the right-hand trackside, facing oncoming trains cleanly.
 */
export function buildTrackSignalsAndTiv(params: {
  s0: number;
  s1: number;
  isOpenAir: boolean;
  isRer: boolean;
  inCurve: boolean;
  pose: (s: number, out: SignalPose2D) => SignalPose2D;
  geos: THREE.BufferGeometry[];
  mats: TrackSignalMaterials;
  isMobileGpu: boolean;
}): TrackSignalHandle {
  const { s0, s1, isOpenAir, isRer, inCurve, pose, geos, mats, isMobileGpu } = params;
  const group = new THREE.Group();
  group.name = 'track-signals-tiv';

  const segLen = s1 - s0;
  if (segLen < 30) {
    return {
      group,
      updateAspect: () => {},
    };
  }

  const housingGeos: THREE.BufferGeometry[] = [];
  const ironGeos: THREE.BufferGeometry[] = [];
  const whiteGeos: THREE.BufferGeometry[] = [];
  const greenGeos: THREE.BufferGeometry[] = [];
  const yellowGeos: THREE.BufferGeometry[] = [];
  const redGeos: THREE.BufferGeometry[] = [];
  const tivFaceBuckets = new Map<number, THREE.BufferGeometry[]>();

  // Reusable transform temporaries to avoid per-object allocations
  const p: SignalPose2D = { x: 0, z: 0, h: 0 };
  const worldMat = new THREE.Matrix4();
  const localMat = new THREE.Matrix4();
  const combinedMat = new THREE.Matrix4();
  const rotMat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const posVec = new THREE.Vector3();
  const scaleOne = new THREE.Vector3(1, 1, 1);
  const lensRotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);

  const setAnchorTransform = (s: number, lat: number): void => {
    pose(s, p);
    const nx = -Math.sin(p.h);
    const nz = Math.cos(p.h);
    // Align local +Z facing oncoming train (-tangent) and local +X toward right trackside (+normal)
    const rotY = -p.h - Math.PI / 2;
    quat.setFromAxisAngle(upAxis, rotY);
    posVec.set(p.x + nx * lat, 0, p.z + nz * lat);
    worldMat.compose(posVec, quat, scaleOne);
  };

  const addBox = (
    bucket: THREE.BufferGeometry[],
    w: number,
    h: number,
    d: number,
    lx: number,
    ly: number,
    lz: number
  ): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    localMat.makeTranslation(lx, ly, lz);
    combinedMat.multiplyMatrices(worldMat, localMat);
    g.applyMatrix4(combinedMat);
    bucket.push(g);
  };

  const addLens = (
    bucket: THREE.BufferGeometry[],
    radius: number,
    lx: number,
    ly: number,
    lz: number
  ): void => {
    const g = new THREE.CylinderGeometry(radius, radius, 0.032, isMobileGpu ? 10 : 14);
    localMat.makeTranslation(lx, ly, lz);
    rotMat.multiplyMatrices(localMat, lensRotX);
    combinedMat.multiplyMatrices(worldMat, rotMat);
    g.applyMatrix4(combinedMat);
    bucket.push(g);
  };

  // 1. Place RATP/SNCF 3-aspect block signals every ~72m (~96m on mobile GPU)
  const signalStep = isMobileGpu ? 96 : 72;
  const signalLat = isOpenAir ? 4.35 : 3.55;
  const headY = isOpenAir ? 2.65 : 2.55;
  const signalPositions: number[] = [];

  if (segLen >= 40) {
    const firstS = s0 + Math.min(36, segLen * 0.25);
    const lastS = s1 - 22;
    for (let s = firstS; s <= lastS; s += signalStep) {
      signalPositions.push(s);
      setAnchorTransform(s, signalLat);

      // Matte-black rectangular signal head (cible)
      addBox(housingGeos, 0.36, 1.04, 0.24, 0, headY, 0);

      // Iconic French white outer border rim behind the front face (zero z-fighting)
      addBox(whiteGeos, 0.41, 1.09, 0.028, 0, headY, 0.092);

      // 3 stacked optical lenses: VL (green top), A (yellow middle), S (red bottom)
      const lensOffsets = [0.3, 0, -0.3];
      addLens(greenGeos, 0.095, 0, headY + lensOffsets[0], 0.128);
      addLens(yellowGeos, 0.095, 0, headY + lensOffsets[1], 0.128);
      addLens(redGeos, 0.095, 0, headY + lensOffsets[2], 0.128);

      // Anti-glare hoods / visors above each lens
      for (let i = 0; i < lensOffsets.length; i++) {
        const ly = headY + lensOffsets[i];
        addBox(housingGeos, 0.22, 0.022, 0.16, 0, ly + 0.105, 0.19);
        if (!isMobileGpu) {
          addBox(housingGeos, 0.02, 0.12, 0.11, -0.102, ly + 0.042, 0.165);
          addBox(housingGeos, 0.02, 0.12, 0.11, 0.102, ly + 0.042, 0.165);
        }
      }

      if (isOpenAir) {
        // Viaduct signal mast + concrete/iron plinth + horizontal mounting stub
        const mastH = headY + 0.12;
        addBox(ironGeos, 0.11, mastH, 0.11, 0, mastH * 0.5, -0.17);
        addBox(ironGeos, 0.26, 0.14, 0.26, 0, 0.07, -0.17);
        addBox(ironGeos, 0.09, 0.12, 0.12, 0, headY, -0.11);
        // Signature white mast identification collar band
        addBox(whiteGeos, 0.132, 0.3, 0.132, 0, 1.42, -0.17);
      } else {
        // Tunnel wall mounting bracket extending outward (+localX toward tunnel wall)
        addBox(ironGeos, 0.42, 0.055, 0.06, 0.21, headY + 0.34, -0.06);
        addBox(ironGeos, 0.42, 0.055, 0.06, 0.21, headY - 0.34, -0.06);
        addBox(ironGeos, 0.045, 0.88, 0.14, 0.39, headY, -0.06);
        // Compact RATP/SNCF signal identification plaque below head
        addBox(whiteGeos, 0.24, 0.16, 0.024, 0, headY - 0.63, 0.08);
      }
    }
  }

  // 2. Place crisp 3D TIV speed boards
  const tivLat = isOpenAir ? 4.3 : 3.45;
  const tivY = 2.05;
  const tivPlacements: Array<{ s: number; speedKmh: number }> = [];

  const avoidSignalCollision = (candidateS: number): number => {
    for (let i = 0; i < signalPositions.length; i++) {
      if (Math.abs(candidateS - signalPositions[i]) < 6) {
        const shifted = candidateS - 8;
        if (shifted > s0 + 8 && shifted < s1 - 12) return shifted;
        return candidateS + 8;
      }
    }
    return candidateS;
  };

  // Near start of open-air / curve segments (55 Metro / 65 RER)
  if ((isOpenAir || inCurve) && segLen >= 38) {
    const startTivS = avoidSignalCollision(s0 + Math.min(18, segLen * 0.15));
    if (startTivS > s0 + 4 && startTivS < s1 - 12) {
      tivPlacements.push({ s: startTivS, speedKmh: isRer ? 65 : 55 });
    }
  }

  // Near segment end approaching station (45 Metro / 50 RER)
  if (segLen >= 52) {
    const endTivS = avoidSignalCollision(s1 - Math.min(46, segLen * 0.24));
    const overlapsStartTiv =
      tivPlacements.length > 0 && Math.abs(endTivS - tivPlacements[0].s) < 16;
    if (!overlapsStartTiv && endTivS > s0 + 12 && endTivS < s1 - 14) {
      tivPlacements.push({ s: endTivS, speedKmh: isRer ? 50 : 45 });
    }
  }

  for (let i = 0; i < tivPlacements.length; i++) {
    const { s, speedKmh } = tivPlacements[i];
    setAnchorTransform(s, tivLat);

    // Steel mounting post from deck/walkway up to board center
    addBox(ironGeos, 0.06, tivY, 0.06, 0, tivY * 0.5, -0.05);
    addBox(ironGeos, 0.16, 0.08, 0.16, 0, 0.04, -0.05);
    if (!isOpenAir) {
      // Lateral tie brace to tunnel wall
      addBox(ironGeos, 0.42, 0.045, 0.045, 0.22, tivY - 0.12, -0.05);
    }
    // White visibility collar on TIV post
    addBox(whiteGeos, 0.076, 0.18, 0.076, 0, 1.24, -0.05);

    // Matte-black TIV backing housing plate
    addBox(housingGeos, 0.56, 0.56, 0.04, 0, tivY, 0);

    // Textured front face slightly proud of backing plate (zero z-fighting)
    const faceGeo = new THREE.PlaneGeometry(0.54, 0.54);
    localMat.makeTranslation(0, tivY, 0.024);
    combinedMat.multiplyMatrices(worldMat, localMat);
    faceGeo.applyMatrix4(combinedMat);

    const speedKey = Math.round(speedKmh);
    let bucket = tivFaceBuckets.get(speedKey);
    if (!bucket) {
      bucket = [];
      tivFaceBuckets.set(speedKey, bucket);
    }
    bucket.push(faceGeo);
  }

  // Merge all static structural & signal-aspect geometries into minimal draw calls
  pushMergedMesh(group, geos, housingGeos, mats.housing, 'signals-housing');
  pushMergedMesh(group, geos, ironGeos, mats.iron, 'signals-iron');
  pushMergedMesh(group, geos, whiteGeos, mats.whitePole, 'signals-white-trim');

  const greenMesh = pushMergedMesh(group, geos, greenGeos, mats.green, 'signals-aspect-vl');
  const yellowMesh = pushMergedMesh(group, geos, yellowGeos, mats.yellow, 'signals-aspect-a');
  const redMesh = pushMergedMesh(group, geos, redGeos, mats.red, 'signals-aspect-s');

  tivFaceBuckets.forEach((bucket, speedKey) => {
    const mat = getCachedTivMaterial(speedKey);
    pushMergedMesh(group, geos, bucket, mat, `signals-tiv-${speedKey}`);
  });

  // Default aspect: Voie Libre (VL)
  let currentAspect: 'VL' | 'A' | 'S' = 'VL';
  if (greenMesh) greenMesh.visible = true;
  if (yellowMesh) yellowMesh.visible = false;
  if (redMesh) redMesh.visible = false;

  const updateAspect = (aspect: 'VL' | 'A' | 'S'): void => {
    if (aspect === currentAspect) return;
    currentAspect = aspect;
    if (greenMesh) greenMesh.visible = aspect === 'VL';
    if (yellowMesh) yellowMesh.visible = aspect === 'A';
    if (redMesh) redMesh.visible = aspect === 'S';
  };

  return { group, updateAspect };
}
