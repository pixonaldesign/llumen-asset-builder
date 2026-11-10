import * as THREE from "three";
import { BUILDING_MASK_SCALE } from "@/lib/buildingMask";
import { hexToUnitRgba } from "@/lib/dustStormField";
import { publicUrl } from "@/lib/publicUrl";
import { heatmapPalette } from "@/lib/heatmapPalettes";
import { lngLatToLocalMeters, type SceneOrigin } from "@/lib/mercator";
import {
  FLOOD_HEATMAP_FRAGMENT,
  FLOOD_SURFACE_FRAGMENT,
  FLOOD_SURFACE_VERTEX,
} from "@/lib/shaders/floodSurface";
import type { FloodScenario, FloodSettings, FloodView } from "@/lib/types";

export type FloodBounds = {
  west: number;
  east: number;
  south: number;
  north: number;
};

export type FloodScenarioHeader = {
  id: string;
  label: string;
  /** Levels are harbor water levels; classes read stormwater bits from the codes channel. */
  kind: "levels" | "classes";
  frameHours: number;
  labels: string[];
  levels: number[];
  /** Bit offset of this scenario's 2-bit class in the codes channel. */
  shift?: number;
};

export type FloodValidation = {
  reference: string;
  peakLevel: number;
  iou: number;
  modeledCells: number;
  observedCells: number;
};

/** Hourly rain totals from `start`, played back on the sim clock. */
export type FloodRainSeries = {
  label: string;
  source: string;
  gauge?: string;
  /** ISO time with offset at the start of the first frame. */
  start: string;
  frameHours: number;
  timeZone: string;
  mmPerHour: number[];
};

type FloodHeader = {
  version: number;
  name: string;
  binary: string;
  cols: number;
  rows: number;
  cellMeters: number;
  bounds: FloodBounds;
  /** Vertical datum of ground and levels. */
  datum?: string;
  datums: Record<string, number>;
  station?: { id: string; name: string; lng: number; lat: number };
  validation?: FloodValidation;
  scenarios: FloodScenarioHeader[];
  stormwaterClasses?: Record<string, string>;
  /** Default breach location for this grid. */
  breach?: { lng: number; lat: number };
  rain?: FloodRainSeries;
};

export type LoadedFloodGrid = {
  name: string;
  cols: number;
  rows: number;
  cellMeters: number;
  bounds: FloodBounds;
  datum: string;
  datums: Record<string, number>;
  station: FloodHeader["station"] | null;
  validation: FloodValidation | null;
  scenarios: FloodScenarioHeader[];
  stormwaterClasses: Record<string, string>;
  breach: { lng: number; lat: number } | null;
  rain: FloodRainSeries | null;
  /** Half floats, four per cell: ground, spill, building, codes. Row 0 is south. */
  cells: Uint16Array;
};

export const FLOOD_CHANNELS = 4;
/** Depth a stormwater class stands for when drawn as water. Class 1 is 4 in–1 ft. */
export const STORMWATER_CLASS_DEPTHS: readonly [number, number, number] = [
  0.18, 0.55, 0.35,
];
/** Nuisance, deep and contiguous, future high tide. */
export const STORMWATER_CLASS_COLORS: readonly [string, string, string] = [
  "#8fd3f4",
  "#1f5fae",
  "#7b4fc9",
];
/** Water this shallow is drawn as dry ground. */
export const FLOOD_DRY_METERS = 0.02;

export async function loadFloodGrid(headerUrl: string): Promise<LoadedFloodGrid> {
  const headerResponse = await fetch(publicUrl(headerUrl));
  if (!headerResponse.ok) {
    throw new Error(`Flood header failed (${headerResponse.status})`);
  }
  const header = (await headerResponse.json()) as FloodHeader;
  const binaryUrl = header.binary.startsWith("/")
    ? header.binary
    : new URL(header.binary, new URL(headerUrl, location.origin)).pathname;
  const binaryResponse = await fetch(publicUrl(binaryUrl));
  if (!binaryResponse.ok) {
    throw new Error(`Flood grid failed (${binaryResponse.status})`);
  }
  return decodeFloodGrid(header, await binaryResponse.arrayBuffer());
}

