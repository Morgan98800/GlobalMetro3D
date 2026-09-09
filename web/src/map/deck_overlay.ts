import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer } from '@deck.gl/layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LineMetadata, StationMetadata } from '@paris-subway/shared';

import { createTrainsLayers, TrainMarker } from './trains_layer';
import { createStationLabelsLayer } from './labels_layer';
import { createCapsuleLayers } from './capsule_layer';
import { createLandmarksLayers } from './landmarks_layer';
import type { ShapeEntry } from '../sim/shapes';
import type { RollingStockDatabase } from '../sim/rolling_stock';

export interface TrackItem {
  line_id: string;
  short_name: string;
  stroke: string;
  coordinates: [number, number][];
}

export interface SubwayMapData {
  lines: LineMetadata[];
  stations: StationMetadata[];
  tracks: TrackItem[];
  shapes?: Map<string, ShapeEntry>;
  rollingStockDb?: RollingStockDatabase;
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

export class SubwayDeckOverlay {
  private overlay: MapboxOverlay;
  private data: SubwayMapData | null = null;
  private selectedLineId: string | null = null;
  private selectedTrainId: string | null = null;
  private trains: TrainMarker[] = [];
  private zoom: number = 13;
  private mapCenter: [number, number] = [2.3488, 48.8534];
  private bounds: [[number, number], [number, number]] | null = null;
  private onStationHover: (info: any) => void;
  private onStationClick: (station: StationMetadata) => void;
  private onTrainHover: (info: any) => void;
  private onTrainClick: (train: TrainMarker) => void;

  constructor(options: {
    onStationHover: (info: any) => void;
    onStationClick: (station: StationMetadata) => void;
    onTrainHover: (info: any) => void;
    onTrainClick: (train: TrainMarker) => void;
  }) {
    this.onStationHover = options.onStationHover;
    this.onStationClick = options.onStationClick;
    this.onTrainHover = options.onTrainHover;
    this.onTrainClick = options.onTrainClick;

    this.overlay = new MapboxOverlay({
      interleaved: false,
      layers: []
    });
  }

  public getOverlay(): MapboxOverlay {
    return this.overlay;
  }

  public setViewState(
    zoom: number,
    mapCenter: [number, number],
    bounds?: [[number, number], [number, number]] | null
  ) {
    const zoomChangedLOD = Math.floor(this.zoom * 2) !== Math.floor(zoom * 2);
    this.zoom = zoom;
    this.mapCenter = mapCenter;
    if (bounds) {
      this.bounds = bounds;
    }
    if (zoomChangedLOD || bounds) {
      this.updateLayers();
    }
  }

  public setData(data: SubwayMapData) {
    this.data = data;
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

  private updateLayers() {
    if (!this.data) return;

    const { tracks, stations, lines } = this.data;
    const lineMap = new Map(lines.map(l => [l.id, l]));

    // 1. PathLayer for Tracks
    const pathLayer = new PathLayer<any>({
      id: 'subway-tracks',
      data: tracks,
      pickable: true,
      widthUnits: 'pixels',
      getWidth: (d: TrackItem) => {
        const isSelected = !this.selectedLineId || d.line_id === this.selectedLineId;
        return isSelected ? 4.5 : 2.0;
      },
      getPath: ((d: TrackItem) => {
        const line = lineMap.get(d.line_id);
        const z = line ? line.elevation_offset : 0;
        return d.coordinates.map((pt: [number, number]) => [pt[0], pt[1], z]);
      }) as any,
      getColor: (d: TrackItem) => {
        const colorHex = d.stroke || '#CCCCCC';
        if (!this.selectedLineId) {
          return hexToRgba(colorHex, 240);
        }
        if (d.line_id === this.selectedLineId) {
          return hexToRgba(colorHex, 255);
        }
        // Desaturate / dim other lines to 25% opacity
        return hexToRgba('#22332B', 60);
      },
      capRounded: true,
      jointRounded: true,
      updateTriggers: {
        getWidth: [this.selectedLineId],
        getColor: [this.selectedLineId]
      }
    });

    // 2. ScatterplotLayer for Stations
    const filteredStations = stations.filter(st => {
      if (!this.selectedLineId) return true;
      return st.lines.includes(this.selectedLineId);
    });

    const stationsLayer = new ScatterplotLayer({
      id: 'subway-stations',
      data: filteredStations,
      pickable: true,
      opacity: 0.9,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 3.5,
      radiusMaxPixels: 12,
      getPosition: (d: StationMetadata) => [d.coordinates[0], d.coordinates[1], 15],
      getRadius: (d: StationMetadata) => (d.is_hub ? 65 : 40),
      getFillColor: (d: StationMetadata) => (d.is_hub ? [245, 235, 215, 255] : [239, 233, 221, 230]),
      getLineColor: [14, 21, 18, 255],
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      onHover: this.onStationHover,
      onClick: (info: any) => {
        if (info.object) {
          this.onStationClick(info.object as StationMetadata);
        }
      },
      updateTriggers: {
        getPosition: [this.selectedLineId],
        getRadius: [this.selectedLineId]
      }
    });

    const selectedLine = this.selectedLineId ? lineMap.get(this.selectedLineId) : null;
    const lineElev = selectedLine ? selectedLine.elevation_offset : 0;
    const labelsLayer = createStationLabelsLayer(stations, this.selectedLineId, lineElev);

    const trainLayers =
      this.data.shapes && this.data.rollingStockDb
        ? createCapsuleLayers({
            trains: this.trains,
            shapes: this.data.shapes,
            rollingStockDb: this.data.rollingStockDb,
            zoom: this.zoom,
            mapCenter: this.mapCenter,
            selectedLineId: this.selectedLineId,
            selectedTrainId: this.selectedTrainId,
            onHover: this.onTrainHover,
            onClick: (train) => {
              this.selectedTrainId = train.id;
              this.onTrainClick(train);
              this.updateLayers();
            }
          })
        : createTrainsLayers(this.trains, this.selectedLineId, this.onTrainHover, this.onTrainClick);

    const landmarkLayers = createLandmarksLayers({
      zoom: this.zoom,
      mapCenter: this.mapCenter,
      bounds: this.bounds
    });

    const layers: any[] = [
      pathLayer,
      stationsLayer,
      ...landmarkLayers,
      ...trainLayers
    ];
    if (labelsLayer) {
      layers.push(labelsLayer);
    }

    this.overlay.setProps({ layers });
  }

  public setTrains(trains: TrainMarker[]) {
    this.trains = trains;
    this.updateLayers();
  }
}
