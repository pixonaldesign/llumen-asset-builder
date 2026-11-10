import {
  ADAPTIVE_POINT_COLLISION_DECLARATIONS,
  ADAPTIVE_SCALE_VERTEX_DECLARATIONS,
} from "@/lib/shaders/adaptiveScale";

/** Additive flag glow: Fresnel shell, or a short cylindrical light pillar. */

export const FLAG_AURA_VERTEX = /* glsl */ `
${ADAPTIVE_SCALE_VERTEX_DECLARATIONS}
${ADAPTIVE_POINT_COLLISION_DECLARATIONS}

attribute vec3 auraColor;
attribute float auraPhase;

uniform float uFaceOffset;
uniform float uTime;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uNoiseScale;
uniform float uAnimMode;
uniform float uPillarHeight;
uniform float uObjectTop;
uniform float uPillarRadius;

varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vPhase;
varying float vMetersPerPixel;
varying float vPillarT;
varying float vRadial;

float hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  float factor = collisionAwareAdaptiveScaleFactorFor(adaptiveScaleSize);
  vec3 nrm = normalize(normal);
  vec3 shaped = position;
  float pillarT = 0.0;
  float radial = 0.0;
  // Light pillar: unit cylinder (y in [-0.5, 0.5]) rooted at the bottom of the form.
  if (uAnimMode > 2.5) {
    pillarT = clamp(position.y + 0.5, 0.0, 1.0);
    radial = length(position.xz) / max(uPillarRadius, 0.0001);
    float objectTop = max(uObjectTop, 0.05);
    float rise = objectTop * max(uPillarHeight, 0.0);
    shaped = vec3(position.x, pillarT * rise, position.z);
  }

  float offset = uFaceOffset;
  if (uAnimMode > 0.5 && uAnimMode < 1.5) {
    float n = hash11(dot(position, vec3(17.1, 31.7, 13.9)) + uTime * uPulseSpeed);
    offset += uFaceOffset * uPulseAmplitude * (n * 2.0 - 1.0) * 0.35;
  }

  // Inflate after instance scale. Thickness is a fraction of the shortest axis
  // so height does not explode the caps. Offset along the object normal with
  // rotation only — inverse-transpose would flatten +Y on tall pillars and
  // glue the top face to the mesh. The light pillar is already placed.
  vec4 instPos = vec4(shaped * factor, 1.0);
  vec3 worldN = nrm;
  float thickness = offset * factor;
  #ifdef USE_INSTANCING
    mat3 im = mat3(instanceMatrix);
    float sx = max(length(im[0]), 0.000001);
    float sy = max(length(im[1]), 0.000001);
    float sz = max(length(im[2]), 0.000001);
    thickness *= min(sx, min(sy, sz));
    instPos = instanceMatrix * instPos;
    worldN = normalize(
      im[0] * (nrm.x / sx) +
      im[1] * (nrm.y / sy) +
      im[2] * (nrm.z / sz)
    );
    if (uAnimMode < 2.5) {
      instPos.xyz += worldN * thickness;
    }
  #else
    if (uAnimMode < 2.5) {
      instPos.xyz += nrm * thickness;
    }
  #endif

  vec4 world = modelMatrix * instPos;
  worldN = normalize(mat3(modelMatrix) * worldN);

  vWorldPos = world.xyz;
  vWorldNormal = worldN;
  vColor = auraColor;
  vPhase = auraPhase;
  vMetersPerPixel = max(uAdaptiveMetersPerPixel, 0.000001);
  vPillarT = pillarT;
  vRadial = radial;

  gl_Position = projectionMatrix * modelViewMatrix * instPos;
}
`;

export const FLAG_AURA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uFalloff;
uniform float uNoiseScale;
uniform float uAnimMode;
uniform vec3 uFresnelCameraPos;

varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vPhase;
varying float vMetersPerPixel;
varying float vPillarT;
varying float vRadial;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * valueNoise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

float causticField(vec2 p, float t) {
  float a = 0.0;
  vec2 q = p;
  for (int i = 0; i < 3; i++) {
    q = vec2(
      q.x * 0.82 - q.y * 0.57,
      q.x * 0.57 + q.y * 0.82
    );
    q += 0.18 * vec2(sin(q.y * 2.7 + t), cos(q.x * 2.3 - t * 0.85));
    a += 1.0 / (0.35 + abs(sin(q.x) + sin(q.y)));
  }
  return pow(clamp(a * 0.22, 0.0, 1.0), 3.2);
}

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 viewDir = normalize(uFresnelCameraPos - vWorldPos);
  float ndotv = abs(dot(n, viewDir));
  float fresnel = pow(clamp(1.0 - ndotv, 0.0, 1.0), max(uFalloff, 0.001));
  float glow = uIntensity * fresnel;
  float t = uTime * uPulseSpeed;
  // World meters → CSS pixels so pattern grain does not densify or vanish with zoom.
  vec2 zoomUv = vWorldPos.xz / max(vMetersPerPixel, 0.000001) * 0.04 * uNoiseScale;

  if (uAnimMode > 2.5) {
    // Short cylindrical border: bright rim at the object, fading upward.
    float vertical = pow(1.0 - clamp(vPillarT, 0.0, 1.0), 1.55);
    float ring = smoothstep(0.55, 0.92, vRadial);
    ring *= 1.0 - smoothstep(1.0, 1.16, vRadial);
    float rim = pow(clamp(1.0 - ndotv, 0.0, 1.0), 1.35);
    glow = uIntensity * vertical * max(ring, rim * smoothstep(0.72, 1.0, vRadial));
    glow *= 1.0 + uPulseAmplitude * sin(t + vPhase);
  } else if (uAnimMode < 0.5) {
    glow *= 1.0 + uPulseAmplitude * sin(t + vPhase);
  } else if (uAnimMode < 1.5) {
    float nse = fbm(zoomUv + vec2(t * 0.35, t * 0.22 + vPhase));
    glow *= mix(1.0 - uPulseAmplitude, 1.0 + uPulseAmplitude, nse);
  } else {
    float caust = causticField(zoomUv, t);
    float bounce = pow(max(-n.y, 0.0), 1.4);
    float sparkle = caust * mix(0.35, 1.35, bounce);
    glow = uIntensity * (fresnel * 0.45 + sparkle * (0.55 + uPulseAmplitude));
  }

  glow = max(glow, 0.0);
  if (glow < 0.004) discard;
  gl_FragColor = vec4(vColor * glow, 1.0);
}
`;
