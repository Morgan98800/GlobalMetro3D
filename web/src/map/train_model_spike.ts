import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';

// Straight section of line 7, selected for orientation validation.
const SPIKE_POSITION: [number, number] = [2.39822, 48.90909];
const SPIKE_COMPASS_CAP_DEGREES = -144.680485;
const SPIKE_YAW_DEGREES = 90 - SPIKE_COMPASS_CAP_DEGREES;
const ORIENTATION_CANDIDATES = {
  positive_yaw: [0, SPIKE_YAW_DEGREES, 0],
  negative_yaw: [0, -SPIKE_YAW_DEGREES, 0],
  positive_yaw_roll: [0, SPIKE_YAW_DEGREES, 90],
  negative_yaw_roll: [0, -SPIKE_YAW_DEGREES, 90]
} as const;
type OrientationCandidate = keyof typeof ORIENTATION_CANDIDATES;

interface SpikeCar {
  position: [number, number, number];
  orientation: readonly [number, number, number];
}

function spikeParams(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
}

export function isTrainModelSpikeEnabled(): boolean {
  return spikeParams().get('train-model-spike') === '1';
}

function selectedOrientation(): readonly [number, number, number] {
  const candidate = spikeParams().get('train-model-orientation') as OrientationCandidate | null;
  return candidate && candidate in ORIENTATION_CANDIDATES
    ? ORIENTATION_CANDIDATES[candidate]
    : ORIENTATION_CANDIDATES.positive_yaw_roll;
}

export function createTrainModelSpikeLayer(): ScenegraphLayer<SpikeCar> | null {
  if (!isTrainModelSpikeEnabled()) return null;

  const data: SpikeCar[] = [{
    position: [SPIKE_POSITION[0], SPIKE_POSITION[1], 0],
    orientation: selectedOrientation()
  }];

  return new ScenegraphLayer<SpikeCar>({
    id: 'train-model-spike-pneumatic',
    data,
    scenegraph: '/models/train/pneumatic_generic__neutral.glb',
    getPosition: (car) => car.position,
    getOrientation: (car) => car.orientation,
    sizeScale: 1,
    _lighting: 'pbr',
    pickable: false
  });
}

export function createTrainModelSpikeLighting(): LightingEffect {
  return new LightingEffect({
    trainSpikeAmbient: new AmbientLight({ color: [255, 255, 255], intensity: 1.0 }),
    trainSpikeKey: new DirectionalLight({ color: [255, 250, 235], intensity: 2.0, direction: [-1, -1, -2] })
  });
}