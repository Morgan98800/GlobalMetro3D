import { RiBox3Line, RiCloseLine } from '@remixicon/react';
import { useEffect } from 'react';
import { Afficheur, type Passage } from './Afficheur';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import { resolveLine, type LineRef } from './lines';
import { Panneau } from './Panneau';
import { PlanDeLigneHorizontal } from './PlanDeLigne';

/**
 * Suivi d’une rame sur la carte (v2.1). Une seule sortie : × « Arrêter le suivi »
 * (et Échap) — le bouton « Quitter » est supprimé. Une seule entrée 3D, contextuelle :
 * « Monter dans cette rame » (afficheur, Paris).
 */
export interface FollowTrainHudProps {
  ligne: LineRef;
  direction: string;
  prochaine: string;
  /** Temps jusqu’à la prochaine station */
  arrivee?: Passage;
  arrets: string[];
  index: number;
  progression: number;
  /** Mode Passionné */
  vitesse?: number;
  /** Mode Passionné : « Position mesurée », « estimée entre deux passages »… */
  confiance?: string;
  /** Paris uniquement */
  onMonter?: () => void;
  onArreter: () => void;
  className?: string;
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
  return (
    <Panneau as="section" aria-label="Suivi de la rame" className={cx('w-[440px] max-w-[calc(100vw-24px)] p-4 animate-feuille', p.className)}>
      <div className="flex items-start gap-2.5">
        <LineBadgeChip {...p.ligne} size="sm" className="mt-0.5" />
        <p className="min-w-0 flex-1 text-[12px] font-semibold text-encre-3">
          Rame suivie, direction
          <span className="signaletique block truncate text-[16px] font-[650] leading-[20px] text-encre">{p.direction}</span>
        </p>
        <IconButton size="sm" label="Arrêter le suivi" icon={<RiCloseLine aria-hidden />} onClick={p.onArreter} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-encre-3">Prochaine station</p>
          <p className="signaletique truncate text-[22px] font-[650] leading-[26px] text-encre">{p.prochaine}</p>
        </div>
        {p.arrivee && <Afficheur passages={[p.arrivee]} max={1} size="md" />}
      </div>
      <PlanDeLigneHorizontal couleur={color} arrets={p.arrets} index={p.index} progression={p.progression} className="mt-3" />
      {p.vitesse != null && (
        <div className="mt-3 flex items-center gap-2.5 border-t border-joint pt-3">
          <span className="afficheur chiffres inline-flex h-8 items-baseline gap-1 px-2 pt-[7px] font-bold">
            <span className="text-[19px] leading-none">{Math.round(p.vitesse)}</span>
            <span className="signaletique text-[10px] font-semibold">km/h</span>
          </span>
          {p.confiance && <span className="text-legende text-encre-3">{p.confiance}</span>}
        </div>
      )}
      {p.onMonter && (
        <Button variant="afficheur" fullWidth className="mt-3" icon={<RiBox3Line aria-hidden />} onClick={p.onMonter}>
          Monter dans cette rame
        </Button>
      )}
    </Panneau>
  );
}
