import { useMemo } from 'react';
import {
  RiAlertLine,
  RiBox3Line,
  RiCompass3Line,
  RiFocus3Line,
  RiRouteLine,
  RiWheelchairLine,
} from '@remixicon/react';
import type { StationDeparture } from '@core/sim/browser_engine';
import type { LineMetadata, LineTrafficReport } from '@core/types';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Divider } from '@/components/base/divider/divider';
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from '@/components/base/drawer/drawer';
import { LineBadgeChip } from './LineBadgeChip';
import { uiStore, useUiStore } from './ui_store';
import { useMediaQuery } from './useMediaQuery';

function formatEta(
  waitMinutes: number,
  atStop: boolean
): { label: string; color: 'lime' | 'blue' | 'soft' } {
  if (atStop || waitMinutes <= 0) return { label: 'À quai', color: 'lime' };
  if (waitMinutes === 1) return { label: '1 min', color: 'blue' };
  return { label: `${waitMinutes} min`, color: 'soft' };
}

function confidenceText(conf: StationDeparture['confidence']): string {
  switch (conf) {
    case 'measured':
      return 'PRIM mesuré';
    case 'bracketed':
      return 'Encadré RT';
    case 'extrapolated':
      return 'Extrapolé';
    default:
      return 'Théorique GTFS';
  }
}

export function StationDrawer() {
  const {
    cityConfig,
    lines,
    selectedStation,
    stationDepartures,
    trafficByLine,
    expertMode,
    handlers,
  } = useUiStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const lineById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);

  const servingLines: LineMetadata[] = useMemo(() => {
    if (!selectedStation) return [];
    return selectedStation.lines
      .map((lineId) => lineById.get(lineId))
      .filter((line): line is LineMetadata => Boolean(line));
  }, [selectedStation, lineById]);

  const trafficAlerts: { line: LineMetadata; report: LineTrafficReport }[] = useMemo(() => {
    return servingLines
      .map((line) => ({ line, report: trafficByLine[line.id] }))
      .filter((entry): entry is { line: LineMetadata; report: LineTrafficReport } =>
        Boolean(entry.report && entry.report.status !== 'normal')
      );
  }, [servingLines, trafficByLine]);

  const primaryLine = servingLines[0] ?? null;
  const isParis = cityConfig?.id === 'paris';

  return (
    <Drawer
      isOpen={Boolean(selectedStation)}
      onOpenChange={(open) => {
        if (!open) uiStore.setSelectedStation(null);
      }}
      placement={isMobile ? 'bottom' : 'end'}
      size="md"
      aria-label={selectedStation ? `Station ${selectedStation.name}` : 'Détails de la station'}
    >
      {({ close }) => {
        if (!selectedStation) return null;
        return (
          <>
            <DrawerHeader
              title={selectedStation.name}
              description={
                selectedStation.wheelchair_boarding === 1
                  ? 'Station et accès adaptés PMR'
                  : 'Correspondances et prochains passages en direct'
              }
            />

            <DrawerBody className="flex flex-col gap-4">
              {/* Lignes desservant la station + PMR */}
              <div className="flex flex-wrap items-center gap-2">
                {servingLines.map((line) => (
                  <LineBadgeChip
                    key={line.id}
                    shortName={line.short_name}
                    color={line.color}
                    textColor={line.text_color}
                    size="sm"
                    interactive
                    hasAlert={Boolean(
                      trafficByLine[line.id] && trafficByLine[line.id].status !== 'normal'
                    )}
                    onClick={() => {
                      handlers.onLineSelect?.(line.id, '0');
                      uiStore.setLineDrawerOpen(true);
                      close();
                    }}
                  />
                ))}
                {selectedStation.wheelchair_boarding === 1 ? (
                  <Chip color="cyan" variant="caption" className="gap-1">
                    <RiWheelchairLine className="size-3.5" aria-hidden />
                    Accessible PMR
                  </Chip>
                ) : null}
              </div>

              {/* Alertes trafic sur les lignes de la station */}
              {trafficAlerts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {trafficAlerts.map(({ line, report }) => (
                    <div
                      key={line.id}
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-separator-border bg-status-rose-background p-3 text-status-rose-text"
                    >
                      <RiAlertLine className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="text-body-2-medium">
                          Ligne {line.short_name} · {report.title}
                        </div>
                        <p className="text-caption-1-medium opacity-90">{report.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <Divider />

              {/* Prochains passages */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-body-2-medium text-text-secondary">Prochains passages</span>
                  <span className="inline-flex items-center gap-1.5 text-caption-1-medium text-text-tertiary">
                    <StatusDot color="green" />
                    Temps réel & GTFS
                  </span>
                </div>

                {stationDepartures.length === 0 ? (
                  <div className="rounded-xl border border-separator-border bg-background-secondary-default px-3 py-4 text-center text-body-2-regular text-text-tertiary">
                    Aucun passage prévu dans les prochaines minutes (fin de service ou ligne
                    interrompue).
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {stationDepartures.map((dep) => {
                      const eta = formatEta(dep.waitMinutes, dep.atStop);
                      return (
                        <li
                          key={`${dep.tripId}-${dep.lineId}-${dep.direction}`}
                          className="flex min-w-0 items-center justify-between gap-2.5 overflow-hidden rounded-xl border border-separator-border bg-background-secondary-default/70 px-3 py-2"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <LineBadgeChip
                              shortName={dep.lineShortName}
                              color={dep.colorHex}
                              textColor={dep.textColorHex}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-body-medium text-text-primary">
                                {dep.destName}
                              </div>
                              {expertMode ? (
                                <div className="flex items-center gap-1.5 text-caption-1-medium text-text-tertiary">
                                  <span>{confidenceText(dep.confidence)}</span>
                                  <span className="tabular-nums">
                                    · {Math.round(dep.waitSeconds)} s
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {expertMode ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  handlers.onTrainFollowById?.(dep.tripId, dep.lineId);
                                  close();
                                }}
                              >
                                Suivre
                              </Button>
                            ) : null}
                            <Chip color={eta.color} variant="bold" className="tabular-nums">
                              {eta.label}
                            </Chip>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </DrawerBody>

            <DrawerFooter className="flex-wrap justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  leadingIcon={RiFocus3Line}
                  onClick={() => {
                    handlers.onStationZoom20?.(selectedStation);
                    close();
                  }}
                >
                  Zoom 3D
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  leadingIcon={RiCompass3Line}
                  onClick={() => {
                    handlers.onOpenRoutePlanner?.({
                      destination: {
                        label: selectedStation.name,
                        subtitle: 'Station',
                        coordinates: selectedStation.coordinates,
                        kind: 'station',
                        station: selectedStation,
                      },
                    });
                    close();
                  }}
                >
                  Y aller
                </Button>
                {primaryLine ? (
                  <Button
                    variant="secondary"
                    size="small"
                    leadingIcon={RiRouteLine}
                    onClick={() => {
                      handlers.onLineSelect?.(primaryLine.id, '0');
                      uiStore.setLineDrawerOpen(true);
                      close();
                    }}
                  >
                    Ligne {primaryLine.short_name}
                  </Button>
                ) : null}
              </div>

              {isParis && primaryLine ? (
                <Button
                  variant="primary"
                  size="small"
                  leadingIcon={RiBox3Line}
                  onClick={() => {
                    close();
                    handlers.onOpenParisRide?.({
                      initialLine: primaryLine.short_name,
                      initialStation: selectedStation.name,
                      initialView: 'vault',
                    });
                  }}
                >
                  Quai 3D
                </Button>
              ) : null}
            </DrawerFooter>
          </>
        );
      }}
    </Drawer>
  );
}
