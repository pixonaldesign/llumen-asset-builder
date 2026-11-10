import * as THREE from "three";
import type { OilSpillSettings, VizPoint } from "@/lib/types";
import type { SceneOrigin } from "@/lib/mercator";
import { publicUrl } from "@/lib/publicUrl";
import { DEFAULT_OIL_SPILL } from "@/lib/configIO";
import { sheenPalette } from "@/lib/sheenPalettes";
import {
  createEmptyWaterMaskTexture,
  type WaterMaskTexture,
} from "@/lib/waterMask";
import {
  OIL_SPILL_FRAGMENT,
  OIL_SPILL_VERTEX,
  OIL_THICKNESS_SPREAD,
} from "@/lib/shaders/oilSpill";
import {
  OIL_NODE_FRAGMENT,
  OIL_NODE_VERTEX,
  OIL_PATH_FRAGMENT,
  OIL_PATH_VERTEX,
} from "@/lib/shaders/oilPathway";
import {
  applyWaterStemSettings,
  applyWaterStemZoom,
  createStemMesh,
  createWaterStemMaterial,
  type StemStyle,
} from "@/lib/waterGradients";

export const OIL_SPILL_MAGIC = 0x4c50534f;
export const OIL_SPILL_VERSION = 1;
export const OIL_SPILL_ALTITUDE = 1.2;
/** Fixed paint grid covering the whole drift. Dots stamp this one field. */
export const OIL_BLOB_GRID = 384;
/** Seconds for a full-strength stamp to fall to about a third, at trail strength 1. */
export const OIL_TRAIL_HALF_LIFE = 18;
/** After the spill loops, leftover stamps clear on this half-life. */
export const OIL_REPLAY_FADE_HALF_LIFE = 0.55;
/** How long the fast clear lasts after a replay, in seconds. */
export const OIL_REPLAY_FADE_SECONDS = 2.2;
/** Packed dots saturate here so the wake fades instead of lingering as a solid. */
export const OIL_PAINT_CAP = 1.8;
/** Isosurface. Fresh dots peak near 1; faded stamps stay visible below that. */
export const OIL_BLOB_THRESHOLD = 0.22;
/** Curl strength. 1 is a visible drift; the residue uses a higher value. */
export const OIL_BLOB_ADVECT = 1;
/** Frames (hours) over which a particle's heading turns toward the new drift. */
const OIL_HEADING_EASE_FRAMES = 5;
/** Clock rate of the sheen's own motion (glint, streak drift, shimmer). */
const OIL_SHEEN_TIME_SCALE = 0.2;

/** The stem is always this red; the user cannot recolor it. */
export const OIL_STEM_COLOR = "#ff2b2b";

export const OIL_SPILL_TRACKS_URL = "/data/oil-spill/spill_tracks.bin";
export const OIL_SPILL_SURFACE_URL = "/data/oil-spill/spill_surface.json";

export type OilSpillSurface = {
  fSurface: Float32Array;
  thicknessMm: Float32Array;
};

/** Hourly lon/lat tracks. Frame 0 is simulation hour 1. */
export type OilSpillTracks = {
  particleCount: number;
  frameCount: number;
  /** Particle-major lon, lat pairs: (particle * frameCount + frame) * 2. */
  positions: Float32Array;
  surface: OilSpillSurface;
};

export type OilSpillUniforms = {
  uDensity: { value: THREE.Texture };
  uTime: { value: number };
  uAdvect: { value: number };
  uThreshold: { value: number };
  uSurface: { value: number };
  uThicknessNm: { value: number };
  uResidual: { value: number };
  uBrightness: { value: number };
  uSaturation: { value: number };
  uRimSheen: { value: number };
  uRimThickness: { value: number };
  uAnimateSheen: { value: number };
  uSheenSpeed: { value: number };
  uSheenMaskScale: { value: number };
  uSheenMaskStrength: { value: number };
  uTrailMaskScale: { value: number };
  uSheenRamp: { value: THREE.Texture };
  uSheenRampOn: { value: number };
  uRealistic: { value: number };
  uStreakScale: { value: number };
  uColorFade: { value: number };
  /** Natural-log span of local film thickness in mm, for data-mapped palettes. */
  uThicknessLogRange: { value: THREE.Vector2 };
  uFillColor: { value: THREE.Color };
  uTrailNoise: { value: number };
  uTrailOpacity: { value: number };
  uCameraPos: { value: THREE.Vector3 };
  uFieldOrigin: { value: THREE.Vector2 };
  uFieldSize: { value: THREE.Vector2 };
  uTexel: { value: THREE.Vector2 };
  uWaterMask: { value: THREE.Texture };
  uMaskMin: { value: THREE.Vector2 };
  uMaskSize: { value: THREE.Vector2 };
  uMaskReady: { value: number };
};

export type OilFieldLayout = {
  originX: number;
  originZ: number;
  cell: number;
  centerX: number;
  centerZ: number;
};

export type OilBlob = {
  mesh: THREE.Mesh;
  local: Float32Array;
  particleCount: number;
  frameCount: number;
  surface: OilSpillSurface;
  density: Float32Array;
  stamp: Float32Array;
  rgba: Float32Array;
  scratchX: Float32Array;
  scratchZ: Float32Array;
  prevX: Float32Array;
  prevZ: Float32Array;
  velX: Float32Array;
  velZ: Float32Array;
  hasPrev: boolean;
  flowX: Float32Array;
  flowZ: Float32Array;
  stampFlowX: Float32Array;
  stampFlowZ: Float32Array;
  texture: THREE.DataTexture;
  lastFrame: number;
  lastKernel: number;
  trailStrength: number;
  paintedTrail: number;
  replaySeconds: number;
  paintOriginX: number;
  paintOriginZ: number;
  paintCell: number;
  pathRibbon: THREE.Mesh;
  pathNodes: THREE.InstancedMesh;
  pathMaterial: THREE.ShaderMaterial;
  nodeMaterial: THREE.ShaderMaterial;
  /** Per-frame slick centre as x, z pairs. The stem rides this line. */
  centreline: Float32Array;
  stem: THREE.InstancedMesh;
  stemMaterial: THREE.ShaderMaterial;
  /** Debug rings at the current frame's particle positions. */
  particles: THREE.InstancedMesh;
  particleMaterial: THREE.Material;
  /** Outer radius of a debug ring, in meters. Tracks the zoom. */
  particleMeters: number;
};

