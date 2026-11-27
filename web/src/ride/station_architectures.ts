import * as THREE from 'three';
import { isRerLineNum } from './routes_and_stock';

export type StationArchetype =
  | 'faience'
  | 'arts_et_metiers'
  | 'louvre_rivoli'
  | 'cite'
  | 'mural'
  | 'cathedral';

function normName(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-–—']/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function resolveStationArchetype(stationName: string, lineNum: string): StationArchetype {
  const n = normName(stationName);
  if (n.includes('arts et metiers')) return 'arts_et_metiers';
  if (n.includes('louvre') || n.includes('concorde') || n.includes('assemblee nationale')) {
    return 'louvre_rivoli';
  }
  if (n === 'cite') return 'cite';
  if (n.includes('abbesses') || n.includes('liege')) return 'mural';
  if (
    isRerLineNum(lineNum) ||
    n.includes('chatelet') ||
    n.includes('nation') ||
    n.includes('bastille') ||
    n.includes('bibliotheque francois') ||
    n.includes('aeroport d orly')
  ) {
    return 'cathedral';
  }
  return 'faience';
}

export interface ArchetypeMaterials {
  copperVault: THREE.MeshStandardMaterial;
  copperTrim: THREE.MeshStandardMaterial;
  copperGear: THREE.MeshStandardMaterial;
  portholeDisc: THREE.MeshBasicMaterial;
  stoneVault: THREE.MeshStandardMaterial;
  alcoveBack: THREE.MeshStandardMaterial;
  alcoveLight: THREE.MeshBasicMaterial;
  marbleStatue: THREE.MeshStandardMaterial;
  citeVault: THREE.MeshStandardMaterial;
  citeRib: THREE.MeshStandardMaterial;
  citeGlobe: THREE.MeshBasicMaterial;
  muralAbbesses: THREE.MeshStandardMaterial;
  muralLiege: THREE.MeshStandardMaterial;
  muralFrame: THREE.MeshStandardMaterial;
  cathedralVault: THREE.MeshStandardMaterial;
  ghostConcrete: THREE.MeshStandardMaterial;
  ghostWarmLamp: THREE.MeshBasicMaterial;
  ghostBarricade: THREE.MeshStandardMaterial;
}

function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  textures?: THREE.Texture[],
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.repeat.set(repeatX, repeatY);
  }
  textures?.push(tex);
  return tex;
}

