import * as THREE from "three";
import type { PreparedMarkerInstance } from "@/lib/instancedMarkers";
import {
  adaptiveScaleFactor,
  applyCollisionScaleCap,
  collisionAwareEnabled,
  type AdaptiveZoomSettings,
} from "@/lib/zoomScaling";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

type TickPoint = { x: number; z: number };

/** Flat isosceles tick in XZ, tip toward +Z to match Kenney GLB forward. */
export const BEARING_TICK_TIP: TickPoint = { x: 0, z: 0.55 };
export const BEARING_TICK_LEFT: TickPoint = { x: -0.32, z: -0.45 };
export const BEARING_TICK_RIGHT: TickPoint = { x: 0.32, z: -0.45 };
export const BEARING_TICK_CORNERS: readonly TickPoint[] = [
  BEARING_TICK_TIP,
  BEARING_TICK_LEFT,
  BEARING_TICK_RIGHT,
];
export const BEARING_TICK_Y = 0.05;
/** CSS-pixel corner radius on the far-tick glyph. */
export const BEARING_TICK_CORNER_RADIUS_PX = 2;
/**
 * Unscaled tick height (1 local unit) is treated as this tall in CSS pixels
 * so a 2px radius stays proportional after instance scale.
 */
export const BEARING_TICK_DESIGN_HEIGHT_PX = 24;
const BEARING_TICK_LOCAL_HEIGHT =
  BEARING_TICK_TIP.z - BEARING_TICK_LEFT.z;
const CORNER_SEGMENTS = 6;

function sub(a: TickPoint, b: TickPoint): TickPoint {
  return { x: a.x - b.x, z: a.z - b.z };
}

function len(a: TickPoint): number {
  return Math.hypot(a.x, a.z);
}

function interiorAngle(prev: TickPoint, v: TickPoint, next: TickPoint): number {
  const toPrev = sub(prev, v);
  const toNext = sub(next, v);
  const lp = len(toPrev);
  const ln = len(toNext);
  const dot = (toPrev.x * toNext.x + toPrev.z * toNext.z) / (lp * ln);
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

/** Largest equal fillet that still fits every edge. */
export function maxEqualFilletRadius(
  corners: readonly TickPoint[] = BEARING_TICK_CORNERS,
): number {
  const n = corners.length;
  const angles = corners.map((v, i) =>
    interiorAngle(
      corners[(i + n - 1) % n]!,
      v,
      corners[(i + 1) % n]!,
    ),
  );
  let maxR = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edge = len(sub(corners[j]!, corners[i]!));
    const denom =
      1 / Math.tan(angles[i]! / 2) + 1 / Math.tan(angles[j]! / 2);
    if (denom > 0) maxR = Math.min(maxR, edge / denom);
  }
  return maxR;
}

export function bearingTickCornerRadiusLocal(
  radiusPx = BEARING_TICK_CORNER_RADIUS_PX,
): number {
  const requested =
    (Math.max(0, radiusPx) / BEARING_TICK_DESIGN_HEIGHT_PX) *
    BEARING_TICK_LOCAL_HEIGHT;
  return Math.min(requested, maxEqualFilletRadius() * 0.92);
}

/** CCW rounded-triangle outline in XZ, tip still the furthest +Z point. */
export function bearingTickContour(
  radius = bearingTickCornerRadiusLocal(),
  segments = CORNER_SEGMENTS,
): TickPoint[] {
  const corners = BEARING_TICK_CORNERS;
  const r = Math.max(0, Math.min(radius, maxEqualFilletRadius(corners) * 0.92));
  if (r < 1e-6) return corners.map((p) => ({ ...p }));

  const n = corners.length;
  const out: TickPoint[] = [];
  for (let i = 0; i < n; i++) {
    const prev = corners[(i + n - 1) % n]!;
    const v = corners[i]!;
    const next = corners[(i + 1) % n]!;
    const toPrev = sub(prev, v);
    const toNext = sub(next, v);
    const invLp = 1 / len(toPrev);
    const invLn = 1 / len(toNext);
    const np = { x: toPrev.x * invLp, z: toPrev.z * invLp };
    const nn = { x: toNext.x * invLn, z: toNext.z * invLn };
    const angle = Math.acos(
      Math.min(1, Math.max(-1, np.x * nn.x + np.z * nn.z)),
    );
    const t = r / Math.tan(angle / 2);
    const tPrev = { x: v.x + np.x * t, z: v.z + np.z * t };
    const tNext = { x: v.x + nn.x * t, z: v.z + nn.z * t };
    const bisX = np.x + nn.x;
    const bisZ = np.z + nn.z;
    const invBis = 1 / Math.hypot(bisX, bisZ);
    const centerDist = r / Math.sin(angle / 2);
    const center = {
      x: v.x + bisX * invBis * centerDist,
      z: v.z + bisZ * invBis * centerDist,
    };
    const start = Math.atan2(tPrev.z - center.z, tPrev.x - center.x);
    const end = Math.atan2(tNext.z - center.z, tNext.x - center.x);
    let sweep = end - start;
    while (sweep < 0) sweep += Math.PI * 2;
    while (sweep >= Math.PI * 2) sweep -= Math.PI * 2;
    const steps = Math.max(1, segments);
    for (let s = 0; s <= steps; s++) {
      const a = start + (sweep * s) / steps;
      out.push({
        x: center.x + r * Math.cos(a),
        z: center.z + r * Math.sin(a),
      });
    }
  }
  return out;
}

