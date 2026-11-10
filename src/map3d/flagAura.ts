import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PreparedMarkerInstance } from "@/lib/instancedMarkers";
import { UNLIMITED_COLLISION_SCALE_CAP } from "@/lib/collisionScale";
import {
  FLAG_BEACON_FRAGMENT,
  FLAG_BEACON_VERTEX,
} from "@/lib/shaders/flagBeacon";
import {
  FLAG_BEACON_POOL_FRAGMENT,
  FLAG_BEACON_POOL_VERTEX,
} from "@/lib/shaders/flagBeaconPool";
import {
  FLAG_AURA_FRAGMENT,
  FLAG_AURA_VERTEX,
} from "@/lib/shaders/flagAura";
import { FLAG_MASK_FRAGMENT } from "@/lib/shaders/flagOutline";
import type { AdaptiveZoomUniformState } from "@/lib/zoomScaling";
import type {
  FlagAuraAnimation,
  FlagAuraAssignMode,
  FlagAuraSettings,
  FlagBeaconMark,
  LookdevFlag,
  VizPoint,
} from "@/lib/types";
import { FLAG_AURA_BLOOM_LAYER } from "@/lib/flagAuraBloom";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export const DEFAULT_FLAG_AURA: FlagAuraSettings = {
  enabled: true,
  assignMode: "random",
  coverage: 0.35,
  positiveColor: "#04ef00",
  neutralColor: "#1381ef",
  negativeColor: "#ff5a5f",
  intensity: 1.6,
  animation: "pillar",
  pulseSpeed: 0.8,
  pulseAmplitude: 0.44,
  faceOffset: 0.06,
  noiseScale: 3.5,
  falloff: 1.8,
  pillarBase: true,
  pillarHeight: 0.38,
  pillarBeaconSize: 21,
  pillarBeaconMark: "ordinal",
  pillarStemSize: 74,
  /** How strongly the bottom light tints the mesh. Same on every shape. */
  pillarLight: 1.45,
  syncPulse: true,
  bloomEnabled: false,
  bloomStrength: 1.1,
  bloomRadius: 1.6,
  bloomResolution: 0.35,
  outlinePulse: true,
  outlineDashes: false,
  outlineWidth: 2,
  outlineWidthFollowsZoom: false,
  outlineWidthZoom: 14,
  outlineBloom: true,
  outlineBloomStrength: 1.15,
};

export type FlagAuraSource = {
  id: string;
  value?: number;
};

export type FlagAuraUniforms = {
  uFaceOffset: { value: number };
  uTime: { value: number };
  uIntensity: { value: number };
  uPulseSpeed: { value: number };
  uPulseAmplitude: { value: number };
  uFalloff: { value: number };
  uNoiseScale: { value: number };
  uAnimMode: { value: number };
  uPillarHeight: { value: number };
  uObjectTop: { value: number };
  uPillarRadius: { value: number };
  uFresnelCameraPos: { value: THREE.Vector3 };
  uAdaptiveScaleEnabled: { value: number };
  uAdaptiveMetersPerPixel: { value: number };
  uAdaptiveMinPixels: { value: number };
  uAdaptiveMaxPixels: { value: number };
  uCollisionAwareEnabled: { value: number };
};

export const FLAG_AURA_ANIM_MODE: Record<FlagAuraAnimation, number> = {
  pulse: 0,
  noise: 1,
  caustic: 2,
  outline: 0,
  pillar: 3,
};

/** How far the light pillar sits outside the object's horizontal footprint. */
export const LIGHT_PILLAR_RADIUS_SCALE = 1.06;

const FLAG_ORDER: LookdevFlag[] = ["negative", "neutral", "positive"];

