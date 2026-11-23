import * as THREE from 'three';

/**
 * Textures procédurales haute fidélité pour les extérieurs parisiens
 * (façades haussmanniennes en pierre de taille, toits mansardés en zinc)
 * et l'architecture des stations (frise céramique 1900, caissons « SORTIE »).
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
}

/**
 * Façade haussmannienne 512×512 :
 * - Rez-de-chaussée pierre bossagée + vitrines/arcades commerçantes
 * - 5 étages en pierre de taille calcaire crème avec joints d'assise
 * - Fenêtres hautes vitrées réfléchissantes (roughness 0.12) + persiennes + garde-corps fer forgé
 * - Balcons filants aux 2e et 5e étages + corniches
 */
export function createHaussmannFacadeMaps(anisotropy: number): TexturedPbrMaps {
  const W = 512;
  const H = 512;
  const [c, g] = makeCanvas(W, H);
  const [rc, rg] = makeCanvas(W, H);

  // Fond pierre de taille calcaire parisienne (mat)
  g.fillStyle = '#ddd3be';
  g.fillRect(0, 0, W, H);
  rg.fillStyle = '#dcdcdc'; // roughness ~0.86
  rg.fillRect(0, 0, W, H);

  // Joints d'assise de pierre de taille
  g.strokeStyle = 'rgba(110, 96, 78, 0.22)';
  g.lineWidth = 1;
  for (let y = 0; y < H; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
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

  // Rez-de-chaussée : pierre plus soutenue + arcades / vitrines commerçantes
  const rdcY = 412;
  g.fillStyle = '#c9bea7';
  g.fillRect(0, rdcY, W, H - rdcY);
  const cols = 6;
  const colW = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * colW + 10;
    const w = colW - 20;
    // Vitrine sombre réfléchissante
    g.fillStyle = i % 3 === 1 ? '#2a333e' : '#1b222c';
    g.fillRect(x, rdcY + 18, w, H - rdcY - 22);
    rg.fillStyle = '#262626'; // verre vitrine brillant
    rg.fillRect(x, rdcY + 18, w, H - rdcY - 22);
    // Bandeau enseigne sobre
    g.fillStyle = i % 2 === 0 ? '#1c2d6c' : '#3a4a3f';
    g.fillRect(x - 2, rdcY + 8, w + 4, 11);
  }

  // 5 étages de fenêtres hautes haussmanniennes
  const floors = [334, 258, 182, 108, 34]; // 1er -> 5e étage
  floors.forEach((fy, fIdx) => {
    const winH = fIdx === 4 ? 54 : 58;
    for (let i = 0; i < cols; i++) {
      const wx = i * colW + 18;
      const ww = colW - 36;

      // Encadrement mouluré en pierre claire
      g.fillStyle = '#ede5d5';
      g.fillRect(wx - 4, fy - 4, ww + 8, winH + 8);

      // Persiennes grises sur les côtés
      g.fillStyle = '#8b929a';
      g.fillRect(wx - 6, fy, 5, winH);
      g.fillRect(wx + ww + 1, fy, 5, winH);

      // Vitre sombre réfléchissante (quelques fenêtres chaudement éclairées)
      const lit = (i * 7 + fIdx * 13) % 11 === 0;
      g.fillStyle = lit ? '#d8b46c' : '#1d2838';
      g.fillRect(wx, fy, ww, winH);
      rg.fillStyle = '#202020'; // roughness ~0.12 (verre brillant)
      rg.fillRect(wx, fy, ww, winH);

      // Reflet diagonal subtil sur vitre
      if (!lit) {
        g.fillStyle = 'rgba(175, 200, 225, 0.16)';
        g.beginPath();
        g.moveTo(wx, fy);
        g.lineTo(wx + ww * 0.65, fy);
        g.lineTo(wx, fy + winH * 0.65);
        g.closePath();
        g.fill();
      }

      // Petits-bois / meneaux blancs
      g.strokeStyle = '#e8e2d5';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(wx + ww / 2, fy);
      g.lineTo(wx + ww / 2, fy + winH);
      g.moveTo(wx, fy + winH * 0.35);
      g.lineTo(wx + ww, fy + winH * 0.35);
      g.stroke();

      // Garde-corps individuel en fer forgé noir
      g.strokeStyle = '#1b1f26';
      g.lineWidth = 1.5;
      g.strokeRect(wx - 2, fy + winH - 18, ww + 4, 18);
    }

    // Corniches & balcons filants en fer forgé aux 2e (fIdx===1) et 5e (fIdx===4) étages
    if (fIdx === 1 || fIdx === 4) {
      g.fillStyle = '#c5ba9f';
      g.fillRect(0, fy + winH + 2, W, 7);
      g.fillStyle = 'rgba(30, 26, 22, 0.32)';
      g.fillRect(0, fy + winH + 9, W, 4);
      // Ferronnerie filante
      g.fillStyle = '#191d24';
      g.fillRect(0, fy + winH - 16, W, 2.5);
      for (let bx = 4; bx < W; bx += 8) {
        g.fillRect(bx, fy + winH - 15, 1.5, 17);
      }
    }
  });

  // Grande corniche sommitale sous toit zinc
  g.fillStyle = '#efe8d9';
  g.fillRect(0, 0, W, 14);
  g.fillStyle = 'rgba(30, 26, 22, 0.36)';
  g.fillRect(0, 14, W, 6);

  return {
    map: toTex(c, anisotropy, true, 1, 1),
    roughnessMap: toTex(rc, anisotropy, false, 1, 1),
  };
}

