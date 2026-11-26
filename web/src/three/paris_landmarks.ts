import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

const PI = Math.PI;
const GY = -7;

export interface Pose2D {
  x: number;
  z: number;
  h: number;
}

export interface LandmarkMaterials {
  tower: THREE.Material;
  towerDark: THREE.Material;
  towerGlass: THREE.Material;
  towerBeacon: THREE.Material;
  towerRedLight: THREE.Material;
  headlightBeam: THREE.Material;
  trunk: THREE.Material;
  foliage: THREE.Material;
  lawn: THREE.Material;
  gravel: THREE.Material;
  viaduct: THREE.Material;
  iron: THREE.Material;
  ironRail: THREE.Material;
  water: THREE.Material;
  lamp: THREE.Material;
  housing: THREE.Material;
  hull: THREE.Material;
  cabinLit: THREE.Material;
}

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

function commitMergedParts(
  grp: THREE.Group,
  parts: THREE.BufferGeometry[],
  mat: THREE.Material,
  geos: THREE.BufferGeometry[]
): void {
  if (!parts.length) return;
  const merged = mergeGeosLocal(parts);
  parts.forEach((p) => p.dispose());
  geos.push(merged);
  grp.add(new THREE.Mesh(merged, mat));
}

function pushOrientedStrut(
  parts: THREE.BufferGeometry[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  segs = 5
): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.05) return;
  const g = new THREE.CylinderGeometry(radius, radius, len, segs, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  parts.push(g);
}

/** True Eiffel half-width curve (meters) from ground y=0 to 306m. */
export function eiffelHalfWidth(y: number): number {
  if (y <= 57) {
    const t = y / 57;
    return 62.5 - (62.5 - 35.5) * Math.pow(t, 0.85);
  }
  if (y <= 115) {
    const t = (y - 57) / 58;
    return 35.5 - (35.5 - 19.5) * Math.pow(t, 0.88);
  }
  if (y <= 276) {
    const t = (y - 115) / 161;
    return 19.5 * Math.pow(5.6 / 19.5, Math.pow(t, 0.72));
  }
  const t = Math.min(1, Math.max(0, (y - 276) / 30));
  return 5.6 - (5.6 - 2.6) * t;
}

/**
 * High-detail 330m Tour Eiffel landmark + Champ-de-Mars esplanade + rotating searchlights.
 * All iron lattice work is merged into 1 draw call; trees use InstancedMesh.
 */
