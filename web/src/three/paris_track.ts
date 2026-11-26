import * as THREE from 'three';

const PI = Math.PI;

export type TrackSystem = 'pneu' | 'fer' | 'rer';

export interface TrackPose {
  x: number;
  z: number;
  h: number;
}

export interface TrackMaterials {
  railHead: THREE.Material;
  railWeb: THREE.Material;
  third: THREE.Material;
  thirdShroud: THREE.Material;
  rollway: THREE.Material;
  sleeper: THREE.Material;
  catenaryMast: THREE.Material;
  catenaryWire: THREE.Material;
  cableTray: THREE.Material;
  stopSignPos: THREE.Material;
  stopSignNeg: THREE.Material;
  tactileBand: THREE.Material;
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

const rectProf = (o: number, y0: number, y1: number, w: number): [number, number][] => [
  [o - w / 2, y0],
  [o - w / 2, y1],
  [o + w / 2, y1],
  [o + w / 2, y0],
  [o - w / 2, y0],
];

/**
 * Builds high-fidelity swept track along `[s0, s1]`:
 * - Vignole steel running rails (oxidized foot/web + polished metallic running head)
 * - Sleepers with Pandrol/Nabla rail pads
 * - `'pneu'` (L1/4/6/11/14): wide pneumatic rollways (`±0.99 m`) + lateral guide bars (`±1.24 m`)
 * - `'fer'`: lateral 750 V third rail + protective shroud
 * - `'rer'` (A-E): overhead 1.5/25 kV catenary contact & messenger wires + viaduct masts
 * - Optional tunnel side cable trays
 */
export function buildSweptTrack(params: {
  g: THREE.Group;
  geos: THREE.BufferGeometry[];
  s0: number;
  s1: number;
  system: TrackSystem;
  inTunnel: boolean;
  isOpenAir: boolean;
  tunnelHalfWidth: number;
  sleeperGeo: THREE.BufferGeometry;
  sweepFn: (
    profile: [number, number][],
    a: number,
    b: number,
    step: number
  ) => THREE.BufferGeometry;
  poseFn: (s: number, out?: TrackPose) => TrackPose;
  mats: TrackMaterials;
  isMobileGpu: boolean;
}): void {
  const {
    g,
    geos,
    s0,
    s1,
    system,
    inTunnel,
    isOpenAir,
    tunnelHalfWidth,
    sleeperGeo,
    sweepFn,
    poseFn,
    mats,
    isMobileGpu,
  } = params;

  const railWebGeos: THREE.BufferGeometry[] = [];
  const railHeadGeos: THREE.BufferGeometry[] = [];
  const thirdGeos: THREE.BufferGeometry[] = [];
  const shroudGeos: THREE.BufferGeometry[] = [];
  const rollwayGeos: THREE.BufferGeometry[] = [];

  const step = isMobileGpu ? 5 : 3.5;

  [1.8, -1.8].forEach((zc) => {
    const signZ = Math.sign(zc);
    [-0.7175, 0.7175].forEach((o) => {
      // Vignole lower web + foot
      railWebGeos.push(sweepFn(rectProf(zc + o, 0.11, 0.19, 0.08), s0, s1, step));
      // Bright polished Vignole running surface head
      railHeadGeos.push(sweepFn(rectProf(zc + o, 0.19, 0.228, 0.068), s0, s1, step));
    });

    if (system === 'pneu') {
      // Wide steel H-beam rollways + lateral power/guide rails for rubber-tired Metro
      [-0.99, 0.99].forEach((ro) => {
        rollwayGeos.push(sweepFn(rectProf(zc + ro, 0.14, 0.23, 0.3), s0, s1, step));
      });
      [-1.24, 1.24].forEach((go) => {
        thirdGeos.push(sweepFn(rectProf(zc + go, 0.28, 0.44, 0.09), s0, s1, step));
      });
    } else if (system === 'fer') {
      const thirdX = zc - signZ * 1.44;
      thirdGeos.push(sweepFn(rectProf(thirdX, 0.23, 0.315, 0.11), s0, s1, step));
      shroudGeos.push(sweepFn(rectProf(thirdX, 0.32, 0.355, 0.16), s0, s1, step));
    } else if (system === 'rer') {
      // Overhead catenary wires (contact + messenger)
      thirdGeos.push(sweepFn(rectProf(zc, 4.65, 4.685, 0.035), s0, s1, 6));
      thirdGeos.push(sweepFn(rectProf(zc, 5.25, 5.28, 0.025), s0, s1, 6));
    }
  });

  const pushMerged = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!list.length) return;
    const merged = mergeGeosLocal(list);
    list.forEach((x) => x.dispose());
    geos.push(merged);
    g.add(new THREE.Mesh(merged, mat));
  };

  pushMerged(railWebGeos, mats.railWeb);
  pushMerged(railHeadGeos, mats.railHead);
  pushMerged(rollwayGeos, mats.rollway);
  pushMerged(thirdGeos, system === 'rer' ? mats.catenaryWire : mats.third);
  pushMerged(shroudGeos, mats.thirdShroud);

  // Tunnel wall cable conduits
  if (inTunnel) {
    const trayGeos: THREE.BufferGeometry[] = [];
    const tw = tunnelHalfWidth - 0.12;
    [-1, 1].forEach((side) => {
      trayGeos.push(sweepFn(rectProf(side * tw, 1.35, 1.48, 0.16), s0, s1, 6));
      trayGeos.push(sweepFn(rectProf(side * tw, 1.65, 1.76, 0.16), s0, s1, 6));
    });
    pushMerged(trayGeos, mats.cableTray);
  }

  // Sleepers (dense steel/concrete ties + fastener pads)
  const P: TrackPose = { x: 0, z: 0, h: 0 };
  const m4 = new THREE.Matrix4();
  const sleeperSpacing = isMobileGpu ? 0.85 : 0.7;
  const N = Math.max(1, Math.floor((s1 - s0) / sleeperSpacing));
  const sl = new THREE.InstancedMesh(sleeperGeo, mats.sleeper, N * 2);
  let k = 0;
  for (let i = 0; i < N; i++) {
    poseFn(s0 + 0.35 + i * sleeperSpacing, P);
    [1.8, -1.8].forEach((lat) => {
      m4.makeRotationY(-P.h);
      m4.setPosition(P.x - Math.sin(P.h) * lat, 0.06, P.z + Math.cos(P.h) * lat);
      sl.setMatrixAt(k++, m4);
    });
  }
  sl.instanceMatrix.needsUpdate = true;
  g.add(sl);

  // RER open-air catenary portal gantries
  if (system === 'rer' && isOpenAir) {
    const mastS: number[] = [];
    for (let s = s0 + 14; s < s1 - 8; s += 30) mastS.push(s);
    if (mastS.length) {
      const postGeo = new THREE.BoxGeometry(0.18, 5.8, 0.22);
      const beamGeo = new THREE.BoxGeometry(0.16, 0.18, 8.6);
      geos.push(postGeo, beamGeo);
      const posts = new THREE.InstancedMesh(postGeo, mats.catenaryMast, mastS.length * 2);
      const beams = new THREE.InstancedMesh(beamGeo, mats.catenaryMast, mastS.length);
      let pi = 0;
      mastS.forEach((s, idx) => {
        poseFn(s, P);
        const nx = -Math.sin(P.h);
        const nz = Math.cos(P.h);
        [-4.2, 4.2].forEach((lat) => {
          m4.makeRotationY(-P.h);
          m4.setPosition(P.x + nx * lat, 2.9, P.z + nz * lat);
          posts.setMatrixAt(pi++, m4);
        });
        m4.makeRotationY(-P.h);
        m4.setPosition(P.x, 5.45, P.z);
        beams.setMatrixAt(idx, m4);
      });
      posts.instanceMatrix.needsUpdate = true;
      beams.instanceMatrix.needsUpdate = true;
      g.add(posts, beams);
    }
  }
}

