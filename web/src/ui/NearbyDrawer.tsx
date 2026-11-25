import { RiCloseLine, RiFocus3Line } from '@remixicon/react';
import { useState } from 'react';
import { Afficheur, type Passage } from './Afficheur';
import { BottomSheet, type DetentSheet } from './BottomSheet';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { formatNombre } from './format';
import { LineBadgeChip } from './LineBadgeChip';
import type { LineRef } from './lines';
import { Panneau } from './Panneau';
import { useIsDesktop } from './useMediaQuery';

/**
 * Autour de moi (v2.1). Des rangées, pas des cartes : temps à pied d’abord
 * (c’est ce qui décide), puis la station, puis les deux prochains départs, chacun
 * marqué de l’onglet couleur de sa ligne. Pas de « Fermer » en pied (× en en-tête).
 */
export interface StationProche {
  id: string;
  nom: string;
  lignes: LineRef[];
  minutes: number;
  metres: number;
  /** Les deux prochains départs toutes lignes confondues, avec `ligne` renseignée */
  passages: Passage[];
}

export type ErreurPosition = 'refus' | 'indisponible' | 'delai';

export interface NearbyDrawerProps {
  etat: 'chargement' | 'pret' | 'erreur';
  erreur?: ErreurPosition;
  stations: StationProche[];
  /** Précision de la position, en mètres */
  precision?: number;
  onStation: (id: string) => void;
  onReessayer: () => void;
  onRechercher: () => void;
  onClose: () => void;
  presentation?: 'cote' | 'basse';
  className?: string;
}

const ERREURS: Record<ErreurPosition, { texte: string; principal: 'reessayer' | 'rechercher' }> = {
  refus: {
    texte: 'Localisation refusée.',
    principal: 'rechercher',
  },
  indisponible: {
    texte: 'Position indisponible.',
    principal: 'reessayer',
  },
  delai: { texte: 'Délai de localisation dépassé.', principal: 'reessayer' },
};

export function NearbyDrawer(p: NearbyDrawerProps) {
  const desktop = useIsDesktop();
  const basse = (p.presentation ?? (desktop ? 'cote' : 'basse')) === 'basse';
  const [cran, setCran] = useState<DetentSheet>('moyen');
  const pad = basse ? 'px-4' : 'px-5';

  const body = (
    <>
      <div className={cx('flex items-center justify-between gap-2', pad, basse ? 'pt-1' : 'pt-4')}>
        <h2 id="autour-titre" className="text-titre text-encre">
          Autour
        </h2>
        <IconButton
          size="sm"
          label="Fermer"
          icon={<RiCloseLine aria-hidden />}
          onClick={p.onClose}
        />
      </div>

      <div
        className={cx(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3',
          pad,
          basse ? 'pb-[max(16px,env(safe-area-inset-bottom))]' : 'pb-5'
        )}
      >
        {p.etat === 'chargement' && (
          <p className="flex items-center justify-center gap-2 rounded-[12px] bg-encart/60 px-4 py-7 text-[13px] text-encre-2">
            <RiFocus3Line aria-hidden className="size-4 animate-pulse text-icone-2" />
            Localisation…
          </p>
        )}

        {p.etat === 'erreur' && p.erreur && (
          <Erreur type={p.erreur} onReessayer={p.onReessayer} onRechercher={p.onRechercher} />
        )}

        {p.etat === 'pret' && p.stations.length === 0 && (
          <div className="rounded-[12px] bg-encart/60 px-4 py-6 text-center">
            <p className="text-[13px] text-encre-2">Aucune station proche.</p>
            <Button className="mt-3" size="sm" onClick={p.onRechercher}>
              Rechercher
            </Button>
          </div>
        )}

        {p.etat === 'pret' && p.stations.length > 0 && (
          <ul className="divide-y divide-joint border-y border-joint">
            {p.stations.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => p.onStation(s.id)}
                  className="-mx-2 grid min-h-[56px] w-[calc(100%+16px)] grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-3 text-start outline-none transition-colors duration-150 ease-signal hover:bg-encart focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="text-center">
                    <span className="chiffres block text-[22px] font-bold leading-none text-encre">
                      {s.minutes}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-[13px] text-encre-3">
                      min
                      <br />à pied
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="signaletique block truncate text-[16px] font-semibold leading-[20px] text-encre">
                      {s.nom}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {s.lignes.map((l) => (
                        <LineBadgeChip key={l.shortName} {...l} size="xs" />
                      ))}
                      <span className="chiffres ml-1 text-legende text-encre-3">
                        {formatNombre(s.metres)} m
                      </span>
                    </span>
                  </span>
                  <Afficheur passages={s.passages} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  if (basse) {
    return (
      <BottomSheet
        cran={cran}
        onCran={setCran}
        onDismiss={p.onClose}
        ariaLabel="Stations autour de moi"
        className={p.className}
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
      aria-labelledby="autour-titre"
      className={cx('flex max-h-full min-h-0 flex-col animate-feuille', p.className)}
    >
      {body}
    </Panneau>
  );
}

function Erreur({
  type,
  onReessayer,
  onRechercher,
}: {
  type: ErreurPosition;
  onReessayer: () => void;
  onRechercher: () => void;
}) {
  const e = ERREURS[type];
  const reessayer = (v: 'primaire' | 'secondaire') => (
    <Button key="r" variant={v} onClick={onReessayer}>
      Réessayer
    </Button>
  );
  const rechercher = (v: 'primaire' | 'secondaire') => (
    <Button key="s" variant={v} onClick={onRechercher}>
      Rechercher une station
    </Button>
  );
  return (
    <div className="rounded-[12px] bg-encart p-4">
      <p className="text-[14px] leading-[20px] text-encre">{e.texte}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {e.principal === 'reessayer'
          ? [reessayer('primaire'), rechercher('secondaire')]
          : [rechercher('primaire'), reessayer('secondaire')]}
      </div>
    </div>
  );
}
