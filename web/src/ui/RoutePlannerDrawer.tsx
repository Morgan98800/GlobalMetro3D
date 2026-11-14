import { useEffect, useMemo, useState } from 'react';
import {
  RiArrowUpDownLine,
  RiCompass3Line,
  RiCrosshair2Line,
  RiDeleteBinLine,
  RiFootprintLine,
  RiMapPin2Line,
  RiSubwayLine,
  RiArrowLeftRightLine,
} from '@remixicon/react';
import { searchPlaces, type PlaceCandidate } from '@core/ui/utils/geocoding';
import type { RoutePoint, TransitItinerary } from '@core/ui/utils/transit_router';
import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';
import { IconButton } from '@/components/base/buttons/icon-button';
import { Divider } from '@/components/base/divider/divider';
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from '@/components/base/drawer/drawer';
import { SearchField } from '@/components/base/search-field/search-field';
import { Spinner } from '@/components/base/spinner/spinner';
import { cx } from '@/utils/cx';
import { LineBadgeChip } from './LineBadgeChip';
import { uiStore, useUiStore } from './ui_store';
import { useMediaQuery } from './useMediaQuery';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDuration(sec: number): string {
  const mins = Math.max(1, Math.round(sec / 60));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} h ${String(m).padStart(2, '0')}`;
  }
  return `${mins} min`;
}

function formatMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

interface EndpointPickerProps {
  label: string;
  placeholder: string;
  point: RoutePoint | null;
  allowUserLocation?: boolean;
  onSelectPoint: (next: RoutePoint) => void;
  onUseCurrentLocation?: () => void;
}

function EndpointPicker({
  label,
  placeholder,
  point,
  allowUserLocation = false,
  onSelectPoint,
  onUseCurrentLocation,
}: EndpointPickerProps) {
  const { stations, cityConfig } = useUiStore();
  const [text, setText] = useState(point?.label ?? '');
  const [focused, setFocused] = useState(false);
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setText(point?.label ?? '');
  }, [point?.label]);

  useEffect(() => {
    const trimmed = text.trim();
    if (!focused || trimmed.length < 3 || trimmed === point?.label) {
      setPlaces([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchPlaces(trimmed, {
        cityId: cityConfig?.id,
        center: cityConfig?.map?.center,
        limit: 5,
        signal: controller.signal,
      })
        .then((res) => {
          if (!controller.signal.aborted) setPlaces(res);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPlaces([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, focused, point?.label, cityConfig?.id, cityConfig?.map?.center]);

  const matchingStations = useMemo(() => {
    const q = normalizeText(text);
    if (!focused || q.length < 2 || text === point?.label) return [];
    return stations.filter((s) => normalizeText(s.name).includes(q)).slice(0, 4);
  }, [stations, text, focused, point?.label]);

  const showDropdown = focused && (matchingStations.length > 0 || places.length > 0);

  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption-1-semibold text-text-secondary">{label}</span>
        {allowUserLocation && onUseCurrentLocation ? (
          <button
            type="button"
            onClick={onUseCurrentLocation}
            className="inline-flex cursor-pointer items-center gap-1 text-caption-1-medium text-accent-500 hover:underline"
          >
            <RiCrosshair2Line className="size-3.5" aria-hidden />
            Ma position
          </button>
        ) : null}
      </div>
      <SearchField
        aria-label={label}
        placeholder={placeholder}
        shape="rounded"
        size="small"
        value={text}
        isLoading={loading}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 180)}
        onChange={(next) => {
          setText(next);
          if (!next) setPlaces([]);
        }}
      />

      {showDropdown ? (
        <ul
          role="listbox"
          aria-label={`Suggestions pour ${label}`}
          className="absolute top-full z-40 mt-1 flex max-h-56 w-full flex-col overflow-y-auto rounded-xl border border-border-button-default bg-background-primary-default p-1 shadow-xl"
        >
          {matchingStations.map((st) => (
            <li key={`st:${st.id}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const next: RoutePoint = {
                    label: st.name,
                    subtitle: 'Station de métro / RER',
                    coordinates: st.coordinates,
                    kind: 'station',
                    station: st,
                  };
                  onSelectPoint(next);
                  setText(st.name);
                  setFocused(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-lg px-2.5 py-2 text-start text-body-2-medium text-text-primary hover:bg-background-secondary-hover"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <RiSubwayLine className="size-4 shrink-0 text-accent-500" aria-hidden />
                  <span className="truncate">{st.name}</span>
                </span>
                <Chip color="soft" variant="caption" className="shrink-0">
                  Station
                </Chip>
              </button>
            </li>
          ))}

          {places.map((pl) => (
            <li key={pl.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const next: RoutePoint = {
                    label: pl.name,
                    subtitle: pl.subtitle,
                    coordinates: pl.coordinates,
                    kind: 'place',
                  };
                  onSelectPoint(next);
                  setText(pl.name);
                  setFocused(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-lg px-2.5 py-2 text-start hover:bg-background-secondary-hover"
              >
                <span className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden">
                  <RiMapPin2Line
                    className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-2-medium text-text-primary">
                      {pl.name}
                    </span>
                    {pl.subtitle ? (
                      <span className="block truncate text-caption-1-regular text-text-tertiary">
                        {pl.subtitle}
                      </span>
                    ) : null}
                  </span>
                </span>
                <Chip color="soft" variant="caption" className="shrink-0">
                  {pl.category}
                </Chip>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RoutePlannerDrawer() {
  const {
    routePlannerOpen,
    routeOrigin,
    routeDestination,
    routeCandidates,
    activeItineraryIndex,
    routeLoading,
    routeError,
    handlers,
  } = useUiStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const activeRoute: TransitItinerary | null = routeCandidates[activeItineraryIndex] ?? null;

  const swapEndpoints = () => {
    const nextOrigin = routeDestination;
    const nextDest = routeOrigin;
    handlers.onComputeItinerary?.(nextOrigin, nextDest);
  };

  return (
    <Drawer
      isOpen={routePlannerOpen}
      onOpenChange={(open) => {
        if (!open) uiStore.setRoutePlannerOpen(false);
      }}
      placement={isMobile ? 'bottom' : 'end'}
      size="md"
      aria-label="Calculateur d'itinéraire"
    >
      {({ close }) => (
        <>
          <DrawerHeader
            title="Itinéraire"
            description="Adresse, restaurant, monument ou station à station"
          />

          <DrawerBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5 rounded-xl border border-separator-border bg-background-secondary-default/55 p-3">
              <EndpointPicker
                label="Départ (A)"
                placeholder="Ma position, adresse, station…"
                point={routeOrigin}
                allowUserLocation
                onSelectPoint={(next) => handlers.onComputeItinerary?.(next, routeDestination)}
                onUseCurrentLocation={() =>
                  handlers.onOpenRoutePlanner?.({ origin: null, destination: routeDestination })
                }
              />

              <div className="flex items-center justify-end">
                <IconButton
                  icon={RiArrowUpDownLine}
                  size="small"
                  aria-label="Inverser départ et arrivée"
                  onClick={swapEndpoints}
                />
              </div>

              <EndpointPicker
                label="Arrivée (B)"
                placeholder="Ex. Tour Eiffel, Bouillon Chartier, Châtelet…"
                point={routeDestination}
                onSelectPoint={(next) => handlers.onComputeItinerary?.(routeOrigin, next)}
              />
            </div>

            {routeLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-body-2-regular text-text-secondary">
                <Spinner size="sm" aria-label="Calcul de l'itinéraire" />
                <span>Calcul du meilleur trajet…</span>
              </div>
            ) : routeError ? (
              <div className="rounded-xl border border-separator-border bg-status-rose-background px-3 py-3 text-body-2-medium text-status-rose-text">
                {routeError}
              </div>
            ) : routeCandidates.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-separator-border bg-background-secondary-default/50 px-4 py-6 text-center text-body-2-regular text-text-tertiary">
                <RiCompass3Line className="size-6 text-foreground-icon-secondary" aria-hidden />
                <span>
                  Choisissez un point de départ et une destination pour afficher le trajet sur la
                  carte 3D.
                </span>
              </div>
            ) : (
              <>
                {/* Cartes de choix d'itinéraire */}
                <div className="flex flex-col gap-2">
                  {routeCandidates.map((cand, index) => {
                    const selected = index === activeItineraryIndex;
                    const rideLegs = cand.legs.filter((l) => l.kind === 'ride');
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handlers.onSelectItineraryIndex?.(index)}
                        className={cx(
                          'flex w-full cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-start transition-colors',
                          selected
                            ? 'border-accent-500 bg-accent-500/12'
                            : 'border-separator-border bg-background-secondary-default/60 hover:bg-background-secondary-hover'
                        )}
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          {rideLegs.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-body-2-medium text-text-primary">
                              <RiFootprintLine className="size-4" aria-hidden />À pied
                            </span>
                          ) : (
                            rideLegs.map((leg, i) => (
                              <span
                                key={`${leg.lineId}:${i}`}
                                className="inline-flex items-center gap-1"
                              >
                                <LineBadgeChip
                                  shortName={leg.lineShortName || '?'}
                                  color={leg.lineColor || '#C9A227'}
                                  textColor={leg.lineTextColor || '#111'}
                                  size="xs"
                                />
                                {i < rideLegs.length - 1 ? (
                                  <span className="text-caption-1-medium text-text-tertiary">
                                    →
                                  </span>
                                ) : null}
                              </span>
                            ))
                          )}
                          <span className="text-caption-1-medium text-text-tertiary">
                            · {formatMeters(cand.totalWalkM)} à pied
                          </span>
                        </div>
                        <span className="shrink-0 text-body-medium font-semibold tabular-nums text-text-primary">
                          {formatDuration(cand.totalDurationSec)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeRoute ? (
                  <>
                    <Divider />
                    <ol className="flex flex-col gap-2">
                      {activeRoute.legs.map((leg, idx) => (
                        <li
                          key={`${leg.kind}:${idx}`}
                          className="flex min-w-0 items-start gap-2.5 overflow-hidden rounded-xl border border-separator-border bg-background-secondary-default/55 px-3 py-2.5"
                        >
                          {leg.kind === 'walk' ? (
                            <RiFootprintLine
                              className="mt-0.5 size-4 shrink-0 text-accent-500"
                              aria-hidden
                            />
                          ) : leg.kind === 'transfer' ? (
                            <RiArrowLeftRightLine
                              className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary"
                              aria-hidden
                            />
                          ) : (
                            <LineBadgeChip
                              shortName={leg.lineShortName || '?'}
                              color={leg.lineColor || '#C9A227'}
                              textColor={leg.lineTextColor || '#111'}
                              size="sm"
                            />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="min-w-0 flex-1 truncate text-body-2-medium text-text-primary">
                                {leg.kind === 'walk'
                                  ? `Marche vers ${leg.toLabel}`
                                  : leg.kind === 'transfer'
                                    ? `Correspondance à ${leg.toLabel}`
                                    : `${leg.fromLabel} → ${leg.toLabel}`}
                              </span>
                              <span className="shrink-0 text-caption-1-semibold tabular-nums text-text-secondary">
                                {formatDuration(leg.durationSec)}
                              </span>
                            </div>
                            <p className="truncate text-caption-1-regular text-text-tertiary">
                              {leg.kind === 'ride'
                                ? `Direction ${leg.terminusName} · ${Math.max(1, (leg.stops?.length ?? 2) - 1)} arrêt${(leg.stops?.length ?? 2) - 1 > 1 ? 's' : ''}`
                                : `${formatMeters(leg.distanceM)}`}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}
              </>
            )}
          </DrawerBody>

          <DrawerFooter className="justify-between gap-2">
            {routeCandidates.length > 0 ? (
              <Button
                variant="ghost"
                size="small"
                leadingIcon={RiDeleteBinLine}
                onClick={() => handlers.onClearItinerary?.()}
              >
                Effacer le trajet
              </Button>
            ) : (
              <span />
            )}
            <Button variant="secondary" size="small" onClick={close}>
              Fermer
            </Button>
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
