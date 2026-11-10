/**
 * Pointy-top hex lattice, after d3-hexbin. Odd rows shift half a hex east.
 * Works in any planar meters; callers pass local scene x and z.
 * d3 compares candidate distances in lattice units, where x and y have
 * different scales, so points near an edge can land in the farther hex.
 * Here the comparison uses true distance.
 */

const THIRD_PI = Math.PI / 3;
export const HEX_DIST_X = 2 * Math.sin(THIRD_PI);
export const HEX_DIST_Y = 1.5;

export function pointToHexbin(
  px: number,
  py: number,
  radius: number,
): [number, number] {
  const py1 = py / radius / HEX_DIST_Y;
  let pj = Math.round(py1);
  const px1 = px / radius / HEX_DIST_X - (pj & 1) / 2;
  let pi = Math.round(px1);
  const dy = py1 - pj;
  if (Math.abs(dy) * 3 > 1) {
    const dx = px1 - pi;
    const pi2 = pi + (px1 < pi ? -0.5 : 0.5);
    const pj2 = pj + (py1 < pj ? -1 : 1);
    const dx2 = px1 - pi2;
    const dy2 = py1 - pj2;
    const sx = HEX_DIST_X * HEX_DIST_X;
    const sy = HEX_DIST_Y * HEX_DIST_Y;
    if (dx * dx * sx + dy * dy * sy > dx2 * dx2 * sx + dy2 * dy2 * sy) {
      pi = pi2 + (pj & 1 ? 0.5 : -0.5);
      pj = pj2;
    }
  }
  return [pi + 0, pj + 0];
}

export function hexCentroid(
  i: number,
  j: number,
  radius: number,
): [number, number] {
  return [(i + (j & 1 ? 0.5 : 0)) * radius * HEX_DIST_X, j * radius * HEX_DIST_Y];
}

/** Hex lattice over a rectangular grid. Texel (i - iMin, j - jMin) holds hex (i, j). */
export type HexLayout = {
  radius: number;
  width: number;
  height: number;
  iMin: number;
  jMin: number;
  /** Texel index per grid cell (row-major, rows × cols). */
  cellToTexel: Int32Array;
  /** Grid cells per texel. 0 means no cell center fell inside that hex. */
  counts: Uint32Array;
};

export function buildHexLayout(
  xs: ArrayLike<number>,
  zs: ArrayLike<number>,
  radius: number,
): HexLayout {
  const cols = xs.length;
  const rows = zs.length;
  const hexI = new Int32Array(rows * cols);
  const hexJ = new Int32Array(rows * cols);
  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const [i, j] = pointToHexbin(xs[col]!, zs[row]!, radius);
      const cell = row * cols + col;
      hexI[cell] = i;
      hexJ[cell] = j;
      if (i < iMin) iMin = i;
      if (i > iMax) iMax = i;
      if (j < jMin) jMin = j;
      if (j > jMax) jMax = j;
    }
  }
  if (rows * cols === 0) {
    return {
      radius,
      width: 0,
      height: 0,
      iMin: 0,
      jMin: 0,
      cellToTexel: new Int32Array(0),
      counts: new Uint32Array(0),
    };
  }
  const width = iMax - iMin + 1;
  const height = jMax - jMin + 1;
  const cellToTexel = new Int32Array(rows * cols);
  const counts = new Uint32Array(width * height);
  for (let cell = 0; cell < rows * cols; cell += 1) {
    const texel = (hexJ[cell]! - jMin) * width + (hexI[cell]! - iMin);
    cellToTexel[cell] = texel;
    counts[texel]! += 1;
  }
  return { radius, width, height, iMin, jMin, cellToTexel, counts };
}

/**
 * Mean of each channel over the grid cells inside each hex, per frame.
 * Means, not sums: a bigger hex covers more cells but must not read hotter.
 */
export function averageIntoHexes(
  layout: HexLayout,
  cellValues: ArrayLike<number>,
  frames: number,
  channels: number,
): Float32Array {
  const cells = layout.cellToTexel.length;
  const texels = layout.width * layout.height;
  const out = new Float32Array(frames * texels * channels);
  for (let frame = 0; frame < frames; frame += 1) {
    const src = frame * cells * channels;
    const dst = frame * texels * channels;
    for (let cell = 0; cell < cells; cell += 1) {
      const texel = layout.cellToTexel[cell]!;
      for (let c = 0; c < channels; c += 1) {
        out[dst + texel * channels + c]! += cellValues[src + cell * channels + c]!;
      }
    }
    for (let texel = 0; texel < texels; texel += 1) {
      const count = layout.counts[texel]!;
      if (count === 0) continue;
      for (let c = 0; c < channels; c += 1) {
        out[dst + texel * channels + c]! /= count;
      }
    }
  }
  return out;
}
