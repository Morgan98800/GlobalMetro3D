import { RiBox3Line, RiCloseLine } from '@remixicon/react';
import { useEffect } from 'react';
import type { Passage } from './Afficheur';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import { resolveLine, type LineRef } from './lines';
import { Panneau } from './Panneau';
import { PlanDeLigneHorizontal } from './PlanDeLigne';

/**
 * Suivi d'une rame sur la carte — Pilule Live Activity compacte (style Apple Maps).
 * Une seule sortie : × « Arrêter le suivi » (et Échap).
 */
export interface FollowTrainHudProps {
  ligne: LineRef;
  direction: string;
  prochaine: string;
  /** Temps jusqu'à la prochaine station */
  arrivee?: Passage;
  arrets: string[];
  index: number;
  progression: number;
  /** Mode Passionné */
  vitesse?: number;
  /** Mode Passionné : « Direct », « Théorique »… */
  confiance?: string;
  /** Paris uniquement */
  onMonter?: () => void;
  onArreter: () => void;
  className?: string;
}

function formatTemps(arrivee?: Passage): string | null {
  if (!arrivee) return null;
  if (arrivee.statut === 'quai') return 'À quai';
  if (arrivee.statut === 'approche' || arrivee.minutes === 0) return 'Approche';
  if (typeof arrivee.minutes === 'number') return `${arrivee.minutes} min`;
  return null;
}

export function FollowTrainHud(p: FollowTrainHudProps) {
  const { onArreter } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onArreter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onArreter]);

  const { color } = resolveLine(p.ligne);
  const temps = formatTemps(p.arrivee);
  const showFooter = p.vitesse != null || Boolean(p.onMonter);

  return (
    <Panneau
      as="section"
      aria-label="Suivi de la rame"
      className={cx('w-full max-w-[420px] md:w-[392px] p-3 animate-feuille', p.className)}
    >
      <div className="flex items-center gap-2.5">
        <LineBadgeChip {...p.ligne} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="signaletique truncate text-[16px] font-[650] leading-[20px] text-encre">
            {p.prochaine}
          </p>
          <p className="truncate text-[12px] leading-[16px] text-encre-3">Dir. {p.direction}</p>
        </div>
        {temps && (
          <span className="chiffres shrink-0 rounded-pill bg-encart px-2.5 py-1 text-[12px] font-semibold text-encre">
            {temps}
          </span>
        )}
        <IconButton
          size="sm"
          label="Arrêter le suivi"
          icon={<RiCloseLine aria-hidden />}
          onClick={p.onArreter}
          className="pl-hit-44"
        />
      </div>

      <PlanDeLigneHorizontal
        couleur={color}
        arrets={p.arrets}
        index={p.index}
        progression={p.progression}
        className="mt-2.5"
      />

      {showFooter && (
        <div className="mt-2.5 flex items-center justify-between gap-2.5">
          {p.vitesse != null ? (
            <span className="chiffres truncate text-[12px] font-medium text-encre-3">
              {Math.round(p.vitesse)} km/h{p.confiance ? ` · ${p.confiance}` : ''}
            </span>
          ) : (
            <span />
          )}
          {p.onMonter && (
            <Button
              variant="afficheur"
              size="sm"
              className="shrink-0 max-md:min-h-[44px]"
              icon={<RiBox3Line aria-hidden />}
              onClick={p.onMonter}
            >
              À bord 3D
            </Button>
          )}
        </div>
      )}
    </Panneau>
  );
}
