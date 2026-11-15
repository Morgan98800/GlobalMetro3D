import { useEffect, useState, type ReactNode } from 'react';
import { cx } from './cx';
import { lineName, resolveLine, type LineRef } from './lines';

/**
 * Afficheur — the platform display. Black glass, amber numerals.
 * Amber means "live": nothing else in the interface uses it.
 * Scheduled (GTFS-only) times are drawn in white so riders can tell them apart.
 */
export type PassageStatut = 'approche' | 'quai' | 'retard' | 'supprime' | 'termine';
export type PassageSource = 'temps-reel' | 'theorique';

export interface Passage {
  /** Minutes until departure; 0 renders the approach dots */
  minutes?: number | null;
  statut?: PassageStatut;
  source?: PassageSource;
  /** Ligne du passage, quand l’afficheur mélange plusieurs lignes (Autour de moi) */
  ligne?: LineRef;
}

export type AfficheurSize = 'sm' | 'md' | 'lg' | 'xl';

const NUM: Record<AfficheurSize, string> = {
  sm: 'text-chiffre-sm',
  md: 'text-chiffre',
  lg: 'text-chiffre-lg',
  xl: 'text-chiffre-xl',
};
const UNIT: Record<AfficheurSize, string> = {
  sm: 'text-[10px] ml-[2px]',
  md: 'text-[11px] ml-[3px]',
  lg: 'text-[14px] ml-1',
  xl: 'text-[18px] ml-1.5',
};
const CELL: Record<AfficheurSize, string> = {
  sm: 'h-7 min-w-[3.25rem] px-2',
  md: 'h-9 min-w-[4rem] px-2.5',
  lg: 'h-14 min-w-[6rem] px-3.5',
  xl: 'h-20 min-w-[8.5rem] px-5',
};
const TEXT: Record<AfficheurSize, string> = {
  sm: 'text-[12px]',
  md: 'text-[13px]',
  lg: 'text-[18px]',
  xl: 'text-[24px]',
};

export function describePassage(p: Passage): string {
  if (p.statut === 'supprime') return 'train supprimé';
  if (p.statut === 'termine') return 'service terminé';
  if (p.statut === 'quai') return 'à quai';
  const m = p.minutes ?? null;
  if (p.statut === 'approche' || m === 0) return 'à l’approche';
  if (m == null) return 'horaire indisponible';
  const when = m === 1 ? 'dans 1 minute' : `dans ${m} minutes`;
  const late = p.statut === 'retard' ? ', retardé' : '';
  return p.source === 'theorique' ? `${when}, horaire théorique${late}` : `${when}${late}`;
}

function formatLong(m: number): { n: string; u: string } {
  if (m < 60) return { n: String(m), u: 'min' };
  const h = Math.floor(m / 60);
  return { n: `${h}h${String(m % 60).padStart(2, '0')}`, u: '' };
}

export interface AfficheurProps {
  passages: Passage[];
  size?: AfficheurSize;
  /** Number of departures shown; screens show two */
  max?: 1 | 2;
  /** Mode Passionné : chaque horaire devient un bouton (suivre la rame) */
  onPassage?: (index: number) => void;
  libelleAction?: string;
  className?: string;
}

const dire = (p: Passage) => (p.ligne ? `${lineName(p.ligne.shortName)}, ${describePassage(p)}` : describePassage(p));

