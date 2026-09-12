import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer } from '@deck.gl/layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LineMetadata, StationMetadata } from '@paris-subway/shared';

import { createTrainsLayers, TrainMarker } from './trains_layer';
import { createStationLabelsLayer } from './labels_layer';
import { createCapsuleLayers } from './capsule_layer';
import { PathStyleExtension } from '@deck.gl/extensions';
import {
  createTrainModelSpikeLayer,
  createTrainModelSpikeLighting,
  isTrainModelSpikeEnabled
} from './train_model_spike';
import type { ShapeEntry } from '../sim/shapes';
import type { RollingStockDatabase } from '../sim/rolling_stock';
import {
  createTrainModelLayers,
  requestTrainModel,
  preloadTrainModels,
  subscribeTrainModelAssets,
  trainModelsEnabled,
  TRAIN_MODEL_ZOOM_THRESHOLD
} from './train_models_layer';
import { resolveTrainRenderLayers } from './train_render_fallback';
import { createPlatformsLayer } from './platforms_layer';

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
      alpha
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
        ? Math.max(0, Math.min(1, ((target[0] - a[0]) * vx + (target[1] - a[1]) * vy) / lengthSquared))
        : 0;
      const candidate: [number, number] = [
        path[index - 1][0] + (path[index][0] - path[index - 1][0]) * t,
        path[index - 1][1] + (path[index][1] - path[index - 1][1]) * t
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

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export class SubwayDeckOverlay {
  private overlay: MapboxOverlay;
  private data: SubwayMapData | null = null;
  private selectedLineId: string | null = null;
  private selectedTrainId: string | null = null;
  private trains: TrainMarker[] = [];
  private rerTracks: RerTrackSegment[] = [];
  private showRer: boolean = false;
  private zoom: number = 13;
  private pitch: number = 0;
  private followElevationLineId: string | null = null;
  private followElevationOffset = 0;
  private mapCenter: [number, number] = [2.3488, 48.8534];
  private bounds: [[number, number], [number, number]] | null = null;
  private trackRevealProgress = 1;
  private trackRevealFrame: number | null = null;
  private layerUpdateFrame: number | null = null;
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
    if (trainModelsEnabled()) {
      preloadTrainModels();
    }

    this.overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      effects: isTrainModelSpikeEnabled() || trainModelsEnabled() ? [createTrainModelSpikeLighting()] : []
    });
  }

  public getOverlay(): MapboxOverlay {
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
            coordinates: currentSeg
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
          coordinates: currentSeg
        });
      }
    }
    this.rerTracks = segments;
    this.updateLayers();
  }

  public setShowRer(show: boolean) {
    this.showRer = show;
    this.updateLayers();
  }

  public setViewState(
    zoom: number,
    mapCenter: [number, number],
    bounds?: [[number, number], [number, number]] | null,
    pitch: number = 0
  ) {
    this.zoom = zoom;
    this.pitch = pitch;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'trains') {
      (window as any).__deckOverlayZoom = zoom;
    }
    this.mapCenter = mapCenter;
    if (bounds) {
      this.bounds = bounds;
    }
    this.updateLayers();
  }

  public setData(data: SubwayMapData) {
    this.data = data;
    this.showRer = true;
    this.updateLayers();
  }

  public setSelectedLine(lineId: string | null) {
    this.selectedLineId = lineId;
    this.updateLayers();
  }

  public setSelectedTrain(trainId: string | null) {
    this.selectedTrainId = trainId;
    this.updateLayers();
  }

  public setFollowElevation(lineId: string | null, offset: number): void {
    this.followElevationLineId = lineId;
    this.followElevationOffset = offset;
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
      const debug = document.getElementById('deck-debug') || document.body.appendChild(document.createElement('pre'));
      debug.id = 'deck-debug';
      debug.textContent = `Rendu réseau indisponible: ${error instanceof Error ? error.message : String(error)}`;
      debug.setAttribute('style', 'position:fixed;left:380px;top:80px;z-index:9999;color:#ff8f80;background:#321;padding:8px;white-space:pre-wrap;max-width:60vw');
    }
  }

  private renderLayers() {
    if (!this.data) return;

    const { tracks, stations, lines } = this.data;
    const lineMap = new Map(lines.map(l => [l.id, l]));
    const selectedLine = this.selectedLineId ? lineMap.get(this.selectedLineId) : null;
    const selectedRerShortName = selectedLine?.mode === 'rail' ? selectedLine.short_name : null;
    const selectedLinePaths = selectedLine
      ? selectedLine.mode === 'rail'
        ? this.rerTracks.filter(track => track.shortName === selectedRerShortName).map(track => track.coordinates)
        : tracks.filter(track => track.line_id === selectedLine.id).map(track => track.coordinates)
      : [];
    const displayStations = selectedLine && selectedLinePaths.length
      ? stations.map(station => station.lines.includes(selectedLine.id)
        ? { ...station, coordinates: snapPointToPaths(station.coordinates, selectedLinePaths) }
        : station)
      : stations;

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
      .filter(line => tracksByLine.has(line.id))
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
      const z = Math.max(9, Math.min(16, this.zoom));
      const t = (z - 9) / 7;
      const baseWidth = 1.6 + t * (4.5 - 1.6);
      return selected ? baseWidth + 0.6 : baseWidth;
    };

    const pathForTrack = (d: TrackItem): [number, number, number][] => {
      const line = lineMap.get(d.line_id);
      const z = line ? line.elevation_offset : 0;
      return d.coordinates.map((pt: [number, number]) => [pt[0], pt[1], z]);
    };

    const pathLayers: any[] = [];
    const visibleLineOrder = this.selectedLineId
      ? lineOrder.filter(line => line.id === this.selectedLineId)
      : lineOrder;
    for (const line of visibleLineOrder) {
      const lineTracks = tracksByLine.get(line.id) || [];
      const isSelected = !this.selectedLineId || line.id === this.selectedLineId;
      const safeId = line.short_name.replace(/[^a-zA-Z0-9_-]/g, '-');

      pathLayers.push(
        new PathLayer<any>({
          id: `subway-track-${safeId}-casing`,
          data: lineTracks,
          pickable: false,
          widthUnits: 'pixels',
          getWidth: () => trackWidthAtZoom(isSelected) + 3,
          getPath: pathForTrack as any,
          getColor: [21, 14, 18, 255], // --laque, opaque casing
          opacity: revealOpacityFor(line.id),
          capRounded: true,
          jointRounded: true,
          parameters: { depthTest: false, depthWriteEnabled: false } as any,
          transitions: { opacity: { duration: 140, easing: easeOut } } as any,
          updateTriggers: {
            getWidth: [this.zoom, this.selectedLineId]
          }
        })
      );

      pathLayers.push(
        new PathLayer<any>({
          id: `subway-track-${safeId}-fill`,
          data: lineTracks,
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
          parameters: { depthTest: false, depthWriteEnabled: false } as any,
          transitions: {
            getColor: { duration: 200, easing: easeOut },
            opacity: { duration: 140, easing: easeOut }
          } as any,
          updateTriggers: {
            getWidth: [this.zoom, this.selectedLineId],
            getColor: [this.selectedLineId]
          }
        })
      );
    }

    // 2. ScatterplotLayer for Stations (Hiérarchisation stricte par niveau de zoom)
    const isUltraHub = (st: StationMetadata) =>
      st.lines.length >= 4 ||
      /^(Châtelet|Gare du Nord|Montparnasse|Saint-Lazare|Gare de Lyon|Gare de l'Est|Gare d'Austerlitz|République|Nation|Bastille|Charles de Gaulle|La Défense|Opéra|Denfert-Rochereau)$/i.test(st.name) ||
      /Châtelet - Les Halles|Montparnasse - Bienvenüe|Charles de Gaulle - Étoile|La Défense \(Grande Arche\)/i.test(st.name);

    const filteredStations = displayStations.filter(st => {
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
      getFillColor: () => [241, 239, 234, 245], // --opale
      getLineColor: () => [21, 14, 18, 255], // --laque
      getLineWidth: (d: StationMetadata) => {
        if (isUltraHub(d)) return 1.5;
        return 1.0;
      },
      parameters: { depthTest: false, depthWriteEnabled: false } as any,
      transitions: {
        getFillColor: { duration: 140, easing: easeOut },
        getLineColor: { duration: 140, easing: easeOut },
        getLineWidth: { duration: 140, easing: easeOut }
      } as any,
      onHover: this.onStationHover,
      onClick: (info: any) => {
        if (info.object) {
          this.onStationClick(info.object as StationMetadata);
        }
      },
      updateTriggers: {
        getPosition: [this.selectedLineId],
        getFillColor: [this.zoom, this.selectedLineId],
        getLineColor: [this.zoom, this.selectedLineId],
        getRadius: [this.zoom, this.selectedLineId],
        getLineWidth: [this.zoom, this.selectedLineId]
      }
    });

    const terminusMarkers = this.resolveTerminusMarkers(lines, displayStations);
    const visibleTermini = terminusMarkers.filter(marker =>
      filteredStations.some(station => station.id === marker.station.id)
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
        d.elevation + 2.5
      ],
      getRadius: (d: TerminusMarker) => (this.selectedLineId ? 9 : this.zoom < 14 ? 6.5 : 9),
      getFillColor: [21, 14, 18, 255], // cercle évidé, intérieur --laque
      getLineColor: (d: TerminusMarker) => {
        return hexToRgba(d.lineColor, 255);
      },
      getLineWidth: 2,
      parameters: { depthTest: false, depthWriteEnabled: false } as any,
      updateTriggers: {
        getPosition: [this.zoom, this.selectedLineId],
        getRadius: [this.zoom, this.selectedLineId],
        getLineColor: [this.selectedLineId]
      }
    });

    const lineElev = selectedLine ? selectedLine.elevation_offset : 0;
    const labelsLayer = createStationLabelsLayer(displayStations, this.selectedLineId, this.zoom, this.mapCenter, lineElev);
    const platformsLayer = createPlatformsLayer(
      displayStations,
      selectedLine?.mode === 'metro' ? selectedLine : null,
      selectedLine?.mode === 'metro' ? selectedLinePaths : [],
      this.zoom
    );

    const demoRer = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo-rer');
    const showTrainModels = trainModelsEnabled() && (this.zoom > TRAIN_MODEL_ZOOM_THRESHOLD || this.pitch >= 20 || Boolean(this.selectedTrainId) || Boolean(demoRer));
    if (showTrainModels && this.data?.rollingStockDb) {
      for (const train of this.trains) {
        requestTrainModel(train, this.data.rollingStockDb);
      }
    }

    const modelLayers = showTrainModels && this.data?.shapes && this.data?.rollingStockDb
      ? createTrainModelLayers({
          trains: this.trains,
          shapes: this.data.shapes,
          rollingStockDb: this.data.rollingStockDb,
          grazingCamera: this.pitch >= 45,
          bounds: this.bounds,
          elevationOffset: this.followElevationLineId
            ? { lineId: this.followElevationLineId, offset: this.followElevationOffset }
            : undefined,
          onClick: (train) => {
            if (this.data?.rollingStockDb) requestTrainModel(train, this.data.rollingStockDb);
            this.selectedTrainId = train.id;
            this.onTrainClick(train);
            this.updateLayers();
          },
          onHover: this.onTrainHover
        })
      : [];
    const capsuleLayers = this.data?.shapes && this.data?.rollingStockDb
      ? createCapsuleLayers({
          trains: this.trains,
          shapes: this.data.shapes,
          tracks,
          rollingStockDb: this.data.rollingStockDb,
          mapCenter: this.mapCenter,
          selectedLineId: this.selectedLineId,
          selectedTrainId: this.selectedTrainId,
          onHover: this.onTrainHover,
          onClick: (train) => {
            if (this.data?.rollingStockDb) requestTrainModel(train, this.data.rollingStockDb);
            this.selectedTrainId = train.id;
            this.onTrainClick(train);
            this.updateLayers();
          }
        })
      : createTrainsLayers(this.trains, this.selectedLineId, this.onTrainHover, this.onTrainClick, this.zoom);
    const trainLayers = isTrainModelSpikeEnabled()
      ? []
      : resolveTrainRenderLayers(modelLayers, capsuleLayers);

    let rerLayer: any = null;
    if (this.showRer && this.rerTracks.length > 0) {
      rerLayer = new PathLayer<any>({
        id: 'rer-tracks',
        data: selectedRerShortName
          ? this.rerTracks.filter(track => track.shortName === selectedRerShortName)
          : this.selectedLineId
          ? []
          : this.rerTracks,
        pickable: false,
        widthUnits: 'pixels',
        getWidth: 3.5, // 3.5px vs 2.5px métro
        getPath: ((d: RerTrackSegment) => d.coordinates.map(pt => [pt[0], pt[1], -1])) as any, // Tracé sous les lignes de métro
        getColor: (d: RerTrackSegment) => {
          const baseAlpha = d.isBanlieue ? 130 : 230;
          return hexToRgba(d.color, baseAlpha);
        },
        extensions: [new PathStyleExtension({ dash: true })],
        getDashArray: (d: RerTrackSegment) => (d.isBanlieue ? [4, 3] : [0, 0]),
        dashUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        parameters: { depthTest: false, depthWriteEnabled: false } as any
      } as any);
    }

    const layers: any[] = [];
    if (rerLayer) {
      layers.push(rerLayer); // RER placé SOUS les lignes de métro
    }
    const lineHitboxes = visibleLineOrder.map(line => new PathLayer<any>({
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
      updateTriggers: { getWidth: [this.zoom] }
    }));
    layers.push(
      ...lineHitboxes,
      ...pathLayers,
      ...(platformsLayer ? [platformsLayer] : []),
      stationsLayer,
      terminusLayer,
      ...trainLayers
    );
    const trainModelSpikeLayer = createTrainModelSpikeLayer();
    if (trainModelSpikeLayer) {
      layers.push(trainModelSpikeLayer);
    }
    if (labelsLayer) {
      layers.push(labelsLayer);
    }

    this.overlay.setProps({
      layers,
      onClick: (info: any) => {
        if (!info.object) this.onBackgroundClick();
      }
    });
  }

  /**
   * Resolve line endpoints from the already-loaded ladder artifact. Ladder
   * nodes use stop-point IDs while stations.json uses commercial station IDs,
   * so endpoints are joined by the nearest station on the same line.
   */
  private resolveTerminusMarkers(lines: LineMetadata[], stations: StationMetadata[]): TerminusMarker[] {
    const ladders = this.data?.lineLadders || {};
    const markers: TerminusMarker[] = [];
    const seen = new Set<string>();

    const nearestStation = (lineId: string, coordinates: [number, number]): StationMetadata | null => {
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
          endpointNodes.push(direction.stations[0], direction.stations[direction.stations.length - 1]);
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
          elevation: line.elevation_offset
        });
      }
    }

    return markers;
  }

  public setTrains(trains: TrainMarker[]) {
    this.trains = trains;
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
      this.updateLayers();
      return;
    }

    this.trackRevealProgress = 0;
    this.updateLayers();
    const startedAt = performance.now();
    const frame = (now: number) => {
      if (document.hidden) {
        this.trackRevealProgress = 1;
        this.trackRevealFrame = null;
        this.updateLayers();
        return;
      }
      this.trackRevealProgress = Math.min(1, (now - startedAt) / durationMs);
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
