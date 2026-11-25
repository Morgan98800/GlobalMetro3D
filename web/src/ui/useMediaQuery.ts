import { useSyncExternalStore } from 'react';

/** Subscribes to a media query. Desktop breakpoint matches Tailwind `md`. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => fallback
  );
}

export const useIsDesktop = () => useMediaQuery('(min-width: 768px)', true);
