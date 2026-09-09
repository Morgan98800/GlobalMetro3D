import { TextLayer } from '@deck.gl/layers';
import type { StationMetadata } from '@paris-subway/shared';

export function createStationLabelsLayer(
  stations: StationMetadata[],
  selectedLineId: string | null,
  lineElevation: number = 0
): TextLayer | null {
  if (!selectedLineId) return null;

  const lineStations = stations.filter(s => s.lines.includes(selectedLineId));

  return new TextLayer({
    id: 'subway-station-labels',
    data: lineStations,
    pickable: false,
    getPosition: (d: StationMetadata) => [d.coordinates[0], d.coordinates[1], lineElevation + 8],
    getText: (d: StationMetadata) => d.name,
    getSize: 12,
    sizeUnits: 'pixels',
    sizeMinPixels: 10,
    sizeMaxPixels: 16,
    getColor: [239, 233, 221, 255],
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    getTextAnchor: 'start',
    getAlignmentBaseline: 'center',
    getPixelOffset: [12, 0],
    background: true,
    getBackgroundColor: [14, 21, 18, 210],
    backgroundPadding: [4, 2, 4, 2],
    updateTriggers: {
      getPosition: [selectedLineId, lineElevation],
      getText: [selectedLineId]
    }
  });
}
