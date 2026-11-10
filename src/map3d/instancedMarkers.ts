import * as THREE from "three";
import type { ColorMode, PrimitiveType, VizPoint } from "@/lib/types";
import type { SceneOrigin } from "@/lib/mercator";
import { lngLatToLocalMeters } from "@/lib/mercator";
import {
  createPrimitiveGeometry,
  primitiveUsesWorldBevel,
} from "@/lib/primitives";
import { isGeometricPrimitive } from "@/lib/modelCatalog";
import type { GeometryQuality } from "@/lib/types";
import {
  categoryPaletteStops,
  DEFAULT_COLOR_RAMP,
} from "@/lib/colorRamp";
import { CONTACT_SHADOW_LAYER } from "@/lib/contactShadows";
import {
  bearingFromProperties,
  yawFromBearingDegrees,
} from "@/lib/bearing";
import { sampleFeatureOpacity } from "@/lib/featureOpacity";
import {
  COLLISION_FOOTPRINT_PADDING_METERS,
  UNLIMITED_COLLISION_SCALE_CAP,
  collisionScaleCaps,
} from "@/lib/collisionScale";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _pos = new THREE.Vector3();
const _rampScratch: THREE.Color[] = [];

function unitGroundHalfExtents(geometry?: THREE.BufferGeometry): {
  hx: number;
  hz: number;
} {
  if (geometry) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) {
      return {
        hx: Math.max(1e-4, (box.max.x - box.min.x) * 0.5),
        hz: Math.max(1e-4, (box.max.z - box.min.z) * 0.5),
      };
    }
  }
  return { hx: 0.5, hz: 0.5 };
}

