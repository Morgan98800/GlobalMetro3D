import type { ElementType, ReactNode } from 'react';
import { cx } from './cx';

/**
 * Plaque — Compagnie Nord-Sud tiled blue station name plate with honey faïence frame.
 */
export type PlaqueSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const CARREAUX_SIZE: Record<PlaqueSize, string> = {
  sm: '!min-h-[28px] !px-2.5 !py-1 !text-[15px]',
  md: '!min-h-[44px] !px-3.5 !py-2 !text-[22px]',
  lg: '!min-h-[52px] !px-4 !py-2.5 !text-[28px]',
  xl: '!min-h-[60px] !px-5 !py-3 !text-[36px]',
  xxl: '!min-h-[84px] !px-8 !py-4 !text-[56px]',
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
    <Tag id={id} className={cx('pl-plaque inline-flex max-w-full', className)} data-size={size === 'sm' ? 'sm' : undefined}>
      <span className={cx('pl-plaque-carreaux min-w-0 text-balance [overflow-wrap:anywhere]', CARREAUX_SIZE[size])}>
        {children}
      </span>
    </Tag>
  );
}
