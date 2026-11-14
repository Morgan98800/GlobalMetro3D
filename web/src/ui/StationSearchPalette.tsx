import { useEffect, useMemo, useState } from 'react';
import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiCompass3Line,
  RiCornerDownLeftLine,
  RiMapPin2Line,
  RiMapPinLine,
  RiSubwayLine,
} from '@remixicon/react';
import { searchPlaces, type PlaceCandidate } from '@core/ui/utils/geocoding';
import { Chip } from '@/components/base/badges/chip';
import {
  CommandPalette,
  CommandPaletteItem,
  CommandPaletteSection,
} from '@/components/base/command-palette/command-palette';
import { Kbd } from '@/components/base/kbd/kbd';
import { Spinner } from '@/components/base/spinner/spinner';
import { LineBadgeChip } from './LineBadgeChip';
import { uiStore, useUiStore } from './ui_store';

function normalizeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDistanceLabel(meters?: number): string {
  if (meters === undefined || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function StationSearchPalette() {
  const { searchOpen, stations, lines, cityConfig, handlers } = useUiStore();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  const lineById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!searchOpen || trimmed.length < 3) {
      setPlaces([]);
      setLoadingPlaces(false);
      return;
    }

    const controller = new AbortController();
    setLoadingPlaces(true);
    const timer = window.setTimeout(() => {
      searchPlaces(trimmed, {
        cityId: cityConfig?.id,
        center: cityConfig?.map?.center,
        limit: 6,
        signal: controller.signal,
      })
        .then((res) => {
          if (!controller.signal.aborted) {
            setPlaces(res);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setPlaces([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoadingPlaces(false);
          }
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchOpen, cityConfig?.id, cityConfig?.map?.center]);

  const { matchedLines, matchedStations } = useMemo(() => {
    const q = normalizeQuery(query);
    if (!q) {
      return {
        matchedLines: lines.slice(0, 4),
        matchedStations: stations.slice(0, 8),
      };
    }

    const linesFiltered = lines
      .filter((line) => {
        const shortN = normalizeQuery(line.short_name);
        const longN = normalizeQuery(line.long_name || '');
        return shortN.includes(q) || longN.includes(q) || `ligne ${shortN}`.includes(q);
      })
      .slice(0, 6);

    const stationsFiltered = stations
      .map((station) => {
        const norm = normalizeQuery(station.name);
        const idx = norm.indexOf(q);
        if (idx === -1) return null;
        return { station, score: idx === 0 ? 0 : idx };
      })
      .filter(
        (entry): entry is { station: (typeof stations)[number]; score: number } => entry !== null
      )
      .sort((a, b) => a.score - b.score || a.station.name.localeCompare(b.station.name, 'fr'))
      .slice(0, 12)
      .map((entry) => entry.station);

    return { matchedLines: linesFiltered, matchedStations: stationsFiltered };
  }, [lines, stations, query]);

  const showPlannerShortcut =
    !query.trim() || normalizeQuery('itineraire trajet a vers b').includes(normalizeQuery(query));

  return (
    <CommandPalette
      isOpen={searchOpen}
      onOpenChange={(open) => {
        uiStore.setSearchOpen(open);
        if (!open) {
          setQuery('');
          setPlaces([]);
        }
      }}
      shortcut="k"
      aria-label="Navigation : adresse, restaurant, station ou itinéraire"
      placeholder="Où allez-vous ? Adresse, resto, station…"
      inputValue={query}
      onInputChange={setQuery}
      filter={null}
      emptyState={
        loadingPlaces ? 'Recherche d’adresses et lieux…' : 'Aucun lieu, station ni ligne trouvé'
      }
      footer={
        <>
          <span className="flex items-center gap-1.5">
            <Kbd aria-label="Flèches">
              <RiArrowUpLine className="size-3" aria-hidden />
            </Kbd>
            <Kbd aria-label="Flèche bas">
              <RiArrowDownLine className="size-3" aria-hidden />
            </Kbd>
            Naviguer
          </span>
          <span className="flex items-center gap-1.5">
            {loadingPlaces ? (
              <Spinner size="xs" aria-label="Recherche en cours" />
            ) : (
              <Kbd aria-label="Entrée">
                <RiCornerDownLeftLine className="size-3" aria-hidden />
              </Kbd>
            )}
            {loadingPlaces ? 'Géocodage…' : 'Y aller / Ouvrir'}
          </span>
        </>
      }
    >
      {showPlannerShortcut ? (
        <CommandPaletteSection title="Navigation">
          <CommandPaletteItem
            id="action:route-planner"
            icon={RiCompass3Line}
            textValue="Calculer un itinéraire entre 2 points A B"
            description="A → B · Marche & Métro"
            onAction={() => {
              handlers.onOpenRoutePlanner?.();
            }}
          >
            <span className="truncate font-medium text-accent-500">
              Itinéraire entre 2 points (A → B)
            </span>
          </CommandPaletteItem>
        </CommandPaletteSection>
      ) : null}

      {places.length > 0 ? (
        <CommandPaletteSection title="Adresses, restaurants & lieux">
          {places.map((place) => (
            <CommandPaletteItem
              key={place.id}
              id={place.id}
              icon={RiMapPin2Line}
              textValue={`${place.name} ${place.subtitle} ${place.category}`}
              onAction={() => {
                handlers.onSelectPlace?.(place, true);
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-2-medium text-text-primary">{place.name}</span>
                {place.subtitle ? (
                  <span className="truncate text-caption-1-regular text-text-tertiary">
                    {place.subtitle}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Chip color="soft" variant="caption">
                  {place.category}
                </Chip>
                {place.distanceM !== undefined ? (
                  <span className="text-caption-1-medium tabular-nums text-text-tertiary">
                    {formatDistanceLabel(place.distanceM)}
                  </span>
                ) : null}
              </span>
            </CommandPaletteItem>
          ))}
        </CommandPaletteSection>
      ) : null}

      {matchedStations.length > 0 ? (
        <CommandPaletteSection title={query ? 'Stations correspondantes' : 'Stations principales'}>
          {matchedStations.map((station) => {
            const serving = station.lines
              .map((lineId) => lineById.get(lineId))
              .filter((line): line is (typeof lines)[number] => Boolean(line));
            return (
              <CommandPaletteItem
                key={`station:${station.id}`}
                id={`station:${station.id}`}
                icon={RiMapPinLine}
                textValue={station.name}
                onAction={() => {
                  handlers.onStationSelect?.(station);
                }}
              >
                <span className="truncate">{station.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {serving.slice(0, 5).map((line) => (
                    <LineBadgeChip
                      key={line.id}
                      shortName={line.short_name}
                      color={line.color}
                      textColor={line.text_color}
                      size="xs"
                    />
                  ))}
                  {serving.length > 5 ? (
                    <span className="text-caption-1-medium text-text-tertiary">
                      +{serving.length - 5}
                    </span>
                  ) : null}
                </span>
              </CommandPaletteItem>
            );
          })}
        </CommandPaletteSection>
      ) : null}

      {matchedLines.length > 0 ? (
        <CommandPaletteSection title="Lignes du réseau">
          {matchedLines.map((line) => (
            <CommandPaletteItem
              key={`line:${line.id}`}
              id={`line:${line.id}`}
              icon={RiSubwayLine}
              textValue={`Ligne ${line.short_name} ${line.long_name || ''}`}
              description={line.long_name || undefined}
              onAction={() => {
                handlers.onLineSelect?.(line.id, '0');
                uiStore.setLineDrawerOpen(true);
              }}
            >
              <LineBadgeChip
                shortName={line.short_name}
                color={line.color}
                textColor={line.text_color}
                size="xs"
              />
              <span className="truncate">Ligne {line.short_name}</span>
            </CommandPaletteItem>
          ))}
        </CommandPaletteSection>
      ) : null}
    </CommandPalette>
  );
}
