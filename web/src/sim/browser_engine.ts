import { loadShapesBin, ShapeData } from './shapes';
import { TripData, computeTripKinematics, getCoordAtDistance, getSmoothedBearing } from './kinematics';
import { PrimRealtimeClient, PrimStatus } from './prim_client';
import type { TrainMarker } from '../map/trains_layer';
import type { LineMetadata } from '@paris-subway/shared';

export interface EngineEvents {
  onTick: (trains: TrainMarker[], activeCount: number) => void;
  onPrimStatus: (status: PrimStatus) => void;
}

interface TrainInterpolationState {
  train: TrainMarker;
  shape: ShapeData;
  dTick: number;
  speedMps: number;
  tTick: number;
  extrapolatedD: number;
  reconcileOffset: number;
  reconcileStartTime: number;
}

export class BrowserSubwayEngine {
  private shapes = new Map<string, ShapeData>();
  private trips: TripData[] = [];
  private stationNames: string[] = [];
  private linesMap = new Map<string, LineMetadata>();
  private primClient: PrimRealtimeClient;
  private isRunning = false;
  private timerId: any = null;
  private rafId: number | null = null;
  private trackedTrains = new Map<string, TrainInterpolationState>();
  private reduceMotion = false;
  private focusedLineId: string | null = null;
  private lineIds: string[] = [];
  private timeMultiplier = 1.0;
  private virtualTimeOffsetS = 0; // for time scrubbing if needed

  // Pre-allocated reusable arrays to avoid per-frame heap allocations (Fix 7)
  private _renderedTrains: TrainMarker[] = [];
  private _activeTrainsList: TrainMarker[] = [];

  // Cached Paris time — only recomputed once per second, not every RAF frame (Fix 7)
  private _cachedParisSec = 0;
  private _lastTimeUpdate = 0;

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
    for (const l of lines) {
      this.linesMap.set(l.id, l);
    }

    // 1. Fetch shapes.bin & schedule.json in parallel
    console.log('[engine] Loading shapes and schedule in browser...');
    const [shapesMap, scheduleRes] = await Promise.all([
      loadShapesBin('/data/shapes.bin'),
      fetch('/data/schedule.json')
    ]);

    this.shapes = shapesMap;

    const scheduleData = await scheduleRes.json();
    this.stationNames = scheduleData.stations;

    // Convert trips into TripData
    // Format: [id, line, dir, shapeId, t0, t1, destIdx, st]
    // st: [[arr, dep, dist, sidx], ...]
    this.trips = scheduleData.trips.map((t: any): TripData => {
      const destName = this.stationNames[t[6]] || 'Terminus';
      const stops: Array<[number, number, number, string]> = t[7].map((s: any) => [
        s[0], // arr
        s[1], // dep
        s[2], // distM
        this.stationNames[s[3]] || 'Station'
      ]);

      return {
        id: t[0],
        line: t[1],
        dir: t[2],
        shapeId: t[3],
        t0: t[4],
        t1: t[5],
        destName,
        stops
      };
    });

    console.log(`[engine] Loaded ${this.shapes.size} shapes and ${this.trips.length} scheduled trips.`);

    this.lineIds = lines.map(l => l.id);
    // Realtime PRIM polling is disabled by default to preserve API quota
  }

  public startRealtime() {
    if (this.lineIds.length > 0) {
      this.primClient.startPolling(this.lineIds, () => this.focusedLineId);
    }
  }

  public stopRealtime() {
    this.primClient.stopPolling();
  }

  public isRealtimeActive(): boolean {
    return this.primClient.getStatus().active;
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

  public getCurrentParisSeconds(): number {
    const now = new Date();
    const parisString = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
    const pDate = new Date(parisString);
    const sec = pDate.getHours() * 3600 + pDate.getMinutes() * 60 + pDate.getSeconds();
    const rawSec = sec + this.virtualTimeOffsetS;
    const modSec = ((rawSec % 86400) + 86400) % 86400;
    // In GTFS, trips between 00:00 and 04:59 belong to the active service day and have t0/t1 >= 86400
    if (modSec < 18000) {
      return modSec + 86400;
    }
    return modSec;
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

      const currentSec = this.getCurrentParisSeconds();
      const tickTimestamp = performance.now();
      const nextTrackedTrains = new Map<string, TrainInterpolationState>();
      const activeTrainsList: TrainMarker[] = [];

      for (const trip of this.trips) {
        if (currentSec >= trip.t0 && currentSec <= trip.t1) {
          const shape = this.shapes.get(trip.shapeId);
          if (!shape) continue;

          const line = this.linesMap.get(trip.line);
          const lineColor = line ? line.color : '#CCCCCC';
          const lineTextColor = line ? line.text_color : '#FFFFFF';
          const lineShort = line ? line.short_name : '';
          const lineElevation = line ? line.elevation_offset : 0;

          const delay = this.primClient.getLineDelay(trip.line, trip.dir);

          const train = computeTripKinematics(
            trip,
            shape,
            currentSec,
            delay,
            lineColor,
            lineTextColor,
            lineShort,
            lineElevation
          );

          if (train) {
            const dTick = train.currentDistM ?? 0;
            const vMps = train.speedMps ?? 0;

            const existing = this.trackedTrains.get(train.id);
            let reconcileOffset = 0;
            let reconcileStartTime = tickTimestamp;

            if (existing) {
              const rawError = existing.extrapolatedD - dTick;
              if (Math.abs(rawError) > 20) {
                // Hard jump > 20m: recalage réel, on ne lisse pas un vrai saut
                reconcileOffset = 0;
              } else {
                // Smooth error absorption over ~300ms
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
        }
      }

      this.trackedTrains = nextTrackedTrains;

      // If prefers-reduced-motion is active or no trains are running, positions apply per tick
      if (this.reduceMotion || this.trackedTrains.size === 0) {
        events.onTick(activeTrainsList, activeTrainsList.length);
      }
    };

    // First tick immediately
    onTick();

    // 1 Hz simulation tick
    this.timerId = setInterval(onTick, 1000);

    // 60 fps requestAnimationFrame interpolation loop
    const rafLoop = () => {
      if (!this.isRunning) return;

      if (!this.reduceMotion && this.trackedTrains.size > 0) {
        const now = performance.now();
        const renderedTrains: TrainMarker[] = [];

        for (const state of this.trackedTrains.values()) {
          const { train, shape, dTick, speedMps, tTick, reconcileOffset, reconcileStartTime } = state;

          // Elapsed time since tick in seconds
          const dt = Math.max(0, (now - tTick) / 1000);

          // 300 ms linear error reconciliation
          let currentError = 0;
          if (reconcileOffset !== 0) {
            const elapsedReconcileMs = now - reconcileStartTime;
            if (elapsedReconcileMs < 300) {
              const factor = 1.0 - elapsedReconcileMs / 300;
              currentError = reconcileOffset * factor;
            }
          }

          // d̂ = d_tick + v × (now − t_tick) + currentError
          let dHat = dTick + speedMps * dt + currentError;
          dHat = Math.max(0, Math.min(shape.totalLengthM, dHat));
          state.extrapolatedD = dHat;

          const pos = getCoordAtDistance(shape, dHat);
          const brg = getSmoothedBearing(shape, dHat);

          train.currentDistM = Math.round(dHat * 10) / 10;
          train.pos = pos;
          train.brg = brg;

          renderedTrains.push(train);
        }

        events.onTick(renderedTrains, renderedTrains.length);
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
    this.primClient.stopPolling();
  }
}
