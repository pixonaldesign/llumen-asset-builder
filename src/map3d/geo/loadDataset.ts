import type { VizArea, VizDataset, VizPoint } from "@/lib/types";
import { parseOutfallSize } from "@/lib/parseOutfallSize";
import { publicUrl } from "@/lib/publicUrl";

type LngLatLike = { lng: number; lat: number };
type PropertyFeature = VizPoint | VizArea;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function readCoordPair(coords: unknown): LngLatLike | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

function labelFromProps(props: Record<string, unknown>): string | undefined {
  for (const key of ["name", "NAME", "NAME_EN", "Name", "place", "title", "city"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function numericFromProps(
  props: Record<string, unknown>,
  valueProperty: string | null,
): number | undefined {
  if (!valueProperty) return undefined;
  const raw = props[valueProperty];
  if (isFiniteNumber(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    return parseOutfallSize(raw);
  }
  return undefined;
}

function featureId(
  feature: GeoJSON.Feature,
  props: Record<string, unknown>,
  index: number,
): string {
  if (feature.id !== undefined && feature.id !== null) return String(feature.id);
  const id = props.id ?? props.ISO_A3 ?? props.ADM0_A3;
  return typeof id === "string" || typeof id === "number"
    ? String(id)
    : `f-${index}`;
}

function pointFromGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
): LngLatLike | null {
  if (!geometry) return null;
  if (geometry.type === "Point") return readCoordPair(geometry.coordinates);
  if (geometry.type === "MultiPoint") {
    return readCoordPair(geometry.coordinates[0]);
  }
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      const point = pointFromGeometry(child);
      if (point) return point;
    }
  }
  return null;
}

function normalizeFeatureCollection(
  collection: GeoJSON.FeatureCollection,
): VizDataset {
  const points: VizPoint[] = [];
  const areas: VizArea[] = [];

  collection.features.forEach((feature, index) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const common = {
      id: featureId(feature, props, index),
      label: labelFromProps(props),
      properties: props,
    };
    if (
      feature.geometry?.type === "Polygon" ||
      feature.geometry?.type === "MultiPolygon"
    ) {
      areas.push({ ...common, geometry: feature.geometry });
      return;
    }
    const point = pointFromGeometry(feature.geometry);
    if (point) points.push({ ...common, ...point });
  });

  if (areas.length && points.length) {
    throw new Error("Mixed point and polygon GeoJSON is not supported");
  }
  if (areas.length) return { kind: "area", areas };
  return { kind: "point", points };
}

function normalizeLooseArray(data: unknown[]): VizDataset {
  const points: VizPoint[] = [];
  data.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const record = row as Record<string, unknown>;
    const lng = Number(record.lng ?? record.lon ?? record.longitude ?? record.x);
    const lat = Number(record.lat ?? record.latitude ?? record.y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const properties = Object.fromEntries(
      Object.entries(record).filter(
        ([key]) =>
          !["lng", "lon", "longitude", "x", "lat", "latitude", "y"].includes(
            key,
          ),
      ),
    );
    points.push({
      id: String(record.id ?? index),
      lng,
      lat,
      label: labelFromProps(properties),
      value: isFiniteNumber(record.value) ? record.value : undefined,
      properties,
    });
  });
  return { kind: "point", points };
}

export function normalizeGeoJson(data: unknown): VizDataset {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid JSON: expected an object or array");
  }
  if (Array.isArray(data)) return normalizeLooseArray(data);
  const object = data as Record<string, unknown>;
  if (object.type === "FeatureCollection" && Array.isArray(object.features)) {
    return normalizeFeatureCollection(
      object as unknown as GeoJSON.FeatureCollection,
    );
  }
  if (object.type === "Feature") {
    return normalizeFeatureCollection({
      type: "FeatureCollection",
      features: [object as unknown as GeoJSON.Feature],
    });
  }
  throw new Error(
    "Unsupported JSON. Use a GeoJSON FeatureCollection or [{lng,lat,...}]",
  );
}

