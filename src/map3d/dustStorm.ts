import * as THREE from "three";
import { lngLatToLocalMeters, type SceneOrigin } from "@/lib/mercator";
import { publicUrl } from "@/lib/publicUrl";
import {
  DUST_CELL_FRAGMENT,
  DUST_CELL_VERTEX,
  DUST_POINT_FRAGMENT,
  DUST_POINT_VERTEX,
  DUST_SOFT_FRAGMENT,
  DUST_SOFT_VERTEX,
  DUST_TERRAIN_FRAGMENT,
  DUST_TERRAIN_VERTEX,
} from "@/lib/shaders/dustStorm";
import type {
  DustContourStyle,
  DustHeatPattern,
  DustPlacement,
  DustStormSettings,
} from "@/lib/types";
import {
  hexToUnitRgba,
  latticeCount,
  latticeUnit,
  percentileValue,
  type DustSignal,
  type PercentileTable,
} from "@/lib/dustStormField";
import {
  averageIntoHexes,
  buildHexLayout,
  hexCentroid,
  type HexLayout,
} from "@/lib/hexbin";

export type DustStormBounds = {
  west: number;
  east: number;
  south: number;
  north: number;
};

export type LoadedDustField = {
  rows: number;
  cols: number;
  frameCount: number;
  lats: Float64Array;
  lons: Float64Array;
  timestamps: string[];
  bounds: DustStormBounds;
  percentiles: Record<DustSignal, PercentileTable>;
  fieldRgba: Uint16Array;
  windRgba: Uint16Array;
};

type DustHeader = {
  rows: number;
  cols: number;
  frames: number;
  binary: string;
  lats: number[];
  lons: number[];
  timestamps: string[];
  bounds: DustStormBounds;
  percentiles: Record<DustSignal, PercentileTable>;
};

const HALF_ONE = 0x3c00;

export function dustViewIsParticles(view: DustStormSettings["view"]): boolean {
  return view === "particles";
}

export function dustDrawCount(
  cells: number,
  settings: DustStormSettings,
): number {
  const view = settings.view ?? "particles";
  if (!dustViewIsParticles(view)) return cells;
  const per = Math.max(1, Math.round(settings.particlesPerCell));
  const placed = settings.placement === "locked" ? latticeCount(per) : per;
  return cells * placed;
}

function asTable(value: unknown): PercentileTable {
  const raw = value as Partial<PercentileTable> | undefined;
  const levels = Array.isArray(raw?.levels) ? raw.levels.map(Number) : [];
  const values = Array.isArray(raw?.values) ? raw.values.map(Number) : [];
  return { levels, values };
}

export async function loadDustStormField(
  headerUrl: string,
): Promise<LoadedDustField> {
  const headerResponse = await fetch(publicUrl(headerUrl));
  if (!headerResponse.ok) {
    throw new Error(`Dust storm header failed (${headerResponse.status})`);
  }
  const header = (await headerResponse.json()) as DustHeader;
  const binaryUrl = header.binary.startsWith("/")
    ? header.binary
    : new URL(header.binary, new URL(headerUrl, location.origin)).pathname;
  const binaryResponse = await fetch(publicUrl(binaryUrl));
  if (!binaryResponse.ok) {
    throw new Error(`Dust storm frames failed (${binaryResponse.status})`);
  }
  const buffer = await binaryResponse.arrayBuffer();
  const cells = header.rows * header.cols;
  const expected = header.frames * cells * 5 * 2;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `Dust storm binary is ${buffer.byteLength} bytes, expected ${expected}`,
    );
  }
  const src = new Uint16Array(buffer);
  const fieldRgba = new Uint16Array(header.frames * cells * 4);
  const windRgba = new Uint16Array(header.frames * cells * 4);
  for (let i = 0; i < header.frames * cells; i += 1) {
    const source = i * 5;
    const dest = i * 4;
    fieldRgba[dest] = src[source]!;
    fieldRgba[dest + 1] = src[source + 1]!;
    fieldRgba[dest + 2] = src[source + 2]!;
    fieldRgba[dest + 3] = HALF_ONE;
    windRgba[dest] = src[source + 3]!;
    windRgba[dest + 1] = src[source + 4]!;
    windRgba[dest + 3] = HALF_ONE;
  }
  return {
    rows: header.rows,
    cols: header.cols,
    frameCount: header.frames,
    lats: Float64Array.from(header.lats),
    lons: Float64Array.from(header.lons),
    timestamps: header.timestamps,
    bounds: header.bounds,
    percentiles: {
      pm10: asTable(header.percentiles.pm10),
      pm25: asTable(header.percentiles.pm25),
      coarse: asTable(header.percentiles.coarse),
    },
    fieldRgba,
    windRgba,
  };
}

