import { RiBox3Line, RiBuilding2Line, RiCrosshair2Line, RiTrainLine } from '@remixicon/react';
import { IconButton } from '@/components/base/buttons/icon-button';
import { Divider } from '@/components/base/divider/divider';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { useUiStore, type EdinburghPreset } from './ui_store';

const EDINBURGH_PRESETS: { id: EdinburghPreset; label: string; badge: string }[] = [
  { id: 'waverley', label: 'Vallée de Waverley', badge: 'W' },
  { id: 'castle', label: 'Castle Rock & Princes St', badge: 'C' },
  { id: 'calton', label: 'Calton Hill', badge: 'H' },
  { id: 'scotland', label: 'Panorama Écosse', badge: 'S' },
  { id: 'overview', label: "Vue d'ensemble", badge: 'V' },
];

export function MapControls() {
  const {
    cityConfig,
    lines,
    activeLineId,
    trackedTrain,
    pitch3D,
    buildingsVisible,
    recenterVisible,
    recenterLabel,
    expertMode,
    handlers,
  } = useUiStore();

  const isParis = cityConfig?.id === 'paris';
  const isEdinburgh = cityConfig?.id === 'edinburgh';

  const handleOpenRide = () => {
    if (trackedTrain && trackedTrain.lineName?.trim()) {
      handlers.onOpenParisRide?.({
        initialLine: trackedTrain.lineName,
        initialDest: trackedTrain.dest,
        initialStation: trackedTrain.next,
        initialTrainId: trackedTrain.id,
      });
      return;
    }
    const selectedLine = activeLineId ? lines.find((l) => l.id === activeLineId) : null;
    handlers.onOpenParisRide?.({
      initialLine: selectedLine?.short_name?.trim() ? selectedLine.short_name : '6',
    });
  };

  return (
    <aside
      id="map-controls"
      aria-label="Contrôles de vue"
      className={cx(
        'fixed end-2.5 z-20 flex flex-col items-center gap-1.5 rounded-2xl border border-border-button-default bg-background-primary-default/85 p-1.5 shadow-md backdrop-blur-md md:top-auto md:end-4 md:bottom-4',
        expertMode ? 'top-[118px]' : 'top-[68px]'
      )}
    >
      {isEdinburgh ? (
        <>
          {EDINBURGH_PRESETS.map((preset) => (
            <TooltipTrigger key={preset.id} delay={150}>
              <button
                type="button"
                aria-label={preset.label}
                onClick={() => handlers.onEdinburghPreset?.(preset.id)}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border-button-default bg-background-primary-default text-caption-1-semibold text-text-primary shadow-xs transition-colors hover:bg-background-primary-hover outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                {preset.badge}
              </button>
              <Tooltip size="sm" placement="start">
                {preset.label}
              </Tooltip>
            </TooltipTrigger>
          ))}
          <TooltipTrigger delay={150}>
            <IconButton
              icon={RiTrainLine}
              size="small"
              aria-label="Suivre un train écossais (caméra 3D)"
              onClick={() => handlers.onEdinburghFollow?.()}
            />
            <Tooltip size="sm" placement="start">
              Suivre un train
            </Tooltip>
          </TooltipTrigger>
          <Divider className="my-0.5" />
        </>
      ) : null}

      <TooltipTrigger delay={150}>
        <IconButton
          icon={RiBox3Line}
          size="small"
          aria-label="Basculer entre la vue 3D et 2D"
          aria-pressed={pitch3D}
          className={cx(pitch3D && 'border-accent-500 bg-accent-500/12 text-accent-500')}
          onClick={() => handlers.onTogglePitch?.()}
        />
        <Tooltip size="sm" placement="start">
          Vue 3D / 2D
        </Tooltip>
      </TooltipTrigger>

      <TooltipTrigger delay={150}>
        <IconButton
          icon={RiBuilding2Line}
          size="small"
          aria-label="Afficher ou masquer les bâtiments 3D"
          aria-pressed={buildingsVisible}
          className={cx(buildingsVisible && 'border-accent-500 bg-accent-500/12 text-accent-500')}
          onClick={() => handlers.onToggleBuildings?.()}
        />
        <Tooltip size="sm" placement="start">
          Bâtiments 3D (B)
        </Tooltip>
      </TooltipTrigger>

      {isParis ? (
        <TooltipTrigger delay={150}>
          <IconButton
            icon={RiTrainLine}
            size="small"
            aria-label="Monter à bord d’une rame en 3D"
            onClick={handleOpenRide}
          />
          <Tooltip size="sm" placement="start">
            Cabine & Quai 3D
          </Tooltip>
        </TooltipTrigger>
      ) : null}

      {recenterVisible ? (
        <>
          <Divider className="my-0.5" />
          <TooltipTrigger delay={150}>
            <IconButton
              icon={RiCrosshair2Line}
              size="small"
              aria-label={recenterLabel}
              onClick={() => handlers.onRecenter?.()}
            />
            <Tooltip size="sm" placement="start">
              {recenterLabel}
            </Tooltip>
          </TooltipTrigger>
        </>
      ) : null}
    </aside>
  );
}