export function decodeFloodGrid(
  header: FloodHeader,
  buffer: ArrayBuffer,
): LoadedFloodGrid {
  const expected = header.cols * header.rows * FLOOD_CHANNELS * 2;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `Flood grid is ${buffer.byteLength} bytes, expected ${expected}`,
    );
  }
  return {
    name: header.name,
    cols: header.cols,
    rows: header.rows,
    cellMeters: header.cellMeters,
    bounds: header.bounds,
    datum: header.datum ?? "NAVD88",
    datums: header.datums ?? {},
    station: header.station ?? null,
    validation: header.validation ?? null,
    scenarios: header.scenarios ?? [],
    stormwaterClasses: header.stormwaterClasses ?? {},
    breach: header.breach ?? null,
    rain: header.rain?.mmPerHour.length ? header.rain : null,
    cells: new Uint16Array(buffer),
  };
}

/** Rain rate in mm/h at a sim time. The series plays once from its start; after it, rain stops. */
export function floodRainAt(series: FloodRainSeries, simSeconds: number): number {
  const frame = Math.floor(simSeconds / (series.frameHours * 3600));
  if (!(frame >= 0)) return 0;
  return series.mmPerHour[frame] ?? 0;
}

/** Millimeters fallen by a sim time. */
export function floodRainTotal(series: FloodRainSeries, simSeconds: number): number {
  const frameSeconds = series.frameHours * 3600;
  const t = Math.max(0, simSeconds);
  let total = 0;
  series.mmPerHour.forEach((rate, index) => {
    const covered = Math.min(frameSeconds, Math.max(0, t - index * frameSeconds));
    total += (rate * covered) / 3600;
  });
  return total;
}

export function floodRainDuration(series: FloodRainSeries): number {
  return series.mmPerHour.length * series.frameHours * 3600;
}

