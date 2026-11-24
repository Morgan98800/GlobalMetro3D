import { RiArrowLeftSLine, RiArrowUpDownLine, RiBox3Line, RiCloseLine } from '@remixicon/react';
import { useState } from 'react';
import { BottomSheet, type DetentSheet } from './BottomSheet';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { ElevationProfile } from './ElevationProfile';
import { LineBadgeChip, type LineAlert } from './LineBadgeChip';
import { lineMode, lineName, resolveLine, type LineRef } from './lines';
import { Joint, Panneau } from './Panneau';
import { Thermometre, type ArretThermo, type RameThermo } from './Thermometre';

/**
 * Lignes du réseau (v2.1). Deux niveaux :
 *  1. Lignes : pastilles par mode + état du trafic.
 *  2. Ligne X : direction, trafic, indicateurs (Passionné), thermomètre, « Monter à bord ».
 * « Toutes » devient le retour « Toutes les lignes » ; le sélecteur de sens devient
 * une rangée Direction + Inverser ; « Voir sur la carte » disparaît (la sélection cadre déjà la ligne).
 */
export interface LigneEtat extends LineRef {
  alert?: LineAlert | null;
  message?: string;
  termini?: [string, string];
}

export interface LigneDetail {
  /** Terminus du sens affiché */
  direction: string;
  onInverser: () => void;
  trafic: { niveau: 'normal' | LineAlert; texte: string };
  /** Mode Passionné uniquement : Rames en ligne, Longueur, Matériel, Exploitation */
  indicateurs?: { label: string; valeur: string }[];
  arrets: ArretThermo[];
  rames?: RameThermo[];
  onArret?: (id: string) => void;
  onRame?: (id: string) => void;
  onCorrespondance?: (shortName: string) => void;
}

export interface LinesDockProps {
  lignes: LigneEtat[];
  selection?: string | null;
  onSelect: (shortName: string | null) => void;
  /** Absent en Passionné : le panneau est permanent */
  onClose?: () => void;
  detail?: LigneDetail | null;
  /** Paris uniquement */
  onMonter?: (shortName: string) => void;
  /** Mobile : la poignée remplace « Réduire / Ouvrir » */
  presentation?: 'cote' | 'basse';
  replie?: boolean;
  onReplier?: () => void;
  className?: string;
}

const GROUPES = [
  { mode: 'metro', titre: 'Métro' },
  { mode: 'rer', titre: 'RER' },
] as const;

export function LinesDock(p: LinesDockProps) {
  const choisie = p.lignes.find((l) => l.shortName === p.selection) ?? null;
  const basse = p.presentation === 'basse';
  const [cran, setCran] = useState<DetentSheet>(p.replie ? 'repli' : 'moyen');

  if (basse) {
    return (
      <BottomSheet
        cran={cran}
        onCran={(next) => {
          setCran(next);
          if ((next === 'repli') !== Boolean(p.replie)) {
            p.onReplier?.();
          }
        }}
        hauteurs={
          choisie
            ? { repli: 72, bas: 220, moyen: 460 }
            : { repli: 68, bas: 200, moyen: 328 }
        }
        repliable={!p.onClose}
        onDismiss={p.onClose}
        onSwipeBack={choisie ? () => p.onSelect(null) : p.onClose}
        ariaLabel={choisie ? `Ligne ${choisie.shortName}` : 'Lignes du réseau'}
        barreRepli={
          <div className="flex items-center justify-between gap-2">
            {choisie ? (
              <div className="flex min-w-0 items-center gap-2">
                <LineBadgeChip {...choisie} size="sm" />
                <span className="truncate text-[14px] font-semibold text-encre">
                  {lineName(choisie.shortName)}
                </span>
              </div>
            ) : (
              <span className="text-[14px] font-semibold text-encre">Lignes du réseau</span>
            )}
            <Button size="sm" variant="discret" onClick={() => setCran('moyen')}>
              Ouvrir
            </Button>
          </div>
        }
        className={p.className}
      >
        {choisie && p.detail ? <NiveauLigne {...p} ligne={choisie} detail={p.detail} replie={false} /> : <NiveauLignes {...p} replie={false} />}
      </BottomSheet>
    );
  }

  return (
    <Panneau
      as="section"
      aria-labelledby={choisie ? 'ligne-titre' : 'lignes-titre'}
      className={cx('flex max-h-full w-[348px] max-w-full flex-col', p.className)}
    >
      {choisie && p.detail ? <NiveauLigne {...p} ligne={choisie} detail={p.detail} /> : <NiveauLignes {...p} />}
    </Panneau>
  );
}

