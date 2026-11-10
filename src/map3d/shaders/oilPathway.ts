/** Centreline of the slick: a soft ribbon with a pulse traveling along it. */

export const OIL_PATH_VERTEX = /* glsl */ `
attribute float pathSide;
attribute float pathAlong;
attribute vec2 pathNext;

uniform float uWidth;
uniform float uMetersPerPixel;
uniform float uMinPixels;

varying float vAlong;

void main() {
  vec2 here = position.xz;
  vec2 ahead = pathNext;
  vec2 dir = ahead - here;
  float len = length(dir);
  dir = len > 0.001 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float width = max(uWidth, uMetersPerPixel * uMinPixels);
  vec2 offset = normal * pathSide * width;
  vec3 world = position + vec3(offset.x, 0.0, offset.y);
  vAlong = pathAlong;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

export const OIL_PATH_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;

varying float vAlong;

void main() {
  float travel = fract(vAlong * 4.0 - uTime * 0.35);
  float pulse = smoothstep(0.0, 0.08, travel) * (1.0 - smoothstep(0.18, 0.55, travel));
  vec3 quiet = vec3(0.55, 0.78, 0.72);
  vec3 hot = vec3(0.95, 0.98, 0.9);
  vec3 color = mix(quiet, hot, pulse);
  float alpha = uOpacity * (0.28 + 0.72 * pulse);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

export const OIL_NODE_VERTEX = /* glsl */ `
attribute float nodeAlong;

uniform float uWidth;
uniform float uMetersPerPixel;
uniform float uMinPixels;

varying vec2 vUv;
varying float vAlong;

void main() {
  float radius = max(uWidth, uMetersPerPixel * uMinPixels) * 1.35;
  vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 world = center.xyz + vec3(position.x, 0.0, position.y) * radius;
  vUv = uv;
  vAlong = nodeAlong;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const OIL_NODE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;

varying vec2 vUv;
varying float vAlong;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float disc = pow(1.0 - r, 1.4);
  float travel = fract(vAlong * 4.0 - uTime * 0.35);
  float pulse = smoothstep(0.0, 0.12, travel) * (1.0 - smoothstep(0.2, 0.5, travel));
  vec3 color = mix(vec3(0.62, 0.86, 0.78), vec3(1.0), pulse);
  float alpha = uOpacity * disc * (0.45 + 0.55 * pulse);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`;
