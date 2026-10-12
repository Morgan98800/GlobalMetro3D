import { describe, it, expect, beforeEach } from 'vitest';
import Pbf from 'pbf';
import {
  decodeGtfsRtTripUpdates,
  decodeGtfsRtVehiclePositions,
  parseWmataIncidents,
  parseWmataStationPredictions,
  buildSnapshotFromPredictions,
  mergeWmataRt,
  getOrFetchWashingtonSnapshot,
  resetWashingtonCache,
  handler,
  CACHE_TTL_SEC,
  type WmataFetcher
} from '../netlify/functions/washington_relay';

// Utilitaires de création de buffers Protobuf GTFS-RT pour les tests
function createDummyTripUpdatesFeed(
  trips: Array<{
    id: string;
    routeId: string;
    tripId: string;
    stops: Array<{ seq: number; stopId: string; time: number }>;
  }>
): Buffer {
  const pbf = new Pbf();

  for (const ent of trips) {
    const innerPbf = new Pbf();
    innerPbf.writeStringField(1, ent.id);

    // TripUpdate (field 3)
    const tuPbf = new Pbf();
    // TripDescriptor (field 1)
    const tdPbf = new Pbf();
    tdPbf.writeStringField(1, ent.tripId);
    tdPbf.writeStringField(5, ent.routeId);
    tuPbf.writeBytesField(1, tdPbf.finish());

    // StopTimeUpdates (field 2)
    for (const st of ent.stops) {
      const stuPbf = new Pbf();
      stuPbf.writeVarintField(1, st.seq);
      stuPbf.writeStringField(4, st.stopId);
      const evPbf = new Pbf();
      evPbf.writeVarintField(2, st.time);
      stuPbf.writeBytesField(2, evPbf.finish());
      tuPbf.writeBytesField(2, stuPbf.finish());
    }

    innerPbf.writeBytesField(3, tuPbf.finish());
    pbf.writeBytesField(2, innerPbf.finish());
  }

  return Buffer.from(pbf.finish());
}

function createDummyVehiclePositionsFeed(
  vehicles: Array<{
    id: string;
    tripId: string;
    routeId: string;
    vehicleId: string;
    carCountStr: string;
    lat: number;
    lng: number;
  }>
): Buffer {
  const pbf = new Pbf();

  for (const v of vehicles) {
    const innerPbf = new Pbf();
    innerPbf.writeStringField(1, v.id);

    // VehiclePosition (field 4)
    const vpPbf = new Pbf();

    // TripDescriptor (field 1)
    const tdPbf = new Pbf();
    tdPbf.writeStringField(1, v.tripId);
    tdPbf.writeStringField(5, v.routeId);
    vpPbf.writeBytesField(1, tdPbf.finish());

    // Position (field 2)
    const posPbf = new Pbf();
    posPbf.writeFloatField(1, v.lat);
    posPbf.writeFloatField(2, v.lng);
    vpPbf.writeBytesField(2, posPbf.finish());

    // VehicleDescriptor (field 8)
    const vdPbf = new Pbf();
    vdPbf.writeStringField(1, v.vehicleId);
    vdPbf.writeStringField(3, v.carCountStr);
    vpPbf.writeBytesField(8, vdPbf.finish());

    innerPbf.writeBytesField(4, vpPbf.finish());
    pbf.writeBytesField(2, innerPbf.finish());
  }

  return Buffer.from(pbf.finish());
}

