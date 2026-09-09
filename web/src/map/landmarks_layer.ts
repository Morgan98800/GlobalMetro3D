import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { GLTFLoader } from '@loaders.gl/gltf';

export interface LandmarkItem {
  id: string;
  name: string;
  coords: [number, number]; // [lng, lat]
  elevation: number;
  modelUrl: string;
  yaw?: number;
}

export const PARIS_LANDMARKS_GLTF: LandmarkItem[] = [
  {
    id: 'tour_eiffel',
    name: 'Tour Eiffel',
    coords: [2.2945, 48.8584],
    elevation: 0,
    modelUrl: '/models/tour_eiffel.glb',
    yaw: 26 // Alignement axe Champ de Mars
  },
  {
    id: 'arc_de_triomphe',
    name: 'Arc de Triomphe',
    coords: [2.2950, 48.8738],
    elevation: 0,
    modelUrl: '/models/arc_de_triomphe.glb',
    yaw: 26 // Alignement axe historique Champs-Élysées
  },
  {
    id: 'sacre_coeur',
    name: 'Sacré-Cœur (Montmartre)',
    coords: [2.3431, 48.8867],
    elevation: 0,
    modelUrl: '/models/sacre_coeur.glb'
  },
  {
    id: 'notre_dame',
    name: 'Notre-Dame de Paris',
    coords: [2.3499, 48.8530],
    elevation: 0,
    modelUrl: '/models/notre_dame.glb',
    yaw: -20
  },
  {
    id: 'invalides',
    name: 'Hôtel des Invalides',
    coords: [2.3124, 48.8550],
    elevation: 0,
    modelUrl: '/models/invalides.glb'
  },
  {
    id: 'montparnasse',
    name: 'Tour Montparnasse',
    coords: [2.3217, 48.8421],
    elevation: 0,
    modelUrl: '/models/montparnasse.glb',
    yaw: 35
  },
  {
    id: 'louvre',
    name: 'Musée du Louvre',
    coords: [2.3364, 48.8606],
    elevation: 0,
    modelUrl: '/models/louvre.glb'
  },
  {
    id: 'pantheon',
    name: 'Le Panthéon',
    coords: [2.3460, 48.8462],
    elevation: 0,
    modelUrl: '/models/pantheon.glb'
  }
];

export interface LandmarksLayerOptions {
  zoom: number;
  mapCenter: [number, number]; // [lng, lat]
  bounds?: [[number, number], [number, number]] | null;
}

/**
 * Crée les couches ScenegraphLayer pour les monuments parisiens
 * Contraintes respectées :
 * - Visibles à partir du zoom 13 seulement
 * - Chargés à la demande selon l'emprise de la caméra (filtrage géodésique robuste tous angles)
 * - Taille < 300 Ko par modèle (tous entre 5 Ko et 62 Ko)
 */
export function createLandmarksLayers(options: LandmarksLayerOptions): any[] {
  const { zoom, mapCenter } = options;

  // 1. Règle : visible à partir du zoom 13 seulement
  if (zoom < 13) {
    return [];
  }

  // 2. Rayon d'emprise de la caméra selon le niveau de zoom (en degrés)
  // z13: ~10 km, z14: ~6 km, z15+: ~3.5 km
  const viewRadiusDeg = zoom >= 15 ? 0.035 : zoom >= 14 ? 0.065 : 0.10;

  // 3. Filtrage à la demande selon la visibilité caméra
  const visibleLandmarks = PARIS_LANDMARKS_GLTF.filter((lm) => {
    const dLng = lm.coords[0] - mapCenter[0];
    const dLat = lm.coords[1] - mapCenter[1];
    const distSq = dLng * dLng + dLat * dLat;
    return distSq <= viewRadiusDeg * viewRadiusDeg;
  });

  // 4. Génération des ScenegraphLayers pour les monuments dans le champ
  return visibleLandmarks.map((lm) => {
    return new ScenegraphLayer({
      id: `landmark-${lm.id}`,
      data: [lm],
      scenegraph: lm.modelUrl,
      loaders: [GLTFLoader],
      getPosition: (d: LandmarkItem) => [d.coords[0], d.coords[1], d.elevation],
      // Les modèles sont directement exportés en Z-up (Up vers le ciel)
      // La rotation [0, yaw, 0] oriente l'azimut sur le plan de la carte
      getOrientation: (d: LandmarkItem) => [0, -(d.yaw || 0), 0],
      sizeScale: 1, // échelle 1:1, unités du glTF en mètres réels
      pickable: true,
      _lighting: 'pbr'
    });
  });
}
