import { useSyncExternalStore } from 'react';
import type { CityConfig } from '@core/config';
import type { ServiceStatus, StationDeparture } from '@core/sim/browser_engine';
import type { RollingStockDatabase } from '@core/sim/rolling_stock';
import type { LineMetadata, LineTrafficReport, StationMetadata } from '@core/types';
import type { LineLadderData } from '@core/ui/components/station_ladder';
import type { TrainMarker } from '@core/ui/map/trains_layer';
import type { NearbyStationResult } from '@core/ui/utils/nearby_stations';
import type { PlaceCandidate } from '@core/ui/utils/geocoding';
import type { RoutePoint, TransitItinerary } from '@core/ui/utils/transit_router';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface UserLocationFix {
  lng: number;
  lat: number;
  accuracyM: number;
  headingDeg: number | null;
  updatedAt: number;
}

export interface SavedPlacesState {
  home: RoutePoint | null;
  work: RoutePoint | null;
  favorites: RoutePoint[];
}

export interface CityMenuItem {
  id: string;
  slug: string;
  displayName: string;
}

export type RealtimeUiState =
  | 'standby'
  | {
      active: boolean;
      delays?: Record<string, number>;
      minutesAgo?: number;
      degraded?: boolean;
      error?: string;
      stats?: {
        matched: number;
        total: number;
        matched_stop?: number;
        extrapolated?: number;
        matched_fallback?: number;
      };
    };

export type ActiveInfoModal = 'about' | 'records' | 'method' | 'settings' | null;
export type EdinburghPreset = 'waverley' | 'castle' | 'calton' | 'scotland' | 'overview';

export interface UiHandlers {
  onCitySelect?: (cityId: string) => void;
  onLineSelect?: (lineId: string | null, dir?: string) => void;
  onLineDirChange?: (lineId: string, dir: string) => void;
  onStationSelect?: (station: StationMetadata) => void;
  onStationZoom20?: (station: StationMetadata) => void;
  onTrainFollow?: (train: TrainMarker) => void;
  onTrainFollowById?: (tripId: string, lineId: string) => void;
  onStopFollow?: () => void;
  onToggleRealtime?: () => void;
  onSetThemePreference?: (pref: ThemePreference) => void;
  onTogglePitch?: () => void;
  onToggleBuildings?: () => void;
  onRecenter?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetNorth?: () => void;
  onOpenParisRide?: (opts?: {
    initialLine?: string;
    initialDest?: string;
    initialStation?: string;
    initialTrainId?: string;
    initialView?: 'ride' | 'vault';
  }) => void;
  onRequestNearby?: () => void;
  onSelectPlace?: (place: PlaceCandidate, routeFromUser?: boolean) => void;
  onOpenRoutePlanner?: (opts?: {
    origin?: RoutePoint | null;
    destination?: RoutePoint | null;
  }) => void;
  onComputeItinerary?: (origin: RoutePoint | null, destination: RoutePoint | null) => void;
  onSelectItineraryIndex?: (index: number) => void;
  onClearItinerary?: () => void;
  onToggleGpsFollow?: () => void;
  onEdinburghPreset?: (preset: EdinburghPreset) => void;
  onEdinburghFollow?: () => void;
}

export interface UiSnapshot {
  cityConfig: CityConfig | null;
  cities: CityMenuItem[];
  lines: LineMetadata[];
  stations: StationMetadata[];
  ladders: Record<string, LineLadderData>;
  rollingStockDb: RollingStockDatabase | null;
  stationRankings: Record<string, unknown> | null;
  trafficByLine: Record<string, LineTrafficReport>;
  trains: TrainMarker[];
  totalTrainCount: number;
  dailyKm: number;
  activeLineId: string | null;
  activeDir: string;
  selectedStation: StationMetadata | null;
  stationDepartures: StationDeparture[];
  nearbyOpen: boolean;
  nearbyLoading: boolean;
  nearbyError: string | null;
  nearbyStations: NearbyStationResult[];
  nearbyDepartures: Record<string, StationDeparture[]>;
  lineDrawerOpen: boolean;
  routePlannerOpen: boolean;
  routeOrigin: RoutePoint | null;
  routeDestination: RoutePoint | null;
  routeCandidates: TransitItinerary[];
  activeItineraryIndex: number;
  routeLoading: boolean;
  routeError: string | null;
  trackedTrain: TrainMarker | null;
  isFollowing: boolean;
  expertMode: boolean;
  themePreference: ThemePreference;
  theme: 'dark' | 'light';
  pitch3D: boolean;
  bearingDeg: number;
  buildingsVisible: boolean;
  recenterVisible: boolean;
  recenterLabel: string;
  serviceStatus: ServiceStatus | null;
  realtimeState: RealtimeUiState;
  realtimeEnabled: boolean;
  userLocation: UserLocationFix | null;
  gpsWatchActive: boolean;
  savedPlaces: SavedPlacesState;
  searchOpen: boolean;
  activeModal: ActiveInfoModal;
  stalenessWarning: string | null;
  handlers: UiHandlers;
}

const EXPERT_STORAGE_KEY = 'paris-subway-expert';
const THEME_PREF_STORAGE_KEY = 'paris-subway-theme-pref';
const SAVED_PLACES_STORAGE_KEY = 'paris-subway-saved-places-v1';

