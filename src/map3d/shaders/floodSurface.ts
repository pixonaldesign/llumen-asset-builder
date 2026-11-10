/**
 * Flood grid decoding shared by the depth heatmap and the water surface.
 *
 * uGrid is RGBA half float per cell: ground and spill in NAVD88 meters, baked
 * roof height, and the code bits (bit 0 open water, then 2-bit stormwater
 * classes). Depth comes from one of three sources:
 *   0  connected bathtub: wet once the harbor level reaches the spill level;
 *   1  stormwater class, drawn at a representative depth;
 *   2  sim state texture (depth, flow u, flow v).
 * Display height is the water surface over the flat basemap, or the absolute
 * level times exaggeration when Mapbox terrain is on.
 */
export const FLOOD_FIELD_GLSL = /* glsl */ `
uniform sampler2D uGrid;
uniform sampler2D uBuildings;
uniform sampler2D uSimState;
uniform float uCols;
uniform float uRows;
uniform float uCellMeters;
uniform float uSource;
uniform float uLevel;
uniform float uClassScale;
uniform vec3 uClassDepths;
uniform float uHarborRest;
uniform float uFlatRest;
uniform float uShowHarbor;
uniform float uTerrain;
uniform float uExaggeration;
uniform sampler2D uDisplay;
uniform float uUseDisplay;
/** Depth over which water fades in above FLOOD_DRY. */
uniform float uShallowFade;
/** Footprints at uBuildingMaskScale pixels per cell: r inside, g authoritative cell. */
uniform sampler2D uBuildingMask;
uniform float uBuildingMaskOn;
uniform float uBuildingMaskScale;

const float FLOOD_DRY = 0.02;
/** Depth above FLOOD_DRY over which a cell ramps from dry to fully wet. */
const float FLOOD_WET_RAMP = 0.04;
/** Coverage level the drawn shoreline follows; a lone wet cell blurs to 0.25. */
const float FLOOD_EDGE = 0.35;

ivec2 floodClampCell(ivec2 c) {
  return clamp(c, ivec2(0), ivec2(int(uCols) - 1, int(uRows) - 1));
}

float floodClassOf(float code) {
  return mod(floor((code + 0.5) / uClassScale), 4.0);
}

/** x depth, y water surface (NAVD88), z open water, w roof height. */
vec4 floodCell(ivec2 c) {
  c = floodClampCell(c);
  vec4 g = texelFetch(uGrid, c, 0);
  float harbor = mod(floor(g.a + 0.5), 2.0);
  float depth = 0.0;
  if (uSource > 1.5) {
    depth = texelFetch(uSimState, c, 0).r;
  } else if (uSource > 0.5) {
    if (harbor > 0.5) {
      depth = max(uHarborRest - g.r, 0.0);
    } else {
      float cls = floodClassOf(g.a);
      depth = cls < 0.5 ? 0.0 : (cls < 1.5 ? uClassDepths.x : (cls < 2.5 ? uClassDepths.y : uClassDepths.z));
    }
  } else if (uLevel >= g.g) {
    depth = max(uLevel - g.r, 0.0);
  }
  if (harbor > 0.5 && uShowHarbor < 0.5) depth = 0.0;
  return vec4(depth, g.r + depth, harbor, texelFetch(uBuildings, c, 0).r);
}

/** Smoothed wet coverage of a cell from the display pass. */
float floodCoverage(ivec2 c) {
  return texelFetch(uDisplay, floodClampCell(c), 0).r;
}

/** 1 where the footprint mask, not the grid, decides this cell's wall position. */
float floodMaskAuthority(ivec2 c) {
  if (uBuildingMaskOn < 0.5) return 0.0;
  ivec2 p = floodClampCell(c) * int(uBuildingMaskScale) + ivec2(int(uBuildingMaskScale) / 2);
  return texelFetch(uBuildingMask, p, 0).g;
}

/** Sim flow in local x/z. The sim stores east and north; local z points south. */
vec2 floodFlow(ivec2 c) {
  if (uSource < 1.5) return vec2(0.0);
  vec2 eastNorth = texelFetch(uSimState, floodClampCell(c), 0).gb;
  return vec2(eastNorth.x, -eastNorth.y);
}

struct FloodSample {
  float depth;
  float height;
  float harbor;
  /** Bilinear building presence: 0 street, 1 inside a footprint. */
  float building;
  /** Smoothed wet coverage; the shoreline is drawn where it crosses FLOOD_EDGE. */
  float coverage;
  /** Bilinear weight of wet cells; 0 where no wet cell reaches. */
  float wet;
  vec2 flow;
};

/**
 * Fades water out where the wet weight runs to zero. The water level is
 * normalized over wet cells, so without this the reach of a barely wet cell
 * ends in a hard cell-sized rectangle.
 */
float floodWetFade(float wet) {
  return smoothstep(0.0, 0.2, wet);
}

/**
 * Shoreline-aware sample over the four cells around uv. Blending depth directly
 * pins the edge to the dry cells and stair-steps it along the 4 m grid, so the
 * water level is taken from wet cells only and carried flat over dry ones, and
 * depth is that level minus bilinear ground. The edge then lands where water
 * meets ground between cells. Roof cells get a mirrored ground that puts the
 * wall halfway between cell centers, unless the footprint mask is
 * authoritative there: then the water carries under the cell and the 1 m
 * footprint decides where it stops.
 *
 * Outline fields (coverage, building) use smoothstep-eased weights, as the oil
 * slick's field does; plain bilinear contours kink at 45 degrees on the grid.
 */
FloodSample floodSample(vec2 uv) {
  vec2 p = uv * vec2(uCols, uRows) - 0.5;
  vec2 b = floor(p);
  vec2 f = p - b;
  ivec2 c = ivec2(b);
  vec4 a = floodCell(c);
  vec4 bx = floodCell(c + ivec2(1, 0));
  vec4 by = floodCell(c + ivec2(0, 1));
  vec4 bxy = floodCell(c + ivec2(1, 1));
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  vec4 depth4 = vec4(a.x, bx.x, by.x, bxy.x);
  vec4 wse4 = vec4(a.y, bx.y, by.y, bxy.y);
  vec4 ground4 = wse4 - depth4;
  vec4 roof4 = step(0.5, vec4(a.w, bx.w, by.w, bxy.w));
  vec4 auth4 = roof4 * vec4(floodMaskAuthority(c), floodMaskAuthority(c + ivec2(1, 0)),
    floodMaskAuthority(c + ivec2(0, 1)), floodMaskAuthority(c + ivec2(1, 1)));
  vec4 gridWall4 = roof4 * (1.0 - auth4);
  vec4 wet = smoothstep(FLOOD_DRY, FLOOD_DRY + FLOOD_WET_RAMP, depth4) * (1.0 - roof4);
  vec4 wetW = w * wet;
  float wetWeight = wetW.x + wetW.y + wetW.z + wetW.w;
  vec2 fe = f * f * (3.0 - 2.0 * f);
  vec4 we = vec4((1.0 - fe.x) * (1.0 - fe.y), fe.x * (1.0 - fe.y), (1.0 - fe.x) * fe.y, fe.x * fe.y);

  FloodSample s;
  s.harbor = dot(w, vec4(a.z, bx.z, by.z, bxy.z));
  float footprint = uBuildingMaskOn > 0.5 ? texture2D(uBuildingMask, uv).r : 0.0;
  s.building = max(dot(we, gridWall4), footprint);
  s.coverage = uUseDisplay > 0.5
    ? dot(we, vec4(floodCoverage(c), floodCoverage(c + ivec2(1, 0)),
        floodCoverage(c + ivec2(0, 1)), floodCoverage(c + ivec2(1, 1))))
    : 1.0;
  s.wet = wetWeight;
  if (wetWeight < 1e-5) {
    s.depth = 0.0;
    s.height = uTerrain > 0.5 ? dot(w, ground4) * uExaggeration : 0.0;
  } else {
    float wse = dot(wetW, wse4) / wetWeight;
    float wetDepth = dot(wetW, depth4) / wetWeight;
    ground4 = mix(ground4, vec4(wse + max(wetDepth, FLOOD_DRY)), gridWall4);
    ground4 = mix(ground4, vec4(wse - wetDepth), auth4);
    float ground = dot(w, ground4);
    s.depth = max(wse - ground, 0.0);
    if (uTerrain > 0.5) {
      s.height = (ground + s.depth) * uExaggeration;
    } else {
      float harborHeight = s.depth > FLOOD_DRY ? max(wse - uFlatRest, 0.0) : 0.0;
      s.height = mix(s.depth, harborHeight, s.harbor);
    }
  }
  s.flow = mix(
    mix(floodFlow(c), floodFlow(c + ivec2(1, 0)), f.x),
    mix(floodFlow(c + ivec2(0, 1)), floodFlow(c + ivec2(1, 1)), f.x),
    f.y);
  return s;
}

ivec2 floodNearestCell(vec2 uv) {
  return floodClampCell(ivec2(floor(uv * vec2(uCols, uRows))));
}
`;

