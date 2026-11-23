import type { SVGProps } from 'react';

/**
 * Pictogrammes métier sur mesure (esthétique plan de métro parisien, trait 1.75 px).
 * Remplacent les icônes génériques répétées dans la barre, la recherche et les raccourcis.
 */
export function IconLignes(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M4 7h11a4 4 0 0 1 4 4v6" />
      <path d="M4 17h7.5a3.5 3.5 0 0 0 3.5-3.5V11" />
      <circle cx="6.5" cy="7" r="2.2" fill="var(--color-surface, #12151b)" />
      <circle cx="6.5" cy="17" r="2.2" fill="var(--color-surface, #12151b)" />
      <circle cx="19" cy="17" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function IconItineraire(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="6" cy="6.5" r="2.5" />
      <rect x="15.5" y="15" width="5" height="5" rx="1.2" fill="currentColor" stroke="none" />
      <path d="M8.5 6.5H13a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3h-2a3 3 0 0 0-3 3v0a2 2 0 0 0 2 2h5.5" />
    </svg>
  );
}

export function IconStation(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M7 12h10" />
      <circle cx="12" cy="12" r="2" fill="var(--color-surface, #12151b)" />
    </svg>
  );
}

export function IconBibliotheque(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M4 19.5V6.5A2.5 2.5 0 0 1 6.5 4H12v16H6.5A2.5 2.5 0 0 0 4 22Z" />
      <path d="M20 19.5V6.5A2.5 2.5 0 0 0 17.5 4H12v16h5.5a2.5 2.5 0 0 1 2.5 2Z" />
      <path d="M7.5 8.5h2M7.5 12h2M14.5 8.5h2M14.5 12h2" />
    </svg>
  );
}

export function IconXray(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 13l9 5 9-5" opacity={0.65} />
      <path d="M3 17.5 12 22l9-4.5" />
    </svg>
  );
}

export type RollingStockIconKind =
  | 'mp14'
  | 'mp05'
  | 'mf01'
  | 'mf77'
  | 'mf67'
  | 'mf88'
  | 'rer';

const LINE_TO_ROLLING_STOCK_ICON: Record<string, RollingStockIconKind> = {
  '1': 'mp05',
  '2': 'mf01',
  '3': 'mf67',
  '3bis': 'mf67',
  '4': 'mp05',
  '5': 'mf01',
  '6': 'mp05',
  '7': 'mf77',
  '7bis': 'mf88',
  '8': 'mf77',
  '9': 'mf01',
  '10': 'mf67',
  '11': 'mp14',
  '12': 'mf67',
  '13': 'mf77',
  '14': 'mp14',
  A: 'rer',
  B: 'rer',
  C: 'rer',
  D: 'rer',
  E: 'rer',
};

export function resolveRollingStockIconKind(lineShortName?: string | null): RollingStockIconKind {
  if (!lineShortName) return 'mf01';
  const key = lineShortName.trim();
  return LINE_TO_ROLLING_STOCK_ICON[key] ?? LINE_TO_ROLLING_STOCK_ICON[key.toUpperCase()] ?? 'mf01';
}

export interface IconRameProps extends SVGProps<SVGSVGElement> {
  kind: RollingStockIconKind;
}

/**
 * Mini-icône frontale (viewBox 16×16) propre à chaque série de matériel roulant parisien.
 * Conçue en `currentColor` pour s'adapter automatiquement au contraste de chaque ligne.
 */