/** Toit mansardé en zinc parisien à joints debout + lucarnes. */
export function createZincRoofMaps(anisotropy: number): TexturedPbrMaps {
  const W = 256;
  const H = 256;
  const [c, g] = makeCanvas(W, H);
  const [rc, rg] = makeCanvas(W, H);

  g.fillStyle = '#5a6470';
  g.fillRect(0, 0, W, H);
  rg.fillStyle = '#8c8c8c'; // roughness ~0.55
  rg.fillRect(0, 0, W, H);

  // Joints debout verticaux du zinc
  for (let x = 0; x < W; x += 12) {
    g.fillStyle = 'rgba(255, 255, 255, 0.08)';
    g.fillRect(x, 0, 1.5, H);
    g.fillStyle = 'rgba(15, 20, 28, 0.28)';
    g.fillRect(x + 1.5, 0, 1.5, H);
    rg.fillStyle = '#b4b4b4';
    rg.fillRect(x, 0, 2, H);
  }

  // Lucarnes mansardées régulières
  for (let x = 22; x < W; x += 64) {
    g.fillStyle = '#3f4752';
    g.fillRect(x - 3, 124, 26, 48);
    g.fillStyle = '#1c2635';
    g.fillRect(x, 130, 20, 38);
    rg.fillStyle = '#242424';
    rg.fillRect(x, 130, 20, 38);
    g.strokeStyle = '#d5cec0';
    g.lineWidth = 1.5;
    g.strokeRect(x, 130, 20, 38);
  }

  return {
    map: toTex(c, anisotropy, true, 2, 1),
    roughnessMap: toTex(rc, anisotropy, false, 2, 1),
  };
}

/** Frise céramique 1900 à losanges bleu pâle / cobalt (moulures biseautées CMP). */
export function createFriezeCeramiqueTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 512;
  const H = 64;
  const [c, g] = makeCanvas(W, H);

  // Fond faïence crème clair
  g.fillStyle = '#f2f1ec';
  g.fillRect(0, 0, W, H);

  // Moulures haute & basse bleu cobalt Émail
  g.fillStyle = '#1c2d6c';
  g.fillRect(0, 0, W, 9);
  g.fillRect(0, H - 9, W, 9);
  g.fillStyle = '#718fe3';
  g.fillRect(0, 9, W, 4);
  g.fillRect(0, H - 13, W, 4);

  // Losanges céramiques 2:1
  for (let x = 0; x < W; x += 64) {
    // Joint entre carreaux de frise
    g.strokeStyle = 'rgba(130, 140, 155, 0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, 13);
    g.lineTo(x, H - 13);
    g.stroke();

    // Losange bleu pâle bordé cobalt
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

    // Cabochon central émail
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