export const FLOOD_DISPLAY_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Wet coverage per cell: a 3x3 binomial average of wetness over non-building
 * cells, mixed with the cell's own state by uSmoothing, then eased in time
 * toward the previous frame's coverage so the outline doesn't flicker. Depth is
 * left alone, so thin connected sheets keep their real depth; only the outline
 * is smoothed. A lone wet cell blurs to 0.25, under FLOOD_EDGE, while a
 * one-cell-wide strip stays at 0.5. Roof cells take their neighbors' value so
 * walls don't pull the shoreline away from buildings.
 */
export const FLOOD_DISPLAY_FRAGMENT = /* glsl */ `
uniform float uSmoothing;
uniform sampler2D uPrevCoverage;
/** Share of this frame's coverage mixed over the previous one; 1 is no easing. */
uniform float uBlend;

${FLOOD_FIELD_GLSL}

// A ramp, not a step: shallow sim water ripples by a centimeter between
// steps, and a hard cutoff flips whole cells wet and dry every frame.
float floodWetness(float depth) {
  return smoothstep(0.01, 0.06, depth);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 self = floodCell(c);
  bool roof = self.w > 0.5;
  float selfWet = roof ? 0.0 : floodWetness(self.x);
  const float K[3] = float[3](1.0, 2.0, 1.0);
  float sum = 0.0;
  float weight = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec4 n = floodCell(c + ivec2(dx, dy));
      if (n.w > 0.5) continue;
      float w = K[dx + 1] * K[dy + 1];
      sum += w * floodWetness(n.x);
      weight += w;
    }
  }
  float blurred = weight > 0.0 ? sum / weight : selfWet;
  float coverage = roof ? blurred : mix(selfWet, blurred, uSmoothing);
  float previous = texelFetch(uPrevCoverage, c, 0).r;
  gl_FragColor = vec4(mix(previous, coverage, uBlend), 0.0, 0.0, 1.0);
}
`;

