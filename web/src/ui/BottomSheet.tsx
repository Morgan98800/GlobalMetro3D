import { useDrag } from '@use-gesture/react';
import { animate, motion, useMotionValue } from 'motion/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { cx } from './cx';

/**
 * Feuille inférieure tactile à 3 crans ('bas' | 'moyen' | 'haut') + état replié
 * ('repli') pour dégager la quasi-totalité du plan 3D quand on suit les rames.
 * Pilote au doigt via @use-gesture/react + motion/react (inertie ressort GPU).
 */
export type DetentSheet = 'repli' | 'bas' | 'moyen' | 'haut';

export interface BottomSheetProps {
  cran: DetentSheet;
  onCran: (c: DetentSheet) => void;
  /** Autorise le cran minimal 'repli' (barre d'accès compacte ~72px) */
  repliable?: boolean;
  /** Appelé si l'utilisateur glisse vers le bas sous 'bas' quand non repliable */
  onDismiss?: () => void;
  /** Appelé si l'utilisateur glisse horizontalement vers la droite (geste retour iOS) */
  onSwipeBack?: () => void;
  /** Hauteur personnalisée par cran en px (calculée sinon depuis viewport) */
  hauteurs?: Partial<Record<DetentSheet, number>>;
  /** Contenu optionnel affiché dans l'entête compact quand cran === 'repli' */
  barreRepli?: ReactNode;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}

const FLICK_VELOCITY_PX_MS = 0.26;

function useViewportHeight(): number {
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 844));
  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return vh;
}

export function resolveDetentHeights(
  vh: number,
  overrides?: Partial<Record<DetentSheet, number>>
): Record<DetentSheet, number> {
  return {
    repli: overrides?.repli ?? 78,
    bas: overrides?.bas ?? Math.round(Math.min(240, Math.max(196, vh * 0.25))),
    moyen: overrides?.moyen ?? Math.round(Math.min(vh * 0.62, Math.max(430, vh * 0.54))),
    haut: Math.min(overrides?.haut ?? Math.round(vh * 0.8), Math.max(360, vh - 156)),
  };
}

