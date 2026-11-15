import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import { inkFor, type LineRef } from './lines';

/**
 * Thermomètre — la ligne entière, dans le sens choisi (haut : origine,
 * bas : terminus). Trois cibles distinctes : un arrêt ouvre la fiche station,
 * une rame lance le suivi, une correspondance change de ligne.
 * Remplace StationLadder (v1).
 */
export interface ArretThermo {
  id: string;
  nom: string;
  correspondances?: LineRef[];
}

export interface RameThermo {
  id: string;
  /** Index de la dernière station desservie, dans l’ordre affiché */
  apres: number;
  /** 0..1 vers la station suivante */
  progression: number;
  /** Nom accessible : « Rame vers Bagneux, entre Château Rouge et Barbès » */
  description: string;
  suivie?: boolean;
}

export interface ThermometreProps {
  couleur: string;
  arrets: ArretThermo[];
  rames?: RameThermo[];
  onArret?: (id: string) => void;
  onRame?: (id: string) => void;
  onCorrespondance?: (shortName: string) => void;
  className?: string;
}

const H = 40;

export function Thermometre({ couleur, arrets, rames = [], onArret, onRame, onCorrespondance, className }: ThermometreProps) {
  const n = arrets.length;
  const encre = inkFor(couleur);
  return (
    <div className={cx('relative', className)} style={{ height: n * H }}>
      <span aria-hidden className="absolute left-[14.5px] w-[5px] rounded-full" style={{ top: H / 2, height: Math.max(0, (n - 1) * H), backgroundColor: couleur }} />
      <ol className="relative">
        {arrets.map((a, i) => {
          const terminus = i === 0 || i === n - 1;
          return (
            <li key={a.id} className="relative grid h-10 grid-cols-[36px_minmax(0,1fr)] items-center">
              <span
                aria-hidden
                className={cx(
                  'absolute left-[17px] top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface',
                  terminus ? 'size-[15px] border-[3.5px] border-encre' : 'size-[11px] border-[2.5px]',
                )}
                style={terminus ? undefined : { borderColor: couleur }}
              />
              <span className="col-start-2 flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onArret?.(a.id)}
                  className={cx(
                    'signaletique -ml-1.5 min-w-0 truncate rounded-[6px] px-1.5 py-0.5 text-start text-encre',
                    'outline-none transition-colors duration-150 ease-signal hover:bg-encart focus-visible:outline-2 focus-visible:outline-focus',
                    terminus ? 'text-[16px] font-[650]' : 'text-[15px] font-medium',
                  )}
                >
                  {a.nom}
                </button>
                {a.correspondances?.map((c) => (
                  <LineBadgeChip key={c.shortName} {...c} size="xs" onClick={onCorrespondance ? () => onCorrespondance(c.shortName) : undefined} />
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {rames.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onRame?.(r.id)}
          aria-label={r.description}
          title={r.description}
          className={cx(
            'absolute left-[17px] z-[2] grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[5px]',
            'outline-none transition-transform duration-150 ease-signal hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            r.suivie ? 'h-[24px] w-[17px]' : 'h-[19px] w-[14px]',
          )}
          style={{
            top: H / 2 + (r.apres + r.progression) * H,
            backgroundColor: couleur,
            boxShadow: r.suivie
              ? '0 0 0 2px var(--color-surface), 0 0 0 5px color-mix(in oklab, var(--color-focus) 35%, transparent)'
              : '0 0 0 2px var(--color-surface), 0 1px 3px rgb(0 0 0 / 0.3)',
          }}
        >
          <span aria-hidden className="size-0 border-x-[4px] border-t-[5px] border-x-transparent" style={{ borderTopColor: encre }} />
        </button>
      ))}
    </div>
  );
}
