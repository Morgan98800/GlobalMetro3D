import type { CityConfig } from '@core/config';
import { parisConfig } from './paris/city.config';
import { montrealConfig } from './montreal/city.config';

export const CITIES: CityConfig[] = [parisConfig, montrealConfig];

export const CITIES_BY_ID: Record<string, CityConfig> = {
  paris: parisConfig,
  montreal: montrealConfig
};

export function getCityConfig(idOrSlug: string = 'paris'): CityConfig {
  const normalized = idOrSlug.toLowerCase().trim();
  return CITIES_BY_ID[normalized] || parisConfig;
}
