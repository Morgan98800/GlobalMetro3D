import * as THREE from 'three';

const PI = Math.PI;
const GY = -7;

export interface CityBlockSpec {
  P: { x: number; z: number; h: number };
  along: number;
  lat: number;
  w: number;
  h: number;
  d: number;
}

export interface CityscapeMaterials {
  buildings: THREE.Material[];
  zinc: THREE.Material;
  cornice: THREE.Material;
  ironRail: THREE.Material;
  chimney: THREE.Material;
  awningGreen: THREE.Material;
  awningBordeaux: THREE.Material;
  road: THREE.Material;
  sidewalk: THREE.Material;
  trunk: THREE.Material;
  foliage: THREE.Material;
  lampPost: THREE.Material;
  lampGlobe: THREE.Material;
}

export interface CityscapeSharedGeos {
  unitBox: THREE.BufferGeometry;
  mansardUnit: THREE.BufferGeometry;
}

function setPlacedMatrix(
  im: THREE.InstancedMesh,
  idx: number,
  P: { x: number; z: number; h: number },
  along: number,
  lat: number,
  y: number,
  sx: number,
  sy: number,
  sz: number,
  matOut: THREE.Matrix4,
  quatOut: THREE.Quaternion,
  upAxis: THREE.Vector3
) {
  quatOut.setFromAxisAngle(upAxis, -P.h);
  const c = Math.cos(P.h);
  const sn = Math.sin(P.h);
  matOut.compose(
    new THREE.Vector3(P.x + c * along - sn * lat, y, P.z + sn * along + c * lat),
    quatOut,
    new THREE.Vector3(sx, sy, sz)
  );
  im.setMatrixAt(idx, matOut);
}

/**
 * Multi-variant Parisian city blocks with instanced Haussmann cream/ochre/modern facades,
 * protruding mansard dormers, wrought-iron balconies, ground-floor awnings, and chimneys.
 */
