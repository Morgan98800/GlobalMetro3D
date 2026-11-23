import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  RiPauseLine,
  RiPlayLine,
  RiVolumeMuteLine,
  RiVolumeUpLine,
} from '@remixicon/react';
import type { RollingStockCatalogItem } from '../data/paris_library';
import { IconButton } from './Button';
import { cx } from './cx';

export interface TrainShowroom3DProps {
  stock: RollingStockCatalogItem;
  accentColor?: string;
  className?: string;
}

function playRealMotorAudio(
  src: string,
  fallbackSrc: string,
  onEnded: () => void
): () => void {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  audio.volume = 0.85;
  let stopped = false;

  const cleanup = () => {
    stopped = true;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };

  audio.addEventListener('ended', () => {
    if (!stopped) onEnded();
  });
  audio.addEventListener('error', () => {
    if (!stopped && audio.src !== fallbackSrc && fallbackSrc) {
      audio.src = fallbackSrc;
      void audio.play().catch(() => {
        if (!stopped) onEnded();
      });
    } else if (!stopped) {
      onEnded();
    }
  });

  audio.src = src || fallbackSrc;
  void audio.play().catch(() => {
    if (!stopped) onEnded();
  });

  return cleanup;
}

export function TrainShowroom3D({ stock, accentColor, className }: TrainShowroom3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const audioStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      audioStopRef.current?.();
      audioStopRef.current = null;
    };
  }, [stock.id]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setLoading(true);
    setLoadProgress(8);
    setLoadError(false);

    const width = Math.max(240, host.clientWidth || 340);
    const height = Math.max(180, host.clientHeight || 200);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f131a');
    scene.fog = new THREE.Fog('#0f131a', 26, 62);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.2, 95);
    camera.position.set(7.6, 3.2, 16.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.domElement.className = 'block h-full w-full touch-none';
    host.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envTarget = pmrem.fromScene(envScene, 0.04);
    envScene.dispose();
    pmrem.dispose();
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.42;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 5.5;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.22;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.4, 0);
    controls.update();

    const hemi = new THREE.HemisphereLight('#d8e6ff', '#252a34', 0.62);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff5e6', 1.05);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#c4d8ff', 0.42);
    fillLight.position.set(-8, 6, 8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(accentColor || '#38d9c0', 0.55);
    rimLight.position.set(-10, 6, -8);
    scene.add(rimLight);

    const pedestalGroup = new THREE.Group();
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.28, 56),
      new THREE.MeshStandardMaterial({ color: '#1b2029', roughness: 0.85, metalness: 0.15 })
    );
    plinth.position.y = -0.14;
    pedestalGroup.add(plinth);

    const railMat = new THREE.MeshStandardMaterial({ color: '#9aa4b4', roughness: 0.35, metalness: 0.85 });
    for (const x of [-0.72, 0.72]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 55.5), railMat);
      rail.position.set(x, 0.06, 0);
      pedestalGroup.add(rail);
    }

    const sleeperMat = new THREE.MeshStandardMaterial({ color: '#2b313d', roughness: 0.9 });
    for (let z = -27; z <= 27; z += 0.85) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.22), sleeperMat);
      sleeper.position.set(0, 0.01, z);
      pedestalGroup.add(sleeper);
    }
    scene.add(pedestalGroup);

    const trainGroup = new THREE.Group();
    scene.add(trainGroup);

    const headlightGroup = new THREE.Group();
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe3a8' });
    const bulbGeo = new THREE.SphereGeometry(0.11, 12, 12);
    for (const x of [-0.62, 0.62]) {
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x, 1.05, 0.2);
      headlightGroup.add(bulb);
    }
    scene.add(headlightGroup);

    let disposed = false;
    const ktx2Loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(ktx2Loader);
    const progressParts = { cab: 0, car: 0 };
    const updateProgress = () => {
      if (disposed) return;
      const pct = Math.min(98, Math.max(8, (progressParts.cab + progressParts.car) * 50));
      setLoadProgress(pct);
    };

    const loadModel = (url: string, part: 'cab' | 'car') =>
      new Promise<THREE.Group>((resolve, reject) => {
        const sep = url.includes('?') ? '&' : '?';
        loader.load(
          `${url}${sep}v=4`,
          (gltf) => {
            progressParts[part] = 1;
            updateProgress();
            gltf.scene.traverse((obj) => {
              const mesh = obj as THREE.Mesh;
              if (!mesh.isMesh) return;
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const mat of mats) {
                if (!mat) continue;
                const std = mat as THREE.MeshStandardMaterial;
                if (std.map) {
                  std.map.colorSpace = THREE.SRGBColorSpace;
                  std.map.needsUpdate = true;
                }
                if (std.emissiveMap) {
                  std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                  std.emissiveMap.needsUpdate = true;
                  std.emissiveIntensity = 0.65;
                }
                if (std.name?.toLowerCase().includes('vitre')) {
                  std.transparent = true;
                  std.opacity = std.opacity < 1 ? std.opacity : 0.35;
                  std.depthWrite = false;
                }
                if (std.roughnessMap) std.roughnessMap.needsUpdate = true;
                std.needsUpdate = true;
              }
            });
            resolve(gltf.scene);
          },
          (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              progressParts[part] = Math.min(0.95, evt.loaded / evt.total);
              updateProgress();
            }
          },
          reject
        );
      });

    const centerCarAtOrigin = (group: THREE.Group) => {
      const box = new THREE.Box3().setFromObject(group);
      const center = new THREE.Vector3();
      box.getCenter(center);
      group.position.x -= center.x;
      group.position.z -= center.z;
      group.position.y -= box.min.y - 0.1;
      return new THREE.Box3().setFromObject(group);
    };

    Promise.all([loadModel(stock.cabGlb, 'cab'), loadModel(stock.carGlb, 'car').catch(() => null)])
      .then(([cabScene, carScene]) => {
        if (disposed) return;

        const cabBox = new THREE.Box3().setFromObject(cabScene);
        const cabSize = new THREE.Vector3();
        cabBox.getSize(cabSize);

        const isDetailedLibraryModel = stock.cabGlb.includes('/library/');
        if (cabSize.x > cabSize.z * 1.2) {
          const rotY = isDetailedLibraryModel ? -Math.PI / 2 : Math.PI / 2;
          cabScene.rotation.y = rotY;
          if (carScene) carScene.rotation.y = rotY;
        }

        const cabNorm = centerCarAtOrigin(cabScene);
        const cabLen = cabNorm.max.z - cabNorm.min.z;

        if (carScene) {
          const carNorm = centerCarAtOrigin(carScene);
          const carLen = carNorm.max.z - carNorm.min.z;
          const gap = 0.45;
          cabScene.position.z += (carLen + gap) * 0.5;
          carScene.position.z -= (cabLen + gap) * 0.5;
          trainGroup.add(carScene);
        }
        trainGroup.add(cabScene);

        const finalBox = new THREE.Box3().setFromObject(trainGroup);
        const frontZ = finalBox.max.z;
        const targetZ = frontZ - Math.min(4.2, cabLen * 0.28);
        controls.target.set(0, 1.55, targetZ);
        camera.position.set(7.6, 3.2, frontZ + 5.2);
        controls.update();

        if (isDetailedLibraryModel) {
          headlightGroup.visible = false;
        } else {
          headlightGroup.visible = true;
          headlightGroup.position.set(0, 0, frontZ - 0.05);
        }
        renderer.render(scene, camera);
        setLoadProgress(100);
        setLoading(false);
      })
      .catch(() => {
        if (!disposed) {
          setLoading(false);
          setLoadError(true);
        }
      });

    renderer.setAnimationLoop(() => {
      if (disposed) return;
      controls.autoRotate = autoRotateRef.current;
      controls.autoRotateSpeed = 1.1;
      controls.update();
      renderer.render(scene, camera);
    });

    const ro = new ResizeObserver(() => {
      if (disposed || !host) return;
      const w = Math.max(240, host.clientWidth);
      const h = Math.max(180, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(host);

    return () => {
      disposed = true;
      ro.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            m?.dispose();
          }
        }
      });
      ktx2Loader.dispose();
      envTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [stock.cabGlb, stock.carGlb, accentColor]);

  const toggleAudio = () => {
    if (audioPlaying) {
      audioStopRef.current?.();
      audioStopRef.current = null;
      setAudioPlaying(false);
      return;
    }
    audioStopRef.current?.();
    setAudioPlaying(true);
    const fallbackSrc =
      stock.driveType === 'pneu'
        ? '/audio/metro/pneu_depart.m4a'
        : '/audio/metro/fer_roll_loop.m4a';
    audioStopRef.current = playRealMotorAudio(
      stock.audioSrc ?? fallbackSrc,
      fallbackSrc,
      () => {
        setAudioPlaying(false);
        audioStopRef.current = null;
      }
    );
  };

  return (
    <div
      className={cx('dark relative overflow-hidden rounded-[14px] border bg-[#0f131a]', className)}
      style={{
        borderColor: accentColor ? `${accentColor}88` : undefined,
        boxShadow: accentColor ? `0 8px 24px -10px ${accentColor}55` : undefined,
      }}
    >
      <div
        ref={hostRef}
        className="h-[196px] w-full cursor-grab active:cursor-grabbing md:h-[214px]"
      />

      {loading && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f131a]/95 px-6"
          aria-live="polite"
        >
          {/* Jauge de progression en ligne de métro avec diodes ASVA */}
          <div className="relative flex w-full max-w-[220px] items-center justify-between">
            <span
              aria-hidden
              className="absolute inset-x-[5px] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15"
            />
            <span
              aria-hidden
              className="absolute inset-x-[5px] top-1/2 h-[3px] -translate-y-1/2 origin-left rounded-full transition-transform duration-200"
              style={{
                transform: `scaleX(${Math.min(1, Math.max(0, loadProgress / 100))})`,
                backgroundColor: accentColor || '#38d9c0',
              }}
            />
            {[10, 32, 55, 78, 95].map((threshold, idx) => {
              const lit = loadProgress >= threshold;
              return (
                <span
                  key={idx}
                  aria-hidden
                  className={cx('pl-lampe relative z-10', lit && 'is-on')}
                />
              );
            })}
          </div>
          <p className="chiffres text-[12px] font-medium text-white/80">
            Chargement du modèle 3D… {Math.round(loadProgress)} %
          </p>
        </div>
      )}
      {loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0f131a]/90 text-[12px] text-white/75">
          Aperçu 3D indisponible
        </div>
      )}

      {/* Contrôles Plan Lumineux : Son & Rotation */}
      {!loading && !loadError && (
        <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center justify-end gap-1.5">
          <div className="pointer-events-auto flex items-center gap-1.5">
            <IconButton
              size="sm"
              variant="secondaire"
              label="Écouter le son moteur"
              pressed={audioPlaying}
              onClick={toggleAudio}
              className="max-md:min-h-[44px] max-md:min-w-[44px]"
              icon={
                <span key={audioPlaying ? 'on' : 'off'} className="pl-icon-swap">
                  {audioPlaying ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
                </span>
              }
            />
            <IconButton
              size="sm"
              variant="secondaire"
              label={autoRotate ? 'Mettre en pause la rotation' : 'Reprendre la rotation'}
              pressed={autoRotate}
              onClick={() => setAutoRotate((v) => !v)}
              className="max-md:min-h-[44px] max-md:min-w-[44px]"
              icon={
                <span key={autoRotate ? 'pause' : 'play'} className="pl-icon-swap">
                  {autoRotate ? <RiPauseLine aria-hidden /> : <RiPlayLine aria-hidden />}
                </span>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
