import { RiArrowDownSLine, RiMenuLine, RiSteering2Line } from '@remixicon/react';
import type { ReactNode } from 'react';
import { Horloge } from './Afficheur';
import { LineBadgeChip } from './LineBadgeChip';
import type { LineRef } from './lines';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { Marque } from './Marque';
import { Panneau } from './Panneau';
import { Plaque } from './Plaque';
import { Poussoir } from './plan-lumineux/PlanLumineux';
import { SearchTrigger } from './SearchTrigger';
import { Segmented } from './Segmented';
import { IconBibliotheque, IconItineraire, IconLignes } from './TransitIcons';
import { useIsDesktop, useMediaQuery } from './useMediaQuery';

/**
 * Top bar. Desktop: one unified plate (network, search, the three ways in,
 * clock, and menu/settings grouped cleanly together).
 */
export type Experience = 'simple' | 'passionne';
export type Rubrique = 'itineraire' | 'lignes' | 'bibliotheque';

export interface TopNavBarProps {
  reseau: string;
  onReseau?: () => void;
  onSearch: () => void;
  onRubrique: (r: Rubrique) => void;
  actif?: Rubrique | null;
  experience: Experience;
  onExperience: (e: Experience) => void;
  onMenu: () => void;
  /** Le menu est ouvert (aria-expanded) */
  menuOuvert?: boolean;
  /** Ligne sélectionnée : sa pastille remplace l’icône du bouton Lignes */
  ligneActive?: LineRef | null;
  horloge?: Date;
  /** Mode grand public : masque l’horloge et le sélecteur Simple/Passionné de la barre en mode Simple */
  compact?: boolean;
  /** Accès direct au simulateur de conduite 3D (Paris) */
  onSimulateur?: () => void;
  className?: string;
}

const RUBRIQUES: { id: Rubrique; label: string; icon: ReactNode; aria?: string }[] = [
  { id: 'itineraire', label: 'Itinéraire', icon: <IconItineraire className="size-4 shrink-0" /> },
  // Accessible name contains the visible label (WCAG 2.5.3)
  {
    id: 'lignes',
    label: 'Lignes',
    icon: <IconLignes className="size-4 shrink-0" />,
    aria: 'Lignes, choisir une ligne',
  },
  {
    id: 'bibliotheque',
    label: 'Bibliothèque',
    icon: <IconBibliotheque className="size-4 shrink-0" />,
    aria: 'Bibliothèque, rames 3D et histoire',
  },
];

export function TopNavBar(props: TopNavBarProps) {
  const desktop = useIsDesktop();
  const large = useMediaQuery('(min-width: 1024px)', true);
  const {
    reseau,
    onReseau,
    onSearch,
    onRubrique,
    actif,
    experience,
    onExperience,
    onMenu,
    horloge,
    className,
    ligneActive,
  } = props;
  const icone = (r: (typeof RUBRIQUES)[number]) =>
    r.id === 'lignes' && ligneActive ? (
      <span className="inline-flex h-4 items-center gap-1 leading-none">
        {r.icon}
        <LineBadgeChip {...ligneActive} size="xs" className="!h-[18px] !w-[18px] !text-[10px]" />
      </span>
    ) : (
      r.icon
    );
  return (
    <header
      id="topbar"
      className={cx(
        'pointer-events-none flex items-center gap-3 px-3 pt-[max(12px,env(safe-area-inset-top))] md:px-4 md:pt-3.5',
        className
      )}
    >
      <div className="pl-barre pointer-events-auto max-w-[calc(100vw-1.5rem)] min-w-0 !gap-1.5 md:max-w-[calc(100vw-2rem)]">
        <ReseauButton reseau={reseau} onClick={onReseau} />
        {desktop && (
          <>
            <SearchTrigger
              onOpen={onSearch}
              size="sm"
              shortcut={false}
              className="w-[144px] xl:w-[172px] flex-none"
            />
            <nav aria-label="Rubriques" className="flex items-center gap-1">
              {RUBRIQUES.map((r) =>
                large ? (
                  <Button
                    key={r.id}
                    size="sm"
                    variant="discret"
                    icon={icone(r)}
                    lampe
                    pressed={actif === r.id}
                    onClick={() => onRubrique(r.id)}
                  >
                    {r.label}
                    {r.id === 'lignes' && <span className="pl-sr">, choisir une ligne</span>}
                    {r.id === 'bibliotheque' && (
                      <span className="pl-sr">, rames 3D et histoire</span>
                    )}
                  </Button>
                ) : (
                  <IconButton
                    key={r.id}
                    size="sm"
                    label={r.aria ?? r.label}
                    icon={icone(r)}
                    pressed={actif === r.id}
                    onClick={() => onRubrique(r.id)}
                  />
                )
              )}
              {props.onSimulateur &&
                (large ? (
                  <Button
                    size="sm"
                    variant="discret"
                    icon={<RiSteering2Line aria-hidden className="size-4 shrink-0" />}
                    onClick={props.onSimulateur}
                    className="active:scale-[0.97] motion-reduce:active:scale-100"
                  >
                    Simulateur
                  </Button>
                ) : (
                  <IconButton
                    size="sm"
                    label="Simulateur de conduite 3D"
                    icon={<RiSteering2Line aria-hidden className="size-4 shrink-0" />}
                    onClick={props.onSimulateur}
                    className="active:scale-[0.97] motion-reduce:active:scale-100"
                  />
                ))}
            </nav>
          </>
        )}
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
            className="w-[176px]"
          />
        )}
        <IconButton
          size="sm"
          variant="secondaire"
          label="Menu et réglages"
          icon={<RiMenuLine aria-hidden />}
          expanded={props.menuOuvert}
          onClick={onMenu}
          className="shrink-0"
        />
      </div>
    </header>
  );
}

function ReseauButton({ reseau, onClick }: { reseau: string; onClick?: () => void }) {
  const label = reseau ? reseau.charAt(0).toUpperCase() + reseau.slice(1) : '';
  if (!onClick) {
    return (
      <Plaque size="sm" className="shrink-0">
        <Marque size={20} />
        <span>{label}</span>
      </Plaque>
    );
  }
  return (
    <Poussoir
      taille="sm"
      variante="discret"
      onClick={onClick}
      aria-label={`Réseau : ${label}. Changer de réseau`}
      icone={<Marque size={20} />}
      className="max-md:min-h-[44px]"
    >
      <span className="signaletique text-[16px] font-[650]">{label}</span>
      <RiArrowDownSLine aria-hidden className="size-4 text-icone-2" />
    </Poussoir>
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
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {RUBRIQUES.map((r) => (
          <Poussoir
            key={r.id}
            tuile
            lampe
            pressed={actif === r.id}
            aria-label={r.aria}
            icone={r.icon}
            className="!px-2 !text-[12px]"
            onClick={() => onRubrique(r.id)}
          >
            <span className="truncate">{r.label}</span>
          </Poussoir>
        ))}
      </div>
    </Panneau>
  );
}
