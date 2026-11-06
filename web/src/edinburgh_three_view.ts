import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface EdinburghThreeViewHandle {
  destroy: () => void;
  setCameraPreset: (name: 'waverley' | 'castle' | 'calton' | 'overview') => void;
  selectLine: (lineId: string | null) => void;
  focusStation: (stationName: string) => void;
  startFollowTrain: (serviceIndex: number) => void;
  stopFollowTrain: () => void;
  toggleFollowTrain: () => void;
  onTrainSelect?: (train: ActiveService) => void;
}

interface RailCorridor {
  id: string;
  name: string;
  length_m: number;
  points: [number, number, number][];
}

interface RailData {
  origin_ll: [number, number];
  origin_bng: [number, number];
  unit: string;
  corridors: RailCorridor[];
}

export interface ActiveService {
  id: string;
  lineId: string;
  headcode: string;
  name: string;
  destination: string;
  operator: string;
  platform: string;
  corridorIdx: number;
  speedMps: number;
  speedKmh: number;
  progress: number;
  reversed: boolean;
  color: string;
  trainInstance: THREE.Group;
  dwellTimer: number;
  position: THREE.Vector3;
}

interface StationMarker3D {
  name: string;
  position: THREE.Vector3;
  element: HTMLElement;
  lines: string[];
}