/** FNV-1a 32-bit, mapped to [0, 1). */
export function hashStringToUnit(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function flagValueRange(
  sources: readonly FlagAuraSource[],
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const source of sources) {
    if (typeof source.value === "number" && Number.isFinite(source.value)) {
      min = Math.min(min, source.value);
      max = Math.max(max, source.value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }
  return { min, max };
}

/** Stable per-id gate so the same points stay flagged as coverage changes. */
export function isLookdevFlagCovered(id: string, coverage: number): boolean {
  if (coverage <= 0) return false;
  if (coverage >= 1) return true;
  return hashStringToUnit(`coverage:${id}`) < coverage;
}

export function assignLookdevFlag(
  source: FlagAuraSource,
  mode: FlagAuraAssignMode,
  range: { min: number; max: number } | null,
): LookdevFlag {
  if (
    mode === "value" &&
    range &&
    typeof source.value === "number" &&
    Number.isFinite(source.value)
  ) {
    const t = (source.value - range.min) / (range.max - range.min);
    if (t < 1 / 3) return "negative";
    if (t < 2 / 3) return "neutral";
    return "positive";
  }
  const unit = hashStringToUnit(source.id);
  return FLAG_ORDER[Math.min(2, Math.floor(unit * 3))]!;
}

export function lookdevPulsePhase(id: string, syncPulse: boolean): number {
  if (syncPulse) return 0;
  return hashStringToUnit(`phase:${id}`) * Math.PI * 2;
}

export function flagAuraSourcesFromPoints(
  points: readonly VizPoint[],
): FlagAuraSource[] {
  return points.map((point) => ({ id: point.id, value: point.value }));
}

export function flagColorHex(
  flag: LookdevFlag,
  settings: FlagAuraSettings,
): string {
  if (flag === "positive") return settings.positiveColor;
  if (flag === "negative") return settings.negativeColor;
  return settings.neutralColor;
}

export function flagAuraNeedsAnimation(settings: FlagAuraSettings): boolean {
  if (!settings.enabled) return false;
  if (settings.pulseSpeed <= 0) return false;
  if (settings.animation === "pulse" || settings.animation === "pillar") {
    return settings.pulseAmplitude > 0;
  }
  return true;
}

export function flagAuraMeshKey(
  sourceUuid: string | undefined,
  animation: FlagAuraAnimation,
): string {
  const kind = animation === "pillar" ? "pillar" : "shell";
  return `${sourceUuid ?? "fallback"}:${kind}`;
}

export function markerAuraFootprint(
  source: THREE.BufferGeometry | null | undefined,
): { top: number; radius: number } {
  if (!source) return { top: 1, radius: 0.5 };
  if (!source.boundingBox) source.computeBoundingBox();
  const box = source.boundingBox;
  if (!box) return { top: 1, radius: 0.5 };
  const radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z, 0.05);
  return { top: Math.max(box.max.y, 0.05), radius };
}

/** Screen-space stroke motion. Independent of the fresnel shell animation. */
export function flagOutlineNeedsAnimation(settings: FlagAuraSettings): boolean {
  if (!settings.enabled) return false;
  if (settings.outlineBloom && settings.outlineBloomStrength > 0) return true;
  if (settings.pulseSpeed <= 0) return false;
  return settings.outlinePulse || settings.outlineDashes;
}

function createUnitAuraGeometry(): THREE.IcosahedronGeometry {
  return new THREE.IcosahedronGeometry(0.5, 2);
}

const AURA_STRIP_ATTRIBUTES = [
  "adaptiveScaleSize",
  "adaptiveScaleCap",
  "featureOpacity",
  "instanceSize",
  "instanceBevelRadius",
  "auraPhase",
  "auraColor",
] as const;

function sitGeometryOnGround(geometry: THREE.BufferGeometry): void {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box || box.min.y >= -1e-4) return;
  geometry.translate(0, -box.min.y, 0);
  geometry.boundingBox = null;
  geometry.boundingSphere = null;
}

/**
 * Faceted marker meshes duplicate vertices per face. Offsetting those along
 * face normals pulls the shell apart. Weld on position only, then average
 * vertex normals so inflate stays a connected hull.
 */
function weldConnectedHull(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position") geometry.deleteAttribute(name);
  }
  const welded = mergeVertices(geometry);
  if (welded !== geometry) geometry.dispose();
  sitGeometryOnGround(welded);
  welded.computeVertexNormals();
  return welded;
}

function attachFlagAuraAttributes(
  geometry: THREE.BufferGeometry,
  capacity: number,
): void {
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
  geometry.setAttribute(
    "auraPhase",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
  );
  geometry.setAttribute(
    "auraColor",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
  );
}

/** Clone marker geometry into an aura shell, without sharing GPU buffers. */
export function createFlagAuraGeometry(
  source: THREE.BufferGeometry | null | undefined,
  capacity: number,
): THREE.BufferGeometry {
  const cloned = source ? source.clone() : createUnitAuraGeometry();
  for (const name of AURA_STRIP_ATTRIBUTES) {
    cloned.deleteAttribute(name);
  }
  const geometry = weldConnectedHull(cloned);
  attachFlagAuraAttributes(geometry, capacity);
  return geometry;
}

