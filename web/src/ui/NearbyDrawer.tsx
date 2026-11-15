import { RiCloseLine, RiFocus3Line } from '@remixicon/react';
import { Afficheur, type Passage } from './Afficheur';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { formatNombre } from './format';
import { LineBadgeChip } from './LineBadgeChip';
import type { LineRef } from './lines';
import { Panneau } from './Panneau';
import { useIsDesktop } from './useMediaQuery';
import { useSheetSwipe } from './useSheetSwipe';

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
    texte: 'La localisation est bloquée pour ce site. Autorisez-la dans les réglages du navigateur, ou cherchez une station.',
    principal: 'rechercher',
  },
  indisponible: {
    texte: 'Votre position n’a pas pu être déterminée. Vérifiez que la localisation de l’appareil est activée.',
    principal: 'reessayer',
  },
  delai: { texte: 'La localisation met trop de temps à répondre. Réessayez, de préférence à découvert.', principal: 'reessayer' },
};


export function NearbyDrawer(p: NearbyDrawerProps) {
  const desktop = useIsDesktop();
  const basse = (p.presentation ?? (desktop ? 'cote' : 'basse')) === 'basse';
  const swipe = useSheetSwipe({ enabled: basse, onSwipeDown: p.onClose });
  const pad = basse ? 'px-4' : 'px-5';
  return (
    <Panneau
      matiere="feuille"
      as="section"
      role="dialog"
      aria-labelledby="autour-titre"
      className={cx('flex min-h-0 flex-col animate-feuille', basse ? 'max-h-[80dvh] rounded-b-none' : 'max-h-full', p.className)}
    >
      {basse && (
        <div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} className="flex shrink-0 justify-center pt-2 pb-1">
          <span aria-hidden className="h-1 w-9 rounded-full bg-bord-fort" />
        </div>
      )}
      <div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} className={cx('flex items-start justify-between gap-2', pad, basse ? 'pt-2' : 'pt-5')}>
        <div>
          <h2 id="autour-titre" className="text-titre text-encre">Autour de moi</h2>
          {p.etat === 'pret' && p.precision != null && (
            <p className="mt-0.5 text-[13px] text-encre-2">Position à {p.precision} m près, temps à pied estimés.</p>
          )}
        </div>
        <IconButton size="sm" label="Fermer" icon={<RiCloseLine aria-hidden />} onClick={p.onClose} />
      </div>

      <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4', pad, basse ? 'pb-[max(16px,env(safe-area-inset-bottom))]' : 'pb-5')}>
        {p.etat === 'chargement' && (
          <p className="carrelage flex items-center justify-center gap-2 rounded-[12px] px-4 py-8 text-[14px] text-encre-2">
            <RiFocus3Line aria-hidden className="size-5 animate-pulse text-icone-2" />
            Recherche de votre position…
          </p>
        )}

        {p.etat === 'erreur' && p.erreur && <Erreur type={p.erreur} onReessayer={p.onReessayer} onRechercher={p.onRechercher} />}

        {p.etat === 'pret' && p.stations.length === 0 && (
          <div className="carrelage rounded-[12px] px-4 py-7 text-center">
            <p className="text-[14px] text-encre-2">Aucune station à moins de 15 minutes à pied.</p>
            <Button className="mt-3" onClick={p.onRechercher}>Rechercher une station</Button>
          </div>
        )}

        {p.etat === 'pret' && p.stations.length > 0 && (
          <ul className="divide-y divide-joint border-y border-joint">
            {p.stations.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => p.onStation(s.id)}
                  className="-mx-2 grid w-[calc(100%+16px)] grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-3 text-start outline-none transition-colors duration-150 ease-signal hover:bg-encart focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="text-center">
                    <span className="chiffres block text-[22px] font-bold leading-none text-encre">{s.minutes}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-[13px] text-encre-3">min<br />à pied</span>
                  </span>
                  <span className="min-w-0">
                    <span className="signaletique block truncate text-[16px] font-semibold leading-[20px] text-encre">{s.nom}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {s.lignes.map((l) => <LineBadgeChip key={l.shortName} {...l} size="xs" />)}
                      <span className="chiffres ml-1 text-legende text-encre-3">{formatNombre(s.metres)} m</span>
                    </span>
                  </span>
                  <Afficheur passages={s.passages} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panneau>
  );
}

function Erreur({ type, onReessayer, onRechercher }: { type: ErreurPosition; onReessayer: () => void; onRechercher: () => void }) {
  const e = ERREURS[type];
  const reessayer = (v: 'primaire' | 'secondaire') => <Button key="r" variant={v} onClick={onReessayer}>Réessayer</Button>;
  const rechercher = (v: 'primaire' | 'secondaire') => <Button key="s" variant={v} onClick={onRechercher}>Rechercher une station</Button>;
  return (
    <div className="rounded-[12px] bg-encart p-4">
      <p className="text-[14px] leading-[20px] text-encre">{e.texte}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {e.principal === 'reessayer' ? [reessayer('primaire'), rechercher('secondaire')] : [rechercher('primaire'), reessayer('secondaire')]}
      </div>
    </div>
  );
}
