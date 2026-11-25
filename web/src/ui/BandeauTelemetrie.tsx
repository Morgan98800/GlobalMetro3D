import { cx } from './cx';
import { formatNombre } from './format';
import { InterrupteurDirect } from './InterrupteurDirect';
import { Panneau } from './Panneau';

export interface BandeauTelemetrieProps {
  rames: number;
  kilometres: number;
  direct: boolean;
  onDirect: (direct: boolean) => void;
  source?: string;
  disponible?: boolean;
  className?: string;
}

export function BandeauTelemetrie({
  rames,
  kilometres,
  direct,
  onDirect,
  source,
  disponible = true,
  className,
}: BandeauTelemetrieProps) {
  return (
    <Panneau
      as="section"
      aria-label="Télémétrie du réseau"
      className={cx(
        'inline-flex h-9 items-center gap-2.5 rounded-pill pl-3 pr-1.5 text-[12px] text-encre-2',
        className
      )}
    >
      <span className="whitespace-nowrap">
        <span className="chiffres font-semibold text-encre">{formatNombre(rames)}</span> rames
      </span>
      <span aria-hidden className="h-3.5 w-px bg-joint" />
      <span className="whitespace-nowrap">
        <span className="chiffres font-semibold text-encre">{formatNombre(kilometres)}</span> km
      </span>
      <span aria-hidden className="h-3.5 w-px bg-joint" />
      <InterrupteurDirect
        direct={direct}
        onChange={onDirect}
        source={source}
        disponible={disponible}
      />
    </Panneau>
  );
}
