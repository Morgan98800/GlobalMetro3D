import * as THREE from 'three';

export interface LandmarkDef {
  name: string;
  coords: [number, number]; // [lng, lat]
  builder: () => THREE.Group;
  cameraPreset?: {
    distance: number;
    pitch: number;
    altitude: number;
  };
}

export interface EiffelTowerObject extends THREE.Group {
  beaconGroup?: THREE.Group;
}

// ---------------------------------------------------------------------------
// Shared material palette — avoids creating duplicate MeshStandardMaterials
// across 8 landmark builders, reducing GPU state changes and VRAM usage
// ---------------------------------------------------------------------------
export const SHARED_MATS = {
  /** Parisian limestone / pierre de taille — used by Arc, Notre-Dame, Invalides, Panthéon */
  stone: new THREE.MeshStandardMaterial({ color: 0xdfd5c4, roughness: 0.65, metalness: 0.08 }),
  /** Classic French slate rooftop — Notre-Dame */
  slate: new THREE.MeshStandardMaterial({ color: 0x3d4f57, roughness: 0.4, metalness: 0.05 }),
  /** Sacré-Cœur white travertine — luminous */
  travertine: new THREE.MeshStandardMaterial({
    color: 0xfaf8f2, emissive: 0x38352b, emissiveIntensity: 0.3, roughness: 0.45, metalness: 0.05
  }),
  /** Verdigris copper — campanile / small roofs */
  copper: new THREE.MeshStandardMaterial({ color: 0x487a6b, roughness: 0.6, metalness: 0.3 }),
  /** Invalides golden dome */
  goldDome: new THREE.MeshStandardMaterial({
    color: 0xffd700, emissive: 0x5c4a00, emissiveIntensity: 0.45, metalness: 0.95, roughness: 0.15
  }),
  /** Tour Montparnasse dark mirror glass */
  darkGlass: new THREE.MeshStandardMaterial({
    color: 0x161f26, emissive: 0x0d151c, emissiveIntensity: 0.2, roughness: 0.1, metalness: 0.9
  }),
  /** Louvre palace cream stone */
  palaceStone: new THREE.MeshStandardMaterial({ color: 0xcebe9e, roughness: 0.7, metalness: 0.02 }),
  /** Louvre glass pyramid */
  glassPyramid: new THREE.MeshStandardMaterial({
    color: 0x8fe2ff, emissive: 0x1a4557, emissiveIntensity: 0.6,
    roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.8
  }),
  /** Eiffel Tower golden lattice iron */
  goldLattice: new THREE.MeshStandardMaterial({
    color: 0xc49a45, emissive: 0x3d2c0e, emissiveIntensity: 0.35, metalness: 0.85, roughness: 0.3
  }),
  /** Eiffel Tower base arch iron — slightly darker */
  baseArch: new THREE.MeshStandardMaterial({ color: 0xb5893a, emissive: 0x2e1f08, metalness: 0.7, roughness: 0.4 }),
  /** Glow emissive — beacon sphere, cupola lantern */
  glowLight: new THREE.MeshBasicMaterial({ color: 0xfff3cc }),
  /** Dark void — portal archways */
  darkVoid: new THREE.MeshBasicMaterial({ color: 0x0a0f0d }),
  /** Montmartre hill dark earth */
  hillEarth: new THREE.MeshStandardMaterial({ color: 0x12241b, roughness: 0.95, metalness: 0.0 }),
  /** Generic antenna grey */
  antenna: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.3 }),
};


