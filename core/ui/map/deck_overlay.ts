import { MapLibreOverlay } from '@deck.gl/maplibre';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { LineMetadata, StationMetadata } from '@core/types';
import type { TransitItinerary } from '@core/ui/utils/transit_router';

import { createTrainsLayers, TrainMarker } from './trains_layer';
import { createStationLabelsLayer, LATIN_CHARACTER_SET } from './labels_layer';
import { createCapsuleLayers } from './capsule_layer';
import { roundPathCorners } from './rounded_path';
import { PathStyleExtension } from '@deck.gl/extensions';
import {
  createTrainModelSpikeLayer,
  createTrainModelSpikeLighting,
  isTrainModelSpikeEnabled,
} from './train_model_spike';
import type { ShapeEntry } from '@core/sim/shapes';
import type { RollingStockDatabase } from '@core/sim/rolling_stock';
import {
  createTrainModelLayers,
  isTrainModelReadyForTrain,
  requestTrainModel,
  subscribeTrainModelAssets,
  trainModelsEnabled,
  TRAIN_MODEL_ZOOM_THRESHOLD,
} from './train_models_layer';
import type * as maplibregl from 'maplibre-gl';
import { resolveTrainRenderLayers } from './train_render_fallback';
import { createPlatformsLayers } from './platforms_layer';
import { getOptimalPixelRatio, isMobileGpuDevice } from './device_perf';
import { setStationBuildingCutout } from './overture_buildings';
import {
  createLocalStationDetailBundle,
  createStationSielTextLayers,
  type SielBoardAnchor,
  STATION_DETAIL_ZOOM_MIN,
} from './station_detail_lod';
import {
  buildHubRegistry,
  elevateTrackPath,
  hasViaductZones,
  type HubRegistry,
  resolveLineElevationAt,
  viaductFactorAt,
} from './station_levels';
import { computeSubsurfaceMix, setSubsurfaceMapMode } from './maplibre';
import { createLandmarksLayers } from './landmarks_layer';
import { createSeineRiverLayers } from './seine_river_layer';

export interface TrackItem {
  line_id: string;
  short_name: string;
  stroke: string;
  coordinates: [number, number][];
}

export interface RerTrackSegment {
  id: string;
  name: string;
  shortName: string;
  color: string;
  isBanlieue: boolean;
  coordinates: [number, number][];
}

export interface SubwayMapData {
  lines: LineMetadata[];
  stations: StationMetadata[];
  tracks: TrackItem[];
  lineLadders?: Record<string, any>;
  shapes?: Map<string, ShapeEntry>;
  rollingStockDb?: RollingStockDatabase;
}

interface TerminusMarker {
  station: StationMetadata;
  lineId: string;
  lineColor: string;
  elevation: number;
}

export function hexToRgba(hex: string, alpha: number = 255): [number, number, number, number] {
  const c = hex.replace('#', '');
  if (c.length === 6) {
    return [
      parseInt(c.substring(0, 2), 16),
      parseInt(c.substring(2, 4), 16),
      parseInt(c.substring(4, 6), 16),
      alpha,
    ];
  }
  return [200, 200, 200, alpha];
}

/** Snap a station marker to the nearest point on the selected line geometry.
 * GTFS parent-station coordinates are a useful interchange centroid, but at
 * large hubs that centroid can sit between platforms and visibly off the
 * selected route. The correction is display-only; source coordinates remain
 * untouched for search and data provenance.
 */
