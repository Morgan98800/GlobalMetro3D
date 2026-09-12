import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';

describe('Station Ladder and line_ladders.json RER support', () => {
  const ladderPath = path.resolve(import.meta.dirname, '../web/public/data/line_ladders.json');
  const ladders = JSON.parse(fs.readFileSync(ladderPath, 'utf8'));

  const rerIds: Record<string, string> = {
    'IDFM:C01742': 'A',
    'IDFM:C01743': 'B',
    'IDFM:C01727': 'C',
    'IDFM:C01728': 'D',
    'IDFM:C01729': 'E',
  };

  it('should include all 5 RER lines with both directions in line_ladders.json', () => {
    for (const [rid, shortName] of Object.entries(rerIds)) {
      const line = ladders[rid];
      assert.ok(line, `Line ${rid} (${shortName}) must be defined in line_ladders.json`);
      assert.equal(line.short_name, shortName);
      assert.ok(line.color, `Line ${shortName} must have color`);
      assert.ok(line.directions['0'], `Line ${shortName} must have direction 0`);
      assert.ok(line.directions['1'], `Line ${shortName} must have direction 1`);

      for (const did of ['0', '1']) {
        const dir = line.directions[did];
        assert.ok(dir.origin, `Dir ${did} of RER ${shortName} must have an origin`);
        assert.ok(dir.terminus, `Dir ${did} of RER ${shortName} must have a terminus`);
        assert.ok(dir.stations.length >= 10, `Dir ${did} of RER ${shortName} must have at least 10 stations (got ${dir.stations.length})`);

        // Check station properties
        for (const st of dir.stations) {
          assert.ok(st.id, `Station must have an id: ${JSON.stringify(st)}`);
          assert.ok(st.name, `Station must have a name`);
          assert.equal(typeof st.distance_m, 'number', `Station ${st.name} must have numeric distance_m`);
          assert.ok(Array.isArray(st.coordinates) && st.coordinates.length === 2, `Station ${st.name} coordinates invalid`);
          assert.ok(st.coordinates[0] > 1.8 && st.coordinates[0] < 3.2, `Station ${st.name} longitude out of range`);
          assert.ok(st.coordinates[1] > 48.3 && st.coordinates[1] < 49.3, `Station ${st.name} latitude out of range`);
          assert.ok(Array.isArray(st.transfers), `Station ${st.name} transfers must be array`);
        }

        // Check monotonic distances
        for (let i = 1; i < dir.stations.length; i++) {
          assert.ok(
            dir.stations[i].distance_m >= dir.stations[i - 1].distance_m,
            `Station distances must be monotonically non-decreasing on RER ${shortName} dir ${did}: ${dir.stations[i].name} (${dir.stations[i].distance_m}) vs ${dir.stations[i-1].name} (${dir.stations[i-1].distance_m})`
          );
        }
      }
    }
  });

  it('should maintain existing 16 metro lines intact in line_ladders.json', () => {
    const metroLineNames = ['1', '2', '3', '3bis', '4', '5', '6', '7', '7bis', '8', '9', '10', '11', '12', '13', '14'];
    const linesFound = Object.values(ladders).map((l: any) => l.short_name);
    for (const m of metroLineNames) {
      assert.ok(linesFound.includes(m), `Metro line ${m} must exist in line_ladders.json`);
    }
  });
});
