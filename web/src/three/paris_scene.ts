import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PARIS_LANDMARKS, EiffelTowerObject } from './landmarks';
import type { ShapeData } from '../sim/shapes';
import type { TrainMarker } from '../map/trains_layer';
import type { LineMetadata } from '@paris-subway/shared';

// Reference coordinate center: Notre-Dame / Châtelet
export const ORIGIN_LNG = 2.3488;
export const ORIGIN_LAT = 48.8534;
const METERS_PER_LAT = 110574;
const METERS_PER_LNG = 111320 * Math.cos(ORIGIN_LAT * (Math.PI / 180));

export function geoToWorld(lng: number, lat: number, y: number = 0): THREE.Vector3 {
  const x = (lng - ORIGIN_LNG) * METERS_PER_LNG;
  const z = -(lat - ORIGIN_LAT) * METERS_PER_LAT;
  return new THREE.Vector3(x, y, z);
}

export interface RerLineData {
  shape_id: string;
  route_id: string;
  name: string;
  color: string;
  coordinates: [number, number][];
}

export interface UrbanMeshData {
  seine_points: Array<[number, number, number]>; // [x, z, width]
  islands: Array<{
    name: string;
    center: [number, number];
    length: number;
    width: number;
    angle: number;
    x: number;
    z: number;
  }>;
  bridges: Array<{
    name: string;
    lng: number;
    lat: number;
    length: number;
    width: number;
    angle: number;
    x: number;
    z: number;
    viaduct?: boolean;
  }>;
  buildings: Array<{
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    rot: number;
    t: number;
  }>;
  montmartre: {
    x: number;
    z: number;
    radius: number;
    max_height: number;
  };
}

export class ParisThreeStudio {
  private containerEl: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private isRunning = false;
  private animFrameId: number | null = null;
  private clock = new THREE.Clock();

  // Groups
  private tracksGroup = new THREE.Group();
  private rerGroup = new THREE.Group();
  private landmarksGroup = new THREE.Group();
  private trainsGroup = new THREE.Group();
  private urbanGroup = new THREE.Group();

  // Special animated objects
  private eiffelTowerObj: EiffelTowerObject | null = null;

  // Ground mesh reference for opacity controls
  private groundMesh: THREE.Mesh | null = null;

  // Camera interpolation
  private isAnimatingCamera = false;
  private cameraStartPos = new THREE.Vector3();
  private cameraEndPos = new THREE.Vector3();
  private cameraStartTarget = new THREE.Vector3();
  private cameraEndTarget = new THREE.Vector3();
  private cameraAnimProgress = 0;
  private cameraAnimDuration = 1.2;

  // Train meshes pool
  private trainMeshes = new Map<string, THREE.Group>();