export function buildEiffelTower(
  geos: THREE.BufferGeometry[],
  mats: LandmarkMaterials,
  isMobileGpu: boolean
): { group: THREE.Group; update: (elapsedSec: number) => void } {
  const grp = new THREE.Group();
  const latticeParts: THREE.BufferGeometry[] = [];
  const upAxis = new THREE.Vector3(0, 1, 0);

  const addStrut = (a: THREE.Vector3, b: THREE.Vector3, radius: number, segs = 4) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.08) return;
    const g = new THREE.CylinderGeometry(radius, radius, len, segs, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(upAxis, dir.normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    latticeParts.push(g);
  };

  const addBoxPart = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    latticeParts.push(g);
  };

  const corners: Array<[number, number]> = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];

  // 1. 4 sculpted 3D box-truss pillars from 0 -> 115 m (two stages: 0->57, 57->115)
  const legBands = isMobileGpu
    ? [0, 14, 28, 43, 57, 76, 95, 115]
    : [0, 11, 22, 33, 45, 57, 71, 85, 100, 115];

  for (let b = 0; b < legBands.length - 1; b++) {
    const y0 = legBands[b];
    const y1 = legBands[b + 1];
    const r0 = eiffelHalfWidth(y0);
    const r1 = eiffelHalfWidth(y1);
    const w0 = y0 < 57 ? 9.6 - (y0 / 57) * 3.8 : 5.8 - ((y0 - 57) / 58) * 2.2;
    const w1 = y1 < 57 ? 9.6 - (y1 / 57) * 3.8 : 5.8 - ((y1 - 57) / 58) * 2.2;
    const chThick = y0 < 57 ? 0.72 : 0.56;

    for (const [sx, sz] of corners) {
      // 4 chords forming the square box-truss of each corner leg
      const offsets: Array<[number, number]> = [
        [0, 0],
        [-sx, 0],
        [0, -sz],
        [-sx, -sz],
      ];
      const ring0 = offsets.map(
        ([ox, oz]) => new THREE.Vector3(sx * r0 + ox * w0, y0, sz * r0 + oz * w0)
      );
      const ring1 = offsets.map(
        ([ox, oz]) => new THREE.Vector3(sx * r1 + ox * w1, y1, sz * r1 + oz * w1)
      );
      for (let i = 0; i < 4; i++) {
        addStrut(ring0[i], ring1[i], chThick, 4);
      }
      // Ring ties + diagonal X braces on visible faces of the pillar
      const facePairs: Array<[number, number]> = [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
      ];
      for (const [ia, ib] of facePairs) {
        addStrut(ring1[ia], ring1[ib], chThick * 0.45, 4);
        addStrut(ring0[ia], ring1[ib], chThick * 0.36, 4);
        addStrut(ring0[ib], ring1[ia], chThick * 0.36, 4);
      }
    }

    // Concrete masonry anchor pedestals under the 4 corner feet at y=0
    if (b === 0) {
      for (const [sx, sz] of corners) {
        addBoxPart(12.5, 4.5, 12.5, sx * (r0 - 4.2), 2.25, sz * (r0 - 4.2));
      }
    }
  }

  // 2. 4 authentic lower arches with curved chords + spandrel struts into the 1st floor girder
  const archSteps = isMobileGpu ? 10 : 14;
  for (let face = 0; face < 4; face++) {
    const verticalIsZ = face % 2 === 0;
    const sign = face < 2 ? 1 : -1;
    const spanHalf = 36.5;
    const archH = 42.5;
    const archY = 55.2;
    const prevPts: THREE.Vector3[] = [];
    for (let i = 0; i <= archSteps; i++) {
      const a = (PI * i) / archSteps;
      const u = -spanHalf * Math.cos(a);
      const y = 13 + Math.sin(a) * (archH - 13);
      const rAtY = eiffelHalfWidth(y) - 1.8;
      const p = verticalIsZ
        ? new THREE.Vector3(u, y, sign * rAtY)
        : new THREE.Vector3(sign * rAtY, y, u);
      const pUp = verticalIsZ
        ? new THREE.Vector3(u, y + 2.4, sign * rAtY)
        : new THREE.Vector3(sign * rAtY, y + 2.4, u);
      prevPts.push(p);
      if (i > 0) {
        addStrut(prevPts[i - 1], p, 0.65, 5);
      }
      if (i > 0 && i < archSteps && i % 2 === 0) {
        const topP = verticalIsZ
          ? new THREE.Vector3(u, archY, sign * eiffelHalfWidth(archY))
          : new THREE.Vector3(sign * eiffelHalfWidth(archY), archY, u);
        addStrut(pUp, topP, 0.36, 4);
      }
    }
  }

  // 3. Central elevator spine truss (1st floor 57 m -> 2nd floor 115 m)
  const coreY = [57, 76, 95, 115];
  for (let c = 0; c < coreY.length - 1; c++) {
    const y0 = coreY[c];
    const y1 = coreY[c + 1];
    const rw = 4.6;
    const c0 = corners.map(([sx, sz]) => new THREE.Vector3(sx * rw, y0, sz * rw));
    const c1 = corners.map(([sx, sz]) => new THREE.Vector3(sx * rw, y1, sz * rw));
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      addStrut(c0[i], c1[i], 0.48, 4);
      addStrut(c0[i], c1[next], 0.3, 4);
      addStrut(c0[next], c1[i], 0.3, 4);
    }
  }

  // 4. Tapered lattice shaft from 2nd floor (115 m) -> 3rd floor (276 m) -> summit mast (306 m)
  const shaftBays = isMobileGpu ? 6 : 8;
  for (let t = 0; t < shaftBays; t++) {
    const y0 = 115 + (161 * t) / shaftBays;
    const y1 = 115 + (161 * (t + 1)) / shaftBays;
    const r0 = eiffelHalfWidth(y0);
    const r1 = eiffelHalfWidth(y1);
    const thick = 1.25 - 0.6 * (t / shaftBays);
    const ring0 = corners.map(([sx, sz]) => new THREE.Vector3(sx * r0, y0, sz * r0));
    const ring1 = corners.map(([sx, sz]) => new THREE.Vector3(sx * r1, y1, sz * r1));
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      addStrut(ring0[i], ring1[i], thick, 5);
      addStrut(ring1[i], ring1[next], thick * 0.55, 4);
      addStrut(ring0[i], ring1[next], thick * 0.42, 4);
      addStrut(ring0[next], ring1[i], thick * 0.42, 4);
    }
  }

  // Summit spire lattice (282 m -> 306 m) + tall broadcast antenna (306 m -> 330 m)
  {
    const r0 = 4.2;
    const r1 = 2.0;
    const c0 = corners.map(([sx, sz]) => new THREE.Vector3(sx * r0, 282, sz * r0));
    const c1 = corners.map(([sx, sz]) => new THREE.Vector3(sx * r1, 306, sz * r1));
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      addStrut(c0[i], c1[i], 0.42, 4);
      addStrut(c0[i], c1[next], 0.25, 4);
      addStrut(c0[next], c1[i], 0.25, 4);
    }
    addStrut(new THREE.Vector3(0, 304, 0), new THREE.Vector3(0, 320, 0), 0.72, 6);
    addStrut(new THREE.Vector3(0, 320, 0), new THREE.Vector3(0, 330, 0), 0.34, 6);
  }

  const latticeGeo = mergeGeosLocal(latticeParts);
  latticeParts.forEach((p) => p.dispose());
  geos.push(latticeGeo);
  grp.add(new THREE.Mesh(latticeGeo, mats.tower));

  // 5. Open-courtyard 1st floor deck (y = 57 m) + cantilevered cornice + glazed pavilions
  const f1Perimeter: THREE.BufferGeometry[] = [];
  const f1W = 73;
  const f1Band = 12.5;
  const f1H = 5.2;
  f1Perimeter.push(
    new THREE.BoxGeometry(f1W, f1H, f1Band).translate(0, 57, (f1W - f1Band) / 2),
    new THREE.BoxGeometry(f1W, f1H, f1Band).translate(0, 57, -(f1W - f1Band) / 2),
    new THREE.BoxGeometry(f1Band, f1H, f1W - 2 * f1Band).translate((f1W - f1Band) / 2, 57, 0),
    new THREE.BoxGeometry(f1Band, f1H, f1W - 2 * f1Band).translate(-(f1W - f1Band) / 2, 57, 0)
  );
  const f1DeckGeo = mergeGeosLocal(f1Perimeter);
  f1Perimeter.forEach((p) => p.dispose());
  geos.push(f1DeckGeo);
  grp.add(new THREE.Mesh(f1DeckGeo, mats.tower));

  // Warm pavilion windows on 1st floor + 2nd floor + 3rd floor
  const glassParts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(28, 3.8, 7.5).translate(0, 61.5, 29),
    new THREE.BoxGeometry(28, 3.8, 7.5).translate(0, 61.5, -29),
    new THREE.BoxGeometry(11.5, 5.2, 11.5).translate(0, 279, 0),
  ];
  const glassGeo = mergeGeosLocal(glassParts);
  glassParts.forEach((p) => p.dispose());
  geos.push(glassGeo);
  grp.add(new THREE.Mesh(glassGeo, mats.towerGlass));

  // 2nd floor double deck (y = 115 m) & 3rd floor double observation gallery + cupola (y = 276..286 m)
  const decksGeo = mergeGeosLocal([
    new THREE.BoxGeometry(43, 4.4, 43).translate(0, 114.5, 0),
    new THREE.BoxGeometry(36, 3.2, 36).translate(0, 118.2, 0),
    new THREE.BoxGeometry(16, 3.6, 16).translate(0, 275.5, 0),
    new THREE.BoxGeometry(13, 2.8, 13).translate(0, 282.5, 0),
    new THREE.SphereGeometry(5.8, 14, 10, 0, PI * 2, 0, PI * 0.5).translate(0, 283.8, 0),
  ]);
  geos.push(decksGeo);
  grp.add(new THREE.Mesh(decksGeo, mats.towerDark));

  // Warm golden frieze illumination strips around the hollow 1st-floor courtyard & 2nd/3rd rims
  const f1RimT = 2.2;
  const f1Outer = f1W + 0.6;
  const f2W = 43.6;
  const f2RimT = 1.8;
  const stripGeo = mergeGeosLocal([
    new THREE.BoxGeometry(f1Outer, 0.85, f1RimT).translate(0, 54.3, (f1Outer - f1RimT) / 2),
    new THREE.BoxGeometry(f1Outer, 0.85, f1RimT).translate(0, 54.3, -(f1Outer - f1RimT) / 2),
    new THREE.BoxGeometry(f1RimT, 0.85, f1Outer - 2 * f1RimT).translate(
      (f1Outer - f1RimT) / 2,
      54.3,
      0
    ),
    new THREE.BoxGeometry(f1RimT, 0.85, f1Outer - 2 * f1RimT).translate(
      -(f1Outer - f1RimT) / 2,
      54.3,
      0
    ),
    new THREE.BoxGeometry(f2W, 0.75, f2RimT).translate(0, 112.1, (f2W - f2RimT) / 2),
    new THREE.BoxGeometry(f2W, 0.75, f2RimT).translate(0, 112.1, -(f2W - f2RimT) / 2),
    new THREE.BoxGeometry(f2RimT, 0.75, f2W - 2 * f2RimT).translate((f2W - f2RimT) / 2, 112.1, 0),
    new THREE.BoxGeometry(f2RimT, 0.75, f2W - 2 * f2RimT).translate(-(f2W - f2RimT) / 2, 112.1, 0),
    new THREE.BoxGeometry(16.6, 0.65, 16.6).translate(0, 273.5, 0),
  ]);
  geos.push(stripGeo);
  grp.add(new THREE.Mesh(stripGeo, mats.towerBeacon));

  // Summit rotating Eiffel searchlight beams + aviation warning lamp
  const beaconRot = new THREE.Group();
  beaconRot.position.set(0, 294, 0);
  const coneGeo = new THREE.ConeGeometry(16, 175, 14, 1, true);
  coneGeo.rotateZ(PI / 2);
  coneGeo.translate(88, 0, 0);
  geos.push(coneGeo);
  const coneA = new THREE.Mesh(coneGeo, mats.headlightBeam);
  const coneB = new THREE.Mesh(coneGeo, mats.headlightBeam);
  coneB.rotation.y = PI;
  const beaconCoreGeo = new THREE.SphereGeometry(2.2, 10, 8);
  geos.push(beaconCoreGeo);
  beaconRot.add(coneA, coneB, new THREE.Mesh(beaconCoreGeo, mats.towerBeacon));
  grp.add(beaconRot);

  const avLightGeo = new THREE.SphereGeometry(1.15, 8, 8);
  geos.push(avLightGeo);
  const avLight = new THREE.Mesh(avLightGeo, mats.towerRedLight);
  avLight.position.set(0, 330.6, 0);
  grp.add(avLight);

  // 6. Champ-de-Mars esplanade (lawn + central gravel promenade + avenue chestnut trees)
  const lawnGeo = new THREE.PlaneGeometry(340, 340);
  lawnGeo.rotateX(-PI / 2);
  const pathGeo = new THREE.PlaneGeometry(38, 320);
  pathGeo.rotateX(-PI / 2);
  geos.push(lawnGeo, pathGeo);
  const lawnMesh = new THREE.Mesh(lawnGeo, mats.lawn);
  lawnMesh.position.y = 0.04;
  const pathMesh = new THREE.Mesh(pathGeo, mats.gravel);
  pathMesh.position.y = 0.06;
  grp.add(lawnMesh, pathMesh);

  const trunkGeo = new THREE.CylinderGeometry(0.42, 0.62, 5.5, 6);
  const crownGeo = new THREE.DodecahedronGeometry(4.4, 1);
  geos.push(trunkGeo, crownGeo);
  const treeCoords: Array<[number, number]> = [];
  for (let r = -125; r <= 125; r += 25) {
    if (Math.abs(r) < 68) continue;
    treeCoords.push([-32, r], [32, r], [-68, r], [68, r]);
  }
  for (let a = 0; a < 20; a++) {
    const ang = (a / 20) * PI * 2;
    treeCoords.push([Math.cos(ang) * 86, Math.sin(ang) * 86]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, treeCoords.length);
  const crowns = new THREE.InstancedMesh(crownGeo, mats.foliage, treeCoords.length);
  const tm = new THREE.Matrix4();
  const cColor = new THREE.Color();
  treeCoords.forEach(([tx, tz], i) => {
    tm.makeTranslation(tx, 2.75, tz);
    trunks.setMatrixAt(i, tm);
    const s = 0.88 + ((i * 7) % 5) * 0.14;
    tm.compose(
      new THREE.Vector3(tx, 7.6, tz),
      new THREE.Quaternion(),
      new THREE.Vector3(s, s * 1.08, s)
    );
    crowns.setMatrixAt(i, tm);
    cColor.setHSL(0.28 + ((i * 11) % 5) * 0.014, 0.34, 0.27 + (i % 3) * 0.03);
    crowns.setColorAt(i, cColor);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  grp.add(trunks, crowns);

  return {
    group: grp,
    update(elapsedSec: number) {
      beaconRot.rotation.y = elapsedSec * 0.42;
      const pulse = 0.72 + 0.28 * Math.sin(elapsedSec * 3.1);
      avLight.scale.setScalar(0.85 + 0.25 * pulse);
    },
  };
}

/**
 * Pont de Bir-Hakeim / Pont de Bercy steel colonnades, stone cutwater piers,
 * riveted viaduct trusses and classic Parisian double-globe bridge lamps.
 */
export function buildBirHakeimViaductDetails(
  s0: number,
  s1: number,
  river: [number, number] | null,
  poseFn: (s: number, out?: Pose2D) => Pose2D,
  geos: THREE.BufferGeometry[],
  mats: LandmarkMaterials,
  isMobileGpu: boolean
): THREE.Group {
  const g = new THREE.Group();
  const startS = river ? Math.max(s0, river[0] - 24) : s0;
  const endS = river ? Math.min(s1, river[1] + 24) : s1;
  const P = { x: 0, z: 0, h: 0 };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  // Colonnes en fonte verte + consoles sous le tablier le long de la traversée
  const spans: number[] = [];
  for (let s = startS + 9; s < endS - 6; s += isMobileGpu ? 22 : 16) spans.push(s);
  if (spans.length) {
    const colGeo = new THREE.CylinderGeometry(0.16, 0.21, 3.8, 8);
    const globeGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const trussGeo = new THREE.BoxGeometry(0.28, 0.78, 8.8);
    geos.push(colGeo, globeGeo, trussGeo);

    const cols = new THREE.InstancedMesh(colGeo, mats.iron, spans.length * 2);
    const lamps = new THREE.InstancedMesh(globeGeo, mats.lamp, spans.length * 2);
    const trusses = new THREE.InstancedMesh(trussGeo, mats.iron, spans.length);
    const m4 = new THREE.Matrix4();
    let ci = 0;
    let li = 0;
    spans.forEach((s, idx) => {
      poseFn(s, P);
      q.setFromAxisAngle(up, -P.h);
      m4.compose(new THREE.Vector3(P.x, -1.35, P.z), q, new THREE.Vector3(1, 1, 1));
      trusses.setMatrixAt(idx, m4);

      const nx = -Math.sin(P.h);
      const nz = Math.cos(P.h);
      [-4.36, 4.36].forEach((lat) => {
        m4.compose(
          new THREE.Vector3(P.x + nx * lat, 2.2, P.z + nz * lat),
          q,
          new THREE.Vector3(1, 1, 1)
        );
        cols.setMatrixAt(ci++, m4);

        m4.compose(
          new THREE.Vector3(P.x + nx * lat, 4.15, P.z + nz * lat),
          q,
          new THREE.Vector3(1, 1, 1)
        );
        lamps.setMatrixAt(li++, m4);
      });
    });
    cols.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    trusses.instanceMatrix.needsUpdate = true;
    g.add(cols, lamps, trusses);
  }

  // Avant-becs sculptés en pierre de taille sur les piles de la Seine
  if (river) {
    const cutwaterPts: number[] = [];
    for (let s = river[0] + 18; s < river[1] - 12; s += 36) cutwaterPts.push(s);
    if (cutwaterPts.length) {
      const cwGeo = new THREE.CylinderGeometry(1.1, 1.45, -GY - 1.2, 6);
      geos.push(cwGeo);
      const cwMesh = new THREE.InstancedMesh(cwGeo, mats.viaduct, cutwaterPts.length * 2);
      const m4 = new THREE.Matrix4();
      let idx = 0;
      cutwaterPts.forEach((s) => {
        poseFn(s, P);
        q.setFromAxisAngle(up, -P.h);
        const nx = -Math.sin(P.h);
        const nz = Math.cos(P.h);
        [-4.2, 4.2].forEach((lat) => {
          m4.compose(
            new THREE.Vector3(P.x + nx * lat, (GY - 1.2) / 2, P.z + nz * lat),
            q,
            new THREE.Vector3(1.1, 1, 2.1)
          );
          cwMesh.setMatrixAt(idx++, m4);
        });
      });
      cwMesh.instanceMatrix.needsUpdate = true;
      g.add(cwMesh);
    }
  }

  return g;
}

/**
 * Viaduc d'Austerlitz (1904): iconic 140m single-span parabolic riveted iron double-arch
 * over the Seine with overhead wind-bracing, vertical hangers, masonry abutments, and lamps.
 */
export function buildAusterlitzViaductArch(
  s0: number,
  s1: number,
  river: [number, number] | null,
  pose: (s: number, out?: Pose2D) => Pose2D,
  geos: THREE.BufferGeometry[],
  mats: LandmarkMaterials,
  isMobileGpu: boolean
): THREE.Group {
  const g = new THREE.Group();
  const fallbackMid = (s0 + s1) / 2;
  const span: [number, number] = river ?? [fallbackMid - 75, fallbackMid + 75];
  const mid = (span[0] + span[1]) / 2;
  const halfSpan = Math.max(10, (span[1] - span[0]) / 2);
  const segs = isMobileGpu ? 16 : 26;
  const strutSegs = isMobileGpu ? 4 : 6;
  const latDist = 4.7;

  const ironParts: THREE.BufferGeometry[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];
  const lampParts: THREE.BufferGeometry[] = [];
  const P: Pose2D = { x: 0, z: 0, h: 0 };
  const up = new THREE.Vector3(0, 1, 0);

  let prevLeftArch: THREE.Vector3 | null = null;
  let prevRightArch: THREE.Vector3 | null = null;
  let prevLeftTie: THREE.Vector3 | null = null;
  let prevRightTie: THREE.Vector3 | null = null;
  let prevT = -1;

  for (let i = 0; i <= segs; i++) {
    const t = -1 + (2 * i) / segs;
    const s = mid + t * halfSpan;
    pose(s, P);
    const nx = -Math.sin(P.h);
    const nz = Math.cos(P.h);
    const yArch = -0.8 + 20.3 * (1 - t * t);

    const curLeftArch = new THREE.Vector3(P.x - nx * latDist, yArch, P.z - nz * latDist);
    const curRightArch = new THREE.Vector3(P.x + nx * latDist, yArch, P.z + nz * latDist);
    const curLeftTie = new THREE.Vector3(P.x - nx * latDist, -0.25, P.z - nz * latDist);
    const curRightTie = new THREE.Vector3(P.x + nx * latDist, -0.25, P.z + nz * latDist);

    if (prevLeftArch && prevRightArch && prevLeftTie && prevRightTie) {
      // Parabolic main twin arches
      pushOrientedStrut(ironParts, prevLeftArch, curLeftArch, 0.44, strutSegs);
      pushOrientedStrut(ironParts, prevRightArch, curRightArch, 0.44, strutSegs);
      // Lower tie-beam chord at deck edge
      pushOrientedStrut(ironParts, prevLeftTie, curLeftTie, 0.24, 4);
      pushOrientedStrut(ironParts, prevRightTie, curRightTie, 0.24, 4);

      // Overhead wind-bracing X-struts near the crown (|t| <= 0.65)
      if (Math.abs(t) <= 0.65 && Math.abs(prevT) <= 0.65) {
        pushOrientedStrut(ironParts, prevLeftArch, curRightArch, 0.16, 4);
        pushOrientedStrut(ironParts, prevRightArch, curLeftArch, 0.16, 4);
      }
    }

    if (Math.abs(t) <= 0.65) {
      pushOrientedStrut(ironParts, curLeftArch, curRightArch, 0.22, 4);
    }

    // Vertical suspension hangers down to deck height y = 0
    if (i > 0 && i < segs && yArch > 0.25) {
      const leftDeck = new THREE.Vector3(P.x - nx * latDist, 0, P.z - nz * latDist);
      const rightDeck = new THREE.Vector3(P.x + nx * latDist, 0, P.z + nz * latDist);
      pushOrientedStrut(ironParts, curLeftArch, leftDeck, 0.14, 4);
      pushOrientedStrut(ironParts, curRightArch, rightDeck, 0.14, 4);
    }

    // Warm viaduct deck lamps spaced cleanly along the span
    if (i >= 2 && i <= segs - 2 && i % (isMobileGpu ? 3 : 2) === 0) {
      [-4.45, 4.45].forEach((lampLat) => {
        const lx = P.x + nx * lampLat;
        const lz = P.z + nz * lampLat;
        pushOrientedStrut(
          ironParts,
          new THREE.Vector3(lx, 0.15, lz),
          new THREE.Vector3(lx, 3.45, lz),
          0.11,
          5
        );
        const globe = new THREE.SphereGeometry(0.24, 8, 6);
        globe.translate(lx, 3.65, lz);
        lampParts.push(globe);
      });
    }

    prevLeftArch = curLeftArch;
    prevRightArch = curRightArch;
    prevLeftTie = curLeftTie;
    prevRightTie = curRightTie;
    prevT = t;
  }

  // Monumental masonry riverfront abutments at river[0] and river[1], seated down to GY - 2
  const baseBottomY = GY - 2;
  const baseTopY = -0.4;
  const baseH = baseTopY - baseBottomY;
  const baseCenterY = (baseBottomY + baseTopY) / 2;
  const q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();

  span.forEach((sEnd) => {
    pose(sEnd, P);
    q.setFromAxisAngle(up, -P.h);

    const baseGeo = new THREE.BoxGeometry(8.4, baseH, 15.2);
    m4.compose(new THREE.Vector3(P.x, baseCenterY, P.z), q, new THREE.Vector3(1, 1, 1));
    baseGeo.applyMatrix4(m4);
    stoneParts.push(baseGeo);

    const nx = -Math.sin(P.h);
    const nz = Math.cos(P.h);
    [-5.65, 5.65].forEach((lat) => {
      const px = P.x + nx * lat;
      const pz = P.z + nz * lat;
      const pylonGeo = new THREE.BoxGeometry(6.6, 6.2, 3.2);
      m4.compose(new THREE.Vector3(px, 2.7, pz), q, new THREE.Vector3(1, 1, 1));
      pylonGeo.applyMatrix4(m4);
      stoneParts.push(pylonGeo);

      const capGeo = new THREE.BoxGeometry(7.2, 0.9, 3.8);
      m4.compose(new THREE.Vector3(px, 6.1, pz), q, new THREE.Vector3(1, 1, 1));
      capGeo.applyMatrix4(m4);
      stoneParts.push(capGeo);
    });
  });

  commitMergedParts(g, ironParts, mats.iron, geos);
  commitMergedParts(g, stoneParts, mats.viaduct, geos);
  commitMergedParts(g, lampParts, mats.lamp, geos);
  return g;
}

/**
 * Colonne de Juillet (Place de la Bastille): ~50m monument grounded at y=0 relative to GY,
 * featuring granite roundabout ring, stepped plinth, inscribed pedestal, bronze shaft,
 * Corinthian observation capital, gilded lantern dome, and winged Génie de la Liberté.
 */
export function buildBastilleColumn(
  geos: THREE.BufferGeometry[],
  mats: LandmarkMaterials,
  isMobileGpu: boolean
): THREE.Group {
  const g = new THREE.Group();
  const radSegs = isMobileGpu ? 12 : 20;

  const stoneParts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(14.5, 15.2, 0.55, radSegs).translate(0, 0.275, 0),
    new THREE.CylinderGeometry(11.4, 12.0, 0.75, radSegs).translate(0, 0.92, 0),
    new THREE.CylinderGeometry(7.2, 8.0, 1.4, radSegs).translate(0, 2.0, 0),
    new THREE.CylinderGeometry(5.6, 6.2, 1.4, radSegs).translate(0, 3.4, 0),
  ];

  const darkParts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(7.6, 4.8, 7.6).translate(0, 6.5, 0),
    new THREE.BoxGeometry(8.4, 0.9, 8.4).translate(0, 9.35, 0),
    new THREE.BoxGeometry(5.8, 2.2, 5.8).translate(0, 10.9, 0),
    new THREE.CylinderGeometry(3.2, 1.65, 3.0, radSegs).translate(0, 41.9, 0),
    new THREE.BoxGeometry(6.6, 0.85, 6.6).translate(0, 43.8, 0),
    new THREE.BoxGeometry(6.8, 0.9, 0.35).translate(0, 44.65, 3.25),
    new THREE.BoxGeometry(6.8, 0.9, 0.35).translate(0, 44.65, -3.25),
    new THREE.BoxGeometry(0.35, 0.9, 6.2).translate(3.25, 44.65, 0),
    new THREE.BoxGeometry(0.35, 0.9, 6.2).translate(-3.25, 44.65, 0),
  ];

  const ironParts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(2.45, 2.9, 1.4, radSegs).translate(0, 12.7, 0),
    new THREE.CylinderGeometry(1.55, 1.85, 27.0, radSegs).translate(0, 26.9, 0),
    new THREE.CylinderGeometry(2.05, 2.05, 0.55, radSegs).translate(0, 20.0, 0),
    new THREE.CylinderGeometry(2.05, 2.05, 0.55, radSegs).translate(0, 26.8, 0),
    new THREE.CylinderGeometry(2.05, 2.05, 0.55, radSegs).translate(0, 33.6, 0),
  ];
  if (!isMobileGpu) {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * PI * 2;
      ironParts.push(
        new THREE.CylinderGeometry(0.16, 0.19, 26.2, 4).translate(
          Math.cos(ang) * 1.72,
          26.9,
          Math.sin(ang) * 1.72
        )
      );
    }
  }

  const torchArm = new THREE.BoxGeometry(0.18, 1.45, 0.18);
  torchArm.rotateZ(-0.42);
  torchArm.translate(0.42, 50.65, 0);

  const wingL = new THREE.BoxGeometry(1.75, 0.95, 0.14);
  wingL.rotateZ(0.45);
  wingL.rotateY(0.24);
  wingL.translate(-0.98, 49.75, -0.25);

  const wingR = new THREE.BoxGeometry(1.75, 0.95, 0.14);
  wingR.rotateZ(-0.45);
  wingR.rotateY(-0.24);
  wingR.translate(0.98, 49.75, -0.25);

  const goldParts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(1.35, 1.55, 1.8, radSegs).translate(0, 45.1, 0),
    new THREE.SphereGeometry(1.35, radSegs, 8, 0, PI * 2, 0, PI * 0.5).translate(0, 46.0, 0),
    new THREE.SphereGeometry(0.75, 10, 8).translate(0, 47.4, 0),
    new THREE.CylinderGeometry(0.26, 0.34, 2.4, 6).translate(0, 49.1, 0),
    new THREE.SphereGeometry(0.28, 8, 6).translate(0, 50.55, 0),
    torchArm,
    new THREE.ConeGeometry(0.22, 0.65, 6).translate(0.68, 51.55, 0),
    wingL,
    wingR,
  ];

  commitMergedParts(g, stoneParts, mats.viaduct, geos);
  commitMergedParts(g, darkParts, mats.towerDark, geos);
  commitMergedParts(g, ironParts, mats.iron, geos);
  commitMergedParts(g, goldParts, mats.towerBeacon, geos);
  return g;
}

