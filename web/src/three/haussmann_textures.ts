import * as THREE from 'three';

/**
 * Textures procédurales haute fidélité pour les extérieurs parisiens
 * (façades haussmanniennes variées avec normalMap, toits mansardés en zinc,
 * boulevards, panneaux d'arrêt quai) et l'architecture des stations.
 */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTex(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  srgb: boolean,
  rx = 1,
  ry = 1
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TexturedPbrMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
}

export type HaussmannVariant = 'cream' | 'ochre' | 'modern';

/** Convertit une heightmap 0..1 (tuilable) en normalMap tangentielle Sobel 3x3. */
function heightToNormalCanvas(
  height: Float32Array,
  w: number,
  h: number,
  strength: number
): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const out = img.data;
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
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

      const i = (y * w + x) * 4;
      out[i] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Façade parisienne 512×512 avec carte de couleur, rugosité et relief normalisé :
 * - `'cream'` : pierre de taille calcaire classique, persiennes gris-bleu, bistro bordeaux/vert
 * - `'ochre'` : pierre ocre chaude + briques faubouriennes, auvents bleu ardoise
 * - `'modern'` : immeuble parisien contemporain pierre claire & baies vitrées larges
 */
export function createHaussmannVariantMaps(
  variant: HaussmannVariant,
  anisotropy: number
): TexturedPbrMaps {
  const W = 512;
  const H = 512;
  const [c, g] = makeCanvas(W, H);
  const [rc, rg] = makeCanvas(W, H);
  const height = new Float32Array(W * H).fill(0.55);

  const carveRect = (x: number, y: number, w: number, h: number, val: number) => {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        height[yy * W + xx] = val;
      }
    }
  };

  if (variant === 'modern') {
    g.fillStyle = '#d4d6d8';
    g.fillRect(0, 0, W, H);
    rg.fillStyle = '#c8c8c8';
    rg.fillRect(0, 0, W, H);

    // Bandes architecturales horizontales & grands panneaux vitrés
    const rdcY = 414;
    g.fillStyle = '#a7acb2';
    g.fillRect(0, rdcY, W, H - rdcY);
    for (let i = 0; i < 4; i++) {
      const gx = i * 128 + 10;
      g.fillStyle = i % 2 === 0 ? '#182430' : '#22313f';
      g.fillRect(gx, rdcY + 14, 108, H - rdcY - 18);
      rg.fillStyle = '#202020';
      rg.fillRect(gx, rdcY + 14, 108, H - rdcY - 18);
      carveRect(gx, rdcY + 14, 108, H - rdcY - 18, 0.25);
    }

    const floors = [336, 260, 184, 108, 34];
    floors.forEach((fy, fIdx) => {
      g.fillStyle = '#c0c4c9';
      g.fillRect(0, fy + 62, W, 10);
      carveRect(0, fy + 62, W, 10, 0.8);

      for (let i = 0; i < 4; i++) {
        const wx = i * 128 + 12;
        const ww = 104;
        const winH = 56;
        const lit = (i * 5 + fIdx * 11) % 7 === 0;
        g.fillStyle = lit ? '#e5c178' : '#243547';
        g.fillRect(wx, fy, ww, winH);
        rg.fillStyle = '#181818';
        rg.fillRect(wx, fy, ww, winH);
        carveRect(wx, fy, ww, winH, 0.28);

        if (!lit) {
          g.fillStyle = 'rgba(180, 212, 238, 0.22)';
          g.beginPath();
          g.moveTo(wx, fy);
          g.lineTo(wx + ww * 0.62, fy);
          g.lineTo(wx, fy + winH * 0.72);
          g.closePath();
          g.fill();
        }
        g.fillStyle = '#474f59';
        g.fillRect(wx + ww / 2 - 1.5, fy, 3, winH);
        // Garde-corps vitré / inox
        g.fillStyle = '#252a32';
        g.fillRect(wx, fy + winH - 14, ww, 3);
      }
    });

    const nCanvas = heightToNormalCanvas(height, W, H, 1.8);
    return {
      map: toTex(c, anisotropy, true, 1, 1),
      roughnessMap: toTex(rc, anisotropy, false, 1, 1),
      normalMap: toTex(nCanvas, anisotropy, false, 1, 1),
    };
  }

  const isOchre = variant === 'ochre';
  g.fillStyle = isOchre ? '#d7c19e' : '#e2d8c5';
  g.fillRect(0, 0, W, H);
  rg.fillStyle = '#dadada';
  rg.fillRect(0, 0, W, H);

  if (isOchre) {
    // Subtiles assises brique / pierre ocre parisienne
    for (let y = 0; y < H; y += 32) {
      g.fillStyle = y % 64 === 0 ? 'rgba(162, 92, 62, 0.14)' : 'rgba(130, 88, 56, 0.07)';
      g.fillRect(0, y, W, 14);
    }
  }

  // Joints d'assise pierre de taille + relief dans la heightmap
  g.strokeStyle = isOchre ? 'rgba(104, 78, 54, 0.25)' : 'rgba(110, 96, 78, 0.22)';
  g.lineWidth = 1;
  for (let y = 0; y < H; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
    carveRect(0, y, W, 1, 0.44);
  }
  for (let row = 0; row < H / 16; row++) {
    const off = (row % 2) * 24;
    for (let x = off; x < W; x += 48) {
      g.beginPath();
      g.moveTo(x, row * 16);
      g.lineTo(x, row * 16 + 16);
      g.stroke();
    }
  }

  // Rez-de-chaussée pierre bossagée + vitrines cafés & boulangeries
  const rdcY = 410;
  g.fillStyle = isOchre ? '#bfa684' : '#cabfa8';
  g.fillRect(0, rdcY, W, H - rdcY);
  const cols = 6;
  const colW = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * colW + 9;
    const w = colW - 18;
    const warmShop = (i + (isOchre ? 1 : 0)) % 3 === 0;
    g.fillStyle = warmShop ? '#6e522e' : '#1b222c';
    g.fillRect(x, rdcY + 20, w, H - rdcY - 24);
    if (warmShop) {
      g.fillStyle = 'rgba(255, 218, 142, 0.35)';
      g.fillRect(x + 4, rdcY + 26, w - 8, H - rdcY - 36);
    }
    rg.fillStyle = '#222222';
    rg.fillRect(x, rdcY + 20, w, H - rdcY - 24);
    carveRect(x, rdcY + 20, w, H - rdcY - 24, 0.25);

    // Enseigne parisienne bordeaux / vert bouteille / ardoise
    g.fillStyle = isOchre
      ? i % 2 === 0
        ? '#1f3652'
        : '#5e1d26'
      : i % 2 === 0
        ? '#1c2d6c'
        : '#234232';
    g.fillRect(x - 2, rdcY + 7, w + 4, 13);
  }

  // 5 étages de fenêtres hautes haussmanniennes
  const floors = [334, 258, 182, 108, 34];
  floors.forEach((fy, fIdx) => {
    const winH = fIdx === 4 ? 54 : 58;
    for (let i = 0; i < cols; i++) {
      const wx = i * colW + 18;
      const ww = colW - 36;

      // Encadrement pierre claire saillant
      g.fillStyle = isOchre ? '#eadcc4' : '#efe7d6';
      g.fillRect(wx - 4, fy - 4, ww + 8, winH + 8);
      carveRect(wx - 4, fy - 4, ww + 8, winH + 8, 0.78);

      // Persiennes repliées gris-bleu parisien
      g.fillStyle = isOchre ? '#697987' : '#85909c';
      g.fillRect(wx - 6, fy, 5, winH);
      g.fillRect(wx + ww + 1, fy, 5, winH);
      carveRect(wx - 6, fy, 5, winH, 0.7);
      carveRect(wx + ww + 1, fy, 5, winH, 0.7);

      // Vitre sombre ou intérieurs chaleureusement éclairés (~18 %)
      const lit = (i * 7 + fIdx * 13 + (isOchre ? 3 : 0)) % 6 === 0;
      g.fillStyle = lit ? '#e2bd74' : '#1b2636';
      g.fillRect(wx, fy, ww, winH);
      rg.fillStyle = '#1e1e1e';
      rg.fillRect(wx, fy, ww, winH);
      carveRect(wx, fy, ww, winH, 0.22);

      if (!lit) {
        g.fillStyle = 'rgba(175, 200, 228, 0.18)';
        g.beginPath();
        g.moveTo(wx, fy);
        g.lineTo(wx + ww * 0.65, fy);
        g.lineTo(wx, fy + winH * 0.65);
        g.closePath();
        g.fill();
      }

      // Petits-bois / meneaux blancs
      g.strokeStyle = '#ebe5d8';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(wx + ww / 2, fy);
      g.lineTo(wx + ww / 2, fy + winH);
      g.moveTo(wx, fy + winH * 0.35);
      g.lineTo(wx + ww, fy + winH * 0.35);
      g.stroke();

      // Garde-corps individuel fer forgé noir
      g.strokeStyle = '#191d24';
      g.lineWidth = 1.6;
      g.strokeRect(wx - 2, fy + winH - 18, ww + 4, 18);
    }

    // Corniches & balcons filants aux 2e & 5e étages
    if (fIdx === 1 || fIdx === 4) {
      g.fillStyle = isOchre ? '#c9b392' : '#c8bda2';
      g.fillRect(0, fy + winH + 2, W, 7);
      carveRect(0, fy + winH + 2, W, 7, 0.88);
      g.fillStyle = 'rgba(30, 26, 22, 0.34)';
      g.fillRect(0, fy + winH + 9, W, 4);
      g.fillStyle = '#171b22';
      g.fillRect(0, fy + winH - 16, W, 2.5);
      for (let bx = 4; bx < W; bx += 8) {
        g.fillRect(bx, fy + winH - 15, 1.5, 17);
      }
    }
  });

  // Grande corniche sommitale sous toit zinc
  g.fillStyle = '#f2ebdc';
  g.fillRect(0, 0, W, 14);
  carveRect(0, 0, W, 14, 0.92);
  g.fillStyle = 'rgba(30, 26, 22, 0.36)';
  g.fillRect(0, 14, W, 6);

  const normalCanvas = heightToNormalCanvas(height, W, H, 2.1);
  return {
    map: toTex(c, anisotropy, true, 1, 1),
    roughnessMap: toTex(rc, anisotropy, false, 1, 1),
    normalMap: toTex(normalCanvas, anisotropy, false, 1, 1),
  };
}

