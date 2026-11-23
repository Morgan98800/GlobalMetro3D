import { normalizeStopName } from '@core/rt/stop_names';
import type { TripData } from './kinematics';
import type { SchedTrip } from '@core/rt/rt_matching';

export interface StopTripRef {
  tripIndex: number;
  stopIndex: number;
}

export interface ScheduleWorkerRequest {
  id: number;
  url: string;
}

export interface ScheduleWorkerResponse {
  id: number;
  ok: boolean;
  error?: string;
  stationNames?: string[];
  trips?: TripData[];
  schedTrips?: SchedTrip[];
  stopTripsEntries?: Array<[string, StopTripRef[]]>;
}

self.onmessage = async (ev: MessageEvent<ScheduleWorkerRequest>) => {
  const { id, url } = ev.data;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const scheduleData = await res.json();
    const stationNames: string[] = scheduleData.stations || [];
    const normalizedStations = stationNames.map((n) => normalizeStopName(n || 'Station'));
    const rawTrips: any[] = scheduleData.trips || [];

    const trips: TripData[] = new Array(rawTrips.length);
    const schedTrips: SchedTrip[] = new Array(rawTrips.length);
    const stopIndex = new Map<string, StopTripRef[]>();

    for (let tripIndex = 0; tripIndex < rawTrips.length; tripIndex++) {
      const t = rawTrips[tripIndex];
      const destName = stationNames[t[6]] || 'Terminus';
      const rawStops: any[] = t[7];
      const stopLen = rawStops.length;
      const stops: Array<[number, number, number, string]> = new Array(stopLen);
      const schedStops: SchedTrip['stops'] = new Array(stopLen);

      for (let i = 0; i < stopLen; i++) {
        const s = rawStops[i];
        const stationIdx = s[3] as number;
        const name = stationNames[stationIdx] || 'Station';
        const stopId = normalizedStations[stationIdx] || 'station';
        stops[i] = [s[0], s[1], s[2], name];
        schedStops[i] = { stopId, arr: s[0], dep: s[1], dist: s[2] };

        if (i < stopLen - 1 && stopId) {
          let list = stopIndex.get(stopId);
          if (!list) {
            list = [];
            stopIndex.set(stopId, list);
          }
          list.push({ tripIndex, stopIndex: i });
        }
      }

      const tripId = t[0];
      const lineId = t[1];
      const dir = (t[2] === 0 ? 0 : 1) as 0 | 1;
      const shapeId = t[3];

      schedTrips[tripIndex] = {
        tripId,
        lineId,
        dir,
        shapeId,
        stops: schedStops,
      };

      trips[tripIndex] = {
        id: tripId,
        line: lineId,
        dir,
        shapeId,
        t0: t[4],
        t1: t[5],
        destName,
        stops,
      };
    }

    const msg: ScheduleWorkerResponse = {
      id,
      ok: true,
      stationNames,
      trips,
      schedTrips,
      stopTripsEntries: Array.from(stopIndex.entries()),
    };
    self.postMessage(msg);
  } catch (err) {
    const msg: ScheduleWorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
