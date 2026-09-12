import { describe, it, expect } from 'vitest';
import {
  parseStmEtatService,
  extractClosedStations,
  isMontrealMetroServiceHours,
  MONTREAL_METRO_LINES,
  MONTREAL_STATIONS
} from '../netlify/functions/stm_relay';

describe('STM Relay Unit Tests (Phase 5)', () => {
  it('initializes all 4 metro lines as normal when payload is empty or null', () => {
    const reports = parseStmEtatService(null);
    expect(Object.keys(reports)).toEqual(['1', '2', '4', '5']);

    for (const id of ['1', '2', '4', '5']) {
      expect(reports[id].status).toBe('normal');
      expect(reports[id].severity).toBe('normal');
      expect(reports[id].message).toContain('Service normal');
      expect(reports[id].closedStations).toBeUndefined();
    }
  });

  it('correctly parses an entire line interruption (no specific stations)', () => {
    const raw = {
      messages: [
        {
          ligne: '1',
          titre: 'Ligne 1 Verte',
          texte: 'Interruption de service sur l\'ensemble de la ligne en raison d\'un problème technique.',
          date: '2026-09-12T14:30:00Z'
        }
      ]
    };

    const reports = parseStmEtatService(raw);
    expect(reports['1'].status).toBe('interrupted');
    expect(reports['1'].severity).toBe('alert');
    expect(reports['1'].title).toContain('Interruption de service');
    expect(reports['1'].closedStations).toBeUndefined();

    // Other lines remain normal
    expect(reports['2'].status).toBe('normal');
    expect(reports['4'].status).toBe('normal');
    expect(reports['5'].status).toBe('normal');
  });

  it('detects partial line interruption and extracts closed stations', () => {
    const raw = [
      {
        ligne: '2',
        titre: 'Ligne 2 Orange',
        texte: 'Interruption de service entre les stations Berri-UQAM et Henri-Bourassa.',
        date: '2026-09-12T15:00:00Z'
      }
    ];

    const reports = parseStmEtatService(raw);
    expect(reports['2'].status).toBe('interrupted');
    expect(reports['2'].severity).toBe('alert');
    expect(reports['2'].title).toContain('Interruption partielle');
    expect(reports['2'].closedStations).toBeDefined();
    expect(reports['2'].closedStations).toContain('Berri-UQAM');
    expect(reports['2'].closedStations).toContain('Henri-Bourassa');
  });

  it('correctly parses a service slowdown / disruption', () => {
    const raw = {
      data: [
        {
          route_id: '4',
          title: 'Ligne 4 Jaune',
          message: 'Ralentissement de service en raison d\'une vérification technique.',
          updatedAt: '2026-09-12T16:00:00Z'
        }
      ]
    };

    const reports = parseStmEtatService(raw);
    expect(reports['4'].status).toBe('disrupted');
    expect(reports['4'].severity).toBe('warning');
    expect(reports['4'].title).toContain('Ralentissement');
    expect(reports['4'].closedStations).toBeUndefined();
  });

  it('ignores bus and elevator messages that do not pertain to metro lines', () => {
    const raw = {
      messages: [
        {
          ligne: '105',
          titre: 'Bus 105 Sherbrooke',
          texte: 'Détour en cours via Avenue De Maisonneuve.'
        },
        {
          titre: 'Ascenseur Jean-Talon',
          texte: 'Ascenseur temporairement hors service.'
        }
      ]
    };

    const reports = parseStmEtatService(raw);
    for (const id of ['1', '2', '4', '5']) {
      expect(reports[id].status).toBe('normal');
    }
  });

  it('correctly evaluates operating hours in Montreal timezone', () => {
    // 14:00 Montreal time (operating)
    const dayDate = new Date('2026-09-15T18:00:00Z'); // 14:00 EDT
    expect(isMontrealMetroServiceHours(dayDate)).toBe(true);

    // 03:30 Montreal time (night lull)
    const nightDate = new Date('2026-09-15T07:30:00Z'); // 03:30 EDT
    expect(isMontrealMetroServiceHours(nightDate)).toBe(false);
  });

  it('guarantees that API keys are never leaked into traffic reports or payloads', () => {
    const raw = {
      messages: [
        {
          ligne: '1',
          texte: 'Service normal',
          secret: 'SUPER_SECRET_STM_KEY_12345'
        }
      ]
    };

    const reports = parseStmEtatService(raw);
    const jsonStr = JSON.stringify(reports);
    expect(jsonStr).not.toContain('SUPER_SECRET_STM_KEY_12345');
    expect(jsonStr).not.toContain('secret');
  });
});
