/**
 * Shared mobile/iPhone GPU heuristics for WebGL renderers and overlays.
 * Capping pixel ratios on high-DPI mobile screens avoids 9x (3x*3x) fragment
 * overdraw while keeping text and transit liveries crisp on Retina displays.
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

export function getOptimalPixelRatio(desktopMax = 2, mobileMax = 1.5): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isMobileGpuDevice() ? mobileMax : desktopMax);
}
