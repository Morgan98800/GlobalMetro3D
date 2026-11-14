import type { ReactNode } from 'react';
import { badgeLabel, textColorFor } from '@core/ui/components/line_badge';
import { cx } from '@/utils/cx';

export interface LineBadgeChipProps {
  shortName: string;
  color?: string | null;
  textColor?: string | null;
  size?: 'xs' | 'sm' | 'md';
  selected?: boolean;
  dimmed?: boolean;
  hasAlert?: boolean;
  interactive?: boolean;
  ariaLabel?: string;
  title?: string;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}

function normalizeColor(value?: string | null): string {
  if (!value) return '#5f5e5a';
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
  return '#5f5e5a';
}

const SIZE_CLASSES = {
  xs: 'h-5 min-w-5 px-1 text-[11px] leading-none rounded-md',
  sm: 'h-6 min-w-6 px-1.5 text-caption-1-semibold leading-none rounded-lg',
  md: 'h-8 min-w-8 px-2 text-body-medium leading-none rounded-2lg',
};

/**
 * Official GTFS transit line badge using guaranteed-contrast foreground color.
 */
export function LineBadgeChip({
  shortName,
  color,
  textColor,
  size = 'sm',
  selected = false,
  dimmed = false,
  hasAlert = false,
  interactive = false,
  ariaLabel,
  title,
  onClick,
  className,
}: LineBadgeChipProps) {
  const bg = normalizeColor(color);
  const fg = textColorFor(bg, textColor);
  const label = badgeLabel(shortName);

  const classes = cx(
    'relative inline-flex shrink-0 items-center justify-center font-bold tabular-nums select-none',
    'transition-[transform,opacity,box-shadow] duration-150 ease-out',
    SIZE_CLASSES[size],
    interactive && [
      'cursor-pointer outline-none',
      'hover:scale-105 active:scale-95',
      'focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2',
    ],
    selected && 'ring-2 ring-border-focus-ring ring-offset-2 shadow-sm scale-105',
    dimmed && !selected && 'opacity-45 hover:opacity-90',
    className
  );

  const content = (
    <>
      <span>{label}</span>
      {hasAlert ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -end-0.5 size-2 rounded-full bg-status-rose-text ring-2 ring-background-primary-default"
        />
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={ariaLabel ?? `Ligne ${shortName}`}
        title={title ?? `Ligne ${shortName}`}
        style={{ backgroundColor: bg, color: fg }}
        className={classes}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      role="img"
      aria-label={ariaLabel ?? `Ligne ${shortName}`}
      title={title}
      style={{ backgroundColor: bg, color: fg }}
      className={classes}
    >
      {content}
    </span>
  );
}
