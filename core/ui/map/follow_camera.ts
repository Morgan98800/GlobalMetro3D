import maplibregl from 'maplibre-gl';
import { HIGH_ZOOM_MAX_PITCH, LOW_ZOOM_MAX_PITCH, maxPitchForZoom } from './maplibre';
import { trainModelsEnabled } from './train_models_layer';
import type { TrainMarker } from './trains_layer';

// grazingCamera devient vrai à partir de 45° dans deck_overlay.ts.
// TODO: remonter à 60° quand heightMeasured est validé.
export const FOLLOW_CAMERA_PITCH = LOW_ZOOM_MAX_PITCH
  + (HIGH_ZOOM_MAX_PITCH - LOW_ZOOM_MAX_PITCH) * 14 / 30;

const FOLLOW_DURATION_MS = 700;
const FOLLOW_CENTER_EPSILON = 0.000002;

export function isRerTrain(train: TrainMarker): boolean {
  return (
    train.line.includes('C017') ||
    ['A', 'B', 'C', 'D', 'E'].includes(train.line) ||
    ['A', 'B', 'C', 'D', 'E'].includes(train.lineName) ||
    train.lineName.toUpperCase().includes('RER')
  );
}

export function getFollowZoom(train: TrainMarker): number {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  if (isRerTrain(train)) {
    return isMobile ? 16.2 : 16.8;
  }
  return isMobile ? 17.5 : 18.0;
}

export function getFollowSmoothingMs(train: TrainMarker): number {
  return isRerTrain(train) ? 360 : 520;
}

interface FollowCameraOptions {
  map: maplibregl.Map;
  getTrain: (tripId: string) => TrainMarker | undefined;
  setFollowElevation: (lineId: string | null, offset: number) => void;
  dock: HTMLElement;
  onStop?: () => void;
}

function cssTimeMs(value: string, fallback: number): number {
  const match = value.trim().match(/^([\d.]+)(ms|s)$/);
  if (!match) return fallback;
  const numeric = Number(match[1]);
  return match[2] === 's' ? numeric * 1000 : numeric;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (value: number) => number {
  const sample = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  return (value: number) => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 16; i++) {
      const middle = (low + high) / 2;
      if (sample(middle, x1, x2) < value) low = middle;
      else high = middle;
    }
    return sample((low + high) / 2, y1, y2);
  };
}

function cssEase(): (value: number) => number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--ease');
  const match = value.match(/cubic-bezier\(([^)]+)\)/);
  if (!match) return value => 1 - (1 - value) ** 3;
  const points = match[1].split(',').map(Number);
  return points.length === 4 && points.every(Number.isFinite)
    ? cubicBezier(points[0], points[1], points[2], points[3])
    : value => 1 - (1 - value) ** 3;
}

export class FollowCamera {
  private readonly map: maplibregl.Map;
  private readonly getTrain: FollowCameraOptions['getTrain'];
  private readonly setFollowElevation: FollowCameraOptions['setFollowElevation'];
  private readonly dock: HTMLElement;
  private readonly onStop?: () => void;
  private tripId: string | null = null;
  private locked = false;
  private stopped = false;
  private previousMaxPitch = HIGH_ZOOM_MAX_PITCH;
  private previousBuildingsVisibility: 'visible' | 'none' = 'none';
  private previousDockCollapsed = false;
  private elevationLineId: string | null = null;
  private elevationProgress = 0;
  private elevationStartedAt = 0;
  private elevationFrom = 0;
  private readonly reducedMotion: boolean;
  private lastFrameAt = 0;
  private smoothedCenter: [number, number] | null = null;