/**
 * Adds authentic yellow/black "ARRÊT TÊTE DE TRAIN" stopping boards at both ends of
 * a station platform so drivers can aim their braking precisely onto the mark.
 */
export function buildStationStopMarkers(
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: TrackMaterials,
  trainLen: number,
  stopBoardX = trainLen / 2 + 0.3
): void {
  const postGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.85, 8);
  const boardGeo = new THREE.PlaneGeometry(0.68, 0.34);
  const stripeGeo = new THREE.BoxGeometry(0.16, 0.018, 1.52);
  geos.push(postGeo, boardGeo, stripeGeo);

  // Track +1 (+Z, train running +X): stopping mark at +stopBoardX
  const pPos = new THREE.Mesh(postGeo, mats.catenaryMast);
  pPos.position.set(stopBoardX, 1.45, 3.12);
  const bPos = new THREE.Mesh(boardGeo, mats.stopSignPos);
  bPos.rotation.y = -PI / 2;
  bPos.position.set(stopBoardX - 0.02, 2.18, 3.12);
  const barPos = new THREE.Mesh(stripeGeo, mats.tactileBand);
  barPos.position.set(stopBoardX, 0.14, 1.8);
  group.add(pPos, bPos, barPos);

  // Track -1 (-Z, train running -X): stopping mark at -stopBoardX
  const pNeg = new THREE.Mesh(postGeo, mats.catenaryMast);
  pNeg.position.set(-stopBoardX, 1.45, -3.12);
  const bNeg = new THREE.Mesh(boardGeo, mats.stopSignNeg);
  bNeg.rotation.y = PI / 2;
  bNeg.position.set(-stopBoardX + 0.02, 2.18, -3.12);
  const barNeg = new THREE.Mesh(stripeGeo, mats.tactileBand);
  barNeg.position.set(-stopBoardX, 0.14, -1.8);
  group.add(pNeg, bNeg, barNeg);
}
