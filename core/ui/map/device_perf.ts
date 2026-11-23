/**
 * Shared mobile/iPhone & Mac GPU/battery heuristics for WebGL renderers and overlays.
 * Caps pixel ratios on high-DPI displays and adapts simulation RAF cadence so
 * 120 Hz ProMotion screens (iPhone Pro / MacBook Pro) don't burn battery redrawing
 * sub-pixel train motion when zoomed out or idle.
 */

export function isMobileGpuDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
  const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return coarse || isIOS;
}

export function getOptimalPixelRatio(desktopMax = 1.75, mobileMax = 1.5): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isMobileGpuDevice() ? mobileMax : desktopMax);
}

export interface AdaptiveFpsContext {
  zoom: number;
  isFollowing: boolean;
  isInteracting?: boolean;
  isMobile?: boolean;
  reduceMotion?: boolean;
}

/**
 * Returns minimum milliseconds between simulation render frames.
 * - Low zoom (< 13.5): trains move < 0.4 px/frame -> 10 FPS saves ~85% GPU power
 * - Mid zoom (13.5..15.5): 30 FPS mobile / 60 FPS desktop
 * - Close zoom (>= 15.5), interacting, or following train: unlocked up to 120 Hz ProMotion (8 ms)
 */
export function getAdaptiveFrameIntervalMs(ctx: AdaptiveFpsContext): number {
  if (ctx.reduceMotion) return 1000;
  const mobile = ctx.isMobile ?? isMobileGpuDevice();
  if (ctx.isFollowing || ctx.isInteracting || ctx.zoom >= 15.5) return 8;
  if (ctx.zoom >= 13.5) return mobile ? 33 : 16.5;
  return 100; // 10 FPS at city-overview scale
}
