import { haversineDistanceM } from './nearby_stations';

export interface PlaceCandidate {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  coordinates: [number, number];
  source: 'ban' | 'photon';
  distanceM?: number;
}

export interface PlaceSearchOptions {
  cityId?: string;
  center?: [number, number];
  limit?: number;
  signal?: AbortSignal;
}

const SEARCH_CACHE = new Map<string, PlaceCandidate[]>();

const CITY_BBOX: Record<string, [number, number, number, number]> = {
  paris: [2.12, 48.72, 2.58, 48.96],
  lille: [2.95, 50.56, 3.22, 50.73],
  london: [-0.42, 51.34, 0.18, 51.66],
  montreal: [-73.85, 45.4, -73.42, 45.66],
  washington: [-77.38, 38.72, -76.78, 39.12],
  berlin: [13.15, 52.38, 13.68, 52.64],
  edinburgh: [-3.36, 55.87, -3.05, 56.0],
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function photonCategoryLabel(osmKey?: string, osmValue?: string, type?: string): string {
  const val = (osmValue || type || osmKey || '').toLowerCase();
  if (val === 'restaurant' || val === 'fast_food') return 'Restaurant';
  if (val === 'cafe' || val === 'bakery' || val === 'pastry') return 'Café & Boulangerie';
  if (val === 'bar' || val === 'pub') return 'Bar';
  if (val === 'museum' || val === 'gallery') return 'Musée';
  if (val === 'attraction' || val === 'monument' || val === 'viewpoint') return 'Lieu & Monument';
  if (val === 'hotel' || val === 'hostel') return 'Hôtel';
  if (val === 'hospital' || val === 'clinic') return 'Santé';
  if (val === 'university' || val === 'school' || val === 'college') return 'Éducation';
  if (val === 'park' || val === 'garden') return 'Parc & Jardin';
  if (val === 'house' || val === 'street' || osmKey === 'highway') return 'Adresse';
  return 'Lieu';
}

function formatPhotonSubtitle(props: Record<string, unknown>): string {
  const street = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
  const district = (props.district || props.suburb || '') as string;
  const city = (props.city || props.locality || props.town || '') as string;
  const postcode = (props.postcode || '') as string;
  const cityLine = [postcode, city].filter(Boolean).join(' ').trim();
  const parts = [street, district && district !== city ? district : '', cityLine].filter(Boolean);
  return parts.join(' · ') || ((props.country as string) ?? '');
}

async function queryPhoton(query: string, opts: PlaceSearchOptions): Promise<PlaceCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(opts.limit ?? 6),
    lang: 'fr',
  });
  if (opts.center) {
    params.set('lon', opts.center[0].toFixed(4));
    params.set('lat', opts.center[1].toFixed(4));
  }
  const bbox = opts.cityId ? CITY_BBOX[opts.cityId] : undefined;
  if (bbox) {
    params.set('bbox', bbox.join(','));
  }

  const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    signal: opts.signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, unknown>;
    }>;
  };
  const features = data.features ?? [];
  const results: PlaceCandidate[] = [];
  for (let i = 0; i < features.length; i += 1) {
    const f = features[i];
    const coords = f.geometry?.coordinates;
    const props = f.properties ?? {};
    if (!coords || coords.length < 2) continue;
    const name =
      (props.name as string) ||
      [props.housenumber, props.street].filter(Boolean).join(' ').trim() ||
      (props.city as string) ||
      '';
    if (!name) continue;
    const coordinates: [number, number] = [coords[0], coords[1]];
    results.push({
      id: `photon:${props.osm_id ?? i}:${coordinates[0].toFixed(5)}:${coordinates[1].toFixed(5)}`,
      name,
      subtitle: formatPhotonSubtitle(props),
      category: photonCategoryLabel(
        props.osm_key as string | undefined,
        props.osm_value as string | undefined,
        props.type as string | undefined
      ),
      coordinates,
      source: 'photon',
      distanceM: opts.center ? haversineDistanceM(opts.center, coordinates) : undefined,
    });
  }
  return results;
}

