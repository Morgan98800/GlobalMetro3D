export type ParisRideViewMode = 'ride' | 'vault' | 'passenger';

export interface AppUrlState {
  line?: string | null;
  station?: string | null;
  ride?: boolean;
  view?: ParisRideViewMode | null;
}

const VALID_VIEWS = new Set<ParisRideViewMode>(['ride', 'vault', 'passenger']);

function isValidView(value: string): value is ParisRideViewMode {
  return VALID_VIEWS.has(value as ParisRideViewMode);
}

/**
 * Parse supported deep-link query parameters from a URL search string.
 */
export function parseAppUrlState(search: string): AppUrlState {
  const sp = new URLSearchParams(search);
  const state: AppUrlState = {};

  const line = sp.get('line')?.trim();
  if (line) {
    state.line = line;
  }

  const station = sp.get('station')?.trim();
  if (station) {
    state.station = station;
  }

  const ride = sp.get('ride')?.trim().toLowerCase();
  if (ride === '1' || ride === 'true') {
    state.ride = true;
  }

  const view = sp.get('view')?.trim();
  if (view && isValidView(view)) {
    state.view = view;
  }

  return state;
}

/**
 * Merge a partial AppUrlState patch onto an existing URL search string while
 * preserving unrelated parameters such as ?from, ?to, ?rt, ?dir, and ?demo-rer.
 */
export function mergeAppUrlParams(currentSearch: string, patch: Partial<AppUrlState>): string {
  const sp = new URLSearchParams(currentSearch);

  if ('line' in patch) {
    const line = patch.line?.trim();
    if (line) {
      sp.set('line', line);
    } else {
      sp.delete('line');
    }
  }

  if ('station' in patch) {
    const station = patch.station?.trim();
    if (station) {
      sp.set('station', station);
    } else {
      sp.delete('station');
    }
  }

  if ('ride' in patch) {
    if (patch.ride === true) {
      sp.set('ride', '1');
    } else {
      sp.delete('ride');
    }
  }

  if ('view' in patch) {
    const view = patch.view?.trim();
    if (view && isValidView(view)) {
      sp.set('view', view);
    } else {
      sp.delete('view');
    }
  }

  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}