export function createHaussmannFacadeMaps(anisotropy: number): TexturedPbrMaps {
  return createHaussmannVariantMaps('cream', anisotropy);
}

/** Toit mansardé en zinc parisien à joints debout + lucarnes. */
export function createZincRoofMaps(anisotropy: number): TexturedPbrMaps {
  const W = 256;
  const H = 256;
  const [c, g] = makeCanvas(W, H);
  const [rc, rg] = makeCanvas(W, H);

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#4f5a67');
  grad.addColorStop(0.6, '#5c6876');
  grad.addColorStop(1, '#48525e');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  rg.fillStyle = '#848484';
  rg.fillRect(0, 0, W, H);

  // Joints debout verticaux du zinc
  for (let x = 0; x < W; x += 12) {
    g.fillStyle = 'rgba(255, 255, 255, 0.11)';
    g.fillRect(x, 0, 1.5, H);
    g.fillStyle = 'rgba(12, 18, 26, 0.32)';
    g.fillRect(x + 1.5, 0, 1.5, H);
    rg.fillStyle = '#b4b4b4';
    rg.fillRect(x, 0, 2, H);
  }

  // Lucarnes mansardées régulières avec fronton cintré
  for (let x = 22; x < W; x += 64) {
    g.fillStyle = '#38404b';
    g.fillRect(x - 4, 118, 28, 54);
    g.fillStyle = '#1b2636';
    g.fillRect(x, 128, 20, 40);
    rg.fillStyle = '#202020';
    rg.fillRect(x, 128, 20, 40);
    g.strokeStyle = '#dcd5c6';
    g.lineWidth = 1.6;
    g.strokeRect(x, 128, 20, 40);
  }

  return {
    map: toTex(c, anisotropy, true, 2, 1),
    roughnessMap: toTex(rc, anisotropy, false, 2, 1),
  };
}

