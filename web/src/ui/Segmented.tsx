import { useId, type ReactNode } from 'react';
import { cx } from './cx';

/**
 * Segmented control — rail encastré avec curseur glissant fluide (--pl-ease-portes).
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
  const groupId = useId();
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const count = Math.max(1, options.length);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'relative grid items-center rounded-full bg-encart/90 p-[3px] [box-shadow:inset_0_1px_2px_var(--pl-ombre),0_0_0_1px_var(--color-joint)]',
        size === 'sm' ? 'min-h-[34px] max-md:min-h-[50px]' : 'min-h-[40px] max-md:min-h-[50px]',
        className
      )}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {/* Curseur glissant */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-full bg-surface transition-transform duration-300 [transition-timing-function:var(--pl-ease-portes)] [box-shadow:inset_0_1px_0_var(--pl-reflet),0_1px_3px_rgba(0,0,0,0.18),0_0_0_1px_var(--pl-laiton-2)]"
        style={{
          width: `calc((100% - 6px) / ${count})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={`${groupId}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2.5 font-semibold transition-colors duration-200 outline-none focus-visible:outline-2 focus-visible:outline-focus',
              size === 'sm'
                ? 'h-[28px] max-md:min-h-[44px] text-[12.5px]'
                : 'h-[34px] max-md:min-h-[44px] text-[13.5px]',
              checked ? 'text-encre' : 'text-encre-2 hover:text-encre'
            )}
          >
            {o.icon && <span className="shrink-0">{o.icon}</span>}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
