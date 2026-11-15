import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * Segmented control (radio group). The thumb slides with the doors easing.
 * Segments share the width equally so the thumb can be a pure transform.
 */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  /** Accessible name of the group */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const h = size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-[14px]';
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('relative grid rounded-controle bg-encart p-[3px]', h, className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        onChange(options[(index + step + options.length) % options.length].value);
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[7px] bg-surface transition-transform duration-300 ease-portes [box-shadow:var(--fx-glacure),0_0_0_1px_var(--color-joint),0_1px_3px_rgb(var(--fx-ombre-teinte)/0.12)]"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-[1] inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] px-3 font-semibold',
              'transition-colors duration-150 ease-signal outline-none focus-visible:outline-2 focus-visible:outline-focus',
              '[&_svg]:size-4',
              active ? 'text-encre' : 'text-encre-2 hover:text-encre',
            )}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
