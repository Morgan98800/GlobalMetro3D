import { loadShapes, Shape } from './shapes_loader';
import { getAdaptiveFrameIntervalMs } from '@core/ui/map/device_perf';
import type { ScheduleWorkerResponse } from './schedule_worker';

const DATA_REVISION = '20260910-09';
const dataUrl = (path: string) => `${path}?v=${DATA_REVISION}`;
import { TripData, getCoordAtDistance, getSmoothedBearing } from './kinematics';
import { normalizeStopName } from '@core/rt/stop_names';
import type { RealtimeAdapter } from '@core/rt/adapter';
import {
  buildTimeline,
  positionAt,
  clampSpeed,
  getKinematicProfile,
  type SchedTrip,
  type Timeline,
  type Confidence,
} from '@core/rt/rt_matching';
import { cityClock, selectActiveTrips, serviceCandidates } from './paris_time';
import type { TrainMarker } from '@core/ui/map/trains_layer';
import type { LineMetadata, LineTrafficReport } from '@core/types';
import type { CityConfig } from '@core/config';

export interface EngineEvents {
  onTick: (trains: TrainMarker[], activeCount: number) => void;
  onRender?: (trains: TrainMarker[], activeCount: number) => void;
  /** Conservé pour compatibilité ; équivalent à onRealtimeStatus. */
  onPrimStatus?: (status: any) => void;
  onRealtimeStatus?: (status: any) => void;
}

export type ServiceState = 'loading' | 'before_first' | 'active' | 'ended';

export interface ServiceStatus {
  state: ServiceState;
  firstMetroSeconds: number;
  firstMetroLabel: string;
  secondsUntilFirst: number;
  nowCivilSeconds: number;
}

export interface StationDeparture {
  tripId: string;
  lineId: string;
  lineShortName: string;
  colorHex: string;
  textColorHex: string;
  direction: 0 | 1;
  destName: string;
  arrivalSeconds: number;
  waitSeconds: number;
  waitMinutes: number;
  atStop: boolean;
  confidence: Confidence;
}

export interface StopTripRef {
  tripIndex: number;
  stopIndex: number;
}

function stopNamesMatch(stopNorm: string, targetNorm: string): boolean {
  if (!stopNorm || !targetNorm) return false;
  return (
    stopNorm === targetNorm ||
    (stopNorm.length >= 4 &&
      targetNorm.length >= 4 &&
      (stopNorm.includes(targetNorm) || targetNorm.includes(stopNorm)))
  );
}

/**
 * Builds an inverted index from normalized station name to `{ tripIndex, stopIndex }`
 * (excluding terminal alighting-only stops) so station departure boards resolve in O(1)
 * instead of scanning every stop of all 13,800+ trips on every click.
 */
export function buildStopTripsIndex(trips: readonly TripData[]): Map<string, StopTripRef[]> {
  const index = new Map<string, StopTripRef[]>();
  const normCache = new Map<string, string>();
  for (let tripIndex = 0; tripIndex < trips.length; tripIndex++) {
    const stops = trips[tripIndex].stops;
    if (stops.length < 2) continue;
    for (let stopIndex = 0; stopIndex < stops.length - 1; stopIndex++) {
      const rawName = stops[stopIndex][3];
      let norm = normCache.get(rawName);
      if (norm === undefined) {
        norm = normalizeStopName(rawName);
        normCache.set(rawName, norm);
      }
      if (!norm) continue;
      let list = index.get(norm);
      if (!list) {
        list = [];
        index.set(norm, list);
      }
      list.push({ tripIndex, stopIndex });
    }
  }
  return index;
}

