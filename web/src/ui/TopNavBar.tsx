import { useEffect, useState } from 'react';
import {
  RiArrowDownSLine,
  RiBookOpenLine,
  RiCompass3Line,
  RiInformationLine,
  RiMenuLine,
  RiNavigationLine,
  RiPulseLine,
  RiRouteLine,
  RiSearchLine,
  RiSettings3Line,
  RiTrainLine,
  RiTrophyLine,
} from '@remixicon/react';
import { cityClock } from '@core/sim/paris_time';
import { Button } from '@/components/base/buttons/button';
import { IconButton } from '@/components/base/buttons/icon-button';
import { StatusDot } from '@/components/base/badges/status-dot';
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@/components/base/dropdown/dropdown';
import { Kbd } from '@/components/base/kbd/kbd';
import { Switch } from '@/components/base/switch/switch';
import { cx } from '@/utils/cx';
import { LineBadgeChip } from './LineBadgeChip';
import { uiStore, useUiStore } from './ui_store';

function formatDailyKm(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '0 km';
  if (km >= 1000) return `${Math.round(km).toLocaleString('fr-FR')} km`;
  return `${km.toFixed(1)} km`;
}

function formatClockFromSeconds(secondsSinceMidnight: number): string {
  const s = ((Math.floor(secondsSinceMidnight) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function TopNavBar() {
  const {
    cityConfig,
    cities,
    lines,
    activeLineId,
    expertMode,
    totalTrainCount,
    dailyKm,
    realtimeEnabled,
    realtimeState,
    lineDrawerOpen,
    handlers,
  } = useUiStore();

  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [clockText, setClockText] = useState(() =>
    formatClockFromSeconds(
      cityClock(new Date(), cityConfig?.timezone ?? 'Europe/Paris').secondsSinceMidnight
    )
  );

  useEffect(() => {
    const tz = cityConfig?.timezone ?? 'Europe/Paris';
    const update = () =>
      setClockText(formatClockFromSeconds(cityClock(new Date(), tz).secondsSinceMidnight));
    update();
    if (!expertMode) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cityConfig?.timezone, expertMode]);

  if (!cityConfig) return null;

  const activeLine = activeLineId ? (lines.find((l) => l.id === activeLineId) ?? null) : null;
  const supportsRealtime = cityConfig.realtime.provider !== 'none';
  const isRealtimeActive = typeof realtimeState === 'object' && realtimeState.active;
  const isDegraded = typeof realtimeState === 'object' && Boolean(realtimeState.degraded);

  const rtProviderLabel =
    cityConfig.realtime.provider === 'prim'
      ? 'PRIM Live'
      : cityConfig.realtime.provider === 'tfl-unified'
        ? 'TfL Live'
        : cityConfig.id === 'washington'
          ? 'WMATA Live'
          : cityConfig.id === 'berlin'
            ? 'VBB Live'
            : 'Temps réel';

  return (
    <header
      id="topbar"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col gap-1.5 px-2.5 pt-2 sm:px-4 sm:pt-3"
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-2 rounded-2xl border border-border-button-default bg-background-primary-default/88 px-2.5 py-1.5 shadow-md backdrop-blur-md">
        {/* Gauche : sélecteur de ville */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Dropdown isOpen={cityMenuOpen} onOpenChange={setCityMenuOpen}>
            <DropdownTrigger className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-body-medium text-text-primary transition-colors hover:bg-background-secondary-hover">
              <span className="flex size-6 items-center justify-center rounded-md bg-background-tertiary-default text-text-primary">
                <RiTrainLine className="size-3.5" aria-hidden />
              </span>
              <span className="hidden sm:inline">{cityConfig.displayName}</span>
              <span className="sm:hidden">{cityConfig.displayName.slice(0, 3).toUpperCase()}</span>
              <RiArrowDownSLine className="size-4 text-foreground-icon-secondary" aria-hidden />
            </DropdownTrigger>
            <DropdownPopover aria-label="Changer de réseau" placement="bottom start">
              <DropdownGroup label="Réseaux disponibles">
                {cities.map((city) => (
                  <DropdownItem
                    key={city.id}
                    selected={city.id === cityConfig.id}
                    onSelect={() => {
                      setCityMenuOpen(false);
                      if (city.id !== cityConfig.id) {
                        handlers.onCitySelect?.(city.id);
                      }
                    }}
                  >
                    <span className="flex-1 text-start">{city.displayName}</span>
                    {city.id === cityConfig.id ? <StatusDot color="green" /> : null}
                  </DropdownItem>
                ))}
              </DropdownGroup>
            </DropdownPopover>
          </Dropdown>
        </div>

        {/* Centre : recherche unifiée ⌘K */}
        <button
          type="button"
          id="topbar-search-trigger"
          onClick={() => uiStore.setSearchOpen(true)}
          className={cx(
            'flex h-8 min-w-0 flex-1 max-w-sm cursor-pointer items-center justify-between gap-2 rounded-lg border border-border-button-default bg-background-secondary-default px-2.5 text-start',
            'transition-colors hover:border-border-button-hover hover:bg-background-secondary-hover',
            'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring'
          )}
          aria-label="Où allez-vous ? Adresse, restaurant, station ou itinéraire (⌘K)"
        >
          <span className="flex min-w-0 items-center gap-2 text-body-2-regular text-text-tertiary">
            <RiSearchLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <span className="truncate">Où allez-vous ? Adresse, resto, station…</span>
          </span>
          <Kbd className="hidden shrink-0 sm:inline-flex">⌘K</Kbd>
        </button>

        {/* Droite : actions voyageur + mode passionné + menu */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="small"
            leadingIcon={RiCompass3Line}
            onClick={() => handlers.onOpenRoutePlanner?.()}
            aria-label="Calculer un itinéraire entre deux points"
            title="Itinéraire A → B"
          >
            <span className="hidden lg:inline">Itinéraire</span>
          </Button>

          <Button
            variant="secondary"
            size="small"
            leadingIcon={RiNavigationLine}
            onClick={() => handlers.onRequestNearby?.()}
            aria-label="Trouver les stations autour de moi"
            title="Stations autour de moi"
          >
            <span className="hidden md:inline">Autour de moi</span>
          </Button>

          <Button
            variant="secondary"
            size="small"
            leadingIcon={activeLine ? undefined : RiRouteLine}
            onClick={() => uiStore.setLineDrawerOpen(!lineDrawerOpen)}
            aria-expanded={lineDrawerOpen}
            aria-label="Choisir une ligne"
            title="Afficher les lignes du réseau"
          >
            {activeLine ? (
              <span className="flex items-center gap-1.5">
                <LineBadgeChip
                  shortName={activeLine.short_name}
                  color={activeLine.color}
                  textColor={activeLine.text_color}
                  size="xs"
                />
                <span className="hidden lg:inline">Lignes</span>
              </span>
            ) : (
              <span className="hidden lg:inline">Lignes</span>
            )}
          </Button>

          <div className="hidden items-center gap-2 rounded-lg border border-border-button-default bg-background-secondary-default/70 px-2 py-1 sm:flex">
            <Switch
              size="sm"
              isSelected={expertMode}
              onChange={(selected) => uiStore.setExpertMode(selected)}
              aria-label="Activer le mode Passionné / Télémétrie"
            >
              <span className="text-caption-1-medium text-text-secondary">
                {expertMode ? 'Passionné' : 'Simple'}
              </span>
            </Switch>
          </div>

          <Dropdown isOpen={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <DropdownTrigger
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-xs transition-colors hover:bg-background-primary-hover"
              aria-label="Menu et informations"
            >
              <RiMenuLine className="size-4" aria-hidden />
            </DropdownTrigger>
            <DropdownPopover aria-label="Options et ressources" placement="bottom end">
              <div className="px-2 py-1.5 sm:hidden">
                <Switch
                  size="sm"
                  isSelected={expertMode}
                  onChange={(selected) => uiStore.setExpertMode(selected)}
                >
                  <span className="text-body-2-medium text-text-primary">Mode Passionné</span>
                </Switch>
              </div>
              <DropdownDivider className="sm:hidden" />
              <DropdownGroup label="Explorer">
                <DropdownItem
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    uiStore.setActiveModal('settings');
                  }}
                >
                  <RiSettings3Line className="size-4 text-foreground-icon-secondary" aria-hidden />
                  <span>Réglages</span>
                </DropdownItem>
                <DropdownItem
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    uiStore.setActiveModal('records');
                  }}
                >
                  <RiTrophyLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                  <span>Records du réseau</span>
                </DropdownItem>
                <DropdownItem
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    uiStore.setActiveModal('method');
                  }}
                >
                  <RiBookOpenLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                  <span>Méthode & Données</span>
                </DropdownItem>
                <DropdownItem
                  onSelect={() => {
                    setMoreMenuOpen(false);
                    uiStore.setActiveModal('about');
                  }}
                >
                  <RiInformationLine
                    className="size-4 text-foreground-icon-secondary"
                    aria-hidden
                  />
                  <span>À propos du réseau</span>
                </DropdownItem>
              </DropdownGroup>
            </DropdownPopover>
          </Dropdown>
        </div>
      </div>

      {/* Bandeau télémétrie compact uniquement en Mode Passionné */}
      {expertMode ? (
        <div className="pointer-events-auto mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 rounded-xl border border-border-button-default bg-background-primary-default/82 px-3 py-1.5 shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-3 text-caption-1-medium text-text-secondary">
            <span className="inline-flex items-center gap-1.5 font-mono text-text-primary tabular-nums">
              <StatusDot color={isDegraded ? 'yellow' : isRealtimeActive ? 'green' : 'indigo'} />
              {clockText}
            </span>
            <span className="text-border-button-default">•</span>
            <span className="tabular-nums">
              <strong className="font-semibold text-text-primary">{totalTrainCount}</strong> rames
              en circulation
            </span>
            <span className="hidden text-border-button-default sm:inline">•</span>
            <span className="hidden tabular-nums sm:inline">
              <strong className="font-semibold text-text-primary">{formatDailyKm(dailyKm)}</strong>{' '}
              estimés
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {supportsRealtime ? (
              <Button
                variant={realtimeEnabled ? 'primary' : 'secondary'}
                size="xs"
                leadingIcon={RiPulseLine}
                onClick={() => handlers.onToggleRealtime?.()}
              >
                {realtimeEnabled ? `${rtProviderLabel} actif` : `${rtProviderLabel} (Théorique)`}
              </Button>
            ) : (
              <span className="text-caption-1-medium text-text-tertiary">Cadence GTFS</span>
            )}
            <IconButton
              icon={RiTrophyLine}
              size="small"
              aria-label="Ouvrir les records du réseau"
              title="Records du réseau"
              className="hidden sm:inline-flex"
              onClick={() => uiStore.setActiveModal('records')}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
}
