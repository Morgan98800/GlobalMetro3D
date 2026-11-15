import {
  RiArrowRightSLine, RiArrowUpDownLine, RiBriefcase4Line, RiCloseCircleFill, RiCloseLine,
  RiFocus3Line, RiHome5Line, RiShareForwardLine, RiStarFill, RiWalkLine,
} from '@remixicon/react';
import { Fragment, useId } from 'react';
import { Afficheur, type Passage } from './Afficheur';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import { lineName, resolveLine, type LineRef } from './lines';
import { Panneau } from './Panneau';
import { PlanDeLigne } from './PlanDeLigne';
import { VoitureConseillee, type PositionRame } from './VoitureConseillee';
import { useIsDesktop } from './useMediaQuery';
import { useSheetSwipe } from './useSheetSwipe';

/**
 * Itinéraire A → B. The fields read like a line (A ring, B plate), results
 * lead with the duration and the live wait, details redraw the line strip.
 */
export type Segment =
  | { type: 'marche'; minutes: number; metres?: number; consigne?: string }
  | {
      type: 'ligne';
      ligne: LineRef;
      direction: string;
      de: string;
      a: string;
      /** Intermediate stops, in order */
      arrets: string[];
      minutes: number;
      attente?: Passage;
      voiture?: PositionRame;
      raisonVoiture?: string;
    };

export interface Itineraire {
  minutes: number;
  /** "21:26" */
  arrivee: string;
  segments: Segment[];
}

export interface RoutePlannerDrawerProps {
  depart: string;
  arrivee: string;
  onDepart: (v: string) => void;
  onArrivee: (v: string) => void;
  onInverser: () => void;
  onMaPosition: () => void;
  domicile?: string | null;
  travail?: string | null;
  onRaccourci: (kind: 'domicile' | 'travail') => void;
  /** Jusqu’à 4 stations favorites, en raccourcis */
  favoris?: { nom: string; onClick: () => void }[];
  itineraires: Itineraire[];
  selection?: number;
  onSelection?: (index: number) => void;
  onPartager: () => void;
  onClose: () => void;
  presentation?: 'cote' | 'basse';
  className?: string;
}

export function RoutePlannerDrawer(props: RoutePlannerDrawerProps) {
  const desktop = useIsDesktop();
  const basse = (props.presentation ?? (desktop ? 'cote' : 'basse')) === 'basse';
  const swipe = useSheetSwipe({ enabled: basse, onSwipeDown: props.onClose });
  const sel = props.selection ?? 0;
  const pad = basse ? 'px-4' : 'px-5';
  return (
    <Panneau
      matiere="feuille"
      as="section"
      role="dialog"
      aria-labelledby="itineraire-titre"
      className={cx('flex min-h-0 flex-col overflow-hidden animate-feuille', basse ? 'max-h-[90dvh] rounded-b-none' : 'max-h-full', props.className)}
    >
      {basse && (
        <div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} className="flex shrink-0 justify-center pt-2 pb-1">
          <span aria-hidden className="h-1 w-9 rounded-full bg-bord-fort" />
        </div>
      )}
      <div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} className={cx('flex items-center justify-between', pad, basse ? 'pt-2' : 'pt-5')}>
        <h2 id="itineraire-titre" className="text-titre text-encre">Itinéraire</h2>
        <IconButton size="sm" label="Fermer l’itinéraire" icon={<RiCloseLine aria-hidden />} onClick={props.onClose} />
      </div>

      <div className={cx('pt-3', pad)}>
        <div className="relative rounded-[14px] bg-encart p-1">
          <Champ lettre="A" label="Départ" placeholder="D’où partez-vous ?" value={props.depart} onChange={props.onDepart} onMaPosition={props.onMaPosition} />
          <span aria-hidden className="absolute left-[21px] top-[34px] h-[28px] border-l-2 border-dotted border-bord-fort" />
          <span aria-hidden className="mx-3 ml-11 mr-14 block h-px bg-joint" />
          <Champ lettre="B" label="Arrivée" placeholder="Où allez-vous ?" value={props.arrivee} onChange={props.onArrivee} />
          <IconButton
            size="sm"
            variant="secondaire"
            label="Inverser départ et arrivée"
            icon={<RiArrowUpDownLine aria-hidden />}
            onClick={props.onInverser}
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" icon={<RiHome5Line aria-hidden />} onClick={() => props.onRaccourci('domicile')}>
            {props.domicile ? 'Domicile' : 'Définir le domicile'}
          </Button>
          <Button size="sm" icon={<RiBriefcase4Line aria-hidden />} onClick={() => props.onRaccourci('travail')}>
            {props.travail ? 'Travail' : 'Définir le travail'}
          </Button>
          {props.favoris?.slice(0, 4).map((f) => (
            <Button key={f.nom} size="sm" icon={<RiStarFill aria-hidden />} onClick={f.onClick} className="signaletique">
              {f.nom}
            </Button>
          ))}
        </div>
      </div>

      <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pt-5', pad)}>
        <h3 className="pb-2 text-[13px] font-semibold text-encre-2">
          {props.itineraires.length > 1 ? `${props.itineraires.length} itinéraires` : 'Itinéraire conseillé'}
        </h3>
        <ul className="space-y-2">
          {props.itineraires.map((it, i) => (
            <CarteItineraire key={i} it={it} ouverte={i === sel} onOuvrir={() => props.onSelection?.(i)} />
          ))}
        </ul>
      </div>

      {/* v2.1 : plus de « Effacer » (les ⊗ des champs suffisent) ni de « Fermer » (× en en-tête) */}
      <footer className={cx('flex shrink-0 items-center justify-end gap-2 border-t border-joint pt-3', pad, basse ? 'pb-[max(16px,env(safe-area-inset-bottom))]' : 'pb-5')}>
        <Button size={basse ? 'lg' : 'md'} icon={<RiShareForwardLine aria-hidden />} onClick={props.onPartager}>
          Partager l’itinéraire
        </Button>
      </footer>
    </Panneau>
  );
}

