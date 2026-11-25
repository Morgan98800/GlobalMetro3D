import {
  RiCloseCircleFill,
  RiGitCommitLine,
  RiMapPin2Line,
  RiRouteLine,
  RiSearchLine,
} from '@remixicon/react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { Kbd } from './Kbd';
import { LineBadgeChip } from './LineBadgeChip';
import { lineName, type LineRef } from './lines';
import { useIsDesktop } from './useMediaQuery';

/**
 * Recherche ⌘K (v2.1). Un champ, une liste. Aucun bouton : l’itinéraire A → B est
 * la première option, pas un bouton à part. Combobox ARIA, flèches + Entrée.
 * La correspondance est en gras, jamais en couleur.
 */
export type ResultatRecherche =
  | { type: 'itineraire' }
  | { type: 'station'; id: string; nom: string; lignes: LineRef[]; detail?: string }
  | { type: 'ligne'; ligne: LineRef; termini: [string, string] }
  | { type: 'lieu'; id: string; nom: string; detail?: string };

export interface StationSearchPaletteProps {
  ouverte: boolean;
  requete: string;
  onRequete: (v: string) => void;
  stations: Extract<ResultatRecherche, { type: 'station' }>[];
  lignes: Extract<ResultatRecherche, { type: 'ligne' }>[];
  lieux: Extract<ResultatRecherche, { type: 'lieu' }>[];
  onChoisir: (r: ResultatRecherche) => void;
  onClose: () => void;
  /** Option active au montage (maquettes) */
  actifInitial?: number;
}

const plier = (c: string) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().charAt(0) || c;

/** Met en gras la partie qui correspond, insensible aux accents et à la casse. */
function surligner(texte: string, q: string): ReactNode {
  const query = q.trim();
  if (!query) return texte;
  const folded = Array.from(texte).map(plier).join('');
  const fq = Array.from(query).map(plier).join('');
  const i = folded.indexOf(fq);
  if (i < 0) return texte;
  const chars = Array.from(texte);
  return (
    <>
      {chars.slice(0, i).join('')}
      <mark className="bg-transparent font-bold text-encre">
        {chars.slice(i, i + fq.length).join('')}
      </mark>
      {chars.slice(i + fq.length).join('')}
    </>
  );
}

export function StationSearchPalette(p: StationSearchPaletteProps) {
  const desktop = useIsDesktop();
  const listId = useId();
  const options = useMemo<ResultatRecherche[]>(
    () => [{ type: 'itineraire' }, ...p.stations, ...p.lignes, ...p.lieux],
    [p.stations, p.lignes, p.lieux]
  );
  const [actif, setActif] = useState(p.actifInitial ?? 0);
  useEffect(() => setActif((a) => Math.min(a, options.length - 1)), [options.length]);
  if (!p.ouverte) return null;

  const optId = (i: number) => `${listId}-o${i}`;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActif((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      p.onChoisir(options[actif]);
    } else if (e.key === 'Escape') p.onClose();
  };

  let index = 0;
  const option = (r: ResultatRecherche, contenu: ReactNode) => {
    const i = index++;
    return (
      <div
        key={optId(i)}
        id={optId(i)}
        role="option"
        aria-selected={i === actif}
        onMouseEnter={() => setActif(i)}
        onClick={() => p.onChoisir(r)}
        className={cx(
          'grid cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-2 transition-colors duration-100',
          i === actif ? 'bg-selection' : 'hover:bg-encart'
        )}
      >
        {contenu}
      </div>
    );
  };
  const vignette = (icon: ReactNode) => (
    <span
      aria-hidden
      className="grid size-9 place-items-center rounded-[9px] bg-encart text-icone-2 [&_svg]:size-[18px]"
    >
      {icon}
    </span>
  );
  const titre = (t: ReactNode, sous?: ReactNode, signal = false) => (
    <span className="min-w-0">
      <span
        className={cx(
          'block truncate text-[15px] leading-[20px] text-encre',
          signal ? 'signaletique text-[16px] font-medium' : 'font-medium'
        )}
      >
        {t}
      </span>
      {sous && <span className="block truncate text-legende text-encre-3">{sous}</span>}
    </span>
  );

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex justify-center md:items-start md:pt-[11vh]">
      <div aria-hidden className="absolute inset-0 bg-nuit-950/55" onClick={p.onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher une station, une adresse ou une ligne"
        className="relative flex h-full w-full flex-col overflow-hidden bg-surface text-encre animate-feuille md:h-auto md:max-h-[72dvh] md:w-[600px] md:rounded-feuille [box-shadow:0_0_0_1px_var(--color-joint),var(--shadow-flotte)]"
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-joint px-4 pt-[env(safe-area-inset-top)]">
          <RiSearchLine aria-hidden className="size-5 shrink-0 text-icone-2" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={optId(actif)}
            value={p.requete}
            onChange={(e) => p.onRequete(e.target.value)}
            onKeyDown={onKey}
            placeholder="Station, adresse, lieu ou ligne"
            className="min-w-0 flex-1 bg-transparent text-[18px] text-encre outline-none placeholder:text-encre-3"
          />
          {p.requete.length > 0 && (
            <IconButton
              size="sm"
              variant="discret"
              label="Effacer la recherche"
              icon={<RiCloseCircleFill aria-hidden />}
              onClick={() => p.onRequete('')}
            />
          )}
          {desktop ? (
            <Kbd>Échap</Kbd>
          ) : (
            <Button variant="discret" size="sm" onClick={p.onClose}>
              Annuler
            </Button>
          )}
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Résultats"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {option(
            { type: 'itineraire' },
            <>
              {vignette(<RiRouteLine />)}
              {titre('Itinéraire', 'A → B')}
              <span />
            </>
          )}
          <Groupe titre="Stations" vide={!p.stations.length}>
            {p.stations.map((s) =>
              option(
                s,
                <>
                  {vignette(<RiGitCommitLine />)}
                  {titre(surligner(s.nom, p.requete), s.detail, true)}
                  <span className="flex gap-1">
                    {s.lignes.map((l) => (
                      <LineBadgeChip key={l.shortName} {...l} size="xs" />
                    ))}
                  </span>
                </>
              )
            )}
          </Groupe>
          <Groupe titre="Lignes" vide={!p.lignes.length}>
            {p.lignes.map((l) =>
              option(
                l,
                <>
                  <span className="grid size-9 place-items-center">
                    <LineBadgeChip {...l.ligne} size="sm" />
                  </span>
                  {titre(lineName(l.ligne.shortName), `${l.termini[0]} – ${l.termini[1]}`)}
                  <span />
                </>
              )
            )}
          </Groupe>
          <Groupe titre="Lieux" vide={!p.lieux.length}>
            {p.lieux.map((l) =>
              option(
                l,
                <>
                  {vignette(<RiMapPin2Line />)}
                  {titre(surligner(l.nom, p.requete), l.detail)}
                  <span />
                </>
              )
            )}
          </Groupe>
        </div>
      </div>
    </div>
  );
}

function Groupe({ titre, vide, children }: { titre: string; vide: boolean; children: ReactNode }) {
  if (vide) return null;
  return (
    <div role="group" aria-label={titre} className="mt-2.5 border-t border-joint pt-1.5">
      <p
        aria-hidden
        className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-encre-3"
      >
        {titre}
      </p>
      {children}
    </div>
  );
}
