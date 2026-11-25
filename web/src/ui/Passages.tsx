import { cx } from './cx';
import { Afficheur, Horloge, type Passage } from './Afficheur';
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
  /** Mode Passionné : affiche l'intervalle estimé entre deux rames */
  passionne?: boolean;
  onLigne?: (shortName: string) => void;
  /** Mode Passionné : un horaire touché suit la rame correspondante */
  onSuivre?: (groupe: number, passage: number) => void;
  className?: string;
}

function cadenceTexte(passages: Passage[]): string | null {
  if (passages.length < 2) return null;
  const a = passages[0]?.minutes;
  const b = passages[1]?.minutes;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  const diff = b - a;
  if (diff <= 0 || diff > 30) return null;
  return `Cadence ~${diff} min`;
}

export function Passages({
  groupes,
  titre = 'Prochains passages',
  direct = true,
  passionne = false,
  onLigne,
  onSuivre,
  className,
}: PassagesProps) {
  return (
    <section aria-label={titre} className={cx('min-w-0', className)}>
      <header className="flex items-center justify-between gap-3 pb-2">
        <h3 className="text-[13px] font-semibold text-encre-2">{titre}</h3>
        <div className="flex items-center gap-2">
          <Horloge size="sm" />
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-encre-3">
            <span
              aria-hidden
              className={cx('size-[6px] rounded-full', direct ? 'bg-normal' : 'bg-encre-3')}
            />
            {direct ? 'Direct' : 'Théorique'}
          </span>
        </div>
      </header>
      {groupes.length === 0 ? (
        <p className="rounded-[12px] bg-encart/60 px-4 py-5 text-center text-[13px] text-encre-3">
          Aucun passage
        </p>
      ) : (
        <ul className="divide-y divide-joint border-y border-joint">
          {groupes.map((g, i) => {
            const cadence = passionne ? cadenceTexte(g.passages) : null;
            const sousTitre =
              g.detail && cadence ? `${g.detail} · ${cadence}` : (g.detail ?? cadence);
            return (
              <li
                key={`${g.ligne.shortName}-${g.direction}-${i}`}
                className="grid min-h-[52px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2"
              >
                <LineBadgeChip
                  {...g.ligne}
                  size="sm"
                  onClick={onLigne ? () => onLigne(g.ligne.shortName) : undefined}
                />
                <span className="min-w-0">
                  <span className="signaletique line-clamp-2 text-[15px] font-semibold leading-[19px] text-encre">
                    <span className="sr-only">Direction </span>
                    {g.direction}
                  </span>
                  {sousTitre && (
                    <span className="chiffres mt-0.5 block truncate text-legende text-encre-3">
                      {sousTitre}
                    </span>
                  )}
                </span>
                <Afficheur
                  passages={g.passages}
                  size="sm"
                  onPassage={onSuivre ? (p) => onSuivre(i, p) : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