export function computeStationDepartures(params: {
  stationName: string;
  trips: readonly TripData[];
  linesMap: ReadonlyMap<string, LineMetadata>;
  timelines?: ReadonlyMap<string, Timeline>;
  suppressedTripIds?: ReadonlySet<string>;
  closedLineIds?: ReadonlySet<string>;
  serviceSecondsCandidates: readonly number[];
  limitPerLineDir?: number;
  horizonSeconds?: number;
  stopTripsIndex?: ReadonlyMap<string, readonly StopTripRef[]>;
}): StationDeparture[] {
  const {
    stationName,
    trips,
    linesMap,
    timelines,
    suppressedTripIds,
    closedLineIds,
    serviceSecondsCandidates,
    limitPerLineDir = 2,
    horizonSeconds = 2700,
    stopTripsIndex,
  } = params;

  const targetNorm = normalizeStopName(stationName);
  if (!targetNorm) return [];

  const perGroup = new Map<string, StationDeparture[]>();

  const considerTripStop = (trip: TripData, stopIndex: number) => {
    if (suppressedTripIds?.has(trip.id)) return;
    if (closedLineIds?.has(trip.line)) return;
    if (trip.stops.length < 2 || stopIndex < 0 || stopIndex >= trip.stops.length - 1) return;

    const schedStop = trip.stops[stopIndex];
    const timeline = timelines?.get(trip.id);
    const tlStop = timeline?.stops?.[stopIndex];
    const arr = tlStop ? tlStop.cArr : schedStop[0];
    const dep = tlStop ? tlStop.cDep : schedStop[1];

    let bestWait: number | null = null;
    let atStop = false;
    for (const sec of serviceSecondsCandidates) {
      if (sec <= dep + 15 && sec >= arr - 15) {
        bestWait = 0;
        atStop = true;
        break;
      }
      const delta = arr - sec;
      if (delta >= 0 && delta <= horizonSeconds) {
        if (bestWait === null || delta < bestWait) bestWait = delta;
      }
    }
    if (bestWait === null) return;

    const line = linesMap.get(trip.line);
    const groupKey = `${trip.line}|${trip.dir}`;
    const list = perGroup.get(groupKey) ?? [];
    const confidence: Confidence = tlStop?.measured
      ? 'measured'
      : timeline && timeline.measuredCount > 0
        ? 'bracketed'
        : 'scheduled';

    list.push({
      tripId: trip.id,
      lineId: trip.line,
      lineShortName: line?.short_name || trip.line,
      colorHex: line?.color || '#6B7280',
      textColorHex: line?.text_color || '#FFFFFF',
      direction: trip.dir === 1 ? 1 : 0,
      destName: trip.destName || line?.destinations?.[String(trip.dir) as '0' | '1'] || 'Terminus',
      arrivalSeconds: arr,
      waitSeconds: Math.max(0, Math.round(bestWait)),
      waitMinutes: Math.max(0, Math.round(bestWait / 60)),
      atStop,
      confidence,
    });
    perGroup.set(groupKey, list);
  };

  if (stopTripsIndex) {
    const matchedTripIds = new Set<number>();
    const exactRefs = stopTripsIndex.get(targetNorm);
    if (exactRefs) {
      for (const ref of exactRefs) {
        if (matchedTripIds.has(ref.tripIndex)) continue;
        matchedTripIds.add(ref.tripIndex);
        const trip = trips[ref.tripIndex];
        if (trip) considerTripStop(trip, ref.stopIndex);
      }
    }
    for (const [normKey, refs] of stopTripsIndex.entries()) {
      if (normKey === targetNorm || !stopNamesMatch(normKey, targetNorm)) continue;
      for (const ref of refs) {
        if (matchedTripIds.has(ref.tripIndex)) continue;
        matchedTripIds.add(ref.tripIndex);
        const trip = trips[ref.tripIndex];
        if (trip) considerTripStop(trip, ref.stopIndex);
      }
    }
  } else {
    for (const trip of trips) {
      if (suppressedTripIds?.has(trip.id)) continue;
      if (closedLineIds?.has(trip.line)) continue;
      if (trip.stops.length < 2) continue;

      // On ignore le dernier arrêt (descente uniquement au terminus)
      const stopIndex = trip.stops.findIndex(
        (s, idx) =>
          idx < trip.stops.length - 1 && stopNamesMatch(normalizeStopName(s[3]), targetNorm)
      );
      if (stopIndex >= 0) considerTripStop(trip, stopIndex);
    }
  }

  const out: StationDeparture[] = [];
  for (const list of perGroup.values()) {
    list.sort((a, b) => a.waitSeconds - b.waitSeconds);
    out.push(...list.slice(0, limitPerLineDir));
  }
  out.sort((a, b) => a.waitSeconds - b.waitSeconds);
  return out;
}

