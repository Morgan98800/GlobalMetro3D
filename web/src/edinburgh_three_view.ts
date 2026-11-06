import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { TrainMarker } from '@core/ui/map/trains_layer';

export interface EdinburghThreeViewHandle {
  destroy: () => void;
  setCameraPreset: (name: 'waverley' | 'castle' | 'calton' | 'scotland' | 'overview') => void;
  selectLine: (lineId: string | null) => void;
  focusStation: (stationName: string) => void;
  startFollowTrain: (trainId: string) => void;
  stopFollowTrain: () => void;
  toggleFollowTrain: () => void;
  updateSimulationTrains: (trains: TrainMarker[]) => void;
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

interface RenderedTrain {
  id: string;
  line: string;
  headcode: string;
  destName: string;
  group: THREE.Group;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentQuat: THREE.Quaternion;
  targetQuat: THREE.Quaternion;
  speedKmh: number;
}

export function initEdinburghThreeView(
  container: HTMLElement,
  options?: {
    onTrainClick?: (trainId: string, lineId: string) => void;
    onStationClick?: (stationName: string) => void;
  }
): EdinburghThreeViewHandle {
  // 1. Scène, Ciel atmosphérique & Brume d'Édimbourg
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x131a24); // Bleu nuit d'Édimbourg profond et élégant
  scene.background = skyColor;
  scene.fog = new THREE.FogExp2(0x131a24, 0.00008);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(45, width / height, 1, 75000);
  camera.position.set(0, 380, 560); // Vue inaugurale sur la vallée de Waverley

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.015;
  controls.minDistance = 20;
  controls.maxDistance = 35000;
  controls.target.set(0, 52.7, 0); // Verrière de Waverley

