import { useRef, type CSSProperties } from 'react';
import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import { inkFor, type LineRef } from './lines';
import { tracer } from './plan-lumineux/plan-lumineux.js';
import { IconRame, resolveRollingStockIconKind, type RollingStockIconKind } from './TransitIcons';

/**
 * Thermomètre PILI — la ligne entière, dans le sens choisi (haut : origine,
 * bas : terminus). Trois cibles distinctes : un arrêt ouvre la fiche station
 * (en allumant les ampoules PILI), une rame lance le suivi, une correspondance change de ligne.
 */
export interface ArretThermo {
  id: string;
  nom: string;
  correspondances?: LineRef[];
  elevationM?: number;
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
  stockKind?: RollingStockIconKind;
}

export interface ThermometreProps {
  couleur: string;
  ligne?: string;
  arrets: ArretThermo[];
  rames?: RameThermo[];
  onArret?: (id: string) => void;
  onRame?: (id: string) => void;
  onCorrespondance?: (shortName: string) => void;
  className?: string;
}

const H = 40;

export function Thermometre({
  couleur,
  ligne,
  arrets,
  rames = [],
  onArret,
  onRame,
  onCorrespondance,
  className,
}: ThermometreProps) {
  const ref = useRef<HTMLDivElement>(null);
  const n = arrets.length;
  const encre = inkFor(couleur);
  const stockKind = resolveRollingStockIconKind(ligne);
  return (
    <div
      ref={ref}
      className={cx('pl-thermo', className)}
      style={{ '--pl-ligne': couleur, minHeight: n * H } as CSSProperties}
    >
      <ol className="pl-thermo-liste">
        {arrets.map((a, i) => {
          const terminus = i === 0 || i === n - 1;
          return (
            <li key={a.id} className="flex min-h-[40px] max-md:min-h-[44px] items-center gap-1.5">
              <button
                type="button"
                className="pl-arret min-w-0 flex-1 max-md:min-h-[44px]"
                data-terminus={terminus ? '' : undefined}
                onClick={() => {
                  if (ref.current) tracer(ref.current, i, { depuis: 0 });
                  onArret?.(a.id);
                }}
              >
                <i className="pl-lampe" aria-hidden="true" />
                <span className="min-w-0 truncate">{a.nom}</span>
              </button>
              {a.correspondances && a.correspondances.length > 0 && (
                <span className="flex shrink-0 items-center gap-1 pr-1">
                  {a.correspondances.map((c) => (
                    <LineBadgeChip
                      key={c.shortName}
                      {...c}
                      size="xs"
                      className="relative after:absolute after:-inset-[6px] after:content-[''] max-md:after:-inset-[12px]"
                      onClick={onCorrespondance ? () => onCorrespondance(c.shortName) : undefined}
                    />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {rames.map((r) => {
        const yPx = H / 2 + (r.apres + r.progression) * H - (r.suivie ? 12.5 : 11);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onRame?.(r.id)}
            aria-label={r.description}
            title={r.description}
            className={cx(
              'group absolute left-[14px] top-0 z-[2] grid place-items-center rounded-[6px]',
              'after:absolute after:-inset-[8px] after:content-[""] max-md:after:-inset-[13px]',
              'outline-none transition-transform duration-500 ease-rame focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              r.suivie ? 'h-[25px] w-[21px]' : 'h-[22px] w-[18px]'
            )}
            style={{
              transform: `translate3d(-50%, ${yPx}px, 0)`,
              backgroundColor: couleur,
              boxShadow: r.suivie
                ? '0 0 0 2px var(--pl-calotte), 0 0 0 5px color-mix(in oklab, var(--pl-focus) 35%, transparent)'
                : '0 0 0 2px var(--pl-calotte), 0 1px 3px rgb(0 0 0 / 0.3)',
            }}
          >
            <IconRame
              kind={r.stockKind ?? stockKind}
              className={cx(
                'transition-transform duration-150 group-hover:scale-110',
                r.suivie ? 'size-[15px]' : 'size-[13px]'
              )}
              style={{ color: encre }}
            />
          </button>
        );
      })}
    </div>
  );
}