function Champ({ lettre, label, placeholder, value, onChange, onMaPosition }: {
  lettre: 'A' | 'B'; label: string; placeholder: string; value: string; onChange: (v: string) => void; onMaPosition?: () => void;
}) {
  const id = useId();
  return (
    <div className="flex h-12 items-center gap-3 rounded-[10px] pl-3 pr-14 transition-[background-color,box-shadow] duration-150 focus-within:bg-surface focus-within:[box-shadow:inset_0_0_0_2px_var(--color-focus)]">
      <span
        aria-hidden
        className={cx(
          'size-[13px] shrink-0',
          lettre === 'A' ? 'rounded-full border-[3px] border-encre-2 bg-surface' : 'rounded-[3px] bg-action',
        )}
      />
      <label htmlFor={id} className="sr-only">{label} ({lettre})</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint={lettre === 'A' ? 'next' : 'search'}
        className="min-w-0 flex-1 bg-transparent text-[16px] font-medium text-encre outline-none placeholder:font-normal placeholder:text-encre-3"
      />
      {!value && onMaPosition && (
        <IconButton size="sm" label="Partir de ma position" icon={<RiFocus3Line aria-hidden />} onClick={onMaPosition} className="-mr-1" />
      )}
      {value && (
        <button
          type="button"
          aria-label={`Effacer ${label.toLowerCase()}`}
          onClick={() => onChange('')}
          className="shrink-0 rounded-full text-icone-2 hover:text-encre outline-none focus-visible:outline-2 focus-visible:outline-focus"
        >
          <RiCloseCircleFill aria-hidden className="size-[18px]" />
        </button>
      )}
    </div>
  );
}

