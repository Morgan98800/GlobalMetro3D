import { cx } from './cx';
import { formatNombre } from './format';
import { InterrupteurDirect } from './InterrupteurDirect';
import { Panneau } from './Panneau';

/**
 * Bandeau télémétrie, mode Passionné uniquement. Valeurs en chiffres tabulaires,
 * séparées par des joints. L’horloge reste dans la barre ; le trophée « Records »
 * disparaît (doublon du menu ⋮).
 */
export interface BandeauTelemetrieProps {
  rames: number;
  kilometres: number;
  direct: boolean;
  onDirect: (direct: boolean) => void;
  /** « PRIM », « TfL », « WMATA », « VBB » */
  source?: string;
  /** false : réseau sans temps réel (cadence GTFS) */
  disponible?: boolean;
  className?: string;
}


export function BandeauTelemetrie({ rames, kilometres, direct, onDirect, source, disponible = true, className }: BandeauTelemetrieProps) {
  return (
    <Panneau as="section" aria-label="Télémétrie du réseau" className={cx('inline-flex h-11 items-center gap-3 pl-3.5 pr-2 text-[13px] text-encre-2', className)}>
      <span className="whitespace-nowrap">
        <span className="chiffres font-semibold text-encre">{formatNombre(rames)}</span> rames en circulation
      </span>
      <span aria-hidden className="h-4 w-px bg-joint" />
      <span className="whitespace-nowrap" title="Estimation depuis le début du service">
        <span className="chiffres font-semibold text-encre">{formatNombre(kilometres)}</span> km parcourus
      </span>
      <span aria-hidden className="h-4 w-px bg-joint" />
      <InterrupteurDirect direct={direct} onChange={onDirect} source={source} disponible={disponible} />
    </Panneau>
  );
}