function NiveauLignes({ lignes, selection, onSelect, onClose, replie }: LinesDockProps) {
  const alertes = lignes.filter((l) => l.alert);
  return (
    <div className="min-h-0 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h2 id="lignes-titre" className="text-titre-sm text-encre">Lignes</h2>
        {onClose && <IconButton size="sm" label="Fermer les lignes" icon={<RiCloseLine aria-hidden />} onClick={onClose} className="pl-hit-44" />}
      </header>
      {!replie && (
        <>
          {GROUPES.map((g) => {
            const items = lignes.filter((l) => lineMode(l.shortName) === g.mode);
            if (!items.length) return null;
            return (
              <div key={g.mode} className="mt-3">
                <h3 className="mb-2 text-xs font-medium tracking-[0.04em] text-encre-2">{g.titre}</h3>
                <div className={g.mode === 'metro' ? 'grid grid-cols-7 gap-1.5 md:flex md:flex-wrap md:gap-[7px]' : 'flex flex-wrap gap-2 md:gap-[7px]'}>
                  {items.map((l) => (
                    <LineBadgeChip
                      key={l.shortName}
                      {...l}
                      size="md"
                      selected={selection === l.shortName}
                      onClick={() => onSelect(l.shortName)}
                      className="max-md:!h-[36px] max-md:!w-[36px] max-md:!text-[15px]"
                    />
                  ))}
                </div>
              </div>
            );
          })}
          <Joint className="my-4" />
          <EtatTrafic alertes={alertes} total={lignes.length} />
        </>
      )}
    </div>
  );
}

function EtatTrafic({ alertes, total }: { alertes: LigneEtat[]; total: number }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[13px] text-encre-2">
        <span aria-hidden className={cx('size-2 rounded-full', alertes.length ? 'bg-vigilance' : 'bg-normal')} />
        {alertes.length ? `${alertes.length} perturbation${alertes.length > 1 ? 's' : ''} (${total} lignes)` : 'Trafic normal'}
      </p>
      {alertes.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {alertes.map((l) => (
            <li key={l.shortName} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
              <LineBadgeChip {...l} size="xs" className="mt-px" />
              <p className="text-[13px] leading-[18px] text-encre-2">
                <span className={cx('font-semibold', l.alert === 'signal' ? 'text-signal-encre' : 'text-vigilance-encre')}>
                  {l.alert === 'signal' ? 'Interrompu. ' : 'Perturbé. '}
                </span>
                {l.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NiveauLigne({ ligne, detail, onSelect, onClose, onMonter, replie }: LinesDockProps & { ligne: LigneEtat; detail: LigneDetail }) {
  const { color } = resolveLine(ligne);
  const etat = detail.trafic.niveau;
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 pt-0.5 md:pt-1">
        <Button variant="secondaire" size="sm" icon={<RiArrowLeftSLine aria-hidden />} onClick={() => onSelect(null)}>
          Toutes les lignes
        </Button>
        {onClose && <IconButton variant="secondaire" size="sm" label="Fermer les lignes" icon={<RiCloseLine aria-hidden />} onClick={onClose} />}
      </div>
      <div className="shrink-0 px-4 pt-1.5 md:pt-2">
        <div className="flex items-center gap-2.5 md:gap-3">
          <LineBadgeChip {...ligne} size="lg" />
          <div className="min-w-0">
            <h2 id="ligne-titre" className="text-titre-sm text-encre">{lineName(ligne.shortName)}</h2>
            {ligne.termini && <p className="signaletique truncate text-[14px] md:text-[15px] text-encre-2">{ligne.termini[0]} – {ligne.termini[1]}</p>}
          </div>
        </div>
        <span aria-hidden className="mt-2 block h-[4px] md:mt-3 md:h-[5px] rounded-full" style={{ backgroundColor: color }} />
        {!replie && (
          <>
            <div className="mt-2 flex items-center justify-between gap-2 md:mt-3">
              <div className="pl-cartouche min-w-0">
                <span>
                  <b className="truncate">→ {detail.direction}</b>
                </span>
              </div>
              <IconButton size="sm" variant="secondaire" label="Inverser la direction" icon={<RiArrowUpDownLine aria-hidden />} onClick={detail.onInverser} />
            </div>
            {etat !== 'normal' && (
              <p className="mt-2 flex items-start gap-2 text-[13px] leading-[18px] text-encre-2 md:mt-2.5">
                <span aria-hidden className={cx('mt-[5px] size-2 shrink-0 rounded-full', etat === 'signal' ? 'bg-signal' : 'bg-vigilance')} />
                {detail.trafic.texte}
              </p>
            )}
          </>
        )}
      </div>
      {!replie && (
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 md:mt-3 md:pb-3">
          <Thermometre
            couleur={color}
            ligne={ligne.shortName}
            arrets={detail.arrets}
            rames={detail.rames}
            onArret={detail.onArret}
            onRame={detail.onRame}
            onCorrespondance={detail.onCorrespondance}
          />
        </div>
      )}
      {onMonter && (
        <footer className="shrink-0 border-t border-joint p-2.5 md:p-3">
          <Button variant="afficheur" fullWidth icon={<RiBox3Line aria-hidden />} aria-label="Monter à bord d’une rame en 3D" onClick={() => onMonter(ligne.shortName)}>
            Monter à bord
          </Button>
        </footer>
      )}
    </>
  );
}
