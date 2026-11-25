import type { CSSProperties } from 'react';
import { cx } from './cx';
import { badgeParts, lineMode, lineName, rerInkFor, resolveLine, type LineMode } from './lines';

/**
 * Line badge ("indice de ligne") — Plan Lumineux `.pl-indice`.
 * Metro = disc, RER = rounded square, with bevelled gloss & brass active ring.
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
  const level: LineAlert | null = alert ?? (hasAlert ? 'vigilance' : null);
  const name = label ?? lineName(shortName);
  const a11y = level
    ? `${name}, ${level === 'signal' ? 'trafic interrompu' : 'trafic perturbé'}`
    : name;
  const wide = m === 'bus' || (m === 'metro' && main.length > 2);

  const shapeOverride = wide ? '!w-auto !rounded-[0.35em] !px-[0.4em]' : undefined;

  const sizeOverride = size === 'lg' ? '!h-10 !w-10 !text-[20px]' : undefined;

  const dataSize = size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : undefined;
  const dataDigits = main.length === 2 && m === 'metro' ? '2' : undefined;
  const dataTrafic =
    level === 'signal' ? 'alerte' : level === 'vigilance' ? 'vigilance' : undefined;

  const style = {
    '--pl-ligne': bg,
    '--pl-ligne-texte': fg,
    ...(m === 'rer' || m === 'train' ? { '--pl-ligne-rer-texte': rerInkFor(shortName, bg) } : {}),
  } as CSSProperties;

  const classes = cx(
    'pl-indice select-none',
    (interactive || onClick) && 'pl-hit-44',
    shapeOverride,
    sizeOverride,
    dimmed && 'opacity-40 saturate-[0.35]',
    className
  );

  const body = (
    <>
      {main}
      {bis && <sub>{size === 'xs' ? 'b' : 'bis'}</sub>}
    </>
  );

  if (interactive || onClick) {
    return (
      <button
        type="button"
        aria-label={a11y}
        aria-pressed={selected}
        data-mode={m}
        data-size={dataSize}
        data-digits={dataDigits}
        data-trafic={dataTrafic}
        onClick={onClick}
        className={classes}
        style={style}
      >
        {body}
      </button>
    );
  }
  return (
    <span
      role="img"
      aria-label={a11y}
      data-mode={m}
      data-size={dataSize}
      data-digits={dataDigits}
      data-trafic={dataTrafic}
      className={classes}
      style={style}
    >
      {body}
    </span>
  );
}
