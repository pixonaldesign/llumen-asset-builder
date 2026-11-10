import * as THREE from "three";
import type { ColorMode, VizPoint, WaterGradientSettings } from "@/lib/types";
import type { SceneOrigin } from "@/lib/mercator";
import { lngLatToLocalMeters } from "@/lib/mercator";
import {
  WATER_GRADIENT_FRAGMENT,
  WATER_GRADIENT_VERTEX,
} from "@/lib/shaders/waterGradient";
import {
  WATER_STEM_FRAGMENT,
  WATER_STEM_VERTEX,
} from "@/lib/shaders/waterStem";
import {
  createEmptyWaterMaskTexture,
  type LocalAabb,
  type WaterMaskTexture,
} from "@/lib/waterMask";

export const WATER_GRADIENT_ALTITUDE = 0.3;
const STEM_MIN_HEIGHT_PIXELS = 18;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();

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

function instanceHeightT(points: VizPoint[]): Float32Array {
  const heightT = new Float32Array(points.length);
  const range = valueRange(points);
  const span = range.max - range.min || 1;
  for (let i = 0; i < points.length; i++) {
    const value = points[i]!.value;
    const hasValue = typeof value === "number" && Number.isFinite(value);
    heightT[i] = hasValue ? (value! - range.min) / span : 0.35;
  }
  return heightT;
}

/** Stable 0–1 seed so each plume's noise field and scroll differ. */
export function noiseSeedForPoint(lng: number, lat: number, id: string): number {
  const s =
    Math.sin(lng * 12.9898 + lat * 78.233 + id.length * 0.137) * 43758.5453123;
  return s - Math.floor(s);
}

export type WaterGradientUniforms = {
  uRadiusMeters: { value: number };
  uDistortion: { value: number };
  uNoiseScale: { value: number };
  uOctaves: { value: number };
  uTime: { value: number };
  uAnimationSpeed: { value: number };
  uAltitude: { value: number };
  uColor: { value: THREE.Color };
  uWaterMask: { value: THREE.Texture };
  uMaskMin: { value: THREE.Vector2 };
  uMaskSize: { value: THREE.Vector2 };
  uMaskReady: { value: number };
};

export type WaterStemUniforms = {
  uMinHeight: { value: number };
  uMaxHeight: { value: number };
  uMinHeightPixels: { value: number };
  uWidthPixels: { value: number };
  uMetersPerPixel: { value: number };
  uZoom: { value: number };
  uFadeStartZoom: { value: number };
  uFadeEndZoom: { value: number };
  uColor: { value: THREE.Color };
};

/** The subset of water-gradient settings that drives a stem. */
export type StemStyle = Pick<
  WaterGradientSettings,
  | "color"
  | "stemMinHeightMeters"
  | "stemMaxHeightMeters"
  | "stemWidthPixels"
  | "stemFadeStartZoom"
  | "stemFadeEndZoom"
>;

export type WaterGradientBuildOptions = {
  points: VizPoint[];
  origin: SceneOrigin;
  material: THREE.ShaderMaterial;
  settings: WaterGradientSettings;
  colorMode: ColorMode;
  colorProperty: string | null;
  colorRamp: string[];
  frustumCulled: boolean;
};

function createUnitDiscGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createUnitStemGeometry(): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false);
}

