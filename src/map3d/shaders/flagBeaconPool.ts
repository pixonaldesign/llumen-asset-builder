import {
  ADAPTIVE_POINT_COLLISION_DECLARATIONS,
  ADAPTIVE_SCALE_VERTEX_DECLARATIONS,
} from "@/lib/shaders/adaptiveScale";

/**
 * World-space contact light on the top of the form. A flat disc foreshortens
 * with the camera so the screen-space beacon stem reads as lighting the cap.
 */

export const FLAG_BEACON_POOL_VERTEX = /* glsl */ `
${ADAPTIVE_SCALE_VERTEX_DECLARATIONS}
${ADAPTIVE_POINT_COLLISION_DECLARATIONS}

attribute vec3 auraColor;
attribute float auraPhase;

uniform float uObjectTop;
uniform float uPillarRadius;
uniform float uPoolRadiusScale;
uniform float uPoolLift;

varying vec3 vColor;
varying float vPhase;
varying float vRadial;

void main() {
  float factor = collisionAwareAdaptiveScaleFactorFor(adaptiveScaleSize);
  float objectTop = max(uObjectTop, 0.05);
  float poolR = max(uPillarRadius, 0.05) * max(uPoolRadiusScale, 0.05);
  // CircleGeometry lies in XY; createFlagBeaconPoolMesh rotates it into XZ.
  vec3 local = vec3(
    position.x * poolR,
    objectTop + max(uPoolLift, 0.0),
    position.z * poolR
  ) * factor;

  vec4 world = vec4(local, 1.0);
  #ifdef USE_INSTANCING
    world = instanceMatrix * world;
  #endif

  vRadial = length(position.xz);
  vColor = auraColor;
  vPhase = auraPhase;
  gl_Position = projectionMatrix * modelViewMatrix * world;
}
`;

export const FLAG_BEACON_POOL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uStemPresence;

varying vec3 vColor;
varying float vPhase;
varying float vRadial;

void main() {
  float r = clamp(vRadial, 0.0, 1.0);
  float falloff = pow(1.0 - r, 3.4);
  float core = pow(1.0 - smoothstep(0.0, 0.28, r), 1.8);
  float glow = uIntensity * (core * 0.55 + falloff * 0.22);
  glow *= 1.0 + uPulseAmplitude * sin(uTime * uPulseSpeed + vPhase);
  glow *= clamp(uStemPresence, 0.0, 1.0);
  glow *= 0.18;
  glow = max(glow, 0.0);
  if (glow < 0.004) discard;
  gl_FragColor = vec4(vColor * glow, 1.0);
}
`;
