import * as THREE from 'three';

/**
 * Générateur procédural de cartes PBR (normalMap, roughnessMap, ombre de contact)
 * pour la scène 3D Quai & Cabine. Zéro asset réseau, déterministe, mipmaps activés.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalizeDataTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  srgb = false
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Convertit une heightmap Float32Array (0..1, tuilable) en normalMap tangentielle (RGB)
 * via un filtre Sobel 3×3.
 */
function heightToNormalCanvas(height: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const out = img.data;
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const i = (y * size + x) * 4;
      out[i] = Math.round(((-dx * invLen) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((-dy * invLen) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Génère un champ de bruit tuilable multi-fréquence (0..1). */
function buildTileableNoise(size: number, seed: number, octaves: number): Float32Array {
  const rng = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 0.55;
  let totalAmp = 0;

  for (let o = 0; o < octaves; o++) {
    const grid = Math.max(4, Math.min(size, 8 << o));
    const lattice = new Float32Array(grid * grid);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng();

    const step = size / grid;
    for (let y = 0; y < size; y++) {
      const gy = y / step;
      const y0 = Math.floor(gy) % grid;
      const y1 = (y0 + 1) % grid;
      const fy = gy - Math.floor(gy);
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const x0 = Math.floor(gx) % grid;
        const x1 = (x0 + 1) % grid;
        const fx = gx - Math.floor(gx);
        const sx = fx * fx * (3 - 2 * fx);

        const v00 = lattice[y0 * grid + x0];
        const v10 = lattice[y0 * grid + x1];
        const v01 = lattice[y1 * grid + x0];
        const v11 = lattice[y1 * grid + x1];
        const vx0 = v00 + (v10 - v00) * sx;
        const vx1 = v01 + (v11 - v01) * sx;
        out[y * size + x] += (vx0 + (vx1 - vx0) * sy) * amp;
      }
    }
    totalAmp += amp;
    amp *= 0.5;
  }

  for (let i = 0; i < out.length; i++) out[i] /= totalAmp;
  return out;
}

export interface PbrMapPair {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

/**
 * Béton / maçonnerie tunnel avec plaques d'humidité localisées (roughness abaissée)
 * pour accrocher les reflets des lampes sodium et des phares.
 */
export function createConcretePbrMaps(anisotropy: number): PbrMapPair {
  const size = 256;
  const height = buildTileableNoise(size, 1900, 5);
  const damp = buildTileableNoise(size, 1907, 3);
  const normalCanvas = heightToNormalCanvas(height, size, 2.2);

  const [roughCanvas, rctx] = createCanvas(size, size);
  const rImg = rctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // Base béton très mat (0.92), zones humides descendant vers ~0.36
    const wetness = Math.max(0, (damp[i] - 0.56) * 2.1);
    const rVal = Math.max(0.32, Math.min(0.98, 0.92 - wetness * 0.54 + (height[i] - 0.5) * 0.12));
    const byte = Math.round(rVal * 255);
    const idx = i * 4;
    rImg.data[idx] = byte;
    rImg.data[idx + 1] = byte;
    rImg.data[idx + 2] = byte;
    rImg.data[idx + 3] = 255;
  }
  rctx.putImageData(rImg, 0, 0);

  return {
    normalMap: finalizeDataTexture(normalCanvas, 1 / 4, 1 / 4, anisotropy),
    roughnessMap: finalizeDataTexture(roughCanvas, 1 / 4, 1 / 4, anisotropy),
  };
}

/** Asphalte / dallage de quai à granulométrie fine. */
export function createAsphaltPbrMaps(anisotropy: number): PbrMapPair {
  const size = 256;
  const height = buildTileableNoise(size, 2024, 5);
  const wear = buildTileableNoise(size, 2029, 2);
  const normalCanvas = heightToNormalCanvas(height, size, 1.5);

  const [roughCanvas, rctx] = createCanvas(size, size);
  const rImg = rctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // Zones de passage légèrement lustrées (0.58..0.88)
    const rVal = Math.max(0.48, Math.min(0.92, 0.78 - (wear[i] - 0.5) * 0.24 + (height[i] - 0.5) * 0.1));
    const byte = Math.round(rVal * 255);
    const idx = i * 4;
    rImg.data[idx] = byte;
    rImg.data[idx + 1] = byte;
    rImg.data[idx + 2] = byte;
    rImg.data[idx + 3] = 255;
  }
  rctx.putImageData(rImg, 0, 0);

  return {
    normalMap: finalizeDataTexture(normalCanvas, 1 / 1.2, 1 / 1.2, anisotropy),
    roughnessMap: finalizeDataTexture(roughCanvas, 1 / 1.2, 1 / 1.2, anisotropy),
  };
}

/** Lit de ballast à fort relief gravier. */
export function createBallastPbrMaps(anisotropy: number): PbrMapPair {
  const size = 256;
  const height = buildTileableNoise(size, 3101, 6);
  const normalCanvas = heightToNormalCanvas(height, size, 3.6);

  const [roughCanvas, rctx] = createCanvas(size, size);
  const rImg = rctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const rVal = Math.max(0.74, Math.min(1.0, 0.88 + (height[i] - 0.5) * 0.22));
    const byte = Math.round(rVal * 255);
    const idx = i * 4;
    rImg.data[idx] = byte;
    rImg.data[idx + 1] = byte;
    rImg.data[idx + 2] = byte;
    rImg.data[idx + 3] = 255;
  }
  rctx.putImageData(rImg, 0, 0);

  return {
    normalMap: finalizeDataTexture(normalCanvas, 1 / 3, 1 / 3, anisotropy),
    roughnessMap: finalizeDataTexture(roughCanvas, 1 / 3, 1 / 3, anisotropy),
  };
}

/** Acier / inox brossé directionnel pour rails et garnitures métalliques. */
export function createBrushedMetalNormalMap(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const rng = mulberry32(4409);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const streak = rng();
    for (let x = 0; x < size; x++) {
      height[y * size + x] = streak * 0.75 + rng() * 0.25;
    }
  }
  const normalCanvas = heightToNormalCanvas(height, size, 0.9);
  return finalizeDataTexture(normalCanvas, 2, 2, anisotropy);
}

/** Ombre de contact elliptique douce placée sous chaque voiture pour l'ancrer sur la voie. */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 64);
  ctx.clearRect(0, 0, 128, 64);
  ctx.save();
  ctx.translate(64, 32);
  ctx.scale(1, 0.5);
  const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(0.82, 'rgba(0, 0, 0, 0.18)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