/**
 * Grande Arche de La Défense (~110m hollow open cube grounded at y=0 relative to GY):
 * stepped parvis podium, marble piers + cantilevered roof entablature around a ~62m × 78m void,
 * recessed dark glass curtain walls, and suspended "Nuage" tent canopy inside the atrium.
 */
export function buildGrandeArche(
  geos: THREE.BufferGeometry[],
  mats: LandmarkMaterials,
  isMobileGpu: boolean
): THREE.Group {
  const g = new THREE.Group();

  const stoneParts: THREE.BufferGeometry[] = [
    // Stepped parvis podium (top at y = 6.0)
    new THREE.BoxGeometry(140, 1.8, 126).translate(0, 0.9, 0),
    new THREE.BoxGeometry(128, 2.0, 114).translate(0, 2.8, 0),
    new THREE.BoxGeometry(116, 2.2, 104).translate(0, 4.9, 0),
    // Left & right massive marble piers (opening width = 62m: x in [-31, +31])
    new THREE.BoxGeometry(23, 104, 96).translate(-42.5, 58.0, 0),
    new THREE.BoxGeometry(23, 104, 96).translate(42.5, 58.0, 0),
    // Monumental cantilevered roof entablature (opening height = 78m: y in [6, 84])
    new THREE.BoxGeometry(108, 26, 96).translate(0, 97.0, 0),
    new THREE.BoxGeometry(110, 1.6, 98).translate(0, 110.8, 0),
  ];

  if (!isMobileGpu) {
    // Crisp architectural marble portal frame projections on front & back faces
    [-48.2, 48.2].forEach((fz) => {
      stoneParts.push(
        new THREE.BoxGeometry(108, 4.2, 1.2).translate(0, 86.1, fz),
        new THREE.BoxGeometry(108, 4.2, 1.2).translate(0, 107.9, fz),
        new THREE.BoxGeometry(3.8, 104, 1.2).translate(-32.9, 58.0, fz),
        new THREE.BoxGeometry(3.8, 104, 1.2).translate(32.9, 58.0, fz),
        new THREE.BoxGeometry(3.8, 104, 1.2).translate(-52.1, 58.0, fz),
        new THREE.BoxGeometry(3.8, 104, 1.2).translate(52.1, 58.0, fz)
      );
    });
  }

  const glassParts: THREE.BufferGeometry[] = [
    // Inner atrium blue-slate glass curtain walls on both piers
    new THREE.BoxGeometry(0.7, 74, 88).translate(-30.8, 45.0, 0),
    new THREE.BoxGeometry(0.7, 74, 88).translate(30.8, 45.0, 0),
    // Inner roof soffit skylight band
    new THREE.BoxGeometry(56, 0.6, 88).translate(0, 83.8, 0),
    // Front & back recessed facade glass bands on piers
    new THREE.BoxGeometry(14.5, 92, 0.7).translate(-42.5, 56.0, 48.05),
    new THREE.BoxGeometry(14.5, 92, 0.7).translate(42.5, 56.0, 48.05),
    new THREE.BoxGeometry(14.5, 92, 0.7).translate(-42.5, 56.0, -48.05),
    new THREE.BoxGeometry(14.5, 92, 0.7).translate(42.5, 56.0, -48.05),
  ];

  // Suspended tensile canopy ("le Nuage") anchored low inside the central atrium
  const canopyParts: THREE.BufferGeometry[] = [
    new THREE.ConeGeometry(18, 4.5, 4).rotateY(PI / 4).translate(0, 21.5, -10),
    new THREE.ConeGeometry(16, 4.0, 4).rotateY(PI / 4).translate(0, 20.5, 12),
    new THREE.BoxGeometry(36, 1.2, 40).translate(0, 18.8, 0),
  ];
  const anchorPoints: Array<[number, number, number, number]> = [
    [-30.5, 22, -22, -14],
    [30.5, 22, -22, -14],
    [-30.5, 22, 22, 14],
    [30.5, 22, 22, 14],
  ];
  anchorPoints.forEach(([ax, ay, az, cz]) => {
    pushOrientedStrut(
      canopyParts,
      new THREE.Vector3(ax, ay, az),
      new THREE.Vector3(Math.sign(ax) * 14, 19.2, cz),
      0.24,
      4
    );
  });

  commitMergedParts(g, stoneParts, mats.viaduct, geos);
  commitMergedParts(g, glassParts, mats.towerGlass, geos);
  commitMergedParts(g, canopyParts, mats.hull, geos);
  return g;
}