describe('Relais Netlify washington_relay (Porte 3)', () => {
  beforeEach(() => {
    resetWashingtonCache();
  });

  describe('Décodage Protobuf GTFS-RT', () => {
    it('décode les TripUpdates et ne conserve que la ligne Red (RD / RED)', () => {
      const feed = createDummyTripUpdatesFeed([
        { id: '1', routeId: 'RD', tripId: '6573091_20121', stops: [{ seq: 1, stopId: 'PF_A01_1', time: 1791289800 }] },
        { id: '2', routeId: 'RED', tripId: '6573100_20121', stops: [{ seq: 1, stopId: 'PF_B01_2', time: 1791289860 }] },
        { id: '3', routeId: 'BL', tripId: '9999001', stops: [{ seq: 1, stopId: 'PF_C01_1', time: 1791289900 }] },
        { id: '4', routeId: 'OR', tripId: '9999002', stops: [{ seq: 1, stopId: 'PF_K01_1', time: 1791289950 }] },
      ]);

      const { totalEntities, filteredUpdates } = decodeGtfsRtTripUpdates(feed);
      expect(totalEntities).toBe(4);
      expect(filteredUpdates).toHaveLength(2);
      expect(filteredUpdates.map((u) => u.trip.tripId)).toEqual(['6573091_20121', '6573100_20121']);
    });

    it('décode les VehiclePositions et extrait les coordonnées et le carCount', () => {
      const feed = createDummyVehiclePositionsFeed([
        {
          id: 'VP_1',
          tripId: '6573091_20121',
          routeId: 'RD',
          vehicleId: '7042',
          carCountStr: '8',
          lat: 38.9072,
          lng: -77.0369
        }
      ]);

      const { totalEntities, filteredPositions } = decodeGtfsRtVehiclePositions(feed);
      expect(totalEntities).toBe(1);
      expect(filteredPositions).toHaveLength(1);
      expect(filteredPositions[0].vehicle?.id).toBe('7042');
      expect(filteredPositions[0].vehicle?.licensePlate).toBe('8');
      expect(filteredPositions[0].position?.latitude).toBeCloseTo(38.9072, 3);
      expect(filteredPositions[0].position?.longitude).toBeCloseTo(-77.0369, 3);
    });
  });

  describe('Analyseur des Incidents WMATA & Statut des Lignes', () => {
    it('initialise la ligne Red à normal quand le payload est vide ou sans incident', () => {
      const traffic = parseWmataIncidents(null);
      expect(traffic['RED']).toBeDefined();
      expect(traffic['RED'].status).toBe('normal');
      expect(traffic['RED'].severity).toBe('normal');
      expect(traffic['RED'].message).toBe('Normal service');
    });

    it('ignore les incidents qui ne concernent pas la ligne Red', () => {
      const payload = {
        Incidents: [
          {
            IncidentID: 'INC-1',
            LinesAffected: 'BL; OR;',
            Description: 'Blue Line: Single tracking between Rosslyn and Foggy Bottom due to track work.',
            IncidentType: 'Delay'
          }
        ]
      };

      const traffic = parseWmataIncidents(payload);
      expect(traffic['RED'].status).toBe('normal');
      expect(traffic['RED'].severity).toBe('normal');
    });

    it('détecte un retard (disrupted, warning) sur la ligne Red', () => {
      const payload = {
        Incidents: [
          {
            IncidentID: 'INC-2',
            LinesAffected: 'RD;',
            Description: 'Red Line: Expect delays in both directions due to a signal problem outside Dupont Circle.',
            IncidentType: 'Delay',
            DateUpdated: '2026-10-12T10:15:00'
          }
        ]
      };

      const traffic = parseWmataIncidents(payload);
      expect(traffic['RED'].status).toBe('disrupted');
      expect(traffic['RED'].severity).toBe('warning');
      expect(traffic['RED'].title).toBe('Red Line (Delays)');
      expect(traffic['RED'].message).toContain('Dupont Circle');
    });

    it('détecte une interruption de service (interrupted, alert) sur la ligne Red', () => {
      const payload = {
        Incidents: [
          {
            IncidentID: 'INC-3',
            LinesAffected: 'RD;',
            Description: 'Red Line: Service suspended between Metro Center and Gallery Place due to emergency personnel on tracks.',
            IncidentType: 'Alert',
            DateUpdated: '2026-10-12T11:00:00'
          }
        ]
      };

      const traffic = parseWmataIncidents(payload);
      expect(traffic['RED'].status).toBe('interrupted');
      expect(traffic['RED'].severity).toBe('alert');
      expect(traffic['RED'].title).toBe('Red Line (Service Interrupted)');
      expect(traffic['RED'].message).toContain('Service suspended');
    });
  });

  describe('Protection du Quota sous Rafale de Requêtes (§5.1)', () => {
    it('coalesce 50 appels simultanés en exactement 1 appel sortant WMATA', async () => {
      let wmataCalls = 0;
      const dummyTu = createDummyTripUpdatesFeed([
        { id: '1', routeId: 'RD', tripId: '6573091_20121', stops: [{ seq: 1, stopId: 'PF_A01_1', time: 1791289800 }] }
      ]);
      const dummyVp = createDummyVehiclePositionsFeed([
        { id: '1', tripId: '6573091_20121', routeId: 'RD', vehicleId: '7042', carCountStr: '8', lat: 38.9, lng: -77.0 }
      ]);

      const mockFetcher: WmataFetcher = async (endpoint) => {
        if (endpoint === 'tripupdates') {
          wmataCalls++;
          // Simuler une latence réseau de 25ms
          await new Promise((r) => setTimeout(r, 25));
          return { statusCode: 200, data: dummyTu };
        }
        if (endpoint === 'vehiclepositions') return { statusCode: 200, data: dummyVp };
        return { statusCode: 200, data: JSON.stringify({ Incidents: [] }) };
      };

      const burstSize = 50;
      const now = Date.now();
      const promises = Array.from({ length: burstSize }, () =>
        getOrFetchWashingtonSnapshot('test-key', now, mockFetcher)
      );

      const results = await Promise.all(promises);

      // Preuve mathématique : 50 requêtes concurrentes = 1 seul cycle vers WMATA
      expect(wmataCalls).toBe(1);
      expect(results).toHaveLength(burstSize);
      for (const res of results) {
        expect(res.snapshot.feedHealthy).toBe(true);
        expect(res.snapshot.trains).toHaveLength(1);
        expect(res.snapshot.trains[0].carCount).toBe(8);
      }

      // Une seconde vague de requêtes dans la fenêtre du cache (ex: 5s plus tard) ne déclenche aucun appel
      const secondWave = await Promise.all(
        Array.from({ length: 20 }, () =>
          getOrFetchWashingtonSnapshot('test-key', now + 5000, mockFetcher)
        )
      );
      expect(wmataCalls).toBe(1);
      for (const res of secondWave) {
        expect(res.fromCache).toBe(true);
      }
    });
  });

  describe('Repli Gracieux en Mode Théorique sur 429/401/Erreurs Réseau (§5.1)', () => {
    it('intercepte une réponse WMATA 429 (Rate Limit) et bascule en mode théorique avec statut indisponible', async () => {
      const mock429Fetcher: WmataFetcher = async () => ({
        statusCode: 429,
        error: 'Too Many Requests'
      });

      const res = await getOrFetchWashingtonSnapshot('test-key', Date.now(), mock429Fetcher);
      expect(res.snapshot.feedHealthy).toBe(false);
      expect(res.snapshot.serviceActive).toBe(false);
      expect(res.snapshot.serviceStatus).toBe('unavailable');
      expect(res.snapshot.lastError).toContain('429');
      // La ligne Red conserve son statut normal pour ne pas paniquer le moteur
      expect(res.snapshot.trafficByLine['RED'].status).toBe('normal');
    });

    it('intercepte une réponse WMATA 401 (Unauthorized) et bascule en mode théorique sans crash', async () => {
      const mock401Fetcher: WmataFetcher = async () => ({
        statusCode: 401,
        error: 'Access Denied'
      });

      const res = await getOrFetchWashingtonSnapshot('invalid-key', Date.now(), mock401Fetcher);
      expect(res.snapshot.feedHealthy).toBe(false);
      expect(res.snapshot.serviceActive).toBe(false);
      expect(res.snapshot.serviceStatus).toBe('unavailable');
      expect(res.snapshot.lastError).toContain('401');
    });

    it('intercepte une erreur réseau 500 / Timeout et renvoie HTTP 200 indisponible au client', async () => {
      const mock500Fetcher: WmataFetcher = async () => ({
        statusCode: 500,
        error: 'Internal Server Error'
      });

      const res = await getOrFetchWashingtonSnapshot('test-key', Date.now(), mock500Fetcher);
      expect(res.snapshot.feedHealthy).toBe(false);
      expect(res.snapshot.serviceStatus).toBe('unavailable');
    });
  });

  describe('Comportement par Défaut sans Clé API (Fixture Fallback)', () => {
    it('renvoie la fixture réaliste avec x-wmata-fixture: true quand aucune clé n\'est configurée', async () => {
      delete process.env.WMATA_API_KEY;
      resetWashingtonCache();

      const response = await handler();
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-wmata-fixture']).toBe('true');
      expect(response.headers['Cache-Control']).toContain(`s-maxage=${CACHE_TTL_SEC}`);
      expect(response.headers['Netlify-CDN-Cache-Control']).toBe(`public, s-maxage=${CACHE_TTL_SEC}`);

      const data = JSON.parse(response.body);
      expect(data.feedHealthy).toBe(true);
      expect(data.trains.length).toBeGreaterThan(0);
      expect(data.trafficByLine['RED']).toBeDefined();
    });
  });

  describe('Support WMATA Real-Time Rail Predictions (StationPrediction.svc / GetPrediction)', () => {
    const samplePredictionsPayload = {
      Trains: [
        {
          Car: '6',
          Destination: 'SilvrSpg',
          DestinationCode: 'B08',
          DestinationName: 'Silver Spring',
          Group: '1',
          Line: 'RD',
          LocationCode: 'A01',
          LocationName: 'Metro Center',
          Min: '3'
        },
        {
          Car: '8',
          Destination: 'Glenmont',
          DestinationCode: 'B11',
          DestinationName: 'Glenmont',
          Group: '1',
          Line: 'RD',
          LocationCode: 'A01',
          LocationName: 'Metro Center',
          Min: 'ARR'
        },
        {
          Car: '6',
          Destination: 'Shady Gr',
          DestinationCode: 'A15',
          DestinationName: 'Shady Grove',
          Group: '2',
          Line: 'RD',
          LocationCode: 'A01',
          LocationName: 'Metro Center',
          Min: 'BRD'
        },
        {
          Car: '8',
          Destination: 'Vienna',
          DestinationCode: 'K08',
          DestinationName: 'Vienna',
          Group: '2',
          Line: 'OR',
          LocationCode: 'C01',
          LocationName: 'Metro Center',
          Min: '5'
        },
        {
          Car: '6',
          Destination: 'Unknown',
          DestinationCode: 'Z99',
          DestinationName: 'Unknown',
          Group: '1',
          Line: 'RD',
          LocationCode: 'A01',
          LocationName: 'Metro Center',
          Min: '---'
        }
      ]
    };

    it('analyse et normalise les prédictions JSON de GetPrediction/All', () => {
      const { trains, tripUpdates, predictions } = parseWmataStationPredictions(samplePredictionsPayload, 1791289800);

      // 4 prédictions valides (la 5e avec "---" est ignorée)
      expect(predictions).toHaveLength(4);
      expect(trains).toHaveLength(4);
      expect(tripUpdates).toHaveLength(4);

      // Train 0 (Min: 3 -> 180s)
      expect(trains[0].routeId).toBe('RED');
      expect(trains[0].nextStationId).toBe('STN_A01');
      expect(trains[0].nextStationName).toBe('Metro Center');
      expect(trains[0].carCount).toBe(6);
      expect(trains[0].directionId).toBe(0); // Group 1
      expect(trains[0].timeToNextStationS).toBe(180);

      // Train 1 (Min: ARR -> 30s)
      expect(trains[1].routeId).toBe('RED');
      expect(trains[1].carCount).toBe(8);
      expect(trains[1].timeToNextStationS).toBe(30);

      // Train 2 (Min: BRD -> 0s)
      expect(trains[2].routeId).toBe('RED');
      expect(trains[2].directionId).toBe(1); // Group 2
      expect(trains[2].timeToNextStationS).toBe(0);

      // Train 3 (Line: OR -> ORANGE)
      expect(trains[3].routeId).toBe('ORANGE');
      expect(trains[3].nextStationId).toBe('STN_C01');
      expect(trains[3].carCount).toBe(8);
      expect(trains[3].timeToNextStationS).toBe(300);
    });

    it('bascule automatiquement en mode repli sur StationPrediction.svc si GTFS-RT est inaccessible', async () => {
      resetWashingtonCache();

      const mockHybridFetcher: WmataFetcher = async (endpoint) => {
        if (endpoint === 'tripupdates' || endpoint === 'vehiclepositions') {
          return { statusCode: 403, error: 'Forbidden' };
        }
        if (endpoint === 'stationprediction') {
          return {
            statusCode: 200,
            data: JSON.stringify(samplePredictionsPayload)
          };
        }
        if (endpoint === 'incidents') {
          return {
            statusCode: 200,
            data: JSON.stringify({ Incidents: [] })
          };
        }
        return { statusCode: 404 };
      };

      const res = await getOrFetchWashingtonSnapshot('wmata-prod-key', 1791289800 * 1000, mockHybridFetcher);

      expect(res.snapshot.feedHealthy).toBe(true);
      expect(res.snapshot.serviceActive).toBe(true);
      expect(res.snapshot.serviceStatus).toBe('active');
      expect(res.snapshot.dataSource).toBe('station-prediction');
      expect(res.snapshot.trains).toHaveLength(4);
      expect(res.snapshot.stats.retainedEntities).toBe(4);
      expect(res.snapshot.stats.redCount).toBe(3);
    });
  });
});