function valueRange(points: VizPoint[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (typeof p.value === "number" && Number.isFinite(p.value)) {
      min = Math.min(min, p.value);
      max = Math.max(max, p.value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}

function buildRampColors(stops: string[]): THREE.Color[] {
  const source = stops.length >= 2 ? stops : [...DEFAULT_COLOR_RAMP];
  while (_rampScratch.length < source.length) {
    _rampScratch.push(new THREE.Color());
  }
  for (let i = 0; i < source.length; i++) {
    _rampScratch[i]!.set(source[i]!);
  }
  return _rampScratch.slice(0, source.length);
}

/** Piecewise lerp across N color stops for t ∈ [0, 1]. Writes into `_color`. */
function lerpColor(t: number, ramp: THREE.Color[]): THREE.Color {
  const clamped = Math.min(1, Math.max(0, t));
  if (ramp.length === 1) return _color.copy(ramp[0]!);
  const segments = ramp.length - 1;
  const scaled = clamped * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - i;
  return _color.copy(ramp[i]!).lerp(ramp[i + 1]!, localT);
}

function categoryColor(
  key: string,
  cache: Map<string, THREE.Color>,
  palette: string[],
): THREE.Color {
  let c = cache.get(key);
  if (!c) {
    const idx = cache.size % palette.length;
    c = new THREE.Color(palette[idx]);
    cache.set(key, c);
  }
  return c;
}

export type InstancedMarkersOptions = {
  points: VizPoint[];
  origin: SceneOrigin;
  primitive: PrimitiveType;
  /** Preloaded GLB geometry for vehicle models. Owned/disposed by caller path. */
  geometry?: THREE.BufferGeometry;
  quality: GeometryQuality;
  icosphereSubdivisions: number;
  bevelEnabled: boolean;
  bevelSize: number;
  bevelSegments: number;
  material: THREE.MeshPhysicalMaterial;
  baseScale: number;
  heightScale: number;
  colorMode: ColorMode;
  colorProperty: string | null;
  colorRamp: string[];
  opacityRandomMin: number;
  opacityRandomMax: number;
  frustumCulled: boolean;
};

export type PreparedMarkerInstance = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  colorR: number;
  colorG: number;
  colorB: number;
  opacity: number;
  adaptiveSize: number;
  scaleCap: number;
  bevelRadius: number;
};

export function disposeInstancedMesh(mesh: THREE.InstancedMesh | null): void {
  if (!mesh) return;
  const shadowGeometry = mesh.userData
    .contactShadowGeometry as THREE.BufferGeometry | undefined;
  if (shadowGeometry && shadowGeometry !== mesh.geometry) {
    shadowGeometry.dispose();
  }
  mesh.geometry.dispose();
  // material is shared / owned by layer — do not dispose here
  mesh.parent?.remove(mesh);
}

export function prepareMarkerInstances(
  options: InstancedMarkersOptions,
): PreparedMarkerInstance[] {
  const { points, material } = options;
  const prepared: PreparedMarkerInstance[] = new Array(points.length);
  const { min, max } = valueRange(points);
  const span = max - min || 1;
  let colorMin = min;
  let colorMax = max;
  if (options.colorMode === "value" && options.colorProperty) {
    const colorValues: number[] = [];
    for (const p of points) {
      const raw = p.properties[options.colorProperty];
      const n =
        typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? Number(raw)
            : NaN;
      if (Number.isFinite(n)) colorValues.push(n);
    }
    if (colorValues.length) {
      colorMin = Math.min(...colorValues);
      colorMax = Math.max(...colorValues);
      if (colorMin === colorMax) colorMax = colorMin + 1;
    }
  }
  const colorSpan = colorMax - colorMin || 1;
  const catCache = new Map<string, THREE.Color>();
  const valueRamp =
    options.colorMode === "value" ? buildRampColors(options.colorRamp) : [];
  const categoryStops =
    options.colorMode === "categorical"
      ? categoryPaletteStops(options.colorRamp)
      : [];
  const usePillarSizing = options.primitive === "pillar";
  const fallbackColor = new THREE.Color(material.color);
  let needsFeatureOpacityTransparency = false;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    lngLatToLocalMeters(options.origin, p.lng, p.lat, 0, _pos);
    const opacity = sampleFeatureOpacity(
      i,
      options.opacityRandomMin,
      options.opacityRandomMax,
    );
    if (opacity < 0.999) needsFeatureOpacityTransparency = true;
    const t =
      typeof p.value === "number" && Number.isFinite(p.value)
        ? (p.value - min) / span
        : 0.35;

    let sx = options.baseScale;
    let sy = options.baseScale;
    let sz = options.baseScale;
    if (usePillarSizing) {
      sy = options.baseScale + t * options.heightScale;
    } else {
      const s = options.baseScale + t * options.heightScale * 0.5;
      sx = s;
      sy = s;
      sz = s;
    }

    if (options.colorMode === "value") {
      let ct = t;
      if (options.colorProperty) {
        const raw = p.properties[options.colorProperty];
        const n =
          typeof raw === "number"
            ? raw
            : typeof raw === "string"
              ? Number(raw)
              : NaN;
        if (Number.isFinite(n)) ct = (n - colorMin) / colorSpan;
      }
      lerpColor(ct, valueRamp);
    } else if (options.colorMode === "categorical" && options.colorProperty) {
      const raw = p.properties[options.colorProperty];
      _color.copy(
        categoryColor(String(raw ?? "unknown"), catCache, categoryStops),
      );
    } else {
      _color.copy(fallbackColor);
    }

    const bearing = bearingFromProperties(p.properties);
    prepared[i] = {
      x: _pos.x,
      y: _pos.y,
      z: _pos.z,
      sx,
      sy,
      sz,
      yaw: bearing == null ? 0 : yawFromBearingDegrees(bearing),
      colorR: _color.r,
      colorG: _color.g,
      colorB: _color.b,
      opacity,
      adaptiveSize: sx,
      scaleCap: UNLIMITED_COLLISION_SCALE_CAP,
      bevelRadius: options.bevelSize * options.baseScale,
    };
  }

  material.userData.needsFeatureOpacityTransparency =
    needsFeatureOpacityTransparency;
  if (needsFeatureOpacityTransparency) material.transparent = true;

  const unit = unitGroundHalfExtents(options.geometry);
  const footprints = prepared.map((item) => ({
    x: item.x,
    z: item.z,
    yaw: item.yaw,
    hx: Math.max(1e-4, unit.hx * item.sx + COLLISION_FOOTPRINT_PADDING_METERS),
    hz: Math.max(1e-4, unit.hz * item.sz + COLLISION_FOOTPRINT_PADDING_METERS),
  }));
  const caps = collisionScaleCaps(footprints);
  for (let i = 0; i < prepared.length; i++) {
    prepared[i]!.scaleCap = caps[i]!;
  }
  return prepared;
}

export function createInstancedMarkerMesh(
  options: InstancedMarkersOptions,
  capacity: number,
): THREE.InstancedMesh | null {
  if (capacity <= 0) return null;
  const geometry =
    options.geometry ??
    (isGeometricPrimitive(options.primitive)
      ? createPrimitiveGeometry(options.primitive, {
          quality: options.quality,
          icosphereSubdivisions: options.icosphereSubdivisions,
          bevelEnabled: options.bevelEnabled,
          bevelSize: options.bevelSize,
          bevelSegments: options.bevelSegments,
        })
      : null);
  if (!geometry) {
    throw new Error(
      `Missing geometry for marker model "${options.primitive}"`,
    );
  }
  const useWorldBevel =
    options.bevelEnabled &&
    options.bevelSize > 1e-4 &&
    primitiveUsesWorldBevel(options.primitive);
  const adaptiveSizes = new Float32Array(capacity);
  const adaptiveCaps = new Float32Array(capacity);
  adaptiveCaps.fill(UNLIMITED_COLLISION_SCALE_CAP);
  geometry.setAttribute(
    "adaptiveScaleSize",
    new THREE.InstancedBufferAttribute(adaptiveSizes, 1),
  );
  geometry.setAttribute(
    "adaptiveScaleCap",
    new THREE.InstancedBufferAttribute(adaptiveCaps, 1),
  );
  const featureOpacities = new Float32Array(capacity);
  geometry.setAttribute(
    "featureOpacity",
    new THREE.InstancedBufferAttribute(featureOpacities, 1),
  );
  geometry.setAttribute(
    "pillarColor",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
  );
  geometry.setAttribute(
    "pillarLit",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
  );
  if (useWorldBevel) {
    geometry.setAttribute(
      "instanceSize",
      new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    );
    geometry.setAttribute(
      "instanceBevelRadius",
      new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
    );
  }
  const mesh = new THREE.InstancedMesh(geometry, options.material, capacity);
  mesh.layers.enable(CONTACT_SHADOW_LAYER);
  mesh.userData.contactShadowWorldBevel = useWorldBevel;
  mesh.userData.adaptiveScaleMode = "point";
  mesh.userData.useWorldBevel = useWorldBevel;
  mesh.userData.useInstanceColor = options.colorMode !== "none";
  if (
    options.primitive === "icosphere" ||
    options.primitive === "octahedron"
  ) {
    const shadowGeometry =
      options.primitive === "icosphere"
        ? new THREE.IcosahedronGeometry(0.5, 0)
        : new THREE.OctahedronGeometry(0.5, 0);
    shadowGeometry.translate(0, 0.5, 0);
    shadowGeometry.setAttribute(
      "adaptiveScaleSize",
      new THREE.InstancedBufferAttribute(adaptiveSizes, 1),
    );
    shadowGeometry.setAttribute(
      "adaptiveScaleCap",
      new THREE.InstancedBufferAttribute(adaptiveCaps, 1),
    );
    shadowGeometry.setAttribute(
      "featureOpacity",
      new THREE.InstancedBufferAttribute(featureOpacities, 1),
    );
    mesh.userData.contactShadowGeometry = shadowGeometry;
  }
  mesh.frustumCulled = options.frustumCulled;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (mesh.userData.useInstanceColor) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    );
  }
  mesh.count = 0;
  return mesh;
}

