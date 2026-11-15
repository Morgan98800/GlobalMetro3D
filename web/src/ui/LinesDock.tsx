import { RiArrowLeftSLine, RiArrowUpDownLine, RiBox3Line, RiCloseLine } from '@remixicon/react';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { LineBadgeChip, type LineAlert } from './LineBadgeChip';
import { lineMode, lineName, resolveLine, type LineRef } from './lines';
import { Joint, Panneau } from './Panneau';
import { Thermometre, type ArretThermo, type RameThermo } from './Thermometre';
import { useSheetSwipe } from './useSheetSwipe';

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
  const swipe = useSheetSwipe({
    enabled: basse,
    onSwipeDown: () => {
      if (!p.replie && p.onReplier) p.onReplier();
      else p.onClose?.();
    },
    onSwipeUp: () => {
      if (p.replie && p.onReplier) p.onReplier();
    },
  });
  return (
    <Panneau
      as="section"
      aria-labelledby={choisie ? 'ligne-titre' : 'lignes-titre'}
      className={cx('flex max-h-full w-[372px] max-w-full flex-col', basse && 'w-full rounded-b-none', p.className)}
    >
      {basse && (
        <button
          type="button"
          onClick={p.onReplier}
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
          aria-expanded={!p.replie}
          aria-label={p.replie ? 'Agrandir les lignes' : 'Réduire les lignes'}
          className="mx-auto flex h-7 w-24 shrink-0 items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-bord-fort" />
        </button>
      )}
      {choisie && p.detail ? <NiveauLigne {...p} ligne={choisie} detail={p.detail} /> : <NiveauLignes {...p} />}
    </Panneau>
  );
}

function NiveauLignes({ lignes, selection, onSelect, onClose, replie }: LinesDockProps) {
  const alertes = lignes.filter((l) => l.alert);
  return (
    <div className="min-h-0 overflow-y-auto p-4">
      <header className="flex items-center justify-between">
        <h2 id="lignes-titre" className="text-titre-sm text-encre">Lignes</h2>
        {onClose && <IconButton size="sm" label="Fermer les lignes" icon={<RiCloseLine aria-hidden />} onClick={onClose} />}
      </header>
      {!replie && (
        <>
          {GROUPES.map((g) => {
            const items = lignes.filter((l) => lineMode(l.shortName) === g.mode);
            if (!items.length) return null;
            return (
              <div key={g.mode} className="mt-3">
                <h3 className="mb-2 text-[12px] font-semibold text-encre-3">{g.titre}</h3>
                <div className="flex flex-wrap gap-[7px]">
                  {items.map((l) => (
                    <LineBadgeChip key={l.shortName} {...l} size="md" selected={selection === l.shortName} onClick={() => onSelect(l.shortName)} />
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
      <p className="flex items-center gap-2 text-[14px] text-encre-2">
        <span aria-hidden className="size-2 rounded-full bg-normal" />
        {alertes.length ? `Trafic normal sur ${total - alertes.length} lignes sur ${total}.` : `Trafic normal sur les ${total} lignes.`}
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
      <div className="flex items-center justify-between px-3 pt-3">
        <Button variant="discret" size="sm" icon={<RiArrowLeftSLine aria-hidden />} onClick={() => onSelect(null)}>
          Toutes les lignes
        </Button>
        {onClose && <IconButton size="sm" label="Fermer les lignes" icon={<RiCloseLine aria-hidden />} onClick={onClose} />}
      </div>
      <div className="shrink-0 px-4 pt-2">
        <div className="flex items-center gap-3">
          <LineBadgeChip {...ligne} size="lg" />
          <div className="min-w-0">
            <h2 id="ligne-titre" className="text-titre-sm text-encre">{lineName(ligne.shortName)}</h2>
            {ligne.termini && <p className="signaletique truncate text-[15px] text-encre-2">{ligne.termini[0]} – {ligne.termini[1]}</p>}
          </div>
        </div>
        <span aria-hidden className="mt-3 block h-[5px] rounded-full" style={{ backgroundColor: color }} />
        {!replie && (
          <>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-[12px] bg-encart py-1.5 pl-3 pr-1.5">
              <p className="min-w-0 text-[12px] font-semibold text-encre-3">
                Direction
                <span className="signaletique block truncate text-[17px] font-[650] leading-[22px] text-encre">{detail.direction}</span>
              </p>
              <IconButton size="sm" variant="secondaire" label="Inverser la direction" icon={<RiArrowUpDownLine aria-hidden />} onClick={detail.onInverser} />
            </div>
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-[18px] text-encre-2">
              <span aria-hidden className={cx('mt-[5px] size-2 shrink-0 rounded-full', etat === 'normal' ? 'bg-normal' : etat === 'signal' ? 'bg-signal' : 'bg-vigilance')} />
              {detail.trafic.texte}
            </p>
            {detail.indicateurs && detail.indicateurs.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 border-y border-joint">
                {detail.indicateurs.map((k, i) => (
                  <div key={k.label} className={cx('py-2', i % 2 === 0 ? 'border-r border-joint pr-3' : 'pl-3', i > 1 && 'border-t border-joint')}>
                    <dt className="text-legende text-encre-3">{k.label}</dt>
                    <dd className="chiffres truncate text-[16px] font-semibold text-encre">{k.valeur}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
      {!replie && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          <Thermometre
            couleur={color}
            arrets={detail.arrets}
            rames={detail.rames}
            onArret={detail.onArret}
            onRame={detail.onRame}
            onCorrespondance={detail.onCorrespondance}
          />
        </div>
      )}
      {onMonter && (
        <footer className="shrink-0 border-t border-joint p-3">
          <Button variant="afficheur" fullWidth icon={<RiBox3Line aria-hidden />} aria-label="Monter à bord d’une rame en 3D" onClick={() => onMonter(ligne.shortName)}>
            Monter à bord
          </Button>
        </footer>
      )}
    </>
  );
}
