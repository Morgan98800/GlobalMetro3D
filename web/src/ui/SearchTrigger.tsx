import { RiSearchLine } from '@remixicon/react';
import { cx } from './cx';
import { Kbd } from './Kbd';

/**
 * The single entry point for places: "Où allez-vous ?". Opens the search
 * dialog (⌘K). Keeps the v1 id so tests and the capture script still find it.
 */
export interface SearchTriggerProps {
  onOpen: () => void;
  size?: 'md' | 'lg';
  shortcut?: boolean;
  className?: string;
}

export function SearchTrigger({ onOpen, size = 'md', shortcut = true, className }: SearchTriggerProps) {
  return (
    <button
      type="button"
      id="topbar-search-trigger"
      onClick={onOpen}
      aria-label="Où allez-vous ? Adresse, restaurant, station ou itinéraire (⌘K)"
      className={cx(
        'group flex min-w-0 flex-1 cursor-text items-center gap-2.5 rounded-controle bg-encart text-start',
        'transition-colors duration-150 ease-signal hover:bg-encart-survol',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        size === 'lg' ? 'h-12 px-3.5' : 'h-10 px-3',
        className,
      )}
    >
      <RiSearchLine aria-hidden className={cx('shrink-0 text-icone-2', size === 'lg' ? 'size-5' : 'size-[18px]')} />
      <span className={cx('min-w-0 flex-1 truncate text-encre-3', size === 'lg' ? 'text-[16px]' : 'text-[15px]')}>
        Où allez-vous ?
      </span>
      {shortcut && <Kbd className="hidden shrink-0 md:inline-flex">⌘K</Kbd>}
    </button>
  );
}
