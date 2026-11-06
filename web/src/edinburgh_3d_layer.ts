import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function createEdinburgh3DLayer(map: MapLibreMap): CustomLayerInterface {
  // Origin from edinburgh_3d.json: Waverley station centroid [lng, lat]
  const modelOrigin: [number, number] = [-3.188674, 55.952230];
  const modelAltitude = 0; // Sea level datum (British National Grid)

  const modelAsMercator = maplibregl.MercatorCoordinate.fromLngLat(modelOrigin, modelAltitude);
  // 1 unit in edinburgh_city.glb = 100 meters
  const scale = modelAsMercator.meterInMercatorCoordinateUnits() * 100.0;

  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer | null = null;
  let isModelLoaded = false;

  return {
    id: 'edinburgh-3d-city-model',
    type: 'custom',
    renderingMode: '3d',
    onAdd(mapInstance: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      // Atmospheric lighting calibrated for Edinburgh stone & topography
      const ambientLight = new THREE.HemisphereLight(0xeef4fa, 0x485040, 1.4);
      scene.add(ambientLight);

      const sunLight = new THREE.DirectionalLight(0xfffaec, 2.2);
      sunLight.position.set(-600, 800, 500);
      scene.add(sunLight);

      const fillLight = new THREE.DirectionalLight(0x7597b8, 0.8);
      fillLight.position.set(600, 400, -400);
      scene.add(fillLight);

      renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
        antialias: true
      });
      renderer.autoClear = false;

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      loader.load(
        '/cities/edinburgh/models/edinburgh_city.glb',
        (gltf) => {
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (mesh.material) {
                const mat = mesh.material as THREE.MeshStandardMaterial;
                mat.roughness = 0.85;
                mat.metalness = 0.15;
                if (mesh.geometry.attributes.color) {
                  mat.vertexColors = true;
                }
              }
            }
          });
          scene.add(gltf.scene);
          isModelLoaded = true;
          mapInstance.triggerRepaint();
          console.log('[edinburgh-3d] Pinned 3D City Model inside MapLibre at Waverley [-3.188674, 55.952230]');
        },
        undefined,
        (err) => {
          console.error('[edinburgh-3d] Failed to load 3D city model:', err);
        }
      );
    },
    render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any) {
      if (!renderer || !isModelLoaded) return;

      const matrixArray: number[] = Array.isArray(options)
        ? options
        : (options.modelViewProjectionMatrix || options.projectionMatrix);
      if (!matrixArray) return;

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const m = new THREE.Matrix4().fromArray(matrixArray);
      const l = new THREE.Matrix4()
        .makeTranslation(modelAsMercator.x, modelAsMercator.y, modelAsMercator.z)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(rotationX);

      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    }
  };
}