function formatClock(seconds: number): string {
  const civilSeconds = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(civilSeconds / 3600);
  const minutes = Math.floor((civilSeconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`;
}

interface TrainInterpolationState {
  train: TrainMarker;
  shape: Shape;
  timeline: Timeline;
  serviceSecondsAtTick: number;
  dTick: number;
  speedMps: number;
  tTick: number;
  extrapolatedD: number;
  reconcileOffset: number;
  reconcileStartTime: number;
}

interface GhostFadeState {
  train: TrainMarker;
  shape: Shape;
  fadeStartTime: number;
}

export class BrowserSubwayEngine {
  private shapes = new Map<string, Shape>();
  private trips: TripData[] = [];
  private stopTripsIndex = new Map<string, StopTripRef[]>();
  private schedTripsMap = new Map<string, SchedTrip>();
  private stationNames: string[] = [];
  private linesMap = new Map<string, LineMetadata>();
  private readonly realtime: RealtimeAdapter;
  private isRunning = false;
  private timerId: any = null;
  private rafId: number | null = null;
  private trackedTrains = new Map<string, TrainInterpolationState>();
  private fadingOutGhosts = new Map<string, GhostFadeState>();
  private reduceMotion = false;
  private focusedLineId: string | null = null;
  private lineIds: string[] = [];
  private virtualTimeOffsetS = 0; // for time scrubbing

  // RT state owned by the engine (Levels 2 & 3). Matching state specific to a
  // city lives in its adapter.
  private timelines = new Map<string, Timeline>();
  private suppressedTripIds = new Set<string>();
  private loggedDistanceClamps = new Set<string>();

  private serviceDistanceM = 0;
  private distanceServiceDate = '';
  private distanceByTrip = new Map<string, number>();

  private firstMetroSeconds = 0;
  private lastServiceSeconds = 0;
  private lastTrafficByLine: Record<string, LineTrafficReport> | null = null;
  private closedStationsRules = new Map<
    string,
    { allClosed: boolean; normalizedSet: Set<string>; normalizedList: string[] }
  >();

  private externalShapesMap?: Map<string, Shape>;
  private config: CityConfig;
  private renderZoom = 12.5;
  private renderFollowing = false;
  private renderSuspended = false;
  private lastRafRenderMs = 0;
  private visibilityHandler: (() => void) | null = null;
  private onTickFn: (() => void) | null = null;
  private rafLoopFn: (() => void) | null = null;

  /**
   * Updates adaptive FPS budget so battery usage stays minimal at overview zooms
   * and pauses map interpolation when the 3D ride view covers the map.
   */
  public setRenderContext(ctx: { zoom?: number; isFollowing?: boolean; suspended?: boolean }) {
    if (ctx.zoom !== undefined) this.renderZoom = ctx.zoom;
    if (ctx.isFollowing !== undefined) this.renderFollowing = ctx.isFollowing;
    if (ctx.suspended !== undefined) this.renderSuspended = ctx.suspended;
  }

  private async loadScheduleViaWorker(url: string): Promise<{
    stationNames: string[];
    trips: TripData[];
    schedTrips: SchedTrip[];
    stopTripsIndex: Map<string, StopTripRef[]>;
  } | null> {
    if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
    try {
      const absUrl = new URL(url, window.location.origin).href;
      const worker = new Worker(new URL('./schedule_worker.ts', import.meta.url), {
        type: 'module',
      });
      return await new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          worker.terminate();
          resolve(null);
        }, 15000);
        worker.onmessage = (ev: MessageEvent<ScheduleWorkerResponse>) => {
          window.clearTimeout(timer);
          worker.terminate();
          const data = ev.data;
          if (!data?.ok || !data.trips || !data.schedTrips || !data.stationNames) {
            resolve(null);
            return;
          }
          resolve({
            stationNames: data.stationNames,
            trips: data.trips,
            schedTrips: data.schedTrips,
            stopTripsIndex: new Map(data.stopTripsEntries || []),
          });
        };
        worker.onerror = () => {
          window.clearTimeout(timer);
          worker.terminate();
          resolve(null);
        };
        worker.postMessage({ id: 1, url: absUrl });
      });
    } catch {
      return null;
    }
  }

  /**
   * Le moteur reçoit un adaptateur temps réel déjà construit. Il ignore de quelle
   * ville il s'agit : voir `cities/realtime.ts` pour le choix de l'adaptateur.
   */
  constructor(config: CityConfig, realtime: RealtimeAdapter) {
    this.config = config;
    this.realtime = realtime;
  }

  public getRealtimeAdapter(): RealtimeAdapter {
    return this.realtime;
  }

  public getShapes(): Map<string, Shape> {
    return this.shapes;
  }

  public getTrips(): readonly TripData[] {
    return this.trips;
  }

  public getStationDepartures(
    stationName: string,
    limitPerLineDir = 2,
    nowOverride?: Date
  ): StationDeparture[] {
    const now =
      nowOverride ??
      (this.virtualTimeOffsetS !== 0
        ? new Date(Date.now() + this.virtualTimeOffsetS * 1000)
        : new Date());
    const candidates = serviceCandidates(now, this.config.timezone).map((c) => c.seconds);
    const closedLineIds = new Set<string>();
    for (const [lineId, rule] of this.closedStationsRules.entries()) {
      if (rule.allClosed) closedLineIds.add(lineId);
    }
    return computeStationDepartures({
      stationName,
      trips: this.trips,
      linesMap: this.linesMap,
      timelines: this.timelines,
      suppressedTripIds: this.suppressedTripIds,
      closedLineIds,
      serviceSecondsCandidates: candidates,
      limitPerLineDir,
      stopTripsIndex: this.stopTripsIndex,
    });
  }

  public setFocusedLine(lineId: string | null) {
    this.focusedLineId = lineId;
  }

  public async initialize(lines: LineMetadata[], externalShapesMap?: Map<string, Shape>) {
    this.externalShapesMap = externalShapesMap;
    for (const l of lines) {
      this.linesMap.set(l.id, l);
    }

    // 1. Fetch shapes.bin & schedule.json in parallel (parsing schedule.json in a Web Worker when available)
    const dataDir = this.config.paths.dataDir;
    const scheduleUrl = dataUrl(`${dataDir}/schedule.json`);
    console.log('[engine] Loading shapes and schedule in browser...');
    const shapesPromise =
      externalShapesMap && externalShapesMap.size > 0
        ? Promise.resolve(externalShapesMap)
        : loadShapes(dataUrl(`${dataDir}/shapes.bin`));

    const [shapesMap, workerResult] = await Promise.all([
      shapesPromise,
      this.loadScheduleViaWorker(scheduleUrl),
    ]);

    this.shapes = shapesMap;

    if (workerResult) {
      this.stationNames = workerResult.stationNames;
      this.trips = workerResult.trips;
      for (const st of workerResult.schedTrips) {
        this.schedTripsMap.set(st.tripId, st);
      }
      this.stopTripsIndex = workerResult.stopTripsIndex;
    } else {
      const scheduleRes = await fetch(scheduleUrl);
      const scheduleData = await scheduleRes.json();
      this.stationNames = scheduleData.stations;
      const normalizedStations = this.stationNames.map((n) => normalizeStopName(n || 'Station'));

      // Convert trips into TripData & SchedTrip without re-normalizing 300k stop strings
      this.trips = scheduleData.trips.map((t: any): TripData => {
        const destName = this.stationNames[t[6]] || 'Terminus';
        const rawStops: any[] = t[7];
        const stops: Array<[number, number, number, string]> = new Array(rawStops.length);
        const schedStops: SchedTrip['stops'] = new Array(rawStops.length);
        for (let i = 0; i < rawStops.length; i++) {
          const s = rawStops[i];
          const stationIdx = s[3] as number;
          const name = this.stationNames[stationIdx] || 'Station';
          const stopId = normalizedStations[stationIdx] || 'station';
          stops[i] = [s[0], s[1], s[2], name];
          schedStops[i] = { stopId, arr: s[0], dep: s[1], dist: s[2] };
        }

        const tripId = t[0];
        const lineId = t[1];
        const dir = (t[2] === 0 ? 0 : 1) as 0 | 1;
        const shapeId = t[3];

        this.schedTripsMap.set(tripId, {
          tripId,
          lineId,
          dir,
          shapeId,
          stops: schedStops,
        });

        return {
          id: tripId,
          line: lineId,
          dir,
          shapeId,
          t0: t[4],
          t1: t[5],
          destName,
          stops,
        };
      });

      this.stopTripsIndex = buildStopTripsIndex(this.trips);
    }
    console.log(
      `[engine] Loaded ${this.shapes.size} shapes and ${this.trips.length} scheduled trips.`
    );

    this.recomputeTripTimeBounds();
    this.lineIds = lines.map((l) => l.id);
    this.initializeServiceDistance(new Date());

    // Asynchronous non-blocking loading of RER data if configured
    if (this.config.paths.rer) {
      this.loadRerData().catch((err) => {
        console.warn('[engine] Failed to load RER data:', err);
      });
    }
  }

  public async loadRerData(): Promise<void> {
    const rerConfig = this.config.paths.rer;
    if (!rerConfig) return;

    try {
      console.log('[engine] Loading RER shapes and schedule...');
      const [rerShapesMap, rerScheduleRes] = await Promise.all([
        loadShapes(dataUrl(rerConfig.shapesBin)),
        fetch(dataUrl(rerConfig.scheduleJson)),
      ]);

      if (!rerScheduleRes.ok) {
        throw new Error(`HTTP ${rerScheduleRes.status}`);
      }

      const rerScheduleData = await rerScheduleRes.json();
      const rerStations: string[] = rerScheduleData.stations || [];

      for (let i = 0; i < rerStations.length; i++) {
        if (rerStations[i]) {
          this.stationNames[i] = rerStations[i];
        }
      }

      for (const [id, shape] of rerShapesMap.entries()) {
        this.shapes.set(id, shape);
        if (this.externalShapesMap) {
          this.externalShapesMap.set(id, shape);
        }
      }

      const rerNormStations = this.stationNames.map((n) => (n ? normalizeStopName(n) : 'station'));
      const rerTrips: TripData[] = rerScheduleData.trips.map((t: any): TripData => {
        const destName = this.stationNames[t[6]] || 'Terminus';
        const rawStops: any[] = t[7];
        const stops: Array<[number, number, number, string]> = new Array(rawStops.length);
        const schedStops: SchedTrip['stops'] = new Array(rawStops.length);
        for (let i = 0; i < rawStops.length; i++) {
          const s = rawStops[i];
          const stationIdx = s[3] as number;
          const name = this.stationNames[stationIdx] || 'Station';
          const stopId = rerNormStations[stationIdx] || 'station';
          stops[i] = [s[0], s[1], s[2], name];
          schedStops[i] = { stopId, arr: s[0], dep: s[1], dist: s[2] };
        }

        const tripId = t[0];
        const lineId = t[1];
        const dir = (t[2] === 0 ? 0 : 1) as 0 | 1;
        const shapeId = t[3];

        this.schedTripsMap.set(tripId, {
          tripId,
          lineId,
          dir,
          shapeId,
          stops: schedStops,
        });

        return {
          id: tripId,
          line: lineId,
          dir,
          shapeId,
          t0: t[4],
          t1: t[5],
          destName,
          stops,
        };
      });

      this.trips.push(...rerTrips);
      this.stopTripsIndex = buildStopTripsIndex(this.trips);
      this.recomputeTripTimeBounds();
      console.log(
        `[engine] Loaded ${rerShapesMap.size} RER shapes and ${rerTrips.length} RER scheduled trips.`
      );
    } catch (err) {
      console.warn('[engine] Could not load RER dataset:', err);
    }
  }

  public startRealtime() {
    if (this.lineIds.length > 0) {
      this.realtime.startPolling(this.lineIds, () => this.focusedLineId);
    }
  }

  public stopRealtime() {
    this.realtime.stopPolling();
    this.timelines.clear();
    this.realtime.reset?.();
    this.suppressedTripIds.clear();
    this.fadingOutGhosts.clear();
    this.closedStationsRules.clear();
    this.lastTrafficByLine = null;
  }

  public isRealtimeActive(): boolean {
    return this.realtime.getStatus().active;
  }

  public setVirtualTimeSeconds(secondsSinceMidnight: number) {
    const nowSeconds = cityClock(new Date(), this.config.timezone).secondsSinceMidnight;
    this.virtualTimeOffsetS = secondsSinceMidnight - nowSeconds;
  }

  public getVirtualTimeOffsetSeconds(): number {
    return this.virtualTimeOffsetS;
  }

  public getCurrentServiceClockSeconds(): number {
    const now =
      this.virtualTimeOffsetS !== 0
        ? new Date(Date.now() + this.virtualTimeOffsetS * 1000)
        : new Date();
    return cityClock(now, this.config.timezone).secondsSinceMidnight;
  }

  public resetVirtualTime() {
    this.virtualTimeOffsetS = 0;
  }

  public getServiceDistanceKm(): number {
    return this.serviceDistanceM / 1000;
  }

  private serviceDateFor(now: Date): string {
    const clock = cityClock(now, this.config.timezone);
    const firstTrip = this.firstMetroSeconds;
    const candidates = serviceCandidates(now, this.config.timezone);
    if (clock.secondsSinceMidnight < firstTrip && candidates.length > 1) {
      return candidates[1].serviceDate;
    }
    return candidates[0].serviceDate;
  }

  private distanceAtTripTime(trip: TripData, serviceSeconds: number): number {
    if (serviceSeconds <= trip.t0 || trip.stops.length === 0) return 0;
    const lastStop = trip.stops[trip.stops.length - 1];
    if (serviceSeconds >= trip.t1) return Math.max(0, lastStop[2]);
    for (let index = 1; index < trip.stops.length; index += 1) {
      const previous = trip.stops[index - 1];
      const current = trip.stops[index];
      const depart = previous[1];
      const arrive = current[0];
      if (serviceSeconds <= arrive) {
        const span = Math.max(1, arrive - depart);
        const progress = Math.max(0, Math.min(1, (serviceSeconds - depart) / span));
        return Math.max(0, previous[2] + (current[2] - previous[2]) * progress);
      }
    }
    return Math.max(0, lastStop[2]);
  }

  private initializeServiceDistance(now: Date) {
    const serviceDate = this.serviceDateFor(now);
    const candidate = serviceCandidates(now, this.config.timezone).find(
      (item) => item.serviceDate === serviceDate
    );
    const serviceSeconds =
      candidate?.seconds ?? cityClock(now, this.config.timezone).secondsSinceMidnight;
    this.serviceDistanceM = this.trips.reduce(
      (sum, trip) => sum + this.distanceAtTripTime(trip, serviceSeconds),
      0
    );
    this.distanceByTrip.clear();
    for (const trip of this.trips) {
      const distance = this.distanceAtTripTime(trip, serviceSeconds);
      if (distance > 0 && serviceSeconds <= trip.t1) this.distanceByTrip.set(trip.id, distance);
    }
    this.distanceServiceDate = serviceDate;
  }

  private accumulateServiceDistance(trains: TrainMarker[], now: Date) {
    const serviceDate = this.serviceDateFor(now);
    if (serviceDate !== this.distanceServiceDate) this.initializeServiceDistance(now);
    const seen = new Set<string>();
    for (const train of trains) {
      const distance = Math.max(0, train.currentDistM ?? 0);
      const previous = this.distanceByTrip.get(train.id);
      if (previous !== undefined && distance > previous) {
        this.serviceDistanceM += distance - previous;
      }
      this.distanceByTrip.set(train.id, distance);
      seen.add(train.id);
    }
    for (const id of this.distanceByTrip.keys()) {
      if (!seen.has(id) && !this.trackedTrains.has(id)) this.distanceByTrip.delete(id);
    }
  }

  public getServiceStatus(now: Date = new Date()): ServiceStatus {
    const { secondsSinceMidnight } = cityClock(now, this.config.timezone);
    if (this.trips.length === 0) {
      return {
        state: 'loading',
        firstMetroSeconds: 0,
        firstMetroLabel: '—',
        secondsUntilFirst: 0,
        nowCivilSeconds: secondsSinceMidnight,
      };
    }

    const firstMetroSeconds = this.firstMetroSeconds;
    const lastServiceSeconds = this.lastServiceSeconds;
    const active = serviceCandidates(now, this.config.timezone).some(
      (candidate) =>
        candidate.seconds >= firstMetroSeconds && candidate.seconds <= lastServiceSeconds
    );

    let state: ServiceState;
    if (active) {
      state = 'active';
    } else if (secondsSinceMidnight >= 4 * 3600 && secondsSinceMidnight < firstMetroSeconds) {
      state = 'before_first';
    } else {
      state = 'ended';
    }

    const firstTodayOrTomorrow =
      secondsSinceMidnight < firstMetroSeconds ? firstMetroSeconds : 86400 + firstMetroSeconds;

    return {
      state,
      firstMetroSeconds,
      firstMetroLabel: formatClock(firstMetroSeconds),
      secondsUntilFirst:
        state === 'active' ? 0 : Math.max(0, firstTodayOrTomorrow - secondsSinceMidnight),
      nowCivilSeconds: secondsSinceMidnight,
    };
  }

  private recomputeTripTimeBounds() {
    if (this.trips.length === 0) {
      this.firstMetroSeconds = 0;
      this.lastServiceSeconds = 0;
      return;
    }
    let minT0 = Number.POSITIVE_INFINITY;
    let maxT1 = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < this.trips.length; i++) {
      const t = this.trips[i];
      if (t.t0 < minT0) minT0 = t.t0;
      if (t.t1 > maxT1) maxT1 = t.t1;
    }
    this.firstMetroSeconds = Number.isFinite(minT0) ? minT0 : 0;
    this.lastServiceSeconds = Number.isFinite(maxT1) ? maxT1 : 0;
  }

  private syncTrafficRules(trafficByLine: Record<string, LineTrafficReport>) {
    this.closedStationsRules.clear();
    for (const [lineId, report] of Object.entries(trafficByLine)) {
      if (report && report.status === 'interrupted') {
        if (!report.closedStations || report.closedStations.length === 0) {
          this.closedStationsRules.set(lineId, {
            allClosed: true,
            normalizedSet: new Set(),
            normalizedList: [],
          });
        } else {
          const normalized = report.closedStations
            .map((cs) => normalizeStopName(cs))
            .filter((cs) => cs.length >= 3);
          this.closedStationsRules.set(lineId, {
            allClosed: false,
            normalizedSet: new Set(normalized),
            normalizedList: normalized,
          });
        }
      }
    }
  }

  private getLineMaxDisplaySpeed(lineId: string): number {
    const line = this.linesMap.get(lineId);
    if (line?.mode) {
      const mode = this.config.modes.find((m) => m.id === line.mode);
      if (mode?.kinematics?.maxSpeedKmh) {
        return mode.kinematics.maxSpeedKmh;
      }
      if (line.mode === 'rail') return 130;
    }
    return this.config.modes[0]?.kinematics?.maxSpeedKmh ?? 90;
  }

  public toggleRealtime(): boolean {
    if (this.isRealtimeActive()) {
      this.stopRealtime();
      return false;
    } else {
      this.startRealtime();
      return true;
    }
  }

  public start(events: EngineEvents) {
    if (this.isRunning) return;
    this.isRunning = true;

    // Detect prefers-reduced-motion
    const mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    this.reduceMotion = mediaQuery ? mediaQuery.matches : false;
    if (mediaQuery) {
      mediaQuery.addEventListener('change', (e) => {
        this.reduceMotion = e.matches;
      });
    }

    if (events.onPrimStatus) {
      this.realtime.onUpdate(events.onPrimStatus);
    }
    if (events.onRealtimeStatus) {
      this.realtime.onUpdate(events.onRealtimeStatus);
    }
    this.realtime.onUpdate(() => {
      const traffic = this.realtime.getTrafficByLine();
      this.lastTrafficByLine = traffic;
      this.syncTrafficRules(traffic);
    });

    const onTick = () => {
      if (!this.isRunning) return;

      const now =
        this.virtualTimeOffsetS !== 0
          ? new Date(Date.now() + this.virtualTimeOffsetS * 1000)
          : new Date();

      const activeTrips = selectActiveTrips(this.trips, now, undefined, 0, this.config.timezone);
      const activeSchedTrips = activeTrips
        .map((a) => this.schedTripsMap.get(a.trip.id)!)
        .filter(Boolean);
      const trafficByLine = this.realtime.getTrafficByLine();
      if (trafficByLine !== this.lastTrafficByLine) {
        this.lastTrafficByLine = trafficByLine;
        this.syncTrafficRules(trafficByLine);
      }

      // Levels 2 & 3: the city's adapter recalibrates timelines, if it can.
      if (this.realtime.applyTick && this.realtime.getStatus().active) {
        const result = this.realtime.applyTick({
          now,
          civilSeconds: cityClock(now, this.config.timezone).secondsSinceMidnight,
          activeSchedTrips,
          schedTripsById: this.schedTripsMap,
          timelines: this.timelines,
        });

        if (result && result.suppressedTripIds) {
          // Initiate smooth 240ms fade out for newly suppressed ghosts
          const fadeTimestamp = performance.now();
          for (const ghostId of result.suppressedTripIds) {
            if (!this.suppressedTripIds.has(ghostId)) {
              const existing = this.trackedTrains.get(ghostId);
              if (existing) {
                this.fadingOutGhosts.set(ghostId, {
                  train: existing.train,
                  shape: existing.shape,
                  fadeStartTime: fadeTimestamp,
                });
              }
            }
          }
          this.suppressedTripIds = result.suppressedTripIds;
        }
      }

      const tickTimestamp = performance.now();
      const nextTrackedTrains = new Map<string, TrainInterpolationState>();
      const activeTrainsList: TrainMarker[] = [];

      for (const { trip, serviceSeconds } of activeTrips) {
        // Skip ghost trains (suppressed from active count)
        if (this.suppressedTripIds.has(trip.id)) continue;

        // Info Trafic check: suspend trips on interrupted sections
        const trafficRule = this.closedStationsRules.get(trip.line);
        if (trafficRule) {
          if (trafficRule.allClosed) continue;
          const isInsideClosedSection = trip.stops.some((s) => {
            const normStop = normalizeStopName(s[3]);
            if (normStop.length < 3) return false;
            if (trafficRule.normalizedSet.has(normStop)) return true;
            return trafficRule.normalizedList.some(
              (normCs) => normStop.includes(normCs) || normCs.includes(normStop)
            );
          });
          if (isInsideClosedSection) continue;
        }

        const shape = this.shapes.get(trip.shapeId);
        if (!shape) continue;

        const line = this.linesMap.get(trip.line);
        const lineColor = line ? line.color : '#CCCCCC';
        const lineTextColor = line ? line.text_color : '#FFFFFF';
        const lineShort = line ? line.short_name : '';
        const lineElevation = line ? line.elevation_offset : 0;

        const schedTrip = this.schedTripsMap.get(trip.id);
        if (!schedTrip) continue;

        let timeline = this.timelines.get(trip.id);
        if (!timeline) {
          timeline = buildTimeline(schedTrip, []);
          this.timelines.set(trip.id, timeline);
        }

        // Level 3 Position evaluation
        const posResult = positionAt(timeline, serviceSeconds);
        if (!posResult) continue;

        const unclampedDistance = posResult.dist;
        const distanceClampWarningToleranceM = 0.5;
        const dTick = Math.max(0, Math.min(shape.length, unclampedDistance));
        if (
          Math.abs(dTick - unclampedDistance) > distanceClampWarningToleranceM &&
          !this.loggedDistanceClamps.has(trip.id)
        ) {
          this.loggedDistanceClamps.add(trip.id);
          console.warn('[engine] Clamped out-of-bounds train distance', {
            tripId: trip.id,
            unclampedDistance,
            shapeLength: shape.length,
            terminalStation: trip.stops[trip.stops.length - 1]?.[3] || trip.destName,
          });
        }
        const vMps = clampSpeed(posResult.speed);
        const maxDisplaySpeed = this.getLineMaxDisplaySpeed(trip.line);
        const speedKmh = Math.round(Math.min(maxDisplaySpeed, vMps * 3.6));
        const delaySeconds = posResult.delay;
        const confidence: Confidence = posResult.confidence;

        // Resolve next station human-readable name
        let nextStationName = trip.destName;
        if (posResult.nextStopId) {
          const matchingStop = trip.stops.find(
            (s) => normalizeStopName(s[3]) === posResult.nextStopId
          );
          if (matchingStop) {
            nextStationName = matchingStop[3];
          }
        }

        const posCoords = getCoordAtDistance(shape, dTick);
        const brg = getSmoothedBearing(shape, dTick);

        const train: TrainMarker = {
          id: trip.id,
          line: trip.line,
          lineName: lineShort,
          colorHex: lineColor,
          textColorHex: lineTextColor,
          pos: posCoords,
          elevation: lineElevation,
          brg,
          spd: speedKmh,
          speedMps: vMps,
          delay: delaySeconds,
          dest: trip.destName,
          next: nextStationName,
          conf: confidence,
          shapeId: trip.shapeId,
          currentDistM: dTick,
          direction: (trip.dir === 0 ? 0 : 1) as 0 | 1,
          atStop: posResult.atStop,
        };

        const profile = getKinematicProfile(trip.line);
        const existing = this.trackedTrains.get(train.id);
        let reconcileOffset = 0;
        const reconcileStartTime = tickTimestamp;

        if (existing) {
          const rawError = existing.extrapolatedD - dTick;
          if (Math.abs(rawError) > profile.reconcileThresholdM) {
            reconcileOffset = 0;
          } else {
            reconcileOffset = rawError;
          }
        }

        nextTrackedTrains.set(train.id, {
          train,
          shape,
          timeline,
          serviceSecondsAtTick: serviceSeconds,
          dTick,
          speedMps: vMps,
          tTick: tickTimestamp,
          extrapolatedD: dTick + reconcileOffset,
          reconcileOffset,
          reconcileStartTime,
        });

        activeTrainsList.push(train);
      }

      this.trackedTrains = nextTrackedTrains;
      this.accumulateServiceDistance(activeTrainsList, now);

      events.onTick(activeTrainsList, activeTrainsList.length);
    };

    // First tick immediately
    this.onTickFn = onTick;
    onTick();

    // 1 Hz simulation tick (pauses automatically when document is hidden)
    const startInterval = () => {
      if (this.timerId) return;
      this.timerId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        onTick();
      }, 1000);
    };
    startInterval();

    // Adaptive FPS requestAnimationFrame interpolation loop (battery-friendly on iPhone & Mac ProMotion)
    const rafLoop = () => {
      if (!this.isRunning) return;
      if (typeof document !== 'undefined' && document.hidden) {
        this.rafId = null;
        return;
      }

      const now = performance.now();
      const minIntervalMs = this.renderSuspended
        ? 500
        : getAdaptiveFrameIntervalMs({
            zoom: this.renderZoom,
            isFollowing: this.renderFollowing,
            reduceMotion: this.reduceMotion,
          });

      if (!this.reduceMotion && now - this.lastRafRenderMs >= minIntervalMs) {
        this.lastRafRenderMs = now;
        const renderedTrains: TrainMarker[] = [];

        // Active tracked trains — evaluate continuous trapezoidal kinematics
        for (const state of this.trackedTrains.values()) {
          const {
            train,
            shape,
            timeline,
            serviceSecondsAtTick,
            dTick,
            speedMps,
            tTick,
            reconcileOffset,
            reconcileStartTime,
          } = state;

          const dt = Math.max(0, (now - tTick) / 1000);
          const profile = getKinematicProfile(train.line);

          let currentError = 0;
          if (reconcileOffset !== 0) {
            const elapsedReconcileMs = now - reconcileStartTime;
            if (elapsedReconcileMs < profile.reconcileDurationMs) {
              const factor = 1.0 - elapsedReconcileMs / profile.reconcileDurationMs;
              currentError = reconcileOffset * factor;
            }
          }

          const liveEval = positionAt(timeline, serviceSecondsAtTick + dt);
          const baseDist = liveEval ? liveEval.dist : train.atStop ? dTick : dTick + speedMps * dt;
          if (liveEval) {
            const liveV = clampSpeed(liveEval.speed);
            train.speedMps = liveV;
            train.spd = Math.round(Math.min(this.getLineMaxDisplaySpeed(train.line), liveV * 3.6));
            train.atStop = liveEval.atStop;
          }

          let dHat = baseDist + currentError;
          dHat = Math.max(0, Math.min(shape.length, dHat));
          state.extrapolatedD = dHat;

          const pos = getCoordAtDistance(shape, dHat);
          const brg = getSmoothedBearing(shape, dHat);

          train.currentDistM = Math.round(dHat * 10) / 10;
          train.pos = pos;
          train.brg = brg;

          renderedTrains.push(train);
        }

        // Fading out ghost trains (240 ms fade out)
        for (const [id, ghost] of this.fadingOutGhosts.entries()) {
          const elapsed = now - ghost.fadeStartTime;
          if (elapsed >= 240) {
            this.fadingOutGhosts.delete(id);
          } else {
            // Keep ghost train in rendered set during 240ms fade
            const ghostAlpha = Math.max(0, Math.min(1, 1 - elapsed / 240));
            renderedTrains.push({ ...ghost.train, isGhost: true, ghostAlpha });
          }
        }

        // Report active trains count (excluding ghosts)
        events.onRender?.(renderedTrains, this.trackedTrains.size);
      }

      this.rafId = requestAnimationFrame(rafLoop);
    };

    this.rafLoopFn = rafLoop;
    if (
      typeof requestAnimationFrame !== 'undefined' &&
      !(typeof document !== 'undefined' && document.hidden)
    ) {
      this.rafId = requestAnimationFrame(rafLoop);
    }

    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (!this.isRunning) return;
        if (document.hidden) {
          if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
          }
          if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
          }
        } else {
          this.lastRafRenderMs = 0;
          this.onTickFn?.();
          startInterval();
          if (
            this.rafId === null &&
            this.rafLoopFn &&
            typeof requestAnimationFrame !== 'undefined'
          ) {
            this.rafId = requestAnimationFrame(this.rafLoopFn);
          }
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.onTickFn = null;
    this.rafLoopFn = null;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.rafId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.trackedTrains.clear();
    this.fadingOutGhosts.clear();
    this.timelines.clear();
    this.realtime.reset?.();
    this.suppressedTripIds.clear();
    this.realtime.stopPolling();
  }
}
