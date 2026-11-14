import {
  RiExternalLinkLine,
  RiInformationLine,
  RiPulseLine,
  RiSettings3Line,
  RiTrophyLine,
} from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { Divider } from '@/components/base/divider/divider';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/base/modal/modal';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/base/segmented-control/segmented-control';
import { Switch } from '@/components/base/switch/switch';
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs';
import { uiStore, useUiStore, type ThemePreference } from './ui_store';

interface RankingEntry {
  station_name: string;
  counts?: Record<string, number>;
}

function getRealtimeLabel(cityId: string, provider: string): string {
  if (cityId === 'edinburgh') return 'Cadence nominale GTFS (BODS Scotland)';
  if (provider === 'prim') return 'API PRIM / SIRI-Lite (Île-de-France Mobilités)';
  if (provider === 'tfl-unified') return 'TfL Unified API';
  if (cityId === 'washington') return 'WMATA GTFS-RT';
  if (cityId === 'berlin') return 'VBB GTFS-RT (CC BY 4.0)';
  if (provider === 'gtfs-rt') return 'Ilévia GTFS-RT';
  return 'Cadence nominale GTFS (sans GPS en tunnel)';
}

export function InfoModals() {
  const {
    activeModal,
    cityConfig,
    stationRankings,
    themePreference,
    theme,
    expertMode,
    buildingsVisible,
    handlers,
  } = useUiStore();

  const isParis = cityConfig?.id === 'paris';
  const byStation =
    (stationRankings as { by_station?: Record<string, RankingEntry[]> } | null)?.by_station ?? {};

  return (
    <>
      {/* Modale À propos */}
      <Modal
        isOpen={activeModal === 'about'}
        onOpenChange={(open) => {
          if (!open) uiStore.setActiveModal(null);
        }}
        size="lg"
      >
        {({ close }) => (
          <>
            <ModalHeader
              icon={RiInformationLine}
              title={`À propos · ${cityConfig?.displayName ?? 'Réseau 3D'}`}
              description={
                cityConfig?.networkName ?? 'Visualiseur cartographique 3D et simulation cinématique'
              }
            />
            <ModalBody className="flex flex-col gap-4">
              {isParis ? (
                <div className="overflow-hidden rounded-xl border border-separator-border bg-background-secondary-default p-3">
                  <svg
                    className="mx-auto block h-auto w-full max-w-md"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 650 280"
                    role="img"
                    aria-label="Ticket de transport parisien"
                  >
                    <defs>
                      <filter id="ticket-grain-react" x="0" y="0" width="100%" height="100%">
                        <feTurbulence
                          type="fractalNoise"
                          baseFrequency="0.9"
                          numOctaves="4"
                          stitchTiles="stitch"
                        />
                        <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0" />
                      </filter>
                    </defs>
                    <rect
                      x="4"
                      y="4"
                      width="642"
                      height="272"
                      rx="8"
                      fill="#F5F0E8"
                      stroke="#D1CFC8"
                      strokeWidth="2"
                    />
                    <rect
                      x="4"
                      y="4"
                      width="14"
                      height="272"
                      rx="4"
                      fill="#0A0A0A"
                      opacity="0.10"
                    />
                    <rect
                      x="4"
                      y="4"
                      width="642"
                      height="272"
                      rx="8"
                      fill="#0A0A0A"
                      opacity="0.12"
                      filter="url(#ticket-grain-react)"
                    />
                    <g
                      fill="#0A0A0A"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="14"
                      fontWeight="900"
                      letterSpacing="2"
                    >
                      <text x="36" y="60">
                        T
                      </text>
                      <text x="36" y="76">
                        I
                      </text>
                      <text x="36" y="92">
                        C
                      </text>
                      <text x="36" y="108">
                        K
                      </text>
                      <text x="36" y="124">
                        E
                      </text>
                      <text x="36" y="140">
                        T
                      </text>
                    </g>
                    <path
                      d="M90 40V130Q90 160 60 160Q45 160 40 150L55 135Q60 140 70 140Q75 140 75 130V40Z"
                      fill="#0A0A0A"
                    />
                    <rect x="50" y="90" width="50" height="12" fill="#0A0A0A" />
                    <path d="M115 90h40v12h-40zM128 77h14v38h-14z" fill="#0A0A0A" />
                    <text
                      x="200"
                      y="55"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="20"
                      fontWeight="700"
                      fill="#0A0A0A"
                    >
                      optile
                    </text>
                    <line x1="200" y1="60" x2="260" y2="60" stroke="#0A0A0A" strokeWidth="2" />
                    <circle cx="385" cy="50" r="18" fill="none" stroke="#0A0A0A" strokeWidth="2" />
                    <path
                      d="M380 42Q390 42 390 50Q390 58 380 58"
                      fill="none"
                      stroke="#0A0A0A"
                      strokeWidth="2"
                    />
                    <text
                      x="412"
                      y="56"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="16"
                      fontWeight="700"
                      fill="#0A0A0A"
                    >
                      RATP
                    </text>
                    <rect x="530" y="32" width="90" height="36" rx="6" fill="#0A0A0A" />
                    <text
                      x="550"
                      y="57"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="20"
                      fontWeight="900"
                      fill="#FFFFFF"
                    >
                      SNCF
                    </text>
                    <g fill="#0A0A0A">
                      <circle cx="215" cy="100" r="18" />
                      <circle cx="290" cy="100" r="18" />
                      <circle cx="365" cy="100" r="18" />
                      <circle cx="440" cy="100" r="18" />
                    </g>
                    <g
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      <text x="215" y="100" fontSize="10">
                        BUS
                      </text>
                      <text x="290" y="100" fontSize="14">
                        T
                      </text>
                      <text x="365" y="100" fontSize="14">
                        M
                      </text>
                      <text x="440" y="100" fontSize="10">
                        RER
                      </text>
                    </g>
                    <text
                      x="470"
                      y="96"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="11"
                      fill="#0A0A0A"
                    >
                      dans
                    </text>
                    <text
                      x="470"
                      y="110"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="11"
                      fontWeight="700"
                      fill="#0A0A0A"
                    >
                      Paris
                    </text>
                    <g fill="#0075C9" fontFamily="Arial, Helvetica, sans-serif">
                      <text x="40" y="195" fontSize="18" fontWeight="700">
                        Île-de-France
                      </text>
                      <text x="40" y="210" fontSize="11">
                        mobilités
                      </text>
                      <text x="360" y="195" fontSize="18" fontWeight="700">
                        Île-de-France
                      </text>
                      <text x="360" y="210" fontSize="11">
                        mobilités
                      </text>
                    </g>
                    <rect x="180" y="180" width="32" height="32" rx="4" fill="#0075C9" />
                    <text
                      x="196"
                      y="203"
                      textAnchor="middle"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="20"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      +
                    </text>
                    <rect x="500" y="180" width="32" height="32" rx="4" fill="#0075C9" />
                    <text
                      x="516"
                      y="203"
                      textAnchor="middle"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="20"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      +
                    </text>
                    <text
                      x="40"
                      y="248"
                      fontFamily="Courier New, monospace"
                      fontSize="16"
                      fontWeight="700"
                      fill="#0A0A0A"
                      letterSpacing="2"
                    >
                      02070341 A 1111 A16
                    </text>
                    <text
                      x="440"
                      y="248"
                      fontFamily="Courier New, monospace"
                      fontSize="16"
                      fontWeight="700"
                      fill="#0A0A0A"
                      letterSpacing="2"
                    >
                      EUR 1,90 CB
                    </text>
                  </svg>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 text-body-2-regular text-text-secondary">
                <p>
                  <strong className="font-semibold text-text-primary">Source temps réel :</strong>{' '}
                  {cityConfig
                    ? getRealtimeLabel(cityConfig.id, cityConfig.realtime.provider)
                    : 'Simulation cinématique'}
                </p>
                {cityConfig?.attribution ? (
                  <p>
                    <strong className="font-semibold text-text-primary">Données réseau :</strong>{' '}
                    {cityConfig.attribution.operatorName} ({cityConfig.attribution.licenseText})
                  </p>
                ) : null}
                <p>
                  Fond vectoriel OpenFreeMap · Bâtiments 3D Overture Maps · Modèles de rames 3D
                  articulés sur géométrie ferroviaire réelle.
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <a
                href="/methode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-body-2-medium text-accent-500 hover:underline"
              >
                Documentation technique
                <RiExternalLinkLine className="size-3.5" aria-hidden />
              </a>
              <Button variant="secondary" size="small" onClick={close}>
                Fermer
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Modale Records du réseau */}
      <Modal
        isOpen={activeModal === 'records'}
        onOpenChange={(open) => {
          if (!open) uiStore.setActiveModal(null);
        }}
        size="lg"
      >
        {({ close }) => (
          <>
            <ModalHeader
              icon={RiTrophyLine}
              title="Records du réseau"
              description="Classement des stations par nombre de passages quotidiens planifiés"
            />
            <ModalBody>
              <Tabs defaultSelectedKey="weekday">
                <TabList aria-label="Période des records">
                  <Tab id="weekday">Semaine</Tab>
                  <Tab id="saturday">Samedi</Tab>
                  <Tab id="sunday">Dimanche</Tab>
                </TabList>
                {(['weekday', 'saturday', 'sunday'] as const).map((dayKey) => {
                  const rows = byStation[dayKey] ?? [];
                  const top5 = rows.slice(0, 5);
                  const bottom5 = rows.slice(-5).reverse();
                  return (
                    <TabPanel key={dayKey} id={dayKey} className="grid gap-4 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-separator-border bg-background-secondary-default/65 p-3">
                        <div className="truncate text-body-2-medium text-text-primary">
                          Stations les plus fréquentées
                        </div>
                        <ol className="flex flex-col gap-1.5">
                          {top5.map((row, index) => (
                            <li
                              key={`${dayKey}-top-${row.station_name}`}
                              className="flex min-w-0 items-center justify-between gap-2 text-body-2-regular"
                            >
                              <span className="min-w-0 flex-1 truncate text-text-secondary">
                                <span className="me-1.5 font-mono text-caption-1-semibold text-text-tertiary">
                                  #{index + 1}
                                </span>
                                {row.station_name}
                              </span>
                              <Chip
                                color="lime"
                                variant="caption"
                                className="shrink-0 tabular-nums"
                              >
                                {Number(row.counts?.[dayKey] || 0).toLocaleString('fr-FR')}/j
                              </Chip>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-separator-border bg-background-secondary-default/65 p-3">
                        <div className="truncate text-body-2-medium text-text-primary">
                          Stations les plus calmes
                        </div>
                        <ol className="flex flex-col gap-1.5">
                          {bottom5.map((row, index) => (
                            <li
                              key={`${dayKey}-bot-${row.station_name}`}
                              className="flex min-w-0 items-center justify-between gap-2 text-body-2-regular"
                            >
                              <span className="min-w-0 flex-1 truncate text-text-secondary">
                                <span className="me-1.5 font-mono text-caption-1-semibold text-text-tertiary">
                                  #{index + 1}
                                </span>
                                {row.station_name}
                              </span>
                              <Chip
                                color="soft"
                                variant="caption"
                                className="shrink-0 tabular-nums"
                              >
                                {Number(row.counts?.[dayKey] || 0).toLocaleString('fr-FR')}/j
                              </Chip>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </TabPanel>
                  );
                })}
              </Tabs>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" size="small" onClick={close}>
                Fermer
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Modale Méthode */}
      <Modal
        isOpen={activeModal === 'method'}
        onOpenChange={(open) => {
          if (!open) uiStore.setActiveModal(null);
        }}
        size="md"
      >
        {({ close }) => (
          <>
            <ModalHeader
              icon={RiPulseLine}
              title="Méthode & Simulation"
              description="Comment les positions de rames et les prochains passages sont calculés"
            />
            <ModalBody className="flex flex-col gap-3 text-body-2-regular text-text-secondary">
              <p>
                <strong className="font-semibold text-text-primary">
                  1. Modèle physique continu :
                </strong>{' '}
                Chaque rame suit une courbe cinématique (accélération, vitesse de croisière,
                freinage et temps d’arrêt à quai) projetée sur le tracé métrique exact GTFS.
              </p>
              <Divider />
              <p>
                <strong className="font-semibold text-text-primary">
                  2. Recalage temps réel :
                </strong>{' '}
                Lorsque le flux temps réel (PRIM / GTFS-RT) est actif, les horaires mesurés et
                encadrés calibrent la ligne de temps du trajet tout en conservant une animation
                fluide.
              </p>
              <Divider />
              <p>
                <strong className="font-semibold text-text-primary">3. Rendu 3D fidèle :</strong>{' '}
                Les caisses articulées suivent la courbure réelle des rails via l’empattement de
                bogies du matériel roulant (MP 89, MP 05, MF 01, RER NG, MI 09…).
              </p>
            </ModalBody>
            <ModalFooter>
              <a
                href="/methode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-body-2-medium text-accent-500 hover:underline"
              >
                Lire la page méthode complète
                <RiExternalLinkLine className="size-3.5" aria-hidden />
              </a>
              <Button variant="secondary" size="small" onClick={close}>
                Fermer
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Modale Réglages */}
      <Modal
        isOpen={activeModal === 'settings'}
        onOpenChange={(open) => {
          if (!open) uiStore.setActiveModal(null);
        }}
        size="md"
      >
        {({ close }) => {
          const osDark =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches;
          return (
            <>
              <ModalHeader
                icon={RiSettings3Line}
                title="Réglages"
                description="Apparence synchronisée avec votre appareil et options d’affichage"
              />
              <ModalBody className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-body-medium text-text-primary">Thème de l’interface</span>
                    <span className="text-caption-1-medium text-text-tertiary">
                      {theme === 'dark' ? 'Sombre actif' : 'Clair actif'}
                    </span>
                  </div>
                  <SegmentedControl
                    aria-label="Choix du thème clair, sombre ou système"
                    selectedKeys={[themePreference]}
                    onSelectionChange={(keys) => {
                      const next = keys.values().next().value as ThemePreference | undefined;
                      if (next === 'system' || next === 'light' || next === 'dark') {
                        handlers.onSetThemePreference?.(next);
                      }
                    }}
                    className="w-full max-w-full overflow-hidden"
                  >
                    <SegmentedControlItem id="system" className="min-w-0 flex-1 overflow-hidden">
                      <span className="truncate">Système</span>
                    </SegmentedControlItem>
                    <SegmentedControlItem id="light" className="min-w-0 flex-1 overflow-hidden">
                      <span className="truncate">Clair</span>
                    </SegmentedControlItem>
                    <SegmentedControlItem id="dark" className="min-w-0 flex-1 overflow-hidden">
                      <span className="truncate">Sombre</span>
                    </SegmentedControlItem>
                  </SegmentedControl>
                  <p className="text-caption-1-regular text-text-tertiary">
                    Mode détecté sur cet appareil : {osDark ? 'Sombre' : 'Clair'}. En mode Système,
                    la carte bascule automatiquement avec votre téléphone ou ordinateur.
                  </p>
                </div>

                <Divider />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-body-medium text-text-primary">Mode Passionné</div>
                      <p className="text-caption-1-regular text-text-tertiary">
                        Affiche la télémétrie en direct, le matériel roulant et les intervalles.
                      </p>
                    </div>
                    <Switch
                      size="sm"
                      isSelected={expertMode}
                      onChange={(selected) => uiStore.setExpertMode(selected)}
                      aria-label="Activer le mode Passionné"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-body-medium text-text-primary">Bâtiments 3D</div>
                      <p className="text-caption-1-regular text-text-tertiary">
                        Affiche le bâti urbain autour des stations et lignes aériennes.
                      </p>
                    </div>
                    <Switch
                      size="sm"
                      isSelected={buildingsVisible}
                      onChange={() => handlers.onToggleBuildings?.()}
                      aria-label="Afficher les bâtiments 3D"
                    />
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="primary" size="small" onClick={close}>
                  Terminer
                </Button>
              </ModalFooter>
            </>
          );
        }}
      </Modal>
    </>
  );
}
