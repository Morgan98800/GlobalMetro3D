import { RiArrowDownSLine, RiGitCommitLine, RiMapPinUserLine, RiMenuLine, RiRouteLine } from '@remixicon/react';
import type { ReactNode } from 'react';
import { Horloge } from './Afficheur';
import { LineBadgeChip } from './LineBadgeChip';
import type { LineRef } from './lines';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { Marque } from './Marque';
import { Panneau } from './Panneau';
import { SearchTrigger } from './SearchTrigger';
import { Segmented } from './Segmented';
import { useIsDesktop, useMediaQuery } from './useMediaQuery';

/**
 * Top bar. Desktop: one plate on the left (network, search, the three ways
 * in), one on the right (time, mode, menu). Mobile: the search and the three
 * ways in move to the bottom, under the thumb (see BarreMobile).
 */
export type Experience = 'simple' | 'passionne';
export type Rubrique = 'itineraire' | 'autour' | 'lignes';

export interface TopNavBarProps {
  reseau: string;
  onReseau?: () => void;
  onSearch: () => void;
  onRubrique: (r: Rubrique) => void;
  actif?: Rubrique | null;
  experience: Experience;
  onExperience: (e: Experience) => void;
  onMenu: () => void;
  /** Le menu ⋮ est ouvert (aria-expanded) */
  menuOuvert?: boolean;
  /** Ligne sélectionnée : sa pastille remplace l’icône du bouton Lignes */
  ligneActive?: LineRef | null;
  horloge?: Date;
  /** Mode grand public : masque l’horloge et le sélecteur Simple/Passionné de la barre en mode Simple */
  compact?: boolean;
  className?: string;
}

const RUBRIQUES: { id: Rubrique; label: string; icon: ReactNode; aria?: string }[] = [
  { id: 'itineraire', label: 'Itinéraire', icon: <RiRouteLine aria-hidden /> },
  { id: 'autour', label: 'Autour de moi', icon: <RiMapPinUserLine aria-hidden /> },
  // Accessible name contains the visible label (WCAG 2.5.3)
  { id: 'lignes', label: 'Lignes', icon: <RiGitCommitLine aria-hidden />, aria: 'Lignes, choisir une ligne' },
];

export function TopNavBar(props: TopNavBarProps) {
  const desktop = useIsDesktop();
  const large = useMediaQuery('(min-width: 1024px)', true);
  const { reseau, onReseau, onSearch, onRubrique, actif, experience, onExperience, onMenu, horloge, className, ligneActive } = props;
  const icone = (r: (typeof RUBRIQUES)[number]) =>
    r.id === 'lignes' && ligneActive ? <LineBadgeChip {...ligneActive} size="xs" /> : r.icon;
  return (
    <header
      className={cx(
        'pointer-events-none flex items-start justify-between gap-3 px-3 pt-[max(12px,env(safe-area-inset-top))] md:px-4 md:pt-4',
        className,
      )}
    >
      <Panneau className="flex h-14 min-w-0 items-center gap-1.5 px-2">
        <ReseauButton reseau={reseau} onClick={onReseau} />
        {desktop && (
          <>
            <span aria-hidden className="mx-1 h-6 w-px bg-joint" />
            <SearchTrigger onOpen={onSearch} className="w-[300px] flex-none" />
            <span aria-hidden className="mx-1 h-6 w-px bg-joint" />
            <nav aria-label="Rubriques" className="flex items-center gap-0.5">
              {RUBRIQUES.map((r) =>
                large ? (
                  <Button key={r.id} variant="discret" icon={icone(r)} aria-label={r.aria} pressed={actif === r.id} onClick={() => onRubrique(r.id)}>
                    {r.label}
                  </Button>
                ) : (
                  <IconButton key={r.id} label={r.aria ?? r.label} icon={icone(r)} pressed={actif === r.id} onClick={() => onRubrique(r.id)} />
                ),
              )}
            </nav>
          </>
        )}
      </Panneau>

      <Panneau className="flex h-14 shrink-0 items-center gap-2 px-2">
        {(!props.compact || experience === 'passionne') && <Horloge date={horloge} />}
        {desktop && !props.compact && (
          <Segmented
            size="sm"
            label="Niveau de détail"
            value={experience}
            onChange={onExperience}
            options={[
              { value: 'simple', label: 'Simple' },
              { value: 'passionne', label: 'Passionné' },
            ]}
            className="w-[188px]"
          />
        )}
        <IconButton label="Menu et réglages" icon={<RiMenuLine aria-hidden />} expanded={props.menuOuvert} onClick={onMenu} />
      </Panneau>
    </header>
  );
}

function ReseauButton({ reseau, onClick }: { reseau: string; onClick?: () => void }) {
  if (!onClick) {
    return (
      <div className="flex h-10 items-center gap-2 pl-1.5 pr-2 text-encre">
        <Marque size={28} />
        <span className="signaletique text-[17px] font-[650]">{reseau}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Réseau : ${reseau}. Changer de réseau`}
      className="flex h-10 items-center gap-2 rounded-controle pl-1.5 pr-2 text-encre transition-colors duration-150 ease-signal hover:bg-encart outline-none focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Marque size={28} />
      <span className="signaletique text-[17px] font-[650]">{reseau}</span>
      <RiArrowDownSLine aria-hidden className="size-4 text-icone-2" />
    </button>
  );
}

/** Mobile bottom plate: search first, then the three ways in. */
export function BarreMobile({
  onSearch,
  onRubrique,
  actif,
  className,
}: Pick<TopNavBarProps, 'onSearch' | 'onRubrique' | 'actif' | 'className'>) {
  return (
    <Panneau
      as="nav"
      aria-label="Navigation principale"
      className={cx('mx-3 mb-[max(12px,env(safe-area-inset-bottom))] p-2', className)}
    >
      <SearchTrigger onOpen={onSearch} size="lg" shortcut={false} className="w-full" />
      <div className="mt-1 grid grid-cols-3 gap-1">
        {RUBRIQUES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-label={r.aria}
            aria-pressed={actif === r.id}
            onClick={() => onRubrique(r.id)}
            className={cx(
              'flex h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-controle px-1 text-[12px] font-semibold',
              'transition-colors duration-150 ease-signal outline-none focus-visible:outline-2 focus-visible:outline-focus [&_svg]:size-5 [&_svg]:shrink-0',
              actif === r.id ? 'bg-selection text-selection-encre' : 'text-encre hover:bg-encart',
            )}
          >
            {r.icon}
            <span className="truncate">{r.label}</span>
          </button>
        ))}
      </div>
    </Panneau>
  );
}