/** Creates the Eiffel Tower with warm golden lattice finish, base arches, and rotating searchlight beacon */
export function createEiffelTower(): EiffelTowerObject {
  const group: EiffelTowerObject = new THREE.Group();
  group.name = 'Tour Eiffel';

  const goldLatticeMat = SHARED_MATS.goldLattice;
  const baseArchMat = SHARED_MATS.baseArch;
  const glowLightMat = SHARED_MATS.glowLight;

  // Base 4 massive inclined pillars
  const pillarGeo = new THREE.BoxGeometry(18, 90, 18);
  const pillarSpreads = [
    [-38, -38, 0.22, -0.22],
    [38, -38, -0.22, -0.22],
    [-38, 38, 0.22, 0.22],
    [38, 38, -0.22, 0.22]
  ];

  for (const [x, z, rz, rx] of pillarSpreads) {
    const pillar = new THREE.Mesh(pillarGeo, goldLatticeMat);
    pillar.position.set(x, 42, z);
    pillar.rotation.z = rz;
    pillar.rotation.x = rx;
    group.add(pillar);
  }

  // Grand connecting lower arches between pillars
  const arch1 = new THREE.Mesh(new THREE.TorusGeometry(36, 4, 8, 20, Math.PI), baseArchMat);
  arch1.position.set(0, 38, 36);
  arch1.rotation.y = 0;
  group.add(arch1);

  const arch2 = new THREE.Mesh(new THREE.TorusGeometry(36, 4, 8, 20, Math.PI), baseArchMat);
  arch2.position.set(0, 38, -36);
  group.add(arch2);

  const arch3 = new THREE.Mesh(new THREE.TorusGeometry(36, 4, 8, 20, Math.PI), baseArchMat);
  arch3.position.set(36, 38, 0);
  arch3.rotation.y = Math.PI / 2;
  group.add(arch3);

  const arch4 = new THREE.Mesh(new THREE.TorusGeometry(36, 4, 8, 20, Math.PI), baseArchMat);
  arch4.position.set(-36, 38, 0);
  arch4.rotation.y = Math.PI / 2;
  group.add(arch4);

  // 1st Platform (57m)
  const plat1 = new THREE.Mesh(new THREE.BoxGeometry(84, 8, 84), goldLatticeMat);
  plat1.position.y = 78;
  group.add(plat1);

  // Intermediate tier
  const midTier = new THREE.Mesh(new THREE.CylinderGeometry(24, 38, 90, 8), goldLatticeMat);
  midTier.position.y = 125;
  group.add(midTier);

  // 2nd Platform (115m)
  const plat2 = new THREE.Mesh(new THREE.BoxGeometry(50, 7, 50), goldLatticeMat);
  plat2.position.y = 172;
  group.add(plat2);

  // Top slender spire (up to 300m)
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(3, 18, 140, 8), goldLatticeMat);
  spire.position.y = 244;
  group.add(spire);

  // Cupola & Pinnacle lantern (324m)
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 14, 12), glowLightMat);
  cupola.position.y = 318;
  group.add(cupola);

  const spirePole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.5, 20, 8), goldLatticeMat);
  spirePole.position.y = 330;
  group.add(spirePole);

  // -------------------------------------------------------------
  // Le Phare de la Tour Eiffel (Rotating Light Beacon)
  // -------------------------------------------------------------
  const beaconGroup = new THREE.Group();
  beaconGroup.position.set(0, 324, 0);

  // Elegant slender light ray (with fog: false so it never turns into solid grey!)
  const rayGeo = new THREE.ConeGeometry(18, 900, 12, 1, true);
  rayGeo.translate(0, -450, 0);
  rayGeo.rotateX(Math.PI / 2);

  const rayMat = new THREE.MeshBasicMaterial({
    color: 0xfff3aa,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false // Crucial: prevents fog from turning the light into grey concrete!
  });

  const beam1 = new THREE.Mesh(rayGeo, rayMat);
  beaconGroup.add(beam1);

  const beam2 = new THREE.Mesh(rayGeo, rayMat);
  beam2.rotation.y = Math.PI;
  beaconGroup.add(beam2);

  // Central intense golden beacon light
  const beaconPointLight = new THREE.PointLight(0xfff3cc, 5.0, 3500, 0);
  beaconGroup.add(beaconPointLight);

  // Beacon glowing core sphere
  const beaconSphere = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 12), glowLightMat);
  beaconGroup.add(beaconSphere);

  group.add(beaconGroup);
  group.beaconGroup = beaconGroup;

  // Base illuminator spotlights (pointing upwards at the ironwork)
  const baseSpot = new THREE.PointLight(0xffd77a, 2.8, 450, 0);
  baseSpot.position.set(0, 20, 0);
  group.add(baseSpot);

  return group;
}

