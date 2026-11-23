/* ==========================================================================
   PLAN LUMINEUX — composants React
   Fins habillages autour de plan-lumineux.css et plan-lumineux.js.
   Monter <PlanLumineuxRacine /> une fois (dans SubwayAppShell par exemple).
   ========================================================================== */
import { RiBox3Line, RiLoader4Line } from '@remixicon/react';
import {
  forwardRef, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type ReactNode,
} from 'react';
import { initialiser, tracer, embarquer, Siel } from './plan-lumineux.js';
import './plan-lumineux.css';

/* ---------- Démarrage ---------- */
export function PlanLumineuxRacine() {
  useEffect(() => initialiser(document.body), []);
  return null;
}

/* ---------- Poussoir : remplace Button et IconButton ---------- */
export type Variante = 'faience' | 'email' | 'discret' | 'alerte' | 'champ' | 'embarquement';
export type Taille = 'sm' | 'md' | 'lg';
export type PoussoirProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variante?: Variante;
  taille?: Taille;
  rond?: boolean;          // ex-IconButton : donner un aria-label
  tuile?: boolean;         // carreau 2:1 (raccourcis mobiles)
  pleineLargeur?: boolean;
  lampe?: boolean;         // ampoule PILI : allumée par pressed / checked / expanded / actif
  icone?: ReactNode;
  pressed?: boolean;
  expanded?: boolean;
  actif?: boolean;         // état allumé sans sémantique ARIA (ex. Domicile configuré)
  children?: ReactNode;
};
export const Poussoir = forwardRef<HTMLButtonElement, PoussoirProps>(function Poussoir(
  { variante = 'faience', taille = 'md', rond, tuile, pleineLargeur, lampe, icone, pressed, expanded, actif, children, className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`pl-poussoir ${className}`}
      data-variant={variante === 'faience' ? undefined : variante}
      data-size={taille === 'md' ? undefined : taille}
      data-forme={rond ? 'rond' : tuile ? 'tuile' : undefined}
      data-largeur={pleineLargeur ? 'pleine' : undefined}
      data-actif={actif ? '' : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      {...rest}
    >
      <span className="pl-calotte">
        {lampe && <i className="pl-lampe" aria-hidden="true" />}
        {icone}
        {children}
      </span>
    </button>
  );
});

/* ---------- Interrupteur (role switch) ---------- */
export function Interrupteur({ checked, onChange, children, taille, ...rest }: Omit<PoussoirProps, 'onChange'> & { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Poussoir {...rest} role="switch" aria-checked={checked} lampe taille={taille} onClick={() => onChange(!checked)}>
      {children}
    </Poussoir>
  );
}

/* ---------- Clavier : remplace Segmented ---------- */
export function Clavier<T extends string>({ label, options, valeur, onChange, taille = 'sm', pleineLargeur }: {
  label: string; options: { valeur: T; libelle: ReactNode }[]; valeur: T; onChange: (v: T) => void; taille?: Taille; pleineLargeur?: boolean;
}) {
  const onKey = (e: KeyboardEvent) => {
    const n = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!n) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.valeur === valeur);
    const suivant = options[(i + n + options.length) % options.length];
    onChange(suivant.valeur);
    requestAnimationFrame(() => (e.currentTarget.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  };
  return (
    <div className="pl-clavier" role="radiogroup" aria-label={label} data-largeur={pleineLargeur ? 'pleine' : undefined} onKeyDown={onKey}>
      {options.map((o) => (
        <Poussoir key={o.valeur} role="radio" aria-checked={o.valeur === valeur} tabIndex={o.valeur === valeur ? 0 : -1}
          lampe taille={taille} onClick={() => onChange(o.valeur)}>
          {o.libelle}
        </Poussoir>
      ))}
    </div>
  );
}

/* ---------- Champ de recherche (faux input) ---------- */
export function ChampRecherche({ placeholder = 'Où allez-vous ?', raccourci = '⌘K', onOuvrir, icone }: { placeholder?: string; raccourci?: string | null; onOuvrir: () => void; icone: ReactNode }) {
  return (
    <Poussoir variante="champ" taille="lg" pleineLargeur icone={icone} onClick={onOuvrir} aria-label="Rechercher une station, une ligne ou un lieu">
      <span>{placeholder}</span>
      {raccourci && <kbd className="pl-kbd">{raccourci}</kbd>}
    </Poussoir>
  );
}

/* ---------- Indice de ligne : remplace LineBadgeChip ---------- */
export function IndiceLigne({ ligne, couleur, texte = '#fff', taille, selected, trafic, onClick }: {
  ligne: string; couleur: string; texte?: string; taille?: 'xs' | 'sm' | 'md'; selected?: boolean; trafic?: 'vigilance' | 'alerte'; onClick?: () => void;
}) {
  const style = { '--pl-ligne': couleur, '--pl-ligne-texte': texte } as CSSProperties;
  const contenu = ligne.endsWith('bis') ? <>{ligne.replace('bis', '')}<sub>bis</sub></> : ligne;
  if (!onClick) return <span className="pl-indice" style={style} data-size={taille} data-trafic={trafic} aria-label={`Ligne ${ligne}`}>{contenu}</span>;
  return (
    <button type="button" className="pl-indice" style={style} data-size={taille} data-trafic={trafic}
      aria-pressed={selected} aria-label={`Ligne ${ligne}`} onClick={onClick}>{contenu}</button>
  );
}

