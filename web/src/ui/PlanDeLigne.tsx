import { useState, type ReactNode } from 'react';
import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import { Poussoir } from './plan-lumineux/PlanLumineux';
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
              <div className="col-start-2 my-1 justify-self-start">
                <Poussoir variante="discret" taille="sm" onClick={() => setOuvert(true)}>
                  {middle.length} arrêts
                </Poussoir>
              </div>
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
                terminal
                  ? 'left-[14px] top-[5px] size-[15px] border-[3.5px]'
                  : 'left-[14px] top-[7px] size-[11px] border-[2.5px]'
              )}
              style={{ borderColor: terminal ? 'var(--color-encre)' : couleur }}
            />
            {/* Rail and marker are absolutely positioned and leave the grid: pin the content to column 2 */}
            <div
              className={cx('col-start-2 min-w-0', isLast ? 'pb-0' : terminal ? 'pb-3.5' : 'pb-2')}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={cx(
                    'signaletique min-w-0 leading-[24px]',
                    terminal
                      ? 'text-[17px] font-[650] text-encre'
                      : 'text-[15px] font-medium text-encre-2'
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

function Rail({
  couleur,
  debut,
  fin,
  pointille,
}: {
  couleur: string;
  debut?: boolean;
  fin?: boolean;
  pointille?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        'absolute left-[12px] w-[4px]',
        debut ? 'top-[12px]' : 'top-0',
        fin ? 'h-[12px]' : 'bottom-0'
      )}
      style={
        pointille
          ? {
              backgroundImage: `linear-gradient(${couleur} 55%, transparent 0)`,
              backgroundSize: '4px 7px',
            }
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

export function PlanDeLigneHorizontal({
  couleur,
  arrets,
  index,
  progression = 0,
  onSelectStop,
  className,
}: PlanHorizontalProps) {
  // Fenêtre glissante façon bandeau DILIDAM : max 5 arrêts lisibles en entier autour de la rame.
  const n = arrets.length;
  const maxVisible = 5;
  const clampedIdx = Math.max(0, Math.min(Math.max(0, n - 1), index));
  const clampedProg = Math.min(1, Math.max(0, progression));

  let start = 0;
  let end = n;
  if (n > maxVisible) {
    start = Math.max(0, Math.min(n - maxVisible, clampedIdx - 1));
    end = start + maxVisible;
  }
  const visible = arrets.slice(start, end);
  const vCount = visible.length;
  const localPos =
    vCount > 1
      ? Math.max(0, Math.min(100, ((clampedIdx - start + clampedProg) / (vCount - 1)) * 100))
      : 0;

  return (
    <div className={cx('relative pt-1', className)}>
      {n > maxVisible && (
        <div className="mb-1 flex items-center justify-between text-[11px] leading-[14px] text-encre-3">
          <span>{start > 0 ? `← ${start} avant` : 'Origine'}</span>
          <span className="chiffres font-semibold text-encre-2">
            Arrêt {clampedIdx + 1} / {n}
          </span>
          <span>{end < n ? `${n - end} après →` : 'Terminus'}</span>
        </div>
      )}
      <div className="relative mx-2 h-[14px]">
        <span className="absolute inset-x-0 top-[5px] h-[4px] rounded-full bg-encre/15" />
        <span
          className="absolute inset-x-0 top-[5px] h-[4px] origin-left rounded-full transition-transform duration-500 ease-rame"
          style={{ transform: `scaleX(${localPos / 100})`, backgroundColor: couleur }}
        />
        {visible.map((a, vi) => {
          const gi = start + vi;
          const passed = gi <= clampedIdx;
          const isNext = gi === clampedIdx + 1;
          const leftPct = `${(vi / Math.max(1, vCount - 1)) * 100}%`;
          return onSelectStop ? (
            <button
              key={`${a}-${gi}`}
              type="button"
              onClick={() => onSelectStop(a)}
              aria-label={`Aller à ${a}`}
              title={a}
              className={cx(
                'pointer-events-auto absolute top-[2px] -translate-x-1/2 cursor-pointer rounded-full border-[2.5px] bg-surface transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-focus',
                isNext ? 'size-[12px] top-[1px]' : 'size-[10px]'
              )}
              style={{
                left: leftPct,
                borderColor:
                  passed || isNext
                    ? couleur
                    : 'color-mix(in oklab, var(--color-encre) 45%, transparent)',
                backgroundColor: passed ? couleur : undefined,
              }}
            />
          ) : (
            <span
              key={`${a}-${gi}`}
              className={cx(
                'absolute top-[2px] -translate-x-1/2 rounded-full border-[2.5px] bg-surface',
                isNext ? 'size-[12px] top-[1px]' : 'size-[10px]'
              )}
              style={{
                left: leftPct,
                borderColor:
                  passed || isNext
                    ? couleur
                    : 'color-mix(in oklab, var(--color-encre) 45%, transparent)',
                backgroundColor: passed ? couleur : undefined,
              }}
            />
          );
        })}
        <span
          aria-hidden
          className="absolute -top-[3px] size-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-encre transition-[left] duration-500 ease-rame"
          style={{ left: `${localPos}%` }}
        />
      </div>
      <div
        className="mt-1.5 grid gap-1 text-[11px] leading-[14px]"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, vCount)}, minmax(0, 1fr))` }}
      >
        {visible.map((a, vi) => {
          const gi = start + vi;
          const isCurrentOrNext = gi === clampedIdx || gi === clampedIdx + 1;
          const alignCls = vi === 0 ? 'text-start' : vi === vCount - 1 ? 'text-end' : 'text-center';
          const cls = cx(
            'signaletique truncate px-0.5',
            alignCls,
            isCurrentOrNext ? 'font-[650] text-encre' : 'text-encre-2'
          );
          return onSelectStop ? (
            <button
              key={`${a}-${gi}`}
              type="button"
              onClick={() => onSelectStop(a)}
              title={a}
              className={cx(
                cls,
                'pointer-events-auto cursor-pointer hover:text-encre focus-visible:outline-2 focus-visible:outline-focus'
              )}
            >
              {a}
            </button>
          ) : (
            <span key={`${a}-${gi}`} title={a} className={cls}>
              {a}
            </span>
          );
        })}
      </div>
    </div>
  );
}
