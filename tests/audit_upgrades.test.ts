import { describe, expect, it } from 'vitest';
import { buildStopTripsIndex, computeStationDepartures } from '@core/sim/browser_engine';
import type { TripData } from '@core/sim/kinematics';
import { PARIS_INTERCHANGE_CLUSTERS } from '@core/ui/utils/transit_router';
import { resolveStationArchetype } from '../web/src/ride/station_architectures';

describe('Audit Phase 1–4 upgrades', () => {
  it('computes identical departures using the O(1) stopTripsIndex vs fallback full scan', () => {
    const trips: TripData[] = [
      {
        id: 't1',
        line: 'L1',
        dir: 0,
        shapeId: 's1',
        t0: 30000,
        t1: 30600,
        destName: 'Château de Vincennes',
        stops: [
          [30000, 30020, 0, 'Concorde'],
          [30180, 30200, 1200, 'Châtelet'],
          [30600, 30620, 3400, 'Bastille'],
        ],
      },
      {
        id: 't2',
        line: 'L4',
        dir: 1,
        shapeId: 's4',
        t0: 30050,
        t1: 30550,
        destName: 'Porte de Clignancourt',
        stops: [
          [30050, 30070, 0, 'Odéon'],
          [30250, 30270, 1100, 'Châtelet'],
          [30550, 30570, 2900, 'Gare du Nord'],
        ],
      },
    ];
    const linesMap = new Map([
      [
        'L1',
        {
          id: 'L1',
          short_name: '1',
          long_name: 'Ligne 1',
          mode: 'metro' as const,
          color: '#FFCD00',
          text_color: '#111111',
          destinations: { '0': 'Château de Vincennes', '1': 'La Défense' },
          measured_length_km: 16.5,
          elevation_offset: -6,
        },
      ],
      [
        'L4',
        {
          id: 'L4',
          short_name: '4',
          long_name: 'Ligne 4',
          mode: 'metro' as const,
          color: '#CF009E',
          text_color: '#FFFFFF',
          destinations: { '0': 'Bagneux', '1': 'Porte de Clignancourt' },
          measured_length_km: 14.0,
          elevation_offset: -9,
        },
      ],
    ]);

    const index = buildStopTripsIndex(trips);
    const viaScan = computeStationDepartures({
      stationName: 'Châtelet',
      trips,
      linesMap,
      serviceSecondsCandidates: [30060],
    });
    const viaIndex = computeStationDepartures({
      stationName: 'Châtelet',
      trips,
      linesMap,
      serviceSecondsCandidates: [30060],
      stopTripsIndex: index,
    });

    expect(viaIndex).toEqual(viaScan);
    expect(viaIndex).toHaveLength(2);
    expect(viaIndex[0].lineShortName).toBe('1');
    expect(viaIndex[0].waitSeconds).toBe(120);
  });

  it('maps iconic Paris stations to their architectural archetypes', () => {
    expect(resolveStationArchetype('Arts et Métiers', '11')).toBe('arts_et_metiers');
    expect(resolveStationArchetype('Louvre – Rivoli', '1')).toBe('louvre_rivoli');
    expect(resolveStationArchetype('Cité', '4')).toBe('cathedral');
    expect(resolveStationArchetype('Auber', 'A')).toBe('cathedral');
    expect(resolveStationArchetype('Odéon', '4')).toBe('faience');
  });

  it('defines Paris mega-hub interchange clusters', () => {
    expect(PARIS_INTERCHANGE_CLUSTERS.some((c) => c.names.includes('saint lazare'))).toBe(true);
    expect(PARIS_INTERCHANGE_CLUSTERS.some((c) => c.names.includes('chatelet les halles'))).toBe(
      true
    );
  });
});
