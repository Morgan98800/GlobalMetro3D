import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

export class NetworkDataLoader {
  constructor(baseDataDir) {
    this.shapes = new Map();
    this.tripStopsCache = new Map();

    const shapesBinPath = path.join(baseDataDir, 'shapes.bin');
    const sqlitePath = path.join(baseDataDir, 'network.sqlite');

    // 1. Load and parse shapes.bin
    const buf = fs.readFileSync(shapesBinPath);
    const count = buf.readUInt16LE(6);
    const tableOffset = 32;
    const entrySize = 64;
    const dataStart = tableOffset + count * entrySize;

    for (let i = 0; i < count; i++) {
      const e = tableOffset + i * entrySize;
      const sid = buf.toString('utf-8', e, e + 32).replace(/\0/g, '');
      const rid = buf.toString('utf-8', e + 32, e + 48).replace(/\0/g, '');
      const dir = buf.readUInt8(e + 48);
      const ptCount = buf.readUInt32LE(e + 52);
      const totalLen = buf.readFloatLE(e + 56);
      const byteOffset = buf.readUInt32LE(e + 60);

      const ptStart = dataStart + byteOffset;
      const ptLength = ptCount * 3; // 3 floats per pt

      // Create a Float32Array view directly from the buffer
      const points = new Float32Array(
        buf.buffer,
        buf.byteOffset + ptStart,
        ptLength
      );

      this.shapes.set(sid, {
        shapeId: sid,
        routeId: rid,
        directionId: dir,
        ptCount,
        totalLengthM: totalLen,
        points
      });
    }

    // 2. Open SQLite database
    this.db = new DatabaseSync(sqlitePath);
    this.stmtActiveTrips = this.db.prepare(`
      SELECT trip_id, route_id, direction_id, shape_id, start_time_s, end_time_s
      FROM trips_index
      WHERE service_id IN (SELECT value FROM json_each(?))
        AND start_time_s <= ?
        AND end_time_s >= ?
    `);

    this.stmtTripStops = this.db.prepare(`
      SELECT stop_sequence, stop_id, arrival_time, departure_time, shape_dist_traveled
      FROM trip_stops
      WHERE trip_id = ?
      ORDER BY stop_sequence ASC
    `);

    console.log(`[loader] Loaded ${this.shapes.size} shapes into memory and opened SQLite database.`);
  }

  /** Resolves which GTFS service_ids are active on the given date (YYYYMMDD). */
  getActiveServiceIds(dateStr, dayOfWeek) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayCol = days[dayOfWeek];

    // Query standard calendar
    const calQuery = this.db.prepare(`
      SELECT service_id
      FROM services
      WHERE ${dayCol} = 1
        AND start_date <= ?
        AND end_date >= ?
    `);
    const calRows = calQuery.all(dateStr, dateStr);
    const activeSet = new Set(calRows.map(r => r.service_id));

    // Query exceptions
    const excQuery = this.db.prepare(`
      SELECT service_id, exception_type
      FROM service_exceptions
      WHERE date = ?
    `);
    const excRows = excQuery.all(dateStr);
    for (const r of excRows) {
      if (r.exception_type === 1) {
        activeSet.add(r.service_id);
      } else if (r.exception_type === 2) {
        activeSet.delete(r.service_id);
      }
    }

    return Array.from(activeSet);
  }

  /** Returns all active trips at a given second of the day with their stop times. */
  getActiveTripsAtTime(timeSeconds, activeServiceIds) {
    const tripsRows = this.stmtActiveTrips.all(
      JSON.stringify(activeServiceIds),
      timeSeconds,
      timeSeconds
    );

    const activeTrips = [];
    for (const r of tripsRows) {
      const tid = r.trip_id;
      let stops = this.tripStopsCache.get(tid);
      if (!stops) {
        const stopRows = this.stmtTripStops.all(tid);
        stops = stopRows.map(s => ({
          seq: s.stop_sequence,
          stopId: s.stop_id,
          arrTime: s.arrival_time,
          depTime: s.departure_time,
          shapeDistM: s.shape_dist_traveled
        }));
        this.tripStopsCache.set(tid, stops);
      }

      activeTrips.push({
        tripId: tid,
        routeId: r.route_id,
        directionId: r.direction_id,
        shapeId: r.shape_id,
        startTime: r.start_time_s,
        endTime: r.end_time_s,
        stops
      });
    }

    return activeTrips;
  }
}