/** Chaussée parisienne en enrobé + marquages blancs sous viaduc. */
export function createBoulevardRoadTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const [c, g] = makeCanvas(W, H);

  g.fillStyle = '#2c3036';
  g.fillRect(0, 0, W, H);

  // Grain subtil d'enrobé
  for (let i = 0; i < 1800; i++) {
    const shade = Math.random() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${shade},${shade},${shade},0.035)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // Bordures de caniveau granite
  g.fillStyle = '#5f6268';
  g.fillRect(0, 0, W, 12);
  g.fillRect(0, H - 12, W, 12);

  // Lignes de séparation de voies (bande axiale en pointillés)
  g.fillStyle = 'rgba(236, 236, 232, 0.72)';
  g.fillRect(16, H * 0.5 - 3, 76, 6);
  g.fillRect(148, H * 0.5 - 3, 76, 6);

  // Bandes de rives
  g.fillStyle = 'rgba(230, 230, 224, 0.42)';
  g.fillRect(0, 20, W, 3);
  g.fillRect(0, H - 23, W, 3);

  return toTex(c, anisotropy, true, 1 / 12, 1);
}

/** Repère d'arrêt RATP / SNCF (« TÊTE DE TRAIN / 5V » ou « RER »). */
export function createStopMarkerTexture(label: string, anisotropy: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [c, g] = makeCanvas(W, H);

  g.fillStyle = '#12151b';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffbe00';
  g.lineWidth = 8;
  g.strokeRect(6, 6, W - 12, H - 12);

  g.fillStyle = '#ffbe00';
  g.fillRect(14, 14, W - 28, 34);
  g.fillStyle = '#12151b';
  g.font = "800 22px 'Asap Variable', Asap, Arial, sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ARRÊT', W / 2, 32);

  g.fillStyle = '#ffffff';
  g.font = "800 42px 'Asap Variable', Asap, Arial, sans-serif";
  g.fillText(label, W / 2, 86);

  return toTex(c, anisotropy, true, 1, 1);
}

