import { RiArrowDownSLine, RiEyeLine, RiLogoutBoxRLine, RiPauseLine, RiPlayLine } from '@remixicon/react';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { InterrupteurDirect } from './InterrupteurDirect';
import { Kbd } from './Kbd';
import { LineBadgeChip } from './LineBadgeChip';
import { resolveLine, type LineRef } from './lines';
import { Panneau } from './Panneau';
import { PlanDeLigneHorizontal } from './PlanDeLigne';
import { Plaque } from './Plaque';
import { Segmented } from './Segmented';

/**
 * HUD of the Quai 3D / Cabine view. Always dark glass over the scene,
 * whatever the app theme: the `.dark` island re-resolves every token.
 * Keeps every v1 hook: [data-ride-route], [data-ride-exit], [data-ride-live],
 * [data-ride-view], [data-ride-stock], [data-ride-speed], [data-ride-pause], [data-ride-eiffel].
 */
export interface CabHudProps {
  ligne: LineRef;
  routes: { value: string; label: string }[];
  route: string;
  onRoute: (value: string) => void;
  /** Name on the plate: the station you are at, or the next one */
  station: string;
  stations?: string[];
  onSelectStation?: (stationName: string) => void;
  aQuai: boolean;
  prochaine: string;
  direction: string;
  /** "En tunnel", "Station souterraine", "Viaduc" */
  voie: string;
  vitesse: number;
  arrets?: string[];
  index?: number;
  progression?: number;
  vue: 'quai' | 'cabine';
  onVue: (v: 'quai' | 'cabine') => void;
  materiel: string;
  onMateriel?: () => void;
  allure: string;
  onAllure?: () => void;
  pause: boolean;
  onPause: () => void;
  direct: boolean;
  onDirect: () => void;
  onQuitter: () => void;
  /** Point de vue contextuel (ligne 6 vers Bir-Hakeim : la tour Eiffel). Absent hors tronçon. */
  pointDeVue?: { label: string; onClick: () => void } | null;
  className?: string;
}

export function CabHud(p: CabHudProps) {
  const { color } = resolveLine(p.ligne);
  return (
    <div className={cx('dark pointer-events-none absolute inset-0 text-encre', p.className)}>
      <div className="absolute left-4 top-4 max-w-[46%]">
        <div className="relative inline-flex max-w-full items-center">
          <Plaque as="p" size="lg" className="pointer-events-auto flex items-center gap-1.5 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]">
            <span className="truncate">{p.station}</span>
            {p.stations && p.stations.length > 1 && p.onSelectStation && (
              <RiArrowDownSLine aria-hidden className="size-4 shrink-0 opacity-75" />
            )}
          </Plaque>
          {p.stations && p.stations.length > 1 && p.onSelectStation && (
            <select
              aria-label="Choisir une station"
              value={p.station}
              onChange={(e) => p.onSelectStation?.(e.target.value)}
              className="pointer-events-auto absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {p.stations.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <Panneau matiere="verre" className="absolute right-4 top-4 flex h-14 items-center gap-2 pl-3 pr-2">
        <LineBadgeChip {...p.ligne} size="sm" />
        <label className="relative flex items-center">
          <span className="sr-only">Ligne et parcours</span>
          <select
            data-ride-route
            value={p.route}
            onChange={(e) => p.onRoute(e.target.value)}
            className="h-10 max-w-[360px] cursor-pointer appearance-none truncate rounded-controle bg-transparent pl-2 pr-8 text-[14px] font-semibold text-encre outline-none hover:bg-encart focus-visible:outline-2 focus-visible:outline-focus"
          >
            {p.routes.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <RiArrowDownSLine aria-hidden className="pointer-events-none absolute right-2 size-4 text-icone-2" />
        </label>
        <span aria-hidden className="h-6 w-px bg-joint" />
        <Button data-ride-exit variant="discret" icon={<RiLogoutBoxRLine aria-hidden />} iconEnd={<Kbd className="ml-0.5">Esc</Kbd>} onClick={p.onQuitter}>
          Revenir à la carte
        </Button>
      </Panneau>

      <Panneau matiere="verre" className="absolute bottom-4 left-4 w-[400px] max-w-[calc(100%-2rem)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-encre-3">{p.aQuai ? 'À quai, prochaine station' : 'Prochaine station'}</p>
            <p className="signaletique truncate text-[24px] font-[650] leading-[28px] text-white">{p.prochaine}</p>
            <p className="mt-0.5 truncate text-[13px] text-encre-2">
              Direction <span className="signaletique font-semibold text-encre">{p.direction}</span>
            </p>
          </div>
          <span className="afficheur chiffres flex h-11 shrink-0 items-baseline gap-1 px-2.5 pt-[9px] font-bold">
            <span className="text-[26px] leading-none">{Math.round(p.vitesse)}</span>
            <span className="signaletique text-[11px] font-semibold">km/h</span>
          </span>
        </div>
        {p.arrets && p.arrets.length > 1 && (
          <PlanDeLigneHorizontal
            couleur={color}
            arrets={p.arrets}
            index={p.index ?? 0}
            progression={p.progression}
            onSelectStop={p.onSelectStation}
            className="mt-3.5"
          />
        )}
        {p.pointDeVue && (
          <Button data-ride-eiffel variant="secondaire" size="sm" icon={<RiEyeLine aria-hidden />} onClick={p.pointDeVue.onClick} className="mt-3">
            {p.pointDeVue.label}
          </Button>
        )}
        <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-encre-2">
          <span className="min-w-0 truncate">{p.voie}</span>
          <InterrupteurDirect data-ride-live direct={p.direct} onChange={() => p.onDirect()} source="PRIM" className="pointer-events-auto" />
        </div>
      </Panneau>

      <Panneau matiere="verre" className="absolute bottom-4 right-4 flex h-14 items-center gap-1.5 px-2">
        <div data-ride-view>
          <Segmented
            size="sm"
            label="Point de vue"
            value={p.vue}
            onChange={p.onVue}
            options={[
              { value: 'quai', label: 'Quai' },
              { value: 'cabine', label: 'Cabine' },
            ]}
            className="w-[168px]"
          />
        </div>
        <Button data-ride-stock variant="discret" size="sm" aria-label={`Matériel roulant : ${p.materiel}. Changer`} onClick={p.onMateriel} className="chiffres">
          {p.materiel}
        </Button>
        <Button data-ride-speed variant="discret" size="sm" aria-label={`Vitesse de simulation : ${p.allure}`} onClick={p.onAllure} className="chiffres">
          {p.allure}
        </Button>
        <IconButton
          data-ride-pause
          size="sm"
          label={p.pause ? 'Reprendre' : 'Mettre en pause'}
          icon={p.pause ? <RiPlayLine aria-hidden /> : <RiPauseLine aria-hidden />}
          onClick={p.onPause}
        />
      </Panneau>
    </div>
  );
}
