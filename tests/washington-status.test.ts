import { describe, it, expect, beforeEach } from 'vitest';
import { WashingtonRealtimeAdapter } from '../cities/washington/rt/washington_adapter';
import { washingtonConfig } from '../cities/washington/city.config';
import { parseWmataIncidents } from '../netlify/functions/washington_relay';
import type { WashingtonSnapshot, WashingtonTripUpdate } from '../cities/washington/rt/types';
import type { SchedTrip } from '@core/rt/rt_matching';
import type { RealtimeTickContext } from '@core/rt/adapter';

describe('Washington Realtime Adapter & Incident Status Tests (§5.3)', () => {
  let adapter: WashingtonRealtimeAdapter;

  beforeEach(() => {
    adapter = new WashingtonRealtimeAdapter(washingtonConfig.realtime);
  });

  it('initialise avec un trafic normal sur la ligne Red et un adaptateur inactif', () => {
    const status = adapter.getStatus();
    expect(status.active).toBe(false);
    expect(status.serviceStatus).toBe('active');

    const traffic = adapter.getTrafficByLine();
    expect(traffic['RED']).toBeUndefined(); // Pas encore de rapport avant premier snapshot
  });

  it('rejoue une réponse WMATA avec retard sur Red et remonte une perturbation (disrupted, warning)', () => {
    const incidentPayload = {
      Incidents: [
        {
          IncidentID: 'INC-RD-01',
          LinesAffected: 'RD;',
          Description: 'Red Line: Residual delays in both directions following an earlier signal problem outside Dupont Circle.',
          IncidentType: 'Delay',
          DateUpdated: '2026-10-12T14:30:00'
        }
      ]
    };

    const trafficReport = parseWmataIncidents(incidentPayload);

    const snapshot: WashingtonSnapshot = {
      producedAt: '2026-10-12T14:30:00Z',
      timestamp: 1791289800,
      validUntil: 1791289815,
      feedHealthy: true,
      serviceActive: true,
      serviceStatus: 'active',
      lastError: null,
      trains: [],
      tripUpdates: [],
      trafficByLine: trafficReport,
      stats: { totalEntitiesInFeed: 0, retainedEntities: 0, redCount: 0 }
    };

    adapter.client.injectSnapshot(snapshot);

    const traffic = adapter.getTrafficByLine();
    expect(traffic['RED']).toBeDefined();
    expect(traffic['RED'].status).toBe('disrupted');
    expect(traffic['RED'].severity).toBe('warning');
    expect(traffic['RED'].title).toBe('Red Line (Delays)');
    expect(traffic['RED'].message).toContain('Dupont Circle');
  });

  it('rejoue une réponse WMATA avec interruption de service sur Red (interrupted, alert)', () => {
    const incidentPayload = {
      Incidents: [
        {
          IncidentID: 'INC-RD-02',
          LinesAffected: 'RD;',
          Description: 'Red Line: Service suspended between Fort Totten and Silver Spring due to track maintenance.',
          IncidentType: 'Alert',
          DateUpdated: '2026-10-12T15:00:00'
        }
      ]
    };

    const trafficReport = parseWmataIncidents(incidentPayload);

    const snapshot: WashingtonSnapshot = {
      producedAt: '2026-10-12T15:00:00Z',
      timestamp: 1791291600,
      validUntil: 1791291615,
      feedHealthy: true,
      serviceActive: true,
      serviceStatus: 'active',
      lastError: null,
      trains: [],
      tripUpdates: [],
      trafficByLine: trafficReport,
      stats: { totalEntitiesInFeed: 0, retainedEntities: 0, redCount: 0 }
    };

    adapter.client.injectSnapshot(snapshot);

    const traffic = adapter.getTrafficByLine();
    expect(traffic['RED']).toBeDefined();
    expect(traffic['RED'].status).toBe('interrupted');
    expect(traffic['RED'].severity).toBe('alert');
    expect(traffic['RED'].title).toBe('Red Line (Service Interrupted)');
    expect(traffic['RED'].message).toContain('Service suspended');
  });

  it('règle §5.1 : une ligne n\'est JAMAIS déclarée interrompue par la simple absence de rames dans le flux', () => {
    // Flux complètement vide de rames (0 trip updates, 0 trains), mais aucun incident signalé
    const emptySnapshot: WashingtonSnapshot = {
      producedAt: '2026-10-12T14:00:00Z',
      timestamp: 1791288000,
      validUntil: 1791288015,
      feedHealthy: true,
      serviceActive: true,
      serviceStatus: 'active',
      lastError: null,
      trains: [],
      tripUpdates: [],
      trafficByLine: parseWmataIncidents({ Incidents: [] }),
      stats: { totalEntitiesInFeed: 0, retainedEntities: 0, redCount: 0 }
    };

    adapter.client.injectSnapshot(emptySnapshot);

    const traffic = adapter.getTrafficByLine();
    expect(traffic['RED']).toBeDefined();
    expect(traffic['RED'].status).toBe('normal');
    expect(traffic['RED'].severity).toBe('normal');
    expect(traffic['RED'].message).toBe('Normal service');
  });

  it('bascule silencieusement en mode théorique lorsque le flux est indisponible (429/401/erreur 5xx)', () => {
    const unavailableSnapshot: WashingtonSnapshot = {
      producedAt: '2026-10-12T14:00:00Z',
      timestamp: 1791288000,
      validUntil: 1791288015,
      feedHealthy: false,
      serviceActive: false,
      serviceStatus: 'unavailable',
      lastError: 'WMATA API Rate Limit exceeded (429)',
      trains: [],
      tripUpdates: [],
      trafficByLine: {
        RED: {
          lineId: 'RED',
          lineName: 'Red Line',
          status: 'normal',
          severity: 'normal',
          title: 'Red Line',
          message: 'Realtime unavailable - theoretical timetable active',
          updatedAt: '2026-10-12T14:00:00Z'
        }
      },
      stats: { totalEntitiesInFeed: 0, retainedEntities: 0, redCount: 0 }
    };

    adapter.client.injectSnapshot(unavailableSnapshot);

    const status = adapter.getStatus();
    expect(status.feedHealthy).toBe(false);
    expect(status.serviceActive).toBe(false);
    expect(status.serviceStatus).toBe('unavailable');

    // Vérifier qu'un appel applyTick ne lève aucune exception et préserve le mode théorique
    const mockSchedTrip: SchedTrip = {
      tripId: '6573091_20121',
      lineId: 'RED',
      dir: 1,
      shapeId: 'RRED_16',
      stops: [
        { stopId: 'metro-center', arr: 30600, dep: 30620, dist: 0 },
        { stopId: 'gallery-place', arr: 30680, dep: 30700, dist: 500 }
      ]
    };

    const timelines = new Map();
    const ctx: RealtimeTickContext = {
      now: new Date('2026-10-06T12:30:00Z'),
      civilSeconds: 30600,
      activeSchedTrips: [mockSchedTrip],
      schedTripsById: new Map([[mockSchedTrip.tripId, mockSchedTrip]]),
      timelines
    };

    // applyTick s'exécute sans erreur et n'écrase pas la timeline
    expect(() => adapter.applyTick(ctx)).not.toThrow();
    expect(timelines.size).toBe(0); // Timelines restent au théorique pur
  });

  it('recale la chronologie d\'une course sur prédiction d\'arrivée lorsque la confiance est mesurée', () => {
    const tu: WashingtonTripUpdate = {
      id: 'TU_1',
      trip: {
        tripId: '6573091_20121',
        routeId: 'RED',
        directionId: 1
      },
      timestamp: 1791289800,
      delay: 35,
      stopTimeUpdates: [
        {
          stopSequence: 1,
          stopId: 'PF_A01_1', // Metro Center
          arrival: { time: 30645, delay: 45 },
          departure: { time: 30665, delay: 45 }
        }
      ]
    };

    const snapshot: WashingtonSnapshot = {
      producedAt: '2026-10-06T12:30:00Z',
      timestamp: 1791289800,
      validUntil: 1791289815,
      feedHealthy: true,
      serviceActive: true,
      serviceStatus: 'active',
      lastError: null,
      trains: [],
      tripUpdates: [tu],
      trafficByLine: {},
      stats: { totalEntitiesInFeed: 1, retainedEntities: 1, redCount: 1 }
    };

    adapter.client.injectSnapshot(snapshot);

    const mockSchedTrip: SchedTrip = {
      tripId: '6573091_20121',
      lineId: 'RED',
      dir: 1,
      shapeId: 'RRED_16',
      stops: [
        { stopId: 'metro center', arr: 30600, dep: 30620, dist: 0 },
        { stopId: 'gallery place', arr: 30680, dep: 30700, dist: 500 }
      ]
    };

    const timelines = new Map();
    const ctx: RealtimeTickContext = {
      now: new Date('2026-10-06T12:30:00Z'),
      civilSeconds: 30600,
      activeSchedTrips: [mockSchedTrip],
      schedTripsById: new Map([[mockSchedTrip.tripId, mockSchedTrip]]),
      timelines
    };

    adapter.applyTick(ctx);

    expect(timelines.has('6573091_20121')).toBe(true);
    const tl = timelines.get('6573091_20121');
    expect(tl.stops).toHaveLength(2);
    expect(tl.measuredCount).toBe(1);
    expect(tl.stops[0].stopId).toBe('metro center');
    expect(tl.stops[0].measured).toBe(true);
    expect(tl.stops[0].cArr).toBe(30645); // 30600 + 45s
  });
});
