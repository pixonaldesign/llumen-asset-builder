import type { Map as MapboxMap } from "mapbox-gl";

export type BuildingGrid = {
  cols: number;
  rows: number;
  west: number;
  east: number;
  south: number;
  north: number;
};

export type BuildingFootprint = {
  /** Outer ring first, then holes, as [lng, lat]. */
  rings: Array<Array<[number, number]>>;
  /** Roof height above ground in meters. */
  height: number;
};

export type BuildingSource = { source: string; sourceLayer: string };

const BUILDING_LAYER = "building";

function mercatorY(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
}

/** Fractional column/row of a coordinate. Row 0 is the south edge, rows are mercator-uniform. */
export function lngLatToGridCell(
  grid: BuildingGrid,
  lng: number,
  lat: number,
): [number, number] {
  const u = (lng - grid.west) / (grid.east - grid.west);
  const v =
    (mercatorY(lat) - mercatorY(grid.south)) /
    (mercatorY(grid.north) - mercatorY(grid.south));
  return [u * grid.cols, v * grid.rows];
}

/**
 * Even-odd scanline fill at cell centers, so holes stay open. Taller roofs win
 * where footprints overlap.
 */
export function rasterizeBuildingFootprints(
  grid: BuildingGrid,
  footprints: BuildingFootprint[],
  target: Float32Array = new Float32Array(grid.cols * grid.rows),
): Float32Array {
  fillFootprints(grid, footprints, (index, height) => {
    if (height > target[index]!) target[index] = height;
  });
  return target;
}

/** Display mask resolution over the flood grid, per axis. 4 m cells become 1 m pixels. */
export const BUILDING_MASK_SCALE = 4;

/**
 * Two-channel byte mask at `scale` pixels per grid cell. Red is inside a
 * footprint. Green marks every pixel of a grid cell whose building came from
 * these footprints, where the mask is authoritative for the wall position.
 * Adds to `target` without clearing, matching how `cellHeights` accumulates
 * tiles across queries.
 */
export function rasterizeBuildingMask(
  grid: BuildingGrid,
  footprints: BuildingFootprint[],
  cellHeights: Float32Array,
  scale = BUILDING_MASK_SCALE,
  target: Uint8Array = new Uint8Array(grid.cols * scale * grid.rows * scale * 2),
): Uint8Array {
  const fine = { ...grid, cols: grid.cols * scale, rows: grid.rows * scale };
  fillFootprints(fine, footprints, (index) => {
    target[index * 2] = 255;
  });
  const width = fine.cols;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (!(cellHeights[row * grid.cols + col]! > 0)) continue;
      for (let y = 0; y < scale; y += 1) {
        const base = ((row * scale + y) * width + col * scale) * 2 + 1;
        for (let x = 0; x < scale; x += 1) target[base + x * 2] = 255;
      }
    }
  }
  return target;
}

function fillFootprints(
  grid: BuildingGrid,
  footprints: BuildingFootprint[],
  write: (index: number, height: number) => void,
): void {
  const xs: number[] = [];
  for (const footprint of footprints) {
    if (!(footprint.height > 0)) continue;
    const rings = footprint.rings
      .filter((ring) => ring.length >= 3)
      .map((ring) => ring.map(([lng, lat]) => lngLatToGridCell(grid, lng, lat)));
    if (rings.length === 0) continue;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (const ring of rings) {
      for (const [, y] of ring) {
        minRow = Math.min(minRow, y);
        maxRow = Math.max(maxRow, y);
      }
    }
    const rowStart = Math.max(0, Math.ceil(minRow - 0.5));
    const rowEnd = Math.min(grid.rows - 1, Math.floor(maxRow - 0.5));
    for (let row = rowStart; row <= rowEnd; row += 1) {
      const y = row + 0.5;
      xs.length = 0;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
          const [xi, yi] = ring[i]!;
          const [xj, yj] = ring[j]!;
          if (yi > y !== yj > y) {
            xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
          }
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const colStart = Math.max(0, Math.ceil(xs[k]! - 0.5));
        const colEnd = Math.min(grid.cols - 1, Math.floor(xs[k + 1]! - 0.5));
        const base = row * grid.cols;
        for (let col = colStart; col <= colEnd; col += 1) {
          write(base + col, footprint.height);
        }
      }
    }
  }
}

/** Vector sources that carry a `building` source-layer in the active style. */
export function discoverBuildingSources(map: MapboxMap): BuildingSource[] {
  const style = map.getStyle();
  const seen = new Set<string>();
  const found: BuildingSource[] = [];
  for (const layer of style?.layers ?? []) {
    const sourceLayer =
      "source-layer" in layer && typeof layer["source-layer"] === "string"
        ? layer["source-layer"]
        : undefined;
    if (sourceLayer !== BUILDING_LAYER) continue;
    if (!("source" in layer) || typeof layer.source !== "string") continue;
    if (seen.has(layer.source)) continue;
    seen.add(layer.source);
    found.push({ source: layer.source, sourceLayer });
  }
  if (found.length === 0 && style?.sources?.composite) {
    found.push({ source: "composite", sourceLayer: BUILDING_LAYER });
  }
  return found;
}

function footprintHeight(properties: Record<string, unknown> | null): number {
  const raw = properties?.height ?? properties?.render_height;
  const height = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(height) && height > 0 ? height : 0;
}

function footprintsFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  height: number,
  out: BuildingFootprint[],
): void {
  if (!geometry || height <= 0) return;
  if (geometry.type === "Polygon") {
    out.push({ rings: geometry.coordinates as Array<Array<[number, number]>>, height });
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      out.push({ rings: polygon as Array<Array<[number, number]>>, height });
    }
  }
}

/** Footprints from the building tiles Mapbox has loaded. Only the viewport's tiles are present. */
export function queryMapboxBuildings(map: MapboxMap): BuildingFootprint[] {
  const footprints: BuildingFootprint[] = [];
  for (const entry of discoverBuildingSources(map)) {
    let features: GeoJSON.Feature[] = [];
    try {
      features = map.querySourceFeatures(entry.source, {
        sourceLayer: entry.sourceLayer,
      }) as GeoJSON.Feature[];
    } catch {
      continue;
    }
    for (const feature of features) {
      footprintsFromGeometry(
        feature.geometry,
        footprintHeight(feature.properties as Record<string, unknown> | null),
        footprints,
      );
    }
  }
  return footprints;
}
