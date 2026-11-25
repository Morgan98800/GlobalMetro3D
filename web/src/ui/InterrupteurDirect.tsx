import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

/**
 * Bascule temps réel / horaires théoriques — vrai interrupteur à glissière tactile
 * (distinct visuellement des groupes radio Segmented).
 */
export interface InterrupteurDirectProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  direct: boolean;
  onChange?: (direct: boolean) => void;
  /** Nom du flux : « PRIM », « TfL », « WMATA », « VBB » */
  source?: string;
  /** false si le réseau n’a pas de flux temps réel : simple étiquette */
  disponible?: boolean;
}

export function InterrupteurDirect({
  direct,
  onChange,
  source,
  disponible = true,
  className,
  ...rest
}: InterrupteurDirectProps) {
  if (!disponible) {
    return (
      <span
        className={cx(
          'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-encart px-2.5 text-[12px] font-semibold text-encre-2',
          className
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-encre-3" />
        <span>Horaires théoriques</span>
      </span>
    );
  }
  const libelle = source ? `Temps réel ${source}` : 'Temps réel';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={direct}
      onClick={() => onChange?.(!direct)}
      title={direct ? 'Afficher les horaires théoriques' : 'Afficher le temps réel'}
      className={cx(
        'group inline-flex h-8 max-md:min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-2.5 text-[12px] font-semibold transition-[color,background-color,border-color] duration-200 outline-none focus-visible:outline-2 focus-visible:outline-focus',
        direct
          ? 'border-[#00a98f]/60 bg-[#00a98f]/14 text-encre'
          : 'border-bord bg-encart/80 text-encre-2 hover:border-encre-3/50 hover:text-encre',
        className
      )}
      {...rest}
    >
      <span className="whitespace-nowrap">{libelle}</span>
      <span
        aria-hidden
        className={cx(
          'relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 [box-shadow:inset_0_1px_2px_rgba(0,0,0,0.35)]',
          direct ? 'bg-[#00a98f]' : 'bg-encre-3/35'
        )}
      >
        <span
          className={cx(
            'size-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 [transition-timing-function:var(--pl-ease-portes)]',
            direct ? 'translate-x-[14px]' : 'translate-x-0'
          )}
        />
      </span>
    </button>
  );
}
