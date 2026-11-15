import type { ElementType, ReactNode } from 'react';
import { cx } from './cx';

/**
 * Plaque — the enamel station name plate. The system's naming device:
 * use it once per view, for the place the view is about.
 */
export type PlaqueSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const SIZE: Record<PlaqueSize, string> = {
  sm: 'px-2 py-[3px] text-[14px] leading-[18px]',
  md: 'px-3.5 py-[7px] text-[21px] leading-[26px]',
  lg: 'px-4 py-2 text-[28px] leading-[32px]',
  xl: 'px-5 py-2.5 text-[36px] leading-[40px]',
  xxl: 'px-8 py-4 text-[64px] leading-[68px] [box-shadow:inset_0_0_0_4px_var(--color-plaque),inset_0_0_0_6.5px_var(--color-plaque-filet),0_2px_6px_rgb(var(--fx-ombre-teinte)/0.2)]',
};

export interface PlaqueProps {
  children: ReactNode;
  size?: PlaqueSize;
  as?: ElementType;
  id?: string;
  className?: string;
}

export function Plaque({ children, size = 'md', as: Tag = 'span', id, className }: PlaqueProps) {
  return (
    <Tag
      id={id}
      className={cx(
        'plaque signaletique inline-block max-w-full font-[650] text-balance [overflow-wrap:anywhere]',
        SIZE[size],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
