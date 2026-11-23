import { useId } from 'react';
import { cx } from './cx';

/**
 * Ornements patrimoniaux du métro parisien, 100 % géométriques et libres de droits :
 * - FriseCeramique : liseré géométrique à losanges inspiré des moulures céramiques
 *   CMP / Nord-Sud (v. 1910), sans marque ni police déposée.
 * - CandelabreDervaux : silhouette vectorielle épurée du candélabre Dervaux (1922,
 *   domaine public) à caisson rétroéclairé ambre.
 */

export function FriseCeramique({
  variante = 'cobalt',
  className,
}: {
  variante?: 'cobalt' | 'nord-sud';
  className?: string;
}) {
  const pid = useId().replace(/:/g, '');
  const cBord = variante === 'nord-sud' ? '#2c6b45' : 'var(--color-email-600)';
  const cAccent = variante === 'nord-sud' ? '#c9932c' : 'var(--color-email-300)';
  const cFond = variante === 'nord-sud' ? '#f4efe2' : 'var(--color-encart)';

  return (
    <svg
      aria-hidden
      viewBox="0 0 160 6"
      preserveAspectRatio="none"
      className={cx('block h-[5px] w-full shrink-0', className)}
    >
      <defs>
        <pattern id={pid} width="16" height="6" patternUnits="userSpaceOnUse">
          <rect width="16" height="6" fill={cFond} />
          <rect y="0" width="16" height="1" fill={cBord} fillOpacity="0.65" />
          <rect y="5" width="16" height="1" fill={cBord} fillOpacity="0.65" />
          <polygon points="8,1 11,3 8,5 5,3" fill={cAccent} fillOpacity="0.72" />
          <circle cx="1.5" cy="3" r="0.7" fill={cBord} fillOpacity="0.45" />
          <circle cx="14.5" cy="3" r="0.7" fill={cBord} fillOpacity="0.45" />
        </pattern>
      </defs>
      <rect width="160" height="6" fill={`url(#${pid})`} />
    </svg>
  );
}

export function CandelabreDervaux({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 28 28"
      fill="none"
      className={cx('size-5 shrink-0', className)}
    >
      {/* Fût fonte vert historique */}
      <path d="M13 15h2v11h-2z" fill="#3a5f47" />
      <path d="M10.5 25.5h7v1.5h-7z" fill="#2d4c38" />
      {/* Corniche et caisson rétroéclairé ambre (1922) */}
      <rect x="2.5" y="4.5" width="23" height="10.5" rx="2.5" fill="#2d4c38" />
      <rect x="4" y="6" width="20" height="7.5" rx="1.5" fill="#d97706" />
      <rect x="4" y="6" width="20" height="7.5" rx="1.5" stroke="#fde68a" strokeOpacity="0.55" strokeWidth="0.75" />
      {/* Ornement sommital géométrique */}
      <circle cx="14" cy="3" r="1.6" fill="#4b765a" />
      {/* Lettrage géométrique générique façon panneau lumineux */}
      <path
        d="M7.2 11.4V8.1l1.6 2 1.6-2v3.3M12.2 11.4V8.1h2.1m-2.1 1.6h1.6m-1.6 1.7h2.1M16.2 8.1v3.3m-1.1-3.3h2.2M19.1 8.1h1.5a1 1 0 0 1 0 1.9h-1.5v1.4m1-1.4 1 1.4"
        stroke="#fef3c7"
        strokeWidth="1.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
