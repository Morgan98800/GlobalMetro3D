import { loadShapes, Shape } from './shapes_loader';

const DATA_REVISION = '20260910-09';
const dataUrl = (path: string) => `${path}?v=${DATA_REVISION}`;
import { TripData, getCoordAtDistance, getSmoothedBearing } from './kinematics';
import { PrimRealtimeClient, PrimStatus, normalizeStopName } from './prim_client';
import {
  matchJourneys,
  buildTimeline,
  positionAt,
  clampSpeed,
  createGhostTracker,
  updateGhosts,
  stats,
  isRerLine,
  getKinematicProfile,
  type SchedTrip,
  type Timeline,
  type Confidence
} from './rt_matching';
import { parisClock, selectActiveTrips, serviceCandidates } from './paris_time';
import type { TrainMarker } from '../map/trains_layer';
import type { LineMetadata } from '@paris-subway/shared';

export interface EngineEvents {
  onTick: (trains: TrainMarker[], activeCount: number) => void;
  onRender?: (trains: TrainMarker[], activeCount: number) => void;
  onPrimStatus: (status: PrimStatus) => void;
}

export type ServiceState = 'loading' | 'before_first' | 'active' | 'ended';

export interface ServiceStatus {
  state: ServiceState;
  firstMetroSeconds: number;
  firstMetroLabel: string;
  secondsUntilFirst: number;
  nowCivilSeconds: number;
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
  private schedTripsMap = new Map<string, SchedTrip>();
  private stationNames: string[] = [];
  private linesMap = new Map<string, LineMetadata>();
  private primClient: PrimRealtimeClient;
  private isRunning = false;
  private timerId: any = null;
  private rafId: number | null = null;
  private trackedTrains = new Map<string, TrainInterpolationState>();
  private fadingOutGhosts = new Map<string, GhostFadeState>();
  private reduceMotion = false;
  private focusedLineId: string | null = null;
  private lineIds: string[] = [];
  private virtualTimeOffsetS = 0; // for time scrubbing

  // RT Matching state (Levels 2 & 3)
  private ghostTracker = createGhostTracker();
  private everMatchedTrips = new Set<string>();
  private timelines = new Map<string, Timeline>();
  private suppressedTripIds = new Set<string>();
  private loggedDistanceClamps = new Set<string>();

  private serviceDistanceM = 0;
  private distanceServiceDate = '';
  private distanceByTrip = new Map<string, number>();

  constructor(apiKey?: string) {
    this.primClient = new PrimRealtimeClient(apiKey);
  }

  public getPrimClient(): PrimRealtimeClient {
    return this.primClient;
  }

  public setFocusedLine(lineId: string | null) {
    this.focusedLineId = lineId;
  }

  public async initialize(lines: LineMetadata[]) {
    lines.forEach(l => this.linesMap.set(l.id, l));

    // 1. Fetch shapes.bin & schedule.json in parallel
    console.log('[engine] Loading shapes and schedule in browser...');
    const [shapesMap, scheduleRes] = await Promise.all([
      loadShapes(dataUrl('/data/shapes.bin')),
      fetch(dataUrl('/data/schedule.json'))
    ]);

    this.shapes = shapesMap;

    const scheduleData = await scheduleRes.json();
    this.stationNames = scheduleData.stations;

    // Convert trips into TripData & SchedTrip
    this.trips = scheduleData.trips.map((t: any): TripData => {
      const destName = this.stationNames[t[6]] || 'Terminus';
      const stops: Array<[number, number, number, string]> = t[7].map((s: any) => [
        s[0], // arr
        s[1], // dep
        s[2], // distM
        this.stationNames[s[3]] || 'Station'
      ]);

      const tripId = t[0];
      const lineId = t[1];
      const dir = (t[2] === 0 ? 0 : 1) as 0 | 1;
      const shapeId = t[3];

      this.schedTripsMap.set(tripId, {
        tripId,
        lineId,
        dir,
        shapeId,
        stops: stops.map(s => ({
          stopId: normalizeStopName(s[3]),
          arr: s[0],
          dep: s[1],
          dist: s[2]
        }))
      });

      return {
        id: tripId,
        line: lineId,
        dir,
        shapeId,
        t0: t[4],
        t1: t[5],
        destName,
        stops
      };
    });

    console.log(`[engine] Loaded ${this.shapes.size} shapes and ${this.trips.length} scheduled trips.`);

    this.lineIds = lines.map(l => l.id);
    this.initializeServiceDistance(new Date());

    // Asynchronous non-blocking loading of RER data
    this.loadRerData().catch(err => {
      console.warn('[engine] Failed to load RER data:', err);
    });
  }

