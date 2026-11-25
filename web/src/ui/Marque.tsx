import { cx } from './cx';

/**
 * Emblème Paris Subway 3D : cartouche émaillé bleu nuit à filet laiton/jade,
 * voûte souterraine et voie en perspective avec rame stylisée.
 * Dessin original — ne reprend aucun logo déposé (RATP, M, IDFM).
 */
export function Marque({
  size = 28,
  className,
  title = 'Métro & RER Parisiens 3D',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role="img"
      aria-label={title}
      className={cx('shrink-0', className)}
    >
      <rect
        x="1"
        y="1"
        width="26"
        height="26"
        rx="7.5"
        fill="#13223d"
        stroke="#1fc7ac"
        strokeWidth="1.6"
      />
      <path
        d="M6.5 21V13.5a7.5 7.5 0 0 1 15 0V21"
        fill="none"
        stroke="rgba(255,255,255,0.34)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M9.5 21.5L12.5 14M18.5 21.5L15.5 14"
        stroke="#26d9bd"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="14" cy="11.5" r="3" fill="#ffffff" />
      <circle cx="14" cy="11.5" r="1.2" fill="#13223d" />
    </svg>
  );
}
