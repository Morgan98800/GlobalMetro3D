export function resolveTrainRenderLayers<T>(modelLayers: readonly T[], capsuleLayers: readonly T[]): readonly T[] {
  if (modelLayers.length === 0) return capsuleLayers;
  const overlayLayers = capsuleLayers.filter((layer: any) =>
    layer?.id === 'subway-trains-capsule-labels' || (typeof layer?.id === 'string' && layer.id.startsWith('subway-trains-dots'))
  );
  return [...modelLayers, ...overlayLayers];
}