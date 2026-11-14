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
});