/* ---------- Plaque carrelée & cartouche ---------- */
export function Plaque({ children, taille }: { children: ReactNode; taille?: 'sm' }) {
  return <div className="pl-plaque" data-size={taille}><div className="pl-plaque-carreaux">{children}</div></div>;
}
/** Abréviation des plaques anciennes : <Abr base="P" exposant="te" /> donne Pᵗᵉ */
export const Abr = ({ base, exposant }: { base: string; exposant: string }) => (
  <span className="pl-abr" aria-label={base + exposant}>{base}<sup>{exposant}</sup></span>
);
export function Cartouche({ children, fleche }: { children: ReactNode; fleche?: ReactNode }) {
  return <div className="pl-cartouche"><span><b>{children}</b>{fleche}</span></div>;
}

/* ---------- Thermomètre PILI ---------- */
export type Arret = { nom: string; correspondances?: ReactNode };
export function Thermometre({ arrets, ici = 0, couleur, orientation, onArret }: {
  arrets: Arret[]; ici?: number; couleur: string; orientation?: 'horizontal'; onArret?: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="pl-thermo" data-orientation={orientation} style={{ '--pl-ligne': couleur } as CSSProperties}>
      <ol className="pl-thermo-liste">
        {arrets.map((a, i) => (
          <li key={a.nom}>
            <button type="button" className="pl-arret" data-ici={i === ici ? '' : undefined} data-terminus={i === 0 || i === arrets.length - 1 ? '' : undefined}
              onClick={() => { if (ref.current) tracer(ref.current, i, { depuis: ici }); onArret?.(i); }}>
              <i className="pl-lampe" aria-hidden="true" />
              {a.nom}
              {a.correspondances}
            </button>
          </li>
        ))}
      </ol>
      <span className="pl-rame" aria-hidden="true" />
    </div>
  );
}

/* ---------- Afficheur SIEL ---------- */
export type LigneSiel = { destination: string; minutes: number };
export function AfficheurSiel({ lignes, tete, onSuivre }: { lignes: LigneSiel[]; tete?: ReactNode; onSuivre?: (index: number) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const siel = useRef<Siel | null>(null);
  useEffect(() => {
    if (!cv.current) return;
    siel.current = new Siel(cv.current, { lignes, onSuivre });
    return () => siel.current?.detruire();
    // onSuivre change le mode : recréer l'afficheur
  }, [Boolean(onSuivre)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { siel.current?.maj(lignes); }, [JSON.stringify(lignes)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pl-siel">
      {tete && <div className="pl-siel-tete">{tete}</div>}
      <div className="pl-siel-vitre"><canvas ref={cv} className="pl-siel-matrice" /></div>
    </div>
  );
}

/* ---------- Bouton d'embarquement : entrée en 3D ---------- */
export function BoutonEmbarquement({
  children = 'Monter à bord',
  interieur = 'Patientez…',
  taille,
  pleineLargeur,
  loading = false,
  disabled,
  onOuvertes,
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children?: ReactNode;
  interieur?: ReactNode;
  taille?: Taille;
  pleineLargeur?: boolean;
  loading?: boolean;
  onOuvertes: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pendingClick, setPendingClick] = useState(false);
  const isWaiting = Boolean(loading || pendingClick);

  return (
    <button
      ref={ref}
      type="button"
      className={`pl-poussoir ${className}`}
      data-variant="embarquement"
      data-size={taille}
      data-largeur={pleineLargeur ? 'pleine' : undefined}
      disabled={disabled}
      aria-busy={isWaiting || undefined}
      onClick={() => {
        if (!ref.current || isWaiting) return;
        setPendingClick(true);
        Promise.resolve(embarquer(ref.current, { onOuvertes })).finally(() => setPendingClick(false));
      }}
      {...rest}
    >
      <span className="pl-calotte">
        <span className="pl-interieur">
          {isWaiting ? (
            <RiLoader4Line aria-hidden className="size-[17px] shrink-0 animate-spin text-[#ffd9a0]" />
          ) : (
            <RiBox3Line aria-hidden className="size-[17px] shrink-0 text-[#ffd9a0]" />
          )}
          {isWaiting ? 'Patientez…' : interieur}
        </span>
        <span className="pl-libelle">
          {isWaiting ? (
            <>
              <RiLoader4Line aria-hidden className="size-[17px] shrink-0 animate-spin text-[#f5b461]" />
              Patientez…
            </>
          ) : (
            <>
              <RiBox3Line aria-hidden className="size-[17px] shrink-0 text-[#f5b461]" />
              {children}
            </>
          )}
        </span>
        <span className="pl-vantail" data-cote="g" />
        <span className="pl-vantail" data-cote="d" />
      </span>
    </button>
  );
}

/* ---------- Carte d'itinéraire repliable ---------- */
export function CarteTrajet({ resume, detail }: { resume: ReactNode; detail: ReactNode }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <li style={{ listStyle: 'none' }}>
      <button type="button" className="pl-carte-trajet" aria-expanded={ouverte} onClick={() => setOuverte(!ouverte)}>{resume}</button>
      {ouverte && detail}
    </li>
  );
}

/* ---------- Conteneurs ---------- */
export const Hud = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`pl-hud ${className}`}>{children}</div>;
export const Mur = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`pl-mur ${className}`}>{children}</div>;
