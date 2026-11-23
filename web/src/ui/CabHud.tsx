import NumberFlow from '@number-flow/react';
import {
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiEyeLine,
  RiLogoutBoxRLine,
  RiPauseLine,
  RiPlayLine,
  RiRefreshLine,
  RiVolumeMuteLine,
  RiVolumeUpLine,
} from '@remixicon/react';
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
import { useIsDesktop } from './useMediaQuery';

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
  /** Effort lissé de -1 (freinage) à +1 (traction) */
  effort?: number;
  arrets?: string[];
  index?: number;
  progression?: number;
  vue: 'quai' | 'cabine' | 'passager';
  onVue: (v: 'quai' | 'cabine' | 'passager') => void;
  materiel: string;
  onMateriel?: () => void;
  allure: string;
  onAllure?: () => void;
  pause: boolean;
  onPause: () => void;
  son?: boolean;
  onSon?: () => void;
  direct: boolean;
  onDirect: () => void;
  onQuitter: () => void;
  /** Point de vue contextuel (ligne 6 vers Bir-Hakeim : la tour Eiffel). Absent hors tronçon. */
  pointDeVue?: { label: string; onClick: () => void } | null;
  className?: string;
}

export function CabHud(p: CabHudProps) {
  const { color } = resolveLine(p.ligne);
  const desktop = useIsDesktop();

  if (!desktop) {
    return (
      <div className={cx('dark pointer-events-none absolute inset-0 text-encre', p.className)}>
        {/* Zone haute mobile : quitter (×), plaque émail tappable, pastille de ligne & parcours */}
        <div className="pointer-events-auto absolute inset-x-3 top-[max(12px,env(safe-area-inset-top))] flex items-center gap-2">
          <Button
            data-ride-exit
            size="sm"
            variant="secondaire"
            aria-label="Revenir à la carte"
            icon={<RiArrowLeftSLine aria-hidden />}
            onClick={p.onQuitter}
            className="min-h-[40px] shrink-0"
          >
            Carte
          </Button>

          <div className="relative flex min-w-0 flex-1 justify-center">
            <Plaque as="p" size="sm" className="!inline-flex max-w-full items-center gap-1 whitespace-nowrap px-3 py-1.5 text-[15px] leading-[20px] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]">
              <span className="truncate">{p.station}</span>
              {p.stations && p.stations.length > 1 && p.onSelectStation && (
                <RiArrowDownSLine aria-hidden className="size-4 shrink-0 opacity-80" />
              )}
            </Plaque>
            {p.stations && p.stations.length > 1 && p.onSelectStation && (
              <select
                aria-label="Choisir une station"
                value={p.station}
                onChange={(e) => p.onSelectStation?.(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {p.stations.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          <label className="pl-hud relative flex h-11 shrink-0 cursor-pointer items-center gap-1.5 !rounded-pill !px-2.5 !py-0">
            <span className="sr-only">Ligne et parcours</span>
            <LineBadgeChip {...p.ligne} size="sm" />
            <RiArrowDownSLine aria-hidden className="size-4 text-icone-2" />
            <select
              data-ride-route
              value={p.route}
              onChange={(e) => p.onRoute(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {p.routes.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Zone basse mobile : HUD unifié (état de marche + afficheur vitesse + ruban + contrôles) */}
        <Panneau
          matiere="verre"
          className="pointer-events-auto absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] p-3"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-encre-3">
                {p.aQuai ? 'À quai' : p.voie}
              </p>
              <p className="signaletique truncate text-[19px] font-[650] leading-[23px] text-white">
                {p.prochaine}
              </p>
              <p className="truncate text-[12px] text-encre-2">
                → <span className="signaletique font-semibold text-encre">{p.direction}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="afficheur chiffres flex h-10 shrink-0 items-baseline gap-1 px-2.5 pt-[7px] font-bold">
                <NumberFlow value={Math.round(p.vitesse)} className="text-[22px] leading-none" />
                <span className="signaletique text-[10px] font-semibold">km/h</span>
              </span>
              <EffortBar effort={p.effort ?? 0} />
            </div>
          </div>

          {p.arrets && p.arrets.length > 1 && (
            <PlanDeLigneHorizontal
              couleur={color}
              arrets={p.arrets}
              index={p.index ?? 0}
              progression={p.progression}
              onSelectStop={p.onSelectStation}
              className="mt-2.5"
            />
          )}

          {(p.pointDeVue || p.routes.length > 0) && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {p.pointDeVue ? (
                <Button
                  data-ride-eiffel
                  variant="secondaire"
                  size="sm"
                  icon={<RiEyeLine aria-hidden />}
                  onClick={p.pointDeVue.onClick}
                >
                  {p.pointDeVue.label}
                </Button>
              ) : (
                <span />
              )}
              <InterrupteurDirect data-ride-live direct={p.direct} onChange={() => p.onDirect()} source="PRIM" />
            </div>
          )}

          <div className="mt-2.5 space-y-2 border-t border-joint pt-2.5">
            <div data-ride-view className="w-full">
              <Segmented
                size="sm"
                label="Point de vue"
                value={p.vue}
                onChange={p.onVue}
                options={[
                  { value: 'quai', label: 'Quai' },
                  { value: 'cabine', label: 'Cabine' },
                  { value: 'passager', label: 'Passager' },
                ]}
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  data-ride-stock
                  variant="secondaire"
                  size="sm"
                  aria-label={`Matériel roulant : ${p.materiel}. Changer`}
                  iconEnd={<RiArrowDownSLine aria-hidden className="size-3.5 text-encre-2" />}
                  onClick={p.onMateriel}
                  className="chiffres min-h-[40px] px-2.5"
                >
                  {p.materiel}
                </Button>
                <Button
                  data-ride-speed
                  variant="secondaire"
                  size="sm"
                  aria-label={`Vitesse de simulation : ${p.allure}`}
                  iconEnd={<RiRefreshLine aria-hidden className="size-3.5 text-encre-2" />}
                  onClick={p.onAllure}
                  className="chiffres min-h-[40px] px-2.5"
                >
                  {p.allure}
                </Button>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.onSon && (
                  <IconButton
                    data-ride-audio
                    variant="secondaire"
                    size="sm"
                    label={p.son ? 'Couper le son' : 'Activer le son moteur'}
                    icon={p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
                    onClick={p.onSon}
                    className="min-h-[40px] min-w-[40px]"
                  />
                )}
                <IconButton
                  data-ride-pause
                  variant="secondaire"
                  size="sm"
                  label={p.pause ? 'Reprendre' : 'Mettre en pause'}
                  icon={p.pause ? <RiPlayLine aria-hidden /> : <RiPauseLine aria-hidden />}
                  onClick={p.onPause}
                  className="min-h-[40px] min-w-[40px]"
                />
              </div>
            </div>
          </div>
        </Panneau>
      </div>
    );
  }

  return (
    <div className={cx('dark pointer-events-none absolute inset-0 text-encre', p.className)}>
      <div className="absolute left-4 top-4 max-w-[46%]">
        <div className="relative inline-flex max-w-full items-center">
          <Plaque as="p" size="lg" className="pointer-events-auto !inline-flex items-center gap-1.5 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]">
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
          Carte
        </Button>
      </Panneau>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
        <Panneau matiere="verre" className="pointer-events-auto w-[372px] max-w-full p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-encre-3">{p.aQuai ? 'À quai' : p.voie}</p>
              <p className="signaletique truncate text-[22px] font-[650] leading-[26px] text-white">{p.prochaine}</p>
              <p className="mt-0.5 truncate text-[13px] text-encre-2">
                → <span className="signaletique font-semibold text-encre">{p.direction}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="afficheur chiffres flex h-11 shrink-0 items-baseline gap-1 px-2.5 pt-[9px] font-bold">
                <NumberFlow value={Math.round(p.vitesse)} className="text-[26px] leading-none" />
                <span className="signaletique text-[11px] font-semibold">km/h</span>
              </span>
              <EffortBar effort={p.effort ?? 0} />
            </div>
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

        <Panneau matiere="verre" className="pointer-events-auto flex h-14 shrink-0 items-center gap-1.5 px-2">
          <div data-ride-view>
            <Segmented
              size="sm"
              label="Point de vue"
              value={p.vue}
              onChange={p.onVue}
              options={[
                { value: 'quai', label: 'Quai' },
                { value: 'cabine', label: 'Cabine' },
                { value: 'passager', label: 'Passager' },
              ]}
              className="w-[272px]"
            />
          </div>
          <span aria-hidden className="mx-0.5 h-6 w-px bg-joint" />
          <Button data-ride-stock variant="secondaire" size="sm" aria-label={`Matériel roulant : ${p.materiel}. Changer`} iconEnd={<RiArrowDownSLine aria-hidden className="size-3.5 text-encre-2" />} onClick={p.onMateriel} className="chiffres">
            {p.materiel}
          </Button>
          <Button data-ride-speed variant="secondaire" size="sm" aria-label={`Vitesse de simulation : ${p.allure}`} iconEnd={<RiRefreshLine aria-hidden className="size-3.5 text-encre-2" />} onClick={p.onAllure} className="chiffres">
            {p.allure}
          </Button>
          {p.onSon && (
            <IconButton
              data-ride-audio
              variant="secondaire"
              size="sm"
              label={p.son ? 'Couper le son' : 'Activer le son moteur'}
              icon={p.son ? <RiVolumeUpLine aria-hidden /> : <RiVolumeMuteLine aria-hidden />}
              onClick={p.onSon}
            />
          )}
          <IconButton
            data-ride-pause
            variant="secondaire"
            size="sm"
            label={p.pause ? 'Reprendre' : 'Mettre en pause'}
            icon={p.pause ? <RiPlayLine aria-hidden /> : <RiPauseLine aria-hidden />}
            onClick={p.onPause}
          />
        </Panneau>
      </div>
    </div>
  );
}

function EffortBar({ effort }: { effort: number }) {
  const clamped = Math.max(-1, Math.min(1, effort));
  const pct = Math.round(Math.abs(clamped) * 50);
  const braking = clamped < -0.06;
  const accelerating = clamped > 0.06;
  return (
    <div
      aria-hidden
      title={braking ? 'Freinage' : accelerating ? 'Traction' : 'Marche sur l’erre'}
      className="relative h-[4px] w-[72px] overflow-hidden rounded-full bg-white/12"
    >
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
      {braking && (
        <span
          className="absolute inset-y-0 right-1/2 w-1/2 origin-right rounded-l-full bg-signal-500 transition-transform duration-150"
          style={{ transform: `scaleX(${Math.abs(clamped)})` }}
        />
      )}
      {accelerating && (
        <span
          className="absolute inset-y-0 left-1/2 w-1/2 origin-left rounded-r-full bg-normal-500 transition-transform duration-150"
          style={{ transform: `scaleX(${Math.abs(clamped)})` }}
        />
      )}
    </div>
  );
}
