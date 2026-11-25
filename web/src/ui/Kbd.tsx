import type { ReactNode } from 'react';
import { cx } from './cx';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-surface px-1',
        'font-sans text-[11px] font-semibold text-encre-2',
        '[box-shadow:inset_0_0_0_1px_var(--color-bord),inset_0_-1px_0_var(--color-bord)]',
        className
      )}
    >
      {children}
    </kbd>
  );
}
