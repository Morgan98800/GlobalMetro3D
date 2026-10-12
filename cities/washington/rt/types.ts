import type { LineTrafficReport } from '@core/types';

export interface WashingtonStopTimeEvent {
  delay?: number;
  time?: number;
  uncertainty?: number;
}

export interface WashingtonStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: WashingtonStopTimeEvent;
  departure?: WashingtonStopTimeEvent;
  scheduleRelationship?: number;
}

export interface WashingtonTripDescriptor {
  tripId: string;
  routeId: string;
  directionId?: number;
  startTime?: string;
  startDate?: string;
}

export interface WashingtonPosition {
  latitude: number;
  longitude: number;
  bearing?: number;
  odometer?: number;
  speed?: number;
}

export interface WashingtonVehicleDescriptor {
  id?: string;
  label?: string;
  licensePlate?: string; // Car count in WMATA (e.g. "8", "6")
}

export interface WashingtonTripUpdate {
  id: string;
  trip: WashingtonTripDescriptor;
  timestamp?: number;
  delay?: number;
  stopTimeUpdates: WashingtonStopTimeUpdate[];
}

export interface WashingtonVehiclePosition {
  id: string;
  trip?: WashingtonTripDescriptor;
  vehicle?: WashingtonVehicleDescriptor;
  position?: WashingtonPosition;
  currentStopSequence?: number;
  stopId?: string;
  currentStatus?: number;
  timestamp?: number;
  occupancyStatus?: number;
}

export interface WashingtonTrainUpdate {
  tripId: string;
  routeId: string;
  directionId: 0 | 1;
  vehicleId?: string;
  carCount?: number;
  delay?: number; // seconds
  latitude?: number;
  longitude?: number;
  bearing?: number;
  speed?: number;
  nextStationId?: string;
  nextStationName?: string;
  timeToNextStationS?: number;
  timestamp?: number;
}

export interface WashingtonStats {
  totalEntitiesInFeed: number;
  retainedEntities: number;
  redCount: number;
  vehiclePositionsCount?: number;
}

export interface WashingtonAIMPrediction {
  Car?: string;
  Destination?: string;
  DestinationCode?: string;
  DestinationName?: string;
  Group?: string;
  Line?: string;
  LocationCode?: string;
  LocationName?: string;
  Min?: string;
}

export interface WashingtonSnapshot {
  producedAt: string;
  timestamp: number;
  validUntil: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceStatus: 'active' | 'unavailable' | 'degraded';
  lastError: string | null;
  trains: WashingtonTrainUpdate[];
  tripUpdates: WashingtonTripUpdate[];
  trafficByLine: Record<string, LineTrafficReport>;
  stats: WashingtonStats;
  predictions?: WashingtonAIMPrediction[];
  dataSource?: 'gtfs-rt' | 'station-prediction' | 'fixture';
}

export interface WashingtonStatus {
  active: boolean;
  lastUpdate: number | null;
  minutesAgo?: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceStatus: 'active' | 'unavailable' | 'degraded';
  serviceMessage?: string;
  lastError: string | null;
  trafficByLine: Record<string, LineTrafficReport>;
  coveragePct?: number;
  matchedCount?: number;
  totalReceivedCount?: number;
  discardedNonMonotonicCount?: number;
  trainCount?: number;
}
