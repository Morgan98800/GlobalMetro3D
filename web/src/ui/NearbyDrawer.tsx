import { useMemo } from 'react';
import { RiMapPinLine, RiNavigationLine, RiRefreshLine, RiWalkLine } from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from '@/components/base/drawer/drawer';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { LineBadgeChip } from './LineBadgeChip';
import { uiStore, useUiStore } from './ui_store';
import { useMediaQuery } from './useMediaQuery';

function formatDistance(distanceM: number, walkMinutes: number): string {
  const distLabel = distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`;
  return `${distLabel} · ~${walkMinutes} min à pied`;
}

export function NearbyDrawer() {
  const {
    nearbyOpen,
    nearbyLoading,
    nearbyError,
    nearbyStations,
    nearbyDepartures,
    lines,
    handlers,
  } = useUiStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const lineById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);

  return (
    <Drawer
      isOpen={nearbyOpen}
      onOpenChange={(open) => uiStore.setNearbyOpen(open)}
      placement={isMobile ? 'bottom' : 'end'}
      size="md"
      aria-label="Stations autour de moi"
    >
      {({ close }) => (
        <>
          <DrawerHeader
            title="Autour de moi"
            description="Les stations les plus proches et leurs prochains passages"
          />

          <DrawerBody className="flex flex-col gap-3">
            {nearbyLoading ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-xl border border-separator-border p-3"
                  >
                    <Skeleton className="h-4 w-44 rounded-md" />
                    <Skeleton className="h-3 w-28 rounded-md" />
                    <Skeleton className="h-6 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : nearbyError ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-separator-border bg-background-secondary-default p-4">
                <div className="flex items-center gap-2 text-body-medium text-text-primary">
                  <RiNavigationLine className="size-4 text-status-yellow-text" aria-hidden />
                  Localisation indisponible
                </div>
                <p className="text-body-2-regular text-text-secondary">{nearbyError}</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    leadingIcon={RiRefreshLine}
                    onClick={() => handlers.onRequestNearby?.()}
                  >
                    Réessayer
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => {
                      close();
                      uiStore.setSearchOpen(true);
                    }}
                  >
                    Rechercher une station
                  </Button>
                </div>
              </div>
            ) : nearbyStations.length === 0 ? (
              <div className="rounded-xl border border-separator-border bg-background-secondary-default p-4 text-center text-body-2-regular text-text-secondary">
                Aucune station détectée à proximité de votre position.
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {nearbyStations.map(({ station, distanceM, walkMinutes }) => {
                  const deps = (nearbyDepartures[station.name] ?? []).slice(0, 2);
                  const serving = station.lines
                    .map((lineId) => lineById.get(lineId))
                    .filter((l): l is (typeof lines)[number] => Boolean(l));

                  return (
                    <li key={station.id}>
                      <button
                        type="button"
                        onClick={() => {
                          handlers.onStationSelect?.(station);
                        }}
                        className="flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-separator-border bg-background-secondary-default/65 p-3 text-start transition-colors hover:border-border-button-hover hover:bg-background-secondary-hover outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-body-medium text-text-primary">
                              <RiMapPinLine
                                className="size-4 shrink-0 text-foreground-icon-secondary"
                                aria-hidden
                              />
                              <span className="truncate">{station.name}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-caption-1-medium text-text-tertiary">
                              <RiWalkLine className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate">
                                {formatDistance(distanceM, walkMinutes)}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            {serving.slice(0, 4).map((line) => (
                              <LineBadgeChip
                                key={line.id}
                                shortName={line.short_name}
                                color={line.color}
                                textColor={line.text_color}
                                size="xs"
                              />
                            ))}
                          </div>
                        </div>

                        {deps.length > 0 ? (
                          <div className="flex flex-col gap-1 border-t border-separator-border pt-2">
                            {deps.map((dep) => (
                              <div
                                key={`${dep.tripId}-${dep.lineId}`}
                                className="flex items-center justify-between gap-2 text-caption-1-medium"
                              >
                                <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                                  <LineBadgeChip
                                    shortName={dep.lineShortName}
                                    color={dep.colorHex}
                                    textColor={dep.textColorHex}
                                    size="xs"
                                  />
                                  <span className="truncate">{dep.destName}</span>
                                </span>
                                <Chip
                                  color={dep.atStop || dep.waitMinutes <= 1 ? 'lime' : 'soft'}
                                  variant="caption"
                                  className="shrink-0 tabular-nums"
                                >
                                  {dep.atStop || dep.waitMinutes <= 0
                                    ? 'À quai'
                                    : `${dep.waitMinutes} min`}
                                </Chip>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DrawerBody>

          <DrawerFooter>
            <Button variant="secondary" size="small" onClick={close}>
              Fermer
            </Button>
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