/** Frise céramique 1900 à losanges bleu pâle / cobalt (moulures biseautées CMP). */
export function createFriezeCeramiqueTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 512;
  const H = 64;
  const [c, g] = makeCanvas(W, H);

  g.fillStyle = '#f2f1ec';
  g.fillRect(0, 0, W, H);

  g.fillStyle = '#1c2d6c';
  g.fillRect(0, 0, W, 9);
  g.fillRect(0, H - 9, W, 9);
  g.fillStyle = '#718fe3';
  g.fillRect(0, 9, W, 4);
  g.fillRect(0, H - 13, W, 4);

  for (let x = 0; x < W; x += 64) {
    g.strokeStyle = 'rgba(130, 140, 155, 0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, 13);
    g.lineTo(x, H - 13);
    g.stroke();

    g.fillStyle = '#a2b9f5';
    g.beginPath();
    g.moveTo(x + 32, 16);
    g.lineTo(x + 56, 32);
    g.lineTo(x + 32, 48);
    g.lineTo(x + 8, 32);
    g.closePath();
    g.fill();
    g.strokeStyle = '#344ea6';
    g.lineWidth = 2;
    g.stroke();

    g.fillStyle = '#1c2d6c';
    g.beginPath();
    g.arc(x + 32, 32, 4.5, 0, Math.PI * 2);
    g.fill();
  }

  return toTex(c, anisotropy, true, 1, 1);
}

/** Caisson lumineux suspendu « SORTIE » (bleu Émail RATP + lettrage blanc lumineux). */
export function createSortieSignTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 256;
  const H = 96;
  const [c, g] = makeCanvas(W, H);

  g.fillStyle = '#132668';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  g.lineWidth = 4;
  g.strokeRect(8, 8, W - 16, H - 16);

  g.fillStyle = '#ffffff';
  g.font = "700 42px 'Asap Variable', Asap, Arial, sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('SORTIE', W / 2, H / 2 + 2);

  return toTex(c, anisotropy, true, 1, 1);
}
