/**
 * Line identity helpers: label parsing, transport mode, ink contrast.
 * Colours come from the IDFM GTFS feed (route_color / route_text_color);
 * the table below is only a fallback when the feed is unavailable offline.
 */

export type LineMode = 'metro' | 'rer' | 'tram' | 'train' | 'bus';

export interface LineRef {
  shortName: string;
  color?: string | null;
  textColor?: string | null;
}

export const LINE_FALLBACKS: Record<string, { color: string; textColor: string }> = {
  '1': { color: '#ffce00', textColor: '#25303b' },
  '2': { color: '#0064b0', textColor: '#ffffff' },
  '3': { color: '#9c9522', textColor: '#ffffff' },
  '3b': { color: '#98d4e2', textColor: '#25303b' },
  '4': { color: '#c04191', textColor: '#ffffff' },
  '5': { color: '#f28e42', textColor: '#25303b' },
  '6': { color: '#83c491', textColor: '#25303b' },
  '7': { color: '#f3a4ba', textColor: '#25303b' },
  '7b': { color: '#83c491', textColor: '#25303b' },
  '8': { color: '#ceadd2', textColor: '#25303b' },
  '9': { color: '#d5c900', textColor: '#25303b' },
  '10': { color: '#e3b32a', textColor: '#25303b' },
  '11': { color: '#8d5e2a', textColor: '#ffffff' },
  '12': { color: '#00814f', textColor: '#ffffff' },
  '13': { color: '#98d4e2', textColor: '#25303b' },
  '14': { color: '#662483', textColor: '#ffffff' },
  a: { color: '#e3051c', textColor: '#ffffff' },
  b: { color: '#5291ce', textColor: '#ffffff' },
  c: { color: '#ffce00', textColor: '#25303b' },
  d: { color: '#00814f', textColor: '#ffffff' },
  e: { color: '#c04191', textColor: '#ffffff' },
};

const TRANSILIEN = new Set(['h', 'j', 'k', 'l', 'n', 'p', 'r', 'u', 'v']);

/** "3B", "3bis", "3 bis", "RER A", "M14" → canonical key: "3b", "a", "14". */
export function lineKey(shortName: string): string {
  const s = shortName.trim().toLowerCase().replace(/^(rer|ligne|m|metro|métro)\s*/i, '');
  const bis = s.match(/^(\d+)\s*(b|bis)$/);
  if (bis) return `${bis[1]}b`;
  return s.replace(/\s+/g, '');
}

export function lineMode(shortName: string): LineMode {
  const k = lineKey(shortName);
  if (/^\d+b?$/.test(k)) return Number.parseInt(k, 10) > 99 ? 'bus' : 'metro';
  if (/^[a-e]$/.test(k)) return 'rer';
  if (/^t\d+[a-z]?$/.test(k)) return 'tram';
  if (TRANSILIEN.has(k)) return 'train';
  return 'bus';
}

/** Splits a label into its numeral and the "bis" suffix (3bis, 7bis). */
export function badgeParts(shortName: string): { main: string; bis: boolean } {
  const k = lineKey(shortName);
  const m = k.match(/^(\d+)b$/);
  if (m) return { main: m[1], bis: true };
  return { main: /^[a-z]$/.test(k) ? k.toUpperCase() : k.toUpperCase(), bis: false };
}

/** Accessible name: "Ligne 4", "Ligne 3bis", "RER A", "Tram T3a". */
export function lineName(shortName: string): string {
  const mode = lineMode(shortName);
  const { main, bis } = badgeParts(shortName);
  if (mode === 'rer') return `RER ${main}`;
  if (mode === 'tram') return `Tram ${main}`;
  if (mode === 'train') return `Ligne ${main}`;
  return `Ligne ${main}${bis ? 'bis' : ''}`;
}

/** Accepts "FFBE00", "#ffbe00", "#fb0" — returns "#rrggbb" or null. */
export function normalizeColor(input?: string | null): string | null {
  if (!input) return null;
  let h = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
}

export function resolveLine(ref: LineRef): { color: string; textColor: string } {
  const fb = LINE_FALLBACKS[lineKey(ref.shortName)];
  const color = normalizeColor(ref.color) ?? fb?.color ?? '#646c7a';
  const preferred = normalizeColor(ref.textColor) ?? fb?.textColor ?? null;
  return { color, textColor: inkFor(color, preferred) };
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Badge ink. A line badge is a pictogram (WCAG 1.4.11, 3:1), and its name is
 * always exposed as text to assistive tech. The official ink is kept whenever
 * it reaches 3:1, so RER B stays white on blue as riders know it.
 */
export function inkFor(bg: string, preferred?: string | null): string {
  if (preferred && contrast(bg, preferred) >= 3) return preferred;
  return contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff';
}

/**
 * Accessible ink for white-backed RER / Transilien badges (WCAG 1.4.3 ≥ 4.5:1 on #ffffff).
 * Keeps official hue while darkening high-luminance lines such as RER C (#ffce00 → #8a6d00).
 */
export function rerInkFor(shortName: string, color: string): string {
  const k = lineKey(shortName);
  if (k === 'c') return '#8a6d00';
  if (contrast('#ffffff', color) >= 4.5) return color;
  if (k === 'b') return '#2b6cb0';
  return '#141923';
}

/**
 * Which theme needs an edge around the badge so it does not dissolve into
 * the surface: pale colours on white, deep colours on night.
 */
export function rimFor(bg: string): { clair: boolean; sombre: boolean } {
  const l = luminance(bg);
  return { clair: l > 0.3, sombre: l < 0.12 };
}
