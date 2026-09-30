import type { LineTrafficReport } from '@core/types';

export interface IleviaTripDescriptor {
  tripId: string;
  routeId: string;
  directionId?: number;
  startTime?: string;
  startDate?: string;
}

export interface IleviaStopTimeEvent {
  time?: number;
  delay?: number;
  uncertainty?: number;
}

export interface IleviaStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: IleviaStopTimeEvent;
  departure?: IleviaStopTimeEvent;
}

export interface IleviaTripUpdate {
  id: string;
  trip: IleviaTripDescriptor;
  timestamp?: number;
  delay?: number;
  stopTimeUpdates: IleviaStopTimeUpdate[];
}

export interface IleviaStats {
  totalEntitiesInFeed: number;
  retainedEntities: number;
  metroCount: number;
  tramCount: number;
}

export interface IleviaSnapshot {
  producedAt: string;
  timestamp: number;
  validUntil: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  tripUpdates: IleviaTripUpdate[];
  trafficByLine: Record<string, LineTrafficReport>;
  stats: IleviaStats;
}
