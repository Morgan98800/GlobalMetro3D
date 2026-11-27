import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LineMetadata, StationMetadata } from '@core/types';
import type { LineLadderData } from '@core/ui/components/station_ladder';
import {
  computeTransitItineraries,
  isLineWheelchairAccessible,
  PARIS_HUB_TRANSFER_SEC,
} from '@core/ui/utils/transit_router';

const DATA_DIR = path.resolve(process.cwd(), 'web/public/data');
const LINES = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'lines.json'), 'utf8')
) as LineMetadata[];
const STATIONS = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf8')
) as StationMetadata[];
const LADDERS = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'line_ladders.json'), 'utf8')
) as Record<string, LineLadderData>;

describe('transit_router on Paris GTFS graph', () => {
  it('routes directly on Line 1 from Bastille to Champs-Élysées - Clemenceau without transfers', () => {
    const bastille = STATIONS.find((s) => s.name === 'Bastille')!;
    const clemenceau = STATIONS.find((s) => s.name.includes('Clemenceau'))!;
    const routes = computeTransitItineraries(
      {
        label: bastille.name,
        coordinates: bastille.coordinates,
        kind: 'station',
        station: bastille,
      },
      {
        label: clemenceau.name,
        coordinates: clemenceau.coordinates,
        kind: 'station',
        station: clemenceau,
      },
      { stations: STATIONS, lines: LINES, ladders: LADDERS }
    );

    expect(routes.length).toBeGreaterThan(0);
    const best = routes[0];
    expect(best.transferCount).toBe(0);
    expect(best.legs.some((leg) => leg.kind === 'ride' && leg.lineShortName === '1')).toBe(true);
    expect(best.totalDurationSec).toBeGreaterThan(180);
    expect(best.totalDurationSec).toBeLessThan(2000);
  });

  it('routes address-to-restaurant across multiple lines with walk legs and valid transfer', () => {
    // Champ de Mars (Eiffel Tower area) -> Grands Boulevards / Bouillon Chartier area
    const routes = computeTransitItineraries(
      {
        label: 'Tour Eiffel',
        coordinates: [2.2945, 48.8584],
        kind: 'place',
      },
      {
        label: 'Bouillon Chartier Grands Boulevards',
        coordinates: [2.3431, 48.8719],
        kind: 'place',
      },
      { stations: STATIONS, lines: LINES, ladders: LADDERS }
    );

    expect(routes.length).toBeGreaterThan(0);
    const best = routes[0];
    expect(best.legs[0].kind).toBe('walk');
    expect(best.legs[best.legs.length - 1].kind).toBe('walk');
    expect(best.legs.some((leg) => leg.kind === 'ride')).toBe(true);
    expect(best.totalWalkM).toBeGreaterThan(100);
  });

  it('avoids interrupted lines and resolves live departure wait times and car position hints', () => {
    const chatelet = STATIONS.find((s) => s.name === 'Châtelet')!;
    const etoile = STATIONS.find((s) => s.name.includes('Étoile'))!;
    const line1 = LINES.find((l) => l.short_name === '1')!;
    expect(line1).toBeTruthy();

    const bypassed = computeTransitItineraries(
      {
        label: chatelet.name,
        coordinates: chatelet.coordinates,
        kind: 'station',
        station: chatelet,
      },
      {
        label: etoile.name,
        coordinates: etoile.coordinates,
        kind: 'station',
        station: etoile,
      },
      {
        stations: STATIONS,
        lines: LINES,
        ladders: LADDERS,
        trafficByLine: {
          [line1.id]: {
            lineId: line1.id,
            lineName: '1',
            status: 'interrupted',
            severity: 'alert',
            title: 'Interruption trafic Ligne 1',
            message: 'Trafic interrompu pour incident technique',
            updatedAt: new Date().toISOString(),
          },
        },
        getNextDepartures: () => [
          {
            tripId: 'test-m1-1',
            lineId: line1.id,
            lineShortName: '1',
            colorHex: line1.color,
            textColorHex: line1.text_color,
            direction: 0,
            destName: 'La Défense',
            arrivalSeconds: 40240,
            waitSeconds: 240,
            waitMinutes: 4,
            atStop: false,
            confidence: 'measured',
          },
        ],
      }
    );

    expect(bypassed.length).toBeGreaterThan(0);
    // Should reroute away from the interrupted Line 1 via an alternate connection (e.g., RER A or M14+M6)
    expect(bypassed[0].legs.some((leg) => leg.kind === 'ride' && leg.lineShortName !== '1')).toBe(
      true
    );

    // Multi-leg journey computes carPositionHint when transferring between lines
    const nation = STATIONS.find((s) => s.name === 'Nation')!;
    const rep = STATIONS.find((s) => s.name === 'République')!;
    const transferRoute = computeTransitItineraries(
      {
        label: nation.name,
        coordinates: nation.coordinates,
        kind: 'station',
        station: nation,
      },
      {
        label: rep.name,
        coordinates: rep.coordinates,
        kind: 'station',
        station: rep,
      },
      {
        stations: STATIONS,
        lines: LINES,
        ladders: LADDERS,
        getNextDepartures: (stationName) => [
          {
            tripId: 'test-m1-2',
            lineId: line1.id,
            lineShortName: '1',
            colorHex: line1.color,
            textColorHex: line1.text_color,
            direction: 0,
            destName: 'La Défense',
            arrivalSeconds: 40180,
            waitSeconds: stationName.includes('Nation') ? 180 : 120,
            waitMinutes: stationName.includes('Nation') ? 3 : 2,
            atStop: false,
            confidence: 'measured',
          },
        ],
      }
    );
    const firstRide = transferRoute[0]?.legs.find((l) => l.kind === 'ride');
    expect(firstRide).toBeTruthy();
    expect(firstRide?.carPositionHint).toMatch(/Avant|Milieu|Arrière/);
  });

  it('avoids lines specified in avoidLineIds and routes via alternate lines', () => {
    const chatelet = STATIONS.find((s) => s.name === 'Châtelet')!;
    const etoile = STATIONS.find((s) => s.name.includes('Étoile'))!;

    const routes = computeTransitItineraries(
      {
        label: chatelet.name,
        coordinates: chatelet.coordinates,
        kind: 'station',
        station: chatelet,
      },
      {
        label: etoile.name,
        coordinates: etoile.coordinates,
        kind: 'station',
        station: etoile,
      },
      {
        stations: STATIONS,
        lines: LINES,
        ladders: LADDERS,
        avoidLineIds: ['1'],
      }
    );

    expect(routes.length).toBeGreaterThan(0);
    for (const itinerary of routes) {
      const rideLegs = itinerary.legs.filter((l) => l.kind === 'ride');
      expect(rideLegs.length).toBeGreaterThan(0);
      expect(rideLegs.some((l) => l.lineShortName === '1')).toBe(false);
    }
  });

  it('routes via accessible Line 14 instead of shorter non-accessible lines when accessibleOnly is true', () => {
    const line14 = LINES.find((l) => l.short_name === '14')!;
    const line1 = LINES.find((l) => l.short_name === '1')!;
    const rerA = LINES.find((l) => l.short_name === 'A')!;
    expect(isLineWheelchairAccessible(line14)).toBe(true);
    expect(isLineWheelchairAccessible(rerA)).toBe(true);
    expect(isLineWheelchairAccessible(line1)).toBe(false);

    // Real GTFS graph: Mairie de Saint-Ouen -> Saint-Lazare is accessible via Line 14 (never Line 13)
    const mairieStOuen = STATIONS.find((s) => s.name === 'Mairie de Saint-Ouen')!;
    const saintLazare = STATIONS.find((s) => s.name === 'Saint-Lazare')!;
    const realAccessible = computeTransitItineraries(
      {
        label: mairieStOuen.name,
        coordinates: mairieStOuen.coordinates,
        kind: 'station',
        station: mairieStOuen,
      },
      {
        label: saintLazare.name,
        coordinates: saintLazare.coordinates,
        kind: 'station',
        station: saintLazare,
      },
      {
        stations: STATIONS,
        lines: LINES,
        ladders: LADDERS,
        accessibleOnly: true,
      }
    );
    expect(realAccessible.length).toBeGreaterThan(0);
    expect(realAccessible[0].legs.some((l) => l.kind === 'ride' && l.lineShortName === '14')).toBe(
      true
    );
    expect(realAccessible[0].legs.some((l) => l.kind === 'ride' && l.lineShortName === '13')).toBe(
      false
    );

    // Controlled synthetic graph where Line 1 is shorter than Line 14, verifying accessibleOnly picks Line 14
    const synthStations: StationMetadata[] = [
      {
        id: 'S1',
        name: 'Alpha',
        coordinates: [2.34, 48.86],
        lines: ['L1', 'L14'],
        is_hub: true,
        wheelchair_boarding: 1,
      },
      {
        id: 'S1M',
        name: 'Mid1',
        coordinates: [2.35, 48.86],
        lines: ['L1'],
        is_hub: false,
        wheelchair_boarding: 2,
      },
      {
        id: 'S2',
        name: 'Mid14',
        coordinates: [2.35, 48.862],
        lines: ['L14'],
        is_hub: false,
        wheelchair_boarding: 2,
      },
      {
        id: 'S3',
        name: 'Beta',
        coordinates: [2.36, 48.86],
        lines: ['L1', 'L14'],
        is_hub: true,
        wheelchair_boarding: 1,
      },
    ];
    const synthLines: LineMetadata[] = [
      {
        id: 'L1',
        short_name: '1',
        long_name: 'Ligne 1',
        color: '#FFBE00',
        text_color: '#111111',
        mode: 'metro',
        destinations: { '0': 'Beta', '1': 'Alpha' },
        measured_length_km: 1.5,
        elevation_offset: 0,
      },
      {
        id: 'L14',
        short_name: '14',
        long_name: 'Ligne 14',
        color: '#640082',
        text_color: '#FFFFFF',
        mode: 'metro',
        destinations: { '0': 'Beta', '1': 'Alpha' },
        measured_length_km: 3.6,
        elevation_offset: 0,
      },
    ];
    const synthLadders: Record<string, LineLadderData> = {
      L1: {
        id: 'L1',
        short_name: '1',
        color: '#FFBE00',
        text_color: '#111111',
        directions: {
          '0': {
            origin: 'Alpha',
            terminus: 'Beta',
            stations: [
              {
                id: 'S1',
                name: 'Alpha',
                coordinates: [2.34, 48.86],
                distance_m: 0,
                is_hub: true,
                transfers: [],
              },
              {
                id: 'S1M',
                name: 'Mid1',
                coordinates: [2.35, 48.86],
                distance_m: 750,
                is_hub: false,
                transfers: [],
              },
              {
                id: 'S3',
                name: 'Beta',
                coordinates: [2.36, 48.86],
                distance_m: 1500,
                is_hub: true,
                transfers: [],
              },
            ],
          },
        },
      },
      L14: {
        id: 'L14',
        short_name: '14',
        color: '#640082',
        text_color: '#FFFFFF',
        directions: {
          '0': {
            origin: 'Alpha',
            terminus: 'Beta',
            stations: [
              {
                id: 'S1',
                name: 'Alpha',
                coordinates: [2.34, 48.86],
                distance_m: 0,
                is_hub: true,
                transfers: [],
              },
              {
                id: 'S2',
                name: 'Mid14',
                coordinates: [2.35, 48.862],
                distance_m: 1800,
                is_hub: false,
                transfers: [],
              },
              {
                id: 'S3',
                name: 'Beta',
                coordinates: [2.36, 48.86],
                distance_m: 3600,
                is_hub: true,
                transfers: [],
              },
            ],
          },
        },
      },
    };

    const synthDefault = computeTransitItineraries(
      { label: 'Alpha', coordinates: [2.34, 48.86], kind: 'station', station: synthStations[0] },
      { label: 'Beta', coordinates: [2.36, 48.86], kind: 'station', station: synthStations[3] },
      { stations: synthStations, lines: synthLines, ladders: synthLadders }
    );
    expect(synthDefault[0].legs.find((l) => l.kind === 'ride')?.lineShortName).toBe('1');

    const synthAccessible = computeTransitItineraries(
      { label: 'Alpha', coordinates: [2.34, 48.86], kind: 'station', station: synthStations[0] },
      { label: 'Beta', coordinates: [2.36, 48.86], kind: 'station', station: synthStations[3] },
      { stations: synthStations, lines: synthLines, ladders: synthLadders, accessibleOnly: true }
    );
    expect(synthAccessible.length).toBeGreaterThan(0);
    expect(synthAccessible[0].legs.find((l) => l.kind === 'ride')?.lineShortName).toBe('14');
  });

  it('applies realistic hub transfer durations and walk distances at Montparnasse - Bienvenüe and Châtelet', () => {
    expect(PARIS_HUB_TRANSFER_SEC['montparnasse bienvenue']).toBe(420);
    expect(PARIS_HUB_TRANSFER_SEC['chatelet']).toBe(360);

    // Saint-Placide (M4) -> Cambronne (M6) transfers at Montparnasse Bienvenue
    const saintPlacide = STATIONS.find((s) => s.name === 'Saint-Placide')!;
    const cambronne = STATIONS.find((s) => s.name === 'Cambronne')!;
    const montparnasseRoutes = computeTransitItineraries(
      {
        label: saintPlacide.name,
        coordinates: saintPlacide.coordinates,
        kind: 'station',
        station: saintPlacide,
      },
      {
        label: cambronne.name,
        coordinates: cambronne.coordinates,
        kind: 'station',
        station: cambronne,
      },
      { stations: STATIONS, lines: LINES, ladders: LADDERS }
    );
    const mpTransfer = montparnasseRoutes[0]?.legs.find((l) => l.kind === 'transfer');
    expect(mpTransfer).toBeTruthy();
    expect(mpTransfer?.fromLabel).toContain('Montparnasse');
    expect(mpTransfer?.durationSec).toBe(420);
    expect(mpTransfer?.distanceM).toBeGreaterThanOrEqual(400);

    // Rambuteau (M11) -> Saint-Germain-des-Prés (M4) transfers at Châtelet
    const rambuteau = STATIONS.find((s) => s.name === 'Rambuteau')!;
    const stGermain = STATIONS.find((s) => s.name === 'Saint-Germain-des-Prés')!;
    const chateletRoutes = computeTransitItineraries(
      {
        label: rambuteau.name,
        coordinates: rambuteau.coordinates,
        kind: 'station',
        station: rambuteau,
      },
      {
        label: stGermain.name,
        coordinates: stGermain.coordinates,
        kind: 'station',
        station: stGermain,
      },
      { stations: STATIONS, lines: LINES, ladders: LADDERS }
    );
    const chTransfer = chateletRoutes[0]?.legs.find((l) => l.kind === 'transfer');
    expect(chTransfer).toBeTruthy();
    expect(chTransfer?.fromLabel).toBe('Châtelet');
    expect(chTransfer?.durationSec).toBe(360);
    expect(chTransfer?.distanceM).toBeGreaterThanOrEqual(330);
  });
});
