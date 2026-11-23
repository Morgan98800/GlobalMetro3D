import * as THREE from 'three';
import { isRerLineNum } from './routes_and_stock';

export type StationArchetype = 'faience' | 'arts_et_metiers' | 'louvre_rivoli' | 'cathedral';

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
  if (n.includes('louvre rivoli') || n.includes('concorde') || n.includes('assemblee nationale')) {
    return 'louvre_rivoli';
  }
  if (
    isRerLineNum(lineNum) ||
    n.includes('abbesses') ||
    n.includes('cite') ||
    n.includes('liege') ||
    n.includes('chatelet') ||
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
  stoneVault: THREE.MeshStandardMaterial;
  cathedralVault: THREE.MeshStandardMaterial;
  ghostConcrete: THREE.MeshStandardMaterial;
  ghostWarmLamp: THREE.MeshBasicMaterial;
  ghostBarricade: THREE.MeshStandardMaterial;
}

export function createArchetypeMaterials(
  trackMat: <T extends THREE.Material>(m: T) => T
): ArchetypeMaterials {
  return {
    copperVault: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7c4324,
        roughness: 0.36,
        metalness: 0.72,
        envMapIntensity: 0.85,
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
    stoneVault: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc2b293,
        roughness: 0.88,
        metalness: 0.04,
        envMapIntensity: 0.25,
        side: THREE.DoubleSide,
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

/**
 * Adds clean-room iconic decorative ribs / porthole rings for Arts et Métiers
 * or stone pilasters for Louvre-Rivoli without inflating draw calls via InstancedMesh.
 */
export function addArchetypeDecorations(
  group: THREE.Group,
  archetype: StationArchetype,
  mats: ArchetypeMaterials,
  geos: THREE.BufferGeometry[]
): void {
  if (archetype === 'arts_et_metiers') {
    const portholeGeo = new THREE.TorusGeometry(0.68, 0.09, 8, 20);
    geos.push(portholeGeo);
    const xs = [-42, -26, -10, 10, 26, 42];
    const im = new THREE.InstancedMesh(portholeGeo, mats.copperTrim, xs.length * 2);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (const x of xs) {
      for (const side of [-1, 1]) {
        dummy.position.set(x, 2.05, side * 6.88);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 0.35);
        dummy.updateMatrix();
        im.setMatrixAt(idx++, dummy.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  } else if (archetype === 'louvre_rivoli') {
    const pilasterGeo = new THREE.BoxGeometry(0.45, 3.2, 0.28);
    geos.push(pilasterGeo);
    const xs = [-48, -32, -16, 0, 16, 32, 48];
    const im = new THREE.InstancedMesh(pilasterGeo, mats.stoneVault, xs.length * 2);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (const x of xs) {
      for (const side of [-1, 1]) {
        dummy.position.set(x, 1.8, side * 6.75);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        im.setMatrixAt(idx++, dummy.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
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
