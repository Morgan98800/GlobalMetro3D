import { describe, expect, it } from 'vitest';
import { pickNextDetent, resolveDetentHeights, type DetentSheet } from '../web/src/ui/BottomSheet';

describe('BottomSheet detents', () => {
  it('calcule les hauteurs de crans cohérentes sur un écran iPhone 844px', () => {
    const h = resolveDetentHeights(844);
    expect(h.repli).toBe(78);
    expect(h.bas).toBeGreaterThanOrEqual(190);
    expect(h.bas).toBeLessThanOrEqual(268);
    expect(h.moyen).toBeGreaterThan(h.bas);
    expect(h.haut).toBeGreaterThan(h.moyen);
    expect(h.haut).toBeLessThan(844);
  });

  it('monte au cran supérieur sur un geste rapide vers le haut', () => {
    const heights = resolveDetentHeights(844);
    const crans: DetentSheet[] = ['bas', 'moyen', 'haut'];
    expect(
      pickNextDetent({ height: heights.bas + 20, velocityY: -0.7, crans, heights, current: 'bas' })
    ).toBe('moyen');
    expect(
      pickNextDetent({
        height: heights.moyen + 20,
        velocityY: -0.7,
        crans,
        heights,
        current: 'moyen',
      })
    ).toBe('haut');
  });

  it('descend au cran inférieur ou ferme sur un geste rapide vers le bas', () => {
    const heights = resolveDetentHeights(844);
    const crans: DetentSheet[] = ['bas', 'moyen', 'haut'];
    expect(
      pickNextDetent({ height: heights.haut - 20, velocityY: 0.7, crans, heights, current: 'haut' })
    ).toBe('moyen');
    expect(
      pickNextDetent({ height: heights.bas - 10, velocityY: 0.7, crans, heights, current: 'bas' })
    ).toBe('dismiss');
  });

  it('se cale au cran repli quand repliable est actif et qu’on glisse vers le bas', () => {
    const heights = resolveDetentHeights(844);
    const crans: DetentSheet[] = ['repli', 'bas', 'moyen', 'haut'];
    expect(
      pickNextDetent({ height: heights.bas - 30, velocityY: 0.6, crans, heights, current: 'bas' })
    ).toBe('repli');
  });

  it('retient le cran le plus proche sur un relâchement lent', () => {
    const heights = resolveDetentHeights(844);
    const crans: DetentSheet[] = ['bas', 'moyen', 'haut'];
    expect(
      pickNextDetent({
        height: heights.moyen - 15,
        velocityY: 0.05,
        crans,
        heights,
        current: 'bas',
      })
    ).toBe('moyen');
    expect(
      pickNextDetent({ height: heights.bas - 70, velocityY: 0.05, crans, heights, current: 'bas' })
    ).toBe('dismiss');
  });
});
