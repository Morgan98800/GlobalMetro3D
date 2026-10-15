import type { RealtimeAdapter } from '@core/rt/adapter';
import type { CityConfig, CityRealtimeConfig, RealtimeProvider } from '@core/config';
import { PrimRealtimeAdapter } from './paris/rt/prim_adapter';
import { StmRealtimeAdapter } from './montreal/rt/stm_adapter';
import { TflRealtimeAdapter } from './london/rt/tfl_adapter';
import { IleviaRealtimeAdapter } from './lille/rt/ilevia_adapter';
import { WashingtonRealtimeAdapter } from './washington/rt/washington_adapter';
import { VbbRealtimeAdapter } from './berlin/rt/vbb_adapter';

/**
 * Registre des adaptateurs temps réel.
 *
 * Seul endroit du projet qui associe un fournisseur à son implémentation. Le
 * moteur (`core/sim`) reçoit un adaptateur déjà construit et ne sait pas lequel.
 * Ajouter une ville : écrire son adaptateur dans `cities/<ville>/rt/`, ajouter
 * une entrée ici. Aucune modification de `core/`.
 */
type AdapterFactory = (config: CityRealtimeConfig, apiKey?: string, city?: CityConfig) => RealtimeAdapter;

const FACTORIES: Partial<Record<RealtimeProvider | 'ilevia-gtfsrt' | 'wmata-gtfsrt' | 'vbb-gtfsrt', AdapterFactory>> = {
  'prim': (config, apiKey) => new PrimRealtimeAdapter(config, apiKey),
  'stm-i3': (config) => new StmRealtimeAdapter(config),
  'tfl-unified': (config) => new TflRealtimeAdapter(config),
  'gtfs-rt': (config, apiKey, city) => {
    if (city?.id === 'washington') return new WashingtonRealtimeAdapter(config);
    if (city?.id === 'berlin') return new VbbRealtimeAdapter(config);
    return new IleviaRealtimeAdapter(config);
  },
  'ilevia-gtfsrt': (config) => new IleviaRealtimeAdapter(config),
  'wmata-gtfsrt': (config) => new WashingtonRealtimeAdapter(config),
  'vbb-gtfsrt': (config) => new VbbRealtimeAdapter(config)
};

/** Adaptateur inerte : mode purement théorique, aucune requête. */
class NoRealtimeAdapter implements RealtimeAdapter {
  startPolling(): void {}
  stopPolling(): void {}
  getStatus() { return { active: false }; }
  onUpdate(): void {}
  getTrafficByLine() { return {}; }
}

export function createRealtimeAdapter(city: CityConfig, apiKey?: string): RealtimeAdapter {
  const factory = FACTORIES[city.realtime.provider];
  if (!factory) {
    if (city.realtime.provider !== 'none') {
      console.warn(
        `[realtime] Aucun adaptateur pour le fournisseur « ${city.realtime.provider} » ` +
        `(ville ${city.id}) : repli sur le mode théorique.`
      );
    }
    return new NoRealtimeAdapter();
  }
  return factory(city.realtime, apiKey, city);
}
