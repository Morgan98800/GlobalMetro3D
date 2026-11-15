import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

/**
 * Bascule temps réel / horaires théoriques. Un afficheur : noir, ambre quand
 * c’est en direct. Libellé constant (« Temps réel PRIM »), état porté par
 * role="switch" et par la couleur — le nom accessible ne change jamais.
 * Partagée par le bandeau télémétrie et le HUD de cabine ([data-ride-live]).
 */
export interface InterrupteurDirectProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  direct: boolean;
  onChange?: (direct: boolean) => void;
  /** Nom du flux : « PRIM », « TfL », « WMATA », « VBB » */
  source?: string;
  /** false si le réseau n’a pas de flux temps réel : simple étiquette */
  disponible?: boolean;
}

const BASE = 'afficheur inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[12px] font-semibold';

export function InterrupteurDirect({ direct, onChange, source, disponible = true, className, ...rest }: InterrupteurDirectProps) {
  if (!disponible) {
    return (
      <span className={cx(BASE, className)}>
        <span aria-hidden className="size-1.5 rounded-full bg-white/45" />
        <span className="text-white/75">Horaires théoriques</span>
      </span>
    );
  }
  const libelle = source ? `Temps réel ${source}` : 'Temps réel';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={direct}
      title={direct ? 'Afficher les horaires théoriques' : 'Afficher le temps réel'}
      onClick={() => onChange?.(!direct)}
      className={cx(
        BASE,
        'outline-none transition-[box-shadow] duration-150 ease-signal hover:[box-shadow:inset_0_0_0_1px_rgb(255_255_255/0.22)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        className,
      )}
      {...rest}
    >
      <span aria-hidden className={cx('size-1.5 rounded-full', direct ? 'bg-ambre-500' : 'border border-white/50')} />
      <span className={direct ? 'text-afficheur-encre' : 'text-white/60'}>{libelle}</span>
    </button>
  );
}
