import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { bevelConvexGeometry } from "@/lib/bevelPolyhedron";
import { isGeometricPrimitive } from "@/lib/modelCatalog";
import type {
  GeometricPrimitive,
  GeometryQuality,
  PrimitiveType,
} from "@/lib/types";

const QUALITY: Record<
  GeometryQuality,
  { defaultBevelSegments: number }
> = {
  low: { defaultBevelSegments: 1 },
  medium: { defaultBevelSegments: 4 },
  high: { defaultBevelSegments: 8 },
};

/** Blender Ico Sphere subdivisions 1–6 → Three.js IcosahedronGeometry detail 0–5. */
export function blenderIcoSubdivToDetail(subdivisions: number): number {
  return Math.max(0, Math.min(5, Math.round(subdivisions) - 1));
}

/**
 * Orient an icosahedron so a single vertex points along +Y (pointy top),
 * perpendicular to the ground plane — matching Blender's default Ico Sphere sit.
 */
function orientIcosahedronVertexUp(geometry: THREE.BufferGeometry): void {
  const t = (1 + Math.sqrt(5)) / 2;
  // Canonical icosahedron vertex used by Three.js layout; bring it to +Y.
  const from = new THREE.Vector3(0, 1, t).normalize();
  const to = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(from, to);
  geometry.applyQuaternion(quat);
}

/** Faceted look: unique per-face normals instead of shared smooth vertices. */
function toFaceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return faceted;
}

/**
 * Edge-bevel a polyhedron in local mesh space, then sit it on y=0.
 * `bevelSize` is a fraction of the local radius (0.5 → diameter 1).
 */
function buildBeveledPolyhedron(
  base: THREE.BufferGeometry,
  bevelSize: number,
  bevelSegments: number,
): THREE.BufferGeometry {
  const amount = Math.min(0.2, Math.max(0, bevelSize) * 0.5);
  const beveled = bevelConvexGeometry(base, amount, bevelSegments);
  base.dispose();
  beveled.translate(0, 0.5, 0);
  return beveled;
}

export type PrimitiveGeometryOptions = {
  quality: GeometryQuality;
  icosphereSubdivisions?: number;
  bevelEnabled?: boolean;
  bevelSize?: number;
  bevelSegments?: number;
};

export type PrimitiveCapabilities = {
  label: string;
  edgeTreatment: "world-bevel" | "edge-bevel";
  edgeLabel: string;
  radiusLabel: string;
  segmentsLabel: string;
  supportsBevelRadius: boolean;
};

export const PRIMITIVE_CAPABILITIES: Record<
  GeometricPrimitive,
  PrimitiveCapabilities
> = {
  pillar: {
    label: "Pillars (cubes)",
    edgeTreatment: "world-bevel",
    edgeLabel: "World-space bevel",
    radiusLabel: "Radius (fraction of width)",
    segmentsLabel: "Bevel segments",
    supportsBevelRadius: true,
  },
  icosphere: {
    label: "Icospheres",
    edgeTreatment: "edge-bevel",
    edgeLabel: "Edge bevel",
    radiusLabel: "Bevel width",
    segmentsLabel: "Bevel segments",
    supportsBevelRadius: true,
  },
  octahedron: {
    label: "Octahedrons",
    edgeTreatment: "edge-bevel",
    edgeLabel: "Edge bevel",
    radiusLabel: "Bevel width",
    segmentsLabel: "Bevel segments",
    supportsBevelRadius: true,
  },
};

export function primitiveUsesWorldBevel(type: PrimitiveType): boolean {
  return (
    isGeometricPrimitive(type) &&
    PRIMITIVE_CAPABILITIES[type].edgeTreatment === "world-bevel"
  );
}

export type PointBevelSettings = {
  enabled: boolean;
  size: number;
  segments: number;
};

/** Resolve the bevel settings that belong to the active point primitive. */
export function pointBevelFromConfig(config: {
  primitive: PrimitiveType;
  bevelEnabled: boolean;
  bevelSize: number;
  bevelSegments: number;
  icosphereBevelEnabled: boolean;
  icosphereBevelSize: number;
  icosphereBevelSegments: number;
  octahedronBevelEnabled: boolean;
  octahedronBevelSize: number;
  octahedronBevelSegments: number;
}): PointBevelSettings {
  if (!isGeometricPrimitive(config.primitive)) {
    return { enabled: false, size: 0, segments: 1 };
  }
  if (config.primitive === "icosphere") {
    return {
      enabled: config.icosphereBevelEnabled,
      size: config.icosphereBevelSize,
      segments: config.icosphereBevelSegments,
    };
  }
  if (config.primitive === "octahedron") {
    return {
      enabled: config.octahedronBevelEnabled,
      size: config.octahedronBevelSize,
      segments: config.octahedronBevelSegments,
    };
  }
  return {
    enabled: config.bevelEnabled,
    size: config.bevelSize,
    segments: config.bevelSegments,
  };
}

export function createPrimitiveGeometry(
  type: GeometricPrimitive,
  options: PrimitiveGeometryOptions,
): THREE.BufferGeometry {
  const q = QUALITY[options.quality];
  const bevelEnabled = options.bevelEnabled ?? false;
  const bevelSize = Math.min(0.49, Math.max(0, options.bevelSize ?? 0));
  const bevelSegments = Math.max(
    1,
    Math.round(options.bevelSegments ?? q.defaultBevelSegments),
  );
  const useEdgeBevel = bevelEnabled && bevelSize > 1e-4;

  switch (type) {
    case "pillar": {
      if (bevelEnabled && bevelSize > 1e-4) {
        // Canonical rounded cube. The shader removes this template radius and
        // reapplies the per-instance radius after sizing (world-space bevel).
        return new RoundedBoxGeometry(1, 1, 1, bevelSegments, 0.25);
      }
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      return g;
    }
    case "icosphere": {
      const detail = blenderIcoSubdivToDetail(
        options.icosphereSubdivisions ?? 1,
      );
      let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, detail);
      orientIcosahedronVertexUp(g);
      if (useEdgeBevel) {
        return buildBeveledPolyhedron(g, bevelSize, bevelSegments);
      }
      g = toFaceted(g);
      g.translate(0, 0.5, 0);
      return g;
    }
    case "octahedron": {
      let g: THREE.BufferGeometry = new THREE.OctahedronGeometry(0.5, 0);
      if (useEdgeBevel) {
        return buildBeveledPolyhedron(g, bevelSize, bevelSegments);
      }
      g = toFaceted(g);
      g.translate(0, 0.5, 0);
      return g;
    }
  }
}
