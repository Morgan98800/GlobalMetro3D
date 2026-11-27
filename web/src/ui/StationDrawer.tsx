import {
  RiBox3Line,
  RiBriefcase4Line,
  RiCloseLine,
  RiCompass3Line,
  RiHome5Line,
  RiMore2Line,
  RiRouteLine,
  RiShareForwardLine,
  RiWheelchairLine,
} from '@remixicon/react';
import { useState } from 'react';
import type { GuimardInfo, StationExit } from '../data/paris_station_heritage';
import { BottomSheet, type DetentSheet } from './BottomSheet';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { LineBadgeChip, type LineAlert } from './LineBadgeChip';
import type { LineRef } from './lines';
import { MenuBouton } from './Menu';
import { Panneau } from './Panneau';
import { Passages, type DepartGroupe } from './Passages';
import { Plaque } from './Plaque';
import { useIsDesktop } from './useMediaQuery';

/**
 * Fiche station (v2.1 + refonte 3 crans).
 * Mobile : feuille BottomSheet à 3 crans ('bas' | 'moyen' | 'haut') + barre d'actions 1 ligne.
 * Desktop : panneau latéral flottant conservé à l'identique.
 */
export interface StationInfo {
  nom: string;
  lignes: Array<LineRef & { alert?: LineAlert | null }>;
  /** « Paris 10e. Sortie conseillée : boulevard de Strasbourg. » */
  contexte?: string;
  accessible?: boolean;
  /** Mode Passionné : rang d'affluence sur le réseau (données ouvertes) */
  rangReseau?: string;
  alerte?: { niveau: LineAlert; texte: string } | null;
  guimard?: GuimardInfo | null;
  sorties?: StationExit[];
}

export interface StationDrawerProps {
  station: StationInfo;
  groupes: DepartGroupe[];
  direct?: boolean;
  passionne?: boolean;
  domicile?: boolean;
  travail?: boolean;
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
  const { station, groupes, direct = true, passionne = false, domicile, travail } = props;
  const [cran, setCran] = useState<DetentSheet>('bas');
  const [sortiesExpanded, setSortiesExpanded] = useState(false);
  const [prevNom, setPrevNom] = useState(station.nom);
  if (prevNom !== station.nom) {
    setPrevNom(station.nom);
    setCran('bas');
    setSortiesExpanded(false);
  }

  const size = basse ? 'md' : 'sm';
  const pad = basse ? 'px-4' : 'px-5';

