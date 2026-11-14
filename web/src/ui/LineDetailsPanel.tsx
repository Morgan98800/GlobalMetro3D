import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RiAlertLine,
  RiBox3Line,
  RiDashboard3Line,
  RiPulseLine,
  RiRestartLine,
  RiSpeedUpLine,
  RiSubwayLine,
  RiTimerLine,
} from '@remixicon/react';
import { type Stat } from '@/components/application/dashboard/stat-cards';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { CloseButton } from '@/components/base/buttons/close-button';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Divider } from '@/components/base/divider/divider';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/base/segmented-control/segmented-control';
import { StationLadder } from '@core/ui/components/station_ladder';
import { cx } from '@/utils/cx';
import { LineBadgeChip } from './LineBadgeChip';
import { uiStore, useUiStore } from './ui_store';

function lineSortOrder(shortName: string): [number, number, string] {
  const match = shortName.match(/^(\d+)([a-zA-Z]*)$/);
  if (match) {
    return [0, Number(match[1]), match[2] || ''];
  }
  return [1, 0, shortName];
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')} min`;
  return `${Math.max(1, m)} min`;
}

export function LineDetailsPanel() {
  const {
    cityConfig,
    lines,
    stations,
    ladders,
    rollingStockDb,
    trafficByLine,
    trains,
    activeLineId,
    activeDir,
    expertMode,
    lineDrawerOpen,
    isFollowing,
    serviceStatus,
    handlers,
  } = useUiStore();

  const ladderRef = useRef<StationLadder | null>(null);
  const ladderHostRef = useRef<HTMLDivElement | null>(null);
  const ladderHostId = 'react-station-ladder-host';
  const [mobileExpanded, setMobileExpanded] = useState(true);

  const isVisible = (expertMode || lineDrawerOpen) && !isFollowing;

  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      const [ta, na, sa] = lineSortOrder(a.short_name);
      const [tb, nb, sb] = lineSortOrder(b.short_name);
      if (ta !== tb) return ta - tb;
      if (na !== nb) return na - nb;
      return sa.localeCompare(sb, 'fr');
    });
  }, [lines]);

  const activeLine = useMemo(
    () => (activeLineId ? (lines.find((line) => line.id === activeLineId) ?? null) : null),
    [lines, activeLineId]
  );

  const activeLadder = activeLine ? (ladders[activeLine.id] ?? null) : null;
  const stockInfo = activeLine
    ? (rollingStockDb?.lines?.[activeLine.short_name] ??
      rollingStockDb?.lines?.[activeLine.id] ??
      null)
    : null;
  const traffic = activeLine ? (trafficByLine[activeLine.id] ?? null) : null;

  const dirLabels = useMemo(() => {
    const dir0 = activeLadder?.directions?.['0'];
    const dir1 = activeLadder?.directions?.['1'];
    return {
      d0: dir0?.terminus || activeLine?.destinations?.['0'] || 'Aller',
      d1: dir1?.terminus || activeLine?.destinations?.['1'] || 'Retour',
      hasD1: Boolean(dir1 || activeLine?.destinations?.['1']),
    };
  }, [activeLadder, activeLine]);

  const activeLineTrains = useMemo(() => {
    if (!activeLine) return [];
    return trains.filter((train) => train.line === activeLine.id);
  }, [trains, activeLine]);

  const lineStats: Stat[] = useMemo(() => {
    if (!activeLine) return [];
    const activeCount = activeLineTrains.length;
    const lengthLabel =
      activeLine.measured_length_km > 0 ? `${activeLine.measured_length_km.toFixed(1)} km` : '—';

    return [
      {
        icon: RiSubwayLine,
        label: 'Rames en ligne',
        value: String(activeCount),
        delta: activeCount > 0 ? 'Actif' : 'Pause',
        deltaColor: activeCount > 0 ? 'lime' : 'neutral',
      },
      {
        icon: RiTimerLine,
        label: 'Longueur',
        value: lengthLabel,
        delta: activeLine.mode === 'rail' ? 'RER / Train' : 'Métro',
        deltaColor: 'neutral',
      },
      {
        icon: RiSpeedUpLine,
        label: 'Matériel',
        value: stockInfo?.name || 'Standard',
        delta: stockInfo ? `${stockInfo.cars_count} voitures` : 'Flotte',
        deltaColor: 'neutral',
      },
      {
        icon: RiDashboard3Line,
        label: 'Exploitation',
        value: stockInfo?.driverless ? 'Automatique' : 'Conducteur',
        delta: stockInfo?.drive_type === 'tire' ? 'Pneumatique' : 'Fer',
        deltaColor: stockInfo?.driverless ? 'lime' : 'neutral',
      },
    ];
  }, [activeLine, activeLineTrains.length, stockInfo]);

  const activeLineKey = activeLine?.id ?? null;

  useEffect(() => {
    if (!isVisible || !activeLineKey) {
      ladderRef.current?.stopAnimation();
      ladderRef.current = null;
      return;
    }
    const hostEl = ladderHostRef.current ?? document.getElementById(ladderHostId);
    if (!hostEl) return;

    ladderRef.current = new StationLadder({
      containerId: ladderHostId,
      onStationClick: (_coords, name) => {
        const found = stations.find((station) => station.name === name);
        if (found) {
          handlers.onStationSelect?.(found);
        }
      },
      onTrainClick: (train) => {
        handlers.onTrainFollow?.(train);
      },
      onLineSwitch: (lineId) => {
        handlers.onLineSelect?.(lineId, '0');
      },
    });
    ladderRef.current.startAnimation();

    return () => {
      ladderRef.current?.stopAnimation();
      ladderRef.current = null;
    };
  }, [isVisible, activeLineKey, stations, handlers]);

  useEffect(() => {
    if (!isVisible || !activeLineKey || !ladderRef.current) return;
    ladderRef.current.setLine(activeLadder, activeDir || '0');
    ladderRef.current.updateTrains(trains);
  }, [isVisible, activeLineKey, activeLadder, activeDir, trains]);

  if (!isVisible) {
    return (
      <aside
        id="dock"
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 size-0 overflow-hidden"
      />
    );
  }

  const isParis = cityConfig?.id === 'paris';

  return (
    <aside
      id="dock"
      aria-label="Lignes du réseau et détail de ligne"
      className={cx(
        'pointer-events-auto fixed z-20 flex flex-col overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default/90 shadow-lg backdrop-blur-md',
        'transition-[transform,opacity] duration-200 ease-out',
        expertMode
          ? 'inset-x-2.5 bottom-4 max-h-[52vh] md:inset-x-auto md:left-4 md:bottom-4 md:w-[348px] md:max-h-[calc(100dvh-132px)]'
          : 'inset-x-2.5 bottom-4 max-h-[52vh] md:inset-x-auto md:left-4 md:bottom-4 md:w-[348px] md:max-h-[calc(100dvh-90px)]',
        !mobileExpanded && 'max-h-[54px] md:max-h-[calc(100dvh-132px)]'
      )}
    >
      {/* En-tête du panneau */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-separator-border px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0 text-body-medium text-text-primary">
            {activeLine ? `Ligne ${activeLine.short_name}` : 'Lignes du réseau'}
          </span>
          {activeLine?.long_name ? (
            <span className="hidden min-w-0 flex-1 truncate text-caption-1-medium text-text-tertiary sm:inline">
              {activeLine.long_name}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {activeLine ? (
            <Button
              variant="ghost"
              size="xs"
              leadingIcon={RiRestartLine}
              onClick={() => handlers.onLineSelect?.(null, '0')}
            >
              Toutes
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            className="md:hidden"
            onClick={() => setMobileExpanded((prev) => !prev)}
          >
            {mobileExpanded ? 'Réduire' : 'Ouvrir'}
          </Button>
          {!expertMode ? (
            <CloseButton
              size="sm"
              aria-label="Fermer le panneau des lignes"
              onClick={() => uiStore.setLineDrawerOpen(false)}
            />
          ) : null}
        </div>
      </div>

      {/* Corps défilant */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain p-3.5 [scrollbar-width:thin]">
        {/* Grille compacte de sélection des lignes */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choisir une ligne">
          {sortedLines.map((line) => {
            const hasAlert = Boolean(
              trafficByLine[line.id] && trafficByLine[line.id].status !== 'normal'
            );
            return (
              <LineBadgeChip
                key={line.id}
                shortName={line.short_name}
                color={line.color}
                textColor={line.text_color}
                size="sm"
                interactive
                selected={line.id === activeLineId}
                dimmed={Boolean(activeLineId && line.id !== activeLineId)}
                hasAlert={hasAlert}
                onClick={() => {
                  const nextId = line.id === activeLineId ? null : line.id;
                  handlers.onLineSelect?.(nextId, '0');
                }}
              />
            );
          })}
        </div>

        <Divider />

        {activeLine ? (
          <div className="flex flex-col gap-3">
            {/* Sélecteur de sens */}
            {dirLabels.hasD1 ? (
              <SegmentedControl
                aria-label="Direction de la ligne"
                selectedKeys={[activeDir || '0']}
                onSelectionChange={(keys) => {
                  const first = keys.values().next().value;
                  if (typeof first === 'string') {
                    handlers.onLineDirChange?.(activeLine.id, first);
                  }
                }}
                className="w-full max-w-full overflow-hidden"
              >
                <SegmentedControlItem id="0" className="min-w-0 flex-1 overflow-hidden">
                  <span className="block w-full truncate">{dirLabels.d0}</span>
                </SegmentedControlItem>
                <SegmentedControlItem id="1" className="min-w-0 flex-1 overflow-hidden">
                  <span className="block w-full truncate">{dirLabels.d1}</span>
                </SegmentedControlItem>
              </SegmentedControl>
            ) : null}

            {/* État du trafic */}
            {traffic && traffic.status !== 'normal' ? (
              <div
                role="alert"
                className="flex min-w-0 items-start gap-2 overflow-hidden rounded-xl border border-separator-border bg-status-rose-background p-2.5 text-status-rose-text"
              >
                <RiAlertLine className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-2-medium">{traffic.title}</div>
                  <p className="break-words text-caption-1-medium opacity-90">{traffic.message}</p>
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border border-separator-border bg-background-secondary-default/65 px-3 py-2 text-caption-1-medium text-text-secondary">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <StatusDot color="green" className="shrink-0" />
                  <span className="truncate">Trafic normal sur la ligne</span>
                </span>
                <span className="shrink-0 tabular-nums text-text-primary">
                  {activeLineTrains.length} rames
                </span>
              </div>
            )}

            {/* KPIs avancés uniquement en Mode Passionné */}
            {expertMode && lineStats.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {lineStats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <section
                      key={stat.label}
                      className="flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-separator-border bg-background-secondary-default/75 p-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-1.5 text-caption-1-medium text-text-secondary">
                        <Icon
                          className="size-3.5 shrink-0 text-foreground-icon-secondary"
                          aria-hidden
                        />
                        <span className="truncate">{stat.label}</span>
                      </div>
                      <div className="truncate text-body-medium font-semibold tabular-nums text-text-primary">
                        {stat.value}
                      </div>
                      <div className="flex min-w-0">
                        <Chip
                          variant="caption"
                          color={stat.deltaColor}
                          className="max-w-full truncate"
                        >
                          {stat.delta}
                        </Chip>
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}

            {/* Action 3D Paris */}
            {isParis ? (
              <Button
                variant="primary"
                size="small"
                leadingIcon={RiBox3Line}
                className="w-full max-w-full"
                onClick={() =>
                  handlers.onOpenParisRide?.({
                    initialLine: activeLine.short_name,
                    initialView: expertMode ? 'ride' : 'vault',
                  })
                }
              >
                {expertMode ? 'Cabine 3D en direct' : 'Voir la rame en 3D'}
              </Button>
            ) : null}

            {/* Thermomètre dynamique des stations et trains */}
            <div
              id={ladderHostId}
              ref={ladderHostRef}
              className="dock-content min-h-[160px] overflow-x-hidden rounded-xl border border-separator-border bg-background-secondary-default/40 p-2"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-xl border border-separator-border bg-background-secondary-default/65 p-3.5">
            <div className="flex items-center gap-2 text-body-medium text-text-primary">
              <RiPulseLine className="size-4 text-status-lime-text" aria-hidden />
              <span>
                {serviceStatus?.state === 'ended' || serviceStatus?.state === 'before_first'
                  ? 'Fin du service régulier'
                  : 'Réseau en circulation'}
              </span>
            </div>
            <p className="text-body-2-regular text-text-secondary">
              {serviceStatus?.state === 'ended' || serviceStatus?.state === 'before_first'
                ? `Reprise estimée dans ${formatCountdown(serviceStatus.secondsUntilFirst)}.`
                : 'Sélectionnez une ligne ci-dessus ou cliquez directement sur une station de la carte 3D.'}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
