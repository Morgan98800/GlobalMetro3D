export const COLOR_TOKENS = {
  FONTE: "#0E1512",
  GUIMARD: "#1F4A3B",
  CERAMIQUE: "#EFE9DD",
  LAITON: "#B4894F",
  SIGNAL: "#C8362B"
} as const;

export const PARIS_CENTER: [number, number] = [2.3488, 48.8534];
// Keep the initial map readable at city scale. The camera is allowed to open
// progressively only once the MapLibre building extrusion becomes visible.
export const DEFAULT_PITCH = 30;
export const DEFAULT_BEARING = -15;
export const DEFAULT_ZOOM = 11.8;
