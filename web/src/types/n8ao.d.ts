declare module 'n8ao' {
  import type { Pass } from 'postprocessing';
  import type * as THREE from 'three';

  export interface N8AOConfiguration {
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    halfRes: boolean;
    aoSamples?: number;
    denoiseSamples?: number;
    denoiseRadius?: number;
    color?: THREE.Color;
  }

  export class N8AOPostPass extends Pass {
    constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    setSize(width: number, height: number): void;
    dispose(): void;
  }
}
