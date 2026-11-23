import { describe, expect, it } from 'vitest';
import type { LineMetadata, StationMetadata } from '@core/types';
import { createPlatformsLayer, createPlatformsLayers } from '@core/ui/map/platforms_layer';
import {
  createLocalStationDetailLayers,
  isAerialViaductLocation,
  shouldEnableUndergroundXray,
} from '@core/ui/map/station_detail_lod';

const METRO_LINE_6: LineMetadata = {
  id: 'L6',
  short_name: '6',
  long_name: 'Ligne 6',
  mode: 'metro',
  color: '#6ECA97',
  text_color: '#111111',
  destinations: { '0': 'Charles de Gaulle - Étoile', '1': 'Nation' },
  measured_length_km: 13.6,
  elevation_offset: 5,
};

const METRO_LINE_1: LineMetadata = {
  id: 'L1',
  short_name: '1',
  long_name: 'Ligne 1',
  mode: 'metro',
  color: '#FFCD00',
  text_color: '#111111',
  destinations: { '0': 'La Défense', '1': 'Château de Vincennes' },
  measured_length_km: 16.5,
  elevation_offset: 0,
};

const STATIONS: StationMetadata[] = [
  {
    id: 'st-chatelet',
    name: 'Châtelet',
    coordinates: [2.347, 48.8584],
    lines: ['L1'],
    is_hub: true,
    wheelchair_boarding: 1,
  },
  {
    id: 'st-bir-hakeim',
    name: 'Bir-Hakeim',
    coordinates: [2.2893, 48.8539],
    lines: ['L6'],
    is_hub: false,
    wheelchair_boarding: 1,
  },
  {
    id: 'st-far',
    name: 'La Défense',
    coordinates: [2.238, 48.8919],
    lines: ['L1'],
    is_hub: true,
    wheelchair_boarding: 1,
  },
];