/**
 * Unit-height cylinder in local marker space. The shader roots it at the
 * bottom of the form and stretches it by `pillarHeight`.
 */
export function createLightPillarGeometry(
  source: THREE.BufferGeometry | null | undefined,
  capacity: number,
): THREE.BufferGeometry {
  const footprint = markerAuraFootprint(source);
  const radius = footprint.radius * LIGHT_PILLAR_RADIUS_SCALE;
  const geometry = new THREE.CylinderGeometry(radius, radius, 1, 48, 1, false);
  attachFlagAuraAttributes(geometry, capacity);
  geometry.userData.objectTop = footprint.top;
  geometry.userData.pillarRadius = radius;
  return geometry;
}

export type FlagBeaconUniforms = {
  uTime: { value: number };
  uIntensity: { value: number };
  uPulseSpeed: { value: number };
  uPulseAmplitude: { value: number };
  uObjectTop: { value: number };
  uPillarRadius: { value: number };
  uBeaconPixels: { value: number };
  uStemPixels: { value: number };
  uBeaconMark: { value: number };
  uResolution: { value: THREE.Vector2 };
  uFresnelCameraPos: { value: THREE.Vector3 };
  uAdaptiveScaleEnabled: { value: number };
  uAdaptiveMetersPerPixel: { value: number };
  uAdaptiveMinPixels: { value: number };
  uAdaptiveMaxPixels: { value: number };
  uCollisionAwareEnabled: { value: number };
};

export function createFlagBeaconMaterial(
  settings: FlagAuraSettings = DEFAULT_FLAG_AURA,
): THREE.ShaderMaterial {
  const uniforms: FlagBeaconUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: settings.intensity },
    uPulseSpeed: { value: settings.pulseSpeed },
    uPulseAmplitude: { value: settings.pulseAmplitude },
    uObjectTop: { value: 1 },
    uPillarRadius: { value: 0.5 },
    uBeaconPixels: { value: settings.pillarBeaconSize },
    uStemPixels: { value: settings.pillarStemSize },
    uBeaconMark: { value: settings.pillarBeaconMark === "ordinal" ? 1 : 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uFresnelCameraPos: { value: new THREE.Vector3() },
    uAdaptiveScaleEnabled: { value: 0 },
    uAdaptiveMetersPerPixel: { value: 1 },
    uAdaptiveMinPixels: { value: 8 },
    uAdaptiveMaxPixels: { value: 64 },
    uCollisionAwareEnabled: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: FLAG_BEACON_VERTEX,
    fragmentShader: FLAG_BEACON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  material.defines = {
    ...(material.defines ?? {}),
    USE_INSTANCING: "",
  };
  return material;
}

export function applyFlagBeaconSettings(
  material: THREE.ShaderMaterial,
  settings: FlagAuraSettings,
): void {
  const uniforms = material.uniforms as unknown as FlagBeaconUniforms;
  uniforms.uIntensity.value = settings.intensity;
  uniforms.uPulseSpeed.value = settings.pulseSpeed;
  uniforms.uPulseAmplitude.value = settings.pulseAmplitude;
  uniforms.uBeaconMark.value = settings.pillarBeaconMark === "ordinal" ? 1 : 0;
}

export function sanitizeBeaconMark(
  value: unknown,
  fallback: FlagBeaconMark,
): FlagBeaconMark {
  return value === "cross" || value === "ordinal" ? value : fallback;
}

/** Device-pixel beacon diameter and stem length. Resolution is the map drawing buffer. */
export function setFlagBeaconScreen(
  material: THREE.ShaderMaterial,
  cssPixels: number,
  stemCssPixels: number,
  bufferWidth: number,
  bufferHeight: number,
  cssWidth: number,
): void {
  const uniforms = material.uniforms as unknown as FlagBeaconUniforms;
  const width = Math.max(1, bufferWidth);
  const height = Math.max(1, bufferHeight);
  const pixelsPerCss = cssWidth > 1 ? width / cssWidth : 1;
  uniforms.uBeaconPixels.value = Math.max(1, cssPixels) * pixelsPerCss;
  uniforms.uStemPixels.value = Math.max(0, stemCssPixels) * pixelsPerCss;
  uniforms.uResolution.value.set(width, height);
}