  const body = (
    <>
      <div className={cx('border-b border-joint pb-3', basse ? 'pt-1' : 'pt-4')}>
        <div className={cx('flex items-center gap-1', pad)}>
          <div className="min-w-0 flex-1 pr-1">
            <Plaque as="h2" id="station-titre" size="md">
              {station.nom}
            </Plaque>
          </div>
          <MenuBouton
            label="Plus d’actions"
            icon={<RiMore2Line aria-hidden />}
            defaultOpen={props.menuOuvert}
            entrees={[
              {
                label: 'Partager',
                icon: <RiShareForwardLine aria-hidden />,
                onSelect: props.onPartager,
              },
              {
                label: domicile ? 'Retirer domicile' : 'Domicile',
                icon: <RiHome5Line aria-hidden />,
                onSelect: props.onDomicile,
              },
              {
                label: travail ? 'Retirer travail' : 'Travail',
                icon: <RiBriefcase4Line aria-hidden />,
                onSelect: props.onTravail,
              },
            ]}
          />
          <IconButton
            size="sm"
            variant="secondaire"
            label="Fermer"
            icon={<RiCloseLine aria-hidden />}
            onClick={props.onClose}
          />
        </div>

        <div className={cx('flex flex-wrap items-center gap-1.5 pt-2.5', pad)}>
          {station.lignes.map((l) => (
            <LineBadgeChip
              key={l.shortName}
              {...l}
              size="md"
              onClick={() => props.onLigne(l.shortName)}
            />
          ))}
          {station.accessible && (
            <span className="ml-1 inline-flex h-7 items-center gap-1 rounded-[7px] bg-encart/90 px-2 text-[12px] font-semibold text-encre-2">
              <RiWheelchairLine aria-hidden className="size-4" />
              Accessible
            </span>
          )}
          {station.guimard && (
            <span
              title={station.guimard.note}
              aria-label={`Guimard · ${station.guimard.year} — ${station.guimard.note}`}
              className="chiffres inline-flex h-7 items-center rounded-[7px] bg-[#14533c] px-2 text-[11.5px] font-semibold text-[#ecfdf5] dark:bg-[#14533c] dark:text-[#ecfdf5]"
            >
              Guimard · {station.guimard.year}
            </span>
          )}
          {passionne && station.rangReseau && (
            <span className="chiffres inline-flex h-7 items-center rounded-[7px] border border-bord bg-surface/85 px-2 text-[11px] font-semibold text-encre-2">
              {station.rangReseau}
            </span>
          )}
        </div>
        {station.contexte && (
          <p className={cx('pt-2 text-[13px] leading-[18px] text-encre-2', pad)}>
            {station.contexte}
          </p>
        )}
        {station.alerte && (
          <p
            className={cx(
              'flex items-start gap-2 pt-2 text-[13px] leading-[18px] text-encre-2',
              pad
            )}
          >
            <span
              aria-hidden
              className={cx(
                'mt-[5px] size-2 shrink-0 rounded-full',
                station.alerte.niveau === 'signal' ? 'bg-signal' : 'bg-vigilance'
              )}
            />
            <span>
              <span
                className={cx(
                  'font-semibold',
                  station.alerte.niveau === 'signal' ? 'text-signal-encre' : 'text-vigilance-encre'
                )}
              >
                {station.alerte.niveau === 'signal' ? 'Interrompu. ' : 'Perturbé. '}
              </span>
              {station.alerte.texte}
            </span>
          </p>
        )}
      </div>

      <div
        className={cx(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4',
          pad,
          basse ? 'pb-3' : 'pb-4'
        )}
      >
        <Passages
          groupes={groupes}
          direct={direct}
          passionne={passionne}
          onLigne={props.onLigne}
          onSuivre={props.onSuivre}
        />

        {station.sorties && station.sorties.length > 0 && (
          <section aria-label="Sorties" className="mt-4 border-t border-joint pt-3.5">
            <header className="flex items-center justify-between pb-2">
              <h3 className="text-[13px] font-semibold text-encre-2">Sorties</h3>
              <span className="chiffres text-[12px] font-medium text-encre-3">
                {station.sorties.length} accès
              </span>
            </header>
            <ul className="space-y-1.5">
              {(sortiesExpanded ? station.sorties : station.sorties.slice(0, 4)).map((s) => (
                <li
                  key={`${s.num}-${s.label}`}
                  className="flex items-start gap-2.5 py-1 text-[13px] leading-[18px]"
                >
                  <span
                    aria-hidden
                    className="chiffres mt-[1px] inline-flex h-[24px] min-w-[24px] shrink-0 items-center justify-center rounded-[5px] bg-[#003CA6] px-1 text-[12px] font-bold text-white tabular-nums"
                  >
                    {s.num}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-encre">
                      <span className="sr-only">Sortie {s.num} : </span>
                      {s.label}
                    </span>
                    {s.landmark && (
                      <p className="text-[12px] leading-[16px] text-encre-3">{s.landmark}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {station.sorties.length > 4 && (
              <button
                type="button"
                aria-expanded={sortiesExpanded}
                onClick={() => setSortiesExpanded((prev) => !prev)}
                className={cx(
                  'mt-2 inline-flex w-full items-center justify-center rounded-[10px] border border-bord bg-encart/75 px-3 py-2 text-[12.5px] font-semibold text-encre-2 transition-colors hover:bg-encart hover:text-encre focus-visible:outline-2 focus-visible:outline-focus',
                  basse && 'min-h-[44px]'
                )}
              >
                {sortiesExpanded ? 'Réduire' : `Voir les ${station.sorties.length} sorties`}
              </button>
            )}
          </section>
        )}
      </div>

      <footer
        className={cx(
          'shrink-0 border-t border-joint bg-surface pt-3',
          pad,
          basse ? 'pb-[max(14px,env(safe-area-inset-bottom))]' : 'pb-5'
        )}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="primaire"
            size={size}
            className={basse ? 'min-h-[44px] px-3' : undefined}
            icon={<RiRouteLine aria-hidden />}
            onClick={props.onYAller}
          >
            Y aller
          </Button>
          <Button
            variant="secondaire"
            size={size}
            className={basse ? 'min-h-[44px] px-3' : undefined}
            icon={<RiCompass3Line aria-hidden />}
            onClick={props.onPartir}
          >
            Partir d’ici
          </Button>
        </div>
        {props.onQuai3D && (
          <div className="mt-3">
            <Button
              variant="afficheur"
              size={size}
              fullWidth
              icon={<RiBox3Line aria-hidden />}
              onClick={props.onQuai3D}
            >
              Prendre le train en 3D
            </Button>
          </div>
        )}
      </footer>
    </>
  );

  if (basse) {
    return (
      <BottomSheet
        cran={cran}
        onCran={setCran}
        hauteurs={{ bas: 396, moyen: 480 }}
        onDismiss={props.onClose}
        onSwipeBack={props.onClose}
        ariaLabel={`Fiche station ${station.nom}`}
        className={props.className}
      >
        {body}
      </BottomSheet>
    );
  }

  return (
    <Panneau
      matiere="feuille"
      as="section"
      role="dialog"
      aria-labelledby="station-titre"
      className={cx(
        'flex max-h-full min-h-0 flex-col overflow-hidden animate-feuille',
        props.className
      )}
    >
      {body}
    </Panneau>
  );
}