describe('station_detail_lod & platforms_layer', () => {
  it('returns no LOD detail layers below zoom 14.5', () => {
    const tracksByLine = new Map<string, [number, number][][]>([
      [
        'L1',
        [
          [
            [2.345, 48.8584],
            [2.349, 48.8584],
          ],
        ],
      ],
    ]);
    const layers = createLocalStationDetailLayers({
      lines: [METRO_LINE_1],
      stations: STATIONS,
      tracksByLine,
      selectedLineId: 'L1',
      zoom: 13.8,
      mapCenter: [2.347, 48.8584],
      theme: 'dark',
    });
    expect(layers).toEqual([]);
  });

  it('builds local sleepers, rails, underground cutaway trench, and architecture at zoom >= 14.5', () => {
    const tracksByLine = new Map<string, [number, number][][]>([
      [
        'L1',
        [
          [
            [2.3455, 48.8584],
            [2.3485, 48.8584],
          ],
        ],
      ],
    ]);
    const layers = createLocalStationDetailLayers({
      lines: [METRO_LINE_1],
      stations: STATIONS,
      tracksByLine,
      selectedLineId: 'L1',
      zoom: 16.2,
      mapCenter: [2.347, 48.8584],
      theme: 'dark',
    });
    const ids = layers.map((l) => l.id);
    expect(ids).toContain('station-lod-cutouts');
    expect(ids).toContain('station-lod-sleepers');
    expect(ids).toContain('station-lod-rails');
    expect(ids).toContain('station-lod-architecture');
    expect(ids).toContain('station-lod-vault-ribs');
    expect(ids).toContain('station-lod-names');
    expect(ids).not.toContain('station-lod-plaques');
    expect(ids).not.toContain('station-lod-viaducts');

    const namesLayer = layers.find((l) => l.id === 'station-lod-names') as any;
    expect(namesLayer?.props?.billboard).toBe(false);
    expect(namesLayer?.props?.sizeUnits).toBe('meters');

    const archLayer = layers.find((l) => l.id === 'station-lod-architecture') as any;
    expect(archLayer?.props?.data?.length).toBeGreaterThan(20);
  });

  it('detects Paris Line 2 & 6 aerial viaducts and keeps buildings solid during normal zoom', () => {
    // Bir-Hakeim on Line 6 is an aerial viaduct
    expect(isAerialViaductLocation('6', [2.2893, 48.8539])).toBe(true);
    expect(shouldEnableUndergroundXray(16.5, [2.2893, 48.8539], '6', true)).toBe(false);

    // Châtelet on Line 1 is underground: keep buildings solid on normal zoom, X-ray only during follow
    expect(isAerialViaductLocation('1', [2.347, 48.8584])).toBe(false);
    expect(shouldEnableUndergroundXray(16.5, [2.347, 48.8584], '1', false)).toBe(false);
    expect(shouldEnableUndergroundXray(16.5, [2.347, 48.8584], '1', true)).toBe(true);
    expect(shouldEnableUndergroundXray(13.5, [2.347, 48.8584], '1', true)).toBe(false);
  });

  it('renders viaduct decks/piers instead of underground cutouts on Line 6 viaducts', () => {
    const tracksByLine = new Map<string, [number, number][][]>([
      [
        'L6',
        [
          [
            [2.288, 48.8539],
            [2.291, 48.8539],
          ],
        ],
      ],
    ]);
    const layers = createLocalStationDetailLayers({
      lines: [METRO_LINE_6],
      stations: STATIONS,
      tracksByLine,
      selectedLineId: 'L6',
      zoom: 16.4,
      mapCenter: [2.2893, 48.8539],
      theme: 'light',
    });
    const ids = layers.map((l) => l.id);
    expect(ids).toContain('station-lod-viaducts');
    expect(ids).not.toContain('station-lod-cutouts');
  });

  it('creates multi-bay tiled platforms and safety strips from zoom 13.5', () => {
    const layer = createPlatformsLayer(
      [STATIONS[0]],
      METRO_LINE_1,
      [
        [
          [2.3455, 48.8584],
          [2.3485, 48.8584],
        ],
      ],
      14.5,
      'dark'
    );
    expect(layer).not.toBeNull();
    // 6 stone tile bays + 1 trackside safety coping strip on both platform sides = 14 polygons
    expect((layer as any).props.data).toHaveLength(14);
  });

  it('splits underground layers below landuse-urban while keeping surface entrances and aerial viaducts above ground', () => {
    const tracksByLine = new Map<string, [number, number][][]>([
      [
        'L1',
        [
          [
            [2.3455, 48.8584],
            [2.3485, 48.8584],
          ],
        ],
      ],
      [
        'L6',
        [
          [
            [2.288, 48.8539],
            [2.291, 48.8539],
          ],
        ],
      ],
    ]);

    const platformLayers = createPlatformsLayers(
      STATIONS,
      null,
      [],
      16.2,
      'dark',
      { lines: [METRO_LINE_1, METRO_LINE_6], tracksByLine },
      undefined,
      null,
      'landuse-urban'
    );
    const ugPlat = platformLayers.find((l) => l.id === 'subway-platforms-ug') as any;
    const surfPlat = platformLayers.find((l) => l.id === 'subway-platforms') as any;
    expect(ugPlat?.props?.beforeId).toBe('landuse-urban');
    expect(surfPlat?.props?.beforeId).toBeUndefined();

    const lodLayers = createLocalStationDetailLayers({
      lines: [METRO_LINE_1],
      stations: [STATIONS[0]],
      tracksByLine,
      selectedLineId: 'L1',
      zoom: 16.5,
      mapCenter: STATIONS[0].coordinates,
      theme: 'dark',
      undergroundBeforeId: 'landuse-urban',
    });
    const railsLayer = lodLayers.find((l) => l.id.startsWith('station-lod-rails')) as any;
    const escalatorsSurface = lodLayers.find((l) => l.id === 'station-lod-escalators-surface') as any;
    expect(railsLayer?.props?.beforeId).toBe('landuse-urban');
    expect(railsLayer?.props?.data?.length).toBeGreaterThanOrEqual(2);
    expect(escalatorsSurface?.props?.beforeId).toBeUndefined();
  });

  it('separates co-located multi-level hubs vertically and adds transfer shafts without z-overlap', () => {
    const strasbourg: StationMetadata = {
      id: 'st-strasbourg',
      name: 'Strasbourg - Saint-Denis',
      coordinates: [2.353635, 48.869483],
      lines: ['L4', 'L8'],
      is_hub: true,
      wheelchair_boarding: 0,
    };
    const line4: LineMetadata = { ...METRO_LINE_1, id: 'L4', short_name: '4', elevation_offset: 6 };
    const line8: LineMetadata = { ...METRO_LINE_6, id: 'L8', short_name: '8', elevation_offset: 8 };
    const tracksByLine = new Map<string, [number, number][][]>([
      [
        'L4',
        [
          [
            [2.3536, 48.8685],
            [2.3536, 48.8705],
          ],
        ],
      ],
      [
        'L8',
        [
          [
            [2.3522, 48.8695],
            [2.3552, 48.8695],
          ],
        ],
      ],
    ]);

    const layers = createLocalStationDetailLayers({
      lines: [line4, line8],
      stations: [strasbourg],
      tracksByLine,
      selectedLineId: null,
      zoom: 16.2,
      mapCenter: strasbourg.coordinates,
      theme: 'dark',
    });

    const cutoutsLayer = layers.find((l) => l.id === 'station-lod-cutouts') as any;
    const archLayer = layers.find((l) => l.id === 'station-lod-architecture') as any;
    const cutoutZs = (cutoutsLayer?.props?.data ?? []).map((d: any) => d.polygon[0][2]);
    expect(cutoutZs).toHaveLength(2);
    expect(Math.abs(cutoutZs[0] - cutoutZs[1])).toBeGreaterThanOrEqual(7.4);

    const upperAlpha = cutoutsLayer.props.data
      .slice()
      .sort((a: any, b: any) => a.polygon[0][2] - b.polygon[0][2])[1].fillColor[3];
    expect(upperAlpha).toBeLessThan(100);

    const shafts = (archLayer?.props?.data ?? []).filter(
      (d: any) => d.fillColor[0] === 201 && d.fillColor[1] === 162 && d.fillColor[2] === 39
    );
    expect(shafts.length).toBeGreaterThanOrEqual(2);
  });

  it('projects station cutouts and wall structures strictly near Paris coordinates without invalid latitude', () => {
    const tracksByLine = new Map<string, [number, number][][]>([
      [
        'L1',
        [
          [
            [2.3455, 48.8584],
            [2.3485, 48.8584],
          ],
        ],
      ],
    ]);
    const mapCenter = STATIONS[0].coordinates;
    const layers = createLocalStationDetailLayers({
      lines: [METRO_LINE_1],
      stations: [STATIONS[0]],
      tracksByLine,
      selectedLineId: 'L1',
      zoom: 16.5,
      mapCenter,
      theme: 'light',
      undergroundBeforeId: 'landuse-urban',
    });

    const cutoutsLayers = layers.filter((l) => l.id.startsWith('station-lod-cutouts')) as any[];
    const archLayers = layers.filter((l) => l.id.startsWith('station-lod-architecture')) as any[];
    const namesLayers = layers.filter((l) => l.id.startsWith('station-lod-names')) as any[];

    const cutoutData = cutoutsLayers.flatMap((l) => l.props?.data ?? []);
    const archData = archLayers.flatMap((l) => l.props?.data ?? []);
    const namesData = namesLayers.flatMap((l) => l.props?.data ?? []);

    expect(cutoutData.length).toBeGreaterThan(0);
    expect(archData.length).toBeGreaterThan(0);
    expect(namesData.length).toBeGreaterThan(0);

    for (const d of [...cutoutData, ...archData]) {
      for (const coord of d.polygon as [number, number, number][]) {
        expect(Math.abs(coord[1] - mapCenter[1])).toBeLessThan(0.05);
        expect(Math.abs(coord[0] - mapCenter[0])).toBeLessThan(0.05);
      }
    }
    for (const n of namesData) {
      expect(Math.abs(n.position[1] - mapCenter[1])).toBeLessThan(0.05);
      expect(Math.abs(n.position[0] - mapCenter[0])).toBeLessThan(0.05);
    }
  });
});
