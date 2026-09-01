/** Figma-exported artwork for Map Layer visuals in `public/visuals-2/`. */
export const MAP_VISUAL_SRC: Record<string, string> = {
  arcs: "/visuals-2/arc map.svg",
  fences: "/visuals-2/fences map.svg",
  pillars: "/visuals-2/pillars map.svg",
  discs: "/visuals-2/discs map.svg",
  "map-area": "/visuals-2/area map.svg",
  heatmap: "/visuals-2/heatmap map.svg",
};

export function getMapVisualSrc(visualId: string): string | undefined {
  const path = MAP_VISUAL_SRC[visualId];
  if (!path) return undefined;
  return encodeURI(`${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`);
}

export function isMapVisualAsset(visualId: string): boolean {
  return visualId in MAP_VISUAL_SRC;
}
