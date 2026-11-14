import type { StationMetadata } from '@core/types';

export interface NearbyStationResult {
  station: StationMetadata;
  distanceM: number;
  walkMinutes: number;
}

const EARTH_RADIUS_M = 6371000;
const WALK_SPEED_M_PER_MIN = 75; // ~4,5 km/h

export function haversineDistanceM(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function findNearbyStations(
  stations: readonly StationMetadata[],
  coords: [number, number],
  limit = 4
): NearbyStationResult[] {
  const ranked: NearbyStationResult[] = [];
  for (const station of stations) {
    if (!station.coordinates || station.coordinates.length < 2) continue;
    const distanceM = Math.round(haversineDistanceM(coords, station.coordinates));
    const walkMinutes = Math.max(1, Math.round(distanceM / WALK_SPEED_M_PER_MIN));
    ranked.push({ station, distanceM, walkMinutes });
  }
  ranked.sort((a, b) => a.distanceM - b.distanceM);
  return ranked.slice(0, Math.max(0, limit));
}
