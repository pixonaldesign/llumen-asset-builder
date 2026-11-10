import * as THREE from "three";

/**
 * Convert navigation bearing (degrees clockwise from north) to Three.js Y yaw
 * for Kenney-style GLB markers whose local forward is +Z.
 *
 * Local scene axes after the Mapbox root transform: +X east, +Y up, +Z south.
 */
export function yawFromBearingDegrees(bearingDegrees: number): number {
  const bearingRad = THREE.MathUtils.degToRad(bearingDegrees);
  return Math.PI - bearingRad;
}

/** Read a finite bearing/heading from feature properties, if present. */
export function bearingFromProperties(
  properties: Record<string, unknown>,
  propertyNames: readonly string[] = ["bearing", "heading"],
): number | null {
  for (const key of propertyNames) {
    const raw = properties[key];
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : NaN;
    if (Number.isFinite(n)) return ((n % 360) + 360) % 360;
  }
  return null;
}
