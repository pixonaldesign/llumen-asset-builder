import {
  ADAPTIVE_POINT_COLLISION_DECLARATIONS,
  ADAPTIVE_SCALE_VERTEX_DECLARATIONS,
} from "@/lib/shaders/adaptiveScale";

/**
 * Screen-space beacon. A stem rises from the top of the form and the light
 * sits at its tip. Both are expanded in clip space, so they stay a flat
 * pixel sprite with no world size.
 */

export const FLAG_BEACON_VERTEX = /* glsl */ `
${ADAPTIVE_SCALE_VERTEX_DECLARATIONS}
${ADAPTIVE_POINT_COLLISION_DECLARATIONS}

attribute vec3 auraColor;
attribute float auraPhase;

uniform float uObjectTop;
uniform float uBeaconPixels;
uniform float uStemPixels;
uniform vec2 uResolution;

varying vec3 vColor;
varying float vPhase;
varying vec2 vBeaconUv;
varying float vStem;
varying float vPy;

void main() {
  float factor = collisionAwareAdaptiveScaleFactorFor(adaptiveScaleSize);
  float objectTop = max(uObjectTop, 0.05);
  vec3 localTop = vec3(0.0, objectTop * factor, 0.0);
  vec3 anchor = localTop;
  #ifdef USE_INSTANCING
    anchor = (instanceMatrix * vec4(localTop, 1.0)).xyz;
  #endif

  vec4 clip = projectionMatrix * modelViewMatrix * vec4(anchor, 1.0);
  vec2 resolution = max(uResolution, vec2(1.0));
  float head = max(uBeaconPixels, 1.0);
  float stem = max(uStemPixels, 0.0);
  // py = 0 is the top of the form. Negative py overlaps the mesh so the
  // stem cannot sit above it. The head sits above the stem.
  float overlap = 22.0;
  float py = -overlap + (position.y + 0.5) * (stem + head + overlap);
  float px = position.x * head;
  clip.xy += (vec2(px, py) / (resolution * 0.5)) * clip.w;

  float headCenter = stem + head * 0.5;
  vBeaconUv = vec2(px, py - headCenter) / (head * 0.5);
  vStem = stem;
  vPy = py;
  vColor = auraColor;
  vPhase = auraPhase;
  gl_Position = clip;
}
`;

export const FLAG_BEACON_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uBeaconMark;

varying vec3 vColor;
varying float vPhase;
varying vec2 vBeaconUv;
varying float vStem;
varying float vPy;

void main() {
  vec2 p = vBeaconUv;
  float r = length(p);
  float head = 0.0;
  if (r <= 1.0) {
    float disc = pow(1.0 - r, 1.7);
    float core = pow(1.0 - smoothstep(0.0, 0.26, r), 1.15);
    float armX = exp(-abs(p.x) * 11.0) * smoothstep(1.0, 0.12, abs(p.y));
    float armY = exp(-abs(p.y) * 11.0) * smoothstep(1.0, 0.12, abs(p.x));
    // Ordinal spikes: diagonal ticks that stay off the center, not a cross.
    vec2 o = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
    float spikeA = exp(-abs(o.x) * 16.0) * smoothstep(0.16, 0.38, abs(o.y)) * smoothstep(1.02, 0.48, abs(o.y));
    float spikeB = exp(-abs(o.y) * 16.0) * smoothstep(0.16, 0.38, abs(o.x)) * smoothstep(1.02, 0.48, abs(o.x));
    float mark = uBeaconMark < 0.5 ? max(armX, armY) : max(spikeA, spikeB);
    head = disc * 0.8 + core + mark * 0.7;
  }

  // py is 0 on the top face and positive toward the head.
  float y = vPy;
  float stemCore = exp(-abs(p.x) * 28.0);
  float stemGlow = exp(-abs(p.x) * 7.0);
  float stemBody = smoothstep(-12.0, -1.0, y) * (1.0 - smoothstep(vStem - 1.0, vStem + 5.0, y));
  float stem = stemBody * (stemCore * 0.95 + stemGlow * 0.28);

  if (r > 1.0 && stem < 0.02) discard;

  float glow = uIntensity * (head + stem);
  glow *= 1.0 + uPulseAmplitude * sin(uTime * uPulseSpeed + vPhase);
  glow = max(glow, 0.0);
  if (glow < 0.004) discard;
  gl_FragColor = vec4(vColor * glow, 1.0);
}
`;
