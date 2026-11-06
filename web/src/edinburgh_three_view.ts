import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface EdinburghThreeViewHandle {
  destroy: () => void;
  setCameraPreset: (name: 'waverley' | 'castle' | 'calton' | 'overview') => void;
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

interface AnimatedTrain {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  speed: number;
  progress: number;
  cars: THREE.Mesh[];
  carLength: number;
  spacing: number;
}

export function initEdinburghThreeView(container: HTMLElement): EdinburghThreeViewHandle {
  // 1. Scène & Caméra
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11151c); // Fond sombre style transit
  scene.fog = new THREE.FogExp2(0x11151c, 0.00035);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(45, width / height, 1, 15000);
  camera.position.set(0, 600, 900); // Vue plongeante sur la vallée de Waverley

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.03; // Empêche de passer sous le terrain
  controls.minDistance = 30;
  controls.maxDistance = 5000;
  controls.target.set(0, 52, 0); // Focus sur la gare de Waverley

  // 2. Éclairage rasant (pour sculpter Castle Rock, Old Town et la tranchée ferroviaire)
  const ambientLight = new THREE.HemisphereLight(0xddeeff, 0x202530, 0.9);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
  sunLight.position.set(-800, 500, 600);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 3000;
  const d = 1200;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  // 3. Chargement du modèle GLB compressé via Meshopt
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const cityGroup = new THREE.Group();
  scene.add(cityGroup);

  loader.load(
    '/cities/edinburgh/models/edinburgh_city.glb',
    (gltf) => {
      const city = gltf.scene;
      // Le GLB original utilise 1 unité = 100m. On le passe en unités métriques (1 unité = 1 mètre)
      city.scale.set(100, 100, 100);

      city.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          // S'assurer que les Vertex Colors (AO bakée & teintes d'ardoise et grès) sont bien activées
          if (mesh.geometry.attributes.color) {
            (mesh.material as THREE.MeshStandardMaterial).vertexColors = true;
          }

          // Rendre la toiture/verrière de Waverley semi-transparente pour apercevoir les quais
          if (mesh.name.toLowerCase().includes('waverley') && mesh.name.toLowerCase().includes('roof')) {
            mesh.material = new THREE.MeshPhysicalMaterial({
              color: 0x88bbdd,
              transparent: true,
              opacity: 0.35,
              roughness: 0.1,
              depthWrite: false
            });
          }
        }
      });

      cityGroup.add(city);
      console.info('[edinburgh-3d] City mesh loaded & textured with vertex colors.');
    },
    undefined,
    (err) => {
      console.warn('[edinburgh-3d] Could not load edinburgh_city.glb:', err);
    }
  );

  // 4. Rails & Animation cinématique des rames
  const trains: AnimatedTrain[] = [];
  const trainMaterialScotRail = new THREE.MeshStandardMaterial({
    color: 0x1C355E, // Bleu ScotRail profond
    roughness: 0.35,
    metalness: 0.2
  });
  const trainMaterialLner = new THREE.MeshStandardMaterial({
    color: 0xC8102E, // Rouge LNER East Coast
    roughness: 0.3,
    metalness: 0.3
  });
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xFFF4D0 });
  const taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xFF2222 });

  fetch('/cities/edinburgh/data/rail_curves_3d.json')
    .then((res) => res.json())
    .then((data: RailData) => {
      if (!data?.corridors) return;

      const trackMaterial = new THREE.LineBasicMaterial({
        color: 0x486088,
        transparent: true,
        opacity: 0.65
      });

      data.corridors.forEach((corridor, idx) => {
        if (corridor.points.length < 3) return;

        const vectors = corridor.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const curve = new THREE.CatmullRomCurve3(vectors);

        // Dessiner le fil de rail fin
        const trackGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(Math.floor(corridor.length_m / 10)));
        const trackLine = new THREE.Line(trackGeo, trackMaterial);
        scene.add(trackLine);

        // Créer 1 train animé sur les corridors principaux
        if (idx < 6) {
          const trainGroup = new THREE.Group();
          const isLner = idx % 2 === 1;
          const mat = isLner ? trainMaterialLner : trainMaterialScotRail;
          const numCars = isLner ? 5 : 3;
          const carLength = 22; // 22 mètres par voiture
          const carWidth = 2.8;
          const carHeight = 3.6;
          const spacing = 1.2;

          const carGeo = new THREE.BoxGeometry(carWidth, carHeight, carLength);
          const cars: THREE.Mesh[] = [];

          for (let c = 0; c < numCars; c++) {
            const car = new THREE.Mesh(carGeo, mat);
            car.castShadow = true;
            car.receiveShadow = true;

            // Feux avant sur la voiture de tête
            if (c === 0) {
              const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.2), headlightMaterial);
              hl1.position.set(0.8, -0.4, carLength / 2 + 0.1);
              const hl2 = hl1.clone();
              hl2.position.set(-0.8, -0.4, carLength / 2 + 0.1);
              car.add(hl1, hl2);
            }
            // Feux arrière sur la dernière voiture
            if (c === numCars - 1) {
              const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.2), taillightMaterial);
              tl1.position.set(0.8, -0.4, -carLength / 2 - 0.1);
              const tl2 = tl1.clone();
              tl2.position.set(-0.8, -0.4, -carLength / 2 - 0.1);
              car.add(tl1, tl2);
            }

            cars.push(car);
            trainGroup.add(car);
          }

          scene.add(trainGroup);
          trains.push({
            group: trainGroup,
            curve,
            speed: (14 + (idx % 3) * 4) / corridor.length_m, // Progression par seconde
            progress: (idx * 0.18) % 1.0,
            cars,
            carLength,
            spacing
          });
        }
      });
      console.info(`[edinburgh-3d] ${trains.length} trains running along 3D CatmullRom curves.`);
    })
    .catch((err) => {
      console.warn('[edinburgh-3d] Could not load rail_curves_3d.json:', err);
    });

  // 5. Boucle d'animation
  let animationFrameId: number;
  let lastTime = performance.now();

  const upVec = new THREE.Vector3(0, 1, 0);

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    // Mise à jour de chaque train sur sa courbe 3D
    for (const train of trains) {
      train.progress = (train.progress + train.speed * dt) % 1.0;
      const totalLen = train.curve.getLength();

      train.cars.forEach((car, cIdx) => {
        const offsetM = cIdx * (train.carLength + train.spacing);
        const carT = (train.progress - offsetM / totalLen + 1.0) % 1.0;

        const pos = train.curve.getPointAt(carT);
        const tangent = train.curve.getTangentAt(carT).normalize();

        car.position.copy(pos);
        // Légère surélévation pour que les roues reposent exactement sur le rail
        car.position.y += 1.8;

        // Orientation tangentielle à la trajectoire 3D
        const rotMatrix = new THREE.Matrix4().lookAt(
          pos,
          pos.clone().add(tangent),
          upVec
        );
        car.quaternion.setFromRotationMatrix(rotMatrix);
      });
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // 6. Gestion du redimensionnement
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
      if (renderer.domElement.parentElement) {
        renderer.domElement.remove();
      }
    },
    setCameraPreset: (name) => {
      switch (name) {
        case 'waverley':
          camera.position.set(0, 280, 420);
          controls.target.set(0, 52, 0);
          break;
        case 'castle':
          camera.position.set(-350, 220, 280);
          controls.target.set(-200, 90, 50);
          break;
        case 'calton':
          camera.position.set(650, 300, -150);
          controls.target.set(100, 60, 0);
          break;
        case 'overview':
        default:
          camera.position.set(0, 600, 900);
          controls.target.set(0, 52, 0);
          break;
      }
      controls.update();
    }
  };
}
