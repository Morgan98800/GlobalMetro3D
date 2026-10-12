import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { decodeShapes } from '../core/sim/shapes_loader';
import { washingtonConfig } from '../cities/washington/city.config';
import { getCityConfig } from '../cities';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, 'cities/washington/data');
const WEB_DATA_DIR = path.resolve(ROOT, 'web/public/cities/washington/data');

describe('Washington DC (WMATA Metrorail) — Ingestion & Phase 1 Validation', () => {
  it('validates washington city.config.ts configuration', () => {
    expect(washingtonConfig.id).toBe('washington');
    expect(washingtonConfig.timezone).toBe('America/New_York');
    expect(washingtonConfig.modes.length).toBe(1);
    expect(washingtonConfig.modes[0].id).toBe('metro');
    expect(washingtonConfig.realtime.provider).toBe('gtfs-rt');
  });

  it('guarantees all 10 normalized artifacts exist in both data/ and web/public/', () => {
    const requiredFiles = [
      'lines.json',
      'stations.json',
      'tracks.json',
      'shapes.bin',
      'schedule.json',
      'line_ladders.json',
      'station-rankings.json',
      'sections.json',
      'rolling-stock.json',
      'feed_fingerprint.json'
    ];

    for (const file of requiredFiles) {
      const srcPath = path.join(DATA_DIR, file);
      const webPath = path.join(WEB_DATA_DIR, file);

      expect(fs.existsSync(srcPath), `Missing ${srcPath}`).toBe(true);
      expect(fs.existsSync(webPath), `Missing ${webPath}`).toBe(true);

      const srcStat = fs.statSync(srcPath);
      const webStat = fs.statSync(webPath);
      expect(srcStat.size).toBeGreaterThan(0);
      expect(webStat.size).toBe(srcStat.size);
    }
  });

  it('validates lines.json contains all 6 Metrorail lines including Red (#E31837)', () => {
    const lines = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'lines.json'), 'utf8'));
    expect(lines).toHaveLength(6);
    const lineIds = lines.map((l: any) => l.id);
    expect(lineIds).toEqual(['RED', 'ORANGE', 'SILVER', 'BLUE', 'GREEN', 'YELLOW']);

    const red = lines.find((l: any) => l.id === 'RED');
    expect(red).toBeDefined();
    expect(red.short_name).toBe('Red');
    expect(red.color).toBe('#E31837');
    expect(red.mode).toBe('metro');
    expect(red.destinations['0']).toBe('Glenmont');
    expect(red.destinations['1']).toBe('Shady Grove');
    expect(red.measured_length_km).toBeCloseTo(51.74, 1);
  });

  it('validates stations.json contains exactly 98 aggregated stations across the network', () => {
    const stations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf8'));
    expect(stations).toHaveLength(98);

    // Verify all 98 station names are clean and start with valid IDs
    for (const stn of stations) {
      expect(stn.id).toMatch(/^STN_/);
      expect(stn.lines.length).toBeGreaterThanOrEqual(1);
      expect(stn.coordinates).toHaveLength(2);
      expect(stn.coordinates[0]).toBeLessThan(-76.8);
      expect(stn.coordinates[0]).toBeGreaterThan(-77.5);
      expect(stn.coordinates[1]).toBeGreaterThan(38.7);
      expect(stn.coordinates[1]).toBeLessThan(39.2);
    }
  });

  it('validates shapes.bin decodes with decodeShapes and contains all 192 shapes (including 16 Red shapes)', () => {
    const buf = fs.readFileSync(path.join(DATA_DIR, 'shapes.bin'));
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const shapesMap = decodeShapes(arrayBuf);

    expect(shapesMap.size).toBe(192);
    for (let i = 1; i <= 16; i++) {
      const shapeId = `RRED_${i}`;
      expect(shapesMap.has(shapeId), `Missing shape ${shapeId}`).toBe(true);
      const s = shapesMap.get(shapeId)!;
      expect(s.coords.length).toBeGreaterThan(100);
      expect(s.dist.length).toBeGreaterThan(100);
      expect(s.length).toBeGreaterThan(25000); // at least 25 km
    }
  });

  it('validates schedule.json: nominal trips count (1696), valid times beyond 24h, and monotonic distances', () => {
    const sched = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'schedule.json'), 'utf8'));
    expect(sched.stations).toHaveLength(98);
    expect(sched.trips.length).toBe(1696); // Service 51_R (all 6 lines)

    const redTrips = sched.trips.filter((t: any) => t[1] === 'RED');
    expect(redTrips).toHaveLength(374);

    let maxTimeS = 0;
    for (const trip of sched.trips) {
      const [tripId, lineId, dirId, shapeId, t0, t1, destIdx, stops] = trip;
      expect(['RED', 'ORANGE', 'SILVER', 'BLUE', 'GREEN', 'YELLOW']).toContain(lineId);
      expect([0, 1]).toContain(dirId);
      expect(t0).toBeLessThan(t1);
      expect(destIdx).toBeGreaterThanOrEqual(0);
      expect(destIdx).toBeLessThan(98);
      expect(stops.length).toBeGreaterThanOrEqual(2);

      let prevDist = -1;
      for (const stop of stops) {
        const [arr, dep, distM, stnIdx] = stop;
        expect(arr).toBeLessThanOrEqual(dep);
        expect(distM).toBeGreaterThanOrEqual(prevDist - 0.5); // strictly non-decreasing
        expect(stnIdx).toBeGreaterThanOrEqual(0);
        expect(stnIdx).toBeLessThan(98);
        prevDist = distM;
        if (dep > maxTimeS) maxTimeS = dep;
      }
    }

    // Heure GTFS maximale dans 51_R > 24:00 (86400s) conservée telle quelle (25:13:00)
    expect(maxTimeS).toBe(90780); // 25:13:00 (> 24h)
    expect(maxTimeS).toBeGreaterThan(86400);
  });

  it('validates line_ladders.json structure for all 6 lines including Red', () => {
    const ladders = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'line_ladders.json'), 'utf8'));
    for (const lid of ['RED', 'ORANGE', 'SILVER', 'BLUE', 'GREEN', 'YELLOW']) {
      expect(ladders[lid]).toBeDefined();
      expect(ladders[lid].directions['0']).toBeDefined();
      expect(ladders[lid].directions['1']).toBeDefined();
    }
    expect(ladders.RED.directions['0'].origin).toBe('Shady Grove');
    expect(ladders.RED.directions['0'].terminus).toBe('Glenmont');
    expect(ladders.RED.directions['0'].stations).toHaveLength(27);

    expect(ladders.RED.directions['1'].origin).toBe('Glenmont');
    expect(ladders.RED.directions['1'].terminus).toBe('Shady Grove');
    expect(ladders.RED.directions['1'].stations).toHaveLength(27);
  });

  it('validates rolling-stock.json specifications carry verified: false', () => {
    const stock = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rolling-stock.json'), 'utf8'));
    for (const model of Object.values(stock.models) as any[]) {
      expect(model.verified).toBe(false);
      expect(model.total_length_m).toBeGreaterThan(100);
      expect(model.car_length_m).toBeCloseTo(22.86, 2);
      expect(model.width_m).toBeCloseTo(3.09, 2);
    }
  });

  it('validates sections.json reflects flat 2D track without elevation', () => {
    const sections = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sections.json'), 'utf8'));
    expect(sections.summary.aerial_sections).toBe(0);
    expect(sections.summary.aerial_km).toBe(0.0);
    expect(sections.summary.network_type).toContain('Tracé à plat');
  });

  it('validates feed_fingerprint.json metadata', () => {
    const fp = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'feed_fingerprint.json'), 'utf8'));
    expect(fp.timezone).toBe('America/New_York');
    expect(fp.max_gtfs_time).toBe('26:13:00');
    expect(fp.service_id).toBe('51_R');
  });
});
