/** Unlit radial alpha plume with FBM domain warp and a water-mask discard. */

export const WATER_GRADIENT_VERTEX = /* glsl */ `
attribute float instanceRadiusMul;
attribute float instanceSeed;

uniform float uRadiusMeters;
uniform float uDistortion;
uniform float uAltitude;
uniform vec3 uColor;

varying vec2 vMeters;
varying vec2 vWorldXZ;
varying float vRadius;
varying vec3 vColor;
varying float vSeed;

void main() {
  float radius = max(uRadiusMeters * instanceRadiusMul, 1.0);
  float pad = 1.0 + uDistortion / radius;
  vec2 local = position.xz * radius * pad;

  vec4 center = vec4(0.0);
  #ifdef USE_INSTANCING
    center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif

  vec3 worldPos = center.xyz + vec3(local.x, 0.0, local.y);
  worldPos.y = uAltitude;

  vMeters = local;
  vWorldXZ = worldPos.xz;
  vRadius = radius;
  vColor = uColor;
  vSeed = instanceSeed;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
}
`;

export const WATER_GRADIENT_FRAGMENT = /* glsl */ `
uniform float uDistortion;
uniform float uNoiseScale;
uniform float uOctaves;
uniform float uTime;
uniform float uAnimationSpeed;
uniform sampler2D uWaterMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;
uniform float uMaskReady;

varying vec2 vMeters;
varying vec2 vWorldXZ;
varying float vRadius;
varying vec3 vColor;
varying float vSeed;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, float octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= octaves) break;
    value += amplitude * valueNoise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  if (uMaskReady < 0.5) discard;

  vec2 maskUv = (vWorldXZ - uMaskMin) / uMaskSize;
  if (maskUv.x < 0.0 || maskUv.y < 0.0 || maskUv.x > 1.0 || maskUv.y > 1.0) {
    discard;
  }
  if (texture2D(uWaterMask, maskUv).r < 0.5) discard;

  float angle = vSeed * 6.2831853;
  vec2 dir = vec2(cos(angle), sin(angle * 1.37));
  float speedMul = 0.55 + fract(vSeed * 13.17) * 1.15;
  vec2 origin = vec2(vSeed * 41.7, fract(vSeed * 7.31) * 53.1);
  float t = uTime + vSeed * 47.0;
  vec2 flow = dir * (t * uAnimationSpeed * 12.0 * speedMul);

  float n1 = fbm(vMeters * uNoiseScale + flow + origin, uOctaves);
  float n2 = fbm(vMeters * uNoiseScale + flow.yx * -0.73 + origin + 19.17, uOctaves);
  vec2 warped = vMeters + (vec2(n1, n2) * 2.0 - 1.0) * uDistortion;
  float dist = length(warped) / max(vRadius, 1.0);
  if (dist > 1.0) discard;

  float radial = clamp(1.0 - dist, 0.0, 1.0);
  float alpha = radial * radial;
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(vColor, alpha);
}
`;
