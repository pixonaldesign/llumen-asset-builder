import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { categoryPaletteStops, DEFAULT_COLOR_RAMP } from "@/lib/colorRamp";
import { lngLatToLocalMeters, type SceneOrigin } from "@/lib/mercator";
import type { ColorMode, VizArea } from "@/lib/types";
import { CONTACT_SHADOW_LAYER } from "@/lib/contactShadows";
import { sampleFeatureOpacity } from "@/lib/featureOpacity";

export type AreaFlagSpan = {
  id: string;
  value?: number;
  vertexStart: number;
  vertexCount: number;
};


export type ExtrudedAreasOptions = {
  areas: VizArea[];
  origin: SceneOrigin;
  material: THREE.MeshPhysicalMaterial;
  baseHeight: number;
  extrusionScale: number;
  bevelEnabled: boolean;
  bevelSize: number;
  bevelSegments: number;
  colorMode: ColorMode;
  colorProperty: string | null;
  colorRamp: string[];
  opacityRandomMin: number;
  opacityRandomMax: number;
  frustumCulled: boolean;
};

function numericProperty(area: VizArea, property: string | null): number | null {
  if (!property) return null;
  const raw = area.properties[property];
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function numericRange(
  areas: VizArea[],
  read: (area: VizArea) => number | null,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const area of areas) {
    const value = read(area);
    if (value === null) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return Number.isFinite(min) && Number.isFinite(max) && min !== max
    ? { min, max }
    : { min: 0, max: 1 };
}

function rampColor(stops: string[], t: number, target: THREE.Color): THREE.Color {
  const source = stops.length >= 2 ? stops : [...DEFAULT_COLOR_RAMP];
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const scaled = clamped * (source.length - 1);
  const index = Math.min(source.length - 2, Math.floor(scaled));
  return target
    .set(source[index]!)
    .lerp(new THREE.Color(source[index + 1]!), scaled - index);
}

function ringToPoints(
  ring: GeoJSON.Position[],
  origin: SceneOrigin,
): THREE.Vector2[] {
  const local = new THREE.Vector3();
  const points: THREE.Vector2[] = [];
  for (const coordinate of ring) {
    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    lngLatToLocalMeters(origin, lng, lat, 0, local);
    const point = new THREE.Vector2(local.x, -local.z);
    const previous = points[points.length - 1];
    if (!previous || previous.distanceToSquared(point) > 1e-8) points.push(point);
  }
  if (
    points.length > 2 &&
    points[0]!.distanceToSquared(points[points.length - 1]!) < 1e-8
  ) {
    points.pop();
  }
  return points;
}

function polygonShape(
  polygon: GeoJSON.Position[][],
  origin: SceneOrigin,
): THREE.Shape | null {
  const outer = ringToPoints(polygon[0] ?? [], origin);
  if (outer.length < 3) return null;
  if (!THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
  const shape = new THREE.Shape(outer);
  for (const ring of polygon.slice(1)) {
    const hole = ringToPoints(ring, origin);
    if (hole.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
    shape.holes.push(new THREE.Path(hole));
  }
  return shape;
}

function geometryColor(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function geometryOpacity(
  geometry: THREE.BufferGeometry,
  opacity: number,
): void {
  const position = geometry.getAttribute("position");
  const opacities = new Float32Array(position.count);
  opacities.fill(opacity);
  geometry.setAttribute(
    "featureOpacity",
    new THREE.BufferAttribute(opacities, 1),
  );
}

function geometryHasFinitePositions(geometry: THREE.BufferGeometry): boolean {
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    if (
      !Number.isFinite(position.getX(i)) ||
      !Number.isFinite(position.getY(i)) ||
      !Number.isFinite(position.getZ(i))
    ) {
      return false;
    }
  }
  return true;
}

export function buildExtrudedAreas(
  options: ExtrudedAreasOptions,
): THREE.Mesh | null {
  if (!options.areas.length) return null;
  const valueRange = numericRange(options.areas, (area) =>
    typeof area.value === "number" && Number.isFinite(area.value)
      ? area.value
      : null,
  );
  const colorRange = numericRange(options.areas, (area) =>
    numericProperty(area, options.colorProperty),
  );
  const categoryColors = new Map<string, THREE.Color>();
  const color = new THREE.Color();
  const geometries: THREE.BufferGeometry[] = [];
  const flagSpans: AreaFlagSpan[] = [];
  let vertexCursor = 0;
  let featureIndex = 0;
  let needsFeatureOpacityTransparency = false;

  for (const area of options.areas) {
    const value =
      typeof area.value === "number" && Number.isFinite(area.value)
        ? area.value
        : valueRange.min;
    const t = THREE.MathUtils.clamp(
      (value - valueRange.min) / (valueRange.max - valueRange.min || 1),
      0,
      1,
    );
    const featureOpacity = sampleFeatureOpacity(
      featureIndex,
      options.opacityRandomMin,
      options.opacityRandomMax,
    );
    featureIndex += 1;
    if (featureOpacity < 0.999) needsFeatureOpacityTransparency = true;
    const depth = Math.max(1, options.baseHeight + t * options.extrusionScale);
    const bevelRadius = Math.min(
      depth * 0.25,
      Math.max(0, options.bevelSize * Math.max(options.baseHeight, depth * 0.05)),
    );

    if (options.colorMode === "value") {
      const colorValue = numericProperty(area, options.colorProperty);
      const colorT =
        colorValue === null
          ? t
          : (colorValue - colorRange.min) /
            (colorRange.max - colorRange.min || 1);
      rampColor(options.colorRamp, colorT, color);
    } else if (options.colorMode === "categorical" && options.colorProperty) {
      const key = String(area.properties[options.colorProperty] ?? "unknown");
      let categoryColor = categoryColors.get(key);
      if (!categoryColor) {
        const palette = categoryPaletteStops(options.colorRamp);
        categoryColor = new THREE.Color(
          palette[categoryColors.size % palette.length],
        );
        categoryColors.set(key, categoryColor);
      }
      color.copy(categoryColor);
    } else {
      color.copy(options.material.color);
    }

    const polygons =
      area.geometry.type === "Polygon"
        ? [area.geometry.coordinates]
        : area.geometry.coordinates;
    for (const polygon of polygons) {
      const shape = polygonShape(polygon, options.origin);
      if (!shape) continue;
      const extrusionOptions: THREE.ExtrudeGeometryOptions = {
        depth,
        steps: 1,
        bevelEnabled: options.bevelEnabled && bevelRadius > 1e-4,
        bevelSize: bevelRadius,
        bevelThickness: bevelRadius,
        bevelSegments: Math.max(1, Math.round(options.bevelSegments)),
        curveSegments: 1,
      };
      let geometry = new THREE.ExtrudeGeometry(shape, extrusionOptions);
      // Complex coastlines can contain near-collinear corners for which
      // ExtrudeGeometry's bevel offset becomes undefined. Fall back per-part
      // instead of poisoning the merged mesh with NaN positions.
      if (!geometryHasFinitePositions(geometry)) {
        geometry.dispose();
        geometry = new THREE.ExtrudeGeometry(shape, {
          depth,
          steps: 1,
          bevelEnabled: false,
          curveSegments: 1,
        });
      }
      if (!geometryHasFinitePositions(geometry)) {
        geometry.dispose();
        continue;
      }
      geometry.rotateX(-Math.PI / 2);
      const adaptiveSizes = new Float32Array(
        geometry.getAttribute("position").count,
      );
      adaptiveSizes.fill(depth);
      geometry.setAttribute(
        "adaptiveScaleSize",
        new THREE.BufferAttribute(adaptiveSizes, 1),
      );
      geometryColor(geometry, color);
      geometryOpacity(geometry, featureOpacity);
      const vertexCount = geometry.getAttribute("position").count;
      flagSpans.push({
        id: area.id,
        value: typeof area.value === "number" ? area.value : undefined,
        vertexStart: vertexCursor,
        vertexCount,
      });
      vertexCursor += vertexCount;
      geometries.push(geometry);
    }
  }

  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return null;
  const flagCovered = new Float32Array(merged.getAttribute("position").count);
  const flagColors = new Float32Array(flagCovered.length * 3);
  merged.setAttribute("flagCovered", new THREE.BufferAttribute(flagCovered, 1));
  merged.setAttribute("flagColor", new THREE.BufferAttribute(flagColors, 3));
  merged.computeVertexNormals();
  options.material.vertexColors = true;
  options.material.needsUpdate = true;
  options.material.userData.needsFeatureOpacityTransparency =
    needsFeatureOpacityTransparency;
  if (needsFeatureOpacityTransparency) options.material.transparent = true;
  const mesh = new THREE.Mesh(merged, options.material);
  mesh.layers.enable(CONTACT_SHADOW_LAYER);
  mesh.userData.contactShadowWorldBevel = false;
  mesh.userData.adaptiveScaleMode = "area";
  mesh.frustumCulled = options.frustumCulled;
  mesh.userData.featureCount = options.areas.length;
  mesh.userData.areaFlagSpans = flagSpans;
  return mesh;
}

export function disposeExtrudedAreas(mesh: THREE.Mesh | null): void {
  if (!mesh) return;
  mesh.parent?.remove(mesh);
  mesh.geometry.dispose();
}
