import { RiCloseLine } from '@remixicon/react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import { cx } from './cx';
import { useIsDesktop } from './useMediaQuery';

/**
 * Modale — feuille centrée sur bureau, feuille basse sur mobile.
 * Une seule sortie visible : × (plus Échap et clic sur le fond).
 * Pas de bouton « Fermer » ou « Terminer » en pied : les réglages s’appliquent tout de suite.
 */
export interface ModaleProps {
  ouverte: boolean;
  titre: string;
  onClose: () => void;
  children: ReactNode;
  /** Bandeau d’illustration au-dessus du titre (À propos) */
  bandeau?: ReactNode;
  largeur?: 'md' | 'lg';
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modale({
  ouverte,
  titre,
  onClose,
  children,
  bandeau,
  largeur = 'md',
  className,
}: ModaleProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!ouverte) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!f.length) return;
      const [first, last] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [ouverte, onClose]);

  if (!ouverte) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div aria-hidden className="absolute inset-0 bg-nuit-950/55" onClick={onClose} />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        initial={
          reduceMotion
            ? { opacity: 0 }
            : desktop
              ? { opacity: 0, scale: 0.97 }
              : { opacity: 0, y: 12 }
        }
        animate={
          reduceMotion ? { opacity: 1 } : desktop ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 }
        }
        transition={{ duration: reduceMotion ? 0.12 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={cx(
          'relative flex max-h-[88dvh] w-full origin-bottom flex-col overflow-hidden rounded-t-feuille bg-surface text-encre outline-none md:origin-center md:rounded-feuille',
          '[box-shadow:var(--fx-glacure),0_0_0_1px_var(--color-joint),var(--shadow-flotte)]',
          largeur === 'lg' ? 'md:max-w-[680px]' : 'md:max-w-[560px]',
          className
        )}
      >
        {bandeau}
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4 md:px-6">
          <h2 id={id} className="text-titre text-encre [text-wrap:balance]">
            {titre}
          </h2>
          <IconButton
            size="sm"
            label="Fermer"
            icon={<RiCloseLine aria-hidden />}
            onClick={onClose}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 md:px-6 md:pb-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
