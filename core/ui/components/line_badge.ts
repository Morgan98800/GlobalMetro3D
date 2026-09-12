/**
 * line_badge.ts — indices de lignes en cercles, aux couleurs autoritaires GTFS.
 *
 * Corrige le défaut actuel : route_color était utilisé, route_text_color ignoré,
 * ce qui produisait du blanc sur jaune (lignes 1, 6, 7bis, 9, 3bis, 13).
 */

export interface LineLike {
  line_id: string;
  short_name: string;
  /** route_color du GTFS, avec ou sans '#' */
  route_color?: string | null;
  /** route_text_color du GTFS, avec ou sans '#' */
  route_text_color?: string | null;
}

const FALLBACK_BG = '#5f5e5a';

function normalizeHex(value?: string | null): string | null {
  if (!value) return null;
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

/** Luminance relative WCAG. */
function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Couleur de texte d'un indice.
 * Priorité à route_text_color ; repli sur le meilleur contraste si la donnée
 * manque ou si elle est illisible sur son fond (ratio AA < 4.5 pour du petit texte,
 * on tolère 3.0 car un indice est du texte large et gras).
 */
export function textColorFor(background: string, provided?: string | null): string {
  const declared = normalizeHex(provided);
  if (declared && contrastRatio(declared, background) >= 3.0) return declared;
  return contrastRatio('#000000', background) >= contrastRatio('#ffffff', background)
    ? '#000000'
    : '#ffffff';
}

/** '3bis' → '3b', '7bis' → '7b'. Les numéros simples sont inchangés. */
export function badgeLabel(shortName: string): string {
  return shortName.replace(/bis$/i, 'b');
}

export interface BadgeOptions {
  selected?: boolean;
  onSelect?: (lineId: string) => void;
  /** false pour un indice purement décoratif (légende, bandeau) */
  interactive?: boolean;
}

export function lineBadge(line: LineLike, options: BadgeOptions = {}): HTMLElement {
  const { selected = false, onSelect, interactive = true } = options;

  const bg = normalizeHex(line.route_color) ?? FALLBACK_BG;
  const fg = textColorFor(bg, line.route_text_color);
  const label = badgeLabel(line.short_name);

  const el = document.createElement(interactive ? 'button' : 'span');
  el.className = 'line-badge';
  el.textContent = label;
  el.dataset.lineId = line.line_id;
  el.dataset.len = String(label.length);
  el.style.background = bg;
  el.style.color = fg;

  if (interactive) {
    const button = el as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `ligne ${line.short_name}`);
    button.addEventListener('click', () => onSelect?.(line.line_id));
  } else {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `ligne ${line.short_name}`);
  }

  return el;
}

/** Grille d'indices, avec gestion de la sélection unique. */
export function lineBadgeGrid(
  lines: LineLike[],
  onSelect: (lineId: string | null) => void
): { element: HTMLElement; setSelected: (lineId: string | null) => void } {
  const grid = document.createElement('div');
  grid.className = 'line-badges';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'lignes de métro');
  grid.dataset.hasSelection = 'false';

  let current: string | null = null;

  const setSelected = (lineId: string | null) => {
    current = lineId;
    grid.dataset.hasSelection = String(lineId !== null);
    for (const child of Array.from(grid.children)) {
      const el = child as HTMLElement;
      el.setAttribute('aria-pressed', String(el.dataset.lineId === lineId));
    }
  };

  for (const line of lines) {
    grid.appendChild(
      lineBadge(line, {
        onSelect: (id) => {
          const next = current === id ? null : id;
          setSelected(next);
          onSelect(next);
        },
      })
    );
  }

  return { element: grid, setSelected };
}

/**
 * Contrôle de contraste — à appeler une fois au démarrage en développement.
 * Journalise les lignes dont l'indice serait illisible.
 */
export function auditLineContrast(lines: LineLike[]): void {
  const rows = lines.map((line) => {
    const bg = normalizeHex(line.route_color) ?? FALLBACK_BG;
    const declared = normalizeHex(line.route_text_color);
    const used = textColorFor(bg, line.route_text_color);
    return {
      ligne: line.short_name,
      fond: bg,
      'texte GTFS': declared ?? '(absent)',
      'texte utilisé': used,
      ratio: Math.round(contrastRatio(used, bg) * 100) / 100,
      substitué: declared !== null && declared !== used,
    };
  });
  // eslint-disable-next-line no-console
  console.table(rows);
}