/** Local clock of the storm at a sim time, e.g. "Apr 16, 2:30 PM". */
export function formatFloodRainTime(series: FloodRainSeries, simSeconds: number): string {
  const start = new Date(series.start).getTime();
  if (Number.isNaN(start)) return "";
  return new Date(start + simSeconds * 1000).toLocaleString("en-US", {
    timeZone: series.timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One decoded channel as floats, row 0 south. */
export function floodChannel(
  grid: LoadedFloodGrid,
  channel: 0 | 1 | 2 | 3,
): Float32Array {
  const count = grid.cols * grid.rows;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = THREE.DataUtils.fromHalfFloat(grid.cells[i * FLOOD_CHANNELS + channel]!);
  }
  return out;
}

export function isOpenWaterCode(code: number): boolean {
  return (Math.round(code) & 1) === 1;
}

/** 0 dry, 1 nuisance, 2 deep and contiguous, 3 future high tide. */
export function stormwaterClass(code: number, shift: number): number {
  return (Math.round(code) >> shift) & 3;
}

/** Connected bathtub depth: a cell only floods once the harbor reaches its spill level. */
export function floodDepthAt(ground: number, spill: number, level: number): number {
  if (!(level >= spill)) return 0;
  return Math.max(0, level - ground);
}

export function floodScenarioHeader(
  grid: LoadedFloodGrid,
  scenario: FloodScenario,
): FloodScenarioHeader | null {
  if (scenario === "sim") return null;
  return grid.scenarios.find((entry) => entry.id === scenario) ?? null;
}

export function floodFrameCount(
  grid: LoadedFloodGrid,
  scenario: FloodScenario,
): number {
  return Math.max(1, floodScenarioHeader(grid, scenario)?.levels.length ?? 1);
}

export type FloodFrameState = {
  frameA: number;
  frameB: number;
  mix: number;
  /** Harbor level in NAVD88 meters, interpolated and offset. */
  level: number;
  label: string;
};

/** Frames clamp at the ends: a surge plays once and holds, it does not wrap. */
export function floodFrameState(
  scenario: FloodScenarioHeader | null,
  frame: number,
  levelOffset = 0,
): FloodFrameState {
  const levels = scenario?.levels ?? [];
  if (levels.length === 0) {
    return { frameA: 0, frameB: 0, mix: 0, level: levelOffset, label: "" };
  }
  const last = levels.length - 1;
  const clamped = Math.min(last, Math.max(0, Number.isFinite(frame) ? frame : 0));
  const frameA = Math.floor(clamped);
  const frameB = Math.min(last, frameA + 1);
  const mix = frameB === frameA ? 0 : clamped - frameA;
  const level = levels[frameA]! + (levels[frameB]! - levels[frameA]!) * mix;
  const label = scenario?.labels[Math.round(clamped)] ?? scenario?.labels[frameA] ?? "";
  return { frameA, frameB, mix, level: level + levelOffset, label };
}

/** Advance a scenario clock, looping back to the first frame after the last. */
export function advanceFloodFrame(
  frame: number,
  dtSeconds: number,
  hoursPerSecond: number,
  frameHours: number,
  frameCount: number,
): number {
  const step = frameHours > 0 ? (dtSeconds * hoursPerSecond) / frameHours : 0;
  const next = frame + step;
  const last = Math.max(0, frameCount - 1);
  return next > last ? 0 : next;
}

/** Sandy timestamps are UTC; the readout shows New York time. */
export function formatFloodLabel(label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(label)) return label;
  const date = new Date(label);
  if (Number.isNaN(date.getTime())) return label;
  return `${date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} EDT`;
}

/** Heatmap and surface opacity for the current zoom. */
export function floodViewMix(
  view: FloodView,
  zoom: number,
  fadeStart: number,
  fadeEnd: number,
): { heatmap: number; surface: number } {
  if (view === "heatmap") return { heatmap: 1, surface: 0 };
  if (view === "surface") return { heatmap: 0, surface: 1 };
  const span = Math.max(0.001, fadeEnd - fadeStart);
  const t = Math.min(1, Math.max(0, (zoom - fadeStart) / span));
  const eased = t * t * (3 - 2 * t);
  return { heatmap: 1 - eased, surface: eased };
}

export function floodSceneOrigin(
  grid: LoadedFloodGrid,
  createOrigin: (lng: number, lat: number) => SceneOrigin,
): SceneOrigin {
  const { bounds } = grid;
  return createOrigin(
    (bounds.west + bounds.east) * 0.5,
    (bounds.south + bounds.north) * 0.5,
  );
}

export type FloodLocalFrame = {
  /** Local x of the west edge and z of the south edge. */
  x0: number;
  z0: number;
  /** Local meters across the grid. z runs south to north, so dz is negative. */
  dx: number;
  dz: number;
};

export function floodLocalFrame(
  grid: LoadedFloodGrid,
  origin: SceneOrigin,
): FloodLocalFrame {
  const sw = lngLatToLocalMeters(origin, grid.bounds.west, grid.bounds.south);
  const ne = lngLatToLocalMeters(origin, grid.bounds.east, grid.bounds.north);
  return { x0: sw.x, z0: sw.z, dx: ne.x - sw.x, dz: ne.z - sw.z };
}

/** Grid cell under a lng/lat, or null outside the grid. */
export function floodCellAt(
  grid: LoadedFloodGrid,
  lng: number,
  lat: number,
): { col: number; row: number } | null {
  const mercY = (value: number) =>
    Math.log(Math.tan(Math.PI / 4 + (value * Math.PI) / 360));
  const u = (lng - grid.bounds.west) / (grid.bounds.east - grid.bounds.west);
  const v =
    (mercY(lat) - mercY(grid.bounds.south)) /
    (mercY(grid.bounds.north) - mercY(grid.bounds.south));
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;
  return { col: Math.floor(u * grid.cols), row: Math.floor(v * grid.rows) };
}

/**
 * Settings carried over from another grid: a scenario this grid lacks falls
 * back to the sim, and a breach outside it moves to the grid's own default.
 */
export function floodSettingsForGrid(
  settings: FloodSettings,
  grid: LoadedFloodGrid,
  scenarios: readonly FloodScenario[],
): FloodSettings {
  const next = { ...settings };
  if (next.scenario !== "sim" && !scenarios.includes(next.scenario)) next.scenario = "sim";
  if (grid.breach && !floodCellAt(grid, next.simBreachLng, next.simBreachLat)) {
    next.simBreachLng = grid.breach.lng;
    next.simBreachLat = grid.breach.lat;
  }
  return next;
}

/**
 * Lattice over cell corners, `step` cells apart. UV hits corners exactly so the
 * shader averages the four cells that meet there.
 */
export function buildFloodSurfaceGeometry(
  grid: LoadedFloodGrid,
  frame: FloodLocalFrame,
  step = 2,
): THREE.BufferGeometry {
  const stride = Math.max(1, Math.round(step));
  const vertsX = Math.ceil(grid.cols / stride) + 1;
  const vertsZ = Math.ceil(grid.rows / stride) + 1;
  const positions = new Float32Array(vertsX * vertsZ * 3);
  const uvs = new Float32Array(vertsX * vertsZ * 2);
  let vertex = 0;
  for (let j = 0; j < vertsZ; j += 1) {
    const v = Math.min(1, (j * stride) / grid.rows);
    for (let i = 0; i < vertsX; i += 1) {
      const u = Math.min(1, (i * stride) / grid.cols);
      positions[vertex * 3] = frame.x0 + u * frame.dx;
      positions[vertex * 3 + 1] = 0;
      positions[vertex * 3 + 2] = frame.z0 + v * frame.dz;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
      vertex += 1;
    }
  }
  const indices = new Uint32Array((vertsX - 1) * (vertsZ - 1) * 6);
  let cursor = 0;
  for (let j = 0; j < vertsZ - 1; j += 1) {
    for (let i = 0; i < vertsX - 1; i += 1) {
      const a = j * vertsX + i;
      indices[cursor] = a;
      indices[cursor + 1] = a + 1;
      indices[cursor + 2] = a + 1 + vertsX;
      indices[cursor + 3] = a;
      indices[cursor + 4] = a + 1 + vertsX;
      indices[cursor + 5] = a + vertsX;
      cursor += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createFloodGridTexture(grid: LoadedFloodGrid): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    grid.cells,
    grid.cols,
    grid.rows,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  configureDataTexture(texture);
  return texture;
}

/** Roof heights in meters, one per cell. Rewritten when Mapbox buildings arrive. */
export function createFloodBuildingTexture(
  heights: Float32Array,
  cols: number,
  rows: number,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    heights,
    cols,
    rows,
    THREE.RedFormat,
    THREE.FloatType,
  );
  configureDataTexture(texture);
  return texture;
}

/** Footprint mask from `rasterizeBuildingMask`; linear so the wall edge interpolates within a pixel. */
export function createFloodBuildingMaskTexture(
  data: Uint8Array,
  width: number,
  height: number,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGFormat, THREE.UnsignedByteType);
  configureDataTexture(texture);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  return texture;
}

function configureDataTexture(texture: THREE.DataTexture): void {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
}

function emptyDepthTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Float32Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  configureDataTexture(texture);
  return texture;
}

