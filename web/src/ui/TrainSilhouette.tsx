import { cx } from './cx';

export interface TrainSilhouetteProps {
  stockId: string;
  lineColor: string;
  className?: string;
}

type SilhouetteKind = 'aero' | 'boa' | 'classic' | 'sprague' | 'rer';

function resolveKind(stockId: string): SilhouetteKind {
  if (stockId === 'sprague') return 'sprague';
  if (stockId === 'rera' || stockId === 'rerb' || stockId === 'ms61') return 'rer';
  if (stockId === 'mf19' || stockId.startsWith('mp14')) return 'aero';
  if (stockId === 'mp05' || stockId === 'mf01' || stockId.startsWith('mp89')) return 'boa';
  return 'classic';
}

/**
 * Mini-silhouette vectorielle ultra-légère (< 1 Ko) pour les cartes fermées
 * de la Bibliothèque : permet de reconnaître le matériel au premier coup d'œil.
 */
export function TrainSilhouette({ stockId, lineColor, className }: TrainSilhouetteProps) {
  const kind = resolveKind(stockId);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 18"
      fill="none"
      className={cx('h-[18px] w-[48px] shrink-0 text-encre-2/80', className)}
    >
      {/* Rail hairline */}
      <line x1="1" y1="16.5" x2="47" y2="16.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" strokeLinecap="round" />

      {kind === 'aero' && (
        <>
          <path
            d="M3 13.5V7.5C3 5.2 4.6 4 7 4H36.5C40.5 4 43.2 6.8 44.5 11.2L45 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M5 10.5H43.5" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="7" y="6" width="6" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <rect x="15" y="6" width="6" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <rect x="23" y="6" width="6" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <rect x="31" y="6" width="5" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <path d="M38 6L41.5 9.2H38V6Z" fill="currentColor" fillOpacity="0.45" />
        </>
      )}

      {kind === 'boa' && (
        <>
          <path
            d="M3 13.5V6.5C3 4.8 4.4 4 6.2 4H39C41.8 4 43.8 6 44.5 9.8L44.8 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M4.5 10.5H43.5" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="7" y="6" width="5.5" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <rect x="14.5" y="6" width="5.5" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <rect x="22" y="6" width="5.5" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <rect x="29.5" y="6" width="5.5" height="3" rx="0.8" fill="currentColor" fillOpacity="0.35" />
          <path d="M37.5 5.8H41.2L42.3 9H37.5V5.8Z" fill="currentColor" fillOpacity="0.45" />
        </>
      )}

      {kind === 'classic' && (
        <>
          <rect
            x="3"
            y="4.2"
            width="41"
            height="9.3"
            rx="2"
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M4 10.6H43" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="6.5" y="6" width="5" height="3" rx="0.6" fill="currentColor" fillOpacity="0.35" />
          <rect x="13.5" y="6" width="5" height="3" rx="0.6" fill="currentColor" fillOpacity="0.35" />
          <rect x="20.5" y="6" width="5" height="3" rx="0.6" fill="currentColor" fillOpacity="0.35" />
          <rect x="27.5" y="6" width="5" height="3" rx="0.6" fill="currentColor" fillOpacity="0.35" />
          <rect x="35" y="6" width="6" height="3.2" rx="0.6" fill="currentColor" fillOpacity="0.45" />
        </>
      )}

      {kind === 'sprague' && (
        <>
          <rect x="9" y="2.6" width="28" height="1.8" rx="0.7" fill="currentColor" fillOpacity="0.3" />
          <rect
            x="4"
            y="4.4"
            width="39"
            height="9.1"
            rx="1.5"
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M5 10.6H42" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="7" y="6" width="4" height="3.2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="13" y="6" width="4" height="3.2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="19" y="6" width="4" height="3.2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="25" y="6" width="4" height="3.2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="31" y="6" width="4" height="3.2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="37" y="6" width="3.5" height="3.2" rx="0.5" fill="currentColor" fillOpacity="0.45" />
        </>
      )}

      {kind === 'rer' && (
        <>
          {/* Pantographe léger */}
          <path d="M12 4V2.5L15 1.5H19" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M3 13.5V5.5C3 4.5 3.8 4 5 4H40C42.2 4 43.8 5.5 44.5 9.2L44.8 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M4.5 9H43.5" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
          {/* Étages haut / bas */}
          <rect x="6.5" y="5.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="14.5" y="5.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="22.5" y="5.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="30.5" y="5.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="6.5" y="10.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="14.5" y="10.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="22.5" y="10.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
          <rect x="30.5" y="10.4" width="6" height="2" rx="0.5" fill="currentColor" fillOpacity="0.35" />
        </>
      )}

      {/* Bogies */}
      <circle cx="11" cy="14.8" r="1.4" fill="currentColor" fillOpacity="0.55" />
      <circle cx="15" cy="14.8" r="1.4" fill="currentColor" fillOpacity="0.55" />
      <circle cx="33" cy="14.8" r="1.4" fill="currentColor" fillOpacity="0.55" />
      <circle cx="37" cy="14.8" r="1.4" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}