export function createArchetypeMaterials(
  trackMat: <T extends THREE.Material>(m: T) => T,
  textures?: THREE.Texture[]
): ArchetypeMaterials {
  const copperTex = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#8f4d29');
      grad.addColorStop(0.5, '#874826');
      grad.addColorStop(1, '#753c1e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(42, 20, 10, 0.45)';
      ctx.lineWidth = 3;
      for (let x = 0; x <= w; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let px = 0; px < w; px += 64) {
        for (let py = 0; py < h; py += 64) {
          for (let r = 10; r < 60; r += 16) {
            for (const [rx, ry] of [
              [px + r, py + 7],
              [px + r, py + 57],
              [px + 7, py + r],
              [px + 57, py + r],
            ]) {
              ctx.fillStyle = '#bd7b48';
              ctx.beginPath();
              ctx.arc(rx, ry, 2.1, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    },
    textures,
    4,
    2
  );

  const portholeTex = makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, w * 0.5);
      g.addColorStop(0, '#f3c16c');
      g.addColorStop(0.32, '#4e83a8');
      g.addColorStop(0.76, '#1b3c5e');
      g.addColorStop(1, '#0e1e30');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255, 224, 155, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy);
      ctx.lineTo(cx + 18, cy);
      ctx.moveTo(cx, cy - 18);
      ctx.lineTo(cx, cy + 18);
      ctx.stroke();
    },
    textures
  );

  const stoneTex = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#cfc0a4';
      ctx.fillRect(0, 0, w, h);
      const rows = 4;
      const rowH = h / rows;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * 48;
        for (let c = -1; c < 4; c++) {
          const bx = c * 96 + offset;
          const by = r * rowH;
          const shade = ((r * 7 + c * 11) & 3) * 4 - 6;
          ctx.fillStyle = `rgb(${207 + shade}, ${192 + shade}, ${164 + shade})`;
          ctx.fillRect(bx + 2, by + 2, 92, rowH - 4);
        }
      }
      ctx.strokeStyle = 'rgba(110, 96, 74, 0.35)';
      ctx.lineWidth = 2;
      for (let r = 0; r <= rows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * rowH);
        ctx.lineTo(w, r * rowH);
        ctx.stroke();
      }
    },
    textures,
    4,
    2
  );

  const citeVaultTex = makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#1c4a38';
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) {
        for (let y = 0; y < h; y += 64) {
          ctx.fillStyle = '#163d2e';
          ctx.fillRect(x + 5, y + 5, 54, 54);
          ctx.strokeStyle = '#28664e';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 6, y + 6, 52, 52);
          ctx.fillStyle = '#2d7056';
          for (const [rx, ry] of [
            [x + 11, y + 11],
            [x + 53, y + 11],
            [x + 11, y + 53],
            [x + 53, y + 53],
          ]) {
            ctx.beginPath();
            ctx.arc(rx, ry, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    },
    textures,
    5,
    2
  );

  const muralAbbessesTex = makeCanvasTexture(
    512,
    256,
    (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
      sky.addColorStop(0, '#34699a');
      sky.addColorStop(1, '#f2cc8f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Rolling Montmartre hillside & terracotta facades
      ctx.fillStyle = '#6c8b58';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.62);
      ctx.quadraticCurveTo(w * 0.35, h * 0.45, w * 0.68, h * 0.58);
      ctx.lineTo(w, h * 0.52);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Sacre-Coeur basilica dome silhouette
      ctx.fillStyle = '#f5efe2';
      ctx.fillRect(w * 0.42, h * 0.32, 68, 48);
      ctx.beginPath();
      ctx.arc(w * 0.42 + 34, h * 0.32, 24, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w * 0.42 + 12, h * 0.35, 11, Math.PI, 0);
      ctx.arc(w * 0.42 + 56, h * 0.35, 11, Math.PI, 0);
      ctx.fill();

      // Montmartre terracotta roofs & warm village houses
      const roofs = ['#e07a5f', '#d1664d', '#e8986b', '#c85b42'];
      for (let i = 0; i < 8; i++) {
        const bx = 26 + i * 62;
        const by = h * 0.56 + (i % 2) * 14;
        ctx.fillStyle = '#f4e6cf';
        ctx.fillRect(bx, by, 48, h - by);
        ctx.fillStyle = roofs[i % roofs.length];
        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.lineTo(bx + 24, by - 18);
        ctx.lineTo(bx + 52, by);
        ctx.closePath();
        ctx.fill();
      }
    },
    textures
  );

  const muralLiegeTex = makeCanvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(0, 0, w, h);

      // Three Belgian ceramic triptych panels in cobalt blue & cream
      const panelW = (w - 64) / 3;
      for (let i = 0; i < 3; i++) {
        const px = 16 + i * (panelW + 16);
        ctx.strokeStyle = '#1b4785';
        ctx.lineWidth = 6;
        ctx.strokeRect(px, 18, panelW, h - 36);

        const sky = ctx.createLinearGradient(0, 24, 0, h - 24);
        sky.addColorStop(0, '#dbe7f5');
        sky.addColorStop(1, '#f4ecd8');
        ctx.fillStyle = sky;
        ctx.fillRect(px + 4, 22, panelW - 8, h - 44);

        // Cobalt architectural arch & Meuse silhouette
        ctx.fillStyle = '#255599';
        ctx.fillRect(px + 18, h * 0.56, panelW - 36, h * 0.3);
        ctx.fillStyle = '#193d73';
        ctx.beginPath();
        ctx.arc(px + panelW / 2, h * 0.44, 28, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(px + panelW / 2 - 28, h * 0.44, 56, 36);
      }

      // Glazed ceramic tile grout grid
      ctx.strokeStyle = 'rgba(28, 60, 110, 0.14)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
    textures
  );

  return {
    copperVault: trackMat(
      new THREE.MeshStandardMaterial({
        color: copperTex ? 0xffffff : 0x874826,
        ...(copperTex ? { map: copperTex } : {}),
        roughness: 0.34,
        metalness: 0.74,
        envMapIntensity: 0.88,
        side: THREE.DoubleSide,
      })
    ),
    copperTrim: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb87344,
        roughness: 0.28,
        metalness: 0.82,
        envMapIntensity: 0.95,
      })
    ),
    copperGear: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb8893c,
        roughness: 0.28,
        metalness: 0.84,
        envMapIntensity: 0.95,
      })
    ),
    portholeDisc: trackMat(
      new THREE.MeshBasicMaterial({
        color: portholeTex ? 0xffffff : 0x2f6894,
        ...(portholeTex ? { map: portholeTex } : {}),
      })
    ),
    stoneVault: trackMat(
      new THREE.MeshStandardMaterial({
        color: stoneTex ? 0xffffff : 0xcfc0a4,
        ...(stoneTex ? { map: stoneTex } : {}),
        roughness: 0.86,
        metalness: 0.04,
        envMapIntensity: 0.25,
        side: THREE.DoubleSide,
      })
    ),
    alcoveBack: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x24201c,
        roughness: 0.9,
        metalness: 0.05,
      })
    ),
    alcoveLight: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffedb8,
      })
    ),
    marbleStatue: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xece5d8,
        roughness: 0.42,
        metalness: 0.06,
        envMapIntensity: 0.35,
      })
    ),
    citeVault: trackMat(
      new THREE.MeshStandardMaterial({
        color: citeVaultTex ? 0xffffff : 0x1c4a38,
        ...(citeVaultTex ? { map: citeVaultTex } : {}),
        roughness: 0.42,
        metalness: 0.48,
        envMapIntensity: 0.65,
        side: THREE.DoubleSide,
      })
    ),
    citeRib: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x143628,
        roughness: 0.38,
        metalness: 0.62,
        envMapIntensity: 0.72,
      })
    ),
    citeGlobe: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfff0c4,
      })
    ),
    muralAbbesses: trackMat(
      new THREE.MeshStandardMaterial({
        color: muralAbbessesTex ? 0xffffff : 0x34699a,
        ...(muralAbbessesTex ? { map: muralAbbessesTex } : {}),
        roughness: 0.36,
        metalness: 0.04,
        envMapIntensity: 0.3,
      })
    ),
    muralLiege: trackMat(
      new THREE.MeshStandardMaterial({
        color: muralLiegeTex ? 0xffffff : 0x255599,
        ...(muralLiegeTex ? { map: muralLiegeTex } : {}),
        roughness: 0.32,
        metalness: 0.04,
        envMapIntensity: 0.3,
      })
    ),
    muralFrame: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262930,
        roughness: 0.55,
        metalness: 0.35,
      })
    ),
    cathedralVault: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x454952,
        roughness: 0.78,
        metalness: 0.14,
        envMapIntensity: 0.4,
        side: THREE.DoubleSide,
      })
    ),
    ghostConcrete: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262523,
        roughness: 0.94,
        metalness: 0.04,
        envMapIntensity: 0.1,
      })
    ),
    ghostWarmLamp: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
      })
    ),
    ghostBarricade: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4b3d2e,
        roughness: 0.9,
        metalness: 0.05,
      })
    ),
  };
}