/**
 * Seine water surface (planar Reflector on desktop, rich specular water on iPhone),
 * stone Quais de Seine embankments with trees, and 2 animated Bateaux-Mouches / péniches.
 */
export function buildSeineEnvironment(
  midPose: Pose2D,
  riverWidth: number,
  geos: THREE.BufferGeometry[],
  mats: LandmarkMaterials,
  isMobileGpu: boolean
): { group: THREE.Group; update: (elapsedSec: number) => void } {
  const g = new THREE.Group();

  const wg = new THREE.PlaneGeometry(riverWidth, 1600);
  geos.push(wg);
  let waterMesh: THREE.Object3D;
  if (!isMobileGpu) {
    waterMesh = new Reflector(wg, {
      textureWidth: 384,
      textureHeight: 384,
      color: 0x5c7d88,
      clipBias: 0.005,
    });
  } else {
    waterMesh = new THREE.Mesh(wg, mats.water);
  }
  waterMesh.rotation.x = -PI / 2;
  waterMesh.rotation.z = midPose.h;
  waterMesh.position.set(midPose.x, GY + 0.4, midPose.z);
  g.add(waterMesh);

  // Quais de Seine pierre de taille + parapets sur chaque berge
  const bankGroup = new THREE.Group();
  bankGroup.position.set(midPose.x, GY, midPose.z);
  bankGroup.rotation.y = -midPose.h;
  const quayGeo = new THREE.BoxGeometry(10, 2.4, 1500);
  const parapetGeo = new THREE.BoxGeometry(0.65, 1.15, 1500);
  geos.push(quayGeo, parapetGeo);
  [-1, 1].forEach((side) => {
    const q = new THREE.Mesh(quayGeo, mats.viaduct);
    q.position.set(side * (riverWidth / 2 + 5), 1.0, 0);
    bankGroup.add(q);
    const p = new THREE.Mesh(parapetGeo, mats.ironRail);
    p.position.set(side * (riverWidth / 2 + 0.45), 2.55, 0);
    bankGroup.add(p);
  });

  // 2 péniches / Bateaux-Mouches glissant doucement sur la Seine
  const makeBoat = (hullLen: number, cabinColor: THREE.Material) => {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, hullLen), mats.hull);
    hull.position.y = 0.9;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, hullLen * 0.65), cabinColor);
    deck.position.y = 2.15;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.5, 4), mats.hull);
    bow.rotation.x = PI / 2;
    bow.rotation.y = PI / 4;
    bow.position.set(0, 0.9, hullLen / 2 + 2.2);
    geos.push(hull.geometry, deck.geometry, bow.geometry);
    boat.add(hull, deck, bow);
    return boat;
  };
  const boatA = makeBoat(28, mats.cabinLit);
  boatA.position.set(-riverWidth * 0.19, 0.3, -90);
  const boatB = makeBoat(22, mats.cabinLit);
  boatB.rotation.y = PI;
  boatB.position.set(riverWidth * 0.21, 0.3, 120);
  bankGroup.add(boatA, boatB);
  g.add(bankGroup);

  return {
    group: g,
    update(elapsedSec: number) {
      boatA.position.z = ((elapsedSec * 5.2) % 440) - 220;
      boatB.position.z = 220 - ((elapsedSec * 4.4 + 140) % 440);
    },
  };
}