export const FLOOD_SOURCE_ID = { levels: 0, classes: 1, sim: 2 } as const;

export type FloodUniforms = {
  uGrid: { value: THREE.Texture };
  uBuildings: { value: THREE.Texture };
  uSimState: { value: THREE.Texture };
  uCols: { value: number };
  uRows: { value: number };
  uCellMeters: { value: number };
  uSource: { value: number };
  uLevel: { value: number };
  /** 2^shift for the active stormwater class bits. */
  uClassScale: { value: number };
  uClassDepths: { value: THREE.Vector3 };
  uHarborRest: { value: number };
  uFlatRest: { value: number };
  uShowHarbor: { value: number };
  uTerrain: { value: number };
  uExaggeration: { value: number };
  uHeatmapAlpha: { value: number };
  uSurfaceAlpha: { value: number };
  uHeatmapOpacity: { value: number };
  uMaxDepth: { value: number };
  uBands: { value: number };
  uBandStep: { value: number };
  uColor0: { value: THREE.Vector4 };
  uColor1: { value: THREE.Vector4 };
  uColor2: { value: THREE.Vector4 };
  uColor3: { value: THREE.Vector4 };
  uClassColor1: { value: THREE.Vector3 };
  uClassColor2: { value: THREE.Vector3 };
  uClassColor3: { value: THREE.Vector3 };
  uSurfaceOpacity: { value: number };
  uShallowColor: { value: THREE.Vector3 };
  uDeepColor: { value: THREE.Vector3 };
  uAbsorption: { value: number };
  uWaveStrength: { value: number };
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uCameraPos: { value: THREE.Vector3 };
  uFlowScale: { value: number };
  uDisplay: { value: THREE.Texture };
  uUseDisplay: { value: number };
  uShallowFade: { value: number };
  uBuildingMask: { value: THREE.Texture };
  uBuildingMaskOn: { value: number };
  uBuildingMaskScale: { value: number };
};

