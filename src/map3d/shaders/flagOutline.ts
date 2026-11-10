import { ADAPTIVE_SCALE_VERTEX_DECLARATIONS } from "@/lib/shaders/adaptiveScale";

/** Solid flag color. The aura vertex shader already outputs vColor. */
export const FLAG_MASK_FRAGMENT = /* glsl */ `
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

/** Extruded-area mask. Height follows the same adaptive scale as the visible mesh. */
export const AREA_MASK_VERTEX = /* glsl */ `
${ADAPTIVE_SCALE_VERTEX_DECLARATIONS}
attribute vec3 flagColor;
attribute float flagCovered;

varying vec3 vFlagColor;
varying float vFlagCovered;

void main() {
  vec3 pos = position;
  pos.y *= adaptiveScaleFactorFor(adaptiveScaleSize);
  vFlagColor = flagColor;
  vFlagCovered = flagCovered;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const AREA_MASK_FRAGMENT = /* glsl */ `
varying vec3 vFlagColor;
varying float vFlagCovered;

void main() {
  if (vFlagCovered < 0.5) discard;
  gl_FragColor = vec4(vFlagColor, 1.0);
}
`;

/**
 * Hard disc at the plume's nominal radius. Distortion and stems stay out of
 * the mask so the stroke is a line, not a fuzzy halo.
 */
export const DISC_MASK_VERTEX = /* glsl */ `
attribute float instanceRadiusMul;
attribute vec3 flagColor;
attribute float flagCovered;

uniform float uRadiusMeters;
uniform float uAltitude;

varying vec3 vFlagColor;
varying float vFlagCovered;
varying vec2 vLocal;

void main() {
  float radius = max(uRadiusMeters * instanceRadiusMul, 1.0);
  vec2 local = position.xz * radius;

  vec4 center = vec4(0.0);
  #ifdef USE_INSTANCING
    center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif

  vec3 worldPos = center.xyz + vec3(local.x, 0.0, local.y);
  worldPos.y = uAltitude;

  vLocal = position.xz;
  vFlagColor = flagColor;
  vFlagCovered = flagCovered;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
}
`;

export const DISC_MASK_FRAGMENT = /* glsl */ `
varying vec3 vFlagColor;
varying float vFlagCovered;
varying vec2 vLocal;

void main() {
  if (vFlagCovered < 0.5) discard;
  if (dot(vLocal, vLocal) > 1.0) discard;
  gl_FragColor = vec4(vFlagColor, 1.0);
}
`;

/** Outside-only stroke: blurred coverage minus the solid mask. */
export const FLAG_OUTLINE_COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D tMask;
uniform sampler2D tBlur;
uniform vec2 uTexel;
uniform float uIntensity;
uniform float uTime;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uPulseEnabled;
uniform float uDashesEnabled;
uniform float uWhiteMix;

varying vec2 vUv;

void main() {
  vec4 mask = texture2D(tMask, vUv);
  vec4 blur = texture2D(tBlur, vUv);
  float stroke = clamp(blur.a - mask.a, 0.0, 1.0);
  if (stroke < 0.004) discard;

  vec3 tint = blur.rgb / max(blur.a, 0.0001);
  vec3 color = mix(tint, vec3(1.0), clamp(uWhiteMix, 0.0, 1.0));

  float pulse = 1.0;
  if (uPulseEnabled > 0.5) {
    float wave = 0.5 + 0.5 * sin(uTime * uPulseSpeed);
    pulse = mix(1.0 - uPulseAmplitude, 1.0, wave);
  }

  float dash = 1.0;
  if (uDashesEnabled > 0.5) {
    float left = texture2D(tBlur, vUv - vec2(uTexel.x, 0.0)).a;
    float right = texture2D(tBlur, vUv + vec2(uTexel.x, 0.0)).a;
    float down = texture2D(tBlur, vUv - vec2(0.0, uTexel.y)).a;
    float up = texture2D(tBlur, vUv + vec2(0.0, uTexel.y)).a;
    vec2 grad = vec2(right - left, up - down);
    float glen = length(grad);
    vec2 tangent = glen > 0.0001 ? vec2(-grad.y, grad.x) / glen : vec2(1.0, 0.0);
    float along = dot(gl_FragCoord.xy, tangent);
    float phase = fract(along / 12.0 - uTime * max(uPulseSpeed, 0.15) * 0.85);
    dash = step(0.5, phase);
  }

  float alpha = clamp(stroke * pulse * dash * uIntensity, 0.0, 1.0);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Crisp contour written premultiplied, so a later wide blur becomes a colored
 * halo. Dashes are included. The brightness pulse stays on the stroke only.
 */
export const FLAG_OUTLINE_STROKE_FRAGMENT = /* glsl */ `
uniform sampler2D tMask;
uniform sampler2D tBlur;
uniform vec2 uTexel;
uniform float uTime;
uniform float uPulseSpeed;
uniform float uDashesEnabled;
uniform float uBloomWhiteMix;

varying vec2 vUv;

void main() {
  vec4 mask = texture2D(tMask, vUv);
  vec4 blur = texture2D(tBlur, vUv);
  float stroke = clamp(blur.a - mask.a, 0.0, 1.0);
  if (stroke < 0.004) discard;

  vec3 tint = blur.rgb / max(blur.a, 0.0001);
  vec3 color = mix(tint, vec3(1.0), clamp(uBloomWhiteMix, 0.0, 1.0));

  float dash = 1.0;
  if (uDashesEnabled > 0.5) {
    float left = texture2D(tBlur, vUv - vec2(uTexel.x, 0.0)).a;
    float right = texture2D(tBlur, vUv + vec2(uTexel.x, 0.0)).a;
    float down = texture2D(tBlur, vUv - vec2(0.0, uTexel.y)).a;
    float up = texture2D(tBlur, vUv + vec2(0.0, uTexel.y)).a;
    vec2 grad = vec2(right - left, up - down);
    float glen = length(grad);
    vec2 tangent = glen > 0.0001 ? vec2(-grad.y, grad.x) / glen : vec2(1.0, 0.0);
    float along = dot(gl_FragCoord.xy, tangent);
    float phase = fract(along / 12.0 - uTime * max(uPulseSpeed, 0.15) * 0.85);
    dash = step(0.5, phase);
  }

  float alpha = stroke * dash;
  if (alpha < 0.004) discard;
  vec3 halo = color * alpha * 2.4;
  gl_FragColor = vec4(halo, alpha);
}
`;

/** Additive halo. A wide tent sample feathers the low-resolution blur. */
export const FLAG_OUTLINE_BLOOM_FRAGMENT = /* glsl */ `
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uTime;
uniform float uPulseSpeed;

varying vec2 vUv;

void main() {
  vec2 t = uTexel;
  vec3 color = texture2D(tBloom, vUv).rgb * 0.25;
  color += texture2D(tBloom, vUv + vec2(t.x, 0.0)).rgb * 0.125;
  color += texture2D(tBloom, vUv - vec2(t.x, 0.0)).rgb * 0.125;
  color += texture2D(tBloom, vUv + vec2(0.0, t.y)).rgb * 0.125;
  color += texture2D(tBloom, vUv - vec2(0.0, t.y)).rgb * 0.125;
  color += texture2D(tBloom, vUv + vec2(t.x, t.y)).rgb * 0.0625;
  color += texture2D(tBloom, vUv + vec2(t.x, -t.y)).rgb * 0.0625;
  color += texture2D(tBloom, vUv + vec2(-t.x, t.y)).rgb * 0.0625;
  color += texture2D(tBloom, vUv + vec2(-t.x, -t.y)).rgb * 0.0625;
  float speed = max(uPulseSpeed, 0.45);
  float breathe = 0.58 + 0.42 * sin(uTime * speed);
  color *= uStrength * breathe;
  gl_FragColor = vec4(color, 1.0);
}
`;
