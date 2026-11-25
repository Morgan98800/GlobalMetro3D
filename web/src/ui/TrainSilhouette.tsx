import { cx } from './cx';

export interface TrainSilhouetteProps {
  stockId: string;
  lineColor: string;
  className?: string;
}

type SilhouetteKind =
  | 'mf19'
  | 'mp14_ca'
  | 'mp14_cc'
  | 'mp89'
  | 'mf01'
  | 'mf77'
  | 'mf88'
  | 'classic'
  | 'sprague'
  | 'mi09'
  | 'mi79'
  | 'ms61';

function resolveKind(stockId: string): SilhouetteKind {
  switch (stockId) {
    case 'mf19':
      return 'mf19';
    case 'mp14':
      return 'mp14_ca';
    case 'mp14_cc':
      return 'mp14_cc';
    case 'mp05':
    case 'mp89_ca':
    case 'mp89_cc':
      return 'mp89';
    case 'mf01':
      return 'mf01';
    case 'mf77':
      return 'mf77';
    case 'mf88':
      return 'mf88';
    case 'sprague':
      return 'sprague';
    case 'rera':
      return 'mi09';
    case 'rerb':
      return 'mi79';
    case 'ms61':
      return 'ms61';
    default:
      return 'classic';
  }
}

/**
 * Mini-silhouette vectorielle fidèle aux fenêtres et profils de chaque matériel
 * roulant parisien (< 1 Ko, zéro asset externe).
 */