/** Creates the Arc de Triomphe with monumental vault and radiating golden avenue lights */
export function createArcDeTriomphe(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Arc de Triomphe';

  const stoneMat = SHARED_MATS.stone;
  const darkArchMat = SHARED_MATS.darkVoid;

  // Main Arch Mass
  const body = new THREE.Mesh(new THREE.BoxGeometry(48, 50, 24), stoneMat);
  body.position.y = 25;
  group.add(body);

  // Central Portal Archway
  const portal = new THREE.Mesh(new THREE.BoxGeometry(20, 34, 26), darkArchMat);
  portal.position.y = 17;
  group.add(portal);

  // Transversal Portal Archway
  const transPortal = new THREE.Mesh(new THREE.BoxGeometry(26, 22, 12), darkArchMat);
  transPortal.position.y = 11;
  group.add(transPortal);

  // Attic Cornice
  const attic = new THREE.Mesh(new THREE.BoxGeometry(52, 9, 26), stoneMat);
  attic.position.y = 54.5;
  group.add(attic);

  // Warm spotlight illumination
  const spot = new THREE.PointLight(0xffdf96, 2.2, 280, 0);
  spot.position.set(0, 30, 0);
  group.add(spot);

  // 12 Radiating Avenue Light Rays (Place de l'Étoile)
  const rayMat = new THREE.LineBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const pts = [
      new THREE.Vector3(Math.cos(angle) * 70, 2, Math.sin(angle) * 70),
      new THREE.Vector3(Math.cos(angle) * 700, 2, Math.sin(angle) * 700)
    ];
    const rayGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(rayGeo, rayMat);
    group.add(line);
  }

  return group;
}

/** Creates the Sacré-Cœur basilica on its elevated Montmartre hill plinth */
export function createSacreCoeur(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Sacré-Cœur';

  const whiteTravertine = SHARED_MATS.travertine;
  const greenCopperMat = SHARED_MATS.copper;
  const hillMat = SHARED_MATS.hillEarth;

  const hill = new THREE.Mesh(new THREE.CylinderGeometry(180, 260, 90, 24), hillMat);
  hill.position.y = 45;
  group.add(hill);

  // Basilica Main Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(55, 34, 75), whiteTravertine);
  body.position.y = 107;
  group.add(body);

  // Portico front facade
  const portico = new THREE.Mesh(new THREE.BoxGeometry(38, 20, 18), whiteTravertine);
  portico.position.set(0, 100, -42);
  group.add(portico);

  // Central Grand Cupola Dome
  const centralDome = new THREE.Mesh(new THREE.SphereGeometry(18, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), whiteTravertine);
  centralDome.position.set(0, 124, 0);
  group.add(centralDome);

  const centralLantern = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 18, 12), whiteTravertine);
  centralLantern.position.set(0, 146, 0);
  group.add(centralLantern);

  // 4 Minor Surrounding Cupolas
  const cupolaOffsets = [
    [-18, -20],
    [18, -20],
    [-18, 20],
    [18, 20]
  ];
  for (const [cx, cz] of cupolaOffsets) {
    const cup = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), whiteTravertine);
    cup.position.set(cx, 124, cz);
    group.add(cup);
  }

  // Campanile (83m Bell Tower) at rear
  const campanile = new THREE.Mesh(new THREE.BoxGeometry(14, 68, 14), whiteTravertine);
  campanile.position.set(0, 124, 32);
  group.add(campanile);

  const campanileRoof = new THREE.Mesh(new THREE.ConeGeometry(8, 18, 8), greenCopperMat);
  campanileRoof.position.set(0, 167, 32);
  group.add(campanileRoof);

  // Warm spotlight illumination
  const light = new THREE.PointLight(0xfff3d4, 3.2, 500, 0);
  light.position.set(0, 140, -30);
  group.add(light);

  return group;
}

