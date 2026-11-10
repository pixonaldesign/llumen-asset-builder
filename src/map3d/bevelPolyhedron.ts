import * as THREE from "three";

type TriFace = {
  /** Welded vertex indices (3). */
  verts: [number, number, number];
  normal: THREE.Vector3;
};

type EdgeRec = {
  a: number;
  b: number;
  faces: number[];
};

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function quantize(v: THREE.Vector3, q = 1e6): string {
  return `${Math.round(v.x * q)}:${Math.round(v.y * q)}:${Math.round(v.z * q)}`;
}

/**
 * Weld a triangle mesh into unique vertices + face list with adjacency.
 * Works for indexed or non-indexed BufferGeometry.
 */
function weldTriangles(geometry: THREE.BufferGeometry): {
  positions: THREE.Vector3[];
  faces: TriFace[];
  edges: Map<string, EdgeRec>;
} {
  const posAttr = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const positions: THREE.Vector3[] = [];
  const weld = new Map<string, number>();

  const getWelded = (i: number): number => {
    const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
    const key = quantize(v);
    const existing = weld.get(key);
    if (existing !== undefined) return existing;
    const id = positions.length;
    positions.push(v);
    weld.set(key, id);
    return id;
  };

  const faces: TriFace[] = [];
  const triCount = index ? index.count / 3 : posAttr.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const verts: [number, number, number] = [
      getWelded(i0),
      getWelded(i1),
      getWelded(i2),
    ];
    const a = positions[verts[0]]!;
    const b = positions[verts[1]]!;
    const c = positions[verts[2]]!;
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    if (normal.lengthSq() < 1e-12) continue;
    faces.push({ verts, normal });
  }

  const edges = new Map<string, EdgeRec>();
  for (let fi = 0; fi < faces.length; fi++) {
    const [a, b, c] = faces[fi]!.verts;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(u, v);
      let edge = edges.get(key);
      if (!edge) {
        edge = { a: u, b: v, faces: [] };
        edges.set(key, edge);
      }
      edge.faces.push(fi);
    }
  }

  return { positions, faces, edges };
}

/**
 * Inset a triangular face by `distance` in the face plane.
 * Returns one new point per corner (same order as face.verts).
 */
function insetTriangle(
  positions: THREE.Vector3[],
  face: TriFace,
  distance: number,
): THREE.Vector3[] {
  const [i0, i1, i2] = face.verts;
  const v = [positions[i0]!, positions[i1]!, positions[i2]!];
  const n = face.normal;

  // Face inradius clamp so the inset triangle cannot collapse.
  const e0 = v[1]!.distanceTo(v[2]!);
  const e1 = v[2]!.distanceTo(v[0]!);
  const e2 = v[0]!.distanceTo(v[1]!);
  const area =
    new THREE.Vector3().subVectors(v[1]!, v[0]!).cross(
      new THREE.Vector3().subVectors(v[2]!, v[0]!),
    ).length() * 0.5;
  const inradius = area / Math.max(0.5 * (e0 + e1 + e2), 1e-8);
  const d = Math.min(distance, inradius * 0.45);
  if (d <= 1e-8) return v.map((p) => p.clone());

  const offsetPoint = (a: THREE.Vector3, b: THREE.Vector3): {
    origin: THREE.Vector3;
    dir: THREE.Vector3;
  } => {
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    // Inward offset for CCW faces with outward normals.
    const inward = new THREE.Vector3().crossVectors(n, dir).normalize();
    return {
      origin: new THREE.Vector3().copy(a).addScaledVector(inward, d),
      dir,
    };
  };

  const lines = [
    offsetPoint(v[0]!, v[1]!),
    offsetPoint(v[1]!, v[2]!),
    offsetPoint(v[2]!, v[0]!),
  ];

  const intersect = (
    l0: { origin: THREE.Vector3; dir: THREE.Vector3 },
    l1: { origin: THREE.Vector3; dir: THREE.Vector3 },
  ): THREE.Vector3 => {
    // Closest-point intersection of two skew/planar lines in the face plane.
    const w0 = new THREE.Vector3().subVectors(l0.origin, l1.origin);
    const a = l0.dir.dot(l0.dir);
    const b = l0.dir.dot(l1.dir);
    const c = l1.dir.dot(l1.dir);
    const d0 = l0.dir.dot(w0);
    const e = l1.dir.dot(w0);
    const denom = a * c - b * b;
    const t = Math.abs(denom) > 1e-12 ? (b * e - c * d0) / denom : 0;
    return new THREE.Vector3().copy(l0.origin).addScaledVector(l0.dir, t);
  };

  // Corner i is intersection of offset edges (i-1→i) and (i→i+1).
  return [
    intersect(lines[2]!, lines[0]!),
    intersect(lines[0]!, lines[1]!),
    intersect(lines[1]!, lines[2]!),
  ];
}