export function writePreparedMarkers(
  mesh: THREE.InstancedMesh,
  prepared: readonly PreparedMarkerInstance[],
  indices: readonly number[],
): void {
  const maxCount = mesh.instanceMatrix.count;
  const count = Math.min(indices.length, maxCount);
  const useWorldBevel = Boolean(mesh.userData.useWorldBevel);
  const useInstanceColor = Boolean(mesh.userData.useInstanceColor);
  const geometry = mesh.geometry;
  const adaptiveSizes = geometry.getAttribute("adaptiveScaleSize");
  const adaptiveCaps = geometry.getAttribute("adaptiveScaleCap");
  const featureOpacities = geometry.getAttribute("featureOpacity");
  const instanceSizes = geometry.getAttribute("instanceSize");
  const instanceBevels = geometry.getAttribute("instanceBevelRadius");

  for (let slot = 0; slot < count; slot++) {
    const item = prepared[indices[slot]!]!;
    _dummy.position.set(item.x, item.y, item.z);
    _dummy.scale.set(
      useWorldBevel ? 1 : item.sx,
      useWorldBevel ? 1 : item.sy,
      useWorldBevel ? 1 : item.sz,
    );
    _dummy.rotation.set(0, item.yaw, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(slot, _dummy.matrix);
    if (adaptiveSizes) adaptiveSizes.setX(slot, item.adaptiveSize);
    if (adaptiveCaps) adaptiveCaps.setX(slot, item.scaleCap);
    if (featureOpacities) featureOpacities.setX(slot, item.opacity);
    if (useWorldBevel && instanceSizes && instanceBevels) {
      instanceSizes.setXYZ(slot, item.sx, item.sy, item.sz);
      instanceBevels.setX(slot, item.bevelRadius);
    }
    if (useInstanceColor) {
      _color.setRGB(item.colorR, item.colorG, item.colorB);
      mesh.setColorAt(slot, _color);
    }
  }

  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  // Frustum tests use this sphere, and Three only builds it once. Recompute
  // after the instance set changes or a later zoom/pan culls the whole batch.
  mesh.computeBoundingSphere();
  if (adaptiveSizes) adaptiveSizes.needsUpdate = true;
  if (adaptiveCaps) adaptiveCaps.needsUpdate = true;
  if (featureOpacities) featureOpacities.needsUpdate = true;
  if (instanceSizes) instanceSizes.needsUpdate = true;
  if (instanceBevels) instanceBevels.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function buildInstancedMarkers(
  options: InstancedMarkersOptions,
): THREE.InstancedMesh | null {
  if (!options.points.length) return null;
  const prepared = prepareMarkerInstances(options);
  const mesh = createInstancedMarkerMesh(options, prepared.length);
  if (!mesh) return null;
  const indices = prepared.map((_, i) => i);
  writePreparedMarkers(mesh, prepared, indices);
  return mesh;
}

export function setInstancedFrustumCulled(
  mesh: THREE.InstancedMesh | null,
  culled: boolean,
): void {
  if (mesh) mesh.frustumCulled = culled;
}
