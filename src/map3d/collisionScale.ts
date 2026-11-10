/**
 * Max uniform scale a ground footprint can take before it collides with a
 * neighbor. Adaptive zoom uses this to grow isolated markers while leaving
 * clustered vehicles at a size that still fits the road.
 *
 * Positions are static, so the cap is independent of zoom: at any zoom the
 * shader takes min(desiredAdaptiveFactor, max(1, cap)).
 */

export const UNLIMITED_COLLISION_SCALE_CAP = 1_000_000;
/** Extra meters on each half-extent so scaled markers keep a small visual gap. */
export const COLLISION_FOOTPRINT_PADDING_METERS = 0.2;
const MAX_SEARCH_METERS = 4000;

export type CollisionScaleItem = {
  x: number;
  z: number;
  yaw: number;
  hx: number;
  hz: number;
};

/**
 * Largest uniform scale at which two oriented ground boxes stay disjoint.
 * Uses 2D SAT on the box axes; already-overlapping pairs return < 1.
 */
export function pairUniformScaleCap(
  a: CollisionScaleItem,
  b: CollisionScaleItem,
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx * dx + dz * dz < 1e-20) return 0;

  const aCos = Math.cos(a.yaw);
  const aSin = Math.sin(a.yaw);
  const bCos = Math.cos(b.yaw);
  const bSin = Math.sin(b.yaw);
  const aRx = aCos;
  const aRz = -aSin;
  const aFx = aSin;
  const aFz = aCos;
  const bRx = bCos;
  const bRz = -bSin;
  const bFx = bSin;
  const bFz = bCos;

  const axisCap = (nx: number, nz: number): number => {
    const projDist = Math.abs(dx * nx + dz * nz);
    const radii =
      Math.abs(nx * aRx + nz * aRz) * a.hx +
      Math.abs(nx * aFx + nz * aFz) * a.hz +
      Math.abs(nx * bRx + nz * bRz) * b.hx +
      Math.abs(nx * bFx + nz * bFz) * b.hz;
    if (radii < 1e-12) return 0;
    return projDist / radii;
  };

  // Disjoint while any axis still separates. The last separating axis is the
  // one with the largest scale-to-touch, so the pair cap is a max, not a min.
  return Math.max(
    axisCap(aRx, aRz),
    axisCap(aFx, aFz),
    axisCap(bRx, bRz),
    axisCap(bFx, bFz),
  );
}

/** Per-item max uniform scale before the closest neighbor footprint collides. */
export function collisionScaleCaps(
  items: readonly CollisionScaleItem[],
): Float32Array {
  const n = items.length;
  const caps = new Float32Array(n);
  caps.fill(UNLIMITED_COLLISION_SCALE_CAP);
  if (n < 2) return caps;

  const radii = new Float64Array(n);
  let maxRadius = 1e-4;
  for (let i = 0; i < n; i++) {
    const item = items[i]!;
    const radius = Math.max(Math.hypot(item.hx, item.hz), 1e-4);
    radii[i] = radius;
    if (radius > maxRadius) maxRadius = radius;
  }

  const cellSize = Math.max(16, maxRadius * 4);
  const grid = new Map<string, number[]>();
  const cellCoord = (value: number) => Math.floor(value / cellSize);
  const cellKey = (ix: number, iz: number) => `${ix}:${iz}`;

  for (let i = 0; i < n; i++) {
    const item = items[i]!;
    const key = cellKey(cellCoord(item.x), cellCoord(item.z));
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  const maxRings = Math.max(1, Math.ceil(MAX_SEARCH_METERS / cellSize));

  for (let i = 0; i < n; i++) {
    const a = items[i]!;
    const aRadius = radii[i]!;
    const originIx = cellCoord(a.x);
    const originIz = cellCoord(a.z);
    let cap = UNLIMITED_COLLISION_SCALE_CAP;

    for (let ring = 0; ring <= maxRings; ring++) {
      if (ring >= 1 && ring * cellSize >= cap * (aRadius + maxRadius)) {
        break;
      }

      if (ring === 0) {
        const bucket = grid.get(cellKey(originIx, originIz));
        if (bucket) {
          for (const j of bucket) {
            if (j === i) continue;
            const pair = pairUniformScaleCap(a, items[j]!);
            if (pair < cap) cap = pair;
          }
        }
        continue;
      }

      for (let diz = -ring; diz <= ring; diz++) {
        for (let dix = -ring; dix <= ring; dix++) {
          if (Math.max(Math.abs(dix), Math.abs(diz)) !== ring) continue;
          const bucket = grid.get(cellKey(originIx + dix, originIz + diz));
          if (!bucket) continue;
          for (const j of bucket) {
            const pair = pairUniformScaleCap(a, items[j]!);
            if (pair < cap) cap = pair;
          }
        }
      }
    }

    caps[i] = cap;
  }

  return caps;
}
