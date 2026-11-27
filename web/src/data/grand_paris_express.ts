export interface GpeStationPoint {
  name: string;
  coordinates: [number, number];
}

export interface GpeLineInfo {
  id: string;
  shortName: string;
  name: string;
  color: string;
  textColor: string;
  route: string;
  lengthKm: number;
  stationsCount: number;
  stock: string;
  horizon: string;
  center: [number, number];
  zoom: number;
  hubs: string[];
  stations: GpeStationPoint[];
}

export const GRAND_PARIS_EXPRESS_LINES: GpeLineInfo[] = [
  {
    id: 'gpe-15',
    shortName: '15',
    name: 'Ligne 15 Sud',
    color: '#A0006E',
    textColor: '#FFFFFF',
    route: 'Pont de Sèvres ↔ Noisy – Champs',
    lengthKm: 33,
    stationsCount: 16,
    stock: 'Alstom MR6V (6 voitures · Automatique)',
    horizon: '2026–2027',
    center: [2.38, 48.79],
    zoom: 11.4,
    hubs: [
      'Pont de Sèvres',
      'Châtillon – Montrouge',
      'Villejuif Gustave Roussy',
      'Créteil – L’Échat',
      'Noisy – Champs',
    ],
    stations: [
      { name: 'Pont de Sèvres', coordinates: [2.2305, 48.8297] },
      { name: 'Issy RER', coordinates: [2.2578, 48.8186] },
      { name: 'Clamart', coordinates: [2.2735, 48.8136] },
      { name: 'Châtillon – Montrouge', coordinates: [2.3019, 48.8105] },
      { name: 'Bagneux – Lucie Aubrac', coordinates: [2.3183, 48.8034] },
      { name: 'Arcueil – Cachan', coordinates: [2.3277, 48.7975] },
      { name: 'Villejuif Gustave Roussy', coordinates: [2.3489, 48.7933] },
      { name: 'Villejuif – Louis Aragon', coordinates: [2.3672, 48.7867] },
      { name: 'Vitry Centre', coordinates: [2.3901, 48.7905] },
      { name: 'Les Ardoines', coordinates: [2.4083, 48.7824] },
      { name: 'Le Vert de Maisons', coordinates: [2.4316, 48.7891] },
      { name: 'Créteil – L’Échat', coordinates: [2.4494, 48.7959] },
      { name: 'Saint-Maur – Créteil', coordinates: [2.4728, 48.8069] },
      { name: 'Champigny Centre', coordinates: [2.5122, 48.8152] },
      { name: 'Villiers – Champigny – Bry', coordinates: [2.5498, 48.8249] },
      { name: 'Noisy – Champs', coordinates: [2.58, 48.8427] },
    ],
  },
  {
    id: 'gpe-16',
    shortName: '16',
    name: 'Ligne 16',
    color: '#F3A4BA',
    textColor: '#1A1A1A',
    route: 'Saint-Denis Pleyel ↔ Noisy – Champs',
    lengthKm: 29,
    stationsCount: 10,
    stock: 'Alstom MR3V (3 voitures · Automatique)',
    horizon: '2027–2028',
    center: [2.49, 48.9],
    zoom: 11.2,
    hubs: [
      'Saint-Denis Pleyel',
      'Le Bourget RER',
      'Sevran – Beaudottes',
      'Chelles',
      'Noisy – Champs',
    ],
    stations: [
      { name: 'Saint-Denis Pleyel', coordinates: [2.3461, 48.9182] },
      { name: 'La Courneuve – Six Routes', coordinates: [2.3834, 48.9293] },
      { name: 'Le Bourget RER', coordinates: [2.4256, 48.9308] },
      { name: 'Blanc-Mesnil', coordinates: [2.466, 48.9327] },
      { name: 'Aulnay – Val Francilia', coordinates: [2.4878, 48.9478] },
      { name: 'Sevran – Beaudottes', coordinates: [2.5245, 48.9469] },
      { name: 'Sevran – Livry', coordinates: [2.5349, 48.9362] },
      { name: 'Clichy – Montfermeil', coordinates: [2.557, 48.9056] },
      { name: 'Chelles', coordinates: [2.5835, 48.8742] },
      { name: 'Noisy – Champs', coordinates: [2.58, 48.8427] },
    ],
  },
  {
    id: 'gpe-17',
    shortName: '17',
    name: 'Ligne 17',
    color: '#C9D430',
    textColor: '#1A1A1A',
    route: 'Saint-Denis Pleyel ↔ Le Mesnil-Amelot',
    lengthKm: 26.5,
    stationsCount: 9,
    stock: 'Alstom MR3V (3 voitures · Automatique)',
    horizon: '2027–2030',
    center: [2.48, 48.97],
    zoom: 11.1,
    hubs: ['Saint-Denis Pleyel', 'Le Bourget Aéroport', 'Parc des Expositions', 'Aéroport CDG T2'],
    stations: [
      { name: 'Saint-Denis Pleyel', coordinates: [2.3461, 48.9182] },
      { name: 'La Courneuve – Six Routes', coordinates: [2.3834, 48.9293] },
      { name: 'Le Bourget RER', coordinates: [2.4256, 48.9308] },
      { name: 'Le Bourget Aéroport', coordinates: [2.4414, 48.9472] },
      { name: 'Triangle de Gonesse', coordinates: [2.4722, 48.9722] },
      { name: 'Parc des Expositions', coordinates: [2.5144, 48.9736] },
      { name: 'Aéroport Charles-de-Gaulle Terminal 2', coordinates: [2.5712, 49.0044] },
      { name: 'Aéroport Charles-de-Gaulle Terminal 4', coordinates: [2.5912, 49.0124] },
      { name: 'Le Mesnil-Amelot', coordinates: [2.5918, 49.0205] },
    ],
  },
  {
    id: 'gpe-18',
    shortName: '18',
    name: 'Ligne 18',
    color: '#00A88F',
    textColor: '#FFFFFF',
    route: 'Aéroport d’Orly ↔ Versailles Chantiers',
    lengthKm: 35,
    stationsCount: 10,
    stock: 'Alstom MRV (3 voitures · Viaduc Saclay)',
    horizon: '2026–2030',
    center: [2.23, 48.74],
    zoom: 11.1,
    hubs: [
      'Aéroport d’Orly',
      'Massy – Palaiseau',
      'Orsay – Gif',
      'Saint-Quentin Est',
      'Versailles Chantiers',
    ],
    stations: [
      { name: 'Aéroport d’Orly', coordinates: [2.3614, 48.7289] },
      { name: 'Antonypôle – Wissous Centre', coordinates: [2.3114, 48.7327] },
      { name: 'Massy Opéra', coordinates: [2.2903, 48.7308] },
      { name: 'Massy – Palaiseau', coordinates: [2.2587, 48.7252] },
      { name: 'Palaiseau', coordinates: [2.2089, 48.7161] },
      { name: 'Orsay – Gif', coordinates: [2.1674, 48.7114] },
      { name: 'CEA Saint-Aubin', coordinates: [2.1419, 48.7136] },
      { name: 'Saint-Quentin Est', coordinates: [2.0758, 48.7617] },
      { name: 'Satory', coordinates: [2.1112, 48.7862] },
      { name: 'Versailles Chantiers', coordinates: [2.1355, 48.7955] },
    ],
  },
];

export function buildGpeGeoJson(): {
  lines: GeoJSON.FeatureCollection;
  stations: GeoJSON.FeatureCollection;
} {
  const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = GRAND_PARIS_EXPRESS_LINES.map(
    (line) => ({
      type: 'Feature',
      properties: {
        lineId: line.id,
        shortName: line.shortName,
        name: line.name,
        color: line.color,
      },
      geometry: {
        type: 'LineString',
        coordinates: line.stations.map((s) => s.coordinates),
      },
    })
  );

  const stationFeatures: GeoJSON.Feature<GeoJSON.Point>[] = GRAND_PARIS_EXPRESS_LINES.flatMap(
    (line) =>
      line.stations.map((st) => ({
        type: 'Feature',
        properties: {
          lineId: line.id,
          shortName: line.shortName,
          name: st.name,
          lineName: line.name,
          color: line.color,
        },
        geometry: {
          type: 'Point',
          coordinates: st.coordinates,
        },
      }))
  );

  return {
    lines: {
      type: 'FeatureCollection',
      features: lineFeatures,
    },
    stations: {
      type: 'FeatureCollection',
      features: stationFeatures,
    },
  };
}