function createSceneOriginLazy(
  field: LoadedDustField,
  createOrigin: (lng: number, lat: number) => SceneOrigin,
): SceneOrigin {
  const { bounds } = field;
  return createOrigin(
    (bounds.west + bounds.east) * 0.5,
    (bounds.south + bounds.north) * 0.5,
  );
}

export function dustSceneOrigin(
  field: LoadedDustField,
  createOrigin: (lng: number, lat: number) => SceneOrigin,
): SceneOrigin {
  return createSceneOriginLazy(field, createOrigin);
}

function axisEdges(coords: Float64Array): Float64Array {
  const count = coords.length;
  const edges = new Float64Array(count + 1);
  if (count === 1) {
    edges[0] = coords[0]! - 0.5;
    edges[1] = coords[0]! + 0.5;
    return edges;
  }
  edges[0] = coords[0]! - (coords[1]! - coords[0]!) * 0.5;
  for (let i = 1; i < count; i += 1) {
    edges[i] = (coords[i - 1]! + coords[i]!) * 0.5;
  }
  edges[count] =
    coords[count - 1]! + (coords[count - 1]! - coords[count - 2]!) * 0.5;
  return edges;
}

function localAxes(
  field: LoadedDustField,
  origin: SceneOrigin,
): { xs: Float64Array; zs: Float64Array } {
  const xs = new Float64Array(field.cols);
  const zs = new Float64Array(field.rows);
  const refLat = field.lats[field.rows >> 1] ?? origin.lat;
  const refLon = field.lons[field.cols >> 1] ?? origin.lng;
  for (let col = 0; col < field.cols; col += 1) {
    xs[col] = lngLatToLocalMeters(origin, field.lons[col]!, refLat).x;
  }
  for (let row = 0; row < field.rows; row += 1) {
    zs[row] = lngLatToLocalMeters(origin, refLon, field.lats[row]!).z;
  }
  return { xs, zs };
}