async function queryFrenchBan(query: string, opts: PlaceSearchOptions): Promise<PlaceCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(5, opts.limit ?? 5)),
  });
  if (opts.center) {
    params.set('lon', opts.center[0].toFixed(4));
    params.set('lat', opts.center[1].toFixed(4));
  }
  const res = await fetch(`https://api-adresse.data.gouv.fr/search/?${params.toString()}`, {
    signal: opts.signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        id?: string;
        name?: string;
        label?: string;
        context?: string;
        postcode?: string;
        city?: string;
        type?: string;
      };
    }>;
  };
  const features = data.features ?? [];
  const results: PlaceCandidate[] = [];
  for (let i = 0; i < features.length; i += 1) {
    const f = features[i];
    const coords = f.geometry?.coordinates;
    const p = f.properties;
    if (!coords || coords.length < 2 || !p?.name) continue;
    const coordinates: [number, number] = [coords[0], coords[1]];
    const distanceM = opts.center ? haversineDistanceM(opts.center, coordinates) : undefined;
    if (distanceM !== undefined && distanceM > 65_000) continue;
    const subtitle = [p.postcode, p.city].filter(Boolean).join(' ').trim() || p.label || '';
    results.push({
      id: `ban:${p.id ?? i}`,
      name: p.name,
      subtitle,
      category: p.type === 'housenumber' || p.type === 'street' ? 'Adresse' : 'Lieu',
      coordinates,
      source: 'ban',
      distanceM,
    });
  }
  return results;
}

function deduplicatePlaces(candidates: PlaceCandidate[], max: number): PlaceCandidate[] {
  const kept: PlaceCandidate[] = [];
  for (const item of candidates) {
    const norm = normalizeText(item.name);
    const duplicate = kept.some(
      (existing) =>
        normalizeText(existing.name) === norm &&
        haversineDistanceM(existing.coordinates, item.coordinates) < 90
    );
    if (!duplicate) {
      kept.push(item);
      if (kept.length >= max) break;
    }
  }
  return kept;
}

/**
 * Search real-world addresses, restaurants, landmarks and POIs around the active city.
 * Combines OpenStreetMap Photon and (for French networks) the official BAN geocoder.
 */
export async function searchPlaces(
  rawQuery: string,
  opts: PlaceSearchOptions = {}
): Promise<PlaceCandidate[]> {
  const query = rawQuery.trim();
  if (query.length < 3) return [];

  const cityKey = opts.cityId ?? 'paris';
  const cacheKey = `${cityKey}:${normalizeText(query)}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached) return cached;

  const isFrenchCity = cityKey === 'paris' || cityKey === 'lille';
  const jobs: Promise<PlaceCandidate[]>[] = [queryPhoton(query, opts)];
  if (isFrenchCity) {
    jobs.push(queryFrenchBan(query, opts));
  }

  const settled = await Promise.allSettled(jobs);
  const merged: PlaceCandidate[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      merged.push(...result.value);
    }
  }

  // Prefer named POIs/restaurants (Photon) alongside exact addresses, keeping nearby matches first
  merged.sort((a, b) => {
    const da = a.distanceM ?? 50_000;
    const db = b.distanceM ?? 50_000;
    const aInCity = da <= 25_000 ? 0 : 1;
    const bInCity = db <= 25_000 ? 0 : 1;
    if (aInCity !== bInCity) return aInCity - bInCity;
    if (a.category !== 'Adresse' && b.category === 'Adresse') return -1;
    if (b.category !== 'Adresse' && a.category === 'Adresse') return 1;
    return da - db;
  });

  const finalResults = deduplicatePlaces(merged, opts.limit ?? 8);
  if (finalResults.length > 0) {
    if (SEARCH_CACHE.size > 80) {
      const oldest = SEARCH_CACHE.keys().next().value;
      if (oldest) SEARCH_CACHE.delete(oldest);
    }
    SEARCH_CACHE.set(cacheKey, finalResults);
  }
  return finalResults;
}
