import { describe, expect, it } from 'vitest';
import { roundPathCorners } from './rounded_path';

describe('roundPathCorners', () => {
  it('arrondit un angle sans modifier les extrémités ni l’entrée', () => {
    const path: [number, number][] = [[2.3, 48.8], [2.3005, 48.8], [2.3005, 48.801]];
    const original = path.map(point => [...point] as [number, number]);
    const rounded = roundPathCorners(path);

    expect(rounded.length).toBeGreaterThan(path.length);
    expect(rounded[0]).toEqual(path[0]);
    expect(rounded[rounded.length - 1]).toEqual(path[path.length - 1]);
    expect(path).toEqual(original);
    expect(rounded.some(([longitude, latitude]) => longitude > 2.3005 || latitude > 48.8)).toBe(true);
  });

  it('laisse une ligne droite inchangée', () => {
    const path: [number, number][] = [[2.3, 48.8], [2.3005, 48.8], [2.301, 48.8]];
    expect(roundPathCorners(path)).toEqual(path);
  });
});
