export function resolveTrainRenderLayers<T>(modelLayers: readonly T[], capsuleLayers: readonly T[]): readonly T[] {
  return modelLayers.length > 0 ? modelLayers : capsuleLayers;
}