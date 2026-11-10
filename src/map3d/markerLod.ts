import type { MarkerLodSettings } from "@/lib/types";
import {
  adaptiveScaleFactor,
  applyCollisionScaleCap,
  collisionAwareEnabled,
  type AdaptiveZoomSettings,
} from "@/lib/zoomScaling";

export type { MarkerLodSettings };

export type MarkerLodPartition = {
  full3d: number[];
  lod2d: number[];
};

export const DEFAULT_MARKER_LOD: MarkerLodSettings = {
  enabled: true,
  viewportCoverage: 0.85,
  maxFull3d: 5000,
};

/**
 * Rendered longest-axis size, in CSS pixels, at which a marker steps up.
 * Index 0 is the detailed mesh. The last bucket is everything smaller.
 */
export const GEOMETRY_LOD_MIN_PIXELS = [96, 36] as const;

export function sanitizeMarkerLod(
  value: unknown,
  fallback: MarkerLodSettings = DEFAULT_MARKER_LOD,
): MarkerLodSettings {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Partial<MarkerLodSettings> & { radiusMeters?: unknown })
      : {};
  const coverageRaw =
    typeof raw.viewportCoverage === "number" &&
    Number.isFinite(raw.viewportCoverage)
      ? raw.viewportCoverage
      : fallback.viewportCoverage;
  const maxFull3dRaw =
    typeof raw.maxFull3d === "number" && Number.isFinite(raw.maxFull3d)
      ? Math.round(raw.maxFull3d)
      : fallback.maxFull3d;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    viewportCoverage: Math.min(1, Math.max(0.35, coverageRaw)),
    maxFull3d: Math.min(50_000, Math.max(1, maxFull3dRaw)),
  };
}

/**
 * Ground-meter radius of a screen-space disk covering `coverage` of the
 * shorter canvas side. Scales with zoom via meters-per-pixel.
 */
export function lodRadiusMetersFromViewport(
  coverage: number,
  canvasWidth: number,
  canvasHeight: number,
  metersPerPixel: number,
): number {
  const width = Number.isFinite(canvasWidth) ? Math.max(1, canvasWidth) : 1;
  const height = Number.isFinite(canvasHeight) ? Math.max(1, canvasHeight) : 1;
  const mpp =
    Number.isFinite(metersPerPixel) && metersPerPixel > 0 ? metersPerPixel : 1;
  const fill = Math.min(1, Math.max(0.35, coverage));
  return Math.max(1, fill * 0.5 * Math.min(width, height) * mpp);
}

function pickSpreadCap(
  positions: Array<{ x: number; z: number }>,
  inside: number[],
  insideD2: number[],
  cap: number,
): { full3d: number[]; overflow: number[] } {
  if (inside.length <= cap) {
    return { full3d: inside, overflow: [] };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < inside.length; i++) {
    const p = positions[inside[i]!]!;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const spanX = Math.max(maxX - minX, 1e-3);
  const spanZ = Math.max(maxZ - minZ, 1e-3);
  const n = Math.max(1, Math.ceil(Math.sqrt(cap)));
  const cellCount = n * n;
  const best = new Int32Array(cellCount).fill(-1);
  const bestD2 = new Float64Array(cellCount).fill(Infinity);
  const invX = n / spanX;
  const invZ = n / spanZ;

  for (let i = 0; i < inside.length; i++) {
    const idx = inside[i]!;
    const p = positions[idx]!;
    let col = Math.floor((p.x - minX) * invX);
    let row = Math.floor((p.z - minZ) * invZ);
    if (col < 0) col = 0;
    else if (col >= n) col = n - 1;
    if (row < 0) row = 0;
    else if (row >= n) row = n - 1;
    const cell = row * n + col;
    const d2 = insideD2[i]!;
    if (d2 < bestD2[cell]!) {
      bestD2[cell] = d2;
      best[cell] = idx;
    }
  }

  const picked: number[] = [];
  const pickedD2: number[] = [];
  for (let c = 0; c < cellCount; c++) {
    if (best[c]! >= 0) {
      picked.push(best[c]!);
      pickedD2.push(bestD2[c]!);
    }
  }

  const taken = new Set(picked);
  if (picked.length > cap) {
    const order = picked.map((_, i) => i);
    order.sort((a, b) => pickedD2[a]! - pickedD2[b]!);
    const full3d = new Array<number>(cap);
    taken.clear();
    for (let i = 0; i < cap; i++) {
      const idx = picked[order[i]!]!;
      full3d[i] = idx;
      taken.add(idx);
    }
    const overflow: number[] = [];
    for (const idx of inside) {
      if (!taken.has(idx)) overflow.push(idx);
    }
    return { full3d, overflow };
  }

  if (picked.length < cap) {
    const order = inside.map((_, i) => i);
    order.sort((a, b) => insideD2[a]! - insideD2[b]!);
    for (let i = 0; i < order.length && picked.length < cap; i++) {
      const idx = inside[order[i]!]!;
      if (!taken.has(idx)) {
        taken.add(idx);
        picked.push(idx);
      }
    }
  }

  const overflow: number[] = [];
  for (const idx of inside) {
    if (!taken.has(idx)) overflow.push(idx);
  }
  return { full3d: picked, overflow };
}

/**
 * Split prepared marker indices into nearby full-3D slots and far 2D ticks.
 * The disk is viewport-sized; when it holds more than `maxFull3d`, picks are
 * spread across a grid so the cap does not collapse into a center blob.
 */
export function partitionMarkerLod(
  positions: Array<{ x: number; z: number }>,
  centerX: number,
  centerZ: number,
  settings: MarkerLodSettings,
  radiusMeters: number,
): MarkerLodPartition {
  const count = positions.length;
  if (count === 0) return { full3d: [], lod2d: [] };
  if (!settings.enabled) {
    const all = new Array<number>(count);
    for (let i = 0; i < count; i++) all[i] = i;
    return { full3d: all, lod2d: [] };
  }

  const radius = Math.max(1, radiusMeters);
  const radiusSq = radius * radius;
  const cap = Math.max(1, Math.min(settings.maxFull3d, count));
  const inside: number[] = [];
  const insideD2: number[] = [];
  const lod2d: number[] = [];

  for (let i = 0; i < count; i++) {
    const p = positions[i]!;
    const dx = p.x - centerX;
    const dz = p.z - centerZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= radiusSq) {
      inside.push(i);
      insideD2.push(d2);
    } else {
      lod2d.push(i);
    }
  }

  const picked = pickSpreadCap(positions, inside, insideD2, cap);
  for (const idx of picked.overflow) lod2d.push(idx);
  return { full3d: picked.full3d, lod2d };
}