function signArea(
  a: TickPoint,
  b: TickPoint,
  c: TickPoint,
): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

export function pointInBearingTick(
  point: TickPoint,
  corners: readonly TickPoint[] = BEARING_TICK_CORNERS,
): boolean {
  const [a, b, c] = corners;
  if (!a || !b || !c) return false;
  const s1 = signArea(a, b, point);
  const s2 = signArea(b, c, point);
  const s3 = signArea(c, a, point);
  const hasNeg = s1 < -1e-9 || s2 < -1e-9 || s3 < -1e-9;
  const hasPos = s1 > 1e-9 || s2 > 1e-9 || s3 > 1e-9;
  return !(hasNeg && hasPos);
}

/** Flat isosceles tick in XZ, tip toward +Z to match Kenney GLB forward. */
export function createBearingTriangleGeometry(
  cornerRadiusPx = BEARING_TICK_CORNER_RADIUS_PX,
): THREE.BufferGeometry {
  const contour = bearingTickContour(
    bearingTickCornerRadiusLocal(cornerRadiusPx),
  );
  let cx = 0;
  let cz = 0;
  for (const p of contour) {
    cx += p.x;
    cz += p.z;
  }
  cx /= contour.length;
  cz /= contour.length;

  const positions: number[] = [];
  const y = BEARING_TICK_Y;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i]!;
    const b = contour[(i + 1) % contour.length]!;
    positions.push(cx, y, cz, a.x, y, a.z, b.x, y, b.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function createBearingTriangleMaterial(
  color: string,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: true,
    depthTest: true,
  });
}

export function createBearingTriangleMesh(
  material: THREE.MeshBasicMaterial,
  capacity: number,
  useInstanceColor: boolean,
): THREE.InstancedMesh | null {
  if (capacity <= 0) return null;
  const geometry = createBearingTriangleGeometry();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.useInstanceColor = useInstanceColor;
  if (useInstanceColor) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    );
  }
  mesh.count = 0;
  return mesh;
}

export function disposeBearingTriangles(mesh: THREE.InstancedMesh | null): void {
  if (!mesh) return;
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
  mesh.parent?.remove(mesh);
}

export function writeBearingTriangles(
  mesh: THREE.InstancedMesh,
  prepared: readonly PreparedMarkerInstance[],
  indices: readonly number[],
  zoom: AdaptiveZoomSettings & { metersPerPixel: number },
): void {
  const maxCount = mesh.instanceMatrix.count;
  const count = Math.min(indices.length, maxCount);
  const useInstanceColor = Boolean(mesh.userData.useInstanceColor);

  for (let slot = 0; slot < count; slot++) {
    const item = prepared[indices[slot]!]!;
    const factor = applyCollisionScaleCap(
      adaptiveScaleFactor(
        item.adaptiveSize,
        zoom.metersPerPixel,
        zoom,
      ),
      item.scaleCap,
      collisionAwareEnabled(zoom),
    );
    const sx = Math.max(item.sx * factor, 0.5);
    const sz = Math.max(item.sz * factor, 0.5);
    _dummy.position.set(item.x, item.y, item.z);
    _dummy.scale.set(sx, 1, sz);
    _dummy.rotation.set(0, item.yaw, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(slot, _dummy.matrix);
    if (useInstanceColor) {
      _color.setRGB(item.colorR, item.colorG, item.colorB);
      mesh.setColorAt(slot, _color);
    }
  }

  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
