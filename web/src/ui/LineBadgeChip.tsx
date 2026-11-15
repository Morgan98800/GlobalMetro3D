import { cx } from './cx';
import { badgeParts, lineMode, lineName, resolveLine, rimFor, type LineMode } from './lines';

/**
 * Line badge ("pastille"). Metro = disc, RER = rounded square, as riders read
 * them on platforms — drawn in our own typeface and geometry.
 * API is a superset of v1: existing call sites keep compiling.
 */
export type LineBadgeSize = 'xs' | 'sm' | 'md' | 'lg';
export type LineAlert = 'vigilance' | 'signal';

export interface LineBadgeChipProps {
  shortName: string;
  color?: string | null;
  textColor?: string | null;
  size?: LineBadgeSize;
  mode?: LineMode;
  selected?: boolean;
  dimmed?: boolean;
  /** v1 flag — maps to alert="vigilance" */
  hasAlert?: boolean;
  alert?: LineAlert | null;
  interactive?: boolean;
  onClick?: () => void;
  /** Overrides the accessible name ("Ligne 4", "RER A" by default) */
  label?: string;
  className?: string;
}

const BOX: Record<LineBadgeSize, string> = {
  xs: 'h-5 min-w-5 text-[11px]',
  sm: 'h-6 min-w-6 text-[13px]',
  md: 'h-8 min-w-8 text-[16px]',
  lg: 'h-10 min-w-10 text-[20px]',
};

const DOT: Record<LineBadgeSize, string> = {
  xs: 'size-2 -top-0.5 -right-0.5',
  sm: 'size-2.5 -top-0.5 -right-0.5',
  md: 'size-3 -top-0.5 -right-0.5',
  lg: 'size-3.5 -top-0.5 -right-0.5',
};

const ALERT_TEXT: Record<LineAlert, string> = {
  vigilance: 'trafic perturbé',
  signal: 'trafic interrompu',
};

export function LineBadgeChip({
  shortName,
  color,
  textColor,
  size = 'sm',
  mode,
  selected = false,
  dimmed = false,
  hasAlert = false,
  alert,
  interactive = false,
  onClick,
  label,
  className,
}: LineBadgeChipProps) {
  const m = mode ?? lineMode(shortName);
  const { color: bg, textColor: fg } = resolveLine({ shortName, color, textColor });
  const { main, bis } = badgeParts(shortName);
  const rim = rimFor(bg);
  const level: LineAlert | null = alert ?? (hasAlert ? 'vigilance' : null);
  const name = label ?? lineName(shortName);
  const a11y = level ? `${name}, ${ALERT_TEXT[level]}` : name;
  const wide = main.length > 2 || m === 'bus' || m === 'tram';
  const small = size === 'xs' || size === 'sm';

  const shape =
    m === 'metro' && !wide
      ? 'rounded-[9999px] aspect-square'
      : m === 'rer' || m === 'train'
        ? 'rounded-[28%] aspect-square'
        : 'rounded-[0.3em] px-[0.35em]';

  const edges = [
    rim.clair ? 'inset 0 0 0 1px var(--fx-rim-clair)' : null,
    rim.sombre ? 'inset 0 0 0 1px var(--fx-rim-sombre)' : null,
    small ? null : 'inset 0 1px 0 rgb(255 255 255 / 0.22), inset 0 -1px 0 rgb(0 0 0 / 0.12)',
    selected ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-encre)' : null,
  ].filter(Boolean);

  const body = (
    <>
      <span className="relative chiffres font-bold leading-none tracking-[-0.01em]">
        {main}
        {bis && (
          <span className={cx('font-semibold', small ? 'text-[0.6em]' : 'ml-[0.04em] text-[0.5em]')}>
            {small ? 'b' : 'bis'}
          </span>
        )}
      </span>
      {level && (
        <span
          aria-hidden
          className={cx(
            'absolute rounded-full ring-2 ring-surface',
            DOT[size],
            level === 'signal' ? 'bg-signal' : 'bg-vigilance',
          )}
        />
      )}
    </>
  );

  const classes = cx(
    'relative inline-flex shrink-0 select-none items-center justify-center align-middle',
    BOX[size],
    shape,
    dimmed && 'opacity-40 saturate-[0.35]',
    (interactive || onClick) &&
      'cursor-pointer transition-[transform,filter,opacity] duration-150 ease-signal hover:brightness-[1.05] active:scale-[0.96] outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-focus',
    className,
  );
  const style = { backgroundColor: bg, color: fg, boxShadow: edges.join(', ') || undefined };

  if (interactive || onClick) {
    return (
      <button type="button" aria-label={a11y} aria-pressed={selected} onClick={onClick} className={classes} style={style}>
        {body}
      </button>
    );
  }
  return (
    <span role="img" aria-label={a11y} className={classes} style={style}>
      {body}
    </span>
  );
}
