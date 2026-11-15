import { cx } from './cx';

/**
 * The app mark: an enamel plate holding a station on a line.
 * Our own drawing — never the RATP logo, the "M" roundel or IDFM pictograms.
 */
export function Marque({ size = 28, className, title = 'Métro & RER Parisiens 3D' }: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" role="img" aria-label={title} className={cx('shrink-0', className)}>
      <rect x="0" y="0" width="28" height="28" rx="6.5" fill="var(--color-plaque)" />
      <rect x="2.25" y="2.25" width="23.5" height="23.5" rx="4.5" fill="none" stroke="var(--color-plaque-filet)" strokeWidth="1.25" />
      <path d="M5.5 14h17" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="14" cy="14" r="4.1" fill="var(--color-plaque)" stroke="#fff" strokeWidth="2.2" />
    </svg>
  );
}