export function Afficheur({ passages, size = 'sm', max = 2, onPassage, libelleAction = 'Suivre la rame', className }: AfficheurProps) {
  const shown = passages.slice(0, max);
  const sentence = shown.map(dire).join(', puis ');
  return (
    <span className={cx('afficheur inline-flex shrink-0 items-stretch overflow-hidden', className)}>
      {!onPassage && <span className="sr-only">{sentence || 'Aucun passage annoncé'}</span>}
      {shown.length === 0 && <Cell size={size}><Muted size={size}>—</Muted></Cell>}
      {shown.map((p, i) => {
        const notch = p.ligne ? (
          <span aria-hidden className="absolute inset-y-[24%] left-[4px] w-[3px] rounded-full" style={{ backgroundColor: resolveLine(p.ligne).color }} />
        ) : null;
        const cls = cx('relative flex items-center justify-center', CELL[size], p.ligne && 'pl-4');
        return (
          <span key={i} className="flex items-stretch" aria-hidden={onPassage ? undefined : true}>
            {i > 0 && <span aria-hidden className="my-[18%] w-px bg-afficheur-filet opacity-70" />}
            {onPassage ? (
              <button
                type="button"
                onClick={() => onPassage(i)}
                aria-label={`${libelleAction}, ${dire(p)}`}
                title={libelleAction}
                className={cx(cls, 'outline-none transition-colors duration-150 ease-signal hover:bg-white/10 focus-visible:bg-white/10 focus-visible:[box-shadow:inset_0_0_0_2px_var(--color-email-300)]')}
              >
                {notch}
                <PassageGlyph p={p} size={size} />
              </button>
            ) : (
              <span className={cls}>
                {notch}
                <PassageGlyph p={p} size={size} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function Cell({ size, children }: { size: AfficheurSize; children: ReactNode }) {
  return <span className={cx('flex items-center justify-center', CELL[size])}>{children}</span>;
}

function Muted({ size, children }: { size: AfficheurSize; children: ReactNode }) {
  return <span className={cx('signaletique font-semibold text-afficheur-theorique/70', TEXT[size])}>{children}</span>;
}

function PassageGlyph({ p, size }: { p: Passage; size: AfficheurSize }) {
  const m = p.minutes ?? null;
  if (p.statut === 'supprime')
    return <span className={cx('signaletique font-semibold text-signal-300', TEXT[size])}>supprimé</span>;
  if (p.statut === 'termine') return <Muted size={size}>terminé</Muted>;
  if (p.statut === 'quai') return <span className={cx('signaletique font-bold', TEXT[size])}>à quai</span>;
  if (p.statut === 'approche' || m === 0) return <Approche size={size} />;
  if (m == null) return <Muted size={size}>—</Muted>;
  const { n, u } = formatLong(m);
  const tone = p.source === 'theorique' ? 'text-afficheur-theorique' : 'text-afficheur-encre';
  return (
    <span className={cx('flex items-baseline', tone)}>
      <span key={n} className={cx('chiffres font-bold animate-rafraichir', NUM[size])}>{n}</span>
      {u && <span className={cx('signaletique font-semibold', UNIT[size])}>{u}</span>}
      {p.statut === 'retard' && <span className="ml-1 size-1.5 self-start rounded-full bg-vigilance" />}
    </span>
  );
}

const DOTS: Record<AfficheurSize, string> = {
  sm: 'size-[5px] gap-[3px]',
  md: 'size-[6px] gap-[4px]',
  lg: 'size-[9px] gap-[6px]',
  xl: 'size-[12px] gap-[8px]',
};

/** The approach indicator: three dots stepping like the platform screens. */
export function Approche({ size = 'sm' }: { size?: AfficheurSize }) {
  const [dot, gap] = DOTS[size].split(' ');
  return (
    <span className={cx('flex items-center', gap)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cx(dot, 'rounded-full bg-afficheur-encre animate-approche')}
          style={{ animationDelay: `${(i - 3) * 0.4667}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Horloge — network time on a small display. It anchors every relative time
 * in the interface ("2 min" means 21:22).
 */
export interface HorlogeProps {
  date?: Date;
  /** Re-render every 15 s when no date is given */
  live?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function Horloge({ date, live = true, size = 'sm', className }: HorlogeProps) {
  const [now, setNow] = useState(() => date ?? new Date());
  useEffect(() => {
    if (date) {
      setNow(date);
      return;
    }
    if (!live) return;
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, [date, live]);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <time
      dateTime={`${hh}:${mm}`}
      aria-label={`Heure : ${Number(hh)} h ${mm}`}
      className={cx(
        'afficheur chiffres inline-flex items-center font-bold',
        size === 'sm' ? 'h-7 px-2 text-[15px]' : 'h-9 px-2.5 text-[19px]',
        className,
      )}
    >
      {hh}
      <span className="mx-[1px] -translate-y-[0.06em] opacity-70">:</span>
      {mm}
    </time>
  );
}
