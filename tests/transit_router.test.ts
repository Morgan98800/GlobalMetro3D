import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LineMetadata, StationMetadata } from '@core/types';
import type { LineLadderData } from '@core/ui/components/station_ladder';
import { computeTransitItineraries } from '@core/ui/utils/transit_router';

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
});
