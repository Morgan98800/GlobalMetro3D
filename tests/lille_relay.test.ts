import { describe, it, expect, beforeEach } from 'vitest';
import {
  decodeGtfsRealtimeFeed,
  getOrFetchIleviaSnapshot,
  resetLilleCache,
  ALLOWED_ROUTE_IDS,
  type IleviaTripUpdate
} from '../netlify/functions/lille_relay';
import Pbf from 'pbf';

function createDummyGtfsRtFeed(entities: Array<{ id: string; routeId: string; tripId: string; stops: Array<{ seq: number; stopId: string; time: number }> }>): Buffer {
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

describe('Relais Netlify lille_relay', () => {
  beforeEach(() => {
    resetLilleCache();
  });

  it('ne retient que les lignes autorisées (ME1, ME2, 71) et écarte les bus', () => {
    const dummyFeed = createDummyGtfsRtFeed([
      { id: '1', routeId: 'ME1', tripId: '5539138', stops: [{ seq: 1, stopId: '4CA099', time: 1790760000 }] },
      { id: '2', routeId: '71', tripId: '5573855', stops: [{ seq: 1, stopId: 'ICT021', time: 1790760100 }] },
      { id: '3', routeId: 'L1', tripId: '9999001', stops: [{ seq: 1, stopId: 'BUS001', time: 1790760200 }] },
      { id: '4', routeId: '14', tripId: '9999002', stops: [{ seq: 1, stopId: 'BUS002', time: 1790760300 }] },
    ]);

    const { totalEntities, filteredUpdates } = decodeGtfsRealtimeFeed(dummyFeed);
    expect(totalEntities).toBe(4);
    expect(filteredUpdates).toHaveLength(2);
    expect(filteredUpdates.map((u) => u.trip.routeId)).toEqual(['ME1', '71']);
  });

  it('génère un snapshot conforme avec stats et trafic vide', async () => {
    const dummyFeed = createDummyGtfsRtFeed([
      { id: '1', routeId: 'ME1', tripId: '5539138', stops: [{ seq: 1, stopId: '4CA099', time: 1790760000 }] },
      { id: '2', routeId: '71', tripId: '5573855', stops: [{ seq: 1, stopId: 'ICT021', time: 1790760100 }] }
    ]);

    const mockFetcher = async () => ({
      statusCode: 200,
      data: dummyFeed
    });

    const snapshot = await getOrFetchIleviaSnapshot(undefined, 1790760500000, mockFetcher);
    expect(snapshot.feedHealthy).toBe(true);
    expect(snapshot.serviceActive).toBe(true);
    expect(snapshot.trafficByLine).toEqual({});
    expect(snapshot.stats.totalEntitiesInFeed).toBe(2);
    expect(snapshot.stats.metroCount).toBe(1);
    expect(snapshot.stats.tramCount).toBe(1);
    expect(snapshot.tripUpdates).toHaveLength(2);
  });
});
