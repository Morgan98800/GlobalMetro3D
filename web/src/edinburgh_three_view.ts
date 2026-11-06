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

// Couleurs officielles ScotRail & exploitants britanniques
const LINE_COLORS: Record<string, number> = {
  GLA: 0x002d62, // ScotRail Express (Bleu Marine ScotRail)
  FIF: 0x00823b, // Fife Circle (Vert écossais)
  BOR: 0x7b1fa2, // Borders Railway (Violet Bruyère)
  NCL: 0x0097a7, // North Clyde Line (Turquoise)
  SHO: 0xe65100, // Shotts Line (Orange Ambre)
  LNER: 0xba0c2f, // East Coast Main Line (Rouge LNER)
  CS: 0x1338be   // Caledonian Sleeper (Bleu nuit)
};

// 1 unit in edinburgh_city.glb = 100 meters
const WAVERLEY_LON = -3.188674;
const WAVERLEY_LAT = 55.95223;
const METERS_PER_DEG_LAT = 111320.0;
const METERS_PER_DEG_LON = 111320.0 * Math.cos((WAVERLEY_LAT * Math.PI) / 180);

export function lonLatToWorld(lon: number, lat: number, elevationM = 53.0): THREE.Vector3 {
  const x = ((lon - WAVERLEY_LON) * METERS_PER_DEG_LON) * 0.01;
  const z = -((lat - WAVERLEY_LAT) * METERS_PER_DEG_LAT) * 0.01;
  const y = Math.max(0.527, elevationM * 0.01);
  return new THREE.Vector3(x, y, z);
}

