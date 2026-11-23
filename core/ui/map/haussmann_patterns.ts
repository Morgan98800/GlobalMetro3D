import type * as maplibregl from 'maplibre-gl';
import type { MapTheme } from './vector_style';

export const HAUSSMANN_FACADE_DAY_ID = 'paris-haussmann-day';
export const HAUSSMANN_FACADE_NIGHT_ID = 'paris-haussmann-night';
export const HAUSSMANN_ZINC_DAY_ID = 'paris-zinc-day';
export const HAUSSMANN_ZINC_NIGHT_ID = 'paris-zinc-night';

interface RawPatternImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Generates a 128×128 procedural Haussmannian facade tile (registered at pixelRatio 2):
 * - Day: Lutetian cream limestone courses, tall vertical French windows, wrought-iron
 *   balcony rails and continuous cornice bands.
 * - Night: dark Paris limestone with ~28% warmly lit amber/ivory apartment windows
 *   and natural floor-to-floor variation (NYC Underground / architectural night style).
 */
export function buildHaussmannFacadePattern(theme: MapTheme): RawPatternImage {
  const size = 64;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (theme === 'light') {
        // Bright warm Lutetian limestone base (clean 64x64 pixelRatio:1 for glitch-free MapLibre UV wrapping)
        ctx.fillStyle = '#efe9dc';
        ctx.fillRect(0, 0, size, size);

        // Subtle horizontal limestone ashlar courses
        ctx.fillStyle = 'rgba(130, 118, 98, 0.14)';
        for (let y = 0; y < size; y += 8) {
          ctx.fillRect(0, y, size, 1);
        }

        // 2 Haussmann floors × 4 tall French window bays
        const floors = 2;
        const cols = 4;
        const floorH = size / floors; // 32px
        const colW = size / cols; // 16px

        for (let f = 0; f < floors; f += 1) {
          const fy = f * floorH;
          for (let c = 0; c < cols; c += 1) {
            const cx = c * colW;
            const wx = cx + 4;
            const wy = fy + 6;
            const ww = 8;
            const wh = 19;

            // Stone window surround molding
            ctx.fillStyle = '#f8f4ea';
            ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);

            // Recessed French window glazing
            ctx.fillStyle = '#53606e';
            ctx.fillRect(wx, wy, ww, wh);

            // Upper sky glint + crisp white mullions
            ctx.fillStyle = 'rgba(220, 234, 248, 0.28)';
            ctx.fillRect(wx + 1, wy + 1, ww - 2, 6);
            ctx.fillStyle = '#f2ede2';
            ctx.fillRect(wx + 4, wy, 1, wh);
            ctx.fillRect(wx, wy + 7, ww, 1);

            // Wrought-iron garde-corps railing
            ctx.fillStyle = '#3b414a';
            ctx.fillRect(wx - 1, wy + wh - 5, ww + 2, 1);
          }

          // Continuous Haussmann stone cornice + wrought-iron balcony on alternating floor
          ctx.fillStyle = f === 1 ? '#d8cfbe' : 'rgba(122, 110, 92, 0.18)';
          ctx.fillRect(0, fy + floorH - 3, size, 2);
          if (f === 1) {
            ctx.fillStyle = '#363c46';
            ctx.fillRect(0, fy + floorH - 7, size, 1);
          }
        }
      } else {
        // Obsidian / deep slate Haussmann night facade
        ctx.fillStyle = '#181c24';
        ctx.fillRect(0, 0, size, size);

        // Subtle stone cornice lines
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        for (let y = 0; y < size; y += 16) {
          ctx.fillRect(0, y + 15, size, 1);
        }

        const floors = 4;
        const cols = 4;
        const floorH = size / floors; // 16px
        const colW = size / cols; // 16px

        const warmPalettes = ['#ffd47e', '#ffe2a6', '#f5bc62', '#ffedc6'];
        for (let f = 0; f < floors; f += 1) {
          const fy = f * floorH;
          for (let c = 0; c < cols; c += 1) {
            const cx = c * colW;
            const wx = cx + 4;
            const wy = fy + 3;
            const ww = 7;
            const wh = 10;

            const hash = (f * 37 + c * 17 + f * c * 11) % 23;
            const isWarmLit =
              hash === 1 || hash === 4 || hash === 7 || hash === 11 || hash === 16 || hash === 20;
            const isCoolLit = hash === 13;

            if (isWarmLit) {
              ctx.fillStyle = 'rgba(255, 206, 118, 0.18)';
              ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
              ctx.fillStyle = warmPalettes[hash % warmPalettes.length];
              ctx.fillRect(wx, wy, ww, wh);
              ctx.fillStyle = 'rgba(24, 22, 20, 0.45)';
              ctx.fillRect(wx + 3, wy, 1, wh);
            } else if (isCoolLit) {
              ctx.fillStyle = '#a8ccf0';
              ctx.fillRect(wx, wy, ww, wh);
            } else {
              ctx.fillStyle = '#0f131a';
              ctx.fillRect(wx, wy, ww, wh);
            }
          }
        }
      }

      const img = ctx.getImageData(0, 0, size, size);
      return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
    }
  }

  // Headless / Node fallback
  const data = new Uint8Array(size * size * 4);
  const base = theme === 'light' ? [239, 233, 220, 255] : [24, 28, 36, 255];
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4] = base[0];
    data[i * 4 + 1] = base[1];
    data[i * 4 + 2] = base[2];
    data[i * 4 + 3] = base[3];
  }
  return { width: size, height: size, data };
}

