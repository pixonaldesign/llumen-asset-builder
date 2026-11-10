import type { Map as MapboxMap } from "mapbox-gl";
import * as THREE from "three";
import type { SceneOrigin } from "@/lib/mercator";
import { lngLatToLocalMeters } from "@/lib/mercator";

export type LocalAabb = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type WaterFillSource = {
  source: string;
  sourceLayer?: string;
};

export type MaskImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type WaterMaskRaster = {
  canvas: HTMLCanvasElement | OffscreenCanvas | null;
  imageData: MaskImage;
  bounds: LocalAabb;
  hasWater: boolean;
  width: number;
  height: number;
};

export type WaterMaskTexture = {
  texture: THREE.Texture;
  bounds: LocalAabb;
  hasWater: boolean;
};

const WATER_LAYER_RE = /water|ocean|sea|river|lake|bay|harbor|harbour|stream/i;
const DEFAULT_MASK_RESOLUTION = 1024;
const _local = new THREE.Vector3();

export function expandLocalAabb(bounds: LocalAabb, padding: number): LocalAabb {
  const pad = Math.max(0, padding);
  return {
    minX: bounds.minX - pad,
    maxX: bounds.maxX + pad,
    minZ: bounds.minZ - pad,
    maxZ: bounds.maxZ + pad,
  };
}

export function localAabbSize(bounds: LocalAabb): { sizeX: number; sizeZ: number } {
  return {
    sizeX: Math.max(1, bounds.maxX - bounds.minX),
    sizeZ: Math.max(1, bounds.maxZ - bounds.minZ),
  };
}

export function localMetersToMaskUv(
  x: number,
  z: number,
  bounds: LocalAabb,
): { u: number; v: number } {
  const { sizeX, sizeZ } = localAabbSize(bounds);
  return {
    u: (x - bounds.minX) / sizeX,
    v: (z - bounds.minZ) / sizeZ,
  };
}

export function sampleMask(
  imageData: MaskImage,
  bounds: LocalAabb,
  x: number,
  z: number,
): number {
  const { u, v } = localMetersToMaskUv(x, z, bounds);
  if (u < 0 || v < 0 || u > 1 || v > 1) return 0;
  const px = Math.min(imageData.width - 1, Math.max(0, Math.floor(u * imageData.width)));
  const py = Math.min(
    imageData.height - 1,
    Math.max(0, Math.floor(v * imageData.height)),
  );
  return imageData.data[(py * imageData.width + px) * 4]! / 255;
}

function isLngLatPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}

function collectRingsFromCoords(
  coords: unknown,
  rings: Array<Array<[number, number]>>,
): void {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (isLngLatPair(coords[0])) {
    const ring: Array<[number, number]> = [];
    for (const pair of coords) {
      if (isLngLatPair(pair)) ring.push([Number(pair[0]), Number(pair[1])]);
    }
    if (ring.length >= 3) rings.push(ring);
    return;
  }
  for (const child of coords) collectRingsFromCoords(child, rings);
}

function collectRingsFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  rings: Array<Array<[number, number]>>,
): void {
  if (!geometry) return;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    collectRingsFromCoords(geometry.coordinates, rings);
    return;
  }
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectRingsFromGeometry(child, rings);
    }
  }
}

export function extractWaterRings(
  input: GeoJSON.GeoJSON | GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): Array<Array<[number, number]>> {
  const rings: Array<Array<[number, number]>> = [];
  if (!input) return rings;
  if (input.type === "FeatureCollection") {
    for (const feature of input.features) {
      collectRingsFromGeometry(feature.geometry, rings);
    }
    return rings;
  }
  if (input.type === "Feature") {
    collectRingsFromGeometry(input.geometry, rings);
    return rings;
  }
  collectRingsFromGeometry(input as GeoJSON.Geometry, rings);
  return rings;
}

