import NumberFlow from '@number-flow/react';
import { cityClock } from '@core/sim/paris_time';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cx } from './cx';
import { type LineRef, lineName, resolveLine } from './lines';

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
  sm: 'h-7 min-w-[4.75rem] px-2.5',
  md: 'h-9 min-w-[5.6rem] px-3',
  lg: 'h-14 min-w-[7.8rem] px-3.5',
  xl: 'h-20 min-w-[10.5rem] px-5',
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

const dire = (p: Passage) =>
  p.ligne ? `${lineName(p.ligne.shortName)}, ${describePassage(p)}` : describePassage(p);

export function Afficheur({
  passages,
  size = 'sm',
  max = 2,
  onPassage,
  libelleAction = 'Suivre la rame',
  className,
}: AfficheurProps) {
  const shown = passages.slice(0, max);
  const sentence = shown.map(dire).join(', puis ');
  return (
    <span className={cx('afficheur inline-flex shrink-0 items-stretch overflow-hidden', className)}>
      {!onPassage && <span className="sr-only">{sentence || 'Aucun passage annoncé'}</span>}
      {shown.length === 0 && (
        <Cell size={size}>
          <Muted size={size}>—</Muted>
        </Cell>
      )}
      {shown.map((p, i) => {
        const notch = p.ligne ? (
          <span
            aria-hidden
            className="absolute inset-y-[24%] left-[4px] w-[3px] rounded-full"
            style={{ backgroundColor: resolveLine(p.ligne).color }}
          />
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
                className={cx(
                  cls,
                  'outline-none transition-colors duration-150 ease-signal hover:bg-white/10 focus-visible:bg-white/10 focus-visible:[box-shadow:inset_0_0_0_2px_var(--color-email-300)]'
                )}
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
  return (
    <span className={cx('signaletique font-semibold text-afficheur-theorique/70', TEXT[size])}>
      {children}
    </span>
  );
}

function PassageGlyph({ p, size }: { p: Passage; size: AfficheurSize }) {
  const m = p.minutes ?? null;
  if (p.statut === 'supprime')
    return (
      <span className={cx('signaletique font-semibold text-signal-300', TEXT[size])}>supprimé</span>
    );
  if (p.statut === 'termine') return <Muted size={size}>terminé</Muted>;
  if (p.statut === 'quai') return <LedDotMatrix text="A QUAI" size={size} />;
  if (p.statut === 'approche' || m === 0) return <Approche size={size} />;
  if (m == null) return <Muted size={size}>—</Muted>;
  const { n, u } = formatLong(m);
  const tone = p.source === 'theorique' ? 'text-afficheur-theorique' : 'text-afficheur-encre';
  if (m < 60) {
    return (
      <span className={cx('flex items-baseline gap-1', tone)}>
        <LedDotMatrix text={`${m} MIN`} size={size} />
        {p.statut === 'retard' && (
          <span className="ml-1 size-1.5 self-start rounded-full bg-vigilance" />
        )}
      </span>
    );
  }
  return (
    <span className={cx('flex items-baseline', tone)}>
      {m < 60 ? (
        <NumberFlow value={m} trend={-1} className={cx('chiffres font-bold', NUM[size])} />
      ) : (
        <span key={n} className={cx('chiffres font-bold animate-rafraichir', NUM[size])}>
          {n}
        </span>
      )}
      {u && <span className={cx('signaletique font-semibold', UNIT[size])}>{u}</span>}
      {p.statut === 'retard' && (
        <span className="ml-1 size-1.5 self-start rounded-full bg-vigilance" />
      )}
    </span>
  );
}

const FONT_5X7: Record<string, readonly string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};

const LED_METRICS: Record<AfficheurSize, { pitch: number; r: number }> = {
  sm: { pitch: 1.85, r: 0.78 },
  md: { pitch: 2.5, r: 1.0 },
  lg: { pitch: 3.5, r: 1.25 },
  xl: { pitch: 5.2, r: 1.85 },
};

function LedDotMatrix({ text, size }: { text: string; size: AfficheurSize }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { pitch, r } = LED_METRICS[size];
  const cols = text.length * 6 - 1;
  const rows = 7;
  const w = Math.ceil(cols * pitch + 2);
  const h = Math.ceil(rows * pitch + 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const litColor = '#ffb81c';
    const coreColor = '#fff3cf';
    const offColor = 'rgba(92, 68, 12, 0.45)';

    const drawFrame = (revealCols: number) => {
      ctx.clearRect(0, 0, w, h);
      let cursor = 0;
      for (const ch of text) {
        const glyph = FONT_5X7[ch];
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < 5; col++) {
            const cIdx = cursor + col;
            const x = 1 + cIdx * pitch + pitch / 2;
            const y = 1 + row * pitch + pitch / 2;
            const lit = !!glyph && glyph[row][col] === '1' && cIdx <= revealCols;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = lit ? litColor : offColor;
            ctx.fill();
            if (lit) {
              ctx.beginPath();
              ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
              ctx.fillStyle = coreColor;
              ctx.fill();
            }
          }
        }
        cursor += 6;
      }
    };

    drawFrame(cols);
  }, [cols, h, pitch, r, rows, size, text, w]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ width: w, height: h }}
      className="block shrink-0 self-center"
    />
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
  timezone?: string;
  /** Re-render every 15 s when no date is given */
  live?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

function cityTimeDate(timezone: string): Date {
  const clock = cityClock(new Date(), timezone);
  const d = new Date();
  const h = Math.floor(clock.secondsSinceMidnight / 3600);
  const m = Math.floor((clock.secondsSinceMidnight % 3600) / 60);
  const s = Math.floor(clock.secondsSinceMidnight % 60);
  d.setHours(h, m, s, 0);
  return d;
}

export function Horloge({
  date,
  timezone = 'Europe/Paris',
  live = true,
  size = 'sm',
  className,
}: HorlogeProps) {
  const [now, setNow] = useState(() => date ?? cityTimeDate(timezone));
  useEffect(() => {
    if (date) {
      setNow(date);
      return;
    }
    setNow(cityTimeDate(timezone));
    if (!live) return;
    const id = window.setInterval(() => setNow(cityTimeDate(timezone)), 15_000);
    return () => window.clearInterval(id);
  }, [date, timezone, live]);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <time
      dateTime={`${hh}:${mm}`}
      className={cx(
        'afficheur inline-flex items-center justify-center',
        size === 'sm' ? 'h-7 px-2.5' : 'h-9 px-3',
        className
      )}
    >
      <span className="pl-sr">{`Heure : ${Number(hh)} h ${mm}`}</span>
      <span aria-hidden="true" className="inline-flex items-center">
        <LedDotMatrix text={`${hh}:${mm}`} size={size} />
      </span>
    </time>
  );
}