export function buildParisCityBlocks(
  g: THREE.Group,
  list: CityBlockSpec[],
  mats: CityscapeMaterials,
  shared: CityscapeSharedGeos,
  geos: THREE.BufferGeometry[],
  isMobileGpu: boolean
): void {
  if (!list.length) return;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();

  // Partition buildings deterministically across facade material variants
  const buckets: CityBlockSpec[][] = mats.buildings.map(() => []);
  list.forEach((item, idx) => {
    buckets[idx % buckets.length].push(item);
  });

  buckets.forEach((items, bIdx) => {
    if (!items.length) return;
    const bMesh = new THREE.InstancedMesh(shared.unitBox, mats.buildings[bIdx], items.length);
    items.forEach((o, i) => {
      setPlacedMatrix(bMesh, i, o.P, o.along, o.lat, GY + o.h / 2, o.w, o.h, o.d, m4, q, up);
      const shade = 0.92 + ((i * 19 + bIdx * 7) % 9) * 0.016;
      tint.setRGB(shade, shade * 0.995, shade * 0.985);
      bMesh.setColorAt(i, tint);
    });
    bMesh.instanceMatrix.needsUpdate = true;
    if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
    g.add(bMesh);
  });

  const n = list.length;
  const roofs = new THREE.InstancedMesh(shared.mansardUnit, mats.zinc, n);
  const cornices = new THREE.InstancedMesh(shared.unitBox, mats.cornice, n * 2);
  const balconies = new THREE.InstancedMesh(shared.unitBox, mats.ironRail, n * 2);
  const chimneys = new THREE.InstancedMesh(shared.unitBox, mats.chimney, n * 2);
  const dormers = !isMobileGpu
    ? new THREE.InstancedMesh(shared.unitBox, mats.cornice, n * 2)
    : null;
  const awningsGreen: CityBlockSpec[] = [];
  const awningsBordeaux: CityBlockSpec[] = [];

  list.forEach((o, i) => {
    const faceSign = o.lat >= 0 ? -1 : 1;
    // Zinc mansard roof
    setPlacedMatrix(
      roofs,
      i,
      o.P,
      o.along,
      o.lat,
      GY + o.h + 1.9,
      o.w * 1.01,
      3.8,
      o.d * 1.01,
      m4,
      q,
      up
    );
    // Sommit & 2nd floor molded limestone cornices
    setPlacedMatrix(
      cornices,
      i * 2,
      o.P,
      o.along,
      o.lat,
      GY + o.h + 0.14,
      o.w + 0.72,
      0.46,
      o.d + 0.72,
      m4,
      q,
      up
    );
    setPlacedMatrix(
      cornices,
      i * 2 + 1,
      o.P,
      o.along,
      o.lat,
      GY + o.h * 0.42,
      o.w + 0.48,
      0.3,
      o.d + 0.48,
      m4,
      q,
      up
    );
    // Wrought-iron balcony strips (2nd & 5th floors)
    setPlacedMatrix(
      balconies,
      i * 2,
      o.P,
      o.along,
      o.lat,
      GY + o.h * 0.42 + 0.56,
      o.w + 0.62,
      0.22,
      o.d + 0.62,
      m4,
      q,
      up
    );
    setPlacedMatrix(
      balconies,
      i * 2 + 1,
      o.P,
      o.along,
      o.lat,
      GY + o.h * 0.84 + 0.56,
      o.w + 0.62,
      0.22,
      o.d + 0.62,
      m4,
      q,
      up
    );
    // Terracotta Parisian chimneys
    setPlacedMatrix(
      chimneys,
      i * 2,
      o.P,
      o.along - o.w * 0.24,
      o.lat,
      GY + o.h + 4.15,
      1.35,
      1.5,
      0.9,
      m4,
      q,
      up
    );
    setPlacedMatrix(
      chimneys,
      i * 2 + 1,
      o.P,
      o.along + o.w * 0.24,
      o.lat,
      GY + o.h + 4.15,
      1.35,
      1.5,
      0.9,
      m4,
      q,
      up
    );

    if (dormers) {
      const frontLat = o.lat + faceSign * (o.d * 0.46);
      setPlacedMatrix(
        dormers,
        i * 2,
        o.P,
        o.along - o.w * 0.25,
        frontLat,
        GY + o.h + 1.8,
        1.7,
        2.1,
        1.2,
        m4,
        q,
        up
      );
      setPlacedMatrix(
        dormers,
        i * 2 + 1,
        o.P,
        o.along + o.w * 0.25,
        frontLat,
        GY + o.h + 1.8,
        1.7,
        2.1,
        1.2,
        m4,
        q,
        up
      );
    }

    if (i % 3 !== 2) {
      if (i % 2 === 0) awningsGreen.push(o);
      else awningsBordeaux.push(o);
    }
  });

  roofs.instanceMatrix.needsUpdate = true;
  cornices.instanceMatrix.needsUpdate = true;
  balconies.instanceMatrix.needsUpdate = true;
  chimneys.instanceMatrix.needsUpdate = true;
  g.add(roofs, cornices, balconies, chimneys);

  if (dormers) {
    dormers.instanceMatrix.needsUpdate = true;
    g.add(dormers);
  }

  const addAwnings = (items: CityBlockSpec[], mat: THREE.Material) => {
    if (!items.length) return;
    const im = new THREE.InstancedMesh(shared.unitBox, mat, items.length);
    items.forEach((o, i) => {
      const faceSign = o.lat >= 0 ? -1 : 1;
      const frontLat = o.lat + faceSign * (o.d * 0.5 + 0.85);
      setPlacedMatrix(im, i, o.P, o.along, frontLat, GY + 3.85, o.w * 0.62, 0.38, 1.7, m4, q, up);
    });
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  };
  addAwnings(awningsGreen, mats.awningGreen);
  addAwnings(awningsBordeaux, mats.awningBordeaux);
  void geos;
}

/**
 * Builds the paved Parisian boulevard under elevated viaducts:
 * asphalt road ribbon, raised stone sidewalks, boulevard plane trees, and warm streetlamps.
 */