export function initEdinburghThreeView(
  container: HTMLElement,
  options?: {
    onTrainClick?: (service: ActiveService) => void;
    onStationClick?: (stationName: string) => void;
  }
): EdinburghThreeViewHandle {
  // 1. Scène, Ciel atmosphérique & Brume d'Édimbourg
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x151b24); // Bleu nuit d'Édimbourg profond et élégant
  scene.background = skyColor;
  scene.fog = new THREE.FogExp2(0x151b24, 0.00015);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(45, width / height, 1, 25000);
  camera.position.set(0, 360, 520); // Vue plongeante inaugurale sur la vallée de Waverley

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  container.appendChild(renderer.domElement);

  // Contrôles orbitaux avec amortissement haute fluidité
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.015; // Évite de passer sous le sol
  controls.minDistance = 25;
  controls.maxDistance = 7500;
  controls.target.set(0, 52.7, 0); // Verrière centrale de Waverley

  // 2. Éclairage solaire rasant & débouchage des façades
  const ambientLight = new THREE.HemisphereLight(0xdde9f7, 0x484b3e, 1.15);
  scene.add(ambientLight);

  // Soleil rasant sud-ouest mettant en valeur Castle Rock et les collines
  const sunLight = new THREE.DirectionalLight(0xfff3e0, 2.3);
  sunLight.position.set(-800, 650, 550);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 4000;
  const d = 1600;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x7590ab, 0.7);
  fillLight.position.set(650, 350, -450);
  scene.add(fillLight);

  // 3. Modèle 3D de la ville : Relief, Bâti & Monuments
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  // Matériau réaliste des rails OSM de la ville
  const tracksBedMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x282c32), // Acier foncé patiné & ballast
    roughness: 0.55,
    metalness: 0.65
  });

  loader.load('/cities/edinburgh/models/edinburgh_city.glb', (gltf) => {
    const city = gltf.scene;
    city.scale.set(100, 100, 100);

    city.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name || '';
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Voies ferrées intégrées dans le modèle 3D
        if (name.includes('Lignes_Train')) {
          mesh.material = tracksBedMaterial;
          return;
        }

        // A. Relief du centre (végétation éclatante, eau et falaises de Castle Rock)
        if (name === 'Terrain_centre' && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const posAttr = mesh.geometry.attributes.position;
          const count = colAttr.count;

          const grassColor = new THREE.Color('#3b7a32');
          const woodlandColor = new THREE.Color('#244d1e');
          const waterColor = new THREE.Color('#25628a');
          const basaltColor = new THREE.Color('#383430');
          const stoneColor = new THREE.Color('#8a8072');

          for (let i = 0; i < count; i++) {
            const r = colAttr.getX(i);
            const g = colAttr.getY(i);
            const b = colAttr.getZ(i);
            const x = posAttr ? posAttr.getX(i) : 0;
            const y = posAttr ? posAttr.getY(i) : 0;
            const z = posAttr ? posAttr.getZ(i) : 0;

            if (g > r && g > b) {
              const c = g > 0.58 ? grassColor : woodlandColor;
              colAttr.setXYZ(i, c.r, c.g, c.b);
            } else if (b > r && b > g) {
              colAttr.setXYZ(i, waterColor.r, waterColor.g, waterColor.b);
            } else if (x > -4.5 && x < -2.2 && z > -1.0 && z < 1.5 && y > 0.75) {
              colAttr.setXYZ(i, basaltColor.r, basaltColor.g, basaltColor.b);
            } else {
              colAttr.setXYZ(i, stoneColor.r, stoneColor.g, stoneColor.b);
            }
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.82,
            metalness: 0.05
          });
        }
        // B. Relief de la ville environnante
        else if (name === 'Terrain_ville' && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const rollingHill = new THREE.Color('#3f6632');
          for (let i = 0; i < colAttr.count; i++) {
            colAttr.setXYZ(i, rollingHill.r, rollingHill.g, rollingHill.b);
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.05
          });
        }
        // C. Rues & voirie
        else if (name === 'Voirie_centre') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#222120'),
            roughness: 0.75,
            metalness: 0.1
          });
        }
        // D. Bâtiments : Vieille Ville médiévale & Nouvelle Ville géorgienne
        else if (name.startsWith('Bati_') && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const isOld = name.includes('Vieille');
          const isNew = name.includes('Nouvelle');

          const wall = isOld
            ? new THREE.Color('#9e8e7a')
            : isNew
            ? new THREE.Color('#cfc2ad')
            : new THREE.Color('#b8ac98');
          const roof = isOld ? new THREE.Color('#343940') : new THREE.Color('#3f474f');

          for (let i = 0; i < colAttr.count; i++) {
            const r = colAttr.getX(i);
            const b = colAttr.getZ(i);
            const c = b > r * 0.95 ? roof : wall;
            colAttr.setXYZ(i, c.r, c.g, c.b);
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.68,
            metalness: 0.08
          });
        }
        // E. Monuments historiques identifiés
        else if (name.startsWith('Monument_')) {
          let mColor = new THREE.Color('#c2b5a2');
          let r = 0.65;
          let m = 0.1;
          if (name.includes('Scott')) {
            mColor = new THREE.Color('#2e2a26');
            r = 0.6;
            m = 0.2;
          } else if (name.includes('Balmoral')) {
            mColor = new THREE.Color('#d4b68a');
            r = 0.55;
            m = 0.15;
          } else if (name.includes('Hub')) {
            mColor = new THREE.Color('#3d3730');
          } else if (name.includes('Giles')) {
            mColor = new THREE.Color('#a39682');
            m = 0.25;
          } else if (name.includes('Mary')) {
            mColor = new THREE.Color('#cec6b8');
          } else if (name.includes('Tron')) {
            mColor = new THREE.Color('#557d72');
            m = 0.3;
          } else if (name.includes('Chimney')) {
            mColor = new THREE.Color('#944e3b');
          }
          mesh.material = new THREE.MeshStandardMaterial({
            color: mColor,
            roughness: r,
            metalness: m
          });
        }
        // F. Verrière de la gare de Waverley
        else if (name.includes('Gare_Edinburgh_Waverley')) {
          mesh.material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color('#789bbb'),
            transparent: true,
            opacity: 0.38,
            roughness: 0.12,
            transmission: 0.6,
            depthWrite: false
          });
        }
      }
    });

    cityGroup.add(city);
    console.info('[edinburgh-3d] Edinburgh 3D model loaded and blended with city relief.');
  });

  // 4. Réseau Ferroviaire 3D Lourd & Voies Lumineuses par Ligne
  const railNetworkGroup = new THREE.Group();
  scene.add(railNetworkGroup);

  const LINE_COLORS: Record<string, number> = {
    GLA: 0x002d62, // ScotRail Saltire Navy
    FIF: 0x00823b, // Fife Circle Emerald
    BOR: 0x7b1fa2, // Borders Heather Violet
    NCL: 0x0097a7, // North Clyde Cyan
    SHO: 0xe65100, // Shotts Amber
    LNER: 0xba0c2f, // LNER Crimson Red
    CS: 0x1338be // Caledonian Sleeper Midnight Blue
  };

  const lineTracksMap = new Map<string, THREE.Line[]>();
  let activeSelectedLine: string | null = null;

  // 5. Trains & Circulations Réalistes
  const activeServices: ActiveService[] = [];
  let trainPrototype: THREE.Group | null = null;
  let followIndex = -1;
  let isCameraFollowing = false;

  // Définitions officielles des services ferroviaires lourds
  const trainDefinitions = [
    {
      id: '1R24_GLA',
      line: 'GLA',
      headcode: '1R24',
      name: 'ScotRail Express',
      dest: 'Glasgow Queen St',
      op: 'ScotRail',
      plat: '11',
      speed: 36,
      rev: false,
      corridor: 0
    },
    {
      id: '1R31_GLA',
      line: 'GLA',
      headcode: '1R31',
      name: 'ScotRail Express',
      dest: 'Edinburgh Waverley',
      op: 'ScotRail',
      plat: '12',
      speed: 34,
      rev: true,
      corridor: 1
    },
    {
      id: '2G40_FIF',
      line: 'FIF',
      headcode: '2G40',
      name: 'Fife Circle Line',
      dest: 'Cowdenbeath / Gateway',
      op: 'ScotRail',
      plat: '2',
      speed: 28,
      rev: false,
      corridor: 0
    },
    {
      id: '1E09_LNER',
      line: 'LNER',
      headcode: '1E09',
      name: 'LNER East Coast',
      dest: "London King's Cross",
      op: 'LNER',
      plat: '19',
      speed: 40,
      rev: false,
      corridor: 3
    },
    {
      id: '2T18_BOR',
      line: 'BOR',
      headcode: '2T18',
      name: 'Borders Railway',
      dest: 'Tweedbank',
      op: 'ScotRail',
      plat: '7',
      speed: 26,
      rev: false,
      corridor: 3
    },
    {
      id: '1M16_CS',
      line: 'CS',
      headcode: '1M16',
      name: 'Caledonian Sleeper',
      dest: 'London Euston (via Carstairs)',
      op: 'Serco',
      plat: '8',
      speed: 30,
      rev: false,
      corridor: 5
    },
    {
      id: '2Y22_SHO',
      line: 'SHO',
      headcode: '2Y22',
      name: 'ScotRail Shotts Line',
      dest: 'Curriehill / Glasgow',
      op: 'ScotRail',
      plat: '14',
      speed: 27,
      rev: false,
      corridor: 8
    }
  ];

  let catmullCurves: THREE.CatmullRomCurve3[] = [];

  Promise.all([
    fetch('/cities/edinburgh/data/rail_curves_3d.json').then((r) => r.json()),
    new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        '/cities/edinburgh/models/automotrice_ecossaise.glb',
        (gltf) => resolve(gltf.scene),
        undefined,
        reject
      );
    })
  ])
    .then(([railData, loadedTrain]: [RailData, THREE.Group]) => {
      trainPrototype = loadedTrain;

      // Matériaux de la motrice avec éclairage des fanaux
      trainPrototype.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          if (m.material) {
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.roughness = 0.35;
            mat.metalness = 0.25;
            if (mat.name.includes('phare')) {
              mat.emissive = new THREE.Color(0xfff8d0);
              mat.emissiveIntensity = 2.5;
            } else if (mat.name.includes('feu_rouge')) {
              mat.emissive = new THREE.Color(0xff1111);
              mat.emissiveIntensity = 2.5;
            } else if (mat.name.includes('girouette')) {
              mat.emissive = new THREE.Color(0xffb020);
              mat.emissiveIntensity = 1.8;
            }
          }
        }
      });

      // Construction des courbes 3D et des tracés ferroviaires colorés
      catmullCurves = railData.corridors.map((c) => {
        const v = c.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        return new THREE.CatmullRomCurve3(v);
      });

      // Traçage des lignes dans la scène 3D
      trainDefinitions.forEach((def) => {
        const curve = catmullCurves[def.corridor];
        if (!curve) return;

        const lineColor = LINE_COLORS[def.line] || 0x4d6c96;
        const trackMat = new THREE.LineBasicMaterial({
          color: lineColor,
          transparent: true,
          opacity: 0.85,
          linewidth: 2
        });

        const numPts = Math.max(30, Math.floor(railData.corridors[def.corridor].length_m / 10));
        const pts = curve.getPoints(numPts);
        // Légère surélévation pour éviter le z-fighting avec la géométrie du sol
        pts.forEach((p) => (p.y += 0.35));

        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMesh = new THREE.Line(geo, trackMat);
        railNetworkGroup.add(lineMesh);

        if (!lineTracksMap.has(def.line)) {
          lineTracksMap.set(def.line, []);
        }
        lineTracksMap.get(def.line)!.push(lineMesh);
      });

      // Instanciation des trains ScotRail
      trainDefinitions.forEach((def, i) => {
        const curve = catmullCurves[def.corridor];
        if (!curve) return;

        const trainInstance = trainPrototype!.clone(true);
        // Tag pour détection par raycasting
        trainInstance.userData = { serviceIndex: i, isTrain: true };
        trainInstance.traverse((c) => {
          c.userData = { serviceIndex: i, isTrain: true };
        });
        scene.add(trainInstance);

        const s: ActiveService = {
          id: def.id,
          lineId: def.line,
          headcode: def.headcode,
          name: def.name,
          destination: def.dest,
          operator: def.op,
          platform: def.plat,
          corridorIdx: def.corridor,
          speedMps: def.speed,
          speedKmh: Math.round(def.speed * 3.6),
          progress: (i * 0.19) % 1.0,
          reversed: def.rev,
          color: '#' + (LINE_COLORS[def.line] || 0x002d62).toString(16).padStart(6, '0'),
          trainInstance,
          dwellTimer: 0,
          position: new THREE.Vector3()
        };
        activeServices.push(s);
      });

      console.info(`[edinburgh-3d] ${activeServices.length} Scottish Rail heavy trains loaded & running on network.`);
    })
    .catch((err) => {
      console.warn('[edinburgh-3d] Error loading Scottish Rail network:', err);
    });

  // 6. Gares Ferroviaires : Marqueurs 3D & Étiquettes
  const stationLocations: Record<string, [number, number, number]> = {
    'Edinburgh Waverley': [0, 53.0, 0],
    Haymarket: [-1864, 57.5, 736],
    'Edinburgh Gateway': [-8233, 50.5, 1108],
    'Edinburgh Park': [-7476, 56.5, 2607],
    'South Gyle': [-6943, 50.5, 1627],
    Slateford: [-3519, 65.8, 2804],
    Kingsknowe: [-4825, 80.5, 3624],
    'Wester Hailes': [-6019, 92.5, 4107],
    Curriehill: [-8231, 110.5, 5611]
  };

  const stationMarkers3D: StationMarker3D[] = [];
  const overlayContainer = document.createElement('div');
  overlayContainer.id = 'edinburgh-station-overlay';
  overlayContainer.style.position = 'absolute';
  overlayContainer.style.inset = '0';
  overlayContainer.style.pointerEvents = 'none';
  overlayContainer.style.zIndex = '3';
  overlayContainer.style.overflow = 'hidden';
  container.appendChild(overlayContainer);

  Object.entries(stationLocations).forEach(([name, coords]) => {
    // Balise 3D sur le terrain (disque lumineux)
    const diskGeo = new THREE.CylinderGeometry(14, 14, 2, 24);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0x002d62,
      transparent: true,
      opacity: 0.85
    });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.position.set(coords[0], coords[1] + 1.0, coords[2]);
    scene.add(disk);

    // Étiquette HTML dynamique projetée
    const badge = document.createElement('div');
    badge.className = 'edinburgh-station-badge';
    badge.style.position = 'absolute';
    badge.style.transform = 'translate(-50%, -100%)';
    badge.style.background = 'rgba(14, 20, 29, 0.88)';
    badge.style.backdropFilter = 'blur(6px)';
    badge.style.border = '1px solid rgba(255, 255, 255, 0.15)';
    badge.style.borderRadius = '4px';
    badge.style.padding = '3px 7px';
    badge.style.color = '#ffffff';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '600';
    badge.style.whiteSpace = 'nowrap';
    badge.style.pointerEvents = 'auto';
    badge.style.cursor = 'pointer';
    badge.style.transition = 'all 0.15s ease';
    badge.innerHTML = `🚉 ${name}`;

    badge.addEventListener('mouseenter', () => {
      badge.style.background = '#002d62';
      badge.style.borderColor = '#4ade80';
      badge.style.transform = 'translate(-50%, -115%) scale(1.08)';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.background = 'rgba(14, 20, 29, 0.88)';
      badge.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      badge.style.transform = 'translate(-50%, -100%) scale(1.0)';
    });
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      flyToTarget(new THREE.Vector3(coords[0], coords[1], coords[2]), 600, 45);
      options?.onStationClick?.(name);
    });

    overlayContainer.appendChild(badge);

    stationMarkers3D.push({
      name,
      position: new THREE.Vector3(coords[0], coords[1], coords[2]),
      element: badge,
      lines: []
    });
  });

  // 7. Raycasting Interactif pour sélection et clic direct sur les trains
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onPointerDown(e: MouseEvent) {
    // Si clic avec bouton gauche
    if (e.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData?.isTrain) {
        obj = obj.parent;
      }
      if (obj && typeof obj.userData?.serviceIndex === 'number') {
        const sIdx = obj.userData.serviceIndex;
        startFollowTrain(sIdx);
        if (activeServices[sIdx]) {
          options?.onTrainClick?.(activeServices[sIdx]);
        }
        return;
      }
    }
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // Double-clic pour centrer la caméra sur le point visé
  function onDoubleClick(e: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cityGroup.children, true);
    if (intersects.length > 0) {
      const hitPoint = intersects[0].point;
      flyToTarget(hitPoint, 350, 40);
    }
  }
  renderer.domElement.addEventListener('dblclick', onDoubleClick);

  // 8. Navigation Clavier Haute Mobilité (WASD / Flèches / QE)
  const keysDown = new Set<string>();
  function onKeyDown(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e', 'Escape'].includes(e.key)) {
      keysDown.add(e.key.toLowerCase());
      if (e.key === 'Escape' && isCameraFollowing) {
        stopFollowTrain();
      }
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    keysDown.delete(e.key.toLowerCase());
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Animation fluide de la caméra (interpolation / transition lerp)
  let cameraTransition: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null = null;

  function flyToTarget(targetPos: THREE.Vector3, distance = 400, pitchDeg = 50, durationMs = 1000) {
    stopFollowTrain();
    const rad = (pitchDeg * Math.PI) / 180;
    const destPos = new THREE.Vector3(
      targetPos.x,
      targetPos.y + Math.sin(rad) * distance,
      targetPos.z + Math.cos(rad) * distance
    );

    cameraTransition = {
      fromPos: camera.position.clone(),
      toPos: destPos,
      fromTarget: controls.target.clone(),
      toTarget: targetPos.clone(),
      startTime: performance.now(),
      duration: durationMs
    };
  }

  // 9. Boucle de Rendu & Cinématique des Trains Écossais
  let animationFrameId: number;
  let lastTime = performance.now();
  const forwardAxis = new THREE.Vector3(1, 0, 0); // Modèle orienté +X

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;

    // Déplacement dynamique clavier si l'utilisateur navigue au clavier
    if (keysDown.size > 0 && !isCameraFollowing) {
      const moveSpeed = (keysDown.has('shift') ? 450 : 220) * dt;
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      camDir.y = 0;
      camDir.normalize();

      const sideDir = new THREE.Vector3(-camDir.z, 0, camDir.x).normalize();

      if (keysDown.has('w') || keysDown.has('arrowup')) {
        camera.position.addScaledVector(camDir, moveSpeed);
        controls.target.addScaledVector(camDir, moveSpeed);
      }
      if (keysDown.has('s') || keysDown.has('arrowdown')) {
        camera.position.addScaledVector(camDir, -moveSpeed);
        controls.target.addScaledVector(camDir, -moveSpeed);
      }
      if (keysDown.has('a') || keysDown.has('arrowleft')) {
        camera.position.addScaledVector(sideDir, -moveSpeed);
        controls.target.addScaledVector(sideDir, -moveSpeed);
      }
      if (keysDown.has('d') || keysDown.has('arrowright')) {
        camera.position.addScaledVector(sideDir, moveSpeed);
        controls.target.addScaledVector(sideDir, moveSpeed);
      }
      if (keysDown.has('q')) {
        camera.position.y = Math.max(30, camera.position.y - moveSpeed);
      }
      if (keysDown.has('e')) {
        camera.position.y = Math.min(4500, camera.position.y + moveSpeed);
      }
    }

    // Transition caméra avec interpolation douce
    if (cameraTransition) {
      const elapsed = now - cameraTransition.startTime;
      const t = Math.min(1.0, elapsed / cameraTransition.duration);
      // Easing cubique (in-out)
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      camera.position.lerpVectors(cameraTransition.fromPos, cameraTransition.toPos, ease);
      controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, ease);

      if (t >= 1.0) {
        cameraTransition = null;
      }
    }

    // Cinématique des rames en circulation
    for (let i = 0; i < activeServices.length; i++) {
      const s = activeServices[i];
      const curve = catmullCurves[s.corridorIdx];

      if (s.dwellTimer > 0) {
        s.dwellTimer -= dt;
        continue;
      }

      // Vitesse le long de la courbe
      const distDelta = s.speedMps * dt;
      if (s.progress > 0.98 || s.progress < 0.02) {
        if (Math.random() < 0.005) {
          s.dwellTimer = 4.0; // Arrêt en gare
        }
      }

      s.progress = (s.progress + distDelta / 8500.0) % 1.0;
      const t = s.reversed ? 1.0 - s.progress : s.progress;

      if (curve) {
        const pos = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        if (s.reversed) tangent.negate();

        s.trainInstance.position.copy(pos);
        s.trainInstance.quaternion.setFromUnitVectors(forwardAxis, tangent);
        s.position.copy(pos);

        // Suivi dynamique par caméra embarquée / suiveuse
        if (isCameraFollowing && followIndex === i) {
          const followDistance = 95;
          const followElevation = 38;
          const idealCamPos = new THREE.Vector3()
            .copy(pos)
            .addScaledVector(tangent, -followDistance)
            .setY(pos.y + followElevation);

          // Interpolation progressive pour fluidité cinématique
          camera.position.lerp(idealCamPos, 0.08);
          controls.target.lerp(pos, 0.12);
        }
      }
    }

    // Mise à jour de la projection des étiquettes des gares
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const tempVec = new THREE.Vector3();

    for (const marker of stationMarkers3D) {
      tempVec.copy(marker.position);
      tempVec.y += 18; // Flotter au-dessus des quais
      tempVec.project(camera);

      // Si derrière la caméra ou hors écran
      if (tempVec.z > 1 || Math.abs(tempVec.x) > 1.2 || Math.abs(tempVec.y) > 1.2) {
        marker.element.style.display = 'none';
      } else {
        const x = (tempVec.x * halfWidth) + halfWidth;
        const y = -(tempVec.y * halfHeight) + halfHeight;
        const dist = camera.position.distanceTo(marker.position);
        
        // Atténuation ou masquage selon la distance
        if (dist > 4500) {
          marker.element.style.display = 'none';
        } else {
          marker.element.style.display = 'block';
          marker.element.style.left = `${Math.round(x)}px`;
          marker.element.style.top = `${Math.round(y)}px`;
          marker.element.style.opacity = dist < 3000 ? '1' : `${1 - (dist - 3000) / 1500}`;
        }
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // 10. Fonctions de pilotage exposées
  function selectLine(lineId: string | null) {
    activeSelectedLine = lineId;
    lineTracksMap.forEach((lines, id) => {
      const match = !lineId || id === lineId;
      lines.forEach((l) => {
        const mat = l.material as THREE.LineBasicMaterial;
        mat.opacity = match ? 0.95 : 0.2;
        mat.linewidth = match ? 3 : 1;
      });
    });

    if (lineId && lineTracksMap.has(lineId)) {
      // Trouver le centre de la ligne sélectionnée et y amener la caméra
      const lines = lineTracksMap.get(lineId)!;
      if (lines.length > 0) {
        lines[0].geometry.computeBoundingBox();
        const bbox = lines[0].geometry.boundingBox;
        if (bbox) {
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          flyToTarget(center, 1200, 52, 1200);
        }
      }
    }
  }

  function focusStation(stationName: string) {
    const coords = stationLocations[stationName];
    if (coords) {
      flyToTarget(new THREE.Vector3(coords[0], coords[1], coords[2]), 480, 48, 1100);
    }
  }

  function startFollowTrain(serviceIndex: number) {
    if (serviceIndex >= 0 && serviceIndex < activeServices.length) {
      followIndex = serviceIndex;
      isCameraFollowing = true;
      cameraTransition = null;
      console.info(`[edinburgh-3d] Camera following train: ${activeServices[followIndex]?.headcode}`);
    }
  }

  function stopFollowTrain() {
    if (isCameraFollowing) {
      isCameraFollowing = false;
      followIndex = -1;
      console.info('[edinburgh-3d] Camera follow stopped.');
    }
  }

  function toggleFollowTrain() {
    if (activeServices.length === 0) return;
    if (isCameraFollowing) {
      const next = (followIndex + 1) % activeServices.length;
      startFollowTrain(next);
    } else {
      startFollowTrain(0);
    }
  }

  // 11. Redimensionnement
  function handleResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', handleResize);

  return {
    destroy: () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      controls.dispose();
      renderer.dispose();
      overlayContainer.remove();
      if (renderer.domElement.parentElement) {
        renderer.domElement.remove();
      }
    },
    setCameraPreset: (name) => {
      switch (name) {
        case 'waverley':
          flyToTarget(new THREE.Vector3(0, 52.7, 0), 380, 52, 1100);
          break;
        case 'castle':
          flyToTarget(new THREE.Vector3(-250, 95, 40), 420, 42, 1100);
          break;
        case 'calton':
          flyToTarget(new THREE.Vector3(120, 65, 10), 460, 38, 1100);
          break;
        case 'overview':
        default:
          flyToTarget(new THREE.Vector3(0, 52.7, 0), 1600, 60, 1300);
          break;
      }
    },
    selectLine,
    focusStation,
    startFollowTrain,
    stopFollowTrain,
    toggleFollowTrain
  };
}
