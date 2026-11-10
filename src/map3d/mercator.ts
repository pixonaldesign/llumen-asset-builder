import mapboxgl from "mapbox-gl";
import * as THREE from "three";

export type SceneOrigin = {
  lng: number;
  lat: number;
  altitude: number;
  mercator: mapboxgl.MercatorCoordinate;
  meterScale: number;
};

export function createSceneOrigin(
  lng: number,
  lat: number,
  altitude = 0,
): SceneOrigin {
  const mercator = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, altitude);
  return {
    lng,
    lat,
    altitude,
    mercator,
    meterScale: mercator.meterInMercatorCoordinateUnits(),
  };
}

/** Local meters relative to origin (Three Y-up after root transform). */
export function lngLatToLocalMeters(
  origin: SceneOrigin,
  lng: number,
  lat: number,
  altitudeMeters = 0,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const mc = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, altitudeMeters);
  return mercatorToLocalMeters(origin, mc, target);
}

/** Convert a Mercator coordinate into the scene's local Y-up meters. */
export function mercatorToLocalMeters(
  origin: SceneOrigin,
  mc: { x: number; y: number; z?: number },
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const s = origin.meterScale;
  const dx = (mc.x - origin.mercator.x) / s;
  const dy = (mc.y - origin.mercator.y) / s;
  const dz = ((mc.z ?? 0) - (origin.mercator.z ?? 0)) / s;
  // Root transform maps Three (x,y,z) → mercator (x, z, y)
  return target.set(dx, dz, dy);
}

/**
 * Mapbox camera position in the Three scene's local meters.
 * Needed for view-dependent shading (fresnel rim) because the custom layer
 * only sets a combined projection matrix — Three's viewDir is otherwise wrong.
 */
export function mapCameraToLocalMeters(
  map: mapboxgl.Map,
  origin: SceneOrigin,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const pos = map.getFreeCameraOptions().position;
  if (pos) {
    return mercatorToLocalMeters(origin, pos, target);
  }
  const c = map.getCenter();
  // Rough fallback: elevated above map center
  return lngLatToLocalMeters(origin, c.lng, c.lat, 1000, target);
}

export type ViewportGroundFootprint = {
  center: THREE.Vector3;
  width: number;
  depth: number;
  key: string;
  skipReason: "viewport-too-large" | null;
};

export type GroundFootprintOptions = {
  padding: number;
  minExtent: number;
  maxExtent: number;
};

/** Pure footprint calculation used by runtime code and unit tests. */
export function footprintFromLngLats(
  origin: SceneOrigin,
  points: Array<{ lng: number; lat: number }>,
  options: GroundFootprintOptions,
): ViewportGroundFootprint {
  const local = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    lngLatToLocalMeters(origin, point.lng, point.lat, 0, local);
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minZ = Math.min(minZ, local.z);
    maxZ = Math.max(maxZ, local.z);
  }

  if (!Number.isFinite(minX)) {
    return {
      center: new THREE.Vector3(),
      width: options.minExtent,
      depth: options.minExtent,
      key: "empty",
      skipReason: null,
    };
  }

  const padding = Math.max(0, options.padding);
  const rawWidth = Math.max(options.minExtent, maxX - minX);
  const rawDepth = Math.max(options.minExtent, maxZ - minZ);
  const width = rawWidth * (1 + padding * 2);
  const depth = rawDepth * (1 + padding * 2);
  const center = new THREE.Vector3(
    (minX + maxX) * 0.5,
    0,
    (minZ + maxZ) * 0.5,
  );
  const maxDimension = Math.max(width, depth);
  const quantum = Math.max(10, maxDimension / 128);
  const key = [
    Math.round(center.x / quantum),
    Math.round(center.z / quantum),
    Math.round(width / quantum),
    Math.round(depth / quantum),
  ].join(":");

  return {
    center,
    width,
    depth,
    key,
    skipReason:
      maxDimension > Math.max(options.minExtent, options.maxExtent)
        ? "viewport-too-large"
        : null,
  };
}

/** Sample the current Mapbox viewport and return its local-meter ground AABB. */
export function viewportGroundFootprint(
  map: mapboxgl.Map,
  origin: SceneOrigin,
  options: GroundFootprintOptions,
): ViewportGroundFootprint {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const samples = [
    [0, 0],
    [width * 0.5, 0],
    [width, 0],
    [width, height * 0.5],
    [width, height],
    [width * 0.5, height],
    [0, height],
    [0, height * 0.5],
    [width * 0.5, height * 0.5],
  ] as const;
  return footprintFromLngLats(
    origin,
    samples.map(([x, y]) => map.unproject([x, y])),
    options,
  );
}

export function buildModelTransformMatrix(origin: SceneOrigin): THREE.Matrix4 {
  const rotateX = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2,
  );
  const scale = origin.meterScale;
  return new THREE.Matrix4()
    .makeTranslation(origin.mercator.x, origin.mercator.y, origin.mercator.z ?? 0)
    .scale(new THREE.Vector3(scale, -scale, scale))
    .multiply(rotateX);
}