  // Pre-allocated shared train geometries & materials (Fix: avoid per-frame allocations)
  private _trainBodyGeo = new THREE.BoxGeometry(16, 9, 36);
  private _trainStripeGeo = new THREE.BoxGeometry(16.4, 2.6, 34);
  private _trainHlGeo = new THREE.SphereGeometry(1.4, 6, 6);
  private _trainBodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0x4a4a4a, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.6
  });
  private _trainHlMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });

  // Pre-allocated temp vector to avoid per-frame Vector3 heap allocation (Fix 4)
  private _tmpWorldPos = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.containerEl = container;

    // 1. Scene & Parisian Dusk/Night Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060b11); // Deep Parisian Midnight Blue
    this.scene.fog = new THREE.Fog(0x060b11, 8000, 28000); // Brouillard linéaire : visible à 8 km, opaque à 28 km

    // 2. Camera: dramatic initial view angled towards Eiffel Tower & Seine
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(48, aspect, 10, 45000);
    this.camera.position.set(-2200, 1150, 1850);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Capped at 1.5× (was 2×) — reduces fill rate on HiDPI displays
    this.renderer.toneMapping = THREE.ReinhardToneMapping; // Cheaper than ACESFilmic, visually equivalent for nocturnal scenes
    this.renderer.toneMappingExposure = 1.4; // Slightly higher to compensate Reinhard's softer rolloff
    container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04; // Don't flip below horizon
    this.controls.minDistance = 80;
    this.controls.maxDistance = 16000;
    this.controls.target.set(-4040, 120, -550); // Focused initially on the Eiffel Tower
    this.controls.update();

    // 5. Lighting & IBL Environment
    this.setupLighting();
    this.setupEnvironment();

    // 6. Add sub-groups
    this.scene.add(this.urbanGroup);
    this.scene.add(this.tracksGroup);
    this.scene.add(this.rerGroup);
    this.scene.add(this.landmarksGroup);
    this.scene.add(this.trainsGroup);

    // 7. Base Ground Plateau
    this.buildBasePlateau();

    // 8. Landmarks
    this.buildLandmarks();

    // 9. Initialize debug mode if ?debug=1
    this.initDebug();

    // Resize listener
    window.addEventListener('resize', this.onResize);
  }

  private savedFog: THREE.Fog | THREE.FogExp2 | null = null;

  private setupEnvironment() {
    // Basic PMREM + RoomEnvironment for PBR reflections (without overriding nocturnal background)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(roomEnv).texture;
    this.scene.environment = envTexture;
    this.scene.environmentIntensity = 0.35; // Subdued nocturnal environment intensity
    pmremGenerator.dispose();
  }

  private setupLighting() {
    // 1. City-scale Hemisphere illumination: Night sky / Dark slate ground
    // Sky: luminous Parisian midnight navy blue (0x2563eb); Ground: dark urban slate (0x0f172a)
    // Upward faces catch deep twilight blue; downward/vertical faces catch dark slate
    const hemiLight = new THREE.HemisphereLight(0x2563eb, 0x0f172a, 2.6);
    hemiLight.name = 'hemiLight';
    this.scene.add(hemiLight);

    // 2. Warm ambient fill for Parisian street life
    const ambient = new THREE.AmbientLight(0xffeedb, 1.2);
    ambient.name = 'ambientFill';
    this.scene.add(ambient);

    // 3. Cool silvery moonlight calibrated for multi-kilometer scale, oriented toward Eiffel Tower / West center
    const moonTarget = new THREE.Object3D();
    moonTarget.position.set(-2000, 0, -500);
    this.scene.add(moonTarget);

    const moon = new THREE.DirectionalLight(0xdbeafe, 3.2);
    moon.name = 'moon';
    moon.position.set(-3500, 6500, 4000);
    moon.target = moonTarget;
    this.scene.add(moon);

    // 4. Warm golden avenue cross-light from opposite angle
    const cityGlowTarget = new THREE.Object3D();
    cityGlowTarget.position.set(-2000, 0, -500);
    this.scene.add(cityGlowTarget);

    const cityGlow = new THREE.DirectionalLight(0xfde047, 2.0);
    cityGlow.name = 'cityGlow';
    cityGlow.position.set(4500, 4000, -2500);
    cityGlow.target = cityGlowTarget;
    this.scene.add(cityGlow);
  }

  private buildBasePlateau() {
    // Elegant navy slate groundplate (architectural blueprint)
    const groundGeo = new THREE.PlaneGeometry(32000, 28000, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Deep slate navy (clearly visible against black)
      roughness: 0.85,
      metalness: 0.15,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = 0;
    this.urbanGroup.add(this.groundMesh);

    // Parisian Ring / Périphérique luminous golden boundary
    const ringPts: THREE.Vector3[] = [];
    const ringRx = 8800;
    const ringRz = 6200;
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(theta) * ringRx - 800, 1.8, Math.sin(theta) * ringRz - 600));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    const ringMat = new THREE.LineBasicMaterial({ color: 0xb4894f, transparent: true, opacity: 0.6 });
    const ringLine = new THREE.Line(ringGeo, ringMat);
    this.urbanGroup.add(ringLine);
  }

  /** Loads high-fidelity urban data: Seine water surface, islands, bridges, Haussmann blocks */
  public loadUrbanMesh(data: UrbanMeshData) {
    // 1. Build The Seine River Surface
    if (data.seine_points && data.seine_points.length > 2) {
      const riverShape = new THREE.Shape();
      const leftBank: THREE.Vector3[] = [];
      const rightBank: THREE.Vector3[] = [];

      for (let i = 0; i < data.seine_points.length; i++) {
        const [x, z, w] = data.seine_points[i];
        let ux = 0, uz = 1;
        if (i < data.seine_points.length - 1) {
          const dx = data.seine_points[i + 1][0] - x;
          const dz = data.seine_points[i + 1][1] - z;
          const len = Math.hypot(dx, dz) || 1;
          ux = dx / len;
          uz = dz / len;
        } else {
          const dx = x - data.seine_points[i - 1][0];
          const dz = z - data.seine_points[i - 1][1];
          const len = Math.hypot(dx, dz) || 1;
          ux = dx / len;
          uz = dz / len;
        }
        const nx = -uz;
        const nz = ux;
        const halfW = w * 0.5;

        leftBank.push(new THREE.Vector3(x + nx * halfW, 0.4, z + nz * halfW));
        rightBank.push(new THREE.Vector3(x - nx * halfW, 0.4, z - nz * halfW));
      }

      // Build ribbon geometry from bank points
      const riverGeo = new THREE.BufferGeometry();
      const verts: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i < leftBank.length; i++) {
        verts.push(leftBank[i].x, leftBank[i].y, leftBank[i].z);
        verts.push(rightBank[i].x, rightBank[i].y, rightBank[i].z);
      }

      for (let i = 0; i < leftBank.length - 1; i++) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }

      riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      riverGeo.setIndex(indices);
      riverGeo.computeVertexNormals();

      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x0e7490, // Deep nocturnal cyan Seine water
        emissive: 0x064e3b,
        emissiveIntensity: 0.25,
        roughness: 0.15,
        metalness: 0.8
      });
      const riverMesh = new THREE.Mesh(riverGeo, waterMat);
      this.urbanGroup.add(riverMesh);
    }

    // 2. Islands: Île de la Cité and Île Saint-Louis
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0xc8baa1, // Warm light stone quays
      roughness: 0.8,
      metalness: 0.05
    });

    for (const isl of data.islands) {
      const islGeo = new THREE.CylinderGeometry(isl.width * 0.45, isl.width * 0.5, 4, 32);
      islGeo.scale(isl.length / isl.width, 1, 1);
      islGeo.rotateY(isl.angle * (Math.PI / 180));
      const islMesh = new THREE.Mesh(islGeo, islandMat);
      islMesh.position.set(isl.x, 2, isl.z);
      this.urbanGroup.add(islMesh);
    }

    // 3. Bridges
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0xbdb099, // Warm limestone bridge deck
      roughness: 0.75,
      metalness: 0.05
    });
    const bridgeLampMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });

    for (const br of data.bridges) {
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(br.x, 3.5, br.z);
      bridgeGroup.rotation.y = br.angle * (Math.PI / 180);

      // Deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(br.width, 3, br.length), bridgeMat);
      bridgeGroup.add(deck);

      // Parapets / railing lights
      const lampL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, br.length * 0.95), bridgeLampMat);
      lampL.position.set(-br.width * 0.48, 2, 0);
      bridgeGroup.add(lampL);

      const lampR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, br.length * 0.95), bridgeLampMat);
      lampR.position.set(br.width * 0.48, 2, 0);
      bridgeGroup.add(lampR);

      // If Bir-Hakeim, add upper viaduct arcade for Metro Line 6
      if (br.viaduct) {
        const viaductDeck = new THREE.Mesh(new THREE.BoxGeometry(br.width * 0.5, 2.5, br.length), bridgeMat);
        viaductDeck.position.y = 12;
        bridgeGroup.add(viaductDeck);

        // Viaduct pillars
        for (let pz = -br.length * 0.4; pz <= br.length * 0.4; pz += 30) {
          const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 10, 8), bridgeMat);
          pil.position.set(0, 7, pz);
          bridgeGroup.add(pil);
        }
      }

      this.urbanGroup.add(bridgeGroup);
    }

    // 4. InstancedMesh for 4,000+ Parisian Buildings (60 FPS Performance)
    if (data.buildings && data.buildings.length > 0) {
      this.buildInstancedBuildings(data.buildings);
    }
  }

  private buildInstancedBuildings(
    buildings: Array<{ x: number; z: number; w: number; d: number; h: number; rot: number; t: number }>
  ) {
    const haussmannList = buildings.filter(b => b.t === 0);
    const skyscraperList = buildings.filter(b => b.t >= 2);

    // 1. Haussmannian Buildings
    if (haussmannList.length > 0) {
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      // Anchor at bottom so scaling height works upwards
      boxGeo.translate(0, 0.5, 0);

      const haussmannMat = new THREE.MeshStandardMaterial({
        color: 0xdfd5c2, // Warm Parisian Pierre de Taille (bright & visible!)
        emissive: 0x221a10,
        emissiveIntensity: 0.25,
        roughness: 0.8,
        metalness: 0.05 // Non-metallic limestone
      });

      const instHaussmann = new THREE.InstancedMesh(boxGeo, haussmannMat, haussmannList.length);
      const dummy = new THREE.Object3D();

      for (let i = 0; i < haussmannList.length; i++) {
        const b = haussmannList[i];
        dummy.position.set(b.x, 0, b.z);
        dummy.rotation.y = b.rot;
        dummy.scale.set(b.w, b.h, b.d);
        dummy.updateMatrix();
        instHaussmann.setMatrixAt(i, dummy.matrix);
      }
      instHaussmann.instanceMatrix.needsUpdate = true;
      instHaussmann.computeBoundingBox();
      instHaussmann.computeBoundingSphere();
      // frustumCulled enabled (default true) — bounding sphere is computed, culling is now accurate
      this.urbanGroup.add(instHaussmann);

      // Add warm rooftop illuminated windows / zinc mansard caps
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0x4a6572, // Classic zinc slate blue!
        emissive: 0xfbbf24, // Warm yellow glowing windows
        emissiveIntensity: 0.65,
        roughness: 0.45,
        metalness: 0.35 // Zinc metalness
      });
      const instRoofs = new THREE.InstancedMesh(boxGeo, roofMat, haussmannList.length);
      for (let i = 0; i < haussmannList.length; i++) {
        const b = haussmannList[i];
        dummy.position.set(b.x, b.h * 0.9, b.z);
        dummy.rotation.y = b.rot;
        dummy.scale.set(b.w * 0.92, b.h * 0.18, b.d * 0.92);
        dummy.updateMatrix();
        instRoofs.setMatrixAt(i, dummy.matrix);
      }
      instRoofs.instanceMatrix.needsUpdate = true;
      instRoofs.computeBoundingBox();
      instRoofs.computeBoundingSphere();
      // frustumCulled enabled (default true)
      this.urbanGroup.add(instRoofs);
    }

    // 2. Modern Glass & Steel Skyscraper District (La Défense)
    if (skyscraperList.length > 0) {
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0x60a5fa, // Bright modern glass blue
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.55,
        roughness: 0.1,
        metalness: 0.85
      });

      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      boxGeo.translate(0, 0.5, 0);

      const instTowers = new THREE.InstancedMesh(boxGeo, towerMat, skyscraperList.length);
      const dummy = new THREE.Object3D();

      for (let i = 0; i < skyscraperList.length; i++) {
        const b = skyscraperList[i];
        dummy.position.set(b.x, 0, b.z);
        dummy.rotation.y = b.rot;
        dummy.scale.set(b.w, b.h, b.d);
        dummy.updateMatrix();
        instTowers.setMatrixAt(i, dummy.matrix);
      }
      instTowers.instanceMatrix.needsUpdate = true;
      instTowers.computeBoundingBox();
      instTowers.computeBoundingSphere();
      // frustumCulled enabled (default true)
      this.urbanGroup.add(instTowers);
    }
  }

  private buildLandmarks() {
    for (const lm of PARIS_LANDMARKS) {
      const group = lm.builder();
      const pos = geoToWorld(lm.coords[0], lm.coords[1], 0);
      group.position.set(pos.x, 0, pos.z);

      if (lm.name === 'Tour Eiffel') {
        this.eiffelTowerObj = group as EiffelTowerObject;
      }

      this.landmarksGroup.add(group);
    }

    // Ensure landmark lights do not collapse under quadratic 1/r^2 decay at kilometer scale
    this.landmarksGroup.traverse((child) => {
      if ((child as THREE.PointLight).isPointLight) {
        (child as THREE.PointLight).decay = 0;
      }
    });
  }

  /** Loads Metro shapes as glowing, radiant 3D tubes */
  public loadMetroTracks(shapes: Map<string, ShapeData>, lines: LineMetadata[]) {
    this.tracksGroup.clear();
    const lineMap = new Map(lines.map(l => [l.id, l]));

    for (const shape of shapes.values()) {
      const line = lineMap.get(shape.routeId);
      const hexColor = line ? line.color : '#CCCCCC';
      const elevOffset = line ? line.elevation_offset : 0;
      const isAerialViaduct = shape.routeId === 'IDFM:C01376' || shape.routeId === 'IDFM:C01372'; // Ligne 6 & Ligne 2 viaducs
      const yElev = isAerialViaduct ? 12 + elevOffset * 0.5 : 2.5 + elevOffset * 0.4;

      const pts: THREE.Vector3[] = [];
      const count = shape.ptCount;
      const buf = shape.points;

      // Sample points
      for (let i = 0; i < count; i += 2) {
        const lng = buf[i * 3];
        const lat = buf[i * 3 + 1];
        pts.push(geoToWorld(lng, lat, yElev));
      }

      if (pts.length > 2) {
        const curve = new THREE.CatmullRomCurve3(pts);
        // Optimized: 6 radial sides (indistinguishable at altitude) + capped path segments → ~40% fewer triangles
        const tubeGeo = new THREE.TubeGeometry(curve, Math.min(pts.length, 80), 8.0, 6, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(hexColor),
          emissive: new THREE.Color(hexColor),
          emissiveIntensity: 1.2,
          roughness: 0.15,
          metalness: 0.3
        });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        this.tracksGroup.add(tubeMesh);
      }
    }
  }

  /** Loads RER A, B, C, D, E trunks */
  public loadRerLines(rerData: RerLineData[]) {
    this.rerGroup.clear();

    for (const rer of rerData) {
      const pts = rer.coordinates.map(c => geoToWorld(c[0], c[1], -32));
      if (pts.length > 2) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubeGeo = new THREE.TubeGeometry(curve, Math.min(pts.length, 80), 10.0, 6, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(rer.color),
          emissive: new THREE.Color(rer.color),
          emissiveIntensity: 0.9,
          roughness: 0.15,
          metalness: 0.4
        });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        this.rerGroup.add(tubeMesh);
      }
    }
  }

  /** Updates live trains in the 3D scene — optimized: no per-frame allocations, no per-train PointLight */
  public updateTrains(trains: TrainMarker[]) {
    const activeIds = new Set<string>();

    for (const tr of trains) {
      activeIds.add(tr.id);
      let meshGroup = this.trainMeshes.get(tr.id);

      if (!meshGroup) {
        meshGroup = new THREE.Group();

        // 1. Train Car Body — uses shared geometry & material (Fix 1)
        const bodyMesh = new THREE.Mesh(this._trainBodyGeo, this._trainBodyMat);
        bodyMesh.position.y = 4.5;
        meshGroup.add(bodyMesh);

        // 2. Line Color Livery Stripe — unique material per line color, shared geometry
        const stripeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tr.colorHex) });
        const stripe = new THREE.Mesh(this._trainStripeGeo, stripeMat);
        stripe.position.y = 4.5;
        meshGroup.add(stripe);

        // 3. Headlights — shared geometry & material (Fix 1)
        const hlL = new THREE.Mesh(this._trainHlGeo, this._trainHlMat);
        hlL.position.set(-5, 4.5, -18.2);
        meshGroup.add(hlL);

        const hlR = new THREE.Mesh(this._trainHlGeo, this._trainHlMat);
        hlR.position.set(5, 4.5, -18.2);
        meshGroup.add(hlR);

        // NOTE: per-train PointLight removed (Fix 2) — the metro neon tubes illuminate the tracks;
        // adding 200-400 PointLights was the #1 framerate killer at scale.

        this.trainsGroup.add(meshGroup);
        this.trainMeshes.set(tr.id, meshGroup);
      }

      // Position train — reuse pre-allocated Vector3 to avoid GC pressure (Fix 4)
      const isAerial = tr.line === 'IDFM:C01376' || tr.line === 'IDFM:C01372';
      const yElev = isAerial ? 14 + (tr.elevation || 0) * 0.5 : 4.5 + (tr.elevation || 0) * 0.4;
      const lng = tr.pos[0], lat = tr.pos[1];
      this._tmpWorldPos.set(
        (lng - 2.3488) * 74197,   // METERS_PER_LNG ≈ 74 197 at lat 48.85
        yElev,
        -(lat - 48.8534) * 110574
      );
      meshGroup.position.copy(this._tmpWorldPos);

      // Orient train heading
      meshGroup.rotation.y = -(tr.brg * Math.PI) / 180 + Math.PI;
    }

    // Clean up departed trains — dispose GPU resources to prevent memory leaks (Fix 3)
    for (const [id, group] of this.trainMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.trainsGroup.remove(group);
        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            // Only dispose non-shared materials (stripe color materials)
            if (mesh.material !== this._trainBodyMat && mesh.material !== this._trainHlMat) {
              (mesh.material as THREE.Material).dispose();
            }
            // Only dispose non-shared geometries
            if (
              mesh.geometry !== this._trainBodyGeo &&
              mesh.geometry !== this._trainStripeGeo &&
              mesh.geometry !== this._trainHlGeo
            ) {
              mesh.geometry.dispose();
            }
          }
        });
        this.trainMeshes.delete(id);
      }
    }
  }

  /** Smooth animated fly-to towards any landmark */
  public flyToLandmark(landmarkName: string) {
    const lm = PARIS_LANDMARKS.find(l => l.name.toLowerCase().includes(landmarkName.toLowerCase()));
    if (!lm) return;

    const pos = geoToWorld(lm.coords[0], lm.coords[1], 0);
    const preset = lm.cameraPreset || { distance: 650, pitch: 40, altitude: 200 };

    this.cameraStartPos.copy(this.camera.position);
    this.cameraStartTarget.copy(this.controls.target);

    // Compute destination position based on preset
    const dist = preset.distance;
    const alt = preset.altitude;
    this.cameraEndPos.set(pos.x + dist * 0.7, alt, pos.z + dist * 0.7);
    this.cameraEndTarget.set(pos.x, 30, pos.z);

    this.cameraAnimProgress = 0;
    this.isAnimatingCamera = true;
  }

  /** Controls ground transparency: 0.1 (Ghost X-ray) to 1.0 (Solid) */
  public setGroundOpacity(opacity: number) {
    if (this.groundMesh) {
      (this.groundMesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0.1, Math.min(1.0, opacity));
    }
  }

  public resetView() {
    this.flyToLandmark('Tour Eiffel');
  }

  public flyToOverview() {
    this.cameraStartPos.copy(this.camera.position);
    this.cameraStartTarget.copy(this.controls.target);

    this.cameraEndPos.set(0, 3200, 4200);
    this.cameraEndTarget.set(0, 0, 0);

    this.cameraAnimProgress = 0;
    this.isAnimatingCamera = true;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();

    const animate = () => {
      if (!this.isRunning) return;
      this.animFrameId = requestAnimationFrame(animate);

      const delta = this.clock.getDelta();

      // 1. Rotate the Eiffel Tower dual searchlight beacon in real time!
      if (this.eiffelTowerObj && this.eiffelTowerObj.beaconGroup) {
        this.eiffelTowerObj.beaconGroup.rotation.y += delta * 0.45;
      }

      // 2. Camera transition interpolation (smooth cubic ease-out)
      if (this.isAnimatingCamera) {
        this.cameraAnimProgress += delta / this.cameraAnimDuration;
        if (this.cameraAnimProgress >= 1.0) {
          this.cameraAnimProgress = 1.0;
          this.isAnimatingCamera = false;
        }
        const t = this.cameraAnimProgress;
        const ease = 1 - Math.pow(1 - t, 3); // Cubic Ease Out

        this.camera.position.lerpVectors(this.cameraStartPos, this.cameraEndPos, ease);
        this.controls.target.lerpVectors(this.cameraStartTarget, this.cameraEndTarget, ease);
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public onResize = () => {
    if (!this.containerEl) return;
    const width = this.containerEl.clientWidth;
    const height = this.containerEl.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public getControls(): OrbitControls {
    return this.controls;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public setFogEnabled(enabled: boolean) {
    if (!enabled) {
      if (this.scene.fog) {
        this.savedFog = this.scene.fog;
      }
      this.scene.fog = null;
    } else {
      this.scene.fog = this.savedFog || new THREE.Fog(0x060b11, 8000, 28000);
    }
    console.log(`[debug] scene.fog is now:`, this.scene.fog);
  }

  public setOverrideNormalMaterial(enabled: boolean) {
    if (enabled) {
      this.scene.overrideMaterial = new THREE.MeshNormalMaterial();
    } else {
      this.scene.overrideMaterial = null;
    }
    console.log(`[debug] scene.overrideMaterial is now:`, this.scene.overrideMaterial);
  }

  public dumpDiagnostics() {
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    const lights: Array<{
      type: string;
      name?: string;
      color: string;
      intensity: number;
      decay?: number;
      distance?: number;
      position: { x: number; y: number; z: number };
    }> = [];

    this.scene.traverse((obj) => {
      if ((obj as THREE.Light).isLight) {
        const l = obj as any;
        lights.push({
          type: l.type,
          name: l.name || undefined,
          color: '#' + (l.color ? l.color.getHexString() : 'unknown'),
          intensity: l.intensity,
          decay: l.decay,
          distance: l.distance,
          position: {
            x: Math.round(l.position.x),
            y: Math.round(l.position.y),
            z: Math.round(l.position.z)
          }
        });
      }
    });

    const toneMappingNames: Record<number, string> = {
      [THREE.NoToneMapping]: 'NoToneMapping',
      [THREE.LinearToneMapping]: 'LinearToneMapping',
      [THREE.ReinhardToneMapping]: 'ReinhardToneMapping',
      [THREE.CineonToneMapping]: 'CineonToneMapping',
      [THREE.ACESFilmicToneMapping]: 'ACESFilmicToneMapping',
      [THREE.AgXToneMapping]: 'AgXToneMapping'
    };

    const diagnostics = {
      threeVersion: THREE.REVISION,
      sceneChildrenCount: this.scene.children.length,
      sceneBoundingBox: {
        min: { x: Math.round(box.min.x), y: Math.round(box.min.y), z: Math.round(box.min.z) },
        max: { x: Math.round(box.max.x), y: Math.round(box.max.y), z: Math.round(box.max.z) },
        size: { x: Math.round(size.x), y: Math.round(size.y), z: Math.round(size.z) }
      },
      camera: {
        position: {
          x: Math.round(this.camera.position.x),
          y: Math.round(this.camera.position.y),
          z: Math.round(this.camera.position.z)
        },
        target: {
          x: Math.round(this.controls.target.x),
          y: Math.round(this.controls.target.y),
          z: Math.round(this.controls.target.z)
        },
        near: this.camera.near,
        far: this.camera.far,
        fov: this.camera.fov,
        aspect: Number(this.camera.aspect.toFixed(2))
      },
      lightsCount: lights.length,
      lights,
      renderer: {
        toneMapping: `${this.renderer.toneMapping} (${toneMappingNames[this.renderer.toneMapping] || 'Custom'})`,
        toneMappingExposure: this.renderer.toneMappingExposure,
        outputColorSpace: this.renderer.outputColorSpace
      },
      fog: this.scene.fog
        ? {
            type: (this.scene.fog as any).isFogExp2 ? 'FogExp2' : 'Fog',
            color: '#' + (this.scene.fog.color ? this.scene.fog.color.getHexString() : ''),
            density: (this.scene.fog as any).density
          }
        : null,
      overrideMaterial: this.scene.overrideMaterial ? this.scene.overrideMaterial.type : null,
      environment: this.scene.environment ? { intensity: this.scene.environmentIntensity } : null
    };

    console.log('=== [PARIS 3D STUDIO DIAGNOSTICS] ===');
    console.log(`Three.js Version: ${diagnostics.threeVersion}`);
    console.log(`Scene Children: ${diagnostics.sceneChildrenCount}`);
    console.log(
      `Bounding Box Min: (${diagnostics.sceneBoundingBox.min.x}, ${diagnostics.sceneBoundingBox.min.y}, ${diagnostics.sceneBoundingBox.min.z})`
    );
    console.log(
      `Bounding Box Max: (${diagnostics.sceneBoundingBox.max.x}, ${diagnostics.sceneBoundingBox.max.y}, ${diagnostics.sceneBoundingBox.max.z})`
    );
    console.log(
      `Bounding Box Size: ${diagnostics.sceneBoundingBox.size.x}m x ${diagnostics.sceneBoundingBox.size.y}m x ${diagnostics.sceneBoundingBox.size.z}m`
    );
    console.log(
      `Camera Position: (${diagnostics.camera.position.x}, ${diagnostics.camera.position.y}, ${diagnostics.camera.position.z})`
    );
    console.log(
      `Camera Target: (${diagnostics.camera.target.x}, ${diagnostics.camera.target.y}, ${diagnostics.camera.target.z})`
    );
    console.log(`Camera Near/Far: near=${diagnostics.camera.near}, far=${diagnostics.camera.far}`);
    console.log(`Lights (${diagnostics.lightsCount}):`, diagnostics.lights);
    console.log(`Tone Mapping: ${diagnostics.renderer.toneMapping}`);
    console.log(`Tone Mapping Exposure: ${diagnostics.renderer.toneMappingExposure}`);
    console.log(`Output Color Space: ${diagnostics.renderer.outputColorSpace}`);
    console.log(`Fog:`, diagnostics.fog);
    console.log(`Override Material:`, diagnostics.overrideMaterial);
    console.log('======================================');

    (window as any).__PARIS_3D_DIAGNOSTICS__ = diagnostics;
    return diagnostics;
  }

  private initDebug() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') !== '1') return;

    if (urlParams.get('fog') === '0') {
      this.setFogEnabled(false);
    }
    if (urlParams.get('override') === 'normal' || urlParams.get('override') === '1') {
      this.setOverrideNormalMaterial(true);
    }

    const panel = document.createElement('div');
    panel.id = 'three-debug-panel';
    panel.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 9999;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 12px;
      color: #f1f5f9;
      font-family: monospace;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    panel.innerHTML = `
      <div style="font-weight: bold; color: #38bdf8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
        🛠️ Studio 3D Debug (Étape 0)
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button id="btn-dbg-fog" style="padding: 5px 9px; background: #1e293b; color: white; border: 1px solid #64748b; border-radius: 4px; cursor: pointer; font-size: 11px;">
          ${this.scene.fog ? 'a) scene.fog = null' : 'a) Restaurer Fog'}
        </button>
        <button id="btn-dbg-override" style="padding: 5px 9px; background: #1e293b; color: white; border: 1px solid #64748b; border-radius: 4px; cursor: pointer; font-size: 11px;">
          ${this.scene.overrideMaterial ? 'b) Enlever Override' : 'b) MeshNormalMaterial'}
        </button>
        <button id="btn-dbg-log" style="padding: 5px 9px; background: #38bdf8; color: black; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
          c) Log Console
        </button>
      </div>
      <div id="dbg-status" style="font-size: 11px; color: #94a3b8; max-width: 280px; line-height: 1.3;">
        Fog: ${this.scene.fog ? 'FogExp2 ON' : 'NULL'} | Override: ${this.scene.overrideMaterial ? 'MeshNormal' : 'NONE'}
      </div>
    `;

    this.containerEl.appendChild(panel);

    const btnFog = panel.querySelector('#btn-dbg-fog') as HTMLButtonElement;
    const btnOverride = panel.querySelector('#btn-dbg-override') as HTMLButtonElement;
    const btnLog = panel.querySelector('#btn-dbg-log') as HTMLButtonElement;
    const statusText = panel.querySelector('#dbg-status') as HTMLDivElement;

    const updateStatus = () => {
      statusText.textContent = `Fog: ${this.scene.fog ? 'FogExp2 ON' : 'NULL'} | Override: ${this.scene.overrideMaterial ? 'MeshNormal' : 'NONE'}`;
      btnFog.textContent = this.scene.fog ? 'a) scene.fog = null' : 'a) Restaurer Fog';
      btnOverride.textContent = this.scene.overrideMaterial ? 'b) Enlever Override' : 'b) MeshNormalMaterial';
    };

    btnFog.addEventListener('click', () => {
      this.setFogEnabled(!this.scene.fog);
      updateStatus();
    });

    btnOverride.addEventListener('click', () => {
      this.setOverrideNormalMaterial(!this.scene.overrideMaterial);
      updateStatus();
    });

    btnLog.addEventListener('click', () => {
      this.dumpDiagnostics();
    });
  }
}