export function buildParisBoulevard(
  g: THREE.Group,
  s0: number,
  s1: number,
  river: [number, number] | null,
  sweepFn: (
    profile: [number, number][],
    a: number,
    b: number,
    step: number
  ) => THREE.BufferGeometry,
  poseFn: (
    s: number,
    out?: { x: number; z: number; h: number }
  ) => { x: number; z: number; h: number },
  mats: CityscapeMaterials,
  geos: THREE.BufferGeometry[],
  isMobileGpu: boolean
): void {
  const spans: Array<[number, number]> = river
    ? [
        ...(river[0] > s0 + 4 ? ([[s0, river[0] - 4]] as Array<[number, number]>) : []),
        ...(river[1] < s1 - 4 ? ([[river[1] + 4, s1]] as Array<[number, number]>) : []),
      ]
    : [[s0, s1]];

  const P = { x: 0, z: 0, h: 0 };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const treeSpots: number[] = [];
  const lampSpots: number[] = [];

  for (const [a, b] of spans) {
    if (b - a < 6) continue;
    // Asphalt road ribbon below viaduct
    const roadGeo = sweepFn(
      [
        [-10.5, GY + 0.06],
        [10.5, GY + 0.06],
      ],
      a,
      b,
      6
    );
    // Left & right raised granite sidewalks
    const swLeft = sweepFn(
      [
        [-18.5, GY + 0.22],
        [-10.5, GY + 0.22],
      ],
      a,
      b,
      6
    );
    const swRight = sweepFn(
      [
        [10.5, GY + 0.22],
        [18.5, GY + 0.22],
      ],
      a,
      b,
      6
    );
    geos.push(roadGeo, swLeft, swRight);
    g.add(
      new THREE.Mesh(roadGeo, mats.road),
      new THREE.Mesh(swLeft, mats.sidewalk),
      new THREE.Mesh(swRight, mats.sidewalk)
    );

    const stepTree = isMobileGpu ? 24 : 18;
    for (let s = a + 8; s < b - 6; s += stepTree) {
      treeSpots.push(s);
    }
    for (let s = a + 12; s < b - 6; s += isMobileGpu ? 34 : 26) {
      lampSpots.push(s);
    }
  }

  if (treeSpots.length) {
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 4.2, 6);
    const crownGeo = new THREE.DodecahedronGeometry(2.6, 1);
    geos.push(trunkGeo, crownGeo);
    const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, treeSpots.length * 2);
    const crowns = new THREE.InstancedMesh(crownGeo, mats.foliage, treeSpots.length * 2);
    let idx = 0;
    const tint = new THREE.Color();
    treeSpots.forEach((s, ti) => {
      poseFn(s, P);
      const nx = -Math.sin(P.h);
      const nz = Math.cos(P.h);
      q.setFromAxisAngle(up, -P.h);
      [-13.6, 13.6].forEach((lat, sideIdx) => {
        m4.compose(
          new THREE.Vector3(P.x + nx * lat, GY + 2.2, P.z + nz * lat),
          q,
          new THREE.Vector3(1, 1, 1)
        );
        trunks.setMatrixAt(idx, m4);
        const sc = 0.85 + ((ti + sideIdx) % 3) * 0.14;
        m4.compose(
          new THREE.Vector3(P.x + nx * lat, GY + 5.6, P.z + nz * lat),
          q,
          new THREE.Vector3(sc, sc * 1.12, sc)
        );
        crowns.setMatrixAt(idx, m4);
        tint.setHSL(0.27 + ((ti * 3 + sideIdx) % 4) * 0.015, 0.36, 0.28);
        crowns.setColorAt(idx, tint);
        idx++;
      });
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    g.add(trunks, crowns);
  }

  if (lampSpots.length) {
    const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.2, 6);
    const globeGeo = new THREE.SphereGeometry(0.24, 8, 6);
    geos.push(postGeo, globeGeo);
    const posts = new THREE.InstancedMesh(postGeo, mats.lampPost, lampSpots.length * 2);
    const globes = new THREE.InstancedMesh(globeGeo, mats.lampGlobe, lampSpots.length * 2);
    let idx = 0;
    lampSpots.forEach((s) => {
      poseFn(s, P);
      const nx = -Math.sin(P.h);
      const nz = Math.cos(P.h);
      q.setFromAxisAngle(up, -P.h);
      [-11.1, 11.1].forEach((lat) => {
        m4.compose(
          new THREE.Vector3(P.x + nx * lat, GY + 2.8, P.z + nz * lat),
          q,
          new THREE.Vector3(1, 1, 1)
        );
        posts.setMatrixAt(idx, m4);
        m4.compose(
          new THREE.Vector3(P.x + nx * lat, GY + 5.5, P.z + nz * lat),
          q,
          new THREE.Vector3(1, 1, 1)
        );
        globes.setMatrixAt(idx, m4);
        idx++;
      });
    });
    posts.instanceMatrix.needsUpdate = true;
    globes.instanceMatrix.needsUpdate = true;
    g.add(posts, globes);
  }
  void PI;
}