export function pickNextDetent(params: {
  height: number;
  velocityY: number;
  crans: DetentSheet[];
  heights: Record<DetentSheet, number>;
  current: DetentSheet;
}): DetentSheet | 'dismiss' {
  const { height, velocityY, crans, heights, current } = params;
  // Dragging fast downward (positive dy -> shrinking height)
  if (velocityY > FLICK_VELOCITY_PX_MS) {
    const idx = crans.indexOf(current);
    if (idx > 0) return crans[idx - 1];
    return 'dismiss';
  }
  // Dragging fast upward (negative dy -> expanding height)
  if (velocityY < -FLICK_VELOCITY_PX_MS) {
    const idx = crans.indexOf(current);
    if (idx >= 0 && idx < crans.length - 1) return crans[idx + 1];
    return crans[crans.length - 1];
  }
  // Below minimal detent significantly -> dismiss when not repliable
  const minH = heights[crans[0]];
  if (height < minH - 56) return 'dismiss';

  // Nearest detent by height
  let best = crans[0];
  let bestDist = Infinity;
  for (const c of crans) {
    const d = Math.abs(heights[c] - height);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function findScrollableParent(
  target: EventTarget | null,
  boundary: HTMLElement | null
): HTMLElement | null {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== boundary) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function BottomSheet({
  cran,
  onCran,
  repliable = false,
  onDismiss,
  onSwipeBack,
  hauteurs,
  barreRepli,
  ariaLabel,
  className,
  children,
}: BottomSheetProps) {
  const vh = useViewportHeight();
  const heights = useMemo(() => resolveDetentHeights(vh, hauteurs), [vh, hauteurs]);
  const crans = useMemo<DetentSheet[]>(
    () => (repliable ? ['repli', 'bas', 'moyen', 'haut'] : ['bas', 'moyen', 'haut']),
    [repliable]
  );

  const sectionRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const sheetMaxH = heights.haut;
  const targetH = heights[cran] ?? heights.moyen;
  const targetTranslateY = Math.max(0, sheetMaxH - targetH);

  const y = useMotionValue(targetTranslateY);

  useEffect(() => {
    if (isDragging) return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('pl-sheet-detent', {
          detail: { height: targetH, detent: cran },
        })
      );
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const ctrl = animate(
      y,
      targetTranslateY,
      reduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 36, mass: 0.85 }
    );
    return () => ctrl.stop();
  }, [cran, isDragging, targetH, targetTranslateY, y]);

  const cycleDetent = useCallback(() => {
    const cycle: DetentSheet =
      cran === 'repli'
        ? 'bas'
        : cran === 'bas'
          ? heights.moyen - heights.bas < 100
            ? 'haut'
            : 'moyen'
          : cran === 'moyen'
            ? 'haut'
            : 'bas';
    onCran(cycle);
  }, [cran, heights.bas, heights.moyen, onCran]);

  const commitDrag = useCallback(
    (finalH: number, signedVy: number) => {
      const result = pickNextDetent({
        height: finalH,
        velocityY: signedVy,
        crans,
        heights,
        current: cran,
      });
      if (result === 'dismiss') {
        if (onDismiss) onDismiss();
        else onCran(crans[0]);
      } else {
        onCran(result);
      }
    },
    [cran, crans, heights, onCran, onDismiss]
  );

  const bindHandle = useDrag(
    ({ first, last, movement: [, my], velocity: [, vy], direction: [, dyDir], tap, memo }) => {
      if (tap) {
        setIsDragging(false);
        cycleDetent();
        return memo;
      }
      const startH = first ? targetH : ((memo as number) ?? targetH);
      if (first) setIsDragging(true);

      const minFloor = onDismiss && !repliable ? 72 : heights[crans[0]];
      const maxCeil = sheetMaxH + 28;
      const nextH = Math.max(minFloor, Math.min(maxCeil, startH - my));
      const nextY = sheetMaxH - nextH;
      y.set(nextY);
      if (sectionRef.current) {
        sectionRef.current.dataset.sheetHeight = String(Math.round(nextH));
      }

      if (last) {
        setIsDragging(false);
        commitDrag(nextH, vy * dyDir);
      }
      return startH;
    },
    {
      axis: 'y',
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  const contentDragActiveRef = useRef(false);
  const bindContent = useDrag(
    ({ event, first, last, movement: [, my], velocity: [, vy], direction: [, dyDir], memo }) => {
      if (first) {
        const scrollable = findScrollableParent(event.target, sectionRef.current);
        const atTop = !scrollable || scrollable.scrollTop <= 0;
        contentDragActiveRef.current = atTop && my >= 0;
        if (!contentDragActiveRef.current) return null;
        setIsDragging(true);
        return targetH;
      }
      if (!contentDragActiveRef.current) return null;
      const startH = (memo as number) ?? targetH;

      // Only intercept downward pull from top of scroll or when already expanded/dragging
      const minFloor = onDismiss && !repliable ? 72 : heights[crans[0]];
      const maxCeil = sheetMaxH + 20;
      const nextH = Math.max(minFloor, Math.min(maxCeil, startH - my));
      y.set(sheetMaxH - nextH);

      if (last) {
        contentDragActiveRef.current = false;
        setIsDragging(false);
        if (Math.abs(my) > 6) {
          commitDrag(nextH, vy * dyDir);
        }
      }
      return startH;
    },
    {
      axis: 'y',
      filterTaps: true,
      threshold: 8,
      pointer: { touch: true },
    }
  );

  const isCollapsed = cran === 'repli' && !isDragging;
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY, t: performance.now() };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || !onSwipeBack || e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      const dt = performance.now() - start.t;
      if (dx > 64 && dx > dy * 1.4 && dt < 500) {
        onSwipeBack();
      }
    },
    [onSwipeBack]
  );

  return (
    <motion.section
      ref={sectionRef}
      aria-label={ariaLabel}
      data-mobile-sheet="true"
      data-sheet-detent={cran}
      data-sheet-height={targetH}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        height: `${sheetMaxH}px`,
        y,
      }}
      className={cx(
        'bg-surface text-encre pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[20px] will-change-transform contain-[layout_style]',
        '[box-shadow:var(--fx-glacure),var(--shadow-feuille)]',
        className
      )}
    >
      {/* Poignée iOS sobre & compacte (cible tactile ≥ 44px, glisser ou toucher) */}
      <div className="relative z-10 flex shrink-0 items-center justify-center px-3 pt-1 pb-0">
        <button
          type="button"
          {...bindHandle()}
          aria-label="Glisser ou toucher pour ajuster la hauteur du panneau"
          className="-my-2.5 flex h-11 w-full touch-none items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus"
        >
          <span className="h-1 w-9 rounded-full bg-encre-3/45" />
        </button>
      </div>

      {isCollapsed && barreRepli ? (
        <div className="min-h-0 flex-1 overflow-hidden px-3.5 pt-0.5 pb-2">{barreRepli}</div>
      ) : (
        <div
          {...bindContent()}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ paddingBottom: `${targetTranslateY}px` }}
        >
          {children}
        </div>
      )}
    </motion.section>
  );
}
