/**
 * Faïence v2 tokens for code that cannot read Tailwind classes:
 * Three.js materials, deck.gl layers, canvas displays.
 * Values mirror web/styles/theme.css. Prefer readToken() for themed roles.
 */
export { LINE_FALLBACKS } from '../ui/lines';

export const palette = {
  email: {
    50: '#f2f6fe', 100: '#e4ebfd', 200: '#c9d7fb', 300: '#a2b9f5', 400: '#718fe3', 500: '#4b68c7',
    600: '#344ea6', 700: '#263c88', 800: '#1c2d6c', 900: '#132050', 950: '#091230',
  },
  ardoise: {
    25: '#fafbfd', 50: '#f4f6f9', 100: '#eaedf3', 150: '#e1e5eb', 200: '#d5dae3', 300: '#b7beca',
    400: '#9199a6', 450: '#7f8794', 500: '#646c7a', 600: '#4f5766', 700: '#38404f', 800: '#222a39', 900: '#111928',
  },
  nuit: { 600: '#404759', 700: '#2a3144', 800: '#1a2134', 850: '#12192a', 900: '#0c1222', 950: '#060a18' },
  ambre: { 200: '#ffe4a6', 300: '#ffd46e', 400: '#ffc640', 500: '#ffb81c', 600: '#e39b00', 700: '#a87300', eteint: '#4d3906' },
  normal: { 300: '#62d18e', 500: '#2f9a56', 700: '#1d7a41' },
  vigilance: { 300: '#ffa257', 500: '#f07a12', 700: '#b04f06' },
  signal: { 300: '#ff7a7a', 500: '#d7262d', 700: '#b3141c' },
} as const;

export type Theme = 'jour' | 'nuit';

/** Reads a semantic token ("encre", "plaque", "--fx-fond"…) as resolved now. */
export function readToken(name: string, el: Element = document.documentElement): string {
  const prop = name.startsWith('--') ? name : `--color-${name}`;
  return getComputedStyle(el).getPropertyValue(prop).trim();
}

export function currentTheme(root: Element = document.documentElement): Theme {
  return root.classList.contains('dark') ? 'nuit' : 'jour';
}

/** Calls back whenever the `.dark` class flips on <html>. Returns an unsubscribe. */
export function onThemeChange(cb: (t: Theme) => void, root: HTMLElement = document.documentElement): () => void {
  let last = currentTheme(root);
  const mo = new MutationObserver(() => {
    const t = currentTheme(root);
    if (t !== last) cb((last = t));
  });
  mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => mo.disconnect();
}

/** "#rrggbb" → [r, g, b, a] for deck.gl accessors. */
export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/** "#rrggbb" → 0xrrggbb for Three.js colours. */
export const hexToInt = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

/** Motion: same curves as the CSS tokens, for cameras and tweens. */
export const motion = {
  portes: [0.32, 0.72, 0, 1],
  rame: [0.65, 0, 0.35, 1],
  signal: [0.2, 0, 0, 1],
  durees: { instant: 90, etat: 160, feuille: 320, camera: 640 },
} as const;

/** Cubic-bezier easing as a function, for deck.gl `transitionEasing` or Three tweens. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

export const easeRame = bezier(...motion.rame);
export const easePortes = bezier(...motion.portes);