type SurfaceFile = {
  fSurface?: unknown;
  thicknessMm?: unknown;
};

function asFloatArray(value: unknown, name: string): Float32Array {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Oil spill surface is missing ${name}`);
  }
  const out = new Float32Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const n = Number(value[i]);
    if (!Number.isFinite(n)) {
      throw new Error(`Oil spill surface ${name}[${i}] is not a number`);
    }
    out[i] = n;
  }
  return out;
}

export function parseOilSpillSurface(value: unknown): OilSpillSurface {
  const raw = (value ?? {}) as SurfaceFile;
  const fSurface = asFloatArray(raw.fSurface, "fSurface");
  const thicknessMm = asFloatArray(raw.thicknessMm, "thicknessMm");
  if (fSurface.length !== thicknessMm.length) {
    throw new Error("Oil spill surface series lengths do not match");
  }
  return { fSurface, thicknessMm };
}

export function encodeOilSpillTracks(tracks: OilSpillTracks): ArrayBuffer {
  const { particleCount, frameCount, positions } = tracks;
  const expected = particleCount * frameCount * 2;
  if (positions.length !== expected) {
    throw new Error("Oil spill position buffer has the wrong length");
  }
  const buffer = new ArrayBuffer(16 + expected * 4);
  const header = new DataView(buffer);
  header.setUint32(0, OIL_SPILL_MAGIC, true);
  header.setUint32(4, OIL_SPILL_VERSION, true);
  header.setUint32(8, particleCount, true);
  header.setUint32(12, frameCount, true);
  new Float32Array(buffer, 16).set(positions);
  return buffer;
}

export function decodeOilSpillTracks(
  buffer: ArrayBuffer,
  surface: OilSpillSurface,
): OilSpillTracks {
  if (buffer.byteLength < 16) {
    throw new Error("Oil spill track file is too small");
  }
  const header = new DataView(buffer);
  const magic = header.getUint32(0, true);
  const version = header.getUint32(4, true);
  const particleCount = header.getUint32(8, true);
  const frameCount = header.getUint32(12, true);
  if (magic !== OIL_SPILL_MAGIC) {
    throw new Error("Oil spill track file has an unexpected header");
  }
  if (version !== OIL_SPILL_VERSION) {
    throw new Error(`Unsupported oil spill track version ${version}`);
  }
  if (particleCount < 1 || frameCount < 1) {
    throw new Error("Oil spill track file has no samples");
  }
  const expected = particleCount * frameCount * 2;
  if (buffer.byteLength < 16 + expected * 4) {
    throw new Error("Oil spill track file is truncated");
  }
  if (surface.fSurface.length !== frameCount) {
    throw new Error("Oil spill surface series does not match the track frames");
  }
  return {
    particleCount,
    frameCount,
    positions: new Float32Array(buffer, 16, expected),
    surface,
  };
}

export async function loadOilSpillTracks(
  tracksUrl = OIL_SPILL_TRACKS_URL,
  surfaceUrl = OIL_SPILL_SURFACE_URL,
): Promise<OilSpillTracks> {
  const [tracksResponse, surfaceResponse] = await Promise.all([
    fetch(publicUrl(tracksUrl)),
    fetch(publicUrl(surfaceUrl)),
  ]);
  if (!tracksResponse.ok) {
    throw new Error(`Failed to load oil spill tracks (${tracksResponse.status})`);
  }
  if (!surfaceResponse.ok) {
    throw new Error(
      `Failed to load oil spill surface (${surfaceResponse.status})`,
    );
  }
  const [buffer, surfaceJson] = await Promise.all([
    tracksResponse.arrayBuffer(),
    surfaceResponse.json(),
  ]);
  return decodeOilSpillTracks(buffer, parseOilSpillSurface(surfaceJson));
}

/** Web Mercator used by the spot shader, in Mapbox MercatorCoordinate units. */
export function oilSpillMercator(lng: number, lat: number): { x: number; y: number } {
  const clamped = Math.min(85.05112878, Math.max(-85.05112878, lat));
  const latRad = (clamped * Math.PI) / 180;
  const s = Math.sin(latRad);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
  };
}

export function oilSpillLocalMeters(
  origin: SceneOrigin,
  lng: number,
  lat: number,
): { x: number; z: number } {
  const mc = oilSpillMercator(lng, lat);
  const scale = origin.meterScale || 1e-12;
  return {
    x: (mc.x - origin.mercator.x) / scale,
    z: (mc.y - origin.mercator.y) / scale,
  };
}

export function sampleOilSpillLngLat(
  tracks: OilSpillTracks,
  particle: number,
  frame: number,
): { lng: number; lat: number } {
  const f = Math.min(tracks.frameCount - 1, Math.max(0, frame));
  const p = Math.min(tracks.particleCount - 1, Math.max(0, particle));
  const i = (p * tracks.frameCount + f) * 2;
  return { lng: tracks.positions[i]!, lat: tracks.positions[i + 1]! };
}

export function oilSpillExtentPoints(tracks: OilSpillTracks): VizPoint[] {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const { positions } = tracks;
  for (let i = 0; i < positions.length; i += 2) {
    const lon = positions[i]!;
    const lat = positions[i + 1]!;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    { id: "sw", lng: minLon, lat: minLat, properties: {} },
    { id: "se", lng: maxLon, lat: minLat, properties: {} },
    { id: "ne", lng: maxLon, lat: maxLat, properties: {} },
    { id: "nw", lng: minLon, lat: maxLat, properties: {} },
  ];
}

/** How visible a spot is once surface oil fraction is known. */
export function oilSpillPresence(
  fSurface: number,
  residualSheen: number,
): number {
  const residual = Math.min(1, Math.max(0, residualSheen));
  const film = Math.min(1, Math.max(0, fSurface));
  const faded = film <= 0 ? 0 : film >= 0.22 ? 1 : film / 0.22;
  return residual + (0.9 - residual) * faded;
}

/** Smooth kernel. Peaks at 1 on the particle and reaches 0 at `radius`. */
export function kernelWeight(dist: number, radius: number): number {
  if (!(radius > 0) || dist >= radius) return 0;
  const d = dist / radius;
  const w = 1 - d * d;
  return w * w;
}

export function oilFieldLayout(
  x: ArrayLike<number>,
  z: ArrayLike<number>,
  count: number,
  kernel: number,
  grid = OIL_BLOB_GRID,
): OilFieldLayout {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < count; i++) {
    const px = x[i]!;
    const pz = z[i]!;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
    sumX += px;
    sumZ += pz;
  }
  const centerX = sumX / count;
  const centerZ = sumZ / count;
  const span = Math.max(maxX - minX, maxZ - minZ, kernel * 2, 1);
  const cell = Math.max(kernel / 7, span / (grid - 2));
  const half = (grid * cell) * 0.5;
  return {
    originX: centerX - half,
    originZ: centerZ - half,
    cell,
    centerX,
    centerZ,
  };
}

/** Write a scalar density grid. Returns the layout used to place the mesh. */
export function splatOilField(args: {
  x: ArrayLike<number>;
  z: ArrayLike<number>;
  count: number;
  kernel: number;
  grid?: number;
  target: Float32Array;
  clear?: boolean;
}): OilFieldLayout {
  const grid = args.grid ?? OIL_BLOB_GRID;
  const { x, z, count, kernel, target } = args;
  if (args.clear !== false) target.fill(0);
  const layout = oilFieldLayout(x, z, count, kernel, grid);
  const { originX, originZ, cell } = layout;
  const radius = Math.max(kernel, cell);
  const ri = Math.max(1, Math.ceil(radius / cell));
  for (let i = 0; i < count; i++) {
    const px = x[i]!;
    const pz = z[i]!;
    const cx = Math.floor((px - originX) / cell);
    const cz = Math.floor((pz - originZ) / cell);
    const x0 = Math.max(0, cx - ri);
    const x1 = Math.min(grid - 1, cx + ri);
    const z0 = Math.max(0, cz - ri);
    const z1 = Math.min(grid - 1, cz + ri);
    for (let gz = z0; gz <= z1; gz++) {
      const wz = originZ + (gz + 0.5) * cell;
      const dz = wz - pz;
      for (let gx = x0; gx <= x1; gx++) {
        const wx = originX + (gx + 0.5) * cell;
        const dist = Math.hypot(wx - px, dz);
        const weight = kernelWeight(dist, radius);
        if (weight <= 0) continue;
        target[gz * grid + gx]! += weight;
      }
    }
  }
  return layout;
}

function createDensityTexture(data: Float32Array, grid: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    data,
    grid,
    grid,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function bakeLocalMeters(
  tracks: OilSpillTracks,
  origin: SceneOrigin,
): Float32Array {
  const { particleCount, frameCount, positions } = tracks;
  const local = new Float32Array(particleCount * frameCount * 2);
  for (let i = 0; i < particleCount * frameCount; i++) {
    const meters = oilSpillLocalMeters(
      origin,
      positions[i * 2]!,
      positions[i * 2 + 1]!,
    );
    local[i * 2] = meters.x;
    local[i * 2 + 1] = meters.z;
  }
  return local;
}

function sampleFrame(
  local: Float32Array,
  particleCount: number,
  frameCount: number,
  frame: number,
  scratchX: Float32Array,
  scratchZ: Float32Array,
): void {
  const clamped = Math.min(frameCount - 1, Math.max(0, frame));
  const f0 = Math.floor(clamped);
  const f1 = Math.min(f0 + 1, frameCount - 1);
  const t = clamped - f0;
  for (let p = 0; p < particleCount; p++) {
    const a = (p * frameCount + f0) * 2;
    const b = (p * frameCount + f1) * 2;
    scratchX[p] = local[a]! + (local[b]! - local[a]!) * t;
    scratchZ[p] = local[a + 1]! + (local[b + 1]! - local[a + 1]!) * t;
  }
}

const SHEEN_RAMP_WIDTH = 256;

function createSheenRampTexture(): THREE.DataTexture {
  const data = new Float32Array(SHEEN_RAMP_WIDTH * 4);
  data.fill(1);
  const texture = new THREE.DataTexture(
    data,
    SHEEN_RAMP_WIDTH,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Stops are stored as authored. The slick output is not color managed, so the
// data-mapped sheen shows the swatch colors; the legacy cycle linearizes them.
function writeSheenRamp(data: Float32Array, stops: readonly string[]) {
  const colors = stops.map((stop) =>
    new THREE.Color().setStyle(stop, THREE.LinearSRGBColorSpace),
  );
  const color = new THREE.Color();
  const last = colors.length - 1;
  for (let i = 0; i < SHEEN_RAMP_WIDTH; i++) {
    const scaled = (i / (SHEEN_RAMP_WIDTH - 1)) * last;
    const index = Math.min(last - 1, Math.floor(scaled));
    color.copy(colors[index]!).lerp(colors[index + 1]!, scaled - index);
    const pixel = i * 4;
    data[pixel] = color.r;
    data[pixel + 1] = color.g;
    data[pixel + 2] = color.b;
    data[pixel + 3] = 1;
  }
}

function applySheenPalette(uniforms: OilSpillUniforms, paletteId: string) {
  const stops = sheenPalette(paletteId)?.stops ?? [];
  if (stops.length < 2) {
    uniforms.uSheenRampOn.value = 0;
    return;
  }
  const texture = uniforms.uSheenRamp.value as THREE.DataTexture;
  writeSheenRamp(texture.image.data as Float32Array, stops);
  texture.needsUpdate = true;
  uniforms.uSheenRampOn.value = 1;
}

export function createOilSpillMaterial(
  settings: OilSpillSettings,
): THREE.ShaderMaterial {
  const empty = createEmptyWaterMaskTexture();
  const rgba = new Float32Array(OIL_BLOB_GRID * OIL_BLOB_GRID * 4);
  const uniforms: OilSpillUniforms = {
    uDensity: { value: createDensityTexture(rgba, OIL_BLOB_GRID) },
    uTime: { value: 0 },
    uAdvect: { value: OIL_BLOB_ADVECT },
    uThreshold: { value: OIL_BLOB_THRESHOLD },
    uSurface: { value: 1 },
    uThicknessNm: { value: 400 },
    uResidual: { value: settings.residualSheen },
    uBrightness: { value: settings.brightness },
    uSaturation: { value: settings.saturation },
    uRimSheen: { value: settings.rimSheen ? 1 : 0 },
    uRimThickness: { value: settings.rimThickness },
    uAnimateSheen: { value: settings.animateSheen ? 1 : 0 },
    uSheenSpeed: { value: settings.sheenSpeed },
    uSheenMaskScale: { value: settings.sheenMaskScale },
    uSheenMaskStrength: { value: settings.sheenMaskStrength },
    uTrailMaskScale: { value: settings.trailMaskScale },
    uSheenRamp: { value: createSheenRampTexture() },
    uSheenRampOn: { value: 0 },
    uRealistic: { value: settings.realisticSheen ? 1 : 0 },
    uStreakScale: { value: settings.sheenStreakScale },
    uColorFade: { value: settings.sheenColorFade },
    uThicknessLogRange: {
      value: new THREE.Vector2(Math.log(0.05), Math.log(15)),
    },
    uFillColor: { value: new THREE.Color(settings.fillColor) },
    uTrailNoise: { value: settings.trailNoise },
    uTrailOpacity: { value: settings.trailOpacity },
    uCameraPos: { value: new THREE.Vector3() },
    uFieldOrigin: { value: new THREE.Vector2() },
    uFieldSize: { value: new THREE.Vector2(1, 1) },
    uTexel: { value: new THREE.Vector2(1 / OIL_BLOB_GRID, 1 / OIL_BLOB_GRID) },
    uWaterMask: { value: empty.texture },
    uMaskMin: { value: new THREE.Vector2() },
    uMaskSize: { value: new THREE.Vector2(1, 1) },
    uMaskReady: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: OIL_SPILL_VERTEX,
    fragmentShader: OIL_SPILL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    // The slick is drawn into a cleared buffer, then blurred. Blending here
    // would store color already multiplied by alpha, and the blur multiplies
    // again, which leaves a black fringe on the sheen.
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  material.userData.waterMaskTexture = empty.texture;
  applySheenPalette(uniforms, settings.sheenPalette);
  return material;
}

export function oilSpillUniforms(
  material: THREE.ShaderMaterial,
): OilSpillUniforms {
  return material.uniforms as unknown as OilSpillUniforms;
}

export function applyOilSpillSettings(
  material: THREE.ShaderMaterial,
  settings: OilSpillSettings,
): void {
  const uniforms = oilSpillUniforms(material);
  uniforms.uResidual.value = settings.residualSheen;
  uniforms.uBrightness.value = settings.brightness;
  uniforms.uSaturation.value = settings.saturation;
  uniforms.uRimSheen.value = settings.rimSheen ? 1 : 0;
  uniforms.uRimThickness.value = Math.min(1, Math.max(0, settings.rimThickness));
  uniforms.uAnimateSheen.value = settings.animateSheen ? 1 : 0;
  uniforms.uSheenSpeed.value = settings.sheenSpeed;
  uniforms.uSheenMaskScale.value = Math.min(
    8,
    Math.max(0.05, settings.sheenMaskScale),
  );
  uniforms.uSheenMaskStrength.value = Math.min(
    1,
    Math.max(0, settings.sheenMaskStrength),
  );
  uniforms.uTrailMaskScale.value = Math.min(
    12,
    Math.max(0.05, settings.trailMaskScale),
  );
  uniforms.uRealistic.value = settings.realisticSheen ? 1 : 0;
  uniforms.uStreakScale.value = Math.min(
    6,
    Math.max(0.1, settings.sheenStreakScale),
  );
  uniforms.uColorFade.value = Math.min(1, Math.max(0, settings.sheenColorFade));
  uniforms.uFillColor.value.set(settings.fillColor);
  uniforms.uTrailNoise.value = settings.trailNoise;
  uniforms.uTrailOpacity.value = settings.trailOpacity;
  applySheenPalette(uniforms, settings.sheenPalette);
}

export function setOilSpillTime(
  material: THREE.ShaderMaterial,
  timeSeconds: number,
): void {
  oilSpillUniforms(material).uTime.value = timeSeconds * OIL_SHEEN_TIME_SCALE;
}

export function setOilSpillCamera(
  material: THREE.ShaderMaterial,
  position: THREE.Vector3,
): void {
  oilSpillUniforms(material).uCameraPos.value.copy(position);
}

export function applyOilSpillMask(
  material: THREE.ShaderMaterial,
  mask: WaterMaskTexture,
): void {
  const uniforms = oilSpillUniforms(material);
  const previous = material.userData.waterMaskTexture as THREE.Texture | undefined;
  if (previous && previous !== mask.texture) previous.dispose();
  uniforms.uWaterMask.value = mask.texture;
  uniforms.uMaskMin.value.set(mask.bounds.minX, mask.bounds.minZ);
  uniforms.uMaskSize.value.set(
    Math.max(1, mask.bounds.maxX - mask.bounds.minX),
    Math.max(1, mask.bounds.maxZ - mask.bounds.minZ),
  );
  uniforms.uMaskReady.value = mask.hasWater ? 1 : 0;
  material.userData.waterMaskTexture = mask.texture;
}

function localBounds(local: Float32Array): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < local.length; i += 2) {
    const x = local[i]!;
    const z = local[i + 1]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

function centrelineMedians(
  local: Float32Array,
  particleCount: number,
  frameCount: number,
): Float32Array {
  const line = new Float32Array(frameCount * 2);
  const xs = new Float32Array(particleCount);
  const zs = new Float32Array(particleCount);
  const sortedX = new Float32Array(particleCount);
  const sortedZ = new Float32Array(particleCount);
  const mid = Math.floor(particleCount / 2);
  for (let frame = 0; frame < frameCount; frame++) {
    for (let p = 0; p < particleCount; p++) {
      const i = (p * frameCount + frame) * 2;
      xs[p] = local[i]!;
      zs[p] = local[i + 1]!;
    }
    // The separate medians of lon and lat fall offshore once the slick
    // beaches along a bent coast. Follow the real particle nearest that
    // point so the line ends where the oil does.
    sortedX.set(xs);
    sortedZ.set(zs);
    sortedX.sort();
    sortedZ.sort();
    const medianX = sortedX[mid]!;
    const medianZ = sortedZ[mid]!;
    let best = 0;
    let bestDistance = Infinity;
    for (let p = 0; p < particleCount; p++) {
      const dx = xs[p]! - medianX;
      const dz = zs[p]! - medianZ;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    }
    line[frame * 2] = xs[best]!;
    line[frame * 2 + 1] = zs[best]!;
  }
  return line;
}

function depositFixed(args: {
  x: Float32Array;
  z: Float32Array;
  count: number;
  kernel: number;
  grid: number;
  originX: number;
  originZ: number;
  cell: number;
  target: Float32Array;
  vx?: Float32Array;
  vz?: Float32Array;
  flowX?: Float32Array;
  flowZ?: Float32Array;
}) {
  const { x, z, count, kernel, grid, originX, originZ, cell, target } = args;
  const radius = Math.max(kernel, cell);
  const radius2 = radius * radius;
  const ri = Math.max(1, Math.min(18, Math.ceil(radius / cell)));
  const trackFlow = args.vx && args.vz && args.flowX && args.flowZ;
  for (let i = 0; i < count; i++) {
    const px = x[i]!;
    const pz = z[i]!;
    const vx = trackFlow ? args.vx![i]! : 0;
    const vz = trackFlow ? args.vz![i]! : 0;
    const cx = Math.floor((px - originX) / cell);
    const cz = Math.floor((pz - originZ) / cell);
    const x0 = Math.max(0, cx - ri);
    const x1 = Math.min(grid - 1, cx + ri);
    const z0 = Math.max(0, cz - ri);
    const z1 = Math.min(grid - 1, cz + ri);
    for (let gz = z0; gz <= z1; gz++) {
      const dz = originZ + (gz + 0.5) * cell - pz;
      const dz2 = dz * dz;
      if (dz2 >= radius2) continue;
      for (let gx = x0; gx <= x1; gx++) {
        const dx = originX + (gx + 0.5) * cell - px;
        const dist2 = dx * dx + dz2;
        if (dist2 >= radius2) continue;
        const d = dist2 / radius2;
        const fade = 1 - d;
        const weight = fade * fade;
        const cellIndex = gz * grid + gx;
        target[cellIndex]! += weight;
        if (trackFlow) {
          args.flowX![cellIndex]! += weight * vx;
          args.flowZ![cellIndex]! += weight * vz;
        }
      }
    }
  }
}

function normalizeStampFlow(
  weight: Float32Array,
  x: Float32Array,
  z: Float32Array,
) {
  for (let i = 0; i < weight.length; i++) {
    const w = weight[i]!;
    if (w < 1e-4) {
      x[i] = 0;
      z[i] = 0;
      continue;
    }
    const fx = x[i]! / w;
    const fz = z[i]! / w;
    const len = Math.hypot(fx, fz);
    if (len < 0.05) {
      x[i] = 0;
      z[i] = 0;
    } else {
      x[i] = fx / len;
      z[i] = fz / len;
    }
  }
}

/** Decay for one paint step. A backward frame jump fades the previous wake. */
export function nextOilTrailDecay(args: {
  trailStrength: number;
  dtSeconds: number;
  frame: number;
  previousFrame: number;
  replaySeconds: number;
}): { decay: number; replaySeconds: number; wrapped: boolean } {
  const strength = Math.min(1, Math.max(0, args.trailStrength));
  let replaySeconds = args.replaySeconds;
  const wrapped =
    Number.isFinite(args.previousFrame) &&
    args.frame + 0.5 < args.previousFrame;
  if (wrapped) replaySeconds = OIL_REPLAY_FADE_SECONDS;
  if (strength <= 0.001) return { decay: 0, replaySeconds: 0, wrapped };
  if (!(args.dtSeconds > 0)) return { decay: 1, replaySeconds, wrapped };
  const halfLife =
    replaySeconds > 0
      ? OIL_REPLAY_FADE_HALF_LIFE
      : OIL_TRAIL_HALF_LIFE * strength;
  const decay = Math.exp(-args.dtSeconds / halfLife);
  return {
    decay,
    replaySeconds:
      replaySeconds > 0
        ? Math.max(0, replaySeconds - args.dtSeconds)
        : 0,
    wrapped,
  };
}

/** Keep the brighter of the fading wake and this frame's dot stamps. */
export function paintOilField(
  history: Float32Array,
  stamp: Float32Array,
  decay: number,
  cap = OIL_PAINT_CAP,
  flow?: {
    x: Float32Array;
    z: Float32Array;
    sx: Float32Array;
    sz: Float32Array;
  },
): void {
  for (let i = 0; i < history.length; i++) {
    const fresh = Math.min(stamp[i]!, cap);
    const faded = history[i]! * decay;
    if (faded > fresh) {
      history[i] = faded;
      continue;
    }
    history[i] = fresh;
    if (!flow) continue;
    const sx = flow.sx[i]!;
    const sz = flow.sz[i]!;
    if (sx * sx + sz * sz > 0.01) {
      flow.x[i] = sx;
      flow.z[i] = sz;
    }
  }
}

function uploadDensity(
  stamp: Float32Array,
  trail: Float32Array,
  rgba: Float32Array,
  texture: THREE.DataTexture,
  flowX?: Float32Array,
  flowZ?: Float32Array,
) {
  for (let i = 0; i < stamp.length; i++) {
    const pixel = i * 4;
    rgba[pixel] = stamp[i]!;
    rgba[pixel + 1] = flowX?.[i] ?? 0;
    rgba[pixel + 2] = flowZ?.[i] ?? 0;
    rgba[pixel + 3] = trail[i]!;
  }
  texture.needsUpdate = true;
}

function createPathway(line: Float32Array): {
  ribbon: THREE.Mesh;
  nodes: THREE.InstancedMesh;
  pathMaterial: THREE.ShaderMaterial;
  nodeMaterial: THREE.ShaderMaterial;
} {
  const frames = line.length / 2;
  const positions: number[] = [];
  const sides: number[] = [];
  const alongs: number[] = [];
  const nexts: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < frames; i++) {
    const x = line[i * 2]!;
    const z = line[i * 2 + 1]!;
    const n = Math.min(frames - 1, i + 1);
    const nx = line[n * 2]!;
    const nz = line[n * 2 + 1]!;
    const along = frames <= 1 ? 0 : i / (frames - 1);
    for (const side of [-1, 1]) {
      positions.push(x, OIL_SPILL_ALTITUDE + 0.4, z);
      sides.push(side);
      alongs.push(along);
      nexts.push(nx, nz);
    }
    if (i < frames - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const ribbonGeometry = new THREE.BufferGeometry();
  ribbonGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  ribbonGeometry.setAttribute(
    "pathSide",
    new THREE.Float32BufferAttribute(sides, 1),
  );
  ribbonGeometry.setAttribute(
    "pathAlong",
    new THREE.Float32BufferAttribute(alongs, 1),
  );
  ribbonGeometry.setAttribute(
    "pathNext",
    new THREE.Float32BufferAttribute(nexts, 2),
  );
  ribbonGeometry.setIndex(indices);
  const pathMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: 90 },
      uMetersPerPixel: { value: 20 },
      uMinPixels: { value: 2.4 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: OIL_PATH_VERTEX,
    fragmentShader: OIL_PATH_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const ribbon = new THREE.Mesh(ribbonGeometry, pathMaterial);
  ribbon.frustumCulled = false;
  ribbon.renderOrder = 4;

  const nodeGeometry = new THREE.CircleGeometry(1, 16);
  const nodeAlong = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    nodeAlong[i] = frames <= 1 ? 0 : i / (frames - 1);
  }
  nodeGeometry.setAttribute(
    "nodeAlong",
    new THREE.InstancedBufferAttribute(nodeAlong, 1),
  );
  const nodeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: 90 },
      uMetersPerPixel: { value: 20 },
      uMinPixels: { value: 3.2 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: OIL_NODE_VERTEX,
    fragmentShader: OIL_NODE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  nodeMaterial.defines = { USE_INSTANCING: "" };
  const nodes = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, frames);
  nodes.frustumCulled = false;
  nodes.renderOrder = 5;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < frames; i++) {
    dummy.position.set(line[i * 2]!, OIL_SPILL_ALTITUDE + 0.6, line[i * 2 + 1]!);
    dummy.updateMatrix();
    nodes.setMatrixAt(i, dummy.matrix);
  }
  nodes.instanceMatrix.needsUpdate = true;
  nodes.count = frames;
  return { ribbon, nodes, pathMaterial, nodeMaterial };
}

// The data has one thickness per hour. The shader spreads it across the slick
// by local density, so the palette domain covers the hourly range times that
// spread, fixed for the whole run so colors stay comparable as the oil thins.
function setThicknessLogRange(
  uniforms: OilSpillUniforms,
  thicknessMm: Float32Array,
): void {
  let min = Infinity;
  let max = 0;
  for (const value of thicknessMm) {
    if (!(value > 0)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!(max > 0)) return;
  const [thin, thick] = OIL_THICKNESS_SPREAD;
  const lo = Math.log(min * thin);
  const hi = Math.log(max * thick);
  uniforms.uThicknessLogRange.value.set(lo, Math.max(hi, lo + 0.01));
}

export function createOilBlob(
  tracks: OilSpillTracks,
  origin: SceneOrigin,
  material: THREE.ShaderMaterial,
  kernelMeters: number,
): OilBlob | null {
  if (tracks.particleCount < 1) return null;
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  const texture = oilSpillUniforms(material).uDensity.value as THREE.DataTexture;
  const rgba = texture.image.data as Float32Array;
  const local = bakeLocalMeters(tracks, origin);
  const bounds = localBounds(local);
  const pad = 1600;
  const span = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
    1,
  );
  const paintCell = (span + pad * 2) / OIL_BLOB_GRID;
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const paintSize = OIL_BLOB_GRID * paintCell;
  const paintOriginX = centerX - paintSize * 0.5;
  const paintOriginZ = centerZ - paintSize * 0.5;
  mesh.position.set(centerX, OIL_SPILL_ALTITUDE, centerZ);
  mesh.scale.set(paintSize, 1, paintSize);
  const uniforms = oilSpillUniforms(material);
  uniforms.uFieldOrigin.value.set(paintOriginX, paintOriginZ);
  uniforms.uFieldSize.value.set(paintSize, paintSize);
  uniforms.uTexel.value.set(1 / OIL_BLOB_GRID, 1 / OIL_BLOB_GRID);
  uniforms.uThreshold.value = OIL_BLOB_THRESHOLD;
  setThicknessLogRange(uniforms, tracks.surface.thicknessMm);
  const centreline = centrelineMedians(
    local,
    tracks.particleCount,
    tracks.frameCount,
  );
  const pathway = createPathway(centreline);
  const stemMaterial = createWaterStemMaterial(oilStemStyle(DEFAULT_OIL_SPILL));
  const stem = createStemMesh(stemMaterial, new Float32Array([1]));
  stem.renderOrder = 6;
  const ring = new THREE.RingGeometry(0.58, 1, 36);
  ring.rotateX(-Math.PI / 2);
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0x7ee787,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const particles = new THREE.InstancedMesh(
    ring,
    particleMaterial,
    tracks.particleCount,
  );
  particles.frustumCulled = false;
  particles.renderOrder = 8;
  particles.visible = false;
  particles.count = tracks.particleCount;
  const blob: OilBlob = {
    mesh,
    local,
    particleCount: tracks.particleCount,
    frameCount: tracks.frameCount,
    surface: tracks.surface,
    density: new Float32Array(OIL_BLOB_GRID * OIL_BLOB_GRID),
    stamp: new Float32Array(OIL_BLOB_GRID * OIL_BLOB_GRID),
    rgba,
    scratchX: new Float32Array(tracks.particleCount),
    scratchZ: new Float32Array(tracks.particleCount),
    prevX: new Float32Array(tracks.particleCount),
    prevZ: new Float32Array(tracks.particleCount),
    velX: new Float32Array(tracks.particleCount),
    velZ: new Float32Array(tracks.particleCount),
    hasPrev: false,
    flowX: new Float32Array(OIL_BLOB_GRID * OIL_BLOB_GRID),
    flowZ: new Float32Array(OIL_BLOB_GRID * OIL_BLOB_GRID),
    stampFlowX: new Float32Array(OIL_BLOB_GRID * OIL_BLOB_GRID),
    stampFlowZ: new Float32Array(OIL_BLOB_GRID * OIL_BLOB_GRID),
    texture,
    lastFrame: Number.NaN,
    lastKernel: Number.NaN,
    trailStrength: 0.85,
    paintedTrail: Number.NaN,
    replaySeconds: 0,
    paintOriginX,
    paintOriginZ,
    paintCell,
    pathRibbon: pathway.ribbon,
    pathNodes: pathway.nodes,
    pathMaterial: pathway.pathMaterial,
    nodeMaterial: pathway.nodeMaterial,
    centreline,
    stem,
    stemMaterial,
    particles,
    particleMaterial,
    particleMeters: 80,
  };
  updateOilBlob(blob, material, 0, kernelMeters, 0);
  return blob;
}

/** A single stem has no value range, so both height ends are the same. */
export function oilStemStyle(settings: OilSpillSettings): StemStyle {
  return {
    color: OIL_STEM_COLOR,
    stemMinHeightMeters: settings.stemHeightMeters,
    stemMaxHeightMeters: settings.stemHeightMeters,
    stemWidthPixels: settings.stemWidthPixels,
    stemFadeStartZoom: settings.stemFadeStartZoom,
    stemFadeEndZoom: settings.stemFadeEndZoom,
  };
}

const _stemDummy = new THREE.Object3D();

/** Slick centre at a fractional frame, interpolated along the centreline. */
export function oilCentreAt(
  centreline: Float32Array,
  frame: number,
): { x: number; z: number } {
  const frames = centreline.length / 2;
  if (frames < 1) return { x: 0, z: 0 };
  const clamped = Math.min(frames - 1, Math.max(0, frame));
  const f0 = Math.floor(clamped);
  const f1 = Math.min(f0 + 1, frames - 1);
  const t = clamped - f0;
  return {
    x: centreline[f0 * 2]! + (centreline[f1 * 2]! - centreline[f0 * 2]!) * t,
    z:
      centreline[f0 * 2 + 1]! +
      (centreline[f1 * 2 + 1]! - centreline[f0 * 2 + 1]!) * t,
  };
}

function placeOilStem(blob: OilBlob, frame: number): void {
  const centre = oilCentreAt(blob.centreline, frame);
  _stemDummy.position.set(centre.x, OIL_SPILL_ALTITUDE, centre.z);
  _stemDummy.scale.set(1, 1, 1);
  _stemDummy.rotation.set(0, 0, 0);
  _stemDummy.updateMatrix();
  blob.stem.setMatrixAt(0, _stemDummy.matrix);
  blob.stem.instanceMatrix.needsUpdate = true;
}

function placeOilParticles(blob: OilBlob): void {
  const radius = Math.max(blob.particleMeters, 8);
  for (let p = 0; p < blob.particleCount; p++) {
    _stemDummy.position.set(
      blob.scratchX[p]!,
      OIL_SPILL_ALTITUDE + 1.2,
      blob.scratchZ[p]!,
    );
    _stemDummy.scale.set(radius, 1, radius);
    _stemDummy.rotation.set(0, 0, 0);
    _stemDummy.updateMatrix();
    blob.particles.setMatrixAt(p, _stemDummy.matrix);
  }
  blob.particles.instanceMatrix.needsUpdate = true;
  blob.particles.count = blob.particleCount;
}

/** Keep the debug rings a few pixels wide so they mark the data, not the splat. */
export function setOilParticleZoom(
  blob: OilBlob,
  metersPerPixel: number,
): void {
  if (!blob.particles.visible) return;
  const radius = Math.max(metersPerPixel * 7, 8);
  if (Math.abs(radius - blob.particleMeters) < blob.particleMeters * 0.12) {
    return;
  }
  blob.particleMeters = radius;
  placeOilParticles(blob);
}

export function setOilStemZoom(
  blob: OilBlob,
  zoom: number,
  metersPerPixel: number,
): void {
  applyWaterStemZoom(blob.stemMaterial, zoom, metersPerPixel);
}

export function applyOilBlobPresentation(
  blob: OilBlob,
  settings: OilSpillSettings,
): void {
  blob.trailStrength = Math.min(1, Math.max(0, settings.trailStrength));
  blob.particles.visible = settings.showParticles;
  const opacity = settings.showPathway
    ? Math.min(1, Math.max(0, settings.pathwayOpacity))
    : 0;
  (blob.pathMaterial.uniforms.uOpacity as { value: number }).value = opacity;
  (blob.nodeMaterial.uniforms.uOpacity as { value: number }).value = opacity;
  blob.pathRibbon.visible = opacity > 0.01;
  blob.pathNodes.visible = opacity > 0.01;
  applyWaterStemSettings(blob.stemMaterial, oilStemStyle(settings));
  blob.stem.visible = settings.showStem;
}

export function setOilPathwayZoom(blob: OilBlob, metersPerPixel: number): void {
  const meters = Math.max(metersPerPixel, 0.000001);
  (blob.pathMaterial.uniforms.uMetersPerPixel as { value: number }).value =
    meters;
  (blob.nodeMaterial.uniforms.uMetersPerPixel as { value: number }).value =
    meters;
}

export function setOilPathwayTime(blob: OilBlob, timeSeconds: number): void {
  (blob.pathMaterial.uniforms.uTime as { value: number }).value = timeSeconds;
  (blob.nodeMaterial.uniforms.uTime as { value: number }).value = timeSeconds;
}

export function updateOilBlob(
  blob: OilBlob,
  material: THREE.ShaderMaterial,
  frame: number,
  kernelMeters: number,
  dtSeconds = 0,
): void {
  const kernel = Math.max(kernelMeters, 1);
  const fade = nextOilTrailDecay({
    trailStrength: blob.trailStrength,
    dtSeconds,
    frame,
    previousFrame: blob.lastFrame,
    replaySeconds: blob.replaySeconds,
  });
  blob.replaySeconds = fade.replaySeconds;
  // Positions are interpolated between hourly samples. Holding the stamp
  // for a fraction of an hour made playback jump while the frame counter
  // still reported a full redraw rate.
  const stepped =
    !Number.isFinite(blob.lastFrame) ||
    kernel !== blob.lastKernel ||
    frame !== blob.lastFrame ||
    fade.wrapped;
  if (
    !stepped &&
    dtSeconds <= 0 &&
    blob.trailStrength === blob.paintedTrail
  ) {
    return;
  }
  if (stepped) {
    sampleFrame(
      blob.local,
      blob.particleCount,
      blob.frameCount,
      frame,
      blob.scratchX,
      blob.scratchZ,
    );
    if (blob.hasPrev && !fade.wrapped) {
      const { scratchX, scratchZ, prevX, prevZ, velX, velZ } = blob;
      // Tracks are linear between hourly samples, so the raw heading snaps at
      // every hour. Easing it over a fraction of an hour keeps the streaks
      // that follow it from reshuffling on each sample.
      const step = Math.abs(frame - blob.lastFrame);
      const ease = Number.isFinite(step)
        ? 1 - Math.exp(-step / OIL_HEADING_EASE_FRAMES)
        : 1;
      for (let p = 0; p < blob.particleCount; p++) {
        const dx = scratchX[p]! - prevX[p]!;
        const dz = scratchZ[p]! - prevZ[p]!;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const hx = velX[p]! + (dx / len - velX[p]!) * ease;
        const hz = velZ[p]! + (dz / len - velZ[p]!) * ease;
        const hl = Math.hypot(hx, hz);
        velX[p] = hl > 1e-6 ? hx / hl : 0;
        velZ[p] = hl > 1e-6 ? hz / hl : 0;
      }
    } else {
      blob.velX.fill(0);
      blob.velZ.fill(0);
    }
    blob.prevX.set(blob.scratchX);
    blob.prevZ.set(blob.scratchZ);
    blob.hasPrev = true;
    placeOilStem(blob, frame);
    if (blob.particles.visible) placeOilParticles(blob);
    blob.stamp.fill(0);
    blob.stampFlowX.fill(0);
    blob.stampFlowZ.fill(0);
    depositFixed({
      x: blob.scratchX,
      z: blob.scratchZ,
      count: blob.particleCount,
      kernel,
      grid: OIL_BLOB_GRID,
      originX: blob.paintOriginX,
      originZ: blob.paintOriginZ,
      cell: blob.paintCell,
      target: blob.stamp,
      vx: blob.velX,
      vz: blob.velZ,
      flowX: blob.stampFlowX,
      flowZ: blob.stampFlowZ,
    });
    normalizeStampFlow(blob.stamp, blob.stampFlowX, blob.stampFlowZ);
    blob.lastFrame = frame;
    blob.lastKernel = kernel;
  }
  paintOilField(blob.density, blob.stamp, fade.decay, OIL_PAINT_CAP, {
    x: blob.flowX,
    z: blob.flowZ,
    sx: blob.stampFlowX,
    sz: blob.stampFlowZ,
  });
  uploadDensity(
    blob.stamp,
    blob.density,
    blob.rgba,
    blob.texture,
    blob.flowX,
    blob.flowZ,
  );
  blob.paintedTrail = blob.trailStrength;
  const uniforms = oilSpillUniforms(material);
  const clamped = Math.min(blob.frameCount - 1, Math.max(0, frame));
  const f0 = Math.floor(clamped);
  const f1 = Math.min(f0 + 1, blob.frameCount - 1);
  const t = clamped - f0;
  const surface =
    blob.surface.fSurface[f0]! +
    (blob.surface.fSurface[f1]! - blob.surface.fSurface[f0]!) * t;
  const thickness =
    blob.surface.thicknessMm[f0]! +
    (blob.surface.thicknessMm[f1]! - blob.surface.thicknessMm[f0]!) * t;
  uniforms.uSurface.value = surface;
  uniforms.uThicknessNm.value = Math.max(thickness, 0) * 1_000_000;
}

export function disposeOilSpillMaterial(material: THREE.ShaderMaterial | null): void {
  if (!material) return;
  const uniforms = oilSpillUniforms(material);
  uniforms.uDensity.value.dispose();
  uniforms.uSheenRamp.value.dispose();
  const mask = material.userData.waterMaskTexture as THREE.Texture | undefined;
  mask?.dispose();
  material.dispose();
}

export function disposeOilBlob(blob: OilBlob | null): void {
  if (!blob) return;
  blob.mesh.geometry.dispose();
  blob.mesh.parent?.remove(blob.mesh);
  blob.pathRibbon.geometry.dispose();
  blob.pathRibbon.parent?.remove(blob.pathRibbon);
  blob.pathMaterial.dispose();
  blob.pathNodes.geometry.dispose();
  blob.pathNodes.parent?.remove(blob.pathNodes);
  blob.nodeMaterial.dispose();
  blob.stem.geometry.dispose();
  blob.stem.parent?.remove(blob.stem);
  blob.stemMaterial.dispose();
  blob.particles.geometry.dispose();
  blob.particles.parent?.remove(blob.particles);
  blob.particleMaterial.dispose();
}