export function setFlagBeaconFootprint(
  material: THREE.ShaderMaterial,
  objectTop: number,
  radius: number,
): void {
  const uniforms = material.uniforms as unknown as FlagBeaconUniforms;
  uniforms.uObjectTop.value = objectTop;
  uniforms.uPillarRadius.value = radius;
}

export function createFlagBeaconMesh(
  material: THREE.ShaderMaterial,
  capacity: number,
  frustumCulled: boolean,
): THREE.InstancedMesh | null {
  if (capacity <= 0) return null;
  const geometry = new THREE.PlaneGeometry(1, 1);
  attachFlagAuraAttributes(geometry, capacity);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = frustumCulled;
  mesh.renderOrder = 4;
  mesh.count = 0;
  return mesh;
}

/** Small contact radius as a fraction of the pillar footprint. */
export const BEACON_POOL_RADIUS_SCALE = 0.2;

/** Sits on the cap. A depth offset keeps it from z-fighting; it does not float the stem. */
export const BEACON_POOL_LIFT = 0.003;

export type FlagBeaconPoolUniforms = {
  uTime: { value: number };
  uIntensity: { value: number };
  uPulseSpeed: { value: number };
  uPulseAmplitude: { value: number };
  uObjectTop: { value: number };
  uPillarRadius: { value: number };
  uPoolRadiusScale: { value: number };
  uPoolLift: { value: number };
  uStemPresence: { value: number };
  uAdaptiveScaleEnabled: { value: number };
  uAdaptiveMetersPerPixel: { value: number };
  uAdaptiveMinPixels: { value: number };
  uAdaptiveMaxPixels: { value: number };
  uCollisionAwareEnabled: { value: number };
};

export function createFlagBeaconPoolMaterial(
  settings: FlagAuraSettings = DEFAULT_FLAG_AURA,
): THREE.ShaderMaterial {
  const uniforms: FlagBeaconPoolUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: settings.intensity },
    uPulseSpeed: { value: settings.pulseSpeed },
    uPulseAmplitude: { value: settings.pulseAmplitude },
    uObjectTop: { value: 1 },
    uPillarRadius: { value: 0.5 },
    uPoolRadiusScale: { value: BEACON_POOL_RADIUS_SCALE },
    uPoolLift: { value: BEACON_POOL_LIFT },
    uStemPresence: { value: settings.pillarStemSize > 0 ? 1 : 0 },
    uAdaptiveScaleEnabled: { value: 0 },
    uAdaptiveMetersPerPixel: { value: 1 },
    uAdaptiveMinPixels: { value: 8 },
    uAdaptiveMaxPixels: { value: 64 },
    uCollisionAwareEnabled: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: FLAG_BEACON_POOL_VERTEX,
    fragmentShader: FLAG_BEACON_POOL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.defines = {
    ...(material.defines ?? {}),
    USE_INSTANCING: "",
  };
  return material;
}

export function applyFlagBeaconPoolSettings(
  material: THREE.ShaderMaterial,
  settings: FlagAuraSettings,
): void {
  const uniforms = material.uniforms as unknown as FlagBeaconPoolUniforms;
  uniforms.uIntensity.value = settings.intensity;
  uniforms.uPulseSpeed.value = settings.pulseSpeed;
  uniforms.uPulseAmplitude.value = settings.pulseAmplitude;
  uniforms.uStemPresence.value = settings.pillarStemSize > 0 ? 1 : 0;
}

export function setFlagBeaconPoolFootprint(
  material: THREE.ShaderMaterial,
  objectTop: number,
  radius: number,
): void {
  const uniforms = material.uniforms as unknown as FlagBeaconPoolUniforms;
  uniforms.uObjectTop.value = objectTop;
  uniforms.uPillarRadius.value = radius;
}

export function setFlagBeaconPoolStemPresence(
  material: THREE.ShaderMaterial,
  stemCssPixels: number,
): void {
  const uniforms = material.uniforms as unknown as FlagBeaconPoolUniforms;
  uniforms.uStemPresence.value = stemCssPixels > 0 ? 1 : 0;
}

export function createFlagBeaconPoolMesh(
  material: THREE.ShaderMaterial,
  capacity: number,
  frustumCulled: boolean,
): THREE.InstancedMesh | null {
  if (capacity <= 0) return null;
  const geometry = new THREE.CircleGeometry(1, 48);
  geometry.rotateX(-Math.PI / 2);
  attachFlagAuraAttributes(geometry, capacity);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = frustumCulled;
  mesh.renderOrder = 3;
  mesh.count = 0;
  return mesh;
}