/** Creates Notre-Dame Cathedral on the Île de la Cité */
export function createNotreDame(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Notre-Dame';

  const stoneMat = SHARED_MATS.stone;
  const roofMat = SHARED_MATS.slate;

  // Long Gothic Nave
  const nave = new THREE.Mesh(new THREE.BoxGeometry(36, 32, 110), stoneMat);
  nave.position.y = 16;
  group.add(nave);

  // High gabled roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(24, 18, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 4.4);
  roof.position.set(0, 41, 0);
  group.add(roof);

  // West Front Twin Towers (69m)
  const towerGeo = new THREE.BoxGeometry(14, 68, 14);
  const towerLeft = new THREE.Mesh(towerGeo, stoneMat);
  towerLeft.position.set(-11, 34, -55);
  group.add(towerLeft);

  const towerRight = new THREE.Mesh(towerGeo, stoneMat);
  towerRight.position.set(11, 34, -55);
  group.add(towerRight);

  // Central Gothic Spire (93m)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.5, 52, 8), roofMat);
  spire.position.set(0, 68, 5);
  group.add(spire);

  // Illuminated rose window glow
  const roseGlow = new THREE.PointLight(0xffc56e, 2.5, 200, 0);
  roseGlow.position.set(0, 26, -56);
  group.add(roseGlow);

  return group;
}

/** Creates the Dôme des Invalides with brilliant gilded golden dome */
export function createInvalides(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Invalides';

  const stoneMat = SHARED_MATS.stone;
  const goldDomeMat = SHARED_MATS.goldDome;

  // Main square corps de logis
  const base = new THREE.Mesh(new THREE.BoxGeometry(60, 36, 60), stoneMat);
  base.position.y = 18;
  group.add(base);

  // Colonnaded Drum
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 28, 20), stoneMat);
  drum.position.y = 50;
  group.add(drum);

  // Golden Dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), goldDomeMat);
  dome.position.y = 64;
  group.add(dome);

  // Spire & cross atop lantern
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 18, 12), goldDomeMat);
  lantern.position.y = 86;
  group.add(lantern);

  const lanternLight = new THREE.PointLight(0xffdc73, 2.5, 250, 0);
  lanternLight.position.y = 90;
  group.add(lanternLight);

  return group;
}

/** Creates Tour Montparnasse with top communication mast and blinking hazard lights */
export function createMontparnasse(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Tour Montparnasse';

  const glassMat = SHARED_MATS.darkGlass;

  // Curved almond-shaped monolith (50m x 32m x 210m)
  const tower = new THREE.Mesh(new THREE.BoxGeometry(48, 210, 32), glassMat);
  tower.position.y = 105;
  group.add(tower);

  // Antenna
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.5, 24, 8), SHARED_MATS.antenna);
  antenna.position.y = 222;
  group.add(antenna);

  // Red aviation warning beacon
  const redBeacon = new THREE.PointLight(0xff2222, 2.2, 400, 0);
  redBeacon.position.set(0, 225, 0);
  group.add(redBeacon);

  return group;
}