/**
 * Generates a 64×64 Parisian standing-seam zinc mansard roof tile (blue-grey slate in day,
 * dark slate-graphite at night) so rooftops look authentically Parisian rather than flat blocks.
 */
export function buildHaussmannZincRoofPattern(theme: MapTheme): RawPatternImage {
  const size = 64;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (theme === 'light') {
        ctx.fillStyle = '#73808e';
        ctx.fillRect(0, 0, size, size);
        // Zinc standing seams
        for (let x = 0; x < size; x += 8) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.fillRect(x, 0, 1, size);
          ctx.fillStyle = 'rgba(30, 38, 48, 0.18)';
          ctx.fillRect(x + 1, 0, 1, size);
        }
        // Subtle mansard horizontal drip-edge ridge
        ctx.fillStyle = 'rgba(230, 236, 242, 0.16)';
        ctx.fillRect(0, 0, size, 2);
        ctx.fillStyle = 'rgba(34, 42, 52, 0.24)';
        ctx.fillRect(0, size - 3, size, 3);
      } else {
        ctx.fillStyle = '#212733';
        ctx.fillRect(0, 0, size, size);
        for (let x = 0; x < size; x += 8) {
          ctx.fillStyle = 'rgba(160, 185, 220, 0.08)';
          ctx.fillRect(x, 0, 1, size);
          ctx.fillStyle = 'rgba(5, 8, 12, 0.25)';
          ctx.fillRect(x + 1, 0, 1, size);
        }
        ctx.fillStyle = 'rgba(130, 155, 190, 0.10)';
        ctx.fillRect(0, 0, size, 2);
      }
      const img = ctx.getImageData(0, 0, size, size);
      return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
    }
  }
  const data = new Uint8Array(size * size * 4);
  const base = theme === 'light' ? [115, 128, 142, 255] : [33, 39, 51, 255];
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4] = base[0];
    data[i * 4 + 1] = base[1];
    data[i * 4 + 2] = base[2];
    data[i * 4 + 3] = base[3];
  }
  return { width: size, height: size, data };
}

export function ensureHaussmannPatterns(map: maplibregl.Map): void {
  if (typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') return;
  try {
    if (!map.hasImage(HAUSSMANN_FACADE_DAY_ID)) {
      map.addImage(HAUSSMANN_FACADE_DAY_ID, buildHaussmannFacadePattern('light'), {
        pixelRatio: 1,
      });
    }
    if (!map.hasImage(HAUSSMANN_FACADE_NIGHT_ID)) {
      map.addImage(HAUSSMANN_FACADE_NIGHT_ID, buildHaussmannFacadePattern('dark'), {
        pixelRatio: 1,
      });
    }
    if (!map.hasImage(HAUSSMANN_ZINC_DAY_ID)) {
      map.addImage(HAUSSMANN_ZINC_DAY_ID, buildHaussmannZincRoofPattern('light'), {
        pixelRatio: 1,
      });
    }
    if (!map.hasImage(HAUSSMANN_ZINC_NIGHT_ID)) {
      map.addImage(HAUSSMANN_ZINC_NIGHT_ID, buildHaussmannZincRoofPattern('dark'), {
        pixelRatio: 1,
      });
    }
  } catch {
    // Graceful no-op in mocked or headless maps
  }
}

export function facadePatternForTheme(theme: MapTheme): string {
  return theme === 'light' ? HAUSSMANN_FACADE_DAY_ID : HAUSSMANN_FACADE_NIGHT_ID;
}

export function zincPatternForTheme(theme: MapTheme): string {
  return theme === 'light' ? HAUSSMANN_ZINC_DAY_ID : HAUSSMANN_ZINC_NIGHT_ID;
}
