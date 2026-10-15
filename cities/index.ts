import type { CityConfig } from '@core/config';
import { parisConfig } from './paris/city.config';
import { montrealConfig } from './montreal/city.config';
import { londonConfig } from './london/city.config';
import { lilleConfig } from './lille/city.config';
import { washingtonConfig } from './washington/city.config';
import { berlinConfig } from './berlin/city.config';

export const CITIES: CityConfig[] = [parisConfig, montrealConfig, londonConfig, lilleConfig, washingtonConfig, berlinConfig];

export const CITIES_BY_ID: Record<string, CityConfig> = {
  paris: parisConfig,
  montreal: montrealConfig,
  london: londonConfig,
  londres: londonConfig,
  lille: lilleConfig,
  washington: washingtonConfig,
  dc: washingtonConfig,
  berlin: berlinConfig
};

export function getCityConfig(idOrSlug: string = 'paris'): CityConfig {
  const normalized = idOrSlug.toLowerCase().trim();
  return CITIES_BY_ID[normalized] || CITIES.find(c => c.slug === normalized) || parisConfig;
}
