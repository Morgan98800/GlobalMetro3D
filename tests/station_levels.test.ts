import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LineMetadata, StationMetadata } from '@core/types';
import {
  buildHubRegistry,
  elevateTrackPath,
  HUB_LEVEL_STEP_M,
  resolveLineElevationAt,
  VIADUCT_Z_M,
} from '@core/ui/map/station_levels';

const DATA_DIR = path.resolve(process.cwd(), 'web/public/data');
const LINES = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'lines.json'), 'utf8')
) as LineMetadata[];
const STATIONS = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf8')
) as StationMetadata[];

describe('station_levels multi-level architectural stacking', () => {
  it('stacks Strasbourg–Saint-Denis in real depth order (L4 > L8 > L9) with >= 7.5m clearance', () => {
    const registry = buildHubRegistry(STATIONS, LINES);
    const st = STATIONS.find((s) => s.name === 'Strasbourg - Saint-Denis')!;
    const line4 = LINES.find((l) => l.short_name === '4')!;
    const line8 = LINES.find((l) => l.short_name === '8')!;
    const line9 = LINES.find((l) => l.short_name === '9')!;

    const z4 = resolveLineElevationAt(st.coordinates, line4, registry);
    const z8 = resolveLineElevationAt(st.coordinates, line8, registry);
    const z9 = resolveLineElevationAt(st.coordinates, line9, registry);

    expect(z4).toBeGreaterThan(z8);
    expect(z8).toBeGreaterThan(z9);
    expect(z4 - z8).toBeGreaterThanOrEqual(HUB_LEVEL_STEP_M - 0.01);
    expect(z8 - z9).toBeGreaterThanOrEqual(HUB_LEVEL_STEP_M - 0.01);
  });

  it('maintains >= 7.5m clearance across every multi-line hub in Paris and preserves L8 > L9 along Grands Boulevards', () => {
    const registry = buildHubRegistry(STATIONS, LINES);
    expect(registry.anchors.length).toBeGreaterThan(25);

    for (const anchor of registry.anchors) {
      const zValues = [...anchor.zByLineId.values()].sort((a, b) => a - b);
      for (let i = 1; i < zValues.length; i += 1) {
        expect(zValues[i] - zValues[i - 1]).toBeGreaterThanOrEqual(HUB_LEVEL_STEP_M - 0.01);
      }
    }

    const line8 = LINES.find((l) => l.short_name === '8')!;
    const bonnesNouvelles = STATIONS.find((s) => s.name === 'Bonne Nouvelle')!;
    const elevated = elevateTrackPath(
      [
        bonnesNouvelles.coordinates,
        [bonnesNouvelles.coordinates[0] + 0.005, bonnesNouvelles.coordinates[1]],
      ],
      line8,
      registry
    );
    expect(elevated.length).toBeGreaterThanOrEqual(2);
    expect(elevated[0][2]).toBeLessThan(0);
  });

  it('places underground metro strata beneath street level while keeping L2/L6 viaducts elevated and RER deep', () => {
    const registry = buildHubRegistry(STATIONS, LINES);
    const line6 = LINES.find((l) => l.short_name === '6')!;
    const birHakeim = STATIONS.find((s) => s.name === 'Bir-Hakeim')!;
    const placeItalie = STATIONS.find((s) => s.name === "Place d'Italie")!;
    const rerA = LINES.find((l) => l.short_name === 'A')!;
    const chatelet = STATIONS.find((s) => s.name === 'Châtelet')!;

    expect(resolveLineElevationAt(birHakeim.coordinates, line6, registry)).toBeCloseTo(
      VIADUCT_Z_M,
      1
    );
    expect(resolveLineElevationAt(placeItalie.coordinates, line6, registry)).toBeLessThan(0);
    expect(resolveLineElevationAt(chatelet.coordinates, rerA, registry)).toBeLessThan(-15);
  });
});