export function initEdinburghThreeView(
  container: HTMLElement,
  options?: {
    onTrainClick?: (trainId: string, lineId: string) => void;
    onStationClick?: (stationName: string) => void;
  }
): EdinburghThreeViewHandle {
  // 1. Scène, Ciel & Éclairage atmosphérique écossais
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x131a24);
  scene.background = skyColor;
  scene.fog = new THREE.FogExp2(0x131a24, 0.0018);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  camera.position.set(0, 3.8, 5.6); // Vue initiale sur la vallée de Waverley

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.015;
  controls.minDistance = 0.5;
  controls.maxDistance = 2000;
  controls.target.set(0, 0.527, 0); // Verrière de Waverley à 52.7m (0.527 unités)

  // Éclairage réaliste
  const ambientLight = new THREE.HemisphereLight(0xdbe7f5, 0x3f4438, 1.4);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff5e4, 2.2);
  sunLight.position.set(-150, 180, 120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 600;
  const d = 50;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x708ba8, 0.8);
  fillLight.position.set(120, 80, -90);
  scene.add(fillLight);

  // 2. Modèle 3D Haute Fidélité d'Édimbourg (Relief + Bâti + Waverley)
  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  loader.load('/cities/edinburgh/models/edinburgh_city.glb', (gltf) => {
    const city = gltf.scene;
    city.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const name = mesh.name || '';

        if (name === 'Terrain' || name.startsWith('Terrain')) {
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.05
          });
        } else if (name.startsWith('Batiments') || name.startsWith('Buildings')) {
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.72,
            metalness: 0.1
          });
        } else if (name.includes('Gare_Edinburgh_Waverley') || name.includes('Waverley')) {
          mesh.material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color('#8bb2d6'),
            transparent: true,
            opacity: 0.45,
            roughness: 0.15,
            transmission: 0.65,
            depthWrite: false
          });
        } else if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.roughness = 0.8;
          mat.metalness = 0.1;
          if (mesh.geometry.attributes.color) {
            mat.vertexColors = true;
          }
        }
      }
    });

    cityGroup.add(city);
    console.info('[edinburgh-3d] Edinburgh 3D city model successfully loaded and shaded.');
  });

  // 3. Carte Régionale de l'Écosse (Scotland Landscape blended seamlessly around Edinburgh)
  const scotlandGroup = new THREE.Group();
  scene.add(scotlandGroup);

  // A. Estuaire du Firth of Forth & Mer du Nord
  const seaGeo = new THREE.PlaneGeometry(900, 600, 16, 16);
  const seaMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#142e47'),
    roughness: 0.25,
    metalness: 0.55
  });
  const seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.set(50, 0.0, -180); // Firth of Forth au nord d'Édimbourg
  scotlandGroup.add(seaMesh);

  // B. Relief Régional Simplifié de l'Écosse Centrale (Lowlands, Fife, Highlands)
  const scotlandTerrainGeo = new THREE.PlaneGeometry(1200, 1000, 48, 48);
  const scotlandTerrainMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#223b1e'), // Vert bruyère des collines écossaises
    roughness: 0.95,
    metalness: 0.02
  });
  const scotlandTerrain = new THREE.Mesh(scotlandTerrainGeo, scotlandTerrainMat);
  scotlandTerrain.rotation.x = -Math.PI / 2;
  scotlandTerrain.position.set(-100, -0.05, 50);
  scotlandGroup.add(scotlandTerrain);

  // C. L'iconique Pont du Forth (Forth Bridge)
  const forthBridgeGroup = new THREE.Group();
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ba2b23'), // Rouge iconique du Forth Bridge
    roughness: 0.45,
    metalness: 0.5
  });

  for (let bi = -1; bi <= 1; bi++) {
    const cantilever = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.1, 4), bridgeMat);
    cantilever.rotation.y = Math.PI / 4;
    cantilever.position.set(bi * 2.4, 0.55, 0);
    forthBridgeGroup.add(cantilever);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.08, 0.3), bridgeMat);
  deck.position.set(0, 0.45, 0);
  forthBridgeGroup.add(deck);

  // Coordonnées géographiques du pont du Forth (~12.5 km NO)
  forthBridgeGroup.position.set(-124.0, 0.4, -53.0);
  scotlandGroup.add(forthBridgeGroup);

  // 4. Voies Ferrées Régionales & Urbaines
  const tracksGroup = new THREE.Group();
  scene.add(tracksGroup);

  fetch('/cities/edinburgh/data/tracks.json')
    .then((r) => r.json())
    .then((tracks: Array<{ line_id: string; stroke: string; coordinates: [number, number][] }>) => {
      for (const track of tracks) {
        if (!track.coordinates || track.coordinates.length < 2) continue;
        const pts = track.coordinates.map((c) => lonLatToWorld(c[0], c[1], 53.0));
        pts.forEach((p) => (p.y += 0.035)); // Évite le z-fighting avec le sol

        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: new THREE.Color(track.stroke || '#002D62'),
          linewidth: 2,
          transparent: true,
          opacity: 0.85
        });
        const line = new THREE.Line(geo, mat);
        tracksGroup.add(line);
      }
      console.info('[edinburgh-3d] Network rail tracks loaded.');
    })
    .catch((err) => console.warn('[edinburgh-3d] Could not load tracks.json:', err));

  // 5. Gares Ferroviaires & Repères (avec balises lumineuses)
  const stationLocations: Record<string, [number, number, number]> = {
    'Edinburgh Waverley': [0.0, 0.53, 0.0],
    Haymarket: [-18.64, 0.575, 7.36],
    'Edinburgh Gateway': [-82.33, 0.505, 11.08],
    'Edinburgh Park': [-74.76, 0.565, 26.07],
    'South Gyle': [-69.43, 0.505, 16.27],
    Slateford: [-35.19, 0.658, 28.04],
    Kingsknowe: [-48.25, 0.805, 36.24],
    'Wester Hailes': [-60.19, 0.925, 41.07],
    Curriehill: [-82.31, 1.105, 56.11]
  };

  const regionalLandmarks: Record<string, { pos: [number, number, number]; icon: string }> = {
    'Glasgow Queen Street': { pos: [-662, 0.48, 100], icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    'Forth Bridge': { pos: [-124, 0.45, -53], icon: '🌉' },
    'Tweedbank (Borders)': { pos: [263, 0.85, 390], icon: '🌄' },
    'Dundee & Aberdeen': { pos: [-200, 0.52, -320], icon: '🚢' }
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

  // Création des étiquettes des 9 gares urbaines
  Object.entries(stationLocations).forEach(([name, coords]) => {
    // Balise lumineuse de quai
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.02, 24),
      new THREE.MeshBasicMaterial({ color: 0x002d62, transparent: true, opacity: 0.85 })
    );
    disk.position.set(coords[0], coords[1] + 0.01, coords[2]);
    scene.add(disk);

    const badge = document.createElement('div');
    badge.className = 'edinburgh-station-badge';
    badge.style.position = 'absolute';
    badge.style.transform = 'translate(-50%, -100%)';
    badge.style.padding = '4px 8px';
    badge.style.borderRadius = '4px';
    badge.style.background = 'rgba(19, 26, 36, 0.85)';
    badge.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    badge.style.color = '#ffffff';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '600';
    badge.style.cursor = 'pointer';
    badge.style.pointerEvents = 'auto';
    badge.style.whiteSpace = 'nowrap';
    badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    badge.textContent = `🚆 ${name}`;

    badge.addEventListener('click', () => {
      options?.onStationClick?.(name);
      focusStation(name);
    });

    overlayContainer.appendChild(badge);
    allMarkers.push({
      name,
      pos: new THREE.Vector3(coords[0], coords[1], coords[2]),
      el: badge
    });
  });

  // Repères régionaux
  Object.entries(regionalLandmarks).forEach(([name, info]) => {
    const badge = document.createElement('div');
    badge.className = 'edinburgh-regional-badge';
    badge.style.position = 'absolute';
    badge.style.transform = 'translate(-50%, -100%)';
    badge.style.padding = '3px 7px';
    badge.style.borderRadius = '3px';
    badge.style.background = 'rgba(0, 45, 98, 0.75)';
    badge.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    badge.style.color = '#e0f2fe';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = '500';
    badge.style.pointerEvents = 'auto';
    badge.style.cursor = 'pointer';
    badge.style.whiteSpace = 'nowrap';
    badge.textContent = `${info.icon} ${name}`;

    badge.addEventListener('click', () => {
      flyToTarget(new THREE.Vector3(info.pos[0], info.pos[1], info.pos[2]), 40);
    });

    overlayContainer.appendChild(badge);
    allMarkers.push({
      name,
      pos: new THREE.Vector3(info.pos[0], info.pos[1], info.pos[2]),
      el: badge,
      isRegional: true
    });
  });

  // 6. Modèle 3D Haute Fidélité des Rames Écossaises Class 385 EMU
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

  // 7. Navigation & Transitions Caméra
  let isTransitioning = false;
  let camStart = new THREE.Vector3();
  let camEnd = new THREE.Vector3();
  let targetStart = new THREE.Vector3();
  let targetEnd = new THREE.Vector3();
  let transitionProgress = 1;

  function flyTo(newPos: THREE.Vector3, newTarget: THREE.Vector3) {
    followedTrainId = null;
    camStart.copy(camera.position);
    camEnd.copy(newPos);
    targetStart.copy(controls.target);
    targetEnd.copy(newTarget);
    transitionProgress = 0;
    isTransitioning = true;
  }

  function flyToTarget(newTarget: THREE.Vector3, distance = 12) {
    const currentOffset = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (currentOffset.lengthSq() < 1e-4) {
      currentOffset.set(0, distance * 0.7, distance);
    } else {
      currentOffset.setLength(distance);
    }
    const newPos = new THREE.Vector3().addVectors(newTarget, currentOffset);
    flyTo(newPos, newTarget);
  }

  function setCameraPreset(name: 'waverley' | 'castle' | 'calton' | 'scotland' | 'overview') {
    switch (name) {
      case 'waverley':
        flyTo(new THREE.Vector3(0, 3.8, 5.6), new THREE.Vector3(0, 0.527, 0));
        break;
      case 'castle':
        flyTo(new THREE.Vector3(-15, 3.5, 3), new THREE.Vector3(-12, 1.3, -2));
        break;
      case 'calton':
        flyTo(new THREE.Vector3(8, 2.5, -4), new THREE.Vector3(0, 0.527, 0));
        break;
      case 'scotland':
        flyTo(new THREE.Vector3(-150, 200, 250), new THREE.Vector3(-100, 0, 0));
        break;
      case 'overview':
        flyTo(new THREE.Vector3(0, 18, 24), new THREE.Vector3(0, 0.527, 0));
        break;
    }
  }

  function focusStation(stationName: string) {
    const coords = stationLocations[stationName];
    if (coords) {
      flyToTarget(new THREE.Vector3(coords[0], coords[1], coords[2]), 6.5);
    }
  }

  function selectLine(lineId: string | null) {
    if (!lineId) return;
  }

  function startFollowTrain(trainId: string) {
    followedTrainId = trainId;
  }

  function stopFollowTrain() {
    followedTrainId = null;
  }

  function toggleFollowTrain() {
    if (followedTrainId) {
      stopFollowTrain();
    } else {
      const firstId = renderedTrains.keys().next().value;
      if (firstId) {
        startFollowTrain(firstId);
      }
    }
  }

  // 8. Synchronisation des Rames depuis le Moteur Kinématique
  function updateSimulationTrains(trains: TrainMarker[]) {
    if (!trainPrototype) return;

    const seenIds = new Set<string>();

    for (const t of trains) {
      if (!t.pos) continue;
      seenIds.add(t.id);

      let rt = renderedTrains.get(t.id);
      if (!rt) {
        const group = trainPrototype.clone(true);
        // Train real scale: 71.6m * 0.01 = 0.716 units
        group.scale.set(0.01, 0.01, 0.01);
        group.userData = { trainId: t.id, lineId: t.line, isTrain: true };
        group.traverse((c) => {
          c.userData = { trainId: t.id, lineId: t.line, isTrain: true };
        });
        scene.add(group);

        const initialPos = lonLatToWorld(t.pos[0], t.pos[1], t.elevation || 53.0);
        group.position.copy(initialPos);
        const yaw = ((90 - (t.brg || 0)) * Math.PI) / 180;
        group.rotation.y = yaw;

        rt = {
          id: t.id,
          line: t.line,
          headcode: t.id.split('_')[0] || t.line,
          destName: t.dest || 'Terminus',
          group,
          currentPos: initialPos.clone(),
          targetPos: initialPos.clone(),
          currentQuat: group.quaternion.clone(),
          targetQuat: group.quaternion.clone(),
          speedKmh: t.spd || 0
        };
        renderedTrains.set(t.id, rt);
      }

      // Cible fluide calculée
      const targetPos = lonLatToWorld(t.pos[0], t.pos[1], t.elevation || 53.0);
      rt.targetPos.copy(targetPos);
      rt.speedKmh = t.spd || 0;
      const yaw = ((90 - (t.brg || 0)) * Math.PI) / 180;
      rt.targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    }

    // Nettoyage des rames arrivées au terminus
    for (const [id, rt] of renderedTrains.entries()) {
      if (!seenIds.has(id)) {
        scene.remove(rt.group);
        renderedTrains.delete(id);
      }
    }
  }

  // 9. Boucle de Rendu & Mise à jour continue
  let animId = 0;
  function animate() {
    animId = requestAnimationFrame(animate);

    // Interpolation fluide de la caméra
    if (isTransitioning) {
      transitionProgress += 0.025;
      const ease = 1 - Math.pow(1 - Math.min(transitionProgress, 1), 3);
      camera.position.lerpVectors(camStart, camEnd, ease);
      controls.target.lerpVectors(targetStart, targetEnd, ease);
      if (transitionProgress >= 1) isTransitioning = false;
    }

    // Interpolation des positions & rotations des trains
    renderedTrains.forEach((rt) => {
      rt.currentPos.lerp(rt.targetPos, 0.15);
      rt.group.position.copy(rt.currentPos);
      rt.currentQuat.slerp(rt.targetQuat, 0.15);
      rt.group.quaternion.copy(rt.currentQuat);
    });

    // Caméra embarquée suivant le train
    if (followedTrainId) {
      const train = renderedTrains.get(followedTrainId);
      if (train) {
        const offset = new THREE.Vector3(-0.6, 0.35, 0.6).applyQuaternion(train.currentQuat);
        const camTarget = new THREE.Vector3().addVectors(train.currentPos, offset);
        camera.position.lerp(camTarget, 0.08);
        controls.target.lerp(train.currentPos, 0.12);
      }
    }

    controls.update();

    // Mise à jour de la projection des badges de gare
    const camDist = camera.position.distanceTo(controls.target);
    allMarkers.forEach((m) => {
      const p = m.pos.clone().project(camera);
      if (p.z < 1) {
        const x = ((p.x + 1) * width) / 2;
        const y = ((-p.y + 1) * height) / 2;
        m.el.style.left = `${x}px`;
        m.el.style.top = `${y}px`;

        if (m.isRegional) {
          m.el.style.display = camDist > 15 ? 'block' : 'none';
        } else {
          m.el.style.display = camDist < 45 ? 'block' : 'none';
        }
      } else {
        m.el.style.display = 'none';
      }
    });

    renderer.render(scene, camera);
  }

  animate();

  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  return {
    destroy: () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.dispose();
      overlayContainer.remove();
      renderer.domElement.remove();
    },
    setCameraPreset,
    selectLine,
    focusStation,
    startFollowTrain,
    stopFollowTrain,
    toggleFollowTrain,
    updateSimulationTrains
  };
}
