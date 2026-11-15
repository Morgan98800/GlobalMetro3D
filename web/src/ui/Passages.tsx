import { cx } from './cx';
import { Afficheur, type Passage } from './Afficheur';
import { LineBadgeChip, type LineAlert } from './LineBadgeChip';
import type { LineRef } from './lines';

/**
 * Prochains passages — one row per line and direction, two departures each,
 * the way platform screens read. Rows are separated by grout lines, not cards.
 */
export interface DepartGroupe {
  ligne: LineRef & { alert?: LineAlert | null };
  /** Terminus served; Parisians navigate by terminus */
  direction: string;
  passages: Passage[];
  /** Mode Passionné : confiance et précision (« Mesuré PRIM, 2 min 14 s ») */
  detail?: string;
}

export interface PassagesProps {
  groupes: DepartGroupe[];
  titre?: string;
  /** true: real-time feed (PRIM); false: schedule only (GTFS) */
  direct?: boolean;
  onLigne?: (shortName: string) => void;
  /** Mode Passionné : un horaire touché suit la rame correspondante */
  onSuivre?: (groupe: number, passage: number) => void;
  className?: string;
}

export function Passages({ groupes, titre = 'Prochains passages', direct = true, onLigne, onSuivre, className }: PassagesProps) {
  return (
    <section aria-label={titre} className={cx('min-w-0', className)}>
      <header className="flex items-center justify-between gap-3 pb-2">
        <h3 className="text-[13px] font-semibold text-encre-2">{titre}</h3>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-encre-3">
          <span
            aria-hidden
            className={cx('size-[7px] rounded-full', direct ? 'bg-normal shadow-[0_0_0_3px_rgb(47_154_86/0.18)]' : 'bg-encre-3')}
          />
          {direct ? 'En direct' : 'Horaires théoriques'}
        </span>
      </header>
      {onSuivre && groupes.length > 0 && (
        <p className="-mt-1 pb-2 text-legende text-encre-3">Choisissez un horaire pour suivre la rame sur la carte.</p>
      )}
      {groupes.length === 0 ? (
        <p className="carrelage rounded-[12px] px-4 py-6 text-center text-[14px] text-encre-2">
          Aucun passage annoncé pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-joint border-y border-joint">
          {groupes.map((g, i) => (
            <li key={`${g.ligne.shortName}-${g.direction}-${i}`} className="grid min-h-[52px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2">
              <LineBadgeChip
                {...g.ligne}
                size="sm"
                onClick={onLigne ? () => onLigne(g.ligne.shortName) : undefined}
              />
              <span className="min-w-0">
                <span className="signaletique line-clamp-2 text-[16px] font-semibold leading-[19px] text-encre">
                  <span className="sr-only">Direction </span>
                  {g.direction}
                </span>
                {g.detail && <span className="mt-0.5 block truncate text-legende text-encre-3">{g.detail}</span>}
              </span>
              <Afficheur passages={g.passages} size="sm" onPassage={onSuivre ? (p) => onSuivre(i, p) : undefined} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