  // 2. Éclairage
  const ambientLight = new THREE.HemisphereLight(0xdbe7f5, 0x3f4438, 1.2);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff5e4, 2.4);
  sunLight.position.set(-800, 700, 550);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 4500;
  const d = 1800;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x708ba8, 0.7);
  fillLight.position.set(650, 400, -450);
  scene.add(fillLight);

  // 3. Modèle 3D de la ville : Relief d'Édimbourg, Bâti et Monuments
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  const tracksBedMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x282c32),
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

        if (name.includes('Lignes_Train')) {
          mesh.material = tracksBedMaterial;
          return;
        }

        if (name === 'Terrain_centre' && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const posAttr = mesh.geometry.attributes.position;
          const count = colAttr.count;

          const grass = new THREE.Color('#387730');
          const wood = new THREE.Color('#224b1c');
          const water = new THREE.Color('#225b82');
          const basalt = new THREE.Color('#35322e');
          const stone = new THREE.Color('#887e70');

          for (let i = 0; i < count; i++) {
            const r = colAttr.getX(i);
            const g = colAttr.getY(i);
            const b = colAttr.getZ(i);
            const x = posAttr ? posAttr.getX(i) : 0;
            const y = posAttr ? posAttr.getY(i) : 0;
            const z = posAttr ? posAttr.getZ(i) : 0;

            if (g > r && g > b) {
              const c = g > 0.58 ? grass : wood;
              colAttr.setXYZ(i, c.r, c.g, c.b);
            } else if (b > r && b > g) {
              colAttr.setXYZ(i, water.r, water.g, water.b);
            } else if (x > -4.5 && x < -2.2 && z > -1.0 && z < 1.5 && y > 0.75) {
              colAttr.setXYZ(i, basalt.r, basalt.g, basalt.b);
            } else {
              colAttr.setXYZ(i, stone.r, stone.g, stone.b);
            }
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.82,
            metalness: 0.05
          });
        } else if (name === 'Terrain_ville' && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const rollingHill = new THREE.Color('#395c2e');
          for (let i = 0; i < colAttr.count; i++) {
            colAttr.setXYZ(i, rollingHill.r, rollingHill.g, rollingHill.b);
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.05
          });
        } else if (name === 'Voirie_centre') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#222120'),
            roughness: 0.75,
            metalness: 0.1
          });
        } else if (name.startsWith('Bati_') && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const isOld = name.includes('Vieille');
          const isNew = name.includes('Nouvelle');

          const wall = isOld
            ? new THREE.Color('#9c8c78')
            : isNew
            ? new THREE.Color('#cec1ac')
            : new THREE.Color('#b8ac98');
          const roof = isOld ? new THREE.Color('#32373e') : new THREE.Color('#3d454d');

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
        } else if (name.startsWith('Monument_')) {
          let mColor = new THREE.Color('#c2b5a2');
          let r = 0.65;
          let m = 0.1;
          if (name.includes('Scott')) {
            mColor = new THREE.Color('#2b2724');
            r = 0.6;
            m = 0.2;
          } else if (name.includes('Balmoral')) {
            mColor = new THREE.Color('#d4b68a');
            r = 0.55;
            m = 0.15;
          } else if (name.includes('Hub')) {
            mColor = new THREE.Color('#38332c');
          } else if (name.includes('Giles')) {
            mColor = new THREE.Color('#a19480');
            m = 0.25;
          } else if (name.includes('Mary')) {
            mColor = new THREE.Color('#cac2b4');
          } else if (name.includes('Tron')) {
            mColor = new THREE.Color('#52796e');
            m = 0.3;
          } else if (name.includes('Chimney')) {
            mColor = new THREE.Color('#914b38');
          }
          mesh.material = new THREE.MeshStandardMaterial({
            color: mColor,
            roughness: r,
            metalness: m
          });
        } else if (name.includes('Gare_Edinburgh_Waverley')) {
          mesh.material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color('#789bbb'),
            transparent: true,
            opacity: 0.4,
            roughness: 0.12,
            transmission: 0.6,
            depthWrite: false
          });
        }
      }
    });

    cityGroup.add(city);
    console.info('[edinburgh-3d] Edinburgh 3D model loaded.');
  });

  // 4. Mappage Régional de l'Écosse (Scotland Landscape & Railway Network)
  const scotlandGroup = new THREE.Group();
  scene.add(scotlandGroup);

  // A. Estuaire du Firth of Forth & Mer du Nord
  const seaGeo = new THREE.PlaneGeometry(90000, 60000, 16, 16);
  const seaMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#142e47'),
    roughness: 0.25,
    metalness: 0.55
  });
  const seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.set(5000, 1.0, -18000); // Au nord d'Édimbourg vers le Firth of Forth
  scotlandGroup.add(seaMesh);

  // B. Relief Régional Simplifié de l'Écosse Centrale (Lowlands, Fife, Highlands)
  const scotlandTerrainGeo = new THREE.PlaneGeometry(120000, 100000, 48, 48);
  const scotlandTerrainMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#294a24'), // Vert collines écossaises
    roughness: 0.9,
    metalness: 0.05
  });
  const scotlandTerrain = new THREE.Mesh(scotlandTerrainGeo, scotlandTerrainMat);
  scotlandTerrain.rotation.x = -Math.PI / 2;
  scotlandTerrain.position.set(-10000, -5.0, 5000);
  scotlandGroup.add(scotlandTerrain);

  // C. L'iconique Pont du Forth (Forth Bridge - Patrimoine UNESCO)
  // Situé au nord-ouest d'Édimbourg (Dalmeny <-> North Queensferry)
  const forthBridgeGroup = new THREE.Group();
  const bridgeRed = new THREE.Color('#ba2b23'); // Rouge emblématique du pont
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: bridgeRed,
    roughness: 0.4,
    metalness: 0.6
  });

  // 3 imposants cantilevers triangulaires caractéristiques du Forth Bridge
  for (let bi = -1; bi <= 1; bi++) {
    const cantilever = new THREE.Mesh(new THREE.ConeGeometry(80, 110, 4), bridgeMat);
    cantilever.rotation.y = Math.PI / 4;
    cantilever.position.set(bi * 240, 55, 0);
    forthBridgeGroup.add(cantilever);
  }
  // Tablier ferroviaire du pont
  const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(750, 6, 16), bridgeMat);
  bridgeDeck.position.set(0, 32, 0);
  forthBridgeGroup.add(bridgeDeck);

  forthBridgeGroup.position.set(-10500, 10, -8200);
  forthBridgeGroup.rotation.y = -Math.PI / 10;
  scotlandGroup.add(forthBridgeGroup);

  // D. Grandes Lignes Ferroviaires Régionales d'Écosse
  const regionalLinesMat = new THREE.LineBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.65,
    linewidth: 2
  });

  const regionalRoutes = [
    // Vers Glasgow Queen Street (Ouest)
    [[-1864, 57, 736], [-15000, 60, 1500], [-35000, 50, 2200], [-55000, 45, 3000]],
    // Vers Fife, Dundee & Aberdeen (Nord via Forth Bridge)
    [[-8233, 51, 1108], [-10500, 32, -8200], [-12000, 45, -16000], [-20000, 50, -32000]],
    // Vers Stirling & Highlands (Nord-Ouest)
    [[-15000, 60, 1500], [-25000, 55, -8000], [-42000, 50, -18000]],
    // Borders Railway vers Tweedbank (Sud-Est)
    [[0, 53, 0], [12000, 65, 12000], [28000, 95, 26000], [45000, 110, 42000]],
    // East Coast Main Line vers Dunbar & Londres (Est)
    [[0, 53, 0], [18000, 50, 4000], [38000, 40, 8000], [60000, 35, 15000]]
  ];

  regionalRoutes.forEach((pts) => {
    const v = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const geo = new THREE.BufferGeometry().setFromPoints(v);
    const line = new THREE.Line(geo, regionalLinesMat);
    scotlandGroup.add(line);
  });

  // 5. Corridors 3D Locaux & Réseau Ferroviaire d'Édimbourg
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
  let catmullCurves: THREE.CatmullRomCurve3[] = [];

  const lineToCorridorMap: Record<string, number> = {
    GLA: 1,
    FIF: 0,
    BOR: 3,
    NCL: 7,
    SHO: 8,
    LNER: 3,
    CS: 5
  };

  fetch('/cities/edinburgh/data/rail_curves_3d.json')
    .then((r) => r.json())
    .then((railData: RailData) => {
      catmullCurves = railData.corridors.map((c) => {
        const v = c.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        return new THREE.CatmullRomCurve3(v);
      });

      // Construction des voies 3D colorées fondues dans le relief
      Object.entries(lineToCorridorMap).forEach(([lineId, cIdx]) => {
        const curve = catmullCurves[cIdx];
        if (!curve) return;

        const lineColor = LINE_COLORS[lineId] || 0x4d6c96;
        const trackMat = new THREE.LineBasicMaterial({
          color: lineColor,
          transparent: true,
          opacity: 0.9,
          linewidth: 3
        });

        const numPts = Math.max(30, Math.floor(railData.corridors[cIdx].length_m / 10));
        const pts = curve.getPoints(numPts);
        pts.forEach((p) => (p.y += 0.35)); // Évite z-fighting

        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMesh = new THREE.Line(geo, trackMat);
        scene.add(lineMesh);

        if (!lineTracksMap.has(lineId)) {
          lineTracksMap.set(lineId, []);
        }
        lineTracksMap.get(lineId)!.push(lineMesh);
      });
    });

  // 6. Gares Ferroviaires & Repères Régionaux (Coordonnées 3D rigoureuses en mètres)
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

  // Repères régionaux écossais majeurs
  const regionalLandmarks: Record<string, { pos: [number, number, number]; icon: string }> = {
    'Glasgow Queen Street': { pos: [-55000, 48, 3000], icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    'Forth Bridge': { pos: [-10500, 45, -8200], icon: '🌉' },
    'Stirling & Highlands': { pos: [-42000, 55, -18000], icon: '🏰' },
    'Dundee & Aberdeen': { pos: [-20000, 52, -32000], icon: '🚢' },
    'Tweedbank (Borders)': { pos: [45000, 115, 42000], icon: '🌄' },
    'Dunbar & Berwick': { pos: [60000, 38, 15000], icon: '🌊' }
  };

  const overlayContainer = document.createElement('div');
  overlayContainer.id = 'edinburgh-station-overlay';
  overlayContainer.style.position = 'absolute';
  overlayContainer.style.inset = '0';
  overlayContainer.style.pointerEvents = 'none';
  overlayContainer.style.zIndex = '3';
  overlayContainer.style.overflow = 'hidden';
  container.appendChild(overlayContainer);

  interface StationMarker {
    name: string;
    pos: THREE.Vector3;
    el: HTMLElement;
    isRegional?: boolean;
  }
  const allMarkers: StationMarker[] = [];

  // Création des étiquettes pour les 9 gares urbaines
  Object.entries(stationLocations).forEach(([name, coords]) => {
    // Balise lumineuse de quai
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14, 2, 24),
      new THREE.MeshBasicMaterial({ color: 0x002d62, transparent: true, opacity: 0.85 })
    );
    disk.position.set(coords[0], coords[1] + 1.0, coords[2]);
    scene.add(disk);

    const badge = document.createElement('div');
    badge.className = 'edinburgh-station-badge';
    badge.style.position = 'absolute';
    badge.style.transform = 'translate(-50%, -100%)';
    badge.style.background = 'rgba(14, 20, 29, 0.9)';
    badge.style.backdropFilter = 'blur(6px)';
    badge.style.border = '1px solid rgba(255, 255, 255, 0.18)';
    badge.style.borderRadius = '5px';
    badge.style.padding = '3px 8px';
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
      badge.style.background = 'rgba(14, 20, 29, 0.9)';
      badge.style.borderColor = 'rgba(255, 255, 255, 0.18)';
      badge.style.transform = 'translate(-50%, -100%) scale(1.0)';
    });
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      // Vol direct et stabilisé sur la gare sans déplacement parasite
      flyToTarget(new THREE.Vector3(coords[0], coords[1] + 8, coords[2]), 420, 48, 900);
      options?.onStationClick?.(name);
    });

    overlayContainer.appendChild(badge);
    allMarkers.push({
      name,
      pos: new THREE.Vector3(coords[0], coords[1], coords[2]),
      el: badge
    });
  });

  // Création des étiquettes pour les repères régionaux écossais
  Object.entries(regionalLandmarks).forEach(([name, def]) => {
    const badge = document.createElement('div');
    badge.className = 'edinburgh-regional-badge';
    badge.style.position = 'absolute';
    badge.style.transform = 'translate(-50%, -100%)';
    badge.style.background = 'rgba(24, 38, 56, 0.85)';
    badge.style.backdropFilter = 'blur(4px)';
    badge.style.border = '1px solid rgba(96, 165, 250, 0.4)';
    badge.style.borderRadius = '4px';
    badge.style.padding = '2px 6px';
    badge.style.color = '#bfdbfe';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = '600';
    badge.style.whiteSpace = 'nowrap';
    badge.style.pointerEvents = 'auto';
    badge.style.cursor = 'pointer';
    badge.innerHTML = `${def.icon} ${name}`;

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      flyToTarget(new THREE.Vector3(def.pos[0], def.pos[1] + 10, def.pos[2]), 2500, 42, 1200);
    });

    overlayContainer.appendChild(badge);
    allMarkers.push({
      name,
      pos: new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]),
      el: badge,
      isRegional: true
    });
  });

  // 7. Modèle 3D Réel des Rames Écossaises & Visualisation Synchrone du Moteur
  let trainPrototype: THREE.Group | null = null;
  const renderedTrains = new Map<string, RenderedTrain>();
  let followedTrainId: string | null = null;

  loader.load('/cities/edinburgh/models/automotrice_ecossaise.glb', (gltf) => {
    trainPrototype = gltf.scene;

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

    console.info('[edinburgh-3d] Scottish EMU 3D train prototype ready.');
  });

  // Projection GPS [lon, lat] -> Coordonnées 3D locales mètres (Waverley origine)
  const WAVERLEY_LON = -3.188674;
  const WAVERLEY_LAT = 55.95223;
  const METERS_PER_DEG_LAT = 111320.0;
  const METERS_PER_DEG_LON = 111320.0 * Math.cos((WAVERLEY_LAT * Math.PI) / 180);

  function lonLatToWorld(lon: number, lat: number, elevation = 53.0): THREE.Vector3 {
    const x = (lon - WAVERLEY_LON) * METERS_PER_DEG_LON;
    const z = -(lat - WAVERLEY_LAT) * METERS_PER_DEG_LAT;
    return new THREE.Vector3(x, elevation, z);
  }

  // Raycasting pour sélection des rames au clic
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onPointerDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData?.trainId) {
        obj = obj.parent;
      }
      if (obj && obj.userData?.trainId) {
        const trainId = obj.userData.trainId;
        const lineId = obj.userData.lineId || 'EXP';
        startFollowTrain(trainId);
        options?.onTrainClick?.(trainId, lineId);
        return;
      }
    }
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // 8. Navigation Clavier & Transitions Fluides
  const keysDown = new Set<string>();
  function onKeyDown(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e', 'Escape'].includes(e.key)) {
      keysDown.add(e.key.toLowerCase());
      if (e.key === 'Escape' && followedTrainId) {
        stopFollowTrain();
      }
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    keysDown.delete(e.key.toLowerCase());
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let cameraTransition: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null = null;

  function flyToTarget(targetPos: THREE.Vector3, distance = 420, pitchDeg = 50, durationMs = 900) {
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

  // 9. Boucle de Rendu & Cinématique des Rames
  let animationFrameId: number;
  let lastTime = performance.now();
  const forwardAxis = new THREE.Vector3(1, 0, 0);

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;

    // Déplacement dynamique clavier
    if (keysDown.size > 0 && !followedTrainId) {
      const moveSpeed = (keysDown.has('shift') ? 480 : 240) * dt;
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
        camera.position.y = Math.min(6500, camera.position.y + moveSpeed);
      }
    }

    // Transition caméra
    if (cameraTransition) {
      const elapsed = now - cameraTransition.startTime;
      const t = Math.min(1.0, elapsed / cameraTransition.duration);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      camera.position.lerpVectors(cameraTransition.fromPos, cameraTransition.toPos, ease);
      controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, ease);

      if (t >= 1.0) {
        cameraTransition = null;
      }
    }

    // Mise à jour fluide des rames en 3D
    renderedTrains.forEach((rt) => {
      rt.currentPos.lerp(rt.targetPos, 0.15);
      rt.currentQuat.slerp(rt.targetQuat, 0.15);

      rt.group.position.copy(rt.currentPos);
      rt.group.quaternion.copy(rt.currentQuat);

      // Suivi caméra embarquée si cette rame est suivie
      if (followedTrainId === rt.id) {
        const trainForward = new THREE.Vector3(1, 0, 0).applyQuaternion(rt.currentQuat);
        const followDist = 88;
        const followHeight = 32;
        const idealCam = new THREE.Vector3()
          .copy(rt.currentPos)
          .addScaledVector(trainForward, -followDist)
          .setY(rt.currentPos.y + followHeight);

        camera.position.lerp(idealCam, 0.08);
        controls.target.lerp(rt.currentPos, 0.12);
      }
    });

    // Projection des étiquettes 3D
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const tempVec = new THREE.Vector3();

    for (const marker of allMarkers) {
      tempVec.copy(marker.pos);
      tempVec.y += marker.isRegional ? 120 : 18;
      tempVec.project(camera);

      if (tempVec.z > 1 || Math.abs(tempVec.x) > 1.2 || Math.abs(tempVec.y) > 1.2) {
        marker.el.style.display = 'none';
      } else {
        const x = (tempVec.x * halfWidth) + halfWidth;
        const y = -(tempVec.y * halfHeight) + halfHeight;
        const dist = camera.position.distanceTo(marker.pos);
        const maxDist = marker.isRegional ? 45000 : 5000;

        if (dist > maxDist) {
          marker.el.style.display = 'none';
        } else {
          marker.el.style.display = 'block';
          marker.el.style.left = `${Math.round(x)}px`;
          marker.el.style.top = `${Math.round(y)}px`;
          marker.el.style.opacity = dist < maxDist * 0.7 ? '1' : `${1 - (dist - maxDist * 0.7) / (maxDist * 0.3)}`;
        }
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // 10. Synchronisation avec le Moteur de Simulation Réel (schedule.json)
  function updateSimulationTrains(trains: TrainMarker[]) {
    if (!trainPrototype) return;

    const seenIds = new Set<string>();

    for (const t of trains) {
      if (!t.pos) continue;
      seenIds.add(t.id);

      let rt = renderedTrains.get(t.id);
      if (!rt) {
        const group = trainPrototype.clone(true);
        group.userData = { trainId: t.id, lineId: t.line, isTrain: true };
        group.traverse((c) => {
          c.userData = { trainId: t.id, lineId: t.line, isTrain: true };
        });
        scene.add(group);

        const initialPos = lonLatToWorld(t.pos[0], t.pos[1], t.elevation || 53.0);
        rt = {
          id: t.id,
          line: t.line,
          headcode: t.id.split('_')[0] || t.line,
          destName: t.dest || 'Terminus',
          group,
          currentPos: initialPos.clone(),
          targetPos: initialPos.clone(),
          currentQuat: new THREE.Quaternion(),
          targetQuat: new THREE.Quaternion(),
          speedKmh: t.spd || 0
        };
        renderedTrains.set(t.id, rt);
      }

      // Mise à jour de la cible 3D depuis le moteur
      const targetPos = lonLatToWorld(t.pos[0], t.pos[1], t.elevation || 53.0);
      rt.targetPos.copy(targetPos);
      rt.speedKmh = t.spd || 0;

      // Calcul de l'orientation selon le cap (bearing en degrés)
      const headingRad = -(t.brg * Math.PI) / 180 + Math.PI / 2;
      rt.targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingRad);
    }

    // Nettoyage des rames qui ont terminé leur course
    renderedTrains.forEach((rt, id) => {
      if (!seenIds.has(id)) {
        scene.remove(rt.group);
        renderedTrains.delete(id);
        if (followedTrainId === id) {
          stopFollowTrain();
        }
      }
    });
  }

  // 11. Fonctions de pilotage
  function selectLine(lineId: string | null) {
    lineTracksMap.forEach((lines, id) => {
      const match = !lineId || id === lineId;
      lines.forEach((l) => {
        const mat = l.material as THREE.LineBasicMaterial;
        mat.opacity = match ? 0.95 : 0.2;
        mat.linewidth = match ? 3 : 1;
      });
    });
  }

  function focusStation(stationName: string) {
    const coords = stationLocations[stationName];
    if (coords) {
      flyToTarget(new THREE.Vector3(coords[0], coords[1] + 8, coords[2]), 420, 48, 900);
    }
  }

  function startFollowTrain(trainId: string) {
    if (renderedTrains.has(trainId)) {
      followedTrainId = trainId;
      cameraTransition = null;
      console.info(`[edinburgh-3d] Camera following train ${trainId}`);
    }
  }

  function stopFollowTrain() {
    if (followedTrainId) {
      followedTrainId = null;
      console.info('[edinburgh-3d] Camera follow stopped.');
    }
  }

  function toggleFollowTrain() {
    const trainIds = Array.from(renderedTrains.keys());
    if (trainIds.length === 0) return;
    if (followedTrainId) {
      const idx = trainIds.indexOf(followedTrainId);
      const nextId = trainIds[(idx + 1) % trainIds.length];
      startFollowTrain(nextId);
    } else {
      startFollowTrain(trainIds[0]);
    }
  }

  // 12. Redimensionnement
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
        case 'scotland':
          flyToTarget(new THREE.Vector3(-10000, 50, -5000), 16000, 45, 1500);
          break;
        case 'overview':
        default:
          flyToTarget(new THREE.Vector3(0, 52.7, 0), 2200, 58, 1300);
          break;
      }
    },
    selectLine,
    focusStation,
    startFollowTrain,
    stopFollowTrain,
    toggleFollowTrain,
    updateSimulationTrains
  };
}