export function createFloodUniforms(
  grid: LoadedFloodGrid,
  gridTex: THREE.Texture,
  buildingTex: THREE.Texture,
): FloodUniforms {
  return {
    uGrid: { value: gridTex },
    uBuildings: { value: buildingTex },
    uSimState: { value: emptyDepthTexture() },
    uCols: { value: grid.cols },
    uRows: { value: grid.rows },
    uCellMeters: { value: grid.cellMeters },
    uSource: { value: FLOOD_SOURCE_ID.levels },
    uLevel: { value: grid.datums.MHHW ?? 0.7 },
    uClassScale: { value: 2 },
    uClassDepths: { value: new THREE.Vector3(...STORMWATER_CLASS_DEPTHS) },
    uHarborRest: { value: grid.datums.MHHW ?? 0.7 },
    uFlatRest: { value: grid.datums.MSL ?? 0 },
    uShowHarbor: { value: 1 },
    uTerrain: { value: 0 },
    uExaggeration: { value: 1 },
    uHeatmapAlpha: { value: 1 },
    uSurfaceAlpha: { value: 1 },
    uHeatmapOpacity: { value: 0.8 },
    uMaxDepth: { value: 3 },
    uBands: { value: 0 },
    uBandStep: { value: 0.5 },
    uColor0: { value: new THREE.Vector4() },
    uColor1: { value: new THREE.Vector4() },
    uColor2: { value: new THREE.Vector4() },
    uColor3: { value: new THREE.Vector4() },
    uClassColor1: { value: vec3FromHex(STORMWATER_CLASS_COLORS[0]) },
    uClassColor2: { value: vec3FromHex(STORMWATER_CLASS_COLORS[1]) },
    uClassColor3: { value: vec3FromHex(STORMWATER_CLASS_COLORS[2]) },
    uSurfaceOpacity: { value: 0.9 },
    uShallowColor: { value: new THREE.Vector3() },
    uDeepColor: { value: new THREE.Vector3() },
    uAbsorption: { value: 0.9 },
    uWaveStrength: { value: 0.5 },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
    uCameraPos: { value: new THREE.Vector3() },
    uFlowScale: { value: 0 },
    uDisplay: { value: emptyDepthTexture() },
    uUseDisplay: { value: 0 },
    uShallowFade: { value: 0.07 },
    uBuildingMask: { value: emptyDepthTexture() },
    uBuildingMaskOn: { value: 0 },
    uBuildingMaskScale: { value: BUILDING_MASK_SCALE },
  };
}

function hexToVec3(hex: string, target: THREE.Vector3): void {
  const [r, g, b] = hexToUnitRgba(hex);
  target.set(r, g, b);
}

function vec3FromHex(hex: string): THREE.Vector3 {
  const target = new THREE.Vector3();
  hexToVec3(hex, target);
  return target;
}

export type FloodFrameInputs = {
  grid: LoadedFloodGrid;
  settings: FloodSettings;
  frame: number;
  zoom: number;
  timeSeconds: number;
  simActive: boolean;
};

