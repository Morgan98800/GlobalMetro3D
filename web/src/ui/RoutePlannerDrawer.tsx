import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiArrowUpDownLine,
  RiBox3Line,
  RiBriefcase4Line,
  RiCloseCircleFill,
  RiCloseLine,
  RiFocus3Line,
  RiForbidLine,
  RiHome5Line,
  RiShareForwardLine,
  RiStarFill,
  RiWalkLine,
  RiWheelchairLine,
} from '@remixicon/react';
import { Fragment, useId, useState } from 'react';
import { motion } from 'motion/react';
import { Afficheur, type Passage } from './Afficheur';
import { BottomSheet, type DetentSheet } from './BottomSheet';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { LineBadgeChip } from './LineBadgeChip';
import { lineName, resolveLine, type LineRef } from './lines';
import { Panneau } from './Panneau';
import { PlanDeLigne } from './PlanDeLigne';
import { VoitureConseillee, type PositionRame } from './VoitureConseillee';
import { useIsDesktop } from './useMediaQuery';

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
  departPlaceholder?: string;
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
  onVoirEn3D?: (segment: Extract<Segment, { type: 'ligne' }>) => void;
  accessibleOnly?: boolean;
  onToggleAccessible?: () => void;
  avoidLineIds?: string[];
  availableLines?: LineRef[];
  onToggleAvoidLine?: (shortName: string) => void;
  onClearAvoidLines?: () => void;
  onClose: () => void;
  presentation?: 'cote' | 'basse';
  className?: string;
}