export function IconRame({ kind, ...props }: IconRameProps) {
  switch (kind) {
    case 'mp14':
      // MP 14 CA : nez galbé arrondi, grande baie panoramique sans loge, signature LED
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
          <path
            d="M3.5 4.2C3.5 2.7 5.2 2 8 2s4.5.7 4.5 2.2l.4 6.6c0 1.4-1.1 2.4-2.5 2.4H5.6c-1.4 0-2.5-1-2.5-2.4l.4-6.6Z"
            stroke="currentColor"
            strokeWidth={1.35}
          />
          <rect x="4.8" y="3.8" width="6.4" height="4.8" rx="1.6" fill="currentColor" opacity={0.9} />
          <path d="M4.6 10.7h2.1M9.3 10.7h2.1" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" />
          <path d="M5.4 13.8v.9M10.6 13.8v.9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      );

    case 'mp05':
      // MP 05 / MP 89 : pavillon arrondi, pare-brise incliné large, girouette fine
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
          <rect x="3.1" y="2.2" width="9.8" height="11" rx="2.3" stroke="currentColor" strokeWidth={1.35} />
          <path d="M5.6 3.6h4.8" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" opacity={0.8} />
          <path d="M4.6 5.2h6.8l.4 3.4H4.2l.4-3.4Z" fill="currentColor" opacity={0.9} />
          <circle cx="5.2" cy="10.8" r="0.95" fill="currentColor" />
          <circle cx="10.8" cy="10.8" r="0.95" fill="currentColor" />
          <path d="M5.2 13.8v.9M10.8 13.8v.9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      );

    case 'mf01':
      // MF 01 (MF 2000) : caisse moderne droite, grande baie frontale en U, feux écartés
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
          <rect x="3" y="2.2" width="10" height="11" rx="1.9" stroke="currentColor" strokeWidth={1.35} />
          <rect x="4.4" y="4.1" width="7.2" height="4.6" rx="1" fill="currentColor" opacity={0.9} />
          <path d="M4.5 10.8h1.8M9.7 10.8h1.8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
          <path d="M5.2 13.8v.9M10.8 13.8v.9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      );

    case 'mf77':
      // MF 77 : caisse galbée élargie aux épaules, deux vitres séparées par montant central
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
          <path
            d="M4 2.4h8l1.2 4.6-.7 6.2H3.5L2.8 7 4 2.4Z"
            stroke="currentColor"
            strokeWidth={1.35}
            strokeLinejoin="round"
          />
          <rect x="4.4" y="4.7" width="2.9" height="3.5" rx="0.6" fill="currentColor" opacity={0.9} />
          <rect x="8.7" y="4.7" width="2.9" height="3.5" rx="0.6" fill="currentColor" opacity={0.9} />
          <circle cx="5.2" cy="10.8" r="0.95" fill="currentColor" />
          <circle cx="10.8" cy="10.8" r="0.95" fill="currentColor" />
          <path d="M5.2 13.8v.9M10.8 13.8v.9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      );

    case 'mf67':
      // MF 67 : face classique à girouette centrale haute, double pare-brise, phares ronds
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
          <rect x="3.2" y="2.3" width="9.6" height="10.9" rx="1.6" stroke="currentColor" strokeWidth={1.35} />
          <rect x="5.8" y="3.2" width="4.4" height="1.1" rx="0.4" fill="currentColor" opacity={0.8} />
          <rect x="4.5" y="5.2" width="3" height="3.3" rx="0.5" fill="currentColor" opacity={0.9} />
          <rect x="8.5" y="5.2" width="3" height="3.3" rx="0.5" fill="currentColor" opacity={0.9} />
          <circle cx="5.1" cy="10.9" r="0.95" fill="currentColor" />
          <circle cx="10.9" cy="10.9" r="0.95" fill="currentColor" />
          <path d="M5.3 13.8v.9M10.7 13.8v.9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      );

    case 'mf88':
      // MF 88 : gabarit compact, grande vitre trapézoïdale et phares rapprochés
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
          <rect x="3.6" y="2.5" width="8.8" height="10.7" rx="1.8" stroke="currentColor" strokeWidth={1.35} />
          <rect x="4.9" y="4.3" width="6.2" height="4.1" rx="0.8" fill="currentColor" opacity={0.9} />
          <circle cx="5.8" cy="10.8" r="0.9" fill="currentColor" />
          <circle cx="10.2" cy="10.8" r="0.9" fill="currentColor" />
          <path d="M5.6 13.8v.9M10.4 13.8v.9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      );

    case 'rer':
      // RER (MI 09 / MI 79 / RER NG) : pantographe en toiture et gabarit haut
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
          <path d="M5.5 1.4h5M8 1.4l-1.8 1.8h3.6L8 1.4Z" stroke="currentColor" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="3.3" width="10" height="10" rx="1.7" stroke="currentColor" strokeWidth={1.35} />
          <rect x="4.5" y="4.8" width="7" height="2.4" rx="0.6" fill="currentColor" opacity={0.85} />
          <rect x="4.5" y="8" width="7" height="2" rx="0.5" fill="currentColor" opacity={0.75} />
          <circle cx="5.1" cy="11.6" r="0.85" fill="currentColor" />
          <circle cx="10.9" cy="11.6" r="0.85" fill="currentColor" />
          <path d="M5.2 13.9v.9M10.8 13.9v.9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
        </svg>
      );
  }
}