/** Fragment-only: fwidth has no vertex-stage overload. */
const FLOOD_EDGE_GLSL = /* glsl */ `
/** 0 outside the smoothed shoreline, 1 inside, anti-aliased over about a pixel. */
float floodEdgeMask(float coverage) {
  if (uUseDisplay < 0.5) return 1.0;
  float aa = max(fwidth(coverage), 1e-4);
  return smoothstep(FLOOD_EDGE - aa, FLOOD_EDGE + aa, coverage);
}

/** 1 in the street, 0 inside a building, anti-aliased at the wall. */
float floodOpenMask(float building) {
  float aa = max(fwidth(building), 1e-4);
  return 1.0 - smoothstep(0.5 - aa, 0.5 + aa, building);
}
`;

export const FLOOD_SURFACE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vLocal;

${FLOOD_FIELD_GLSL}

void main() {
  vUv = uv;
  FloodSample s = floodSample(uv);
#ifdef FLOOD_HEATMAP
  float y = uTerrain > 0.5 ? s.height + 0.15 : 0.35;
#else
  float y = s.height + 0.03;
#endif
  vec3 pos = vec3(position.x, y, position.z);
  vLocal = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FLOOD_RAMP_GLSL = /* glsl */ `
uniform vec4 uColor0;
uniform vec4 uColor1;
uniform vec4 uColor2;
uniform vec4 uColor3;

vec3 floodRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.3333) return mix(uColor0.rgb, uColor1.rgb, t / 0.3333);
  if (t < 0.6667) return mix(uColor1.rgb, uColor2.rgb, (t - 0.3333) / 0.3333);
  return mix(uColor2.rgb, uColor3.rgb, (t - 0.6667) / 0.3333);
}
`;

/**
 * Land-only depth wash. Open water and roofs are cut out at the halfway line
 * between cells, so the color stays in the streets without stair steps.
 */
export const FLOOD_HEATMAP_FRAGMENT = /* glsl */ `
uniform float uHeatmapAlpha;
uniform float uHeatmapOpacity;
uniform float uMaxDepth;
uniform float uBands;
uniform float uBandStep;
uniform vec3 uClassColor1;
uniform vec3 uClassColor2;
uniform vec3 uClassColor3;
varying vec2 vUv;
varying vec3 vLocal;

${FLOOD_FIELD_GLSL}
${FLOOD_RAMP_GLSL}
${FLOOD_EDGE_GLSL}

void main() {
  if (uHeatmapAlpha < 0.001) discard;
  FloodSample s = floodSample(vUv);
  if (s.harbor > 0.5) discard;
  float edge = floodEdgeMask(s.coverage) * floodOpenMask(s.building);
  if (edge <= 0.0) discard;
  float depth = s.depth;
  if (depth < FLOOD_DRY) discard;
  ivec2 cell = floodNearestCell(vUv);
  vec3 color;
  if (uSource > 0.5 && uSource < 1.5) {
    float cls = floodClassOf(texelFetch(uGrid, cell, 0).a);
    color = cls < 1.5 ? uClassColor1 : (cls < 2.5 ? uClassColor2 : uClassColor3);
  } else {
    float shown = uBands > 0.5 ? (floor(depth / uBandStep) + 0.5) * uBandStep : depth;
    color = floodRamp(shown / max(uMaxDepth, 0.01));
  }
  if (uBands > 0.5 && uSource != 1.0) {
    float index = depth / max(uBandStep, 0.01);
    float fw = max(fwidth(index), 0.0001);
    float line = 1.0 - smoothstep(0.6, 1.6, abs(fract(index + 0.5) - 0.5) / fw);
    color = mix(color, color * 0.4, line * 0.85);
  }
  float alpha = uHeatmapOpacity * uHeatmapAlpha * edge * floodWetFade(s.wet) * smoothstep(FLOOD_DRY, FLOOD_DRY + uShallowFade, depth);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Water surface. Depth sets the body color through Beer-Lambert absorption;
 * normals are procedural waves (advected by sim flow); fresnel mixes a sky
 * gradient and a sun glint.
 */
export const FLOOD_SURFACE_FRAGMENT = /* glsl */ `
uniform float uSurfaceAlpha;
uniform float uSurfaceOpacity;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uAbsorption;
uniform float uWaveStrength;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
uniform float uFlowScale;
varying vec2 vUv;
varying vec3 vLocal;

${FLOOD_FIELD_GLSL}
${FLOOD_EDGE_GLSL}

float floodHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float floodNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(floodHash(i), floodHash(i + vec2(1.0, 0.0)), u.x),
    mix(floodHash(i + vec2(0.0, 1.0)), floodHash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

/** Slope of a few crossing wave trains, in local meters. */
vec2 floodWaveSlope(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  vec2 dirs[4];
  dirs[0] = normalize(vec2(1.0, 0.35));
  dirs[1] = normalize(vec2(-0.6, 1.0));
  dirs[2] = normalize(vec2(0.2, -1.0));
  dirs[3] = normalize(vec2(-1.0, -0.45));
  float lengths[4];
  lengths[0] = 9.0;
  lengths[1] = 5.5;
  lengths[2] = 3.2;
  lengths[3] = 1.9;
  for (int i = 0; i < 4; i++) {
    float k = 6.2831853 / lengths[i];
    float speed = sqrt(9.81 / k);
    float amp = 0.035 * lengths[i] / 9.0;
    float phase = dot(dirs[i], p) * k - t * speed;
    slope += dirs[i] * (k * amp * cos(phase));
  }
  return slope;
}

void main() {
  if (uSurfaceAlpha < 0.001) discard;
  FloodSample s = floodSample(vUv);
  if (s.depth < FLOOD_DRY) discard;

  vec2 flow = s.flow * uFlowScale;
  vec2 p = vLocal.xz - flow * uTime * 0.6;
  float chop = 0.55 + 0.45 * floodNoise(vLocal.xz * 0.06 + uTime * 0.05);
  vec2 slope = floodWaveSlope(p, uTime) * uWaveStrength * chop;
  slope += flow * 0.04 * uWaveStrength;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 viewDir = normalize(uCameraPos - vLocal);
  vec3 sun = normalize(uSunDir);
  float facing = max(dot(n, viewDir), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 r = reflect(-viewDir, n);
  vec3 sky = mix(vec3(0.62, 0.70, 0.76), vec3(0.24, 0.38, 0.55), clamp(r.y, 0.0, 1.0));
  float glint = pow(max(dot(r, sun), 0.0), 220.0) * 2.2;

  float transmit = exp(-uAbsorption * s.depth);
  vec3 body = mix(uDeepColor, uShallowColor, transmit);
  body *= 0.6 + 0.4 * max(dot(n, sun), 0.0);
  vec3 color = mix(body, sky, fresnel) + vec3(1.0, 0.96, 0.88) * glint;

  float alpha = uSurfaceOpacity * clamp(0.5 + 0.5 * (1.0 - transmit) + fresnel * 0.4, 0.0, 1.0);
  alpha *= smoothstep(FLOOD_DRY, FLOOD_DRY + uShallowFade, s.depth) * floodWetFade(s.wet) * uSurfaceAlpha;
  alpha *= floodEdgeMask(s.coverage) * floodOpenMask(s.building);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`;
