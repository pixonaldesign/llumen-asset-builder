/** Pure dust-storm field math. The shader repeats these formulas. */

export type NormalizationMode = "percentile-power" | "log";

export type PercentileTable = {
  levels: number[];
  values: number[];
};

export type DustSignal = "pm10" | "pm25" | "coarse";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Coarse particulate mass. Not a mineral-dust measurement. */
export function coarsePm(pm10: number, pm25: number): number {
  if (!Number.isFinite(pm10) || !Number.isFinite(pm25)) return 0;
  return Math.max(pm10 - pm25, 0);
}

export function percentileValue(
  table: PercentileTable,
  percentile: number,
): number {
  const levels = table.levels;
  const values = table.values;
  if (!levels.length || levels.length !== values.length) return 0;
  const p = Math.min(100, Math.max(0, percentile));
  if (p <= levels[0]!) return values[0]!;
  const last = levels.length - 1;
  if (p >= levels[last]!) return values[last]!;
  for (let i = 1; i < levels.length; i += 1) {
    const hi = levels[i]!;
    if (p <= hi) {
      const lo = levels[i - 1]!;
      const span = hi - lo;
      const t = span === 0 ? 0 : (p - lo) / span;
      return values[i - 1]! + t * (values[i]! - values[i - 1]!);
    }
  }
  return values[last]!;
}

/**
 * Map a raw concentration into 0..1.
 * Percentile mode clips to [clipLow, clipHigh]. Log mode uses the same
 * window in log space so a few spikes do not flatten the field.
 */
export function normalizeIntensity(
  raw: number,
  clipLow: number,
  clipHigh: number,
  mode: NormalizationMode,
): number {
  if (!Number.isFinite(raw)) return 0;
  const hi = Math.max(clipHigh, clipLow + 1e-4);
  if (mode === "log") {
    const lo = Math.log(Math.max(clipLow, 1e-3));
    const high = Math.log(Math.max(hi, Math.exp(lo) + 1e-3));
    const span = high - lo;
    if (span <= 0) return 0;
    return clamp01((Math.log(Math.max(raw, 1e-3)) - lo) / span);
  }
  return clamp01((raw - clipLow) / (hi - clipLow));
}

/** Visual height in scene meters. The exponent lifts mid values into the wall. */
export function heightFromIntensity(
  normalized: number,
  exponent: number,
  maxHeightMeters: number,
): number {
  const curve = Number.isFinite(exponent) ? exponent : 1;
  return Math.pow(clamp01(normalized), curve) * Math.max(0, maxHeightMeters);
}

export function windComponents(degrees: number): { sin: number; cos: number } {
  const radians = (degrees * Math.PI) / 180;
  return { sin: Math.sin(radians), cos: Math.cos(radians) };
}

/**
 * Mix two wind directions as vectors so 359° → 1° stays near north.
 * The result is renormalized. Degrees are clockwise from north.
 */
export function mixWindVectors(
  aSin: number,
  aCos: number,
  bSin: number,
  bCos: number,
  t: number,
): { sin: number; cos: number; degrees: number } {
  const mix = Math.min(1, Math.max(0, t));
  const s = aSin * (1 - mix) + bSin * mix;
  const c = aCos * (1 - mix) + bCos * mix;
  const len = Math.hypot(s, c);
  const sin = len > 1e-8 ? s / len : 0;
  const cos = len > 1e-8 ? c / len : 1;
  let degrees = (Math.atan2(sin, cos) * 180) / Math.PI;
  if (degrees < 0) degrees += 360;
  return { sin, cos, degrees };
}

/** Meteorological "from" is the opposite of the direction particles drift toward. */
export function windTravelVector(
  sin: number,
  cos: number,
  convention: "from" | "to",
): { sin: number; cos: number } {
  return convention === "from" ? { sin: -sin, cos: -cos } : { sin, cos };
}

/**
 * A filled rectangle. 8 particles are 4×2, not a 3×3 with a hole.
 * A count that cannot tile (5, 7) steps up to the next square so no slot is empty.
 */
export function latticeShape(count: number): { columns: number; rows: number } {
  const n = Math.max(1, Math.round(count));
  let columns = 1;
  let rows = n;
  let best = n;
  for (let candidate = 1; candidate <= n; candidate += 1) {
    if (n % candidate !== 0) continue;
    const nextRows = n / candidate;
    const score = Math.abs(candidate - nextRows);
    if (score < best) {
      best = score;
      columns = candidate;
      rows = nextRows;
    }
  }
  if (columns === 1 && n > 1) {
    const side = Math.ceil(Math.sqrt(n));
    return { columns: side, rows: side };
  }
  return { columns, rows };
}

export function latticeCount(count: number): number {
  const { columns, rows } = latticeShape(count);
  return columns * rows;
}

/** Unit position inside a cell. Every slot of the rectangle is occupied. */
export function latticeUnit(index: number, count: number): [number, number] {
  const { columns, rows } = latticeShape(count);
  const n = columns * rows;
  const i = ((Math.round(index) % n) + n) % n;
  const col = i % columns;
  const row = Math.floor(i / columns);
  return [(col + 0.5) / columns, (row + 0.5) / rows];
}

/** `#rgb`, `#rrggbb`, and `#rrggbbaa`. A missing alpha is opaque. */
export function hexToUnitRgba(
  hex: string,
): [number, number, number, number] {
  const body = hex.trim().replace("#", "");
  const full =
    body.length === 3 || body.length === 4
      ? body
          .split("")
          .map((char) => char + char)
          .join("")
      : body;
  if (full.length !== 6 && full.length !== 8) return [1, 1, 1, 1];
  const rgb = Number.parseInt(full.slice(0, 6), 16);
  const alpha =
    full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  if (!Number.isFinite(rgb) || !Number.isFinite(alpha)) return [1, 1, 1, 1];
  return [
    ((rgb >> 16) & 255) / 255,
    ((rgb >> 8) & 255) / 255,
    (rgb & 255) / 255,
    Math.min(1, Math.max(0, alpha)),
  ];
}

/** IEEE binary16 → number. Used to check the baked frame stack. */
export function decodeHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exp = (bits >> 10) & 0x1f;
  const frac = bits & 0x3ff;
  if (exp === 0) {
    if (frac === 0) return sign * 0;
    return sign * 2 ** -14 * (frac / 1024);
  }
  if (exp === 31) return frac === 0 ? sign * Infinity : Number.NaN;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}
