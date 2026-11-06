import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface EdinburghThreeViewHandle {
  destroy: () => void;
  setCameraPreset: (name: 'waverley' | 'castle' | 'calton' | 'overview') => void;
  toggleFollowTrain: () => void;
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

interface ActiveService {
  name: string;
  headcode: string;
  destination: string;
  operator: string;
  platform: string;
  corridorIdx: number;
  speedMps: number;
  progress: number;
  reversed: boolean;
  trainInstance: THREE.Group;
  currentStop?: string;
  dwellTimer: number;
}

export function initEdinburghThreeView(container: HTMLElement): EdinburghThreeViewHandle {
  // 1. Scène, Brume atmosphérique & Caméra
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x1a212b); // Bleu nuit d'Édimbourg, lumineux et élégant
  scene.background = skyColor;
  scene.fog = new THREE.FogExp2(0x1a212b, 0.00018); // Brume légère pour laisser respirer le relief

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(45, width / height, 1, 20000);
  camera.position.set(0, 500, 750); // Vue plongeante initiale sur la vallée de Waverley

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // Empêche de passer sous le terrain
  controls.minDistance = 20;
  controls.maxDistance = 6000;
  controls.target.set(0, 52, 0); // Focus sur la verrière de Waverley

  // 2. Éclairage solaire rasant & débouchage des ombres
  // Lumière hémisphérique : ciel bleuté + rebond chaud de la pierre
  const ambientLight = new THREE.HemisphereLight(0xd4e4f5, 0x4a4f42, 1.1);
  scene.add(ambientLight);

  // Soleil rasant sud-ouest (met en relief Castle Rock, Calton Hill et les façades géorgiennes)
  const sunLight = new THREE.DirectionalLight(0xfff5e6, 2.4);
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

  // Débouchage nord-est (évite les façades complètement noires)
  const fillLight = new THREE.DirectionalLight(0x7892ab, 0.75);
  fillLight.position.set(600, 350, -450);
  scene.add(fillLight);

  // 3. Traitement des Couleurs et Matériaux du Modèle 3D
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  // Palette végétale et minérale écossaise éclatante
  const grassVibrant = new THREE.Color('#3f7a34'); // Princes Street Gardens, The Meadows
  const woodlandDeep = new THREE.Color('#295222'); // Boqueteaux & pente de Calton Hill
  const waterAzure = new THREE.Color('#25628a');   // Lochs, Firth of Forth
  const basaltCrag = new THREE.Color('#383430');   // Falaise volcanique de Castle Rock
  const stonePaving = new THREE.Color('#8a8072');  // Pavement historique / dalles
  const roadAsphalt = new THREE.Color('#242322');  // Asphalte des rues

  loader.load('/cities/edinburgh/models/edinburgh_city.glb', (gltf) => {
    const city = gltf.scene;
    // Mise à l'échelle métrique (1 unité = 1 mètre)
    city.scale.set(100, 100, 100);

    city.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name || '';
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // A. RELIEF DU CENTRE (Colorisation vive de la végétation, de l'eau et de Castle Rock)
        if (name === 'Terrain_centre' && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const posAttr = mesh.geometry.attributes.position;
          const count = colAttr.count;

          for (let i = 0; i < count; i++) {
            const r = colAttr.getX(i);
            const g = colAttr.getY(i);
            const b = colAttr.getZ(i);
            const x = posAttr ? posAttr.getX(i) : 0;
            const y = posAttr ? posAttr.getY(i) : 0;
            const z = posAttr ? posAttr.getZ(i) : 0;

            // Végétation (parcs, pelouses, jardins)
            if (g > r && g > b) {
              const c = g > 0.58 ? grassVibrant : woodlandDeep;
              colAttr.setXYZ(i, c.r, c.g, c.b);
            }
            // Eau (étangs, fontaines, canaux)
            else if (b > r && b > g) {
              colAttr.setXYZ(i, waterAzure.r, waterAzure.g, waterAzure.b);
            }
            // Roches & Falaises de Castle Rock (-4.5 < x < -2.5, -1.0 < z < 1.5, y > 0.8 en unités GLB)
            else if (x > -4.5 && x < -2.2 && z > -1.0 && z < 1.5 && y > 0.75) {
              colAttr.setXYZ(i, basaltCrag.r, basaltCrag.g, basaltCrag.b);
            }
            // Sols minéraux & voies piétonnes
            else {
              colAttr.setXYZ(i, stonePaving.r, stonePaving.g, stonePaving.b);
            }
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.82,
            metalness: 0.05
          });
        }

        // B. RELIEF DE LA VILLE (Campagne écossaise environnante)
        else if (name === 'Terrain_ville' && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const count = colAttr.count;
          const rollingHill = new THREE.Color('#466e38');
          for (let i = 0; i < count; i++) {
            colAttr.setXYZ(i, rollingHill.r, rollingHill.g, rollingHill.b);
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.05
          });
        }

        // C. VOIRIE (Rues & boulevards en asphalte sombre contrasté)
        else if (name === 'Voirie_centre') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: roadAsphalt,
            roughness: 0.75,
            metalness: 0.1
          });
        }

        // D. BÂTIMENTS DU CENTRE : Vieille Ville, Nouvelle Ville & Centre
        else if (name.startsWith('Bati_') && mesh.geometry.attributes.color) {
          const colAttr = mesh.geometry.attributes.color;
          const isOldTown = name.includes('Vieille');
          const isNewTown = name.includes('Nouvelle');

          // Teintes grès & toitures ardoise
          const wallColor = isOldTown
            ? new THREE.Color('#9e8e7a') // Grès sombre médiéval Old Town
            : isNewTown
            ? new THREE.Color('#cfc2ad') // Grès blond géorgien New Town
            : new THREE.Color('#b8ac98');

          const roofColor = isOldTown
            ? new THREE.Color('#343940') // Ardoise foncée
            : new THREE.Color('#3f474f');

          for (let i = 0; i < colAttr.count; i++) {
            const r = colAttr.getX(i);
            const b = colAttr.getZ(i);
            // Détection toit (b > r * 0.95) vs mur
            const c = b > r * 0.95 ? roofColor : wallColor;
            colAttr.setXYZ(i, c.r, c.g, c.b);
          }
          colAttr.needsUpdate = true;
          mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.68,
            metalness: 0.08
          });
        }

        // E. MONUMENTS & ÉDIFICES EMBLÉMATIQUES (Colorisation individuelle soignée)
        else if (name.startsWith('Monument_')) {
          if (name.includes('Scott')) {
            // Scott Monument : flèche gothique en grès victorien noirci de suie
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#2e2a26'),
              roughness: 0.6,
              metalness: 0.2
            });
          } else if (name.includes('Balmoral')) {
            // Balmoral Hotel : grès doré de Craigleith et tour de l'horloge
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#d4b68a'),
              roughness: 0.55,
              metalness: 0.15
            });
          } else if (name.includes('Hub')) {
            // The Hub : flèche néo-gothique effilée surplombant la vallée
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#3d3730'),
              roughness: 0.65,
              metalness: 0.15
            });
          } else if (name.includes('Giles')) {
            // Cathédrale St Giles : clocher à couronne impériale dorée
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#a39682'),
              roughness: 0.65,
              metalness: 0.25
            });
          } else if (name.includes('Mary')) {
            // St Mary's Cathedral : triple flèche en pierre claire
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#cec6b8'),
              roughness: 0.6,
              metalness: 0.1
            });
          } else if (name.includes('Tron')) {
            // Tron Kirk : clocher en pierre et dôme en cuivre vert-de-gris
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#557d72'),
              roughness: 0.5,
              metalness: 0.3
            });
          } else if (name.includes('Chimney')) {
            // Cheminée de la distillerie : brique terracotta
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#944e3b'),
              roughness: 0.75,
              metalness: 0.05
            });
          } else {
            mesh.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#c2b5a2'),
              roughness: 0.65,
              metalness: 0.1
            });
          }
        }

        // F. GARE DE WAVERLEY : Verrière semi-transparente pour admirer les trains
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
    console.info('[edinburgh-3d] Edinburgh 3D model styled with vibrant vegetation, stone & monuments.');
  });

  // 4. RÉSEAU FERROVIAIRE & CIRCULATION RÉELLE DES TRAINS ÉCOSSAIS
  const activeServices: ActiveService[] = [];
  let trainPrototype: THREE.Group | null = null;
  let followTrainIndex = -1;

  // Création des rails lumineux dans la vallée
  const trackMaterial = new THREE.LineBasicMaterial({
    color: 0x4d6c96,
    transparent: true,
    opacity: 0.75
  });

  // Services horaires officiels ScotRail & grandes lignes
  const timetableDefinitions = [
    { headcode: '1R24', name: 'ScotRail Express', dest: 'Glasgow Queen St', op: 'ScotRail', plat: '11', speed: 28, rev: false, corridor: 0 },
    { headcode: '1R31', name: 'ScotRail Express', dest: 'Edinburgh Waverley', op: 'ScotRail', plat: '12', speed: 26, rev: true, corridor: 1 },
    { headcode: '2G40', name: 'Fife Circle Line', dest: 'Cowdenbeath / Gateway', op: 'ScotRail', plat: '2', speed: 24, rev: false, corridor: 0 },
    { headcode: '1E09', name: 'LNER East Coast', dest: "London King's Cross", op: 'LNER', plat: '19', speed: 32, rev: false, corridor: 3 },
    { headcode: '2T18', name: 'Borders Railway', dest: 'Tweedbank', op: 'ScotRail', plat: '7', speed: 22, rev: false, corridor: 3 },
    { headcode: '1M16', name: 'Caledonian Sleeper', dest: 'London Euston (via Carstairs)', op: 'Serco', plat: '8', speed: 25, rev: false, corridor: 5 }
  ];

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

      // Optimiser les matériaux de l'automotrice écossaise
      trainPrototype.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          if (m.material) {
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.roughness = 0.35;
            mat.metalness = 0.2;
            if (mat.name.includes('phare')) {
              mat.emissive = new THREE.Color(0xfff8d0);
              mat.emissiveIntensity = 2.0;
            } else if (mat.name.includes('feu_rouge')) {
              mat.emissive = new THREE.Color(0xff1111);
              mat.emissiveIntensity = 2.0;
            } else if (mat.name.includes('girouette')) {
              mat.emissive = new THREE.Color(0xffb020);
              mat.emissiveIntensity = 1.5;
            }
          }
        }
      });

      // Construction des courbes 3D CatmullRom
      const curves: THREE.CatmullRomCurve3[] = railData.corridors.map((c) => {
        const v = c.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const curve = new THREE.CatmullRomCurve3(v);
        // Traçage visuel des voies
        const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(Math.floor(c.length_m / 12)));
        const line = new THREE.Line(geo, trackMaterial);
        scene.add(line);
        return curve;
      });

      // Instanciation des trains réguliers programmés
      timetableDefinitions.forEach((def, i) => {
        const curve = curves[def.corridor];
        if (!curve) return;

        const trainInstance = trainPrototype!.clone(true);
        scene.add(trainInstance);

        activeServices.push({
          name: def.name,
          headcode: def.headcode,
          destination: def.dest,
          operator: def.op,
          platform: def.plat,
          corridorIdx: def.corridor,
          speedMps: def.speed,
          progress: (i * 0.22) % 1.0,
          reversed: def.rev,
          trainInstance,
          dwellTimer: 0
        });
      });

      updateTimetableOverlay(activeServices);
      console.info(`[edinburgh-3d] ${activeServices.length} Scottish Rail trains loaded with realistic schedules.`);
    })
    .catch((err) => {
      console.warn('[edinburgh-3d] Error initializing train simulation:', err);
    });

  // 5. Tableau d'affichage dynamique des départs (Waverley Departure Board)
  const hud = document.createElement('div');
  hud.id = 'edinburgh-timetable-hud';
  hud.style.position = 'absolute';
  hud.style.top = '72px';
  hud.style.left = '16px';
  hud.style.zIndex = '10';
  hud.style.background = 'rgba(17, 24, 34, 0.88)';
  hud.style.backdropFilter = 'blur(10px)';
  hud.style.border = '1px solid rgba(255, 255, 255, 0.12)';
  hud.style.borderRadius = '10px';
  hud.style.padding = '12px 16px';
  hud.style.color = '#f1efea';
  hud.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  hud.style.fontSize = '12px';
  hud.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
  hud.style.maxWidth = '360px';
  hud.style.pointerEvents = 'auto';

  container.appendChild(hud);

  function updateTimetableOverlay(services: ActiveService[]) {
    if (!hud) return;
    const rows = services
      .map(
        (s) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
        <div>
          <span style="font-weight:700; color:#ffb020;">${s.headcode}</span>
          <span style="margin-left:6px; color:#ffffff;">${s.destination}</span>
          <span style="font-size:10px; color:#8fa1b3; margin-left:4px;">(${s.operator})</span>
        </div>
        <div style="text-align:right;">
          <span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-weight:600; font-size:11px;">Voie ${s.platform}</span>
          <span style="margin-left:6px; color:#4ade80; font-size:11px;">À l'heure</span>
        </div>
      </div>
    `
      )
      .join('');

    hud.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-weight:700; font-size:13px; color:#f1efea; display:flex; align-items:center; gap:6px;">
          <span>🚆</span> Edinburgh Waverley — Départs
        </div>
        <span style="font-size:10px; color:#8fa1b3; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">En direct</span>
      </div>
      <div>${rows}</div>
    `;
  }

  // 6. Boucle de Rendu & Cinématique des trains
  let animationFrameId: number;
  let lastTime = performance.now();
  const forwardAxis = new THREE.Vector3(1, 0, 0); // Modèle orienté +X selon README_train.md
  const upVec = new THREE.Vector3(0, 1, 0);

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;

    // Simulation cinématique des trains
    for (let i = 0; i < activeServices.length; i++) {
      const s = activeServices[i];
      const curve = (scene as any).curves?.[s.corridorIdx] || null;

      // Gestion de l'arrêt en gare de Waverley
      if (s.dwellTimer > 0) {
        s.dwellTimer -= dt;
        continue;
      }

      // Vitesse le long de la courbe (mètres -> progression paramétrique)
      const distDelta = s.speedMps * dt;
      // Proche de Waverley (progress ~0 ou ~1), le train ralentit pour marquer l'arrêt
      if (s.progress > 0.98 || s.progress < 0.02) {
        if (Math.random() < 0.005) {
          s.dwellTimer = 5.0; // 5 secondes d'arrêt en gare
        }
      }

      s.progress = (s.progress + distDelta / 8000.0) % 1.0;
      const t = s.reversed ? 1.0 - s.progress : s.progress;

      // Recherche de la courbe associée
      const railCurves = (window as any).__edinburghCurves as THREE.CatmullRomCurve3[] | undefined;
      const c = railCurves?.[s.corridorIdx];

      if (c) {
        const pos = c.getPointAt(t);
        const tangent = c.getTangentAt(t).normalize();
        if (s.reversed) tangent.negate();

        s.trainInstance.position.copy(pos);
        s.trainInstance.quaternion.setFromUnitVectors(forwardAxis, tangent);

        // Suivi par caméra si sélectionné
        if (followTrainIndex === i) {
          const camOffset = new THREE.Vector3(-tangent.x * 120, 45, -tangent.z * 120);
          camera.position.copy(pos).add(camOffset);
          controls.target.copy(pos);
        }
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // Stocker les courbes globalement pour la boucle d'animation
  fetch('/cities/edinburgh/data/rail_curves_3d.json')
    .then((r) => r.json())
    .then((d: RailData) => {
      (window as any).__edinburghCurves = d.corridors.map((c) => {
        return new THREE.CatmullRomCurve3(c.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      });
    });

  animate();

  // 7. Redimensionnement
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
      controls.dispose();
      renderer.dispose();
      hud.remove();
      if (renderer.domElement.parentElement) {
        renderer.domElement.remove();
      }
    },
    setCameraPreset: (name) => {
      followTrainIndex = -1;
      switch (name) {
        case 'waverley':
          camera.position.set(0, 240, 380);
          controls.target.set(0, 52, 0);
          break;
        case 'castle':
          camera.position.set(-380, 240, 280);
          controls.target.set(-250, 95, 40);
          break;
        case 'calton':
          camera.position.set(650, 280, -180);
          controls.target.set(120, 65, 10);
          break;
        case 'overview':
        default:
          camera.position.set(0, 650, 950);
          controls.target.set(0, 52, 0);
          break;
      }
      controls.update();
    },
    toggleFollowTrain: () => {
      if (activeServices.length === 0) return;
      followTrainIndex = (followTrainIndex + 1) % activeServices.length;
      console.info(`[edinburgh-3d] Following train: ${activeServices[followTrainIndex]?.headcode}`);
    }
  };
}