function mergeSimpleGeos(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of parts) {
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
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/**
 * Adds iconic Parisian architectural station decorations using InstancedMesh
 * so each themed station stays within a tight draw-call budget.
 */
export function addArchetypeDecorations(
  group: THREE.Group,
  archetype: StationArchetype,
  mats: ArchetypeMaterials,
  geos: THREE.BufferGeometry[],
  stationName = ''
): void {
  const dummy = new THREE.Object3D();

  if (archetype === 'arts_et_metiers') {
    // 1. Copper vault transverse ribs arching across the vault
    const ribGeo = new THREE.TorusGeometry(6.8, 0.085, 8, 24, Math.PI);
    geos.push(ribGeo);
    const ribXs = [-35, -21, -7, 7, 21, 35];
    const ribIm = new THREE.InstancedMesh(ribGeo, mats.copperTrim, ribXs.length);
    ribXs.forEach((x, idx) => {
      dummy.position.set(x, 2.05, 0);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.scale.set(1, 0.64, 1);
      dummy.updateMatrix();
      ribIm.setMatrixAt(idx, dummy.matrix);
    });
    ribIm.instanceMatrix.needsUpdate = true;
    group.add(ribIm);

    // 2. Brass flanged porthole rings + backlit deep blue-amber porthole discs
    const portholeGeo = new THREE.TorusGeometry(0.68, 0.09, 8, 20);
    const discGeo = new THREE.CircleGeometry(0.62, 18);
    geos.push(portholeGeo, discGeo);
    const portXs = [-36, -22, -8, 8, 22, 36];
    const ringIm = new THREE.InstancedMesh(portholeGeo, mats.copperGear, portXs.length * 2);
    const discIm = new THREE.InstancedMesh(discGeo, mats.portholeDisc, portXs.length * 2);
    let idx = 0;
    for (const x of portXs) {
      for (const side of [-1, 1]) {
        dummy.position.set(x, 2.25, side * 6.82);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 0.35);
        dummy.updateMatrix();
        ringIm.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(x, 2.25, side * 6.81);
        dummy.rotation.set(0, side > 0 ? Math.PI : 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        discIm.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    ringIm.instanceMatrix.needsUpdate = true;
    discIm.instanceMatrix.needsUpdate = true;
    group.add(ringIm, discIm);

    // 3. Ceiling brass gear medallions at x = -24, 0, 24, y = 6.25
    const gearParts: THREE.BufferGeometry[] = [
      new THREE.CylinderGeometry(0.82, 0.82, 0.14, 16),
      new THREE.TorusGeometry(1.12, 0.12, 6, 18).rotateX(Math.PI / 2),
    ];
    for (let t = 0; t < 12; t++) {
      const a = (t / 12) * Math.PI * 2;
      const tooth = new THREE.BoxGeometry(0.24, 0.14, 0.34);
      tooth.rotateY(-a);
      tooth.translate(Math.cos(a) * 1.24, 0, Math.sin(a) * 1.24);
      gearParts.push(tooth);
    }
    const gearGeo = mergeSimpleGeos(gearParts);
    gearParts.forEach((p) => p.dispose());
    geos.push(gearGeo);
    const gearXs = [-24, 0, 24];
    const gearIm = new THREE.InstancedMesh(gearGeo, mats.copperGear, gearXs.length);
    gearXs.forEach((x, gi) => {
      dummy.position.set(x, 6.25, 0);
      dummy.rotation.set(0, gi * 0.28, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      gearIm.setMatrixAt(gi, dummy.matrix);
    });
    gearIm.instanceMatrix.needsUpdate = true;
    group.add(gearIm);
  } else if (archetype === 'louvre_rivoli') {
    // 1. Limestone pilasters
    const pilasterGeo = new THREE.BoxGeometry(0.45, 3.2, 0.28);
    geos.push(pilasterGeo);
    const pilXs = [-48, -32, -16, 0, 16, 32, 48];
    const pilIm = new THREE.InstancedMesh(pilasterGeo, mats.stoneVault, pilXs.length * 2);
    let idx = 0;
    for (const x of pilXs) {
      for (const side of [-1, 1]) {
        dummy.position.set(x, 1.8, side * 6.75);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pilIm.setMatrixAt(idx++, dummy.matrix);
      }
    }
    pilIm.instanceMatrix.needsUpdate = true;
    group.add(pilIm);

    // 2. 4 illuminated recessed museum alcoves per platform with plinths + sculpted marble busts
    const alcoveXs = [-26, -9, 9, 26];
    const count = alcoveXs.length * 2;
    const recessGeo = new THREE.BoxGeometry(2.05, 2.45, 0.24);
    const lightBarGeo = new THREE.BoxGeometry(1.65, 0.08, 0.16);
    const plinthGeo = new THREE.BoxGeometry(0.75, 1.05, 0.55);
    const statueParts: THREE.BufferGeometry[] = [
      new THREE.CylinderGeometry(0.24, 0.3, 0.45, 10).translate(0, 0.225, 0),
      new THREE.CylinderGeometry(0.16, 0.22, 0.42, 10).translate(0, 0.65, 0),
      new THREE.SphereGeometry(0.18, 10, 8).translate(0, 1.0, 0),
    ];
    const statueGeo = mergeSimpleGeos(statueParts);
    statueParts.forEach((p) => p.dispose());
    geos.push(recessGeo, lightBarGeo, plinthGeo, statueGeo);

    const recessIm = new THREE.InstancedMesh(recessGeo, mats.alcoveBack, count);
    const lightIm = new THREE.InstancedMesh(lightBarGeo, mats.alcoveLight, count);
    const plinthIm = new THREE.InstancedMesh(plinthGeo, mats.stoneVault, count);
    const statueIm = new THREE.InstancedMesh(statueGeo, mats.marbleStatue, count);

    let ai = 0;
    for (const x of alcoveXs) {
      for (const side of [-1, 1]) {
        dummy.position.set(x, 2.38, side * 6.72);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        recessIm.setMatrixAt(ai, dummy.matrix);

        dummy.position.set(x, 3.48, side * 6.58);
        dummy.updateMatrix();
        lightIm.setMatrixAt(ai, dummy.matrix);

        dummy.position.set(x, 1.65, side * 6.46);
        dummy.updateMatrix();
        plinthIm.setMatrixAt(ai, dummy.matrix);

        dummy.position.set(x, 2.18, side * 6.46);
        dummy.rotation.set(0, side > 0 ? Math.PI : 0, 0);
        dummy.updateMatrix();
        statueIm.setMatrixAt(ai, dummy.matrix);
        ai++;
      }
    }
    recessIm.instanceMatrix.needsUpdate = true;
    lightIm.instanceMatrix.needsUpdate = true;
    plinthIm.instanceMatrix.needsUpdate = true;
    statueIm.instanceMatrix.needsUpdate = true;
    group.add(recessIm, lightIm, plinthIm, statueIm);
  } else if (archetype === 'cite') {
    // 1. Deep green riveted cast-iron vertical columns + arched caisson vault ribs every 12 m
    const ribXs = [-48, -36, -24, -12, 0, 12, 24, 36, 48];
    const colGeo = new THREE.BoxGeometry(0.32, 2.2, 0.28);
    const archRibGeo = new THREE.TorusGeometry(6.8, 0.09, 8, 24, Math.PI);
    geos.push(colGeo, archRibGeo);

    const colIm = new THREE.InstancedMesh(colGeo, mats.citeRib, ribXs.length * 2);
    const archIm = new THREE.InstancedMesh(archRibGeo, mats.citeRib, ribXs.length);
    let ci = 0;
    ribXs.forEach((x, ri) => {
      dummy.position.set(x, 2.05, 0);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.scale.set(1, 0.64, 1);
      dummy.updateMatrix();
      archIm.setMatrixAt(ri, dummy.matrix);

      for (const side of [-1, 1]) {
        dummy.position.set(x, 1.6, side * 6.76);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        colIm.setMatrixAt(ci++, dummy.matrix);
      }
    });
    colIm.instanceMatrix.needsUpdate = true;
    archIm.instanceMatrix.needsUpdate = true;
    group.add(colIm, archIm);

    // 2. Classic retro glowing double-globe pendant lamps along both platforms (y = 4.25)
    const lampXs = [-36, -18, 0, 18, 36];
    const pendantParts: THREE.BufferGeometry[] = [
      new THREE.CylinderGeometry(0.03, 0.03, 1.45, 6).translate(0, 0.72, 0),
      new THREE.BoxGeometry(0.08, 0.08, 0.76).translate(0, 0.08, 0),
    ];
    const stemGeo = mergeSimpleGeos(pendantParts);
    pendantParts.forEach((p) => p.dispose());
    const globeGeo = new THREE.SphereGeometry(0.24, 10, 8);
    geos.push(stemGeo, globeGeo);

    const stemIm = new THREE.InstancedMesh(stemGeo, mats.citeRib, lampXs.length * 2);
    const globeIm = new THREE.InstancedMesh(globeGeo, mats.citeGlobe, lampXs.length * 4);
    let si = 0;
    let gi = 0;
    for (const x of lampXs) {
      for (const side of [-1, 1]) {
        const pz = side * 4.65;
        dummy.position.set(x, 4.25, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stemIm.setMatrixAt(si++, dummy.matrix);

        for (const dz of [-0.34, 0.34]) {
          dummy.position.set(x, 4.25, pz + dz);
          dummy.updateMatrix();
          globeIm.setMatrixAt(gi++, dummy.matrix);
        }
      }
    }
    stemIm.instanceMatrix.needsUpdate = true;
    globeIm.instanceMatrix.needsUpdate = true;
    group.add(stemIm, globeIm);
  } else if (archetype === 'mural') {
    // 4 framed ceramic mural panels per platform (Abbesses or Liège)
    const muralXs = [-26, -9, 9, 26];
    const frameGeo = new THREE.BoxGeometry(3.55, 1.95, 0.14);
    const panelGeo = new THREE.PlaneGeometry(3.25, 1.68);
    geos.push(frameGeo, panelGeo);

    const muralMat = normName(stationName).includes('liege') ? mats.muralLiege : mats.muralAbbesses;
    const frameIm = new THREE.InstancedMesh(frameGeo, mats.muralFrame, muralXs.length * 2);
    const panelIm = new THREE.InstancedMesh(panelGeo, muralMat, muralXs.length * 2);
    let mi = 0;
    for (const x of muralXs) {
      for (const side of [-1, 1]) {
        dummy.position.set(x, 2.65, side * 6.72);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        frameIm.setMatrixAt(mi, dummy.matrix);

        dummy.position.set(x, 2.65, side * 6.63);
        dummy.rotation.set(0, side > 0 ? Math.PI : 0, 0);
        dummy.updateMatrix();
        panelIm.setMatrixAt(mi, dummy.matrix);
        mi++;
      }
    }
    frameIm.instanceMatrix.needsUpdate = true;
    panelIm.instanceMatrix.needsUpdate = true;
    group.add(frameIm, panelIm);
  }
}

/**
 * Builds an atmospheric darkened "station fantôme" bay inside a tunnel stretch
 * (Arsenal, Saint-Martin, Croix-Rouge, Champ de Mars, Martin Nadaud).
 */
export function createGhostVaultBay(params: {
  poseAtS: { x: number; z: number; h: number };
  plaqueTexture: THREE.Texture;
  mats: ArchetypeMaterials;
  geos: THREE.BufferGeometry[];
}): { group: THREE.Group; dispose: () => void } {
  const { poseAtS, plaqueTexture, mats, geos } = params;
  const g = new THREE.Group();
  g.position.set(poseAtS.x, 0, poseAtS.z);
  g.rotation.y = -poseAtS.h;

  const bayLen = 58;
  const platGeo = new THREE.BoxGeometry(bayLen, 0.96, 2.4);
  const fenceGeo = new THREE.BoxGeometry(bayLen - 6, 0.92, 0.14);
  const lampGeo = new THREE.BoxGeometry(1.4, 0.1, 0.22);
  const plaqueGeo = new THREE.PlaneGeometry(3.4, 0.64);
  geos.push(platGeo, fenceGeo, lampGeo, plaqueGeo);

  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTexture, side: THREE.DoubleSide });

  for (const side of [-1, 1]) {
    const plat = new THREE.Mesh(platGeo, mats.ghostConcrete);
    plat.position.set(0, 0.48, side * 5.15);
    g.add(plat);

    const fence = new THREE.Mesh(fenceGeo, mats.ghostBarricade);
    fence.position.set(0, 1.42, side * 4.18);
    g.add(fence);

    const lamp = new THREE.Mesh(lampGeo, mats.ghostWarmLamp);
    lamp.position.set(0, 3.35, side * 5.3);
    g.add(lamp);

    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(0, 2.35, side * 6.32);
    plaque.rotation.y = side > 0 ? Math.PI : 0;
    g.add(plaque);
  }

  const dimGlow = new THREE.PointLight(0xf59e0b, 0.9, 28, 1.5);
  dimGlow.position.set(0, 3.0, 0);
  g.add(dimGlow);

  return {
    group: g,
    dispose: () => {
      plaqueMat.dispose();
    },
  };
}