/** Creates the Louvre courtyard & illuminated glass pyramid */
export function createLouvre(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Musée du Louvre';

  const palaceMat = SHARED_MATS.palaceStone;

  // U-shaped palace wings (Cour Napoléon)
  const wingN = new THREE.Mesh(new THREE.BoxGeometry(22, 28, 220), palaceMat);
  wingN.position.set(-65, 14, 0);
  group.add(wingN);

  const wingS = new THREE.Mesh(new THREE.BoxGeometry(22, 28, 220), palaceMat);
  wingS.position.set(65, 14, 0);
  group.add(wingS);

  const wingE = new THREE.Mesh(new THREE.BoxGeometry(110, 30, 24), palaceMat);
  wingE.position.set(0, 15, 100);
  group.add(wingE);

  // Glass Pyramid
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(24, 21.6, 4), SHARED_MATS.glassPyramid);
  pyramid.rotation.y = Math.PI / 4;
  pyramid.position.set(0, 10.8, 0);
  group.add(pyramid);

  const pyrLight = new THREE.PointLight(0xffe89e, 2.4, 180, 0);
  pyrLight.position.set(0, 12, 0);
  group.add(pyrLight);

  return group;
}

/** Creates the Panthéon with high dome on Montagne Sainte-Geneviève */
export function createPantheon(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Le Panthéon';

  const stoneMat = SHARED_MATS.stone;

  // Greek cross body
  const body1 = new THREE.Mesh(new THREE.BoxGeometry(84, 26, 36), stoneMat);
  body1.position.y = 13;
  group.add(body1);

  const body2 = new THREE.Mesh(new THREE.BoxGeometry(36, 26, 84), stoneMat);
  body2.position.y = 13;
  group.add(body2);

  // Portico columns at front
  const portico = new THREE.Mesh(new THREE.BoxGeometry(38, 22, 18), stoneMat);
  portico.position.set(0, 11, -48);
  group.add(portico);

  // Drum & Dome (83m)
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(18, 20, 24, 18), stoneMat);
  drum.position.y = 38;
  group.add(drum);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), stoneMat);
  dome.position.y = 50;
  group.add(dome);

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 16, 8), stoneMat);
  lantern.position.y = 70;
  group.add(lantern);

  const spot = new THREE.PointLight(0xffd580, 2.0, 200, 0);
  spot.position.set(0, 45, 0);
  group.add(spot);

  return group;
}

// -------------------------------------------------------------
// Official Paris Landmarks Registry with WGS84 coordinates
// -------------------------------------------------------------
export const PARIS_LANDMARKS: LandmarkDef[] = [
  {
    name: 'Tour Eiffel',
    coords: [2.2945, 48.8584],
    builder: createEiffelTower,
    cameraPreset: { distance: 680, pitch: 35, altitude: 220 }
  },
  {
    name: 'Arc de Triomphe',
    coords: [2.2950, 48.8738],
    builder: createArcDeTriomphe,
    cameraPreset: { distance: 550, pitch: 40, altitude: 160 }
  },
  {
    name: 'Sacré-Cœur (Montmartre)',
    coords: [2.3431, 48.8867],
    builder: createSacreCoeur,
    cameraPreset: { distance: 750, pitch: 35, altitude: 240 }
  },
  {
    name: 'Notre-Dame de Paris',
    coords: [2.3499, 48.8530],
    builder: createNotreDame,
    cameraPreset: { distance: 600, pitch: 40, altitude: 180 }
  },
  {
    name: 'Hôtel des Invalides',
    coords: [2.3124, 48.8550],
    builder: createInvalides,
    cameraPreset: { distance: 650, pitch: 40, altitude: 200 }
  },
  {
    name: 'Tour Montparnasse',
    coords: [2.3217, 48.8421],
    builder: createMontparnasse,
    cameraPreset: { distance: 750, pitch: 30, altitude: 320 }
  },
  {
    name: 'Musée du Louvre',
    coords: [2.3364, 48.8606],
    builder: createLouvre,
    cameraPreset: { distance: 580, pitch: 45, altitude: 180 }
  },
  {
    name: 'Le Panthéon',
    coords: [2.3460, 48.8462],
    builder: createPantheon,
    cameraPreset: { distance: 550, pitch: 40, altitude: 180 }
  }
];
