const MAP_VISUAL_IDS = new Set([
  "arcs",
  "fences",
  "pillars",
  "discs",
  "map-area",
  "heatmap",
  "points",
  "wind",
  "water-surfaces",
]);

export function isMapVisualAsset(visualId: string): boolean {
  return MAP_VISUAL_IDS.has(visualId);
}

export function getMapVisualSrc(visualId: string): string | undefined {
  if (!isMapVisualAsset(visualId)) return undefined;
  return `${import.meta.env.BASE_URL}map-types/${visualId}.png`;
}