/** On-screen size after adaptive zoom clamping, in CSS pixels. */
export function renderedMarkerPixels(
  sizeMeters: number,
  metersPerPixel: number,
  adaptive: AdaptiveZoomSettings,
  scaleCap = Number.POSITIVE_INFINITY,
): number {
  if (
    !Number.isFinite(sizeMeters) ||
    sizeMeters <= 0 ||
    !Number.isFinite(metersPerPixel) ||
    metersPerPixel <= 0
  ) {
    return 0;
  }
  const factor = applyCollisionScaleCap(
    adaptiveScaleFactor(sizeMeters, metersPerPixel, adaptive),
    scaleCap,
    collisionAwareEnabled(adaptive),
  );
  return (sizeMeters * factor) / metersPerPixel;
}

/** 0 is the most detailed mesh. The last index is the coarsest. */
export function geometryLodLevel(
  pixels: number,
  thresholds: readonly number[] = GEOMETRY_LOD_MIN_PIXELS,
): number {
  for (let level = 0; level < thresholds.length; level++) {
    if (pixels >= thresholds[level]!) return level;
  }
  return thresholds.length;
}

/** Bucket marker indices by geometry LOD. `levelOf` returns 0 for the finest mesh. */
export function splitIndicesByGeometryLod(
  indices: readonly number[],
  levelOf: (index: number) => number,
  levelCount: number,
): number[][] {
  const count = Math.max(1, levelCount);
  const levels = Array.from({ length: count }, () => [] as number[]);
  for (const index of indices) {
    const raw = levelOf(index);
    const level = Math.min(count - 1, Math.max(0, raw));
    levels[level]!.push(index);
  }
  return levels;
}

/** Quantize the camera cell so pan/zoom does not rewrite instances every pixel. */
export function markerLodKey(
  centerX: number,
  centerZ: number,
  metersPerPixel: number,
  settings: MarkerLodSettings,
  canvasMinPx = 800,
  radiusMeters = 0,
): string {
  const mpp =
    Number.isFinite(metersPerPixel) && metersPerPixel > 0 ? metersPerPixel : 1;
  const cell = Math.max(40, mpp * 8);
  return [
    settings.enabled ? 1 : 0,
    Math.round(settings.viewportCoverage * 100),
    settings.maxFull3d,
    Math.round(centerX / cell),
    Math.round(centerZ / cell),
    Math.round(Math.max(1, canvasMinPx) / 16),
    Math.round(radiusMeters / Math.max(1, mpp * 4)),
    // Screen-size LOD has to refresh as zoom changes, even when the camera
    // center stays inside the same ground cell.
    Math.round(Math.log2(mpp) * 8),
  ].join(":");
}
