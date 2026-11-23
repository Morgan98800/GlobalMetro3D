import { RiSearchLine } from '@remixicon/react';
import { cx } from './cx';
import { Poussoir } from './plan-lumineux/PlanLumineux';

/**
 * The single entry point for places: "Où allez-vous ?". Opens the search
 * dialog. Keeps id="topbar-search-trigger" and uses Plan Lumineux champ variant.
 */
export interface SearchTriggerProps {
  onOpen: () => void;
  size?: 'sm' | 'md' | 'lg';
  shortcut?: boolean;
  className?: string;
}

export function SearchTrigger({ onOpen, size = 'sm', className }: SearchTriggerProps) {
  return (
    <Poussoir
      id="topbar-search-trigger"
      variante="champ"
      taille={size}
      pleineLargeur={size === 'lg'}
      icone={<RiSearchLine aria-hidden />}
      onClick={onOpen}
      aria-label="Où allez-vous ? Adresse, restaurant, station ou itinéraire"
      className={cx(className)}
    >
      <span className="min-w-0 flex-1 truncate text-start">Où allez-vous ?</span>
    </Poussoir>
  );
}
