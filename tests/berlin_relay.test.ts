import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import Pbf from 'pbf';
import {
  decodeGtfsRealtimeFeed,
  getOrFetchBerlinSnapshot,
  resetBerlinCache,
  isUbahnRoute,
  ALLOWED_UBAHN_ROUTES,
  CACHE_TTL_SEC,
  USER_AGENT_CONTACT,
  handler,
  type VbbFetcher,
  type VbbFetchOptions,
  type VbbFetchResult
} from '../netlify/functions/berlin_relay';

function createDummyGtfsRtFeed(
  entities: Array<{
    id: string;
    routeId: string;
    tripId: string;
    stops: Array<{ seq: number; stopId: string; time: number }>;
  }>
): Buffer {
  const pbf = new Pbf();

  for (const ent of entities) {
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

describe('Relais Netlify berlin_relay', () => {
  beforeEach(() => {
    resetBerlinCache();
  });

  describe('Filtrage des lignes U-Bahn (§5.1)', () => {
    it('retient les 9 lignes U-Bahn (route_type 400) et écarte les bus de substitution (_700)', () => {
      expect(isUbahnRoute('17525_400')).toBe(true); // U8
      expect(isUbahnRoute('17512_400')).toBe(true); // U1
      expect(isUbahnRoute('17514_400')).toBe(true); // U2
      expect(isUbahnRoute('17526_400')).toBe(true); // U9
      expect(isUbahnRoute('99999_400')).toBe(true); // Extension dynamique 400

      // Bus de substitution portant les mêmes indicatifs : STRICTEMENT ÉCARTÉS
      expect(isUbahnRoute('17524_700')).toBe(false); // Bus U8
      expect(isUbahnRoute('17994_700')).toBe(false); // Bus U2
      expect(isUbahnRoute('17520_700')).toBe(false); // Bus U6
      expect(isUbahnRoute('17517_700')).toBe(false); // Bus U5
      expect(isUbahnRoute('tram_123')).toBe(false);
      expect(isUbahnRoute('')).toBe(false);
    });

    it('décode le flux Protobuf en ne conservant que le U-Bahn', () => {
      const dummyFeed = createDummyGtfsRtFeed([
        {
          id: 'ent-1',
          routeId: '17525_400',
          tripId: '308102122',
          stops: [{ seq: 1, stopId: 'de:11000:900100003::1', time: 1790760000 }]
        },
        {
          id: 'ent-2',
          routeId: '17524_700', // Bus de remplacement U8
          tripId: '999999991',
          stops: [{ seq: 1, stopId: 'BUS001', time: 1790760000 }]
        },
        {
          id: 'ent-3',
          routeId: '17512_400', // U1
          tripId: '308101001',
          stops: [{ seq: 1, stopId: 'de:11000:900012101::1', time: 1790760100 }]
        },
        {
          id: 'ent-4',
          routeId: 'regional_re1',
          tripId: '888888881',
          stops: [{ seq: 1, stopId: 'RE001', time: 1790760200 }]
        }
      ]);

      const { totalEntities, filteredUpdates } = decodeGtfsRealtimeFeed(dummyFeed);
      expect(totalEntities).toBe(4);
      expect(filteredUpdates).toHaveLength(2);
      expect(filteredUpdates.map((u) => u.trip.routeId)).toEqual(['17525_400', '17512_400']);
      expect(filteredUpdates[0].trip.tripId).toBe('308102122');
    });
  });

  describe('User-Agent informatif (§5.1)', () => {
    it('envoie un User-Agent non vide avec informations de contact et projet', async () => {
      let capturedUserAgent = '';

      const mockFetcher: VbbFetcher = async (options: VbbFetchOptions) => {
        capturedUserAgent = options.userAgent || '';
        return {
          statusCode: 200,
          data: createDummyGtfsRtFeed([]),
          etag: '"test-etag-1"'
        };
      };

      await getOrFetchBerlinSnapshot(1000000, mockFetcher);

      expect(capturedUserAgent).not.toBe('');
      expect(capturedUserAgent).toContain('ParisSubway3D');
      expect(capturedUserAgent).toContain('github.com');
      expect(capturedUserAgent).toContain('@');
      // Vérification qu'il ne s'agit pas d'un défaut de bibliothèque
      expect(capturedUserAgent).not.toContain('node-fetch');
      expect(capturedUserAgent).not.toContain('axios');
      expect(capturedUserAgent).not.toContain('Python-urllib');
    });
  });

  describe('Cache partagé et requêtes en rafale (§5.1)', () => {
    it('évite les appels sortants répétés lors d’une rafale de requêtes', async () => {
      let callCount = 0;
      const dummyFeed = createDummyGtfsRtFeed([
        {
          id: 'ent-1',
          routeId: '17525_400',
          tripId: '308102122',
          stops: [{ seq: 1, stopId: 'de:11000:900100003::1', time: 1790760000 }]
        }
      ]);

      const mockFetcher: VbbFetcher = async () => {
        callCount++;
        return {
          statusCode: 200,
          data: dummyFeed,
          etag: '"etag-burst-1"'
        };
      };

      const baseEpoch = 1790000000000;

      // 10 requêtes quasi-simultanées
      const promises = Array.from({ length: 10 }).map((_, i) =>
        getOrFetchBerlinSnapshot(baseEpoch + i * 500, mockFetcher)
      );

      const results = await Promise.all(promises);

      // Un seul appel sortant au VBB
      expect(callCount).toBe(1);
      expect(results[0].fromCache).toBe(false);
      for (let i = 1; i < 10; i++) {
        expect(results[i].fromCache).toBe(true);
        expect(results[i].snapshot.tripUpdates).toHaveLength(1);
      }

      // Après expiration du TTL (15s = 15000 ms), un nouvel appel sortant est autorisé
      const afterTtl = await getOrFetchBerlinSnapshot(baseEpoch + 16000, mockFetcher);
      expect(callCount).toBe(2);
      expect(afterTtl.fromCache).toBe(false);
    });

    it('transmet If-None-Match et traite la réponse 304 Not Modified', async () => {
      let callCount = 0;
      let lastReceivedIfNoneMatch: string | null | undefined = null;

      const dummyFeed = createDummyGtfsRtFeed([
        {
          id: 'ent-1',
          routeId: '17525_400',
          tripId: '308102122',
          stops: [{ seq: 1, stopId: 'de:11000:900100003::1', time: 1790760000 }]
        }
      ]);

      const mockFetcher: VbbFetcher = async (options) => {
        callCount++;
        lastReceivedIfNoneMatch = options.etag;
        if (options.etag === '"vbb-etag-abc"') {
          return { statusCode: 304, etag: '"vbb-etag-abc"' };
        }
        return {
          statusCode: 200,
          data: dummyFeed,
          etag: '"vbb-etag-abc"'
        };
      };

      const t0 = 1790000000000;
      // Premier appel : 200 OK
      const first = await getOrFetchBerlinSnapshot(t0, mockFetcher);
      expect(callCount).toBe(1);
      expect(first.snapshot.feedHealthy).toBe(true);
      expect(first.snapshot.tripUpdates).toHaveLength(1);

      // Deuxième appel après TTL (16s plus tard) : 304 Not Modified
      const second = await getOrFetchBerlinSnapshot(t0 + 16000, mockFetcher);
      expect(callCount).toBe(2);
      expect(lastReceivedIfNoneMatch).toBe('"vbb-etag-abc"');
      expect(second.snapshot.feedHealthy).toBe(true);
      expect(second.snapshot.tripUpdates).toHaveLength(1);
      expect(second.snapshot.timestamp).toBe(Math.floor((t0 + 16000) / 1000));
    });
  });

  describe('Résilience et gestion des erreurs HTTP (§5.1)', () => {
    it('renvoie un snapshot indisponible mais sain (feedHealthy: false) en cas de 429 Rate Limit', async () => {
      const mockFetcher: VbbFetcher = async () => ({
        statusCode: 429,
        error: 'Too Many Requests'
      });

      const { snapshot } = await getOrFetchBerlinSnapshot(1790000000000, mockFetcher);
      expect(snapshot.feedHealthy).toBe(false);
      expect(snapshot.lastError).toContain('429');
      expect(snapshot.tripUpdates).toEqual([]);
      expect(snapshot.trafficByLine).toEqual({});
    });

    it('renvoie un snapshot indisponible en cas d’erreur 500 ou réseau', async () => {
      const mockFetcher: VbbFetcher = async () => ({
        statusCode: 502,
        error: 'Bad Gateway'
      });

      const { snapshot } = await getOrFetchBerlinSnapshot(1790000000000, mockFetcher);
      expect(snapshot.feedHealthy).toBe(false);
      expect(snapshot.lastError).toContain('502');
      expect(snapshot.tripUpdates).toEqual([]);
    });

    it('le handler renvoie toujours HTTP 200 avec headers de cache CDN', async () => {
      // Précharger le cache avec un mock fetcher
      const dummyFeed = createDummyGtfsRtFeed([
        {
          id: 'ent-1',
          routeId: '17525_400',
          tripId: '308102122',
          stops: [{ seq: 1, stopId: 'de:11000:900100003::1', time: 1790760000 }]
        }
      ]);
      await getOrFetchBerlinSnapshot(Date.now(), async () => ({
        statusCode: 200,
        data: dummyFeed
      }));

      const response = await handler();
      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.headers['Netlify-CDN-Cache-Control']).toContain(`s-maxage=${CACHE_TTL_SEC}`);
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('feedHealthy');
      expect(body).toHaveProperty('tripUpdates');
      expect(body).toHaveProperty('trafficByLine');
    });
  });

  describe('Décodage de l’échantillon réel VBB', () => {
    it('décode correctement l’échantillon protobuf de production si présent', () => {
      const samplePath = path.resolve(__dirname, '../scratch/sample_rt.pb');
      if (!fs.existsSync(samplePath)) return;

      const buffer = fs.readFileSync(samplePath);
      const { totalEntities, filteredUpdates } = decodeGtfsRealtimeFeed(buffer);

      expect(totalEntities).toBeGreaterThan(10000);
      expect(filteredUpdates.length).toBeGreaterThan(100);
      expect(filteredUpdates.length).toBeLessThan(300);

      // Toutes les entités conservées doivent appartenir aux 9 lignes U-Bahn
      for (const tu of filteredUpdates) {
        expect(isUbahnRoute(tu.trip.routeId)).toBe(true);
      }
    });
  });
});