function CarteItineraire({ it, ouverte, onOuvrir }: { it: Itineraire; ouverte: boolean; onOuvrir: () => void }) {
  const premier = it.segments.find((s) => s.type === 'ligne');
  const attente = premier && premier.type === 'ligne' ? premier.attente : undefined;
  return (
    <li
      className={cx(
        'overflow-hidden rounded-[14px] bg-surface transition-[box-shadow] duration-150 ease-signal',
        ouverte
          ? '[box-shadow:inset_0_0_0_1.5px_var(--color-encre),0_1px_2px_rgb(var(--fx-ombre-teinte)/0.08)]'
          : '[box-shadow:inset_0_0_0_1px_var(--color-bord)] hover:[box-shadow:inset_0_0_0_1px_var(--color-bord-fort)]',
      )}
    >
      <button
        type="button"
        onClick={onOuvrir}
        aria-expanded={ouverte}
        className="block w-full p-3.5 text-start outline-none focus-visible:[box-shadow:inset_0_0_0_2px_var(--color-focus)]"
      >
        <span className="flex items-start justify-between gap-3">
          <span>
            <span className="flex items-baseline gap-1">
              <span className="chiffres text-[30px] font-bold leading-none text-encre">{it.minutes}</span>
              <span className="text-[14px] font-semibold text-encre-2">min</span>
            </span>
            <span className="mt-1.5 block text-[13px] text-encre-2">
              Arrivée à <span className="chiffres font-semibold text-encre">{it.arrivee}</span>
            </span>
          </span>
          {attente && (
            <span className="flex flex-col items-end gap-1">
              <Afficheur passages={[attente]} max={1} size="sm" />
              <span className="text-[11px] font-medium text-encre-3">prochain départ</span>
            </span>
          )}
        </span>
        <Sequence segments={it.segments} />
      </button>
      {ouverte && (
        <div className="border-t border-joint px-3.5 pb-4 pt-4">
          {it.segments.map((s, i) => (s.type === 'marche' ? <Marche key={i} s={s} /> : <Troncon key={i} s={s} />))}
        </div>
      )}
    </li>
  );
}

function Sequence({ segments }: { segments: Segment[] }) {
  return (
    <span className="mt-3 flex flex-wrap items-center gap-1">
      {segments.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <RiArrowRightSLine aria-hidden className="size-3.5 text-encre-3" />}
          {s.type === 'marche' ? (
            <span className="inline-flex h-6 items-center gap-0.5 rounded-[6px] bg-encart px-1.5 text-[12px] font-semibold text-encre-2">
              <RiWalkLine aria-hidden className="size-3.5" />
              <span className="chiffres">{s.minutes}</span>
              <span className="sr-only"> minutes à pied</span>
            </span>
          ) : (
            <LineBadgeChip {...s.ligne} size="sm" />
          )}
        </Fragment>
      ))}
    </span>
  );
}

function Marche({ s }: { s: Extract<Segment, { type: 'marche' }> }) {
  return (
    <p className="flex items-center gap-2 py-2 pl-[3px] text-[13px] text-encre-2">
      <RiWalkLine aria-hidden className="size-[18px] text-icone-2" />
      <span>
        <span className="font-semibold text-encre">{s.minutes} min à pied</span>
        {s.metres ? `, ${s.metres} m` : null}
        {s.consigne ? `. ${s.consigne}` : null}
      </span>
    </p>
  );
}

function Troncon({ s }: { s: Extract<Segment, { type: 'ligne' }> }) {
  const { color } = resolveLine(s.ligne);
  const n = s.arrets.length + 1;
  return (
    <PlanDeLigne
      couleur={color}
      className="py-1"
      arrets={[
        {
          nom: s.de,
          role: 'depart',
          detail: (
            <div className="space-y-2.5 pb-1">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-encre-2">
                <LineBadgeChip {...s.ligne} size="xs" />
                <span className="font-semibold text-encre">{lineName(s.ligne.shortName)}</span>
                direction
                <span className="signaletique font-semibold text-encre">{s.direction}</span>
              </p>
              <p className="flex items-center gap-2 text-[12px] text-encre-3">
                {s.attente && <Afficheur passages={[s.attente]} max={1} size="sm" />}
                <span>{n} {n > 1 ? 'arrêts' : 'arrêt'}, {s.minutes} min</span>
              </p>
              {s.voiture && <VoitureConseillee position={s.voiture} raison={s.raisonVoiture} />}
            </div>
          ),
        },
        ...s.arrets.map((nom) => ({ nom })),
        { nom: s.a, role: 'arrivee' as const },
      ]}
    />
  );
}