/** Ray-cast even-odd test. `ring` is closed or open lng/lat pairs. */
export function pointInRing(
  lng: number,
  lat: number,
  ring: Array<[number, number]>,
): boolean {
  let inside = false;
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInRings(
  lng: number,
  lat: number,
  rings: Array<Array<[number, number]>>,
): boolean {
  let inside = false;
  for (const ring of rings) {
    if (pointInRing(lng, lat, ring)) inside = !inside;
  }
  return inside;
}

export function discoverWaterFillSources(map: MapboxMap): WaterFillSource[] {
  const style = map.getStyle();
  if (!style?.layers) return [];
  const seen = new Set<string>();
  const sources: WaterFillSource[] = [];
  for (const layer of style.layers) {
    if (layer.type !== "fill" && layer.type !== "fill-extrusion") continue;
    const sourceLayer =
      "source-layer" in layer && typeof layer["source-layer"] === "string"
        ? layer["source-layer"]
        : undefined;
    const haystack = `${layer.id} ${sourceLayer ?? ""}`;
    if (!WATER_LAYER_RE.test(haystack)) continue;
    if (!("source" in layer) || typeof layer.source !== "string") continue;
    const key = `${layer.source}::${sourceLayer ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ source: layer.source, sourceLayer });
  }
  return sources;
}

export type WaterTileId = { z: number; x: number; y: number };

/** One water polygon: outer ring plus any island holes. */
export type WaterPolygon = Array<Array<[number, number]>>;

export type MapboxWaterQuery = {
  rings: Array<Array<[number, number]>>;
  /** Each entry is one polygon, so overlapping tiles cannot cancel each other. */
  polygons: WaterPolygon[];
  /** Vector tiles that actually returned water. Their footprints are known land. */
  tiles: WaterTileId[];
};

/** Web-mercator tile footprint, north-west then clockwise. */
export function mercatorTileRing(
  z: number,
  x: number,
  y: number,
): Array<[number, number]> {
  const n = 2 ** z;
  const lon = (col: number) => (col / n) * 360 - 180;
  const lat = (row: number) => {
    const mercator = Math.PI * (1 - (2 * row) / n);
    return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
  };
  return [
    [lon(x), lat(y)],
    [lon(x + 1), lat(y)],
    [lon(x + 1), lat(y + 1)],
    [lon(x), lat(y + 1)],
  ];
}

/** Source layers whose loaded tiles are known land until water paints over them. */
const LAND_COVERAGE_LAYERS = ["landuse", "landuse_overlay", "structure"];

function polygonFromCoordinates(coordinates: unknown): WaterPolygon | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  const rings: Array<Array<[number, number]>> = [];
  for (const ring of coordinates) {
    if (!Array.isArray(ring)) continue;
    const points: Array<[number, number]> = [];
    for (const pair of ring) {
      if (isLngLatPair(pair)) points.push([Number(pair[0]), Number(pair[1])]);
    }
    if (points.length >= 3) rings.push(points);
  }
  return rings.length > 0 ? rings : null;
}

function collectPolygonsFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
  polygons: WaterPolygon[],
): void {
  if (!geometry) return;
  if (geometry.type === "Polygon") {
    const polygon = polygonFromCoordinates(geometry.coordinates);
    if (polygon) polygons.push(polygon);
    return;
  }
  if (geometry.type === "MultiPolygon") {
    for (const coordinates of geometry.coordinates) {
      const polygon = polygonFromCoordinates(coordinates);
      if (polygon) polygons.push(polygon);
    }
    return;
  }
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectPolygonsFromGeometry(child, polygons);
    }
  }
}

function rememberTile(
  feature: { tile?: WaterTileId },
  tiles: WaterTileId[],
  seen: Set<string>,
): void {
  const tile = feature.tile;
  if (!tile || !Number.isFinite(tile.z)) return;
  const key = `${tile.z}/${tile.x}/${tile.y}`;
  if (seen.has(key)) return;
  seen.add(key);
  tiles.push({ z: tile.z, x: tile.x, y: tile.y });
}

export function queryMapboxWater(map: MapboxMap): MapboxWaterQuery {
  const polygons: WaterPolygon[] = [];
  const tiles: WaterTileId[] = [];
  const seen = new Set<string>();
  const sources = new Set<string>();
  for (const entry of discoverWaterFillSources(map)) {
    sources.add(entry.source);
    let features: Array<GeoJSON.Feature & { tile?: WaterTileId }> = [];
    try {
      features = map.querySourceFeatures(entry.source, {
        sourceLayer: entry.sourceLayer,
      }) as Array<GeoJSON.Feature & { tile?: WaterTileId }>;
    } catch {
      continue;
    }
    for (const feature of features) {
      collectPolygonsFromGeometry(feature.geometry, polygons);
      rememberTile(feature, tiles, seen);
    }
  }
  // A tile that is all land never returns a water feature. Without it in the
  // coverage, that land stays "unknown" and the slick draws across it.
  for (const source of sources) {
    for (const sourceLayer of LAND_COVERAGE_LAYERS) {
      let features: Array<{ tile?: WaterTileId }> = [];
      try {
        features = map.querySourceFeatures(source, { sourceLayer }) as Array<{
          tile?: WaterTileId;
        }>;
      } catch {
        continue;
      }
      for (const feature of features) rememberTile(feature, tiles, seen);
    }
  }
  return { rings: polygons.flat(), polygons, tiles };
}

export function queryMapboxWaterRings(map: MapboxMap): Array<Array<[number, number]>> {
  return queryMapboxWater(map).rings;
}

export function localAabbFromPoints(
  origin: SceneOrigin,
  points: Array<{ lng: number; lat: number }>,
): LocalAabb | null {
  if (!points.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    lngLatToLocalMeters(origin, point.lng, point.lat, 0, _local);
    minX = Math.min(minX, _local.x);
    maxX = Math.max(maxX, _local.x);
    minZ = Math.min(minZ, _local.z);
    maxZ = Math.max(maxZ, _local.z);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minZ, maxZ };
}

function createMaskCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canUseCanvas(): boolean {
  return (
    typeof OffscreenCanvas !== "undefined" ||
    (typeof document !== "undefined" && typeof document.createElement === "function")
  );
}

function pointInLocalRing(
  x: number,
  z: number,
  ring: Array<{ x: number; z: number }>,
): boolean {
  let inside = false;
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]!.x;
    const zi = ring[i]!.z;
    const xj = ring[j]!.x;
    const zj = ring[j]!.z;
    const intersects =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function stampEvenOdd(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: LocalAabb,
  rings: Array<Array<{ x: number; z: number }>>,
  rgb: [number, number, number],
): boolean {
  const valid = rings.filter((ring) => ring.length >= 3);
  if (!valid.length) return false;
  const { sizeX, sizeZ } = localAabbSize(bounds);
  let hit = false;
  for (let py = 0; py < height; py++) {
    const z = bounds.minZ + ((py + 0.5) / height) * sizeZ;
    for (let px = 0; px < width; px++) {
      const x = bounds.minX + ((px + 0.5) / width) * sizeX;
      let inside = false;
      for (const ring of valid) {
        if (pointInLocalRing(x, z, ring)) inside = !inside;
      }
      if (!inside) continue;
      const i = (py * width + px) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
      hit = true;
    }
  }
  return hit;
}

type LocalRing = Array<{ x: number; z: number }>;
type LocalPolygon = LocalRing[];

function rasterizeWithCpu(
  polygons: LocalPolygon[],
  bounds: LocalAabb,
  width: number,
  height: number,
  coverage: LocalRing[] = [],
): WaterMaskRaster {
  const data = new Uint8ClampedArray(width * height * 4);
  // Loaded tiles are land until a water ring paints over them. Everywhere
  // else stays black: that tile has not loaded, so it must not clip the slick.
  stampEvenOdd(data, width, height, bounds, coverage, [0, 255, 0]);
  let hasWater = false;
  for (const polygon of polygons) {
    if (
      stampEvenOdd(data, width, height, bounds, polygon, [255, 255, 255])
    ) {
      hasWater = true;
    }
  }
  return {
    canvas: null,
    imageData: { data, width, height },
    bounds,
    hasWater,
    width,
    height,
  };
}

export function rasterizeLocalPolygons(
  polygons: LocalPolygon[],
  bounds: LocalAabb,
  resolution = DEFAULT_MASK_RESOLUTION,
  coverage: LocalRing[] = [],
): WaterMaskRaster {
  const width = Math.max(1, Math.round(resolution));
  const height = width;
  if (!canUseCanvas()) {
    return rasterizeWithCpu(polygons, bounds, width, height, coverage);
  }

  try {
    const canvas = createMaskCanvas(width, height);
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      return rasterizeWithCpu(polygons, bounds, width, height);
    }
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    const { sizeX, sizeZ } = localAabbSize(bounds);
    const traceRing = (ring: LocalRing) => {
      for (let i = 0; i < ring.length; i++) {
        const pt = ring[i]!;
        const x = ((pt.x - bounds.minX) / sizeX) * width;
        const y = ((pt.z - bounds.minZ) / sizeZ) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    ctx.fillStyle = "#00ff00";
    for (const ring of coverage) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      traceRing(ring);
      ctx.fill();
    }
    // Even-odd within one polygon keeps its island holes. Polygons are filled
    // one at a time so two tiles covering the same sea cannot erase each other.
    ctx.fillStyle = "#ffffff";
    let drew = false;
    for (const polygon of polygons) {
      const rings = polygon.filter((ring) => ring.length >= 3);
      if (!rings.length) continue;
      ctx.beginPath();
      for (const ring of rings) traceRing(ring);
      ctx.fill("evenodd");
      drew = true;
    }

    const raw = ctx.getImageData(0, 0, width, height);
    let hasWater = false;
    if (drew) {
      const data = raw.data;
      for (let i = 0; i < data.length; i += 16) {
        if ((data[i] ?? 0) > 8) {
          hasWater = true;
          break;
        }
      }
    }

    return {
      canvas,
      imageData: { data: raw.data, width, height },
      bounds,
      hasWater,
      width,
      height,
    };
  } catch {
    return rasterizeWithCpu(polygons, bounds, width, height, coverage);
  }
}

export function rasterizeLocalRings(
  rings: LocalRing[],
  bounds: LocalAabb,
  resolution = DEFAULT_MASK_RESOLUTION,
  coverage: LocalRing[] = [],
): WaterMaskRaster {
  return rasterizeLocalPolygons([rings], bounds, resolution, coverage);
}

export function rasterizeLngLatPolygons(
  polygons: WaterPolygon[],
  origin: SceneOrigin,
  bounds: LocalAabb,
  resolution = DEFAULT_MASK_RESOLUTION,
  coverage: Array<Array<[number, number]>> = [],
): WaterMaskRaster {
  const toLocal = (ring: Array<[number, number]>) =>
    ring.map(([lng, lat]) => {
      lngLatToLocalMeters(origin, lng, lat, 0, _local);
      return { x: _local.x, z: _local.z };
    });
  return rasterizeLocalPolygons(
    polygons.map((polygon) => polygon.map(toLocal)),
    bounds,
    resolution,
    coverage.map(toLocal),
  );
}

export function rasterizeLngLatRings(
  rings: Array<Array<[number, number]>>,
  origin: SceneOrigin,
  bounds: LocalAabb,
  resolution = DEFAULT_MASK_RESOLUTION,
  coverage: Array<Array<[number, number]>> = [],
): WaterMaskRaster {
  const toLocal = (ring: Array<[number, number]>) =>
    ring.map(([lng, lat]) => {
      lngLatToLocalMeters(origin, lng, lat, 0, _local);
      return { x: _local.x, z: _local.z };
    });
  return rasterizeLocalRings(
    rings.map(toLocal),
    bounds,
    resolution,
    coverage.map(toLocal),
  );
}

export function createWaterMaskTexture(
  raster: WaterMaskRaster,
): WaterMaskTexture {
  const texture = raster.canvas
    ? new THREE.CanvasTexture(raster.canvas)
    : new THREE.DataTexture(
        raster.imageData.data,
        raster.width,
        raster.height,
        THREE.RGBAFormat,
      );
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return {
    texture,
    bounds: raster.bounds,
    hasWater: raster.hasWater,
  };
}

export function createEmptyWaterMaskTexture(): WaterMaskTexture {
  const raster = rasterizeLocalRings([], {
    minX: 0,
    maxX: 1,
    minZ: 0,
    maxZ: 1,
  }, 1);
  return createWaterMaskTexture(raster);
}
