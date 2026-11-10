/** Deterministic 0–1 hash so rebuilds with the same range keep stable values. */
function hash01(index: number): number {
  const n = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/** Clamp and order a min/max opacity pair into [0, 1]. */
export function normalizeOpacityRange(
  min: number,
  max: number,
): { min: number; max: number } {
  const lo = Number.isFinite(min) ? min : 1;
  const hi = Number.isFinite(max) ? max : 1;
  return {
    min: Math.min(1, Math.max(0, Math.min(lo, hi))),
    max: Math.min(1, Math.max(0, Math.max(lo, hi))),
  };
}

/**
 * Per-feature opacity in [min, max]. Identical min/max yields a constant;
 * otherwise a stable pseudo-random sample keyed by feature index.
 */
export function sampleFeatureOpacity(
  index: number,
  min: number,
  max: number,
): number {
  const range = normalizeOpacityRange(min, max);
  if (range.max - range.min < 1e-8) return range.min;
  return range.min + hash01(index) * (range.max - range.min);
}
