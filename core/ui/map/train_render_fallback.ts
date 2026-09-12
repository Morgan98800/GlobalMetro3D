export function resolveTrainRenderLayers<T>(modelLayers: readonly T[], capsuleLayers: readonly T[]): readonly T[] {
  if (modelLayers.length === 0) return capsuleLayers;
  // Les GLB ne couvrent pas forcément toutes les familles de rames : les
  // capsules restent donc visibles tant qu'un modèle équivalent n'est pas prêt.
  return [...capsuleLayers, ...modelLayers];
}