export function createFlagAuraMaterial(
  settings: FlagAuraSettings = DEFAULT_FLAG_AURA,
): THREE.ShaderMaterial {
  const uniforms: FlagAuraUniforms = {
    uFaceOffset: { value: settings.faceOffset },
    uTime: { value: 0 },
    uIntensity: { value: settings.intensity },
    uPulseSpeed: { value: settings.pulseSpeed },
    uPulseAmplitude: { value: settings.pulseAmplitude },
    uFalloff: { value: settings.falloff },
    uNoiseScale: { value: settings.noiseScale },
    uAnimMode: { value: FLAG_AURA_ANIM_MODE[settings.animation] },
    uPillarHeight: { value: settings.pillarHeight },
    uObjectTop: { value: 1 },
    uPillarRadius: { value: 0.5 },
    uFresnelCameraPos: { value: new THREE.Vector3() },
    uAdaptiveScaleEnabled: { value: 0 },
    uAdaptiveMetersPerPixel: { value: 1 },
    uAdaptiveMinPixels: { value: 8 },
    uAdaptiveMaxPixels: { value: 64 },
    uCollisionAwareEnabled: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: FLAG_AURA_VERTEX,
    fragmentShader: FLAG_AURA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.defines = {
    ...(material.defines ?? {}),
    USE_INSTANCING: "",
  };
  return material;
}

/** Uninflated solid copy of the aura hull, used as the outline mask. */
export function createFlagMaskMaterial(
  settings: FlagAuraSettings = DEFAULT_FLAG_AURA,
): THREE.ShaderMaterial {
  const material = createFlagAuraMaterial(settings);
  material.fragmentShader = FLAG_MASK_FRAGMENT;
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;
  material.blending = THREE.NoBlending;
  material.side = THREE.DoubleSide;
  material.toneMapped = false;
  material.polygonOffset = false;
  const uniforms = material.uniforms as unknown as FlagAuraUniforms;
  uniforms.uFaceOffset.value = 0;
  uniforms.uAnimMode.value = 0;
  material.needsUpdate = true;
  return material;
}

export function applyFlagAuraSettings(
  material: THREE.ShaderMaterial,
  settings: FlagAuraSettings,
): void {
  const uniforms = material.uniforms as unknown as FlagAuraUniforms;
  uniforms.uFaceOffset.value = settings.faceOffset;
  uniforms.uIntensity.value = settings.intensity;
  uniforms.uPulseSpeed.value = settings.pulseSpeed;
  uniforms.uPulseAmplitude.value = settings.pulseAmplitude;
  uniforms.uFalloff.value = settings.falloff;
  uniforms.uNoiseScale.value = settings.noiseScale;
  uniforms.uAnimMode.value = FLAG_AURA_ANIM_MODE[settings.animation];
  uniforms.uPillarHeight.value = settings.pillarHeight;
  const side =
    settings.animation === "pillar" ? THREE.DoubleSide : THREE.FrontSide;
  if (material.side !== side) {
    material.side = side;
    material.needsUpdate = true;
  }
}

export function setFlagAuraTime(
  material: THREE.ShaderMaterial,
  timeSeconds: number,
): void {
  const uniforms = material.uniforms as unknown as FlagAuraUniforms;
  uniforms.uTime.value = timeSeconds;
}

export function setFlagAuraCameraPosition(
  material: THREE.ShaderMaterial,
  position: THREE.Vector3,
): void {
  const uniforms = material.uniforms as unknown as FlagAuraUniforms;
  uniforms.uFresnelCameraPos.value.copy(position);
}

export function setFlagAuraAdaptiveUniforms(
  material: THREE.ShaderMaterial,
  state: AdaptiveZoomUniformState,
): void {
  const uniforms = material.uniforms as unknown as FlagAuraUniforms;
  uniforms.uAdaptiveScaleEnabled.value = state.enabled ? 1 : 0;
  uniforms.uAdaptiveMetersPerPixel.value = state.metersPerPixel;
  uniforms.uAdaptiveMinPixels.value = state.minPixels;
  uniforms.uAdaptiveMaxPixels.value = state.maxPixels;
  uniforms.uCollisionAwareEnabled.value = state.collisionAware ? 1 : 0;
}

export function createFlagAuraMesh(
  material: THREE.ShaderMaterial,
  capacity: number,
  frustumCulled: boolean,
  sourceGeometry?: THREE.BufferGeometry | null,
  animation: FlagAuraAnimation = "pulse",
): THREE.InstancedMesh | null {
  if (capacity <= 0) return null;
  const pillar = animation === "pillar";
  const geometry = pillar
    ? createLightPillarGeometry(sourceGeometry, capacity)
    : createFlagAuraGeometry(sourceGeometry, capacity);
  if (pillar) {
    const uniforms = material.uniforms as unknown as FlagAuraUniforms;
    uniforms.uObjectTop.value = Number(geometry.userData.objectTop) || 1;
    uniforms.uPillarRadius.value = Number(geometry.userData.pillarRadius) || 0.5;
  }
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = frustumCulled;
  mesh.renderOrder = 2;
  mesh.count = 0;
  mesh.layers.enable(FLAG_AURA_BLOOM_LAYER);
  mesh.userData.sourceGeometryUuid = flagAuraMeshKey(
    sourceGeometry?.uuid,
    animation,
  );
  return mesh;
}

export function writeFlagAura(
  mesh: THREE.InstancedMesh,
  prepared: readonly PreparedMarkerInstance[],
  sources: readonly FlagAuraSource[],
  indices: readonly number[],
  settings: FlagAuraSettings,
): void {
  const maxCount = mesh.instanceMatrix.count;
  const geometry = mesh.geometry;
  const adaptiveSizes = geometry.getAttribute("adaptiveScaleSize");
  const adaptiveCaps = geometry.getAttribute("adaptiveScaleCap");
  const phases = geometry.getAttribute("auraPhase");
  const colors = geometry.getAttribute("auraColor");
  const range = flagValueRange(sources);
  const coverage = settings.coverage ?? 1;

  let slot = 0;
  for (let i = 0; i < indices.length && slot < maxCount; i++) {
    const index = indices[i]!;
    const item = prepared[index]!;
    const source = sources[index] ?? { id: String(index) };
    if (!isLookdevFlagCovered(source.id, coverage)) continue;
    const flag = assignLookdevFlag(source, settings.assignMode, range);
    _dummy.position.set(item.x, item.y, item.z);
    _dummy.scale.set(item.sx, item.sy, item.sz);
    _dummy.rotation.set(0, item.yaw, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(slot, _dummy.matrix);
    if (adaptiveSizes) adaptiveSizes.setX(slot, item.adaptiveSize);
    if (adaptiveCaps) adaptiveCaps.setX(slot, item.scaleCap);
    if (phases) phases.setX(slot, lookdevPulsePhase(source.id, settings.syncPulse));
    _color.set(flagColorHex(flag, settings));
    if (colors) colors.setXYZ(slot, _color.r, _color.g, _color.b);
    slot += 1;
  }

  mesh.count = slot;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  if (adaptiveSizes) adaptiveSizes.needsUpdate = true;
  if (adaptiveCaps) adaptiveCaps.needsUpdate = true;
  if (phases) phases.needsUpdate = true;
  if (colors) colors.needsUpdate = true;
}

/** Per-marker bottom light. Same normalized climb on every shape. */
export function writePillarBottomLight(
  mesh: THREE.InstancedMesh,
  sources: readonly FlagAuraSource[],
  indices: readonly number[],
  settings: FlagAuraSettings,
): void {
  const colors = mesh.geometry.getAttribute("pillarColor");
  const lit = mesh.geometry.getAttribute("pillarLit");
  if (!colors || !lit) return;
  const on =
    settings.enabled &&
    settings.animation === "pillar" &&
    settings.pillarBase !== false;
  const range = flagValueRange(sources);
  const coverage = settings.coverage ?? 1;
  const count = Math.min(indices.length, mesh.count, colors.count);
  for (let slot = 0; slot < count; slot++) {
    const index = indices[slot]!;
    const source = sources[index] ?? { id: String(index) };
    const covered = on && isLookdevFlagCovered(source.id, coverage);
    lit.setX(slot, covered ? 1 : 0);
    if (covered) {
      const flag = assignLookdevFlag(source, settings.assignMode, range);
      _color.set(flagColorHex(flag, settings));
      colors.setXYZ(slot, _color.r, _color.g, _color.b);
    }
  }
  colors.needsUpdate = true;
  lit.needsUpdate = true;
}

export function disposeFlagAura(mesh: THREE.InstancedMesh | null): void {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.parent?.remove(mesh);
}