/** Push settings and the current frame into the shared uniforms. Returns the frame state. */
export function syncFloodUniforms(
  uniforms: FloodUniforms,
  inputs: FloodFrameInputs,
): FloodFrameState {
  const { grid, settings } = inputs;
  const header = floodScenarioHeader(grid, settings.scenario);
  const state = floodFrameState(header, inputs.frame, settings.levelOffset);
  if (inputs.simActive) {
    uniforms.uSource.value = FLOOD_SOURCE_ID.sim;
  } else if (header?.kind === "classes") {
    uniforms.uSource.value = FLOOD_SOURCE_ID.classes;
    uniforms.uClassScale.value = 2 ** (header.shift ?? 1);
  } else {
    uniforms.uSource.value = FLOOD_SOURCE_ID.levels;
  }
  uniforms.uLevel.value = state.level;
  uniforms.uShowHarbor.value = settings.showHarbor ? 1 : 0;
  uniforms.uTerrain.value = settings.terrain ? 1 : 0;
  uniforms.uExaggeration.value = settings.terrainExaggeration;
  const mix = floodViewMix(
    settings.view,
    inputs.zoom,
    settings.surfaceFadeStartZoom,
    settings.surfaceFadeEndZoom,
  );
  uniforms.uHeatmapAlpha.value = mix.heatmap;
  uniforms.uSurfaceAlpha.value = mix.surface;
  uniforms.uHeatmapOpacity.value = settings.heatmapOpacity;
  uniforms.uMaxDepth.value = settings.maxDepthMeters;
  uniforms.uBands.value = settings.depthBands ? 1 : 0;
  uniforms.uBandStep.value = settings.bandStepMeters;
  const palette = heatmapPalette(settings.palette) ?? heatmapPalette("flood")!;
  uniforms.uColor0.value.set(...hexToUnitRgba(palette.colorLow));
  uniforms.uColor1.value.set(...hexToUnitRgba(palette.colorMid));
  uniforms.uColor2.value.set(...hexToUnitRgba(palette.colorHigh));
  uniforms.uColor3.value.set(...hexToUnitRgba(palette.colorExtreme));
  uniforms.uSurfaceOpacity.value = settings.surfaceOpacity;
  hexToVec3(settings.shallowColor, uniforms.uShallowColor.value);
  hexToVec3(settings.deepColor, uniforms.uDeepColor.value);
  uniforms.uAbsorption.value = settings.absorption;
  uniforms.uWaveStrength.value = settings.waveStrength;
  uniforms.uTime.value = inputs.timeSeconds * settings.waveSpeed;
  uniforms.uFlowScale.value = inputs.simActive ? 1 : 0;
  uniforms.uShallowFade.value = settings.shallowFadeMeters;
  return state;
}

export function createFloodHeatmapMaterial(
  uniforms: FloodUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FLOOD_SURFACE_VERTEX,
    fragmentShader: FLOOD_HEATMAP_FRAGMENT,
    defines: { FLOOD_HEATMAP: 1 },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** The surface writes depth so the heatmap and far water stay behind it. */
export function createFloodSurfaceMaterial(
  uniforms: FloodUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FLOOD_SURFACE_VERTEX,
    fragmentShader: FLOOD_SURFACE_FRAGMENT,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Building raster from the baked footprint channel. */
export function bakedBuildingHeights(grid: LoadedFloodGrid): Float32Array {
  return floodChannel(grid, 2);
}

/** Combine baked and Mapbox heights for the chosen source. */
export function mergeBuildingHeights(
  baked: Float32Array,
  mapbox: Float32Array | null,
  source: FloodSettings["buildingSource"],
  target: Float32Array,
): Float32Array {
  for (let i = 0; i < target.length; i += 1) {
    const b = baked[i] ?? 0;
    const m = mapbox?.[i] ?? 0;
    target[i] =
      source === "baked" ? b : source === "mapbox" ? (mapbox ? m : b) : Math.max(b, m);
  }
  return target;
}
