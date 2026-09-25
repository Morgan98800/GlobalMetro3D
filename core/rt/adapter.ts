import type { SchedTrip, Timeline } from './rt_matching';
import type { LineTrafficReport } from '@core/types';

/**
 * Contrat entre le moteur de simulation et la couche temps réel d'une ville.
 *
 * Le moteur ne connaît que cette interface. Il ignore quelle ville, quel
 * fournisseur ou quelle capacité se trouve derrière : chaque ville fournit son
 * adaptateur depuis `cities/<ville>/rt/`, et le registre `cities/realtime.ts`
 * choisit lequel instancier à partir de la valeur `realtime.provider` du config.
 *
 * Règle : aucun code de `core/` n'importe un adaptateur concret.
 */
export interface RealtimeStatusBase {
  active: boolean;
}

/** Ce que le moteur expose à l'adaptateur à chaque tick de simulation (1 Hz). */
export interface RealtimeTickContext {
  now: Date;
  /** Secondes écoulées depuis minuit, heure locale de la ville. */
  civilSeconds: number;
  /** Courses théoriques actives à cet instant. */
  activeSchedTrips: readonly SchedTrip[];
  /** Toutes les courses théoriques connues, par identifiant. */
  schedTripsById: ReadonlyMap<string, SchedTrip>;
  /**
   * Chronologies par course, possédées par le moteur. L'adaptateur les crée ou
   * les met à jour ; le moteur construit une chronologie théorique pour toute
   * course active qui n'en a pas.
   */
  timelines: Map<string, Timeline>;
}

export interface RealtimeTickResult {
  /**
   * Courses à masquer (trains fantômes). Si l'adaptateur renvoie un ensemble,
   * il remplace intégralement l'ensemble courant, et le moteur fait disparaître
   * en fondu celles qui viennent d'y entrer. S'il ne renvoie rien, l'ensemble
   * courant reste inchangé.
   */
  suppressedTripIds?: Set<string>;
}

export interface RealtimeAdapter<TStatus extends RealtimeStatusBase = RealtimeStatusBase> {
  startPolling(lineIds: string[], getFocusedLineId: () => string | null): void;
  stopPolling(): void;
  getStatus(): TStatus;
  onUpdate(callback: (status: TStatus) => void): void;
  /** État de service par ligne ; une ligne interrompue n'affiche plus de rames. */
  getTrafficByLine(): Record<string, LineTrafficReport>;
  /**
   * Recalage à chaque tick. Absent pour une ville dont la seule capacité est
   * l'état de service. N'est appelé que si `getStatus().active` est vrai.
   */
  applyTick?(ctx: RealtimeTickContext): RealtimeTickResult | void;
  /** Oublie l'état accumulé ; appelé quand le temps réel est arrêté. */
  reset?(): void;
}