function pushTri(
  out: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): void {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

/**
 * True edge bevel / chamfer for a closed convex triangle mesh.
 * Insets each face, fills shared edges with a chamfer strip (optionally rounded),
 * and caps original vertices with polygonal fans — without global subdivision.
 */
export function bevelConvexGeometry(
  geometry: THREE.BufferGeometry,
  amount: number,
  segments = 1,
): THREE.BufferGeometry {
  const distance = Math.max(0, amount);
  if (distance <= 1e-6) {
    return geometry.clone();
  }

  const { positions, faces, edges } = weldTriangles(geometry);
  if (!faces.length) return geometry.clone();

  const segs = Math.max(1, Math.round(segments));
  const insetByFace = faces.map((face) =>
    insetTriangle(positions, face, distance),
  );

  // Per face-corner inset point: faceIndex -> corner 0..2 -> Vector3
  // Also map (face, originalVert) -> inset point for edge/vertex assembly.
  const insetAt = (
    faceIndex: number,
    vertIndex: number,
  ): THREE.Vector3 | null => {
    const face = faces[faceIndex]!;
    const corner = face.verts.indexOf(vertIndex);
    if (corner < 0) return null;
    return insetByFace[faceIndex]![corner]!;
  };

  const tris: number[] = [];

  // 1) Inset faces (kept as triangles).
  for (let fi = 0; fi < faces.length; fi++) {
    const [a, b, c] = insetByFace[fi]!;
    pushTri(tris, a!, b!, c!);
  }

  // 2) Edge chamfer strips between the two adjacent inset edges.
  for (const edge of edges.values()) {
    if (edge.faces.length !== 2) continue;
    const [f0, f1] = edge.faces as [number, number];
    const p0a = insetAt(f0, edge.a);
    const p0b = insetAt(f0, edge.b);
    const p1a = insetAt(f1, edge.a);
    const p1b = insetAt(f1, edge.b);
    if (!p0a || !p0b || !p1a || !p1b) continue;

    const n0 = faces[f0]!.normal;
    const n1 = faces[f1]!.normal;
    const edgeOut = new THREE.Vector3().addVectors(n0, n1).normalize();
    // Round profile height for multi-segment bevels.
    const round = segs > 1 ? distance : 0;

    // Ensure strip winding roughly matches outward edgeOut.
    const mid0 = new THREE.Vector3().addVectors(p0a, p0b).multiplyScalar(0.5);
    const mid1 = new THREE.Vector3().addVectors(p1a, p1b).multiplyScalar(0.5);
    const cross = new THREE.Vector3()
      .subVectors(p0b, p0a)
      .cross(new THREE.Vector3().subVectors(mid1, mid0));
    const flip = cross.dot(edgeOut) < 0;

    const leftA = flip ? p1a : p0a;
    const leftB = flip ? p1b : p0b;
    const rightA = flip ? p0a : p1a;
    const rightB = flip ? p0b : p1b;
    const leftN = flip ? n1 : n0;
    const rightN = flip ? n0 : n1;

    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const sample = (t: number, a: THREE.Vector3, b: THREE.Vector3, nA: THREE.Vector3, nB: THREE.Vector3) => {
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        if (round > 0) {
          const n = new THREE.Vector3().lerpVectors(nA, nB, t).normalize();
          // Arc from face0 → face1 through the outward bisector.
          const lift = Math.sin(Math.PI * t) * round * 0.35;
          p.addScaledVector(n, lift);
        }
        return p;
      };
      // Along the edge direction we lerp the two endpoints; across the chamfer we step t.
      const a0 = sample(t0, leftA, rightA, leftN, rightN);
      const a1 = sample(t1, leftA, rightA, leftN, rightN);
      const b0 = sample(t0, leftB, rightB, leftN, rightN);
      const b1 = sample(t1, leftB, rightB, leftN, rightN);
      pushTri(tris, a0, b0, b1);
      pushTri(tris, a0, b1, a1);
    }
  }

  // 3) Vertex caps: one polygon per original vertex from surrounding inset corners.
  const facesByVert = new Map<number, number[]>();
  for (let fi = 0; fi < faces.length; fi++) {
    for (const vi of faces[fi]!.verts) {
      let list = facesByVert.get(vi);
      if (!list) {
        list = [];
        facesByVert.set(vi, list);
      }
      list.push(fi);
    }
  }

  for (const [vi, faceList] of facesByVert) {
    const center = positions[vi]!;
    const pts: THREE.Vector3[] = [];
    for (const fi of faceList) {
      const p = insetAt(fi, vi);
      if (p) pts.push(p);
    }
    if (pts.length < 3) continue;

    // Order around the outward axis from mesh centroid→vertex (≈ vertex normal).
    const axis = center.clone().normalize();
    const ref = new THREE.Vector3();
    if (Math.abs(axis.y) < 0.9) ref.set(0, 1, 0);
    else ref.set(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(axis, ref).normalize();
    const bitangent = new THREE.Vector3().crossVectors(axis, tangent).normalize();
    pts.sort((p, q) => {
      const dp = new THREE.Vector3().subVectors(p, center);
      const dq = new THREE.Vector3().subVectors(q, center);
      const ap = Math.atan2(dp.dot(bitangent), dp.dot(tangent));
      const aq = Math.atan2(dq.dot(bitangent), dq.dot(tangent));
      return ap - aq;
    });

    for (let i = 1; i < pts.length - 1; i++) {
      pushTri(tris, pts[0]!, pts[i]!, pts[i + 1]!);
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(tris), 3),
  );
  out.computeVertexNormals();
  return out;
}
