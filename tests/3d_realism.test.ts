import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildHaussmannFacadePattern,
  buildHaussmannZincRoofPattern,
} from '@core/ui/map/haussmann_patterns';
import { PARIS_LANDMARKS_GLTF, createLandmarksLayers } from '@core/ui/map/landmarks_layer';
import { computeParisDaylightProfile } from '@core/ui/map/maplibre';
import {
  BATEAU_MOUCHE_MODEL_URL,
  computeSeineBoatPoses,
  createSeineRiverLayers,
} from '@core/ui/map/seine_river_layer';
import { getBlueprintXrayPaints } from '@core/ui/map/vector_style';

const PUBLIC_DIR = resolve(__dirname, '../web/public');

describe('3D Paris Realism Upgrades', () => {
  it('ships lightweight GLBs for 4 iconic Paris bridges and Bateau-Mouche', () => {
    const expectedIds = [
      'pont_bir_hakeim',
      'pont_alexandre_iii',
      'viaduc_austerlitz',
      'pont_neuf',
    ];
    for (const id of expectedIds) {
      const lm = PARIS_LANDMARKS_GLTF.find((l) => l.id === id);
      expect(lm, `missing landmark ${id}`).toBeDefined();
      const absPath = resolve(PUBLIC_DIR, lm!.modelUrl.replace(/^\//, ''));
      expect(existsSync(absPath), `missing GLB ${absPath}`).toBe(true);
      expect(statSync(absPath).size).toBeGreaterThan(2000);
    }

    const boatPath = resolve(PUBLIC_DIR, BATEAU_MOUCHE_MODEL_URL.replace(/^\//, ''));
    expect(existsSync(boatPath)).toBe(true);
    expect(statSync(boatPath).size).toBeGreaterThan(2000);

    // Distance culling near Bir-Hakeim / Eiffel includes both Tour Eiffel & Pont de Bir-Hakeim
    const nearEiffel = createLandmarksLayers({
      zoom: 15.6,
      pitch: 50,
      mapCenter: [2.291, 48.857],
      visible: true,
      cityId: 'paris',
    });
    const ids = nearEiffel.map((l) => l.id);
    expect(ids).toContain('landmark-tour_eiffel');
    expect(ids).toContain('landmark-pont_bir_hakeim');
  });

  it('animates 8 Bateaux-Mouches along the Seine with valid geodesic positions and wakes', () => {
    const poses0 = computeSeineBoatPoses(0);
    const poses10 = computeSeineBoatPoses(10_000);
    expect(poses0).toHaveLength(8);
    for (let i = 0; i < poses0.length; i += 1) {
      const [lng, lat, z] = poses0[i].position;
      expect(lng).toBeGreaterThan(2.27);
      expect(lng).toBeLessThan(2.38);
      expect(lat).toBeGreaterThan(48.83);
      expect(lat).toBeLessThan(48.87);
      expect(z).toBeGreaterThan(0);
      // Boat moved between t=0 and t=10s
      const moved =
        Math.abs(poses10[i].position[0] - lng) + Math.abs(poses10[i].position[1] - lat);
      expect(moved).toBeGreaterThan(0.0001);
    }

    const layers = createSeineRiverLayers({
      zoom: 15.0,
      pitch: 45,
      theme: 'dark',
      cityId: 'paris',
      nowMs: 5000,
    });
    expect(layers.map((l) => l.id)).toContain('seine-water-reflections');
    expect(layers.map((l) => l.id)).toContain('seine-bateaux-mouches');
  });

  it('generates Haussmann facade & zinc roof patterns and Blueprint X-ray paints', () => {
    const dayFacade = buildHaussmannFacadePattern('light');
    const nightFacade = buildHaussmannFacadePattern('dark');
    const zincDay = buildHaussmannZincRoofPattern('light');
    expect(dayFacade.width).toBe(64);
    expect(nightFacade.data.length).toBe(64 * 64 * 4);
    expect(zincDay.width).toBe(64);

    const bpDark = getBlueprintXrayPaints('dark');
    const bgDark = bpDark.find(([layer]) => layer === 'background')?.[2];
    expect(bgDark).toBe('#060c18');
  });

  it('applies Paris Golden Hour strictly in Light mode and ALWAYS preserves Obsidian Night in Dark mode', () => {
    // 18:30 Paris summer time (16:30 UTC) -> golden evening in Light mode
    const eveningDate = new Date('2026-06-15T16:30:00Z');
    const lightEvening = computeParisDaylightProfile('light', eveningDate);
    expect(lightEvening.phase).toBe('golden-evening');

    // 13:00 Paris time (11:00 UTC) -> crisp midday in Light mode
    const middayDate = new Date('2026-06-15T11:00:00Z');
    const lightMidday = computeParisDaylightProfile('light', middayDate);
    expect(lightMidday.phase).toBe('day');

    // Dark mode MUST remain pure night regardless of Paris wall-clock hour
    expect(computeParisDaylightProfile('dark', eveningDate).phase).toBe('night');
    expect(computeParisDaylightProfile('dark', middayDate).phase).toBe('night');
    expect(computeParisDaylightProfile('dark', new Date('2026-06-15T06:00:00Z')).phase).toBe(
      'night'
    );
  });
});
