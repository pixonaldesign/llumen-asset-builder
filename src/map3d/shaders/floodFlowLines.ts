import { FLOOD_FIELD_GLSL } from "@/lib/shaders/floodSurface";

/**
 * Wind-map style flow lines over the sim. Particles live in a float texture
 * (grid uv, age seconds, lifetime seconds) and are advected by the sim's
 * east/north velocity in m/s over the same sim time the water advances, so
 * trail length is velocity times a fixed span of sim time. At a fixed interval their positions go into
 * one slot of a ring-buffer trail texture; the line mesh joins the live
 * position to the last N slots so trails stay attached to the map as the
 * camera moves, unlike screen-space fade trails.
 */
export const FLOW_PASS_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const FLOW_ADVECT_FRAGMENT = /* glsl */ `
uniform sampler2D uParticles;
uniform sampler2D uSimState;
uniform sampler2D uBuildings;
uniform float uCols;
uniform float uRows;
uniform float uCell;
/** Sim seconds to advance; ages and lifetimes are sim seconds too. */
uniform float uStep;
uniform float uLifeMin;
uniform float uLifeSpan;
uniform float uSeed;

const float FLOW_MIN_DEPTH = 0.05;
const float FLOW_MIN_SPEED = 0.03;

float flowHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

ivec2 flowCell(vec2 uv) {
  return clamp(ivec2(floor(uv * vec2(uCols, uRows))), ivec2(0), ivec2(int(uCols) - 1, int(uRows) - 1));
}

vec2 flowVelocity(vec2 uv) {
  vec2 p = uv * vec2(uCols, uRows) - 0.5;
  vec2 b = floor(p);
  vec2 f = p - b;
  ivec2 c = ivec2(b);
  ivec2 hi = ivec2(int(uCols) - 1, int(uRows) - 1);
  vec2 a = texelFetch(uSimState, clamp(c, ivec2(0), hi), 0).gb;
  vec2 bx = texelFetch(uSimState, clamp(c + ivec2(1, 0), ivec2(0), hi), 0).gb;
  vec2 by = texelFetch(uSimState, clamp(c + ivec2(0, 1), ivec2(0), hi), 0).gb;
  vec2 bxy = texelFetch(uSimState, clamp(c + ivec2(1, 1), ivec2(0), hi), 0).gb;
  return mix(mix(a, bx, f.x), mix(by, bxy, f.x), f.y);
}

bool flowMoving(vec2 uv) {
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return false;
  ivec2 c = flowCell(uv);
  if (texelFetch(uBuildings, c, 0).r > 0.5) return false;
  vec4 s = texelFetch(uSimState, c, 0);
  return s.r > FLOW_MIN_DEPTH && length(s.gb) > FLOW_MIN_SPEED;
}

void main() {
  vec2 id = gl_FragCoord.xy;
  vec4 p = texelFetch(uParticles, ivec2(id), 0);
  bool respawn = p.w <= 0.0 || p.z >= p.w;
  if (!respawn) {
    vec2 domain = vec2(uCols, uRows) * uCell;
    // Midpoint step keeps trails on the curve through bends.
    vec2 mid = p.xy + flowVelocity(p.xy) * uStep * 0.5 / domain;
    p.xy += flowVelocity(mid) * uStep / domain;
    p.z += uStep;
    respawn = !flowMoving(p.xy);
  }
  if (respawn) {
    vec4 next = vec4(0.0);
    for (int i = 0; i < 6; i++) {
      vec2 seed = id + vec2(uSeed * 7.31 + float(i) * 13.7, uSeed * 3.17 - float(i) * 5.3);
      vec2 uv = vec2(flowHash(seed), flowHash(seed.yx + 19.19));
      if (flowMoving(uv)) {
        next = vec4(uv, 0.0, uLifeMin + uLifeSpan * flowHash(seed + 41.0));
        break;
      }
    }
    p = next;
  }
  gl_FragColor = p;
}
`;

export const FLOW_TRAIL_WRITE_FRAGMENT = /* glsl */ `
uniform sampler2D uParticles;
uniform float uSlotOffset;

void main() {
  ivec2 c = ivec2(gl_FragCoord.x, gl_FragCoord.y - uSlotOffset);
  gl_FragColor = texelFetch(uParticles, c, 0);
}
`;

export const FLOW_LINE_VERTEX = /* glsl */ `
// position carries the particle texel x, y, and segment * 2 + endpoint.
// Point 0 is the live particle; point k reads the trail slot written k - 1
// intervals before the latest one.
uniform sampler2D uParticles;
uniform sampler2D uTrail;
uniform float uHead;
uniform float uTrailLength;
uniform float uSide;
uniform float uInterval;
uniform float uSinceWrite;
uniform vec4 uFrame;
varying float vAlpha;

${FLOOD_FIELD_GLSL}

float flowPointAge(float back) {
  return back < 0.5 ? 0.0 : uSinceWrite + (back - 1.0) * uInterval;
}

vec4 flowTrailPoint(ivec2 pc, float back) {
  float slot = mod(uHead - back + 1.0 + uTrailLength, uTrailLength);
  return texelFetch(uTrail, ivec2(pc.x, pc.y + int(slot) * int(uSide)), 0);
}

void main() {
  ivec2 pc = ivec2(position.xy);
  vec4 particle = texelFetch(uParticles, pc, 0);
  float segment = floor(position.z * 0.5);
  float back = segment + mod(position.z, 2.0);
  // A trail slot older than the particle belongs to its previous life;
  // a zero lifetime marks a slot that was never written.
  if (particle.w <= 0.0 || flowPointAge(segment + 1.0) >= particle.z ||
      flowTrailPoint(pc, segment + 1.0).w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    return;
  }
  vec2 uv = back > 0.5 ? flowTrailPoint(pc, back).xy : particle.xy;
  FloodSample s = floodSample(uv);
  vec3 pos = vec3(uFrame.x + uv.x * uFrame.z, s.height + 0.25, uFrame.y + uv.y * uFrame.w);
  float span = max((uTrailLength - 1.0) * uInterval, 1e-3);
  float tail = 1.0 - flowPointAge(back) / span;
  float life = min(1.0, particle.z / (0.05 * span)) * min(1.0, (particle.w - particle.z) / (0.15 * span));
  vAlpha = tail * tail * life * smoothstep(0.02, 0.12, s.depth) * floodWetFade(s.wet);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const FLOW_LINE_FRAGMENT = /* glsl */ `
uniform vec3 uLineColor;
uniform float uLineOpacity;
varying float vAlpha;

void main() {
  float alpha = vAlpha * uLineOpacity;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(uLineColor, alpha);
}
`;
