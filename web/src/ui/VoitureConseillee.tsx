import { cx } from './cx';

/**
 * Which car to board, as a small train. Riders already think in
 * "en tête / au milieu / en queue"; the drawing makes it instant.
 */
export type PositionRame = 'tete' | 'milieu' | 'queue';

const LABEL: Record<PositionRame, string> = {
  tete: 'Montez en tête de train',
  milieu: 'Montez au milieu du train',
  queue: 'Montez en queue de train',
};

export function VoitureConseillee({
  position,
  voitures = 5,
  raison,
  className,
}: {
  position: PositionRame;
  voitures?: number;
  /** Why: "sortie rue de Lyon", "correspondance ligne 5" */
  raison?: string;
  className?: string;
}) {
  const target = position === 'tete' ? voitures - 1 : position === 'queue' ? 0 : Math.floor(voitures / 2);
  const w = 20;
  const gap = 3;
  const width = voitures * w + (voitures - 1) * gap + 5;
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <svg width={width} height="14" viewBox={`0 0 ${width} 14`} aria-hidden className="shrink-0">
        {Array.from({ length: voitures }, (_, i) => {
          const x = i * (w + gap);
          const head = i === voitures - 1;
          const on = i === target;
          const d = head
            ? `M${x + 2.5} 1h${w - 6}q3 0 5 3l2.5 4.5q.5 1.5-.5 2.5l-1 1.5q-1 1-2.5 1H${x + 2.5}q-2 0-2-2V3q0-2 2-2z`
            : `M${x + 2.5} 1h${w - 5}q2 0 2 2v8q0 2-2 2h-${w - 5}q-2 0-2-2V3q0-2 2-2z`;
          return (
            <path
              key={i}
              d={d}
              fill={on ? 'var(--color-action)' : 'none'}
              stroke={on ? 'var(--color-action)' : 'var(--color-bord-fort)'}
              strokeWidth="1.5"
            />
          );
        })}
      </svg>
      <span className="min-w-0 text-[13px] leading-[18px] text-encre-2">
        <span className="font-semibold text-encre">{LABEL[position]}</span>
        {raison ? `, ${raison}` : null}
      </span>
    </div>
  );
}