function snapPointToPaths(point: [number, number], paths: [number, number][][]): [number, number] {
  const latScale = 111_320;
  const lonScale = latScale * Math.cos((point[1] * Math.PI) / 180);
  const project = (p: [number, number]) => [p[0] * lonScale, p[1] * latScale] as [number, number];
  const target = project(point);
  let bestDistance = Number.POSITIVE_INFINITY;
  let best = point;

  for (const path of paths) {
    for (let index = 1; index < path.length; index += 1) {
      const a = project(path[index - 1]);
      const b = project(path[index]);
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const lengthSquared = vx * vx + vy * vy;
      const t = lengthSquared
        ? Math.max(
            0,
            Math.min(1, ((target[0] - a[0]) * vx + (target[1] - a[1]) * vy) / lengthSquared)
          )
        : 0;
      const candidate: [number, number] = [
        path[index - 1][0] + (path[index][0] - path[index - 1][0]) * t,
        path[index - 1][1] + (path[index][1] - path[index - 1][1]) * t,
      ];
      const projected = project(candidate);
      const dx = target[0] - projected[0];
      const dy = target[1] - projected[1];
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  return [Number(best[0].toFixed(6)), Number(best[1].toFixed(6))];
}

function deduplicateStations(stations: StationMetadata[]): StationMetadata[] {
  const byName = new Map<string, StationMetadata>();
  for (const st of stations) {
    const existing = byName.get(st.name);
    if (!existing) {
      byName.set(st.name, { ...st, lines: [...st.lines] });
    } else {
      for (const lineId of st.lines) {
        if (!existing.lines.includes(lineId)) {
          existing.lines.push(lineId);
        }
      }
      if (st.is_hub) existing.is_hub = true;
    }
  }
  return Array.from(byName.values());
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

function splitTrackByViaduct(
  track: TrackItem,
  rounded: [number, number][],
  shortName: string,
  cache: WeakMap<TrackItem, [number, number][]>
): { underground: TrackItem[]; viaduct: TrackItem[] } {
  if (!hasViaductZones(shortName) || rounded.length < 2) {
    return { underground: [track], viaduct: [] };
  }
  const underground: TrackItem[] = [];
  const viaduct: TrackItem[] = [];
  let currentCoords: [number, number][] = [rounded[0]];
  let currentElevated = viaductFactorAt(shortName, rounded[0]) > 0.18;

  const flush = (coords: [number, number][], elevated: boolean) => {
    if (coords.length < 2) return;
    const slice: TrackItem = { ...track, coordinates: coords };
    cache.set(slice, coords);
    if (elevated) {
      viaduct.push(slice);
    } else {
      underground.push(slice);
    }
  };

  for (let i = 1; i < rounded.length; i += 1) {
    const prev = rounded[i - 1];
    const next = rounded[i];
    const mid: [number, number] = [(prev[0] + next[0]) * 0.5, (prev[1] + next[1]) * 0.5];
    const segElevated =
      Math.max(viaductFactorAt(shortName, mid), viaductFactorAt(shortName, next)) > 0.18;
    if (segElevated === currentElevated) {
      currentCoords.push(next);
    } else {
      flush(currentCoords, currentElevated);
      currentCoords = [prev, next];
      currentElevated = segElevated;
    }
  }
  flush(currentCoords, currentElevated);
  return { underground, viaduct };
}

export class SubwayDeckOverlay {
  private overlay: MapLibreOverlay;
  private map: maplibregl.Map | null = null;
  private data: SubwayMapData | null = null;
  private lineMap = new Map<string, LineMetadata>();
  private selectedLineId: string | null = null;
  private selectedTrainId: string | null = null;
  private trains: TrainMarker[] = [];
  private rerTracks: RerTrackSegment[] = [];
  private showRer: boolean = false;
  private xrayMode: boolean = false;
  private buildingsVisible: boolean = true;
  private cityId: string = 'paris';
  private zoom: number = 13;
  private pitch: number = 0;
  private followElevationLineId: string | null = null;
  private followElevationOffset = 0;
  private undergroundBeforeId: string | undefined = undefined;
  private mapCenter: [number, number] = [2.3488, 48.8534];
  private bounds: [[number, number], [number, number]] | null = null;
  private trackRevealProgress = 1;
  private trackRevealFrame: number | null = null;
  private layerUpdateFrame: number | null = null;
  private roundedTrackPaths = new WeakMap<TrackItem, [number, number][]>();
  private roundedRerPaths = new WeakMap<RerTrackSegment, [number, number][]>();
  private cachedTerminusMarkers: TerminusMarker[] = [];
  private cachedDisplayStations: StationMetadata[] = [];
  private cachedTracksCoordsByLine = new Map<string, [number, number][][]>();
  private cachedPreTrainLayers: any[] = [];
  private cachedLocalDetailLayers: any[] = [];
  private cachedSielAnchors: SielBoardAnchor[] = [];
  private cachedLandmarkLayers: any[] = [];
  private cachedPostTrainLayers: any[] = [];
  private localDetailAnchor: [number, number] | null = null;
  private localDetailZoomBucket = -1;
  private localDetailFollowOffset = 0;
  private localDetailDirty = true;
  private landmarksDirty = true;
  private staticLayersDirty = true;
  private hubRegistry: HubRegistry | null = null;
  private activeItinerary: TransitItinerary | null = null;
  private userLocation: {
    lng: number;
    lat: number;
    accuracyM: number;
    headingDeg: number | null;
  } | null = null;
  private theme: 'dark' | 'light' =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
      ? 'light'
      : 'dark';
  private onStationHover: (info: any) => void;
  private onStationClick: (station: StationMetadata) => void;
  private onTrainHover: (info: any) => void;
  private onTrainClick: (train: TrainMarker) => void;
  private onLineSelect: (lineId: string) => void;
  private onBackgroundClick: () => void;

  constructor(options: {
    onStationHover: (info: any) => void;
    onStationClick: (station: StationMetadata) => void;
    onTrainHover: (info: any) => void;
    onTrainClick: (train: TrainMarker) => void;
    onLineSelect?: (lineId: string) => void;
    onBackgroundClick?: () => void;
  }) {
    this.onStationHover = options.onStationHover;
    this.onStationClick = options.onStationClick;
    this.onTrainHover = options.onTrainHover;
    this.onTrainClick = options.onTrainClick;
    this.onLineSelect = options.onLineSelect || (() => undefined);
    this.onBackgroundClick = options.onBackgroundClick || (() => undefined);
    subscribeTrainModelAssets(() => this.updateLayers());

    this.overlay = new MapLibreOverlay({
      interleaved: true,
      useDevicePixels: getOptimalPixelRatio(2, 1.5),
      layers: [],
      effects: [createTrainModelSpikeLighting()],
    });
  }

  public getOverlay(): MapLibreOverlay {
    return this.overlay;
  }

  public setRerData(rerRaw: any[]) {
    const isIntraMuros = (pt: [number, number]) => {
      const [lon, lat] = pt;
      return lon >= 2.224 && lon <= 2.469 && lat >= 48.815 && lat <= 48.902;
    };

    const segments: RerTrackSegment[] = [];
    for (let i = 0; i < rerRaw.length; i++) {
      const line = rerRaw[i];
      const coords = line.coordinates as [number, number][];
      if (!coords || coords.length < 2) continue;

      let currentSeg: [number, number][] = [coords[0]];
      let currentBanlieue = !isIntraMuros(coords[0]);

      for (let j = 1; j < coords.length; j++) {
        const banlieue = !isIntraMuros(coords[j]);
        if (banlieue === currentBanlieue) {
          currentSeg.push(coords[j]);
        } else {
          currentSeg.push(coords[j]);
          segments.push({
            id: `rer_${line.name || i}_${j}`,
            name: line.name || '',
            shortName: line.short_name || line.shortName || line.name || '',
            color: line.color || '#ED1B24',
            isBanlieue: currentBanlieue,
            coordinates: currentSeg,
          });
          currentSeg = [coords[j]];
          currentBanlieue = banlieue;
        }
      }
      if (currentSeg.length >= 2) {
        segments.push({
          id: `rer_${line.name || i}_end`,
          name: line.name || '',
          shortName: line.short_name || line.shortName || line.name || '',
          color: line.color || '#ED1B24',
          isBanlieue: currentBanlieue,
          coordinates: currentSeg,
        });
      }
    }
    this.rerTracks = segments;
    this.roundedRerPaths = new WeakMap();
    for (const seg of segments) {
      this.roundedRerPaths.set(seg, roundPathCorners(seg.coordinates));
    }
    this.staticLayersDirty = true;
    this.updateLayers();
  }

  public setShowRer(show: boolean) {
    if (this.showRer === show) return;
    this.showRer = show;
    this.staticLayersDirty = true;
    this.updateLayers();
  }

  public setXrayMode(active: boolean) {
    if (this.xrayMode === active) return;
    this.xrayMode = active;
    this.landmarksDirty = true;
    this.syncSubsurfaceMode(true);
    this.staticLayersDirty = true;
    this.localDetailDirty = true;
    this.landmarksDirty = true;
    this.updateLayers();
  }

  public setBuildingsVisible(visible: boolean) {
    if (this.buildingsVisible === visible) return;
    this.buildingsVisible = visible;
    this.landmarksDirty = true;
    this.updateLayers();
  }

  public setCityId(cityId: string) {
    if (this.cityId === cityId) return;
    this.cityId = cityId;
    this.landmarksDirty = true;
    this.updateLayers();
  }

  public setShapes(shapes: Map<string, ShapeEntry>) {
    if (!this.data) return;
    this.data = { ...this.data, shapes };
    this.updateLayers();
  }

  public setLineLadders(lineLadders: Record<string, any>) {
    if (!this.data) return;
    this.data = { ...this.data, lineLadders };
    const displayStations = deduplicateStations(this.data.stations);
    this.cachedTerminusMarkers = this.resolveTerminusMarkers(this.data.lines, displayStations);
    this.staticLayersDirty = true;
    this.updateLayers();
  }

  public setMap(map: maplibregl.Map): void {
    this.map = map;
    this.syncSubsurfaceMode(true);
    if (typeof (map as { once?: unknown }).once === 'function') {
      try {
        map.once('load', () => {
          const prevBeforeId = this.undergroundBeforeId;
          this.syncSubsurfaceMode(true);
          if (prevBeforeId !== this.undergroundBeforeId) {
            this.updateLayers();
          }
        });
      } catch {
        // Ignore in minimal mock maps
      }
    }
  }

  private syncSubsurfaceMode(force = false): void {
    const isFollowing = Boolean(this.followElevationLineId);
    // Render underground tracks, stations, platforms, and trains beneath the street surface
    // whenever pitched in 3D or following a train, while keeping 3D buildings 100% opaque
    // unless the user explicitly enables X-Ray mode.
    const isSubsurface = this.pitch >= 12 || isFollowing || this.xrayMode;
    let hasLanduseLayer = false;
    try {
      hasLanduseLayer = Boolean(this.map?.getLayer?.('landuse-urban'));
    } catch {
      hasLanduseLayer = false;
    }
    const nextBeforeId = isSubsurface && hasLanduseLayer ? 'landuse-urban' : undefined;
    if (nextBeforeId !== this.undergroundBeforeId) {
      this.undergroundBeforeId = nextBeforeId;
      this.staticLayersDirty = true;
      this.localDetailDirty = true;
    }
    if (this.map) {
      const baseMix = computeSubsurfaceMix(this.pitch, isFollowing);
      const mix = this.xrayMode ? Math.max(baseMix, 1) : baseMix;
      setSubsurfaceMapMode(this.map, mix, this.theme, force, this.xrayMode);
    }
  }

  public setViewState(
    zoom: number,
    mapCenter: [number, number],
    bounds?: [[number, number], [number, number]] | null,
    pitch: number = 0
  ) {
    const zoomChanged = Math.abs(this.zoom - zoom) > 0.04;
    const centerChanged =
      Math.abs(this.mapCenter[0] - mapCenter[0]) > 0.004 ||
      Math.abs(this.mapCenter[1] - mapCenter[1]) > 0.004;
    const subsurfaceBandChanged = this.pitch >= 12 !== pitch >= 12;
    const pitchBandChanged = this.pitch >= 45 !== pitch >= 45 || subsurfaceBandChanged;
    this.zoom = zoom;
    this.pitch = pitch;
    this.syncSubsurfaceMode();
    if (subsurfaceBandChanged) {
      this.staticLayersDirty = true;
      this.localDetailDirty = true;
    }
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('debug') === 'trains'
    ) {
      (window as any).__deckOverlayZoom = zoom;
    }
    if (bounds) {
      this.bounds = bounds;
    }
    const detailZoomBucket =
      zoom < STATION_DETAIL_ZOOM_MIN ? 0 : zoom < 15.2 ? 1 : zoom < 16.0 ? 2 : zoom < 17.5 ? 3 : 4;
    const moveThreshold = zoom >= 17.0 ? 0.0005 : 0.0009;
    const detailMoved =
      this.zoom >= STATION_DETAIL_ZOOM_MIN &&
      (!this.localDetailAnchor ||
        Math.abs(this.localDetailAnchor[0] - mapCenter[0]) > moveThreshold ||
        Math.abs(this.localDetailAnchor[1] - mapCenter[1]) > moveThreshold);
    const detailZoomChanged = detailZoomBucket !== this.localDetailZoomBucket;
    if (detailMoved || detailZoomChanged) {
      this.localDetailDirty = true;
    }

    if (zoomChanged || centerChanged) {
      this.mapCenter = mapCenter;
      this.staticLayersDirty = true;
      this.localDetailDirty = true;
      this.landmarksDirty = true;
      this.updateLayers();
    } else if (pitchBandChanged || detailMoved || detailZoomChanged) {
      this.mapCenter = mapCenter;
      this.landmarksDirty = true;
      this.updateLayers();
    }
    this.syncStationBuildingCutout(zoom, mapCenter);
  }

  private syncStationBuildingCutout(zoom: number, center: [number, number]) {
    if (!this.map) return;
    let cutoutCenter: [number, number] | null = null;
    if (zoom >= 16.0 && this.buildingsVisible && !this.xrayMode) {
      const [cLng, cLat] = center;
      const cosLat = Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
      let bestDistSq = (140 / 111320) ** 2;
      for (const st of this.cachedDisplayStations) {
        const dLat = st.coordinates[1] - cLat;
        const dLng = (st.coordinates[0] - cLng) * cosLat;
        const dSq = dLat * dLat + dLng * dLng;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          cutoutCenter = st.coordinates;
        }
      }
    }
    setStationBuildingCutout(this.map, cutoutCenter, 70);
  }

  public setData(data: SubwayMapData) {
    this.data = data;
    this.lineMap = new Map(data.lines.map((l) => [l.id, l]));
    this.showRer = true;
    this.hubRegistry = buildHubRegistry(data.stations, data.lines);
    this.roundedTrackPaths = new WeakMap();
    for (const track of data.tracks) {
      this.roundedTrackPaths.set(track, roundPathCorners(track.coordinates));
    }
    const displayStations = deduplicateStations(data.stations);
    this.cachedTerminusMarkers = this.resolveTerminusMarkers(data.lines, displayStations);
    this.staticLayersDirty = true;
    this.updateLayers();
  }

  public setSelectedLine(lineId: string | null) {
    if (this.selectedLineId === lineId) return;
    this.selectedLineId = lineId;
    this.staticLayersDirty = true;
    this.localDetailDirty = true;
    this.landmarksDirty = true;
    this.updateLayers();
  }

  public setActiveItinerary(itinerary: TransitItinerary | null) {
    this.activeItinerary = itinerary;
    this.staticLayersDirty = true;
    this.updateLayers();
  }

  public setUserLocation(
    loc: {
      lng: number;
      lat: number;
      accuracyM: number;
      headingDeg: number | null;
    } | null
  ) {
    this.userLocation = loc;
    this.staticLayersDirty = true;
    this.updateLayers();
  }

  public setTheme(theme: 'dark' | 'light') {
    if (this.theme === theme) return;
    this.theme = theme;
    this.syncSubsurfaceMode(true);
    this.staticLayersDirty = true;
    this.localDetailDirty = true;
    this.landmarksDirty = true;
    this.updateLayers();
  }

  public setSelectedTrain(trainId: string | null) {
    this.selectedTrainId = trainId;
    if (trainId && this.data?.rollingStockDb && trainModelsEnabled()) {
      const target = this.trains.find((t) => t.id === trainId);
      if (target) {
        requestTrainModel(target, this.data.rollingStockDb, { priority: 'high' });
      }
    }
    this.updateLayers();
  }

  public setSelectedTrainId(trainId: string | null) {
    this.setSelectedTrain(trainId);
  }

  public setFollowElevation(lineId: string | null, offset: number): void {
    const lineChanged = this.followElevationLineId !== lineId;
    this.followElevationLineId = lineId;
    this.followElevationOffset = offset;
    this.syncSubsurfaceMode(lineChanged);
    if (
      lineChanged ||
      Math.abs(offset - this.localDetailFollowOffset) >= 0.8 ||
      (offset === 0 && this.localDetailFollowOffset !== 0)
    ) {
      this.localDetailFollowOffset = offset;
      this.localDetailDirty = true;
    }
    if (lineChanged) {
      this.staticLayersDirty = true;
    }
    this.updateLayers();
  }

  private updateLayers() {
    if (typeof requestAnimationFrame === 'undefined' || document.hidden) {
      this.renderLayersNow();
      return;
    }
    if (this.layerUpdateFrame !== null) return;
    this.layerUpdateFrame = requestAnimationFrame(() => {
      this.layerUpdateFrame = null;
      this.renderLayersNow();
    });
  }

  private renderLayersNow() {
    try {
      this.renderLayers();
    } catch (error) {
      console.error('[deck] layer update failed', error);
      const debug =
        document.getElementById('deck-debug') ||
        document.body.appendChild(document.createElement('pre'));
      debug.id = 'deck-debug';
      debug.textContent = `Rendu réseau indisponible: ${error instanceof Error ? error.message : String(error)}`;
      debug.setAttribute(
        'style',
        'position:fixed;left:24px;bottom:24px;z-index:9999;color:var(--texte,#f4f1eb);background:var(--surface,#161413);border:1px solid var(--carmin,#d9463c);border-radius:var(--r-card,14px);padding:10px 14px;font-family:var(--font,sans-serif);font-size:13px;white-space:pre-wrap;max-width:60vw'
      );
    }
  }

  private renderLayers() {
    if (!this.data) return;

    if (this.staticLayersDirty) {
      this.rebuildStaticLayers();
      this.staticLayersDirty = false;
      this.localDetailDirty = true;
    }

    if (this.localDetailDirty) {
      this.localDetailAnchor = [this.mapCenter[0], this.mapCenter[1]];
      this.localDetailZoomBucket =
        this.zoom < STATION_DETAIL_ZOOM_MIN
          ? 0
          : this.zoom < 15.2
            ? 1
            : this.zoom < 16.0
              ? 2
              : this.zoom < 17.5
                ? 3
                : 4;
      const lodBundle = createLocalStationDetailBundle({
        lines: this.data.lines,
        stations: this.cachedDisplayStations,
        tracksByLine: this.cachedTracksCoordsByLine,
        selectedLineId: this.selectedLineId,
        zoom: this.zoom,
        mapCenter: this.mapCenter,
        theme: this.theme,
        followElevation: this.followElevationLineId
          ? { lineId: this.followElevationLineId, offset: this.followElevationOffset }
          : undefined,
        hubRegistry: this.hubRegistry,
        undergroundBeforeId: this.undergroundBeforeId,
        xrayMode: this.xrayMode,
      });

      this.cachedLocalDetailLayers = lodBundle.layers;
      this.cachedSielAnchors = lodBundle.sielAnchors;
      this.localDetailDirty = false;
    }

    this.syncStationBuildingCutout(this.zoom, this.mapCenter);

    if (this.landmarksDirty) {
      this.cachedLandmarkLayers = createLandmarksLayers({
        zoom: this.zoom,
        pitch: this.pitch,
        mapCenter: this.mapCenter,
        visible: this.buildingsVisible && !this.xrayMode,
        cityId: this.cityId,
        theme: this.theme,
      });
      this.landmarksDirty = false;
    }

    const seineLayers = createSeineRiverLayers({
      zoom: this.zoom,
      pitch: this.pitch,
      theme: this.theme,
      cityId: this.cityId,
      xrayMode: this.xrayMode,
      bounds: this.bounds,
    });

    const trainLayers = this.buildTrainLayers();
    const layers: any[] = [
      ...this.cachedPreTrainLayers,
      ...this.cachedLocalDetailLayers,
      ...seineLayers,
      ...trainLayers,
      ...this.cachedLandmarkLayers,
    ];
    const trainModelSpikeLayer = createTrainModelSpikeLayer();
    if (trainModelSpikeLayer) {
      layers.push(trainModelSpikeLayer);
    }
    layers.push(...this.cachedPostTrainLayers);

    this.overlay.setProps({
      layers,
      onClick: (info: any) => {
        if (!info.object) this.onBackgroundClick();
      },
    });
  }

  private rebuildStaticLayers() {
    if (!this.data) return;

    const { tracks, stations, lines } = this.data;
    const lineMap = new Map(lines.map((l) => [l.id, l]));
    const selectedLine = this.selectedLineId ? lineMap.get(this.selectedLineId) : null;
    const selectedRerShortName = selectedLine?.mode === 'rail' ? selectedLine.short_name : null;
    const selectedLinePaths = selectedLine
      ? selectedLine.mode === 'rail'
        ? this.rerTracks
            .filter((track) => track.shortName === selectedRerShortName)
            .map((track) => track.coordinates)
        : tracks
            .filter((track) => track.line_id === selectedLine.id)
            .map((track) => track.coordinates)
      : [];
    const rawDisplayStations =
      selectedLine && selectedLinePaths.length
        ? stations.map((station) =>
            station.lines.includes(selectedLine.id)
              ? {
                  ...station,
                  coordinates: snapPointToPaths(station.coordinates, selectedLinePaths),
                }
              : station
          )
        : stations;
    const displayStations = deduplicateStations(rawDisplayStations);

    // 1. Gained tracks: each line is an adjacent [casing, fill] pair.
    //
    // A single casing layer followed by a single fill layer would make every
    // casing sit below every fill. Splitting by line keeps the pair atomic and
    // makes the layer order itself the crossing order. The effective order is
    // derived from elevation_offset, with line 14 explicitly deepest and the
    // known aerial lines 2/6 explicitly on top of the weave.
    const tracksByLine = new Map<string, TrackItem[]>();
    for (const track of tracks) {
      const lineTracks = tracksByLine.get(track.line_id) || [];
      lineTracks.push(track);
      tracksByLine.set(track.line_id, lineTracks);
    }

    const lineOrder = lines
      .filter((line) => tracksByLine.has(line.id))
      .slice()
      .sort((a, b) => {
        const orderKey = (line: LineMetadata): number => {
          if (line.short_name === '14') return Number.NEGATIVE_INFINITY;
          if (line.short_name === '2' || line.short_name === '6') return Number.POSITIVE_INFINITY;
          // Higher declared offset is drawn earlier, leaving the shallower
          // lines on top at a crossing.
          return -line.elevation_offset;
        };
        return orderKey(a) - orderKey(b) || a.short_name.localeCompare(b.short_name, 'fr');
      });

    const revealOrder = lines.slice().sort((a, b) => {
      const numberA = parseInt(a.short_name, 10);
      const numberB = parseInt(b.short_name, 10);
      return numberA - numberB || a.short_name.localeCompare(b.short_name, 'fr');
    });
    const revealIndex = new Map(revealOrder.map((line, index) => [line.id, index]));
    const revealCount = Math.max(1, revealOrder.length);
    const revealOpacityFor = (lineId: string): number => {
      const index = revealIndex.get(lineId) ?? 0;
      const localProgress = this.trackRevealProgress * revealCount - index;
      return Math.max(0, Math.min(1, easeOut(localProgress)));
    };

    const trackWidthAtZoom = (selected: boolean): number => {
      const z = Math.max(9, Math.min(17.5, this.zoom));
      const t = (z - 9) / 8.5;
      const baseWidth = 1.8 + t * (7.2 - 1.8);
      return selected ? baseWidth + 1.0 : baseWidth;
    };

    const pathForTrack = (d: TrackItem): [number, number, number][] => {
      const line = lineMap.get(d.line_id);
      const rounded = this.roundedTrackPaths.get(d) ?? roundPathCorners(d.coordinates);
      if (!line) return rounded.map((pt: [number, number]) => [pt[0], pt[1], 0]);
      return elevateTrackPath(rounded, line, this.hubRegistry);
    };

    const isLight = this.theme === 'light';
    const casingColor: [number, number, number, number] = isLight
      ? [244, 241, 235, 255]
      : [21, 14, 18, 255];
    const stationFillColor: [number, number, number, number] = isLight
      ? [28, 25, 23, 245]
      : [241, 239, 234, 245];

    const pathLayers: any[] = [];
    const visibleLineOrder = this.selectedLineId
      ? lineOrder.filter((line) => line.id === this.selectedLineId)
      : lineOrder;
    const isSubsurface = Boolean(this.undergroundBeforeId);
    const ugBeforeId = this.undergroundBeforeId;
    const trackDepthParams = {
      depthTest: isSubsurface,
      depthWriteEnabled: false,
    } as any;
    const viaductShadowTracks: TrackItem[] = [];

    const pushTrackGroup = (
      idPrefix: string,
      dataSlice: TrackItem[],
      line: LineMetadata,
      isSelected: boolean,
      beforeId?: string,
      withTunnelEnvelope = false
    ) => {
      if (dataSlice.length === 0) return;
      const beforeProps = beforeId ? { beforeId } : {};
      if (withTunnelEnvelope && isSubsurface && this.zoom >= 11.2) {
        const glowAlpha = this.xrayMode ? (isLight ? 95 : 135) : isLight ? 68 : 96;
        const glowWidth = this.xrayMode ? 11.5 : 9.2;
        pathLayers.push(
          new PathLayer<TrackItem>({
            id: `${idPrefix}-tunnel`,
            data: dataSlice,
            ...beforeProps,
            pickable: false,
            widthUnits: 'meters',
            getWidth: glowWidth,
            getPath: pathForTrack as any,
            getColor: () => {
              const colorHex = line.color || '#6B7280';
              return hexToRgba(colorHex, glowAlpha);
            },
            opacity: revealOpacityFor(line.id),
            capRounded: true,
            jointRounded: true,
            parameters: trackDepthParams,
            updateTriggers: {
              getColor: [this.theme, this.selectedLineId, this.xrayMode],
            },
          })
        );
      }
      pathLayers.push(
        new PathLayer<any>({
          id: `${idPrefix}-casing`,
          data: dataSlice,
          ...beforeProps,
          pickable: false,
          widthUnits: 'pixels',
          getWidth: () => trackWidthAtZoom(isSelected) + 3,
          getPath: pathForTrack as any,
          getColor: casingColor,
          opacity: revealOpacityFor(line.id),
          capRounded: true,
          jointRounded: true,
          parameters: trackDepthParams,
          transitions: { opacity: { duration: 140, easing: easeOut } } as any,
          updateTriggers: {
            getWidth: [this.zoom, this.selectedLineId],
            getColor: [this.theme],
          },
        }),
        new PathLayer<any>({
          id: `${idPrefix}-fill`,
          data: dataSlice,
          ...beforeProps,
          pickable: true,
          widthUnits: 'pixels',
          getWidth: () => trackWidthAtZoom(isSelected),
          getPath: pathForTrack as any,
          getColor: (d: TrackItem) => {
            const colorHex = d.stroke || line.color || '#CCCCCC';
            return hexToRgba(colorHex, 255);
          },
          opacity: revealOpacityFor(line.id),
          autoHighlight: true,
          highlightColor: [255, 255, 255, 55],
          capRounded: true,
          jointRounded: true,
          parameters: trackDepthParams,
          transitions: {
            getColor: { duration: 200, easing: easeOut },
            opacity: { duration: 140, easing: easeOut },
          } as any,
          updateTriggers: {
            getWidth: [this.zoom, this.selectedLineId],
            getColor: [this.selectedLineId],
          },
        })
      );
    };

    for (const line of visibleLineOrder) {
      const lineTracks = tracksByLine.get(line.id) || [];
      const isSelected = !this.selectedLineId || line.id === this.selectedLineId;
      const safeId = line.short_name.replace(/[^a-zA-Z0-9_-]/g, '-');
      const undergroundTracks: TrackItem[] = [];
      const viaductTracks: TrackItem[] = [];
      for (const track of lineTracks) {
        const rounded = this.roundedTrackPaths.get(track) ?? roundPathCorners(track.coordinates);
        const split = splitTrackByViaduct(track, rounded, line.short_name, this.roundedTrackPaths);
        undergroundTracks.push(...split.underground);
        viaductTracks.push(...split.viaduct);
      }
      if (this.zoom >= 13.5 && viaductTracks.length > 0) {
        viaductShadowTracks.push(...viaductTracks);
      }
      pushTrackGroup(
        `subway-track-${safeId}`,
        undergroundTracks,
        line,
        isSelected,
        ugBeforeId,
        true
      );
      pushTrackGroup(`subway-track-${safeId}-viaduct`, viaductTracks, line, isSelected);
    }

    const viaductShadowLayer =
      viaductShadowTracks.length > 0
        ? new PathLayer<TrackItem>({
            id: 'subway-viaduct-shadows',
            data: viaductShadowTracks,
            pickable: false,
            widthUnits: 'meters',
            getWidth: 4.8,
            getPath: ((d: TrackItem) => {
              const rounded = this.roundedTrackPaths.get(d) ?? roundPathCorners(d.coordinates);
              return rounded.map((pt: [number, number]) => [pt[0], pt[1], 0.15]);
            }) as any,
            getColor: isLight ? [20, 18, 16, 55] : [0, 0, 0, 110],
            capRounded: true,
            jointRounded: true,
            parameters: { depthTest: true, depthWriteEnabled: false } as any,
          })
        : null;

    // 2. ScatterplotLayer for Stations (Hiérarchisation stricte par niveau de zoom)
    const isUltraHub = (st: StationMetadata) =>
      st.lines.length >= 4 ||
      /^(Châtelet|Gare du Nord|Montparnasse|Saint-Lazare|Gare de Lyon|Gare de l'Est|Gare d'Austerlitz|République|Nation|Bastille|Charles de Gaulle|La Défense|Opéra|Denfert-Rochereau|King's Cross|Victoria|Waterloo|Oxford Circus|Bank|London Bridge|Paddington|Liverpool Street|Piccadilly Circus|Stratford|Westminster|Baker Street|Charing Cross|South Kensington|Holborn|Euston)$/i.test(
        st.name
      ) ||
      /Châtelet - Les Halles|Montparnasse - Bienvenüe|Charles de Gaulle - Étoile|La Défense \(Grande Arche\)|King's Cross St\. Pancras|Bank - Monument/i.test(
        st.name
      );

    const filteredStations = displayStations.filter((st) => {
      // 1. Ligne sélectionnée : détail complet conservé quel que soit le zoom
      if (this.selectedLineId) {
        return st.lines.includes(this.selectedLineId);
      }
      // 2. Vue éloignée (z < 12.5) : uniquement les 15 grands pôles ultra-majeurs
      if (this.zoom < 12.5) {
        return isUltraHub(st);
      }
      // 3. Zoom intermédiaire (12.5 <= z < 14.0) : apparition des stations de correspondance (>= 2 lignes)
      if (this.zoom < 14.0) {
        return isUltraHub(st) || st.lines.length >= 2 || Boolean(st.is_hub);
      }
      // 4. Zoom rapproché (z >= 14.0) : toutes les stations
      return true;
    });

    const stationsLayer = new ScatterplotLayer({
      id: 'subway-stations',
      data: filteredStations,
      pickable: true,
      visible: Boolean(this.selectedLineId) || this.zoom >= 10.0,
      opacity: 0.95,
      stroked: true,
      filled: true,
      billboard: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 70],
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      getPosition: (d: StationMetadata) => [d.coordinates[0], d.coordinates[1], 2],
      getRadius: (d: StationMetadata) => {
        if (this.selectedLineId) {
          if (isUltraHub(d)) return 7.5;
          if (d.lines.length >= 2) return 5.5;
          return 4.0;
        }
        if (isUltraHub(d)) {
          return this.zoom < 12.5 ? 5.0 : this.zoom < 14 ? 7.0 : 8.5;
        }
        if (d.lines.length >= 2 || d.is_hub) {
          return this.zoom < 14 ? 4.5 : 6.0;
        }
        return this.zoom < 15.0 ? 3.5 : 4.5;
      },
      getFillColor: () => stationFillColor,
      getLineColor: () => casingColor,
      getLineWidth: (d: StationMetadata) => {
        if (isUltraHub(d)) return 1.5;
        return 1.0;
      },
      parameters: { depthTest: false, depthWriteEnabled: false } as any,
      transitions: {
        getFillColor: { duration: 140, easing: easeOut },
        getLineColor: { duration: 140, easing: easeOut },
        getLineWidth: { duration: 140, easing: easeOut },
      } as any,
      onHover: this.onStationHover,
      onClick: (info: any) => {
        if (info.object) {
          this.onStationClick(info.object as StationMetadata);
        }
      },
      updateTriggers: {
        getPosition: [this.selectedLineId],
        getFillColor: [this.zoom, this.selectedLineId, this.theme],
        getLineColor: [this.zoom, this.selectedLineId, this.theme],
        getRadius: [this.zoom, this.selectedLineId],
        getLineWidth: [this.zoom, this.selectedLineId],
      },
    });

    const terminusMarkers = this.cachedTerminusMarkers;
    const filteredStationIds = new Set(filteredStations.map((station) => station.id));
    const visibleTermini = terminusMarkers.filter((marker) =>
      filteredStationIds.has(marker.station.id)
    );
    const terminusLayer = new ScatterplotLayer<TerminusMarker>({
      id: 'subway-termini',
      data: visibleTermini,
      pickable: false,
      visible: Boolean(this.selectedLineId) || this.zoom >= 13.5,
      opacity: 1,
      stroked: true,
      filled: true,
      billboard: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      getPosition: (d: TerminusMarker) => [
        d.station.coordinates[0],
        d.station.coordinates[1],
        d.elevation + 2.5,
      ],
      getRadius: (d: TerminusMarker) => (this.selectedLineId ? 9 : this.zoom < 14 ? 6.5 : 9),
      getFillColor: casingColor,
      getLineColor: (d: TerminusMarker) => {
        return hexToRgba(d.lineColor, 255);
      },
      getLineWidth: 2,
      parameters: { depthTest: false, depthWriteEnabled: false } as any,
      updateTriggers: {
        getPosition: [this.zoom, this.selectedLineId],
        getRadius: [this.zoom, this.selectedLineId],
        getLineColor: [this.selectedLineId],
        getFillColor: [this.theme],
      },
    });

    const lineElev = selectedLine ? selectedLine.elevation_offset : 0;
    // At z >= 15.8, in-world station name plaques (`station-lod-names`) take over cleanly
    // near the center so we skip floating billboard labels that would double up on platforms.
    const labelsLayer =
      this.zoom >= 16.0
        ? null
        : createStationLabelsLayer(
            displayStations,
            this.selectedLineId,
            this.zoom,
            this.mapCenter,
            lineElev
          );
    const tracksCoordsByLine = new Map<string, [number, number][][]>();
    for (const [lineId, lineTracks] of tracksByLine.entries()) {
      tracksCoordsByLine.set(
        lineId,
        lineTracks.map((t) => this.roundedTrackPaths.get(t) ?? roundPathCorners(t.coordinates))
      );
    }
    this.cachedDisplayStations = displayStations;
    this.cachedTracksCoordsByLine = tracksCoordsByLine;
    const isPlatformEligible = selectedLine?.mode === 'metro' || selectedLine?.mode === 'tube';
    const platformsLayers = createPlatformsLayers(
      displayStations,
      isPlatformEligible ? selectedLine : null,
      isPlatformEligible ? selectedLinePaths : [],
      this.zoom,
      this.theme,
      selectedLine ? undefined : { lines, tracksByLine: tracksCoordsByLine },
      this.followElevationLineId
        ? { lineId: this.followElevationLineId, offset: this.followElevationOffset }
        : undefined,
      this.hubRegistry,
      this.undergroundBeforeId
    );

    const railLineByShortName = new Map<string, LineMetadata>();
    for (const candidate of lines) {
      if (candidate.mode !== 'rail') continue;
      const key = candidate.short_name
        .replace(/^RER\s*/i, '')
        .trim()
        .toUpperCase();
      railLineByShortName.set(key, candidate);
      railLineByShortName.set(candidate.short_name.trim().toUpperCase(), candidate);
    }

    let rerLayer: any = null;
    if (this.showRer && this.rerTracks.length > 0) {
      rerLayer = new PathLayer<any>({
        id: 'rer-tracks',
        data: selectedRerShortName
          ? this.rerTracks.filter((track) => track.shortName === selectedRerShortName)
          : this.selectedLineId
            ? []
            : this.rerTracks,
        ...(this.undergroundBeforeId ? { beforeId: this.undergroundBeforeId } : {}),
        pickable: false,
        widthUnits: 'pixels',
        getWidth: 3.5, // 3.5px vs 2.5px métro
        getPath: ((d: RerTrackSegment) => {
          const rounded = this.roundedRerPaths.get(d) ?? roundPathCorners(d.coordinates);
          const key = d.shortName
            .replace(/^RER\s*/i, '')
            .trim()
            .toUpperCase();
          const railLine =
            railLineByShortName.get(key) ??
            railLineByShortName.get(d.shortName.trim().toUpperCase());
          if (railLine) {
            return elevateTrackPath(rounded, railLine, this.hubRegistry);
          }
          return rounded.map((pt) => [pt[0], pt[1], -22]);
        }) as any,
        getColor: (d: RerTrackSegment) => {
          const baseAlpha = d.isBanlieue ? 130 : 230;
          return hexToRgba(d.color, baseAlpha);
        },
        extensions: [new PathStyleExtension({ dash: true })],
        getDashArray: (d: RerTrackSegment) => (d.isBanlieue ? [4, 3] : [0, 0]),
        dashUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        parameters: {
          depthTest: Boolean(this.undergroundBeforeId),
          depthWriteEnabled: false,
        } as any,
      } as any);
    }

    const lineHitboxes = visibleLineOrder.map(
      (line) =>
        new PathLayer<any>({
          id: `subway-track-${line.short_name.replace(/[^a-zA-Z0-9_-]/g, '-')}-hitbox`,
          data: tracksByLine.get(line.id) || [],
          pickable: true,
          widthUnits: 'pixels',
          getWidth: () => trackWidthAtZoom(false) + 14,
          getPath: pathForTrack as any,
          getColor: [0, 0, 0, 0],
          opacity: revealOpacityFor(line.id),
          capRounded: true,
          jointRounded: true,
          parameters: { depthTest: false, depthWriteEnabled: false } as any,
          onClick: () => this.onLineSelect(line.id),
          onHover: this.onStationHover,
          updateTriggers: { getWidth: [this.zoom] },
        })
    );

    const itineraryLayers: any[] = [];
    if (this.activeItinerary) {
      const walkSegments = this.activeItinerary.legs
        .filter((leg) => (leg.kind === 'walk' || leg.kind === 'transfer') && leg.path?.length)
        .map((leg) => ({
          path: leg.path!.map(([lng, lat]) => [lng, lat, 1.2] as [number, number, number]),
          kind: leg.kind,
        }));
      const rideSegments = this.activeItinerary.legs
        .filter((leg) => leg.kind === 'ride' && leg.path && leg.path.length >= 2)
        .map((leg) => {
          const legLine = leg.lineId ? lineMap.get(leg.lineId) : undefined;
          return {
            path: legLine
              ? elevateTrackPath(leg.path!, legLine, this.hubRegistry).map(
                  ([lng, lat, z]) => [lng, lat, z + 0.6] as [number, number, number]
                )
              : leg.path!.map(([lng, lat]) => [lng, lat, 2.5] as [number, number, number]),
            color: hexToRgba(leg.lineColor || '#C9A227', 255),
          };
        });

      if (rideSegments.length > 0) {
        itineraryLayers.push(
          new PathLayer({
            id: 'itinerary-ride-glow',
            data: rideSegments,
            pickable: false,
            widthUnits: 'pixels',
            getWidth: 8,
            getPath: (d: any) => d.path,
            getColor: [201, 162, 39, 150],
            capRounded: true,
            jointRounded: true,
            parameters: { depthTest: false, depthWriteEnabled: false } as any,
          }),
          new PathLayer({
            id: 'itinerary-ride-core',
            data: rideSegments,
            pickable: false,
            widthUnits: 'pixels',
            getWidth: 4.5,
            getPath: (d: any) => d.path,
            getColor: (d: any) => d.color,
            capRounded: true,
            jointRounded: true,
            parameters: { depthTest: false, depthWriteEnabled: false } as any,
          })
        );
      }
      if (walkSegments.length > 0) {
        itineraryLayers.push(
          new PathLayer({
            id: 'itinerary-walk-paths',
            data: walkSegments,
            pickable: false,
            widthUnits: 'pixels',
            getWidth: 3.5,
            getPath: (d: any) => d.path,
            getColor: [201, 162, 39, 240],
            extensions: [new PathStyleExtension({ dash: true })],
            getDashArray: [6, 4],
            dashUnits: 'pixels',
            capRounded: true,
            parameters: { depthTest: false, depthWriteEnabled: false } as any,
          } as any)
        );
      }

      const endpoints = [
        {
          position: [
            this.activeItinerary.origin.coordinates[0],
            this.activeItinerary.origin.coordinates[1],
            6,
          ] as [number, number, number],
          tag: 'A',
          fill: [34, 197, 94, 245] as [number, number, number, number],
        },
        {
          position: [
            this.activeItinerary.destination.coordinates[0],
            this.activeItinerary.destination.coordinates[1],
            6,
          ] as [number, number, number],
          tag: 'B',
          fill: [201, 162, 39, 250] as [number, number, number, number],
        },
      ];
      itineraryLayers.push(
        new ScatterplotLayer({
          id: 'itinerary-endpoint-pins',
          data: endpoints,
          pickable: false,
          billboard: true,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          getPosition: (d: any) => d.position,
          getRadius: 11,
          getFillColor: (d: any) => d.fill,
          getLineColor: [21, 14, 18, 255],
          getLineWidth: 2,
          parameters: { depthTest: false, depthWriteEnabled: false } as any,
        }),
        new TextLayer({
          id: 'itinerary-endpoint-labels',
          data: endpoints,
          pickable: false,
          billboard: true,
          characterSet: LATIN_CHARACTER_SET,
          sizeUnits: 'pixels',
          getPosition: (d: any) => d.position,
          getText: (d: any) => d.tag,
          getSize: 12,
          getColor: [18, 16, 14, 255],
          fontFamily: 'Switzer, system-ui, sans-serif',
          fontWeight: 700,
          getTextAnchor: () => 'middle',
          getAlignmentBaseline: () => 'center',
          parameters: { depthTest: false, depthWriteEnabled: false } as any,
        })
      );
    }

    const gpsLayers: any[] = [];
    if (this.userLocation) {
      const { lng, lat, accuracyM, headingDeg } = this.userLocation;
      gpsLayers.push(
        new ScatterplotLayer({
          id: 'user-gps-accuracy-halo',
          data: [{ position: [lng, lat, 1.5], radius: Math.max(18, Math.min(250, accuracyM)) }],
          pickable: false,
          filled: true,
          stroked: true,
          radiusUnits: 'meters',
          lineWidthUnits: 'pixels',
          getPosition: (d: any) => d.position,
          getRadius: (d: any) => d.radius,
          getFillColor: [59, 130, 246, 36],
          getLineColor: [59, 130, 246, 125],
          getLineWidth: 1,
          parameters: { depthTest: false, depthWriteEnabled: false } as any,
        })
      );
      if (headingDeg !== null && Number.isFinite(headingDeg)) {
        const rad = (headingDeg * Math.PI) / 180;
        const mPerDegLat = 111320;
        const mPerDegLng = mPerDegLat * Math.cos((lat * Math.PI) / 180);
        const tipLng = lng + (Math.sin(rad) * 38) / mPerDegLng;
        const tipLat = lat + (Math.cos(rad) * 38) / mPerDegLat;
        gpsLayers.push(
          new PathLayer({
            id: 'user-gps-heading-beam',
            data: [
              {
                path: [
                  [lng, lat, 2],
                  [tipLng, tipLat, 2],
                ],
              },
            ],
            pickable: false,
            widthUnits: 'pixels',
            getPath: (d: any) => d.path,
            getColor: [37, 99, 235, 195],
            getWidth: 5,
            capRounded: true,
            parameters: { depthTest: false, depthWriteEnabled: false } as any,
          })
        );
      }
      gpsLayers.push(
        new ScatterplotLayer({
          id: 'user-gps-dot',
          data: [{ position: [lng, lat, 2.5] }],
          pickable: false,
          billboard: true,
          filled: true,
          stroked: true,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          getPosition: (d: any) => d.position,
          getRadius: 7,
          getFillColor: [37, 99, 235, 255],
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 2.5,
          parameters: { depthTest: false, depthWriteEnabled: false } as any,
        })
      );
    }

    this.cachedPreTrainLayers = [
      ...(rerLayer ? [rerLayer] : []),
      ...(viaductShadowLayer ? [viaductShadowLayer] : []),
      ...lineHitboxes,
      ...pathLayers,
      ...platformsLayers,
      ...itineraryLayers,
      stationsLayer,
      ...gpsLayers,
      terminusLayer,
    ];
    this.cachedPostTrainLayers = labelsLayer ? [labelsLayer] : [];
  }

  private buildTrainLayers(): readonly any[] {
    if (!this.data) return [];
    // Hide moving train dots/capsules when zoomed out (z < 13.0) unless a specific
    // line or train is selected — saves GPU & battery and keeps the city map clean.
    if (this.zoom < TRAIN_MODEL_ZOOM_THRESHOLD && !this.selectedLineId && !this.selectedTrainId) {
      return [];
    }
    const { tracks } = this.data;

    const mobileGpu = isMobileGpuDevice();
    const prefetchZoomMin = mobileGpu
      ? TRAIN_MODEL_ZOOM_THRESHOLD
      : TRAIN_MODEL_ZOOM_THRESHOLD - 1.0;
    const prefetchModels = trainModelsEnabled() && this.zoom >= prefetchZoomMin;
    const showTrainModels = trainModelsEnabled() && this.zoom >= TRAIN_MODEL_ZOOM_THRESHOLD;

    // 1. Always prioritize the followed/selected train's 3D model first so it loads
    //    during the camera flight without competing with background trains.
    let waitingForFollowedModel = false;
    if (this.selectedTrainId && this.data?.rollingStockDb && trainModelsEnabled()) {
      const selectedTrain = this.trains.find((t) => t.id === this.selectedTrainId);
      if (selectedTrain) {
        requestTrainModel(selectedTrain, this.data.rollingStockDb, { priority: 'high' });
        waitingForFollowedModel = !isTrainModelReadyForTrain(
          selectedTrain,
          this.data.rollingStockDb
        );
      }
    }

    // 2. Bounded, center-prioritized background prefetching (prevents 50-GLB network stampede on mobile)
    if (prefetchModels && !waitingForFollowedModel && this.data?.rollingStockDb) {
      const b = this.bounds;
      const visibleCandidates: Array<{ train: TrainMarker; distSq: number }> = [];
      const [cLng, cLat] = this.mapCenter;
      for (const train of this.trains) {
        if (b) {
          const [[west, south], [east, north]] = b;
          const marginLng = (east - west) * 0.15;
          const marginLat = (north - south) * 0.15;
          if (
            train.pos[0] < west - marginLng ||
            train.pos[0] > east + marginLng ||
            train.pos[1] < south - marginLat ||
            train.pos[1] > north + marginLat
          ) {
            continue;
          }
        }
        const dx = train.pos[0] - cLng;
        const dy = train.pos[1] - cLat;
        visibleCandidates.push({ train, distSq: dx * dx + dy * dy });
      }
      visibleCandidates.sort((a, bItem) => a.distSq - bItem.distSq);
      const maxPrefetchFamilies = mobileGpu ? 3 : 8;
      const prefetchedLines = new Set<string>();
      for (const { train } of visibleCandidates) {
        const lineKey = train.line || train.lineName;
        if (prefetchedLines.has(lineKey)) continue;
        prefetchedLines.add(lineKey);
        requestTrainModel(train, this.data.rollingStockDb, { priority: 'normal' });
        if (prefetchedLines.size >= maxPrefetchFamilies) break;
      }
    }

    const modelLayers =
      showTrainModels && this.data?.shapes && this.data?.rollingStockDb
        ? createTrainModelLayers({
            trains: this.trains,
            shapes: this.data.shapes,
            rollingStockDb: this.data.rollingStockDb,
            grazingCamera: this.pitch >= 45,
            bounds: this.bounds,
            selectedTrainId: this.selectedTrainId,
            elevationOffset: this.followElevationLineId
              ? { lineId: this.followElevationLineId, offset: this.followElevationOffset }
              : undefined,
            zoom: this.zoom,
            lineMap: this.lineMap,
            hubRegistry: this.hubRegistry,
            undergroundBeforeId: this.undergroundBeforeId,
            onClick: (train) => {
              if (this.data?.rollingStockDb) {
                requestTrainModel(train, this.data.rollingStockDb, { priority: 'high' });
              }
              this.selectedTrainId = train.id;
              this.onTrainClick(train);
              this.updateLayers();
            },
            onHover: this.onTrainHover,
          })
        : [];

    const fallbackTrains =
      showTrainModels && this.data?.rollingStockDb && modelLayers.length > 0
        ? this.trains.filter(
            (train) => !isTrainModelReadyForTrain(train, this.data!.rollingStockDb!)
          )
        : this.trains;

    const capsuleLayers =
      fallbackTrains.length === 0
        ? []
        : this.data?.shapes && this.data?.rollingStockDb
          ? createCapsuleLayers({
              trains: fallbackTrains,
              shapes: this.data.shapes,
              tracks,
              rollingStockDb: this.data.rollingStockDb,
              mapCenter: this.mapCenter,
              selectedLineId: this.selectedLineId,
              selectedTrainId: this.selectedTrainId,
              zoom: this.zoom,
              undergroundBeforeId: this.undergroundBeforeId,
              onHover: this.onTrainHover,
              onClick: (train) => {
                if (this.data?.rollingStockDb) {
                  requestTrainModel(train, this.data.rollingStockDb, { priority: 'high' });
                }
                this.selectedTrainId = train.id;
                this.onTrainClick(train);
                this.updateLayers();
              },
            })
          : createTrainsLayers(
              fallbackTrains,
              this.selectedLineId,
              this.onTrainHover,
              this.onTrainClick,
              this.zoom
            );

    const resolved = isTrainModelSpikeEnabled()
      ? []
      : resolveTrainRenderLayers(modelLayers, capsuleLayers);

    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('debug') === 'trains'
    ) {
      (window as any).__trainDebug = {
        zoom: this.zoom,
        pitch: this.pitch,
        trainsCount: this.trains.length,
        hasRollingStock: Boolean(this.data?.rollingStockDb),
        hasShapes: Boolean(this.data?.shapes),
        undergroundBeforeId: this.undergroundBeforeId,
        modelLayersCount: modelLayers.length,
        capsuleLayersCount: capsuleLayers.length,
        resolvedCount: resolved.length,
      };
    }

    // Subtle panoramic night comet trails only when a line is focused at mid-zoom (13.0..13.5)
    if (
      this.theme === 'dark' &&
      this.zoom >= TRAIN_MODEL_ZOOM_THRESHOLD &&
      this.zoom < 13.5 &&
      this.trains.length > 0
    ) {
      const trailData: Array<{
        path: [number, number, number][];
        color: [number, number, number, number];
      }> = [];
      for (const train of this.trains) {
        if (train.atStop || (train.speedMps ?? 0) < 1.5 || !Number.isFinite(train.brg)) continue;
        const [lng, lat] = train.pos;
        const latScale = 111_320;
        const lonScale = latScale * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
        const rad = (train.brg * Math.PI) / 180;
        const tailLenM = Math.min(180, Math.max(70, (train.speedMps ?? 10) * 9));
        const tailLng = lng - (Math.sin(rad) * tailLenM) / lonScale;
        const tailLat = lat - (Math.cos(rad) * tailLenM) / latScale;
        const z = train.elevation ?? -7.5;
        trailData.push({
          path: [
            [tailLng, tailLat, z],
            [lng, lat, z],
          ],
          color: hexToRgba(train.colorHex || '#ffce00', 115),
        });
      }
      if (trailData.length > 0) {
        return [
          new PathLayer({
            id: 'subway-night-comet-trails',
            data: trailData,
            ...(this.undergroundBeforeId ? { beforeId: this.undergroundBeforeId } : {}),
            pickable: false,
            widthUnits: 'pixels',
            getPath: (d: any) => d.path,
            getColor: (d: any) => d.color,
            getWidth: 4.5,
            capRounded: true,
            parameters: { depthTest: false, depthWriteEnabled: false } as any,
          } as any),
          ...resolved,
        ];
      }
    }

    return resolved;
  }

  /**
   * Resolve line endpoints from the already-loaded ladder artifact. Ladder
   * nodes use stop-point IDs while stations.json uses commercial station IDs,
   * so endpoints are joined by the nearest station on the same line.
   */
  private resolveTerminusMarkers(
    lines: LineMetadata[],
    stations: StationMetadata[]
  ): TerminusMarker[] {
    const ladders = this.data?.lineLadders || {};
    const markers: TerminusMarker[] = [];
    const seen = new Set<string>();

    const nearestStation = (
      lineId: string,
      coordinates: [number, number]
    ): StationMetadata | null => {
      let best: StationMetadata | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const station of stations) {
        if (!station.lines.includes(lineId)) continue;
        const dx = station.coordinates[0] - coordinates[0];
        const dy = station.coordinates[1] - coordinates[1];
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          best = station;
          bestDistance = distance;
        }
      }
      return best;
    };

    for (const line of lines) {
      const ladder = ladders[line.id];
      if (!ladder?.directions) continue;
      const endpointNodes: any[] = [];
      for (const direction of Object.values(ladder.directions) as any[]) {
        if (direction?.stations?.length) {
          endpointNodes.push(
            direction.stations[0],
            direction.stations[direction.stations.length - 1]
          );
        }
        for (const branch of direction?.branches || []) {
          if (branch?.stations?.length) {
            endpointNodes.push(branch.stations[0], branch.stations[branch.stations.length - 1]);
          }
        }
      }

      for (const node of endpointNodes) {
        if (!node?.coordinates) continue;
        const station = nearestStation(line.id, node.coordinates as [number, number]);
        if (!station) continue;
        const markerKey = `${line.id}:${station.id}`;
        if (seen.has(markerKey)) continue;
        seen.add(markerKey);
        markers.push({
          station,
          lineId: line.id,
          lineColor: line.color,
          elevation: line.elevation_offset,
        });
      }
    }

    return markers;
  }

  public setTrains(trains: TrainMarker[], immediate: boolean = false) {
    if (this.data) {
      const lineMap =
        this.lineMap.size > 0 ? this.lineMap : new Map(this.data.lines.map((l) => [l.id, l]));
      this.trains = trains.map((train) => {
        const line = lineMap.get(train.line);
        if (!line) return train;
        const elev = resolveLineElevationAt(train.pos, line, this.hubRegistry);
        return elev === train.elevation ? train : { ...train, elevation: elev };
      });
    } else {
      this.trains = trains;
    }
    if (immediate) {
      if (this.layerUpdateFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.layerUpdateFrame);
        this.layerUpdateFrame = null;
      }
      this.renderLayersNow();
      return;
    }
    this.updateLayers();
  }

  /** Draw the network in line-index order during the initial reveal. */
  public startTrackReveal(durationMs: number = 1200) {
    if (this.trackRevealFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.trackRevealFrame);
      this.trackRevealFrame = null;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof requestAnimationFrame === 'undefined' || document.hidden) {
      this.trackRevealProgress = 1;
      this.staticLayersDirty = true;
      this.updateLayers();
      return;
    }

    this.trackRevealProgress = 0;
    this.staticLayersDirty = true;
    this.updateLayers();
    const startedAt = performance.now();
    const frame = (now: number) => {
      if (document.hidden) {
        this.trackRevealProgress = 1;
        this.trackRevealFrame = null;
        this.staticLayersDirty = true;
        this.updateLayers();
        return;
      }
      this.trackRevealProgress = Math.min(1, (now - startedAt) / durationMs);
      this.staticLayersDirty = true;
      this.updateLayers();
      if (this.trackRevealProgress < 1) {
        this.trackRevealFrame = requestAnimationFrame(frame);
      } else {
        this.trackRevealFrame = null;
      }
    };
    this.trackRevealFrame = requestAnimationFrame(frame);
  }
}
