import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { GLTFLoader } from '@loaders.gl/gltf';

export interface LandmarkItem {
  id: string;
  name: string;
  coords: [number, number]; // [lng, lat]
  elevation: number;
  modelUrl: string;
  /** Deck.gl [pitch, yaw, roll] in degrees. Standard glTF Y-up models use roll = 90. */
  orientation: [number, number, number];
}

/**
 * Hero 3D Paris monuments complementing Overture Maps `building_part` extrusions.
 * Notre-Dame and the Louvre already render with high-detail real footprints & spires
 * directly from Overture `building_part`, so we avoid covering them with coarse boxes.
 */
export const PARIS_LANDMARKS_GLTF: LandmarkItem[] = [
  {
    id: 'tour_eiffel',
    name: 'Tour Eiffel',
    coords: [2.294481, 48.85837],
    elevation: 0,
    modelUrl: '/models/landmarks/eiffel_tower_cc0.glb',
    // CC0 1:1 330m glTF (Z-up baked into node), aligned with Champ de Mars / Trocadéro axis
    orientation: [0, -44, 0],
  },
  {
    id: 'arc_de_triomphe',
    name: 'Arc de Triomphe',
    coords: [2.295, 48.8738],
    elevation: 0,
    modelUrl: '/models/landmarks/arc_de_triomphe.glb',
    orientation: [0, -26, 0],
  },
  {
    id: 'sacre_coeur',
    name: 'Sacré-Cœur',
    coords: [2.3431, 48.8867],
    elevation: 0,
    modelUrl: '/models/landmarks/sacre_coeur.glb',
    orientation: [0, 0, 0],
  },
  {
    id: 'invalides',
    name: 'Hôtel des Invalides',
    coords: [2.3124, 48.855],
    elevation: 0,
    modelUrl: '/models/landmarks/invalides.glb',
    orientation: [0, 0, 0],
  },
  {
    id: 'montparnasse',
    name: 'Tour Montparnasse',
    coords: [2.3217, 48.8421],
    elevation: 0,
    modelUrl: '/models/landmarks/montparnasse.glb',
    orientation: [0, -35, 0],
  },
  {
    id: 'pantheon',
    name: 'Le Panthéon',
    coords: [2.346, 48.8462],
    elevation: 0,
    modelUrl: '/models/landmarks/pantheon.glb',
    orientation: [0, 0, 0],
  },
];

export interface LandmarksLayerOptions {
  zoom: number;
  pitch: number;
  mapCenter: [number, number];
  visible: boolean;
  cityId?: string;
  theme?: 'dark' | 'light';
}

/**
 * Renders architectural Paris 3D landmarks lazily culled to the active camera
 * neighborhood whenever 3D buildings are visible.
 */
export function createLandmarksLayers(options: LandmarksLayerOptions): any[] {
  const { zoom, pitch, mapCenter, visible, cityId = 'paris' } = options;

  if (!visible || cityId !== 'paris' || zoom < 12.2 || pitch < 10) {
    return [];
  }

  const viewRadiusDeg = zoom >= 15.5 ? 0.032 : zoom >= 14 ? 0.065 : 0.12;
  const visibleLandmarks = PARIS_LANDMARKS_GLTF.filter((lm) => {
    const dLng = lm.coords[0] - mapCenter[0];
    const dLat = lm.coords[1] - mapCenter[1];
    return dLng * dLng + dLat * dLat <= viewRadiusDeg * viewRadiusDeg;
  });

  return visibleLandmarks.map(
    (lm) =>
      new ScenegraphLayer({
        id: `landmark-${lm.id}`,
        data: [lm],
        scenegraph: lm.modelUrl,
        loaders: [GLTFLoader],
        getPosition: (d: LandmarkItem) => [d.coords[0], d.coords[1], d.elevation],
        getOrientation: (d: LandmarkItem) => d.orientation,
        sizeScale: 1,
        pickable: false,
        _lighting: 'pbr',
        parameters: {
          depthTest: true,
        } as any,
      })
  );
}
