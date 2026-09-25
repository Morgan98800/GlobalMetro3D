import { describe, it, expect } from 'vitest';
import {
  parseTflLineStatuses,
  parseTflArrivals,
  isLondonTubeServiceHours,
  normalizeStationId,
  cleanVehicleId,
  TFL_TUBE_LINE_IDS
} from '../netlify/functions/tfl_relay';

describe('TfL Relay & Live Feed Unit Tests (Phase 4)', () => {
  describe('Line Status Parsing', () => {
    it('initializes all 11 Tube lines as normal when payload is empty or null', () => {
      const reports = parseTflLineStatuses(null);
      expect(Object.keys(reports).sort()).toEqual([...TFL_TUBE_LINE_IDS].sort());

      for (const id of TFL_TUBE_LINE_IDS) {
        expect(reports[id].status).toBe('normal');
        expect(reports[id].severity).toBe('normal');
        expect(reports[id].message).toBe('Good Service');
      }
    });

    it('correctly parses Good Service across lines', () => {
      const payload = [
        {
          id: 'victoria',
          lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: 'Good Service' }]
        },
        {
          id: 'central',
          lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: 'Good Service' }]
        }
      ];

      const reports = parseTflLineStatuses(payload);
      expect(reports['victoria'].status).toBe('normal');
      expect(reports['victoria'].message).toBe('Good Service');
      expect(reports['central'].status).toBe('normal');
    });

    it('correctly parses Minor Delays (disrupted, warning)', () => {
      const payload = [
        {
          id: 'bakerloo',
          lineStatuses: [
            {
              statusSeverity: 9,
              statusSeverityDescription: 'Minor Delays',
              reason: 'Minor delays due to an earlier customer incident at Waterloo.'
            }
          ]
        }
      ];

      const reports = parseTflLineStatuses(payload);
      expect(reports['bakerloo'].status).toBe('disrupted');
      expect(reports['bakerloo'].severity).toBe('warning');
      expect(reports['bakerloo'].title).toBe('Minor Delays');
      expect(reports['bakerloo'].message).toContain('Waterloo');
    });

    it('correctly parses Severe Delays (disrupted, alert)', () => {
      const payload = [
        {
          id: 'piccadilly',
          lineStatuses: [
            {
              statusSeverity: 6,
              statusSeverityDescription: 'Severe Delays',
              reason: 'Severe delays between Acton Town and Heathrow Airport due to signal failure.'
            }
          ]
        }
      ];

      const reports = parseTflLineStatuses(payload);
      expect(reports['piccadilly'].status).toBe('disrupted');
      expect(reports['piccadilly'].severity).toBe('alert');
      expect(reports['piccadilly'].title).toBe('Severe Delays');
      expect(reports['piccadilly'].message).toContain('signal failure');
    });

    it('correctly parses Part Suspended and Suspended (interrupted, alert)', () => {
      const payload = [
        {
          id: 'district',
          lineStatuses: [
            {
              statusSeverity: 5,
              statusSeverityDescription: 'Part Suspended',
              reason: 'No service between Turnham Green and Richmond while we fix a track fault.'
            }
          ]
        },
        {
          id: 'circle',
          lineStatuses: [
            {
              statusSeverity: 1,
              statusSeverityDescription: 'Suspended',
              reason: 'Entire line suspended due to power failure.'
            }
          ]
        }
      ];

      const reports = parseTflLineStatuses(payload);
      expect(reports['district'].status).toBe('interrupted');
      expect(reports['district'].severity).toBe('alert');
      expect(reports['district'].title).toBe('Part Suspended');

      expect(reports['circle'].status).toBe('interrupted');
      expect(reports['circle'].severity).toBe('alert');
      expect(reports['circle'].title).toBe('Suspended');
    });
  });

  describe('Arrival Predictions Parsing', () => {
    it('extracts and normalizes live predictions', () => {
      const rawArrivals = [
        {
          id: '12345',
          vehicleId: '224',
          naptanId: '9400ZZLUOXC1',
          stationName: 'Oxford Circus Underground Station',
          lineId: 'victoria',
          timeToStation: 120,
          expectedArrival: '2026-09-25T11:00:00Z',
          direction: 'inbound',
          destinationNaptanId: '9400ZZLUBXN1',
          destinationName: 'Brixton Underground Station',
          currentLocation: 'Between Warren Street and Oxford Circus'
        },
        {
          id: '67890',
          vehicleId: '042',
          naptanId: '940GZZLU991', // Battersea Power Station
          stationName: 'Battersea Power Station Underground Station',
          lineId: 'northern',
          timeToStation: 60,
          expectedArrival: '2026-09-25T10:59:00Z',
          direction: 'outbound'
        }
      ];

      const parsed = parseTflArrivals(rawArrivals);
      expect(parsed.length).toBe(2);

      // Verify sorting by timeToStation
      expect(parsed[0].vehicleId).toBe('042');
      expect(parsed[0].timeToStation).toBe(60);
      expect(parsed[0].stationId).toBe('940GZZLU991');

      expect(parsed[1].vehicleId).toBe('224');
      expect(parsed[1].timeToStation).toBe(120);
      expect(parsed[1].stationId).toBe('940GZZLUOXC');
      expect(parsed[1].destinationStationId).toBe('940GZZLUBXN');
      expect(parsed[1].currentLocation).toBe('Between Warren Street and Oxford Circus');
    });

    it('filters out non-tube lines and invalid entries', () => {
      const rawArrivals = [
        {
          vehicleId: '101',
          lineId: 'london-overground',
          naptanId: '910GSHMPSTD',
          timeToStation: 90
        },
        {
          vehicleId: '555',
          lineId: 'victoria',
          naptanId: '',
          timeToStation: 30
        }
      ];

      const parsed = parseTflArrivals(rawArrivals);
      expect(parsed.length).toBe(0);
    });
  });

  describe('Service Hours & Night Tube', () => {
    it('detects day service as active', () => {
      // Tuesday 14:00 London time
      const date = new Date('2026-09-22T13:00:00Z'); // 14:00 BST
      expect(isLondonTubeServiceHours(date)).toBe(true);
    });

    it('detects weekday night lull as closed', () => {
      // Wednesday 03:00 London time (02:00 UTC)
      const date = new Date('2026-09-23T02:00:00Z');
      expect(isLondonTubeServiceHours(date)).toBe(false);
    });

    it('detects Saturday night / Sunday morning as active (Night Tube)', () => {
      // Sunday 03:00 London time (02:00 UTC) - Saturday night Night Tube
      const date = new Date('2026-09-27T02:00:00Z');
      expect(isLondonTubeServiceHours(date)).toBe(true);
    });
  });

  describe('Station & Vehicle Normalization', () => {
    it('normalizes NaPTAN platform IDs to station base IDs', () => {
      expect(normalizeStationId('9400ZZLUOXC1')).toBe('940GZZLUOXC');
      expect(normalizeStationId('9400ZZLUBXN2')).toBe('940GZZLUBXN');
      expect(normalizeStationId('9400ZZBPSUST')).toBe('940GZZLU991');
      expect(normalizeStationId('9400ZZNEUGST')).toBe('940GZZLU990');
      expect(normalizeStationId('940GZZLUVIC')).toBe('940GZZLUVIC');
    });

    it('cleans vehicle IDs properly', () => {
      expect(cleanVehicleId(' 224 ')).toBe('224');
      expect(cleanVehicleId('0')).toBe(null);
      expect(cleanVehicleId('')).toBe(null);
      expect(cleanVehicleId(null)).toBe(null);
      expect(cleanVehicleId('undefined')).toBe(null);
    });
  });
});
