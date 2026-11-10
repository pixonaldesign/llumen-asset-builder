/** Unlit vertical stem that fades out at city-level zoom. */

export const WATER_STEM_VERTEX = /* glsl */ `
attribute float instanceHeightT;

uniform float uMinHeight;
uniform float uMaxHeight;
uniform float uMinHeightPixels;
uniform float uWidthPixels;
uniform float uMetersPerPixel;
uniform vec3 uColor;

varying vec3 vColor;
varying float vAlong;

void main() {
  float t = clamp(instanceHeightT, 0.0, 1.0);
  float height = mix(uMinHeight, uMaxHeight, t);
  float minH = uMinHeightPixels * max(uMetersPerPixel, 0.000001);
  height = max(height, minH);
  float width = uWidthPixels * max(uMetersPerPixel, 0.000001);
  width = min(width, max(height * 0.06, 1.0));

  float y01 = position.y + 0.5;
  vec3 local = vec3(position.x * width, y01 * height, position.z * width);

  vec4 center = vec4(0.0);
  #ifdef USE_INSTANCING
    center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif

  vec3 worldPos = center.xyz + local;
  vColor = uColor;
  vAlong = y01;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
}
`;

export const WATER_STEM_FRAGMENT = /* glsl */ `
uniform float uZoom;
uniform float uFadeStartZoom;
uniform float uFadeEndZoom;

varying vec3 vColor;
varying float vAlong;

void main() {
  float fadeEnd = max(uFadeEndZoom, uFadeStartZoom + 0.05);
  float fade = 1.0 - smoothstep(uFadeStartZoom, fadeEnd, uZoom);
  if (fade < 0.004) discard;

  // Bright tip, dark base of the assigned plume color.
  float shade = mix(0.14, 1.08, pow(clamp(vAlong, 0.0, 1.0), 0.55));
  vec3 color = vColor * shade;
  float alpha = fade * mix(0.78, 1.0, vAlong);
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(color, alpha);
}
`;