export function createWaterGradientMaterial(
  settings: WaterGradientSettings,
): THREE.ShaderMaterial {
  const emptyMask = createEmptyWaterMaskTexture();
  const uniforms: WaterGradientUniforms = {
    uRadiusMeters: { value: settings.radiusMeters },
    uDistortion: { value: settings.distortion },
    uNoiseScale: { value: settings.noiseScale },
    uOctaves: { value: settings.octaves },
    uTime: { value: 0 },
    uAnimationSpeed: { value: settings.animationSpeed },
    uAltitude: { value: WATER_GRADIENT_ALTITUDE },
    uColor: { value: new THREE.Color(settings.color) },
    uWaterMask: { value: emptyMask.texture },
    uMaskMin: { value: new THREE.Vector2(0, 0) },
    uMaskSize: { value: new THREE.Vector2(1, 1) },
    uMaskReady: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: WATER_GRADIENT_VERTEX,
    fragmentShader: WATER_GRADIENT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  material.defines = {
    ...(material.defines ?? {}),
    USE_INSTANCING: "",
  };
  material.userData.waterMaskTexture = emptyMask.texture;
  return material;
}

export function applyWaterGradientSettings(
  material: THREE.ShaderMaterial,
  settings: WaterGradientSettings,
): void {
  const uniforms = material.uniforms as unknown as WaterGradientUniforms;
  uniforms.uRadiusMeters.value = settings.radiusMeters;
  uniforms.uDistortion.value = settings.distortion;
  uniforms.uNoiseScale.value = settings.noiseScale;
  uniforms.uOctaves.value = settings.octaves;
  uniforms.uAnimationSpeed.value = settings.animationSpeed;
  uniforms.uColor.value.set(settings.color);
}

export function createWaterStemMaterial(
  settings: StemStyle,
): THREE.ShaderMaterial {
  const uniforms: WaterStemUniforms = {
    uMinHeight: { value: settings.stemMinHeightMeters },
    uMaxHeight: { value: settings.stemMaxHeightMeters },
    uMinHeightPixels: { value: STEM_MIN_HEIGHT_PIXELS },
    uWidthPixels: { value: settings.stemWidthPixels },
    uMetersPerPixel: { value: 1 },
    uZoom: { value: 0 },
    uFadeStartZoom: { value: settings.stemFadeStartZoom },
    uFadeEndZoom: { value: settings.stemFadeEndZoom },
    uColor: { value: new THREE.Color(settings.color) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: WATER_STEM_VERTEX,
    fragmentShader: WATER_STEM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  material.defines = {
    ...(material.defines ?? {}),
    USE_INSTANCING: "",
  };
  return material;
}

export function applyWaterStemSettings(
  material: THREE.ShaderMaterial,
  settings: StemStyle,
): void {
  const uniforms = material.uniforms as unknown as WaterStemUniforms;
  const minH = Math.min(
    settings.stemMinHeightMeters,
    settings.stemMaxHeightMeters,
  );
  const maxH = Math.max(
    settings.stemMinHeightMeters,
    settings.stemMaxHeightMeters,
  );
  uniforms.uMinHeight.value = minH;
  uniforms.uMaxHeight.value = maxH;
  uniforms.uWidthPixels.value = settings.stemWidthPixels;
  uniforms.uFadeStartZoom.value = Math.min(
    settings.stemFadeStartZoom,
    settings.stemFadeEndZoom,
  );
  uniforms.uFadeEndZoom.value = Math.max(
    settings.stemFadeStartZoom,
    settings.stemFadeEndZoom,
  );
  uniforms.uColor.value.set(settings.color);
}

export function applyWaterStemZoom(
  material: THREE.ShaderMaterial,
  zoom: number,
  metersPerPixel: number,
): void {
  const uniforms = material.uniforms as unknown as WaterStemUniforms;
  uniforms.uZoom.value = zoom;
  uniforms.uMetersPerPixel.value = Math.max(metersPerPixel, 0.000001);
}

export function applyWaterMaskToMaterial(
  material: THREE.ShaderMaterial,
  mask: WaterMaskTexture,
): void {
  const uniforms = material.uniforms as unknown as WaterGradientUniforms;
  const previous = material.userData.waterMaskTexture as THREE.Texture | undefined;
  if (previous && previous !== mask.texture) {
    previous.dispose();
  }
  uniforms.uWaterMask.value = mask.texture;
  uniforms.uMaskMin.value.set(mask.bounds.minX, mask.bounds.minZ);
  uniforms.uMaskSize.value.set(
    Math.max(1, mask.bounds.maxX - mask.bounds.minX),
    Math.max(1, mask.bounds.maxZ - mask.bounds.minZ),
  );
  uniforms.uMaskReady.value = mask.hasWater ? 1 : 0;
  material.userData.waterMaskTexture = mask.texture;
}

export function setWaterGradientTime(
  material: THREE.ShaderMaterial,
  timeSeconds: number,
): void {
  const uniforms = material.uniforms as unknown as WaterGradientUniforms;
  uniforms.uTime.value = timeSeconds;
}

export function waterGradientNeedsAnimation(
  material: THREE.ShaderMaterial,
): boolean {
  const uniforms = material.uniforms as unknown as WaterGradientUniforms;
  return uniforms.uAnimationSpeed.value > 1e-6;
}

export function waterMaskIsReady(material: THREE.ShaderMaterial): boolean {
  const uniforms = material.uniforms as unknown as WaterGradientUniforms;
  return uniforms.uMaskReady.value > 0.5;
}

export function disposeWaterGradientMaterial(
  material: THREE.ShaderMaterial | null,
): void {
  if (!material) return;
  const mask = material.userData.waterMaskTexture as THREE.Texture | undefined;
  mask?.dispose();
  material.dispose();
}

export function disposeWaterGradients(mesh: THREE.InstancedMesh | null): void {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.parent?.remove(mesh);
}

export function disposeWaterStems(mesh: THREE.InstancedMesh | null): void {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.parent?.remove(mesh);
}

export function maskBoundsForPoints(
  origin: SceneOrigin,
  points: VizPoint[],
  radiusMeters: number,
): LocalAabb | null {
  if (!points.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    lngLatToLocalMeters(origin, point.lng, point.lat, 0, _pos);
    minX = Math.min(minX, _pos.x);
    maxX = Math.max(maxX, _pos.x);
    minZ = Math.min(minZ, _pos.z);
    maxZ = Math.max(maxZ, _pos.z);
  }
  if (!Number.isFinite(minX)) return null;
  const pad = Math.max(radiusMeters * 2, 50);
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
  };
}

export function buildWaterGradients(
  options: WaterGradientBuildOptions,
): THREE.InstancedMesh | null {
  const { points, origin, settings } = options;
  if (!points.length) return null;

  const heightT = instanceHeightT(points);
  const geometry = createUnitDiscGeometry();
  const radiusMul = new Float32Array(points.length);
  const seeds = new Float32Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    radiusMul[i] = settings.radiusFromValue ? 0.35 + heightT[i]! * 0.65 : 1;
    seeds[i] = noiseSeedForPoint(point.lng, point.lat, point.id);
  }

  geometry.setAttribute(
    "instanceRadiusMul",
    new THREE.InstancedBufferAttribute(radiusMul, 1),
  );
  geometry.setAttribute(
    "instanceSeed",
    new THREE.InstancedBufferAttribute(seeds, 1),
  );
  const flagCovered = new THREE.InstancedBufferAttribute(
    new Float32Array(points.length),
    1,
  );
  flagCovered.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("flagCovered", flagCovered);
  const flagColors = new THREE.InstancedBufferAttribute(
    new Float32Array(points.length * 3),
    3,
  );
  flagColors.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("flagColor", flagColors);

  const material = options.material;
  applyWaterGradientSettings(material, settings);
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  mesh.frustumCulled = options.frustumCulled;
  mesh.renderOrder = 2;

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    lngLatToLocalMeters(origin, point.lng, point.lat, 0, _pos);
    _dummy.position.set(_pos.x, WATER_GRADIENT_ALTITUDE, _pos.z);
    _dummy.scale.set(1, 1, 1);
    _dummy.rotation.set(0, 0, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** One stem per entry in `heightT`. Callers place instances with `setMatrixAt`. */
export function createStemMesh(
  material: THREE.ShaderMaterial,
  heightT: Float32Array,
): THREE.InstancedMesh {
  const geometry = createUnitStemGeometry();
  geometry.setAttribute(
    "instanceHeightT",
    new THREE.InstancedBufferAttribute(heightT, 1),
  );
  const mesh = new THREE.InstancedMesh(geometry, material, heightT.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

export function buildWaterStems(
  options: WaterGradientBuildOptions & { stemMaterial: THREE.ShaderMaterial },
): THREE.InstancedMesh | null {
  const { points, origin, settings } = options;
  if (!points.length) return null;

  applyWaterStemSettings(options.stemMaterial, settings);
  const mesh = createStemMesh(options.stemMaterial, instanceHeightT(points));

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    lngLatToLocalMeters(origin, point.lng, point.lat, 0, _pos);
    _dummy.position.set(_pos.x, WATER_GRADIENT_ALTITUDE, _pos.z);
    _dummy.scale.set(1, 1, 1);
    _dummy.rotation.set(0, 0, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
