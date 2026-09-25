import type { RealtimeAdapter } from '@core/rt/adapter';
import type { CityConfig, CityRealtimeConfig, RealtimeProvider } from '@core/config';
import { PrimRealtimeAdapter } from './paris/rt/prim_adapter';
import { StmRealtimeAdapter } from './montreal/rt/stm_adapter';
import { TflRealtimeAdapter } from './london/rt/tfl_adapter';

/**
 * Registre des adaptateurs temps réel.
 *
 * Seul endroit du projet qui associe un fournisseur à son implémentation. Le
 * moteur (`core/sim`) reçoit un adaptateur déjà construit et ne sait pas lequel.
 * Ajouter une ville : écrire son adaptateur dans `cities/<ville>/rt/`, ajouter
 * une entrée ici. Aucune modification de `core/`.
 */
type AdapterFactory = (config: CityRealtimeConfig, apiKey?: string) => RealtimeAdapter;

const FACTORIES: Partial<Record<RealtimeProvider, AdapterFactory>> = {
  'prim': (config, apiKey) => new PrimRealtimeAdapter(config, apiKey),
  'stm-i3': (config) => new StmRealtimeAdapter(config),
  'tfl-unified': (config) => new TflRealtimeAdapter(config)
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
  return factory(city.realtime, apiKey);
}
