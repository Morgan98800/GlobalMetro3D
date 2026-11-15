import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { IconButton } from './Button';
import { cx } from './cx';

/**
 * Menu d’actions rares (« Plus d’actions »). Une action fréquente reste visible ;
 * une action rare vient ici. Rôle ARIA menu : entrées d’action uniquement.
 */
export interface MenuEntree {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  ton?: 'normal' | 'alerte';
}

export interface MenuBoutonProps {
  /** Nom accessible du déclencheur, aussi info-bulle */
  label: string;
  icon: ReactNode;
  entrees: MenuEntree[];
  /** end : sous le bouton, aligné à droite. gauche : s’ouvre à gauche (pile de contrôles à droite de l’écran) */
  align?: 'start' | 'end' | 'gauche';
  size?: 'sm' | 'md';
  /** Ouvert au montage (maquettes, tests) */
  defaultOpen?: boolean;
  className?: string;
}

export function MenuBouton({ label, icon, entrees, align = 'end', size = 'sm', defaultOpen = false, className }: MenuBoutonProps) {
  const [open, setOpen] = useState(defaultOpen);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  const move = (e: ReactKeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    }
    if (e.key === 'Home') list[0]?.focus();
    if (e.key === 'End') list[list.length - 1]?.focus();
  };

  return (
    <div ref={root} className={cx('relative', className)}>
      <IconButton
        size={size}
        label={label}
        icon={icon}
        aria-haspopup="menu"
        expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => items()[0]?.focus());
          }
        }}
      />
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={move}
          className={cx(
            'absolute z-30 min-w-[240px] rounded-[14px] bg-surface-elevee p-1.5 animate-feuille',
            '[box-shadow:var(--fx-glacure),0_0_0_1px_var(--color-joint),var(--shadow-flotte)]',
            align === 'gauche' ? 'right-full top-0 mr-2' : align === 'end' ? 'right-0 top-full mt-2' : 'left-0 top-full mt-2',
          )}
        >
          {entrees.map((e) => (
            <button
              key={e.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                e.onSelect();
              }}
              className={cx(
                'flex h-10 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-start text-[14px] font-medium',
                'outline-none transition-colors duration-150 ease-signal hover:bg-encart focus-visible:bg-encart',
                '[&_svg]:size-[18px] [&_svg]:shrink-0',
                e.ton === 'alerte' ? 'text-signal-encre' : 'text-encre',
              )}
            >
              {e.icon && <span className={e.ton === 'alerte' ? '' : 'text-icone-2'}>{e.icon}</span>}
              <span className="min-w-0 truncate">{e.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
