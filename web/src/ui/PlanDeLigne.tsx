import { useState, type ReactNode } from 'react';
import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import type { LineRef } from './lines';

/**
 * Plan de ligne — the strip above the doors, redrawn for screens.
 * Vertical for itineraries, horizontal for the cab HUD.
 */
export interface Arret {
  nom: string;
  role?: 'depart' | 'arrivee' | 'passage';
  correspondances?: LineRef[];
  /** Content under the name: wait time, direction, exit hint */
  detail?: ReactNode;
}

export interface PlanDeLigneProps {
  couleur: string;
  arrets: Arret[];
  /** Collapse intermediate stops into one expandable row */
  replier?: boolean;
  className?: string;
}

export function PlanDeLigne({ couleur, arrets, replier = true, className }: PlanDeLigneProps) {
  const [ouvert, setOuvert] = useState(!replier);
  const first = arrets[0];
  const last = arrets[arrets.length - 1];
  const middle = arrets.slice(1, -1);
  const rows: Array<Arret | 'replie'> =
    ouvert || middle.length < 2 ? arrets : [first, 'replie', last];

  return (
    <ol className={cx('relative', className)}>
      {rows.map((a, i) => {
        const isFirst = i === 0;
        const isLast = i === rows.length - 1;
        if (a === 'replie') {
          return (
            <li key="replie" className="relative grid grid-cols-[28px_minmax(0,1fr)]">
              <Rail couleur={couleur} pointille />
              <button
                type="button"
                onClick={() => setOuvert(true)}
                className="col-start-2 my-1 justify-self-start rounded-[6px] px-1.5 py-1 text-[13px] font-semibold text-encre-2 hover:bg-encart hover:text-encre outline-none focus-visible:outline-2 focus-visible:outline-focus"
              >
                {middle.length} arrêts
              </button>
            </li>
          );
        }
        const terminal = a.role === 'depart' || a.role === 'arrivee';
        return (
          <li key={`${a.nom}-${i}`} className="relative grid grid-cols-[28px_minmax(0,1fr)]">
            <Rail couleur={couleur} debut={isFirst} fin={isLast} />
            <span
              aria-hidden
              className={cx(
                'absolute z-[1] -translate-x-1/2 rounded-full bg-surface',
                terminal ? 'left-[14px] top-[5px] size-[15px] border-[3.5px]' : 'left-[14px] top-[7px] size-[11px] border-[2.5px]',
              )}
              style={{ borderColor: terminal ? 'var(--color-encre)' : couleur }}
            />
            {/* Rail and marker are absolutely positioned and leave the grid: pin the content to column 2 */}
            <div className={cx('col-start-2 min-w-0', isLast ? 'pb-0' : terminal ? 'pb-3.5' : 'pb-2')}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={cx(
                    'signaletique min-w-0 leading-[24px]',
                    terminal ? 'text-[17px] font-[650] text-encre' : 'text-[15px] font-medium text-encre-2',
                  )}
                >
                  {a.nom}
                </span>
                {a.correspondances?.map((c) => (
                  <LineBadgeChip key={c.shortName} {...c} size="xs" />
                ))}
              </div>
              {a.detail && <div className="mt-1">{a.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Rail({ couleur, debut, fin, pointille }: { couleur: string; debut?: boolean; fin?: boolean; pointille?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx('absolute left-[12px] w-[4px]', debut ? 'top-[12px]' : 'top-0', fin ? 'h-[12px]' : 'bottom-0')}
      style={
        pointille
          ? { backgroundImage: `linear-gradient(${couleur} 55%, transparent 0)`, backgroundSize: '4px 7px' }
          : { backgroundColor: couleur }
      }
    />
  );
}

/** Horizontal strip for the cab: previous, current, next stops and the train. */
export interface PlanHorizontalProps {
  couleur: string;
  arrets: string[];
  /** Index of the last stop served */
  index: number;
  /** 0..1 progress towards arrets[index + 1] */
  progression?: number;
  onSelectStop?: (stationName: string) => void;
  className?: string;
}

export function PlanDeLigneHorizontal({ couleur, arrets, index, progression = 0, onSelectStop, className }: PlanHorizontalProps) {
  // Thème-agnostique : jetons d’encre et de surface, donc lisible sur faïence comme sur verre.
  const n = arrets.length;
  const pos = n > 1 ? ((index + Math.min(1, Math.max(0, progression))) / (n - 1)) * 100 : 0;
  return (
    <div className={cx('relative pt-1', className)}>
      <div className="relative mx-2 h-[14px]">
        <span className="absolute inset-x-0 top-[5px] h-[4px] rounded-full bg-encre/15" />
        <span className="absolute left-0 top-[5px] h-[4px] rounded-full" style={{ width: `${pos}%`, backgroundColor: couleur }} />
        {arrets.map((a, i) =>
          onSelectStop ? (
            <button
              key={a + i}
              type="button"
              onClick={() => onSelectStop(a)}
              aria-label={`Aller à ${a}`}
              title={a}
              className="pointer-events-auto absolute top-[2px] size-[10px] -translate-x-1/2 cursor-pointer rounded-full border-[2.5px] bg-surface transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-focus"
              style={{
                left: `${(i / Math.max(1, n - 1)) * 100}%`,
                borderColor: i <= index ? couleur : 'color-mix(in oklab, var(--color-encre) 45%, transparent)',
                backgroundColor: i <= index ? couleur : undefined,
              }}
            />
          ) : (
            <span
              key={a + i}
              className="absolute top-[2px] size-[10px] -translate-x-1/2 rounded-full border-[2.5px] bg-surface"
              style={{
                left: `${(i / Math.max(1, n - 1)) * 100}%`,
                borderColor: i <= index ? couleur : 'color-mix(in oklab, var(--color-encre) 45%, transparent)',
                backgroundColor: i <= index ? couleur : undefined,
              }}
            />
          )
        )}
        <span
          aria-hidden
          className="absolute -top-[3px] size-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-encre transition-[left] duration-700 ease-rame"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1.5 grid text-[12px] leading-[15px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {arrets.map((a, i) =>
          onSelectStop ? (
            <button
              key={a + i}
              type="button"
              onClick={() => onSelectStop(a)}
              className={cx(
                'signaletique pointer-events-auto cursor-pointer truncate px-0.5 hover:text-encre focus-visible:outline-2 focus-visible:outline-focus',
                i === 0 ? 'text-start' : i === n - 1 ? 'text-end' : 'text-center',
                i === index + 1 ? 'font-[650] text-encre' : 'text-encre-2',
              )}
            >
              {a}
            </button>
          ) : (
            <span
              key={a + i}
              className={cx(
                'signaletique truncate px-0.5',
                i === 0 ? 'text-start' : i === n - 1 ? 'text-end' : 'text-center',
                i === index + 1 ? 'font-[650] text-encre' : 'text-encre-2',
              )}
            >
              {a}
            </span>
          )
        )}
      </div>
    </div>
  );
}
