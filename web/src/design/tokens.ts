/**
 * Faïence v2 tokens for code that cannot read Tailwind classes:
 * Three.js materials, deck.gl layers, canvas displays.
 * Values mirror web/styles/theme.css. Prefer readToken() for themed roles.
 */
export { LINE_FALLBACKS } from '../ui/lines';

export const palette = {
  email: {
    50: '#f4f4f6',
    100: '#e8e8ed',
    200: '#d5d5dc',
    300: '#aeaeb8',
    400: '#86868f',
    500: '#63636c',
    600: '#48484f',
    700: '#323237',
    800: '#1c1d20',
    900: '#141517',
    950: '#0a0b0d',
  },
  ardoise: {
    25: '#fcfcfb',
    50: '#f5f5f3',
    100: '#ededeb',
    150: '#e5e5e2',
    200: '#d8d8d4',
    300: '#c2c2bd',
    400: '#9a9a95',
    450: '#7c7c78',
    500: '#6e6e73',
    600: '#525257',
    700: '#3a3a3f',
    800: '#252529',
    900: '#1d1d1f',
  },
  nuit: {
    600: '#3d4047',
    700: '#2a2c31',
    800: '#1e2024',
    850: '#181a1d',
    900: '#131518',
    950: '#0b0c0e',
  },
  ambre: {
    200: '#ffe4a6',
    300: '#ffd46e',
    400: '#ffc640',
    500: '#ffb81c',
    600: '#e39b00',
    700: '#a87300',
    eteint: '#3b2d08',
  },
  normal: { 300: '#4cd97b', 500: '#30b55b', 700: '#1f8a43' },
  vigilance: { 300: '#fbbf24', 500: '#f59e0b', 700: '#b45309' },
  signal: { 300: '#ff6b6b', 500: '#e53935', 700: '#b91c1c' },
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
export function onThemeChange(
  cb: (t: Theme) => void,
  root: HTMLElement = document.documentElement
): () => void {
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
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
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
