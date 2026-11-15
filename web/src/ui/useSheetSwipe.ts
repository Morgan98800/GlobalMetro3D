import { useRef, type TouchEventHandler } from 'react';

export interface SheetSwipeOptions {
  enabled?: boolean;
  thresholdPx?: number;
  onSwipeDown?: () => void;
  onSwipeUp?: () => void;
}

/**
 * Lightweight touch swipe handler for mobile bottom sheets.
 * Lets users collapse or dismiss drawers naturally without hunting for buttons.
 */
export function useSheetSwipe({
  enabled = true,
  thresholdPx = 48,
  onSwipeDown,
  onSwipeUp,
}: SheetSwipeOptions): {
  onTouchStart: TouchEventHandler;
  onTouchEnd: TouchEventHandler;
} {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e) => {
      if (!enabled || e.touches.length !== 1) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e) => {
      if (!enabled || !start.current || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      const dy = e.changedTouches[0].clientY - start.current.y;
      start.current = null;
      if (Math.abs(dy) < thresholdPx || Math.abs(dy) <= Math.abs(dx) * 1.15) return;
      if (dy > 0) onSwipeDown?.();
      else onSwipeUp?.();
    },
  };
}