export function listNumericProperties(items: PropertyFeature[]): string[] {
  const counts = new Map<string, number>();
  const sample = items.slice(0, 200);
  for (const item of sample) {
    for (const [key, value] of Object.entries(item.properties)) {
      if (
        isFiniteNumber(value) ||
        (typeof value === "string" &&
          value.trim() !== "" &&
          (Number.isFinite(Number(value)) ||
            parseOutfallSize(value) !== undefined))
      ) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts]
    .filter(([, count]) => count >= Math.min(5, sample.length))
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

export function listCategoricalProperties(items: PropertyFeature[]): string[] {
  const values = new Map<string, Set<string>>();
  for (const item of items.slice(0, 300)) {
    for (const [key, value] of Object.entries(item.properties)) {
      if (
        value === null ||
        value === undefined ||
        typeof value === "object" ||
        typeof value === "number"
      ) {
        continue;
      }
      const text = String(value);
      if (!text) continue;
      if (!values.has(key)) values.set(key, new Set());
      values.get(key)!.add(text);
    }
  }
  return [...values]
    .filter(([, set]) => set.size >= 2 && set.size <= 80)
    .sort((a, b) => a[1].size - b[1].size)
    .map(([key]) => key);
}

export function subsampleFeatures<T>(items: T[], maxItems: number): T[] {
  if (maxItems <= 0 || items.length <= maxItems) return items;
  const output: T[] = [];
  const step = items.length / maxItems;
  for (let i = 0; i < maxItems; i++) {
    output.push(items[Math.floor(i * step)]!);
  }
  return output;
}

export const subsamplePoints = subsampleFeatures;

export function applyValueProperty<T extends PropertyFeature>(
  items: T[],
  valueProperty: string | null,
): T[] {
  return items.map((item) => ({
    ...item,
    value: numericFromProps(item.properties, valueProperty),
  }));
}

export function boundsOfPoints(
  points: VizPoint[],
): [[number, number], [number, number]] | null {
  return boundsFromCoordinates(points.map((point) => [point.lng, point.lat]));
}

function visitAreaCoordinates(
  area: VizArea,
  visit: (lng: number, lat: number) => void,
): void {
  const polygons =
    area.geometry.type === "Polygon"
      ? [area.geometry.coordinates]
      : area.geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const coordinate of ring) {
        const point = readCoordPair(coordinate);
        if (point) visit(point.lng, point.lat);
      }
    }
  }
}

function boundsFromCoordinates(
  coordinates: Array<[number, number]>,
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return Number.isFinite(minLng)
    ? [
        [minLng, minLat],
        [maxLng, maxLat],
      ]
    : null;
}

export function boundsOfAreas(
  areas: VizArea[],
): [[number, number], [number, number]] | null {
  const coordinates: Array<[number, number]> = [];
  for (const area of areas) {
    visitAreaCoordinates(area, (lng, lat) => coordinates.push([lng, lat]));
  }
  return boundsFromCoordinates(coordinates);
}

export function boundsOfDataset(
  dataset: VizDataset,
): [[number, number], [number, number]] | null {
  return dataset.kind === "point"
    ? boundsOfPoints(dataset.points)
    : boundsOfAreas(dataset.areas);
}

export function centroidOfPoints(points: VizPoint[]): LngLatLike | null {
  if (!points.length) return null;
  let lng = 0;
  let lat = 0;
  for (const point of points) {
    lng += point.lng;
    lat += point.lat;
  }
  return { lng: lng / points.length, lat: lat / points.length };
}

export function centroidOfAreas(areas: VizArea[]): LngLatLike | null {
  const bounds = boundsOfAreas(areas);
  if (!bounds) return null;
  return {
    lng: (bounds[0][0] + bounds[1][0]) * 0.5,
    lat: (bounds[0][1] + bounds[1][1]) * 0.5,
  };
}

export async function loadDatasetFromUrl(url: string): Promise<VizDataset> {
  const response = await fetch(publicUrl(url));
  if (!response.ok) {
    throw new Error(`Failed to load dataset (${response.status})`);
  }
  return normalizeGeoJson(await response.json());
}

export async function loadDatasetFromFile(file: File): Promise<VizDataset> {
  return normalizeGeoJson(JSON.parse(await file.text()) as unknown);
}