  public async loadRerData(): Promise<void> {
    try {
      console.log('[engine] Loading RER shapes and schedule...');
      const [rerShapesMap, rerScheduleRes] = await Promise.all([
        loadShapes(dataUrl('/data/rer_shapes.bin')),
        fetch(dataUrl('/data/rer_schedule.json'))
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
      }

      const rerTrips: TripData[] = rerScheduleData.trips.map((t: any): TripData => {
        const destName = this.stationNames[t[6]] || 'Terminus';
        const stops: Array<[number, number, number, string]> = t[7].map((s: any) => [
          s[0], // arr
          s[1], // dep
          s[2], // distM
          this.stationNames[s[3]] || 'Station'
        ]);

        const tripId = t[0];
        const lineId = t[1];
        const dir = (t[2] === 0 ? 0 : 1) as 0 | 1;
        const shapeId = t[3];

        this.schedTripsMap.set(tripId, {
          tripId,
          lineId,
          dir,
          shapeId,
          stops: stops.map(s => ({
            stopId: normalizeStopName(s[3]),
            arr: s[0],
            dep: s[1],
            dist: s[2]
          }))
        });

        return {
          id: tripId,
          line: lineId,
          dir,
          shapeId,
          t0: t[4],
          t1: t[5],
          destName,
          stops
        };
      });

      this.trips.push(...rerTrips);
      console.log(`[engine] Loaded ${rerShapesMap.size} RER shapes and ${rerTrips.length} RER scheduled trips.`);
    } catch (err) {
      console.warn('[engine] Could not load RER dataset:', err);
    }
  }

  public startRealtime() {
    if (this.lineIds.length > 0) {
      this.primClient.startPolling(this.lineIds, () => this.focusedLineId);
    }
  }

  public stopRealtime() {
    this.primClient.stopPolling();
    this.timelines.clear();
    this.everMatchedTrips.clear();
    this.suppressedTripIds.clear();
    this.fadingOutGhosts.clear();
  }

  public isRealtimeActive(): boolean {
    return this.primClient.getStatus().active;
  }

  public setVirtualTimeSeconds(secondsSinceMidnight: number) {
    const nowSeconds = parisClock(new Date()).secondsSinceMidnight;
    this.virtualTimeOffsetS = secondsSinceMidnight - nowSeconds;
  }

  public resetVirtualTime() {
    this.virtualTimeOffsetS = 0;
  }

  public getServiceDistanceKm(): number {
    return this.serviceDistanceM / 1000;
  }

  private serviceDateFor(now: Date): string {
    const clock = parisClock(now);
    const firstTrip = this.trips.reduce((min, trip) => Math.min(min, trip.t0), Number.POSITIVE_INFINITY);
    const candidates = serviceCandidates(now);
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
    const candidate = serviceCandidates(now).find(item => item.serviceDate === serviceDate);
    const serviceSeconds = candidate?.seconds ?? parisClock(now).secondsSinceMidnight;
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
    const { secondsSinceMidnight } = parisClock(now);
    if (this.trips.length === 0) {
      return {
        state: 'loading',
        firstMetroSeconds: 0,
        firstMetroLabel: '—',
        secondsUntilFirst: 0,
        nowCivilSeconds: secondsSinceMidnight
      };
    }

    const firstMetroSeconds = Math.min(...this.trips.map(trip => trip.t0));
    const lastServiceSeconds = Math.max(...this.trips.map(trip => trip.t1));
    const active = serviceCandidates(now).some(candidate =>
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

    const firstTodayOrTomorrow = secondsSinceMidnight < firstMetroSeconds
      ? firstMetroSeconds
      : 86400 + firstMetroSeconds;

    return {
      state,
      firstMetroSeconds,
      firstMetroLabel: formatClock(firstMetroSeconds),
      secondsUntilFirst: state === 'active' ? 0 : Math.max(0, firstTodayOrTomorrow - secondsSinceMidnight),
      nowCivilSeconds: secondsSinceMidnight
    };
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

    this.primClient.onUpdate(events.onPrimStatus);

    const onTick = () => {
      if (!this.isRunning) return;

      const now = this.virtualTimeOffsetS !== 0
        ? new Date(Date.now() + this.virtualTimeOffsetS * 1000)
        : new Date();

      const activeTrips = selectActiveTrips(this.trips, now);
      const activeSchedTrips = activeTrips.map(a => this.schedTripsMap.get(a.trip.id)!).filter(Boolean);
      const trafficByLine = this.primClient.getTrafficByLine();

      // Level 2 & 3: Real-Time Matching and Timeline Updates
      const isRtActive = this.primClient.getStatus().active;
      if (isRtActive) {
        const journeys = this.primClient.getJourneys();
        const { matches } = matchJourneys(journeys, activeSchedTrips);

        // Track ever-matched courses
        for (const m of matches) {
          this.everMatchedTrips.add(m.trip.tripId);
        }

        // Ghost trains suppression (Guards 1 & 2 included)
        const matchedTripIds = new Set(matches.map(m => m.trip.tripId));
        const newSuppressed = updateGhosts(
          this.ghostTracker,
          activeSchedTrips,
          matchedTripIds,
          this.everMatchedTrips,
          this.primClient.isFeedHealthy()
        );

        // Initiate smooth 240ms fade out for newly suppressed ghosts
        const tickTimestamp = performance.now();
        for (const ghostId of newSuppressed) {
          if (!this.suppressedTripIds.has(ghostId)) {
            const existing = this.trackedTrains.get(ghostId);
            if (existing) {
              this.fadingOutGhosts.set(ghostId, {
                train: existing.train,
                shape: existing.shape,
                fadeStartTime: tickTimestamp
              });
            }
          }
        }
        this.suppressedTripIds = newSuppressed;

        // Build / update Level 3 timelines for matched trips
        for (const { journey, trip } of matches) {
          const prev = this.timelines.get(trip.tripId);
          this.timelines.set(trip.tripId, buildTimeline(trip, journey.calls, prev));
        }

        // For unmatched active trips: ensure a theoretical timeline exists
        for (const schedTrip of activeSchedTrips) {
          if (!this.timelines.has(schedTrip.tripId)) {
            this.timelines.set(schedTrip.tripId, buildTimeline(schedTrip, []));
          }
        }

        // Calculate and publish Level 2 & 3 match statistics
        const matchStats = stats(
          journeys,
          matches,
          activeSchedTrips,
          Array.from(this.timelines.values()),
          this.suppressedTripIds
        );
        this.primClient.setMatchingStats(matchStats);
      }

      const tickTimestamp = performance.now();
      const nextTrackedTrains = new Map<string, TrainInterpolationState>();
      const activeTrainsList: TrainMarker[] = [];

      for (const { trip, serviceSeconds } of activeTrips) {
        // Skip ghost trains (suppressed from active count)
        if (this.suppressedTripIds.has(trip.id)) continue;

        // Info Trafic check: suspend trips on interrupted sections
        const lineTraffic = trafficByLine[trip.line];
        if (lineTraffic && lineTraffic.status === 'interrupted') {
          if (lineTraffic.closedStations && lineTraffic.closedStations.length > 0) {
            const isInsideClosedSection = trip.stops.some(s =>
              lineTraffic.closedStations!.some(cs => normalizeStopName(s[3]).includes(normalizeStopName(cs)))
            );
            if (isInsideClosedSection) continue;
          }
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
        if (Math.abs(dTick - unclampedDistance) > distanceClampWarningToleranceM && !this.loggedDistanceClamps.has(trip.id)) {
          this.loggedDistanceClamps.add(trip.id);
          console.warn('[engine] Clamped out-of-bounds train distance', {
            tripId: trip.id,
            unclampedDistance,
            shapeLength: shape.length,
            terminalStation: trip.stops[trip.stops.length - 1]?.[3] || trip.destName
          });
        }
        const vMps = clampSpeed(posResult.speed);
        const maxDisplaySpeed = isRerLine(trip.line) ? 130 : 90;
        const speedKmh = Math.round(Math.min(maxDisplaySpeed, vMps * 3.6));
        const delaySeconds = posResult.delay;
        const confidence: Confidence = posResult.confidence;

        // Resolve next station human-readable name
        let nextStationName = trip.destName;
        if (posResult.nextStopId) {
          const matchingStop = trip.stops.find(s => normalizeStopName(s[3]) === posResult.nextStopId);
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
          atStop: posResult.atStop
        };

        const profile = getKinematicProfile(trip.line);
        const existing = this.trackedTrains.get(train.id);
        let reconcileOffset = 0;
        let reconcileStartTime = tickTimestamp;

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
          dTick,
          speedMps: vMps,
          tTick: tickTimestamp,
          extrapolatedD: dTick + reconcileOffset,
          reconcileOffset,
          reconcileStartTime
        });

        activeTrainsList.push(train);
      }

      this.trackedTrains = nextTrackedTrains;
      this.accumulateServiceDistance(activeTrainsList, now);

      events.onTick(activeTrainsList, activeTrainsList.length);
    };

    // First tick immediately
    onTick();

    // 1 Hz simulation tick
    this.timerId = setInterval(onTick, 1000);

    // 60 fps requestAnimationFrame interpolation loop
    const rafLoop = () => {
      if (!this.isRunning) return;

      if (!this.reduceMotion) {
        const now = performance.now();
        const renderedTrains: TrainMarker[] = [];

        // Active tracked trains
        for (const state of this.trackedTrains.values()) {
          const { train, shape, dTick, speedMps, tTick, reconcileOffset, reconcileStartTime } = state;

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

          let dHat = dTick + speedMps * dt + currentError;
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
            renderedTrains.push({ ...ghost.train, isGhost: true });
          }
        }

        // Report active trains count (excluding ghosts)
        events.onRender?.(renderedTrains, this.trackedTrains.size);
      }

      this.rafId = requestAnimationFrame(rafLoop);
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(rafLoop);
    }
  }

  public stop() {
    this.isRunning = false;
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
    this.everMatchedTrips.clear();
    this.suppressedTripIds.clear();
    this.primClient.stopPolling();
  }
}
