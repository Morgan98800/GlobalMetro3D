import type { StyleSpecification } from 'maplibre-gl';

/**
 * Style sombre vectoriel sur source OpenFreeMap (OpenMapTiles v3.15)
 * Calibré sur les tokens CSS parisiens :
 * --fonte: #0E1512 (noir fonte ardoise)
 * --fonte-surface: #151F1B
 * --fonte-border: #23332D
 * --guimard: #1F4A3B (vert métro sombre)
 * --ceramique: #EFE9DD
 * --ceramique-dim: #A8A398
 * --laiton: #B4894F
 *
 * Le fond reste ultra-désaturé afin que les 16 lignes de métro GTFS
 * restent l'élément visuel prédominant.
 */
// IDs OSM des polygones des monuments majeurs pour éviter les doublons avec les modèles glTF deck.gl
export const MASKED_LANDMARK_OSM_IDS = [
  // Tour Eiffel
  3351010280, 3086891640, 41148393, 3081452390, 3086877440, 41148423, 3086877450, 3080213892, 14625977622,
  // Arc de Triomphe
  2264135170, 2264135100, 2264135150, 2264135222, 2264135092, 2264135142, 2265201452, 2264135082, 2265201462,
  // Sacré-Cœur
  2267273670, 2267273682, 2267273510, 2267273270, 2267273220, 2267273562, 2267273492, 2267273230, 2267273330, 2267273422, 2267273412, 2267273352, 2267273212, 237629810,
  // Notre-Dame
  12998354140, 2016112690, 2016112730, 2017607710, 2016112612, 12998354162,
  // Invalides
  201089080, 689065690, 14623841770, 14623841742, 14623841920, 2276620170, 14623841830, 2276620060, 14623841912, 2276620140, 631787530, 14624434112, 14624434122, 2276620132, 2276620122, 2276620052, 2276620230, 2276620302,
  // Tour Montparnasse
  12128493,
  // Panthéon
  12009361582, 14591348250, 14581087522, 12009176110, 12009176162, 14581087190, 14581087202, 12009176152, 12009176142
];

export function createVectorDarkStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Paris Subway 3D — Noir Fonte Vectoriel',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet'
      }
    },
    layers: [
      // 1. Fond général (Fonte)
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#0E1512'
        }
      },

      // 2. Occupation du sol (Landcover & Landuse discret)
      {
        id: 'landcover-wood-grass',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'grass', 'scrub'],
        paint: {
          'fill-color': '#131E19',
          'fill-opacity': 0.8
        }
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: {
          'fill-color': '#16251F',
          'fill-opacity': 0.85
        }
      },
      {
        id: 'landuse-residential',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['in', 'class', 'residential', 'commercial', 'industrial'],
        paint: {
          'fill-color': '#111814',
          'fill-opacity': 0.6
        }
      },
      {
        id: 'landuse-cemetery',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['==', 'class', 'cemetery'],
        paint: {
          'fill-color': '#141C18',
          'fill-opacity': 0.7
        }
      },

      // 3. Réseau hydrographique (La Seine, canaux)
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#08100C',
          'fill-opacity': 1.0
        }
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': '#08100C',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3]
        }
      },

      // 4. Réseau routier et voirie (ultra-désaturé, hiérarchisé)
      {
        id: 'rail-lines',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'rail'],
        minzoom: 12,
        paint: {
          'line-color': '#1A2620',
          'line-width': 1,
          'line-dasharray': [3, 2]
        }
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'minor', 'service', 'track'],
        minzoom: 13,
        paint: {
          'line-color': '#141D19',
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 2.5]
        }
      },
      {
        id: 'road-secondary-tertiary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'secondary', 'tertiary'],
        minzoom: 11,
        paint: {
          'line-color': '#18231E',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 4]
        }
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'primary'],
        minzoom: 9,
        paint: {
          'line-color': '#1C2923',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 16, 5]
        }
      },
      {
        id: 'road-trunk-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk'],
        minzoom: 8,
        paint: {
          'line-color': '#22322A',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 16, 6]
        }
      },
      {
        id: 'bridges',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', 'brunnel', 'bridge'],
        minzoom: 12,
        paint: {
          'line-color': '#283A31',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 7]
        }
      },

      // 5. Limites administratives (Arrondissements, frontière de Paris)
      {
        id: 'admin-boundary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['in', 'admin_level', 4, 6, 8],
        paint: {
          'line-color': '#2A3B33',
          'line-width': 1,
          'line-dasharray': [4, 3],
          'line-opacity': 0.5
        }
      },

      // 6. Bâti 3D en fill-extrusion (placé SOUS les labels de symboles)
      // Teinte pierre sombre désaturée avec variation lumineuse subtile selon la hauteur
      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        filter: [
          'all',
          ['!=', 'hide_3d', true],
          ['!in', '$id', ...MASKED_LANDMARK_OSM_IDS]
        ] as any,
        minzoom: 14,
        paint: {
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          // Pousse au zoom entre z14 et z15.5 pour éviter l'apparition brutale
          // Repli sur 18 m (estimation gabarit haussmannien) pour les polygones sans render_height
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14,
            [
              '*',
              [
                'case',
                ['all', ['has', 'render_height'], ['>', ['get', 'render_height'], 0]],
                ['get', 'render_height'],
                18 // Estimation gabarit haussmannien standard (~6 niveaux)
              ],
              0.05
            ],
            15.5,
            [
              'case',
              ['all', ['has', 'render_height'], ['>', ['get', 'render_height'], 0]],
              ['get', 'render_height'],
              18
            ]
          ],
          // Pierre ardoise/calcaire sombre désaturée, variation douce de luminosité selon la hauteur
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            [
              'case',
              ['all', ['has', 'render_height'], ['>', ['get', 'render_height'], 0]],
              ['get', 'render_height'],
              18
            ],
            0, '#19241F',
            20, '#222E27',
            40, '#2A3931',
            120, '#36483E'
          ],
          'fill-extrusion-opacity': 0.85
        }
      },

      // 7. Labels de cours d'eau (La Seine)
      {
        id: 'water-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        minzoom: 13,
        layout: {
          'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-letter-spacing': 0.15,
          'symbol-placement': 'line'
        },
        paint: {
          'text-color': '#3D544A',
          'text-halo-color': '#0E1512',
          'text-halo-width': 1.5
        }
      },

      // 7. Labels de quartiers / arrondissements
      {
        id: 'place-suburb-quarter',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['in', 'class', 'suburb', 'quarter', 'neighbourhood'],
        minzoom: 12,
        maxzoom: 15,
        layout: {
          'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 14, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12
        },
        paint: {
          'text-color': '#6E7A74',
          'text-halo-color': '#0E1512',
          'text-halo-width': 1.5,
          'text-opacity': 0.7
        }
      },

      // 8. Labels de rues — STRICTEMENT minzoom: 14 (aucun label sous zoom 14)
      {
        id: 'road-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 16, 11],
          'symbol-placement': 'line',
          'text-max-angle': 30
        },
        paint: {
          'text-color': '#75837C',
          'text-halo-color': '#0E1512',
          'text-halo-width': 1.5
        }
      }
    ]
  };
}
