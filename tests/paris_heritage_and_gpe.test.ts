import { describe, expect, it } from 'vitest';
import {
  GUIMARD_STATIONS,
  PARIS_STATION_EXITS,
  getStationHeritage,
} from '../web/src/data/paris_station_heritage';
import { GRAND_PARIS_EXPRESS_LINES, buildGpeGeoJson } from '../web/src/data/grand_paris_express';

describe('paris_station_heritage', () => {
  it('populates RATP exits for at least 36 iconic stations with numbered exits', () => {
    const stationNames = Object.keys(PARIS_STATION_EXITS);
    expect(stationNames.length).toBeGreaterThanOrEqual(36);

    for (const [name, exits] of Object.entries(PARIS_STATION_EXITS)) {
      expect(exits.length, `${name} should have at least 1 exit`).toBeGreaterThan(0);
      for (const exit of exits) {
        expect(exit.num.trim().length).toBeGreaterThan(0);
        expect(exit.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('includes surviving Guimard entrances with valid style, year, and note', () => {
    const requiredGuimard = [
      'Porte Dauphine',
      'Abbesses',
      'Châtelet',
      'Palais Royal – Musée du Louvre',
      'Cité',
      'Nation',
      'Bastille',
      'Monceau',
      'Pigalle',
      'Anvers',
      "Place d'Italie",
      'Saint-Michel',
      'Raspail',
      'Ternes',
      'Victor Hugo',
      'Courcelles',
      'Villiers',
      'Rome',
      'Europe',
      'Blanche',
      "Château d'Eau",
      'Parmentier',
      'Père Lachaise',
      'Daumesnil',
      'Louis Blanc',
      'Cadet',
    ];

    for (const name of requiredGuimard) {
      expect(GUIMARD_STATIONS[name], `Missing Guimard entry for ${name}`).toBeDefined();
      const heritage = getStationHeritage(name);
      expect(heritage.guimard).not.toBeNull();
      expect(heritage.guimard?.year).toBeGreaterThanOrEqual(1900);
      expect(heritage.guimard?.note.length).toBeGreaterThan(10);
    }

    expect(getStationHeritage('Porte Dauphine').guimard).toMatchObject({
      style: 'édicule',
      year: 1900,
    });
    expect(getStationHeritage('Abbesses').guimard).toMatchObject({
      style: 'édicule',
      year: 1900,
    });
  });

  it('normalizes accents, hyphens, apostrophes, and whitespace consistently', () => {
    const louvreAscii = getStationHeritage('Louvre - Rivoli');
    const louvreEnDash = getStationHeritage('Louvre – Rivoli');
    const louvreEmDash = getStationHeritage('  louvre — rivoli  ');
    expect(louvreAscii.exits.length).toBeGreaterThan(0);
    expect(louvreAscii).toEqual(louvreEnDash);
    expect(louvreAscii).toEqual(louvreEmDash);

    const hallesHyphen = getStationHeritage('Châtelet - Les Halles');
    const hallesNoAccent = getStationHeritage('Chatelet – Les Halles');
    expect(hallesHyphen.exits.length).toBeGreaterThan(0);
    expect(hallesHyphen).toEqual(hallesNoAccent);

    const montparnasseTight = getStationHeritage('Montparnasse-Bienvenüe');
    const montparnasseSpaced = getStationHeritage('Montparnasse – Bienvenue');
    expect(montparnasseTight.exits.length).toBeGreaterThan(0);
    expect(montparnasseTight).toEqual(montparnasseSpaced);

    const italieCurly = getStationHeritage('Place d’Italie');
    const italieStraight = getStationHeritage("Place d'Italie");
    expect(italieCurly.exits.length).toBeGreaterThan(0);
    expect(italieCurly.guimard).not.toBeNull();
    expect(italieCurly).toEqual(italieStraight);
  });

  it('returns empty heritage for unknown or blank stations', () => {
    expect(getStationHeritage('Station Inexistante')).toEqual({ exits: [], guimard: null });
    expect(getStationHeritage('   ')).toEqual({ exits: [], guimard: null });
  });
});

describe('grand_paris_express', () => {
  it('defines all 4 Grand Paris Express lines with coherent station counts', () => {
    expect(GRAND_PARIS_EXPRESS_LINES.map((l) => l.id)).toEqual([
      'gpe-15',
      'gpe-16',
      'gpe-17',
      'gpe-18',
    ]);
    expect(GRAND_PARIS_EXPRESS_LINES.map((l) => l.shortName)).toEqual(['15', '16', '17', '18']);

    for (const line of GRAND_PARIS_EXPRESS_LINES) {
      expect(line.stations.length).toBe(line.stationsCount);
      expect(line.hubs.length).toBeGreaterThanOrEqual(4);
      expect(line.lengthKm).toBeGreaterThan(20);
      expect(line.center[0]).toBeGreaterThanOrEqual(1.9);
      expect(line.center[0]).toBeLessThanOrEqual(2.8);
      expect(line.center[1]).toBeGreaterThanOrEqual(48.6);
      expect(line.center[1]).toBeLessThanOrEqual(49.1);
    }
  });

  it('builds valid MapLibre GeoJSON within the Île-de-France bounding box', () => {
    const geojson = buildGpeGeoJson();

    expect(geojson.lines.type).toBe('FeatureCollection');
    expect(geojson.lines.features).toHaveLength(4);

    expect(geojson.stations.type).toBe('FeatureCollection');
    const totalStations = GRAND_PARIS_EXPRESS_LINES.reduce((sum, l) => sum + l.stationsCount, 0);
    expect(geojson.stations.features).toHaveLength(totalStations);

    for (const feature of geojson.lines.features) {
      expect(feature.geometry.type).toBe('LineString');
      expect(feature.properties).toMatchObject({
        lineId: expect.any(String),
        shortName: expect.any(String),
        name: expect.any(String),
        color: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
      });
      if (feature.geometry.type === 'LineString') {
        expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(9);
        for (const [lng, lat] of feature.geometry.coordinates) {
          expect(lng).toBeGreaterThanOrEqual(1.9);
          expect(lng).toBeLessThanOrEqual(2.8);
          expect(lat).toBeGreaterThanOrEqual(48.6);
          expect(lat).toBeLessThanOrEqual(49.1);
        }
      }
    }

    for (const feature of geojson.stations.features) {
      expect(feature.geometry.type).toBe('Point');
      expect(feature.properties).toMatchObject({
        lineId: expect.any(String),
        shortName: expect.any(String),
        name: expect.any(String),
        color: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
      });
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        expect(lng).toBeGreaterThanOrEqual(1.9);
        expect(lng).toBeLessThanOrEqual(2.8);
        expect(lat).toBeGreaterThanOrEqual(48.6);
        expect(lat).toBeLessThanOrEqual(49.1);
      }
    }
  });
});
