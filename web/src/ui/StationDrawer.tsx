import {
  RiBox3Line, RiBriefcase4Line, RiCloseLine, RiHome5Line, RiMore2Line, RiRouteLine, RiShareForwardLine,
  RiStarFill, RiStarLine, RiWheelchairLine,
} from '@remixicon/react';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { LineBadgeChip, type LineAlert } from './LineBadgeChip';
import type { LineRef } from './lines';
import { MenuBouton } from './Menu';
import { Panneau } from './Panneau';
import { Passages, type DepartGroupe } from './Passages';
import { Plaque } from './Plaque';
import { useIsDesktop } from './useMediaQuery';
import { useSheetSwipe } from './useSheetSwipe';

/**
 * Fiche station (v2.1, après arbitrage). Trois boutons visibles :
 * « Y aller » (primaire), « Partir d’ici » (secondaire), « Voir le quai en 3D » (afficheur).
 * En-tête : favori, menu des actions rares, fermer. Les pastilles ouvrent la ligne.
 * Supprimés : tuiles Domicile/Travail/Partager (→ menu), « Ligne X » (= pastilles),
 * « Zoom 3D » (la sélection cadre déjà la station).
 */
export interface StationInfo {
  nom: string;
  lignes: Array<LineRef & { alert?: LineAlert | null }>;
  /** « Paris 10e. Sortie conseillée : boulevard de Strasbourg. » */
  contexte?: string;
  accessible?: boolean;
  alerte?: { niveau: LineAlert; texte: string } | null;
}

export interface StationDrawerProps {
  station: StationInfo;
  groupes: DepartGroupe[];
  direct?: boolean;
  favori?: boolean;
  domicile?: boolean;
  travail?: boolean;
  onFavori: () => void;
  onDomicile: () => void;
  onTravail: () => void;
  onPartager: () => void;
  onYAller: () => void;
  onPartir: () => void;
  /** Paris uniquement ; absent ailleurs */
  onQuai3D?: () => void;
  onLigne: (shortName: string) => void;
  onClose: () => void;
  /** Mode Passionné : les horaires deviennent des boutons « Suivre la rame » */
  onSuivre?: (groupe: number, passage: number) => void;
  /** 'cote' : bureau. 'basse' : feuille basse mobile. Automatique par défaut. */
  presentation?: 'cote' | 'basse';
  /** Ouvre le menu au montage (maquettes) */
  menuOuvert?: boolean;
  className?: string;
}

export function StationDrawer(props: StationDrawerProps) {
  const desktop = useIsDesktop();
  const basse = (props.presentation ?? (desktop ? 'cote' : 'basse')) === 'basse';
  const swipe = useSheetSwipe({ enabled: basse, onSwipeDown: props.onClose });
  const { station, groupes, direct = true, favori, domicile, travail } = props;
  const size = basse ? 'lg' : 'md';
  const pad = basse ? 'px-4' : 'px-5';
  return (
    <Panneau
      matiere="feuille"
      as="section"
      role="dialog"
      aria-labelledby="station-titre"
      className={cx('flex min-h-0 flex-col animate-feuille', basse ? 'max-h-[86dvh] rounded-b-none' : 'max-h-full', props.className)}
    >
      {basse && (
        <div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} className="flex shrink-0 justify-center pt-2 pb-1">
          <span aria-hidden className="h-1 w-9 rounded-full bg-bord-fort" />
        </div>
      )}

      <div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} className={cx('flex items-start gap-1', pad, basse ? 'pt-2' : 'pt-5')}>
        <div className="min-w-0 flex-1 pr-1">
          <Plaque as="h2" id="station-titre" size="md">{station.nom}</Plaque>
        </div>
        <IconButton
          size="sm"
          label="Favori"
          pressed={!!favori}
          onClick={props.onFavori}
          icon={favori ? <RiStarFill aria-hidden /> : <RiStarLine aria-hidden />}
        />
        <MenuBouton
          label="Plus d’actions"
          icon={<RiMore2Line aria-hidden />}
          defaultOpen={props.menuOuvert}
          entrees={[
            { label: 'Partager la station', icon: <RiShareForwardLine aria-hidden />, onSelect: props.onPartager },
            { label: domicile ? 'Ne plus utiliser comme domicile' : 'Utiliser comme domicile', icon: <RiHome5Line aria-hidden />, onSelect: props.onDomicile },
            { label: travail ? 'Ne plus utiliser comme travail' : 'Utiliser comme travail', icon: <RiBriefcase4Line aria-hidden />, onSelect: props.onTravail },
          ]}
        />
        <IconButton size="sm" label="Fermer la fiche" icon={<RiCloseLine aria-hidden />} onClick={props.onClose} />
      </div>

      <div className={cx('flex flex-wrap items-center gap-1.5 pt-3', pad)}>
        {station.lignes.map((l) => (
          <LineBadgeChip key={l.shortName} {...l} size="md" onClick={() => props.onLigne(l.shortName)} />
        ))}
        {station.accessible && (
          <span className="ml-1 inline-flex h-7 items-center gap-1 rounded-[7px] bg-encart px-2 text-[12px] font-semibold text-encre-2">
            <RiWheelchairLine aria-hidden className="size-4" />
            Accessible en fauteuil
          </span>
        )}
      </div>
      {station.contexte && <p className={cx('pt-2.5 text-[13px] leading-[18px] text-encre-2', pad)}>{station.contexte}</p>}
      {station.alerte && (
        <p className={cx('flex items-start gap-2 pt-2.5 text-[13px] leading-[18px] text-encre-2', pad)}>
          <span aria-hidden className={cx('mt-[5px] size-2 shrink-0 rounded-full', station.alerte.niveau === 'signal' ? 'bg-signal' : 'bg-vigilance')} />
          <span>
            <span className={cx('font-semibold', station.alerte.niveau === 'signal' ? 'text-signal-encre' : 'text-vigilance-encre')}>
              {station.alerte.niveau === 'signal' ? 'Interrompu. ' : 'Perturbé. '}
            </span>
            {station.alerte.texte}
          </span>
        </p>
      )}

      <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain pt-5', pad, basse ? 'pb-3' : 'pb-4')}>
        <Passages groupes={groupes} direct={direct} onLigne={props.onLigne} onSuivre={props.onSuivre} />
      </div>

      <footer className={cx('shrink-0 border-t border-joint pt-3', pad, basse ? 'pb-[max(16px,env(safe-area-inset-bottom))]' : 'pb-5')}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primaire" size={size} icon={<RiRouteLine aria-hidden />} onClick={props.onYAller}>
            Y aller
          </Button>
          <Button variant="secondaire" size={size} onClick={props.onPartir}>
            Partir d’ici
          </Button>
        </div>
        {props.onQuai3D && (
          <Button variant="afficheur" size={size} fullWidth className="mt-2" icon={<RiBox3Line aria-hidden />} onClick={props.onQuai3D}>
            Voir le quai en 3D
          </Button>
        )}
      </footer>
    </Panneau>
  );
}
