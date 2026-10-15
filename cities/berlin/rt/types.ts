import type { LineTrafficReport } from '@core/types';

export interface BerlinTripDescriptor {
  tripId: string;
  routeId: string;
  directionId?: number;
  startTime?: string;
  startDate?: string;
}

export interface BerlinStopTimeEvent {
  time?: number;
  delay?: number;
  uncertainty?: number;
}

export interface BerlinStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: BerlinStopTimeEvent;
  departure?: BerlinStopTimeEvent;
  scheduleRelationship?: number;
}

export interface BerlinTripUpdate {
  id: string;
  trip: BerlinTripDescriptor;
  timestamp?: number;
  delay?: number;
  stopTimeUpdates: BerlinStopTimeUpdate[];
}

export interface BerlinStats {
  totalEntitiesInFeed: number;
  retainedEntities: number;
  uBahnCount: number;
}

export interface BerlinSnapshot {
  producedAt: string;
  timestamp: number;
  validUntil: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  tripUpdates: BerlinTripUpdate[];
  trafficByLine: Record<string, LineTrafficReport>;
  stats: BerlinStats;
}

export interface BerlinStatus {
  active: boolean;
  lastUpdate: number | null;
  minutesAgo?: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  trafficByLine: Record<string, LineTrafficReport>;
  coveragePct?: number;
  matchedCount?: number;
  totalReceivedCount?: number;
  discardedNonMonotonicCount?: number;
}