  constructor(options: FollowCameraOptions) {
    this.map = options.map;
    this.getTrain = options.getTrain;
    this.setFollowElevation = options.setFollowElevation;
    this.dock = options.dock;
    this.onStop = options.onStop;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.map.on('dragstart', this.stopFollow);
    this.map.getCanvasContainer().addEventListener('wheel', () => this.stopFollow(), { passive: true });
    this.map.getCanvasContainer().addEventListener('touchstart', () => this.stopFollow(), { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
  }

  public startFollow = (target: string | TrainMarker): boolean => {
    const train = typeof target === 'object' ? target : this.getTrain(target);
    if (this.reducedMotion || !train || train.isGhost || !train.shapeId || !train.pos) return false;

    this.stopFollow(false);
    this.tripId = train.id;
    this.stopped = false;
    this.locked = false;
    this.lastFrameAt = performance.now();
    this.smoothedCenter = [...train.pos];
    this.previousMaxPitch = this.map.getMaxPitch();
    this.previousBuildingsVisibility = this.map.getLayer('building-3d')
      && this.map.getLayoutProperty('building-3d', 'visibility') !== 'none'
      ? 'visible'
      : 'none';
    this.map.setMaxPitch(HIGH_ZOOM_MAX_PITCH);

    this.previousDockCollapsed = this.dock.classList.contains('dock--collapsed');
    if (window.innerWidth <= 768) this.dock.classList.add('dock--collapsed');

    this.elevationLineId = train.line;
    this.elevationFrom = train.elevation || 0;
    this.elevationStartedAt = performance.now();
    this.elevationProgress = 0;
    this.setFollowElevation(this.elevationLineId, 0);

    const followZoom = getFollowZoom(train);
    const duration = cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue('--t-camera'), FOLLOW_DURATION_MS);
    this.map.once('moveend', this.beginLock);
    window.setTimeout(() => {
      if (this.tripId === train.id && !this.stopped && !this.locked) {
        this.beginLock();
      }
    }, duration + 120);

    this.map.easeTo({
      center: train.pos,
      zoom: followZoom,
      pitch: FOLLOW_CAMERA_PITCH,
      bearing: train.brg,
      duration,
      easing: cssEase()
    });
    return true;
  };

  public stopFollow = (notify = true): void => {
    if (!this.tripId && !this.locked) return;
    this.stopped = true;
    this.tripId = null;
    this.locked = false;
    this.smoothedCenter = null;
    this.lastFrameAt = 0;
    this.map.setMaxPitch(this.previousMaxPitch || maxPitchForZoom(this.map.getZoom()));
    if (this.map.getLayer('building-3d')) {
      this.map.setLayoutProperty('building-3d', 'visibility', this.previousBuildingsVisibility);
    }
    if (window.innerWidth <= 768 && !this.previousDockCollapsed) {
      this.dock.classList.remove('dock--collapsed');
    }
    this.setFollowElevation(null, 0);
    this.elevationLineId = null;
    if (notify) this.onStop?.();
  };

  public isFollowing(): boolean {
    return this.tripId !== null;
  }

  /** Appelé depuis le même rAF que la publication de la position de simulation. */
  public onSimulationFrame = (): void => {
    if (!this.tripId || this.stopped) return;
    const train = this.getTrain(this.tripId);
    if (!train || train.isGhost) {
      this.stopFollow();
      return;
    }

    this.updateElevation();
    if (!this.locked) return;
    const now = performance.now();
    const deltaMs = Math.min(100, Math.max(0, now - this.lastFrameAt));
    this.lastFrameAt = now;
    const smoothingMs = getFollowSmoothingMs(train);
    const smoothing = 1 - Math.exp(-deltaMs / smoothingMs);
    const currentCenter = this.smoothedCenter ?? [this.map.getCenter().lng, this.map.getCenter().lat];
    const nextCenter: [number, number] = [
      currentCenter[0] + (train.pos[0] - currentCenter[0]) * smoothing,
      currentCenter[1] + (train.pos[1] - currentCenter[1]) * smoothing
    ];
    const centerMoved = Math.abs(nextCenter[0] - currentCenter[0]) > FOLLOW_CENTER_EPSILON
      || Math.abs(nextCenter[1] - currentCenter[1]) > FOLLOW_CENTER_EPSILON;

    // Smooth heading tracking for curves (especially high-speed RER curves)
    const currentBearing = this.map.getBearing();
    const angleDiff = ((train.brg - currentBearing + 540) % 360) - 180;
    const bearingSmoothing = 1 - Math.exp(-deltaMs / (smoothingMs * 1.8));
    const nextBearing = currentBearing + angleDiff * bearingSmoothing;
    const bearingMoved = Math.abs(angleDiff) > 0.05;

    if (!centerMoved && !bearingMoved) return;
    this.smoothedCenter = nextCenter;
    this.map.jumpTo({
      center: nextCenter,
      bearing: nextBearing
    });
  };

  private beginLock = (): void => {
    if (!this.tripId || this.stopped) return;
    this.locked = true;
  };

  private updateElevation(): void {
    if (!this.elevationLineId) return;
    const progress = Math.min(1, (performance.now() - this.elevationStartedAt) / FOLLOW_DURATION_MS);
    this.elevationProgress = progress;
    this.setFollowElevation(this.elevationLineId, -this.elevationFrom * progress);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.stopFollow();
  };
}