function hashUnit(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function buildDustPointGeometry(
  field: LoadedDustField,
  origin: SceneOrigin,
  particlesPerCell: number,
  placement: DustPlacement,
): THREE.BufferGeometry {
  const perCell = Math.max(1, Math.round(particlesPerCell));
  const locked = placement === "locked";
  const placed = locked ? latticeCount(perCell) : perCell;
  const { xs, zs } = localAxes(field, origin);
  const edgesX = axisEdges(xs);
  const edgesZ = axisEdges(zs);
  const count = field.rows * field.cols * placed;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const seeds = new Float32Array(count);
  const denomU = Math.max(1, field.cols - 1);
  const denomV = Math.max(1, field.rows - 1);
  let index = 0;
  for (let row = 0; row < field.rows; row += 1) {
    const z0 = edgesZ[row]!;
    const z1 = edgesZ[row + 1]!;
    for (let col = 0; col < field.cols; col += 1) {
      const x0 = edgesX[col]!;
      const x1 = edgesX[col + 1]!;
      for (let k = 0; k < placed; k += 1) {
        const seed = hashUnit(index + 1.7);
        const spot = locked ? latticeUnit(k, perCell) : null;
        const jx = spot ? spot[0] : hashUnit(index * 1.13 + 4.2);
        const jz = spot ? spot[1] : hashUnit(index * 2.91 + 8.6);
        positions[index * 3] = x0 + jx * (x1 - x0);
        positions[index * 3 + 1] = 0;
        positions[index * 3 + 2] = z0 + jz * (z1 - z0);
        uvs[index * 2] = (col + jx - 0.5) / denomU;
        uvs[index * 2 + 1] = (row + jz - 0.5) / denomV;
        seeds[index] = seed;
        index += 1;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Unit box: x/z in [-0.5, 0.5], y in [0, 1]. Flat keeps only the top face. */
function unitSquareShape(extruded: boolean): THREE.BufferGeometry {
  if (extruded) return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

/** Pointy-top hex of circumradius 1 in x/z, matching `hexCentroid`. */
function unitHexShape(extruded: boolean): THREE.BufferGeometry {
  const ring: Array<[number, number]> = [];
  for (let k = 0; k < 6; k += 1) {
    const a = (k * Math.PI) / 3;
    ring.push([Math.sin(a), -Math.cos(a)]);
  }
  const positions: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    positions.push(...a, ...b, ...c);
  };
  const top = ring.map(([x, z]) => [x, extruded ? 1 : 0, z]);
  const bottom = ring.map(([x, z]) => [x, 0, z]);
  for (let k = 1; k < 5; k += 1) tri(top[0]!, top[k + 1]!, top[k]!);
  if (extruded) {
    for (let k = 1; k < 5; k += 1) tri(bottom[0]!, bottom[k]!, bottom[k + 1]!);
    for (let k = 0; k < 6; k += 1) {
      const n = (k + 1) % 6;
      tri(bottom[k]!, top[k]!, top[n]!);
      tri(bottom[k]!, top[n]!, bottom[n]!);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function instanceCells(
  shape: THREE.BufferGeometry,
  centers: Float32Array,
  sizes: Float32Array,
  cellUvs: Float32Array,
): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = shape.index;
  geometry.setAttribute("position", shape.getAttribute("position"));
  geometry.setAttribute("normal", shape.getAttribute("normal"));
  geometry.setAttribute("aCenter", new THREE.InstancedBufferAttribute(centers, 2));
  geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 2));
  geometry.setAttribute("aCellUv", new THREE.InstancedBufferAttribute(cellUvs, 2));
  geometry.instanceCount = centers.length / 2;
  return geometry;
}

/** One instance per grid cell, sized to the cell's own edges. */
export function buildDustSquareCellGeometry(
  field: LoadedDustField,
  origin: SceneOrigin,
  extruded: boolean,
): THREE.InstancedBufferGeometry {
  const { xs, zs } = localAxes(field, origin);
  const edgesX = axisEdges(xs);
  const edgesZ = axisEdges(zs);
  const count = field.rows * field.cols;
  const centers = new Float32Array(count * 2);
  const sizes = new Float32Array(count * 2);
  const cellUvs = new Float32Array(count * 2);
  let index = 0;
  for (let row = 0; row < field.rows; row += 1) {
    const v = field.rows === 1 ? 0 : row / (field.rows - 1);
    const z0 = edgesZ[row]!;
    const z1 = edgesZ[row + 1]!;
    for (let col = 0; col < field.cols; col += 1) {
      const x0 = edgesX[col]!;
      const x1 = edgesX[col + 1]!;
      centers[index * 2] = (x0 + x1) * 0.5;
      centers[index * 2 + 1] = (z0 + z1) * 0.5;
      sizes[index * 2] = x1 - x0;
      sizes[index * 2 + 1] = z1 - z0;
      cellUvs[index * 2] = field.cols === 1 ? 0 : col / (field.cols - 1);
      cellUvs[index * 2 + 1] = v;
      index += 1;
    }
  }
  return instanceCells(unitSquareShape(extruded), centers, sizes, cellUvs);
}

export type DustHexField = {
  layout: HexLayout;
  texture: THREE.DataArrayTexture;
};

/** Hex radius in meters for a size in grid cells. */
export function dustHexRadiusMeters(
  field: LoadedDustField,
  sizeCells: number,
): number {
  return Math.max(1, sizeCells) * dustCellMeters(field);
}

const decodedFields = new WeakMap<LoadedDustField, Float32Array>();

function decodedField(field: LoadedDustField): Float32Array {
  const cached = decodedFields.get(field);
  if (cached) return cached;
  const decoded = new Float32Array(field.fieldRgba.length);
  for (let i = 0; i < decoded.length; i += 1) {
    decoded[i] = THREE.DataUtils.fromHalfFloat(field.fieldRgba[i]!);
  }
  decodedFields.set(field, decoded);
  return decoded;
}

/** Per-frame hex means of the raw channels, so the shader math stays the same. */
export function buildDustHexField(
  field: LoadedDustField,
  origin: SceneOrigin,
  radiusMeters: number,
): DustHexField {
  const { xs, zs } = localAxes(field, origin);
  const layout = buildHexLayout(xs, zs, radiusMeters);
  const means = averageIntoHexes(layout, decodedField(field), field.frameCount, 4);
  const halves = new Uint16Array(means.length);
  for (let i = 0; i < means.length; i += 1) {
    halves[i] = THREE.DataUtils.toHalfFloat(means[i]!);
  }
  return {
    layout,
    texture: makeArrayTexture(
      halves,
      Math.max(1, layout.width),
      Math.max(1, layout.height),
      field.frameCount,
    ),
  };
}

/** Only hexes that hold at least one grid cell get an instance. */
export function buildDustHexCellGeometry(
  layout: HexLayout,
  extruded: boolean,
): THREE.InstancedBufferGeometry {
  let count = 0;
  for (let t = 0; t < layout.counts.length; t += 1) {
    if (layout.counts[t]! > 0) count += 1;
  }
  const centers = new Float32Array(count * 2);
  const sizes = new Float32Array(count * 2);
  const cellUvs = new Float32Array(count * 2);
  const denomU = Math.max(1, layout.width - 1);
  const denomV = Math.max(1, layout.height - 1);
  let index = 0;
  for (let tj = 0; tj < layout.height; tj += 1) {
    for (let ti = 0; ti < layout.width; ti += 1) {
      if (layout.counts[tj * layout.width + ti] === 0) continue;
      const [x, z] = hexCentroid(ti + layout.iMin, tj + layout.jMin, layout.radius);
      centers[index * 2] = x;
      centers[index * 2 + 1] = z;
      sizes[index * 2] = layout.radius;
      sizes[index * 2 + 1] = layout.radius;
      cellUvs[index * 2] = layout.width === 1 ? 0 : ti / denomU;
      cellUvs[index * 2 + 1] = layout.height === 1 ? 0 : tj / denomV;
      index += 1;
    }
  }
  return instanceCells(unitHexShape(extruded), centers, sizes, cellUvs);
}

/** Same uniforms as the grid, but sampling the hex texture at hex resolution. */
export function createDustHexUniforms(
  uniforms: DustUniforms,
  hex: DustHexField,
): DustUniforms {
  return {
    ...uniforms,
    uField: { value: hex.texture },
    uCols: { value: Math.max(1, hex.layout.width) },
    uRows: { value: Math.max(1, hex.layout.height) },
  };
}

/** Continuous sheet. UV moves across each cell so a blur can round the raster. */
export function buildDustSoftGeometry(
  field: LoadedDustField,
  origin: SceneOrigin,
): THREE.BufferGeometry {
  const { xs, zs } = localAxes(field, origin);
  const edgesX = axisEdges(xs);
  const edgesZ = axisEdges(zs);
  const vertsX = field.cols + 1;
  const vertsZ = field.rows + 1;
  const positions = new Float32Array(vertsX * vertsZ * 3);
  const uvs = new Float32Array(vertsX * vertsZ * 2);
  const denomU = Math.max(1, field.cols - 1);
  const denomV = Math.max(1, field.rows - 1);
  let vertex = 0;
  for (let row = 0; row < vertsZ; row += 1) {
    const v = (row - 0.5) / denomV;
    for (let col = 0; col < vertsX; col += 1) {
      const u = (col - 0.5) / denomU;
      positions[vertex * 3] = edgesX[col]!;
      positions[vertex * 3 + 1] = 0;
      positions[vertex * 3 + 2] = edgesZ[row]!;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
      vertex += 1;
    }
  }
  const indices = new Uint32Array(field.rows * field.cols * 6);
  let cursor = 0;
  for (let row = 0; row < field.rows; row += 1) {
    for (let col = 0; col < field.cols; col += 1) {
      const i = row * vertsX + col;
      indices[cursor] = i;
      indices[cursor + 1] = i + 1;
      indices[cursor + 2] = i + 1 + vertsX;
      indices[cursor + 3] = i;
      indices[cursor + 4] = i + 1 + vertsX;
      indices[cursor + 5] = i + vertsX;
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

export type DustUniforms = {
  uField: { value: THREE.DataArrayTexture };
  uWind: { value: THREE.DataArrayTexture };
  uFrameA: { value: number };
  uFrameB: { value: number };
  uFrameMix: { value: number };
  uRows: { value: number };
  uCols: { value: number };
  uSignal: { value: number };
  uNormMode: { value: number };
  uClipLow: { value: number };
  uClipHigh: { value: number };
  uHeightExponent: { value: number };
  uMaxHeight: { value: number };
  uTurbulence: { value: number };
  uWindAmplitude: { value: number };
  uWindFrom: { value: number };
  uLocked: { value: number };
  uTime: { value: number };
  uFlat: { value: number };
  uBlurCells: { value: number };
  uPointSize: { value: number };
  uCellMeters: { value: number };
  uMaxPointPixels: { value: number };
  uViewport: { value: THREE.Vector2 };
  uOpacity: { value: number };
  uSizeFromIntensity: { value: number };
  uOpacityFromIntensity: { value: number };
  uOpacityExponent: { value: number };
  uGroundOffset: { value: number };
  uColor0: { value: THREE.Vector4 };
  uColor1: { value: THREE.Vector4 };
  uColor2: { value: THREE.Vector4 };
  uColor3: { value: THREE.Vector4 };
  uSoftField: { value: THREE.Texture };
  uFrost: { value: THREE.Texture };
  uReadFrost: { value: number };
  uPattern: { value: number };
  uPatternSpacing: { value: number };
  uPatternStroke: { value: number };
  /** Ground meters per CSS pixel at the current zoom. Pitch does not change it. */
  uPatternMeters: { value: number };
  uCoverage: { value: number };
  /** Column and terrain height at full intensity. 0 when the heatmap is flat. */
  uColumnHeight: { value: number };
  uCellStep: { value: THREE.Vector2 };
  uContourOn: { value: number };
  uContourLog: { value: number };
  uContourStep: { value: number };
  uContourMajor: { value: number };
  /** Device pixels. */
  uContourWidth: { value: number };
  uContourStyle: { value: number };
  uContourColor: { value: THREE.Vector4 };
  uContourOpacity: { value: number };
  uContourLinesOnly: { value: number };
};

function emptyColorTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeArrayTexture(
  data: Uint16Array,
  width: number,
  height: number,
  depth: number,
): THREE.DataArrayTexture {
  const texture = new THREE.DataArrayTexture(data, width, height, depth);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.HalfFloatType;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createDustTextures(field: LoadedDustField): {
  fieldTex: THREE.DataArrayTexture;
  windTex: THREE.DataArrayTexture;
} {
  return {
    fieldTex: makeArrayTexture(
      field.fieldRgba,
      field.cols,
      field.rows,
      field.frameCount,
    ),
    windTex: makeArrayTexture(
      field.windRgba,
      field.cols,
      field.rows,
      field.frameCount,
    ),
  };
}

function dustCellMeters(field: LoadedDustField): number {
  const row = Math.max(0, Math.min(field.rows - 2, field.rows >> 1));
  const col = Math.max(0, Math.min(field.cols - 2, field.cols >> 1));
  const lat = field.lats[row] ?? 0;
  const dLat = field.rows > 1 ? Math.abs((field.lats[row + 1] ?? lat) - lat) : 0;
  const lon = field.lons[col] ?? 0;
  const dLon = field.cols > 1 ? Math.abs((field.lons[col + 1] ?? lon) - lon) : 0;
  const metersNorth = dLat * 111_320;
  const metersEast = dLon * 111_320 * Math.cos((lat * Math.PI) / 180);
  return Math.max(metersNorth, metersEast, 1);
}

function dustCellStep(
  field: LoadedDustField,
  origin: SceneOrigin,
): THREE.Vector2 {
  const { xs, zs } = localAxes(field, origin);
  const stepX = xs.length > 1 ? (xs[xs.length - 1]! - xs[0]!) / (xs.length - 1) : 1;
  const stepZ = zs.length > 1 ? (zs[zs.length - 1]! - zs[0]!) / (zs.length - 1) : 1;
  return new THREE.Vector2(stepX, stepZ);
}

export function createDustUniforms(
  field: LoadedDustField,
  fieldTex: THREE.DataArrayTexture,
  windTex: THREE.DataArrayTexture,
  origin: SceneOrigin,
): DustUniforms {
  return {
    uField: { value: fieldTex },
    uWind: { value: windTex },
    uFrameA: { value: 0 },
    uFrameB: { value: 0 },
    uFrameMix: { value: 0 },
    uRows: { value: field.rows },
    uCols: { value: field.cols },
    uSignal: { value: 0 },
    uNormMode: { value: 0 },
    uClipLow: { value: 0 },
    uClipHigh: { value: 1 },
    uHeightExponent: { value: 0.65 },
    uMaxHeight: { value: 28000 },
    uTurbulence: { value: 0.22 },
    uWindAmplitude: { value: 450 },
    uWindFrom: { value: 1 },
    uLocked: { value: 0 },
    uTime: { value: 0 },
    uFlat: { value: 0 },
    uBlurCells: { value: 1.5 },
    uPointSize: { value: 2400 },
    uCellMeters: { value: dustCellMeters(field) },
    uMaxPointPixels: { value: 28 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uOpacity: { value: 0.72 },
    uSizeFromIntensity: { value: 0.65 },
    uOpacityFromIntensity: { value: 0.85 },
    uOpacityExponent: { value: 0.8 },
    uGroundOffset: { value: 40 },
    uColor0: { value: new THREE.Vector4(0.96, 0.89, 0.77, 1) },
    uColor1: { value: new THREE.Vector4(0.89, 0.63, 0.29, 1) },
    uColor2: { value: new THREE.Vector4(0.88, 0.42, 0.11, 1) },
    uColor3: { value: new THREE.Vector4(0.48, 0.2, 0.07, 1) },
    uSoftField: { value: emptyColorTexture() },
    uFrost: { value: emptyColorTexture() },
    uReadFrost: { value: 0 },
    uPattern: { value: 0 },
    uPatternSpacing: { value: 8 },
    uPatternStroke: { value: 3 },
    uPatternMeters: { value: 1 },
    uCoverage: { value: 1 },
    uColumnHeight: { value: 0 },
    uCellStep: { value: dustCellStep(field, origin) },
    uContourOn: { value: 0 },
    uContourLog: { value: 1 },
    uContourStep: { value: 5 },
    uContourMajor: { value: 5 },
    uContourWidth: { value: 1.5 },
    uContourStyle: { value: 0 },
    uContourColor: { value: new THREE.Vector4(1, 1, 1, 0.8) },
    uContourOpacity: { value: 0.7 },
    uContourLinesOnly: { value: 0 },
  };
}

export function createDustPointMaterial(
  uniforms: DustUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DUST_POINT_VERTEX,
    fragmentShader: DUST_POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
}

/** Square or hex cells. The root transform mirrors Y, so both sides stay on. */
export function createDustCellMaterial(
  uniforms: DustUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DUST_CELL_VERTEX,
    fragmentShader: DUST_CELL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Columns and terrain hide what is behind them, so they write depth. */
export function setDustSolidDepth(
  material: THREE.ShaderMaterial,
  extruded: boolean,
): void {
  material.depthWrite = extruded;
}

export function createDustTerrainMaterial(
  uniforms: DustUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DUST_TERRAIN_VERTEX,
    fragmentShader: DUST_TERRAIN_FRAGMENT,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export function createDustSoftMaterial(
  uniforms: DustUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DUST_SOFT_VERTEX,
    fragmentShader: DUST_SOFT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export function syncDustUniforms(
  uniforms: DustUniforms,
  field: LoadedDustField,
  settings: DustStormSettings,
  frame: number,
  timeSeconds: number,
  viewportWidth: number,
  viewportHeight: number,
  metersPerPixel: number,
  pixelRatio = 1,
): void {
  const span = Math.max(1, field.frameCount);
  const wrapped = ((frame % span) + span) % span;
  const frameA = Math.floor(wrapped) % span;
  const mix = wrapped - Math.floor(wrapped);
  const frameB = mix < 1e-4 ? frameA : (frameA + 1) % span;
  const table = field.percentiles[settings.signal] ?? field.percentiles.pm10;
  const clipLow = percentileValue(table, settings.lowerPercentile);
  const clipHigh = Math.max(
    percentileValue(table, settings.upperPercentile),
    clipLow + 0.01,
  );
  uniforms.uFrameA.value = frameA;
  uniforms.uFrameB.value = frameB;
  uniforms.uFrameMix.value = frameB === frameA ? 0 : mix;
  uniforms.uSignal.value =
    settings.signal === "coarse" ? 2 : settings.signal === "pm25" ? 1 : 0;
  uniforms.uNormMode.value = settings.normalization === "log" ? 1 : 0;
  uniforms.uClipLow.value = clipLow;
  uniforms.uClipHigh.value = clipHigh;
  uniforms.uHeightExponent.value = settings.heightExponent;
  uniforms.uMaxHeight.value = settings.maxHeightMeters;
  uniforms.uTurbulence.value = settings.turbulence;
  uniforms.uWindAmplitude.value = settings.windAmplitude;
  uniforms.uWindFrom.value = settings.windConvention === "from" ? 1 : 0;
  uniforms.uLocked.value = settings.placement === "locked" ? 1 : 0;
  uniforms.uTime.value = timeSeconds;
  uniforms.uFlat.value = settings.particlesExtruded === false ? 1 : 0;
  uniforms.uBlurCells.value = settings.blurCells;
  uniforms.uPointSize.value = settings.pointSizeMeters;
  uniforms.uMaxPointPixels.value = settings.maxPointPixels;
  uniforms.uViewport.value.set(viewportWidth, viewportHeight);
  uniforms.uOpacity.value = settings.opacity;
  uniforms.uSizeFromIntensity.value = settings.sizeFromIntensity;
  uniforms.uOpacityFromIntensity.value = settings.opacityFromIntensity;
  uniforms.uOpacityExponent.value = settings.opacityExponent;
  uniforms.uColor0.value.set(...hexToUnitRgba(settings.colorLow));
  uniforms.uColor1.value.set(...hexToUnitRgba(settings.colorMid));
  uniforms.uColor2.value.set(...hexToUnitRgba(settings.colorHigh));
  uniforms.uColor3.value.set(...hexToUnitRgba(settings.colorExtreme));
  uniforms.uPattern.value = dustPatternId(settings.pattern);
  uniforms.uPatternSpacing.value = settings.patternSpacing;
  uniforms.uPatternStroke.value = settings.patternStroke;
  uniforms.uPatternMeters.value =
    Number.isFinite(metersPerPixel) && metersPerPixel > 0 ? metersPerPixel : 1;
  uniforms.uCoverage.value = settings.coverage ?? 1;
  uniforms.uColumnHeight.value = settings.heatmapExtruded
    ? settings.heatmapHeightMeters
    : 0;
  const contours = settings.view === "soft" && settings.contourEnabled;
  uniforms.uContourOn.value = contours ? 1 : 0;
  uniforms.uContourLog.value = settings.contourSpacing === "linear" ? 0 : 1;
  uniforms.uContourStep.value = settings.contourStep;
  uniforms.uContourMajor.value = settings.contourMajorEvery;
  uniforms.uContourWidth.value =
    settings.contourWidth *
    (Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1);
  uniforms.uContourStyle.value = DUST_CONTOUR_STYLE_ID[settings.contourStyle] ?? 0;
  uniforms.uContourColor.value.set(...hexToUnitRgba(settings.contourColor));
  uniforms.uContourOpacity.value = settings.contourOpacity;
  uniforms.uContourLinesOnly.value = settings.contourLinesOnly ? 1 : 0;
}

const DUST_CONTOUR_STYLE_ID: Record<DustContourStyle, number> = {
  auto: 0,
  darker: 1,
  lighter: 2,
  custom: 3,
};

const DUST_PATTERN_ID: Record<DustHeatPattern, number> = {
  solid: 0,
  diagonal: 1,
  plus: 2,
  x: 3,
  circle: 4,
  dot: 5,
};

function dustPatternId(pattern: DustHeatPattern): number {
  return DUST_PATTERN_ID[pattern] ?? 0;
}

export function dustTimestampLabel(
  field: LoadedDustField,
  frame: number,
): string {
  if (!field.timestamps.length) return "";
  const span = field.frameCount;
  const wrapped = ((frame % span) + span) % span;
  const index = Math.floor(wrapped) % field.timestamps.length;
  return field.timestamps[index] ?? "";
}