export function RoutePlannerDrawer(props: RoutePlannerDrawerProps) {
  const desktop = useIsDesktop();
  const basse = (props.presentation ?? (desktop ? 'cote' : 'basse')) === 'basse';
  const [cran, setCran] = useState<DetentSheet>('haut');
  const [autresOuverts, setAutresOuverts] = useState(false);
  const [avoidOpen, setAvoidOpen] = useState(false);
  const avoidCount = props.avoidLineIds?.length ?? 0;
  const avoidedSet = new Set((props.avoidLineIds ?? []).map((id) => id.trim().toUpperCase()));
  const hasActiveFilters = Boolean(props.accessibleOnly) || avoidCount > 0;
  const routeKey = `${props.depart}|${props.arrivee}|${props.itineraires.length}`;
  const [prevRouteKey, setPrevRouteKey] = useState(routeKey);
  if (prevRouteKey !== routeKey) {
    setPrevRouteKey(routeKey);
    setAutresOuverts(false);
  }
  const sel = props.selection ?? 0;
  const pad = basse ? 'px-4' : 'px-5';

  const autres = props.itineraires.filter((_, i) => i !== sel);
  const actif = props.itineraires[sel];

  const body = (
    <>
      <div className={cx('flex items-center justify-between', pad, basse ? 'pt-1' : 'pt-5')}>
        <h2 id="itineraire-titre" className="text-titre text-encre">
          Itinéraire
        </h2>
        <IconButton
          size="sm"
          variant="secondaire"
          label="Fermer l’itinéraire"
          icon={<RiCloseLine aria-hidden />}
          onClick={props.onClose}
        />
      </div>

      <div className={cx('pt-2.5', pad)}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="relative space-y-1.5">
            <span
              aria-hidden
              className="pointer-events-none absolute left-[18px] top-[31px] bottom-[31px] w-0 border-l-2 border-dashed border-encre-3/45"
            />
            <Champ
              lettre="A"
              label="Départ"
              placeholder={props.departPlaceholder || 'Ma position'}
              value={props.depart}
              onChange={props.onDepart}
              onMaPosition={props.onMaPosition}
            />
            <Champ
              lettre="B"
              label="Arrivée"
              placeholder="Où allez-vous ?"
              value={props.arrivee}
              onChange={props.onArrivee}
            />
          </div>
          <IconButton
            size="sm"
            variant="secondaire"
            label="Inverser départ et arrivée"
            icon={<RiArrowUpDownLine aria-hidden />}
            onClick={props.onInverser}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="secondaire"
            icon={<RiHome5Line aria-hidden />}
            onClick={() => props.onRaccourci('domicile')}
          >
            Domicile
          </Button>
          <Button
            size="sm"
            variant="secondaire"
            icon={<RiBriefcase4Line aria-hidden />}
            onClick={() => props.onRaccourci('travail')}
          >
            Travail
          </Button>
          {props.favoris?.slice(0, 4).map((f) => (
            <Button
              key={f.nom}
              size="sm"
              variant="secondaire"
              icon={<RiStarFill aria-hidden />}
              onClick={f.onClick}
              className="signaletique"
            >
              {f.nom}
            </Button>
          ))}
        </div>
        {(props.onToggleAccessible || props.onToggleAvoidLine) && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {props.onToggleAccessible && (
                <button
                  type="button"
                  data-route-filter-pmr
                  aria-pressed={Boolean(props.accessibleOnly)}
                  onClick={props.onToggleAccessible}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    basse ? 'min-h-[44px]' : 'min-h-[32px]',
                    props.accessibleOnly
                      ? 'border-focus bg-encart text-encre ring-1 ring-focus'
                      : 'border-bord bg-surface text-encre-2 hover:bg-encart hover:text-encre'
                  )}
                >
                  <RiWheelchairLine aria-hidden className="size-3.5 shrink-0" />
                  <span>Accessible PMR</span>
                </button>
              )}
              {props.onToggleAvoidLine && (
                <button
                  type="button"
                  data-route-filter-avoid
                  aria-expanded={avoidOpen}
                  onClick={() => setAvoidOpen((v) => !v)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    basse ? 'min-h-[44px]' : 'min-h-[32px]',
                    avoidCount > 0 || avoidOpen
                      ? 'border-focus bg-encart text-encre ring-1 ring-focus'
                      : 'border-bord bg-surface text-encre-2 hover:bg-encart hover:text-encre'
                  )}
                >
                  <RiForbidLine aria-hidden className="size-3.5 shrink-0" />
                  <span>{avoidCount > 0 ? `Éviter (${avoidCount})` : 'Éviter une ligne'}</span>
                  <RiArrowDownSLine
                    aria-hidden
                    className={cx(
                      'size-3.5 shrink-0 transition-transform duration-150',
                      avoidOpen && 'rotate-180'
                    )}
                  />
                </button>
              )}
              {avoidCount > 0 && props.onClearAvoidLines && (
                <button
                  type="button"
                  onClick={props.onClearAvoidLines}
                  className={cx(
                    'inline-flex items-center rounded-full px-2.5 text-[12px] font-medium text-encre-2 transition-[background-color,color] duration-150 hover:bg-encart hover:text-encre focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    basse ? 'min-h-[44px]' : 'min-h-[32px]'
                  )}
                >
                  Réinitialiser
                </button>
              )}
            </div>
            {avoidOpen && props.availableLines && props.availableLines.length > 0 && (
              <div
                role="group"
                aria-label="Lignes à éviter"
                className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto overscroll-contain rounded-[12px] border border-bord/80 bg-encart/60 p-2"
              >
                {props.availableLines.map((line) => {
                  const isAvoided = avoidedSet.has(line.shortName.trim().toUpperCase());
                  return (
                    <button
                      key={line.shortName}
                      type="button"
                      aria-pressed={isAvoided}
                      aria-label={`${isAvoided ? 'Ne plus éviter' : 'Éviter'} ${lineName(line.shortName)}`}
                      onClick={() => props.onToggleAvoidLine?.(line.shortName)}
                      className={cx(
                        'relative inline-flex items-center justify-center rounded-[10px] border p-1 transition-[border-color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:scale-95',
                        basse ? 'min-h-[44px] min-w-[44px]' : 'min-h-[34px] min-w-[34px]',
                        isAvoided
                          ? 'border-signal bg-surface ring-1 ring-signal/50'
                          : 'border-transparent bg-surface/80 hover:border-bord hover:bg-surface'
                      )}
                    >
                      <LineBadgeChip {...line} size="sm" dimmed={isAvoided} />
                      {isAvoided && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-1.5 top-1/2 h-[2px] -translate-y-1/2 -rotate-45 rounded-full bg-signal"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className={cx(
          'pl-scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pt-3',
          pad
        )}
      >
        {props.itineraires.length === 0 && hasActiveFilters && props.depart && props.arrivee ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-bord/80 bg-encart/55 px-4 py-6 text-center">
            <p className="text-[13px] font-medium text-encre-2">
              Aucun itinéraire trouvé avec vos filtres actifs.
            </p>
            <Button
              size="sm"
              variant="secondaire"
              className={basse ? 'min-h-[44px]' : undefined}
              onClick={() => {
                if (props.accessibleOnly) props.onToggleAccessible?.();
                props.onClearAvoidLines?.();
              }}
            >
              Réinitialiser les filtres
            </Button>
          </div>
        ) : basse && actif ? (
          <div className="space-y-2">
            <ul className="space-y-2">
              <CarteItineraire
                it={actif}
                ouverte
                onOuvrir={() => props.onSelection?.(sel)}
                onVoirEn3D={props.onVoirEn3D}
              />
            </ul>
            {autres.length > 0 && (
              <div className="rounded-[12px] border border-bord bg-encart/55">
                <button
                  type="button"
                  aria-expanded={autresOuverts}
                  onClick={() => setAutresOuverts((v) => !v)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-start text-[13px] font-semibold text-encre transition-colors hover:bg-encart"
                >
                  <span>
                    {autresOuverts
                      ? 'Masquer'
                      : `${autres.length} autre${autres.length > 1 ? 's' : ''} · dès ${Math.min(...autres.map((a) => a.minutes))} min`}
                  </span>
                  <RiArrowDownSLine
                    aria-hidden
                    className={cx(
                      'size-4 text-icone-2 transition-transform',
                      autresOuverts && 'rotate-180'
                    )}
                  />
                </button>
                {autresOuverts && (
                  <ul className="space-y-2 border-t border-joint p-2">
                    {props.itineraires.map((it, i) =>
                      i === sel ? null : (
                        <CarteItineraire
                          key={`${it.arrivee}-${it.minutes}-${it.segments.length}`}
                          it={it}
                          ouverte={false}
                          onOuvrir={() => {
                            props.onSelection?.(i);
                            setAutresOuverts(false);
                          }}
                          onVoirEn3D={props.onVoirEn3D}
                        />
                      )
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {props.itineraires.map((it, i) => (
              <CarteItineraire
                key={`${it.arrivee}-${it.minutes}-${it.segments.length}-${i}`}
                it={it}
                ouverte={i === sel}
                delay={Math.min(i * 0.035, 0.14)}
                onOuvrir={() => props.onSelection?.(i)}
                onVoirEn3D={props.onVoirEn3D}
              />
            ))}
          </ul>
        )}
      </div>

      {props.itineraires.length > 0 && (
        <footer
          className={cx(
            'flex shrink-0 items-center justify-end gap-2 border-t border-joint bg-surface pt-2.5',
            pad,
            basse ? 'pb-[max(14px,env(safe-area-inset-bottom))]' : 'pb-4 pt-3'
          )}
        >
          <Button
            variant="secondaire"
            size="sm"
            className={basse ? 'min-h-[44px]' : undefined}
            icon={<RiShareForwardLine aria-hidden />}
            onClick={props.onPartager}
          >
            Partager
          </Button>
        </footer>
      )}
    </>
  );

  if (basse) {
    return (
      <BottomSheet
        cran={cran}
        onCran={setCran}
        onDismiss={props.onClose}
        onSwipeBack={props.onClose}
        ariaLabel="Calculateur d’itinéraire"
        className={props.className}
      >
        {body}
      </BottomSheet>
    );
  }

  return (
    <Panneau
      matiere="feuille"
      as="section"
      role="dialog"
      aria-labelledby="itineraire-titre"
      className={cx(
        'flex max-h-full min-h-0 flex-col overflow-hidden animate-feuille',
        props.className
      )}
    >
      {body}
    </Panneau>
  );
}

function Champ({
  lettre,
  label,
  placeholder,
  value,
  onChange,
  onMaPosition,
}: {
  lettre: 'A' | 'B';
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onMaPosition?: () => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-[46px] items-center gap-3 rounded-[12px] border border-bord/80 bg-encart/75 pl-3 pr-2 transition-[background-color,box-shadow,border-color] duration-150 focus-within:border-transparent focus-within:bg-surface focus-within:[box-shadow:inset_0_0_0_2px_var(--color-focus)]">
      <span
        aria-hidden
        className={cx(
          'size-[13px] shrink-0',
          lettre === 'A'
            ? 'rounded-full border-[3px] border-encre-2 bg-surface'
            : 'rounded-[3px] bg-action'
        )}
      />
      <label htmlFor={id} className="sr-only">
        {label} ({lettre})
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint={lettre === 'A' ? 'next' : 'search'}
        className="pl-saisie min-w-0 flex-1 text-[16px] max-md:min-h-[44px] !outline-none !ring-0 !shadow-none"
      />
      {!value && onMaPosition && (
        <IconButton
          size="sm"
          label="Partir de ma position"
          icon={<RiFocus3Line aria-hidden />}
          onClick={onMaPosition}
          className="shrink-0"
        />
      )}
      {value && (
        <IconButton
          size="sm"
          label={`Effacer ${label.toLowerCase()}`}
          icon={<RiCloseCircleFill aria-hidden />}
          onClick={() => onChange('')}
        />
      )}
    </div>
  );
}

function CarteItineraire({
  it,
  ouverte,
  delay = 0,
  onOuvrir,
  onVoirEn3D,
}: {
  it: Itineraire;
  ouverte: boolean;
  delay?: number;
  onOuvrir: () => void;
  onVoirEn3D?: (segment: Extract<Segment, { type: 'ligne' }>) => void;
}) {
  const premier = it.segments.find((s) => s.type === 'ligne');
  const attente = premier && premier.type === 'ligne' ? premier.attente : undefined;
  return (
    <motion.li
      className="list-none"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <button type="button" onClick={onOuvrir} aria-expanded={ouverte} className="pl-carte-trajet">
        <span className="flex items-start justify-between gap-3">
          <span>
            <span className="flex items-baseline gap-1">
              <span className="pl-duree text-encre">{it.minutes}</span>
              <span className="text-[14px] font-semibold text-encre-2">min</span>
            </span>
            <span className="mt-1.5 block text-[13px] text-encre-2">
              Arrivée à <span className="chiffres font-semibold text-encre">{it.arrivee}</span>
            </span>
          </span>
          {attente && <Afficheur passages={[attente]} max={1} size="sm" />}
        </span>
        <Sequence segments={it.segments} />
      </button>
      {ouverte && (
        <div className="border-t border-joint px-3.5 pb-4 pt-4">
          {it.segments.map((s) => {
            const segKey =
              s.type === 'marche'
                ? `walk-${s.minutes}-${s.metres ?? 0}-${s.consigne ?? ''}`
                : `ride-${s.ligne.shortName}-${s.de}-${s.a}`;
            return s.type === 'marche' ? (
              <Marche key={segKey} s={s} />
            ) : (
              <Troncon key={segKey} s={s} onVoirEn3D={onVoirEn3D} />
            );
          })}
        </div>
      )}
    </motion.li>
  );
}

function Sequence({ segments }: { segments: Segment[] }) {
  return (
    <span className="mt-3 flex flex-wrap items-center gap-1">
      {segments.map((s, i) => {
        const segKey =
          s.type === 'marche'
            ? `seq-walk-${s.minutes}-${s.metres ?? 0}-${s.consigne ?? ''}`
            : `seq-ride-${s.ligne.shortName}-${s.de}-${s.a}`;
        return (
          <Fragment key={segKey}>
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
        );
      })}
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

function Troncon({
  s,
  onVoirEn3D,
}: {
  s: Extract<Segment, { type: 'ligne' }>;
  onVoirEn3D?: (segment: Extract<Segment, { type: 'ligne' }>) => void;
}) {
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
                <span>
                  {n} {n > 1 ? 'arrêts' : 'arrêt'}, {s.minutes} min
                </span>
              </p>
              {s.voiture && <VoitureConseillee position={s.voiture} raison={s.raisonVoiture} />}
              {onVoirEn3D && (
                <Button
                  size="sm"
                  variant="afficheur"
                  icon={<RiBox3Line aria-hidden />}
                  onClick={() => onVoirEn3D(s)}
                >
                  Aperçu 3D
                </Button>
              )}
            </div>
          ),
        },
        ...s.arrets.map((nom) => ({ nom })),
        { nom: s.a, role: 'arrivee' as const },
      ]}
    />
  );
}
