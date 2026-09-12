import { describe, it, expect } from 'vitest';
import {
  parseGeneralMessagesPayload,
  extractParisClosedStations,
  isParisMetroServiceHours,
  METRO_RER_LINES
} from '../netlify/functions/prim_relay';

describe('PRIM Relay Traffic Message Parser & Service Status Tests (Phase 6)', () => {
  it('initializes all 21 metro and RER lines as normal when payload is empty or null', () => {
    const traffic = parseGeneralMessagesPayload(null);
    expect(Object.keys(traffic).length).toBe(21);

    for (const line of METRO_RER_LINES) {
      const report = traffic[line.id];
      expect(report).toBeDefined();
      expect(report.status).toBe('normal');
      expect(report.severity).toBe('normal');
      expect(report.lineName).toBe(line.name);
      expect(report.message).toContain('Trafic fluide');
      expect(report.closedStations).toBeUndefined();

      if (line.mode === 'rail') {
        expect(report.title).toBe(`RER ${line.name}`);
      } else {
        expect(report.title).toBe(`Ligne ${line.name}`);
      }
    }
  });

  it('correctly parses an entire line interruption (no specific stations)', () => {
    const rawPayload = {
      Siri: {
        ServiceDelivery: {
          GeneralMessageDelivery: [
            {
              InfoMessage: [
                {
                  LineRef: { value: 'STIF:Line::C01371:' },
                  Content: {
                    value: "Trafic interrompu sur l'ensemble de la ligne 1 en raison d'une panne de signalisation."
                  },
                  MessageType: 'Perturbation',
                  Impact: 'Interruption',
                  RecordedAtTime: '2026-09-12T14:30:00Z'
                }
              ]
            }
          ]
        }
      }
    };

    const traffic = parseGeneralMessagesPayload(rawPayload);
    const line1 = traffic['IDFM:C01371'];

    expect(line1.status).toBe('interrupted');
    expect(line1.severity).toBe('alert');
    expect(line1.title).toBe('Ligne 1 (Interruption de service)');
    expect(line1.closedStations).toBeUndefined();

    // Other lines remain unaffected
    expect(traffic['IDFM:C01372'].status).toBe('normal');
    expect(traffic['IDFM:C01742'].status).toBe('normal');
  });

  it('detects partial line interruption and extracts closed stations between two points', () => {
    const rawPayload = {
      Siri: {
        ServiceDelivery: {
          GeneralMessageDelivery: [
            {
              InfoMessage: [
                {
                  LineRef: { value: 'STIF:Line::C01371:' },
                  Content: {
                    value: "Le trafic est interrompu entre Châtelet et Nation en raison d'un bagage abandonné."
                  },
                  Impact: 'Interruption',
                  RecordedAtTime: '2026-09-12T15:00:00Z'
                }
              ]
            }
          ]
        }
      }
    };

    const traffic = parseGeneralMessagesPayload(rawPayload);
    const line1 = traffic['IDFM:C01371'];

    expect(line1.status).toBe('interrupted');
    expect(line1.severity).toBe('alert');
    expect(line1.title).toBe('Ligne 1 (Interruption partielle)');
    expect(line1.closedStations).toBeDefined();
    expect(line1.closedStations).toContain('Châtelet');
    expect(line1.closedStations).toContain('Nation');
  });

  it('correctly parses RER interruption using rawId or line name', () => {
    const rawPayload = {
      Siri: {
        ServiceDelivery: {
          GeneralMessageDelivery: [
            {
              InfoMessage: [
                {
                  LineRef: { value: 'STIF:Line::C01742:' },
                  Content: {
                    value: "RER A : trafic interrompu entre La Défense et Nanterre-Préfecture suite à un obstacle."
                  },
                  RecordedAtTime: '2026-09-12T16:00:00Z'
                }
              ]
            }
          ]
        }
      }
    };

    const traffic = parseGeneralMessagesPayload(rawPayload);
    const rerA = traffic['IDFM:C01742'];

    expect(rerA.status).toBe('interrupted');
    expect(rerA.severity).toBe('alert');
    expect(rerA.title).toBe('RER A (Interruption partielle)');
    expect(rerA.closedStations).toBeDefined();
    expect(rerA.closedStations).toContain('La Défense');
    expect(rerA.closedStations).toContain('Nanterre-Préfecture');
  });

  it('correctly parses a line slowdown or disruption without interruption', () => {
    const rawPayload = {
      Siri: {
        ServiceDelivery: {
          GeneralMessageDelivery: [
            {
              InfoMessage: [
                {
                  LineRef: { value: 'STIF:Line::C01384:' },
                  Content: {
                    value: "Ligne 14 : trafic ralenti sur l'ensemble de la ligne en raison de travaux d'infrastructure."
                  },
                  Impact: 'Perturbation',
                  RecordedAtTime: '2026-09-12T17:00:00Z'
                }
              ]
            }
          ]
        }
      }
    };

    const traffic = parseGeneralMessagesPayload(rawPayload);
    const line14 = traffic['IDFM:C01384'];

    expect(line14.status).toBe('disrupted');
    expect(line14.severity).toBe('warning');
    expect(line14.title).toBe('Ligne 14 (Trafic perturbé)');
    expect(line14.closedStations).toBeUndefined();
  });

  it('preserves higher severity: an active interruption is never overwritten by a secondary disruption', () => {
    const rawPayload = {
      Siri: {
        ServiceDelivery: {
          GeneralMessageDelivery: [
            {
              InfoMessage: [
                {
                  LineRef: { value: 'STIF:Line::C01371:' },
                  Content: {
                    value: "Trafic interrompu entre Concorde et Bastille."
                  },
                  RecordedAtTime: '2026-09-12T18:00:00Z'
                },
                {
                  LineRef: { value: 'STIF:Line::C01371:' },
                  Content: {
                    value: "Rappel travaux : fermeture anticipée en soirée."
                  },
                  RecordedAtTime: '2026-09-12T18:05:00Z'
                }
              ]
            }
          ]
        }
      }
    };

    const traffic = parseGeneralMessagesPayload(rawPayload);
    const line1 = traffic['IDFM:C01371'];

    expect(line1.status).toBe('interrupted');
    expect(line1.severity).toBe('alert');
    expect(line1.closedStations).toContain('Concorde');
    expect(line1.closedStations).toContain('Bastille');
  });

  it('validates operating hours helper for Paris Metro (05:15 to 02:30)', () => {
    // 14:00 Paris time -> active
    const daytime = new Date('2026-09-15T12:00:00Z'); // 14:00 CEST
    expect(isParisMetroServiceHours(daytime)).toBe(true);

    // 03:30 Paris time -> night lull
    const night = new Date('2026-09-15T01:30:00Z'); // 03:30 CEST
    expect(isParisMetroServiceHours(night)).toBe(false);
  });
});