function readInitialSavedPlaces(): SavedPlacesState {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(SAVED_PLACES_STORAGE_KEY) : null;
    if (!raw) return { home: null, work: null, favorites: [] };
    const parsed = JSON.parse(raw) as Partial<SavedPlacesState>;
    return {
      home: parsed.home && Array.isArray(parsed.home.coordinates) ? parsed.home : null,
      work: parsed.work && Array.isArray(parsed.work.coordinates) ? parsed.work : null,
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((f) => f && Array.isArray(f.coordinates)).slice(0, 12)
        : [],
    };
  } catch {
    return { home: null, work: null, favorites: [] };
  }
}

function persistSavedPlaces(next: SavedPlacesState) {
  try {
    localStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

function readInitialThemePreference(): ThemePreference {
  try {
    const val =
      typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_PREF_STORAGE_KEY) : null;
    if (val === 'light' || val === 'dark' || val === 'system') return val;
  } catch {
    // Ignore storage failures
  }
  return 'system';
}

function readInitialExpertMode(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem(EXPERT_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

function readInitialTheme(): 'dark' | 'light' {
  if (typeof document !== 'undefined') {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  return 'dark';
}

let state: UiSnapshot = {
  cityConfig: null,
  cities: [],
  lines: [],
  stations: [],
  ladders: {},
  rollingStockDb: null,
  stationRankings: null,
  trafficByLine: {},
  trains: [],
  totalTrainCount: 0,
  dailyKm: 0,
  activeLineId: null,
  activeDir: '0',
  selectedStation: null,
  stationDepartures: [],
  nearbyOpen: false,
  nearbyLoading: false,
  nearbyError: null,
  nearbyStations: [],
  nearbyDepartures: {},
  lineDrawerOpen: false,
  routePlannerOpen: false,
  routeOrigin: null,
  routeDestination: null,
  routeCandidates: [],
  activeItineraryIndex: 0,
  routeLoading: false,
  routeError: null,
  trackedTrain: null,
  isFollowing: false,
  expertMode: readInitialExpertMode(),
  themePreference: readInitialThemePreference(),
  theme: readInitialTheme(),
  pitch3D: true,
  bearingDeg: 0,
  buildingsVisible: false,
  recenterVisible: false,
  recenterLabel: 'Recadrer sur le réseau de métro',
  serviceStatus: null,
  realtimeState: 'standby',
  realtimeEnabled: false,
  userLocation: null,
  gpsWatchActive: false,
  savedPlaces: readInitialSavedPlaces(),
  searchOpen: false,
  activeModal: null,
  stalenessWarning: null,
  handlers: {},
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export const uiStore = {
  getSnapshot(): UiSnapshot {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  patch(partial: Partial<UiSnapshot>) {
    state = { ...state, ...partial };
    emitChange();
  },

  setHandlers(handlers: UiHandlers) {
    state = { ...state, handlers: { ...state.handlers, ...handlers } };
    emitChange();
  },

  setExpertMode(enabled: boolean) {
    try {
      localStorage.setItem(EXPERT_STORAGE_KEY, String(enabled));
    } catch {
      // Ignore storage failures in restricted contexts
    }
    state = {
      ...state,
      expertMode: enabled,
      lineDrawerOpen: enabled ? true : state.lineDrawerOpen,
    };
    emitChange();
  },

  setSearchOpen(open: boolean) {
    state = { ...state, searchOpen: open };
    emitChange();
  },

  setLineDrawerOpen(open: boolean) {
    state = { ...state, lineDrawerOpen: open };
    emitChange();
  },

  setSelectedStation(station: StationMetadata | null, departures: StationDeparture[] = []) {
    state = {
      ...state,
      selectedStation: station,
      stationDepartures: departures,
      nearbyOpen: station ? false : state.nearbyOpen,
      routePlannerOpen: station ? false : state.routePlannerOpen,
    };
    emitChange();
  },

  setNearbyOpen(open: boolean) {
    state = {
      ...state,
      nearbyOpen: open,
      selectedStation: open ? null : state.selectedStation,
      routePlannerOpen: open ? false : state.routePlannerOpen,
    };
    emitChange();
  },

  setRoutePlannerOpen(open: boolean) {
    state = {
      ...state,
      routePlannerOpen: open,
      selectedStation: open ? null : state.selectedStation,
      nearbyOpen: open ? false : state.nearbyOpen,
    };
    emitChange();
  },

  setActiveModal(modal: ActiveInfoModal) {
    state = { ...state, activeModal: modal };
    emitChange();
  },

  setPresetPlace(slot: 'home' | 'work', place: RoutePoint | null) {
    const next: SavedPlacesState = {
      ...state.savedPlaces,
      [slot]: place,
    };
    persistSavedPlaces(next);
    state = { ...state, savedPlaces: next };
    emitChange();
  },

  toggleFavoritePlace(place: RoutePoint) {
    const exists = state.savedPlaces.favorites.some(
      (f) => f.label === place.label && f.kind === place.kind
    );
    const favorites = exists
      ? state.savedPlaces.favorites.filter(
          (f) => !(f.label === place.label && f.kind === place.kind)
        )
      : [place, ...state.savedPlaces.favorites].slice(0, 10);
    const next: SavedPlacesState = { ...state.savedPlaces, favorites };
    persistSavedPlaces(next);
    state = { ...state, savedPlaces: next };
    emitChange();
  },
};

export function useUiStore(): UiSnapshot {
  return useSyncExternalStore(uiStore.subscribe, uiStore.getSnapshot, uiStore.getSnapshot);
}