/** Procedural Parisian sky dome with Rayleigh gradient, warm sun disc, and soft cloud strata. */
export function createParisSkyDome(
  textures: THREE.Texture[],
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T
): THREE.Mesh {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#4f7fb3');
  gr.addColorStop(0.28, '#87b0d6');
  gr.addColorStop(0.47, '#d4e2ec');
  gr.addColorStop(0.52, '#e6e4de');
  gr.addColorStop(1, '#c8c4bc');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);

  // Halo solaire chaleureux à l'ouest / sud-ouest de Paris
  const sunX = W * 0.32;
  const sunY = H * 0.38;
  const sunGlow = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 110);
  sunGlow.addColorStop(0, 'rgba(255, 252, 236, 0.95)');
  sunGlow.addColorStop(0.14, 'rgba(255, 235, 190, 0.55)');
  sunGlow.addColorStop(0.45, 'rgba(255, 218, 165, 0.16)');
  sunGlow.addColorStop(1, 'rgba(255, 218, 165, 0)');
  g.fillStyle = sunGlow;
  g.fillRect(0, 0, W, H);

  // Voiles nuageux parisiens discrets
  for (let i = 0; i < 18; i++) {
    const cx = ((i * 97 + 40) % (W - 60)) + 30;
    const cy = H * (0.24 + (i % 5) * 0.042);
    const rx = 38 + (i % 4) * 18;
    const ry = 7 + (i % 3) * 3;
    const cg = g.createRadialGradient(cx, cy, 2, cx, cy, rx);
    cg.addColorStop(0, 'rgba(255, 253, 248, 0.32)');
    cg.addColorStop(1, 'rgba(255, 253, 248, 0)');
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.translate(-cx, -cy);
    g.fillStyle = cg;
    g.beginPath();
    g.arc(cx, cy, rx, 0, PI * 2);
    g.fill();
    g.restore();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.push(t);

  const skyGeo = trackGeo(new THREE.SphereGeometry(1050, 32, 16));
  const skyMat = trackMat(
    new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  const m = new THREE.Mesh(skyGeo, skyMat);
  m.renderOrder = -1;
  m.visible = false;
  return m;
}