export function TrainSilhouette({ stockId, lineColor, className }: TrainSilhouetteProps) {
  const kind = resolveKind(stockId);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 18"
      fill="none"
      className={cx('h-[18px] w-[48px] shrink-0 text-encre-2/85', className)}
    >
      {/* Rail */}
      <line
        x1="1"
        y1="16.5"
        x2="47"
        y2="16.5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* MF 19 : nez moderne légèrement incliné, bandeau vitré noir continu en 3 grandes baies */}
      {kind === 'mf19' && (
        <>
          <path
            d="M3 13.5V5.2C3 4.4 3.7 4 4.6 4H40.5C42.2 4 43.6 5.2 44.2 7.4L44.8 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="5"
            y="5.6"
            width="38.2"
            height="3.6"
            rx="1"
            fill="currentColor"
            fillOpacity="0.2"
          />
          <rect
            x="6"
            y="5.8"
            width="9.5"
            height="3.2"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.55"
          />
          <rect
            x="17"
            y="5.8"
            width="9.5"
            height="3.2"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.55"
          />
          <rect
            x="28"
            y="5.8"
            width="9"
            height="3.2"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.55"
          />
          <path d="M38.8 5.8H42.3L43 9H38.8V5.8Z" fill="currentColor" fillOpacity="0.65" />
          <path d="M4.2 10.9H43.6" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MP 14 CA : face avant quasi verticale haute + masque noir intégral panoramique sans loge */}
      {kind === 'mp14_ca' && (
        <>
          <path
            d="M3 13.5V4.8C3 4.2 3.5 3.8 4.2 3.8H42.2C43.4 3.8 44.3 4.6 44.5 6L44.7 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="6"
            y="5.4"
            width="8.5"
            height="4.2"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="16.2"
            y="5.4"
            width="8.5"
            height="4.2"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="26.4"
            y="5.4"
            width="8.5"
            height="4.2"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="36.6"
            y="5.2"
            width="6.8"
            height="4.6"
            rx="0.8"
            fill="currentColor"
            fillOpacity="0.65"
          />
          <path d="M4.2 11.2H43.6" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MP 14 CC : face avant verticale avec fenêtre de loge conducteur dédiée */}
      {kind === 'mp14_cc' && (
        <>
          <path
            d="M3 13.5V4.8C3 4.2 3.5 3.8 4.2 3.8H42.2C43.4 3.8 44.3 4.6 44.5 6L44.7 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="6"
            y="5.4"
            width="8.5"
            height="4.2"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="16.2"
            y="5.4"
            width="8.5"
            height="4.2"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="26.4"
            y="5.4"
            width="8.5"
            height="4.2"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="37"
            y="5.4"
            width="3.2"
            height="3.8"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.55"
          />
          <rect
            x="41"
            y="5.2"
            width="2.4"
            height="4.2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.7"
          />
          <path d="M4.2 11.2H43.6" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MP 89 / MP 05 : nez profilé Roger Tallon + grandes baies noires en bandeau */}
      {kind === 'mp89' && (
        <>
          <path
            d="M3 13.5V5.6C3 4.5 3.9 4 5.2 4H38.5C41.6 4 43.8 6.4 44.6 10.2L45 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="6"
            y="5.6"
            width="8.2"
            height="3.8"
            rx="0.8"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="15.8"
            y="5.6"
            width="8.2"
            height="3.8"
            rx="0.8"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="25.6"
            y="5.6"
            width="8.2"
            height="3.8"
            rx="0.8"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <path d="M35.6 5.6H39.8L42.8 9.4H35.6V5.6Z" fill="currentColor" fillOpacity="0.68" />
          <path d="M4.5 11.1H43.5" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MF 01 : nez facetté + 3 très grandes baies panoramiques basses */}
      {kind === 'mf01' && (
        <>
          <path
            d="M3 13.5V5.2C3 4.4 3.8 4 4.8 4H39.6C41.8 4 43.5 5.6 44.4 8.8L44.8 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="5.8"
            y="5.2"
            width="9.8"
            height="4.5"
            rx="0.9"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="17"
            y="5.2"
            width="9.8"
            height="4.5"
            rx="0.9"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="28.2"
            y="5.2"
            width="8.2"
            height="4.5"
            rx="0.9"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <path d="M38 5.2H41.4L43 9.4H38V5.2Z" fill="currentColor" fillOpacity="0.68" />
          <path d="M4.2 11.2H43.6" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MF 77 : nez très incliné caractéristique + baies plus espacées */}
      {kind === 'mf77' && (
        <>
          <path
            d="M3 13.5V5.2C3 4.4 3.8 4 4.8 4H36.8C40.4 4 43.2 6.6 44.8 11.2L45 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="6"
            y="5.8"
            width="6.2"
            height="3.4"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="14.2"
            y="5.8"
            width="6.2"
            height="3.4"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="22.4"
            y="5.8"
            width="6.2"
            height="3.4"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="30.6"
            y="5.8"
            width="5.2"
            height="3.4"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <path d="M37.4 5.8L42.2 9.4H37.4V5.8Z" fill="currentColor" fillOpacity="0.68" />
          <path d="M4.2 10.9H43.5" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MF 88 : caisse compacte 3 voitures à grandes baies hautes */}
      {kind === 'mf88' && (
        <>
          <path
            d="M4 13.5V5C4 4.3 4.6 4 5.4 4H40.6C42 4 43.4 5 44 7.6L44.4 13.5H4Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="7"
            y="5.4"
            width="8.5"
            height="4"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="17.5"
            y="5.4"
            width="8.5"
            height="4"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="28"
            y="5.4"
            width="8"
            height="4"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <path d="M38 5.4H41.4L42.4 9.2H38V5.4Z" fill="currentColor" fillOpacity="0.65" />
          <path d="M5 11H43" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* Classiques RATP (MF 67 / MP 73 / MP 59) : face avant verticale + 4 paires de fenêtres rectangulaires */}
      {kind === 'classic' && (
        <>
          <rect
            x="3"
            y="4.2"
            width="41"
            height="9.3"
            rx="1.8"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <rect
            x="5.8"
            y="5.8"
            width="5.6"
            height="3.4"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="13"
            y="5.8"
            width="5.6"
            height="3.4"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="20.2"
            y="5.8"
            width="5.6"
            height="3.4"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="27.4"
            y="5.8"
            width="5.6"
            height="3.4"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="35.2"
            y="5.6"
            width="6.4"
            height="3.6"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.65"
          />
          <path d="M4 10.8H43" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* Sprague-Thomson (1930) : lanterneau de toiture + 6 petites fenêtres verticales rivetées */}
      {kind === 'sprague' && (
        <>
          <rect
            x="8.5"
            y="2.5"
            width="29"
            height="1.9"
            rx="0.7"
            fill="currentColor"
            fillOpacity="0.32"
          />
          <rect
            x="4"
            y="4.4"
            width="39"
            height="9.1"
            rx="1.4"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <rect
            x="6.5"
            y="5.8"
            width="3.6"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="12"
            y="5.8"
            width="3.6"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="17.5"
            y="5.8"
            width="3.6"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="23"
            y="5.8"
            width="3.6"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="28.5"
            y="5.8"
            width="3.6"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.52"
          />
          <rect
            x="34.5"
            y="5.8"
            width="5.5"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.65"
          />
          <path d="M5 10.9H42" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MI 09 (RER A) : deux niveaux (double rangée de fenêtres) + nez incliné + pantographe */}
      {kind === 'mi09' && (
        <>
          <path
            d="M11 4V2.4L14.5 1.4H18.5"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 13.5V5.2C3 4.4 3.8 4 4.8 4H39.4C41.8 4 43.6 5.6 44.5 9.2L44.8 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Niveau haut */}
          <rect
            x="6"
            y="5.3"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="14.2"
            y="5.3"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="22.4"
            y="5.3"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="30.6"
            y="5.3"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          {/* Niveau bas */}
          <rect
            x="6"
            y="10.4"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="14.2"
            y="10.4"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="22.4"
            y="10.4"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="30.6"
            y="10.4"
            width="6.5"
            height="2"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <path d="M39 5.5H41.6L43.2 8.8H39V5.5Z" fill="currentColor" fillOpacity="0.68" />
          <path d="M4.5 8.9H43.4" stroke={lineColor} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}

      {/* MI 79 / MI 84 (RER B) : un seul niveau grand gabarit + 4 baies + pantographe */}
      {kind === 'mi79' && (
        <>
          <path
            d="M11 4V2.4L14.5 1.4H18.5"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 13.5V5C3 4.3 3.7 4 4.6 4H40.2C42 4 43.4 5.2 44.2 8.2L44.6 13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="5.8"
            y="5.6"
            width="6.8"
            height="3.8"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="14.2"
            y="5.6"
            width="6.8"
            height="3.8"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="22.6"
            y="5.6"
            width="6.8"
            height="3.8"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="31"
            y="5.6"
            width="6.2"
            height="3.8"
            rx="0.6"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <path d="M38.8 5.6H41.8L42.8 9.2H38.8V5.6Z" fill="currentColor" fillOpacity="0.68" />
          <path d="M4.2 11H43.4" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* MS 61 (RER A 1967) : un niveau, nez droit/légèrement cassé, 4 baies hautes + pantographe losangique */}
      {kind === 'ms61' && (
        <>
          <path
            d="M12 4L14.5 2L17 4M11 2H18"
            stroke="currentColor"
            strokeOpacity="0.55"
            strokeWidth="0.95"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 13.5V4.4H41.4L44.2 7.2V13.5H3Z"
            fill="currentColor"
            fillOpacity="0.13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect
            x="5.5"
            y="5.8"
            width="6.5"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="13.8"
            y="5.8"
            width="6.5"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="22.1"
            y="5.8"
            width="6.5"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="30.4"
            y="5.8"
            width="6.5"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <rect
            x="38.5"
            y="5.8"
            width="4"
            height="3.6"
            rx="0.5"
            fill="currentColor"
            fillOpacity="0.68"
          />
          <path d="M4 11H43.2" stroke={lineColor} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* Bogies */}
      <circle cx="11" cy="14.8" r="1.35" fill="currentColor" fillOpacity="0.55" />
      <circle cx="15" cy="14.8" r="1.35" fill="currentColor" fillOpacity="0.55" />
      <circle cx="33" cy="14.8" r="1.35" fill="currentColor" fillOpacity="0.55" />
      <circle cx="37" cy="14.8" r="1.35" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}
