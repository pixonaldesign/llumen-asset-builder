/**
 * Dust-storm field sampling. Intensity math matches `dustStormField.ts`:
 * percentile or log clip, then a power curve for height. Wind directions are
 * mixed as sin/cos so a 359° → 1° turn does not swing through south.
 */

export const DUST_FIELD_GLSL = /* glsl */ `
uniform sampler2DArray uField;
uniform sampler2DArray uWind;
uniform float uFrameA;
uniform float uFrameB;
uniform float uFrameMix;
uniform float uRows;
uniform float uCols;
uniform float uSignal;
uniform float uNormMode;
uniform float uClipLow;
uniform float uClipHigh;
uniform float uHeightExponent;
uniform float uMaxHeight;
uniform float uTurbulence;
uniform float uWindAmplitude;
uniform float uWindFrom;
uniform float uLocked;
uniform float uTime;
uniform float uFlat;
uniform float uBlurCells;
uniform float uPointSize;
uniform float uCellMeters;
uniform float uMaxPointPixels;
uniform vec2 uViewport;
uniform float uOpacity;
uniform float uSizeFromIntensity;
uniform float uOpacityFromIntensity;
uniform float uOpacityExponent;
uniform float uGroundOffset;
uniform vec4 uColor0;
uniform vec4 uColor1;
uniform vec4 uColor2;
uniform vec4 uColor3;

vec2 dustCellUv(vec2 uv) {
  return (uv * vec2(uCols - 1.0, uRows - 1.0) + 0.5) / vec2(uCols, uRows);
}

float dustHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float dustNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = dustHash(i);
  float b = dustHash(i + vec2(1.0, 0.0));
  float c = dustHash(i + vec2(0.0, 1.0));
  float d = dustHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float dustFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * dustNoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 dustSample(vec2 uv, float layer) {
  return texture(uField, vec3(dustCellUv(uv), layer)).rgb;
}

float dustRaw(vec2 uv) {
  vec3 a = dustSample(uv, uFrameA);
  vec3 b = dustSample(uv, uFrameB);
  vec3 mixed = mix(a, b, uFrameMix);
  float pm10 = mixed.r;
  float pm25 = mixed.g;
  float coarse = max(pm10 - pm25, 0.0);
  float raw = pm10;
  if (uSignal > 1.5) raw = coarse;
  else if (uSignal > 0.5) raw = pm25;
  return raw;
}

float dustSpeed(vec2 uv) {
  float a = dustSample(uv, uFrameA).b;
  float b = dustSample(uv, uFrameB).b;
  return mix(a, b, uFrameMix);
}

float dustIntensity(vec2 uv) {
  float raw = dustRaw(uv);
  float hi = max(uClipHigh, uClipLow + 0.0001);
  if (uNormMode > 0.5) {
    float lo = log(max(uClipLow, 0.001));
    float high = log(max(hi, exp(lo) + 0.001));
    return clamp((log(max(raw, 0.001)) - lo) / max(high - lo, 0.0001), 0.0, 1.0);
  }
  return clamp((raw - uClipLow) / (hi - uClipLow), 0.0, 1.0);
}

float dustHeight(vec2 uv, float intensity, float seed) {
  float baseHeight = pow(intensity, uHeightExponent) * uMaxHeight;
  float n = dustFbm(uv * 5.0 + vec2(uTime * 0.035, seed * 3.1)) * 2.0 - 1.0;
  float visual = baseHeight + n * intensity * uTurbulence * uMaxHeight;
  visual = max(visual, 0.0);
  if (uFlat > 0.5) visual = 0.0;
  return visual;
}

vec2 dustDrift(vec2 uv, float seed) {
  if (uLocked > 0.5) return vec2(0.0);
  vec2 a = texture(uWind, vec3(dustCellUv(uv), uFrameA)).xy;
  vec2 b = texture(uWind, vec3(dustCellUv(uv), uFrameB)).xy;
  vec2 dir = mix(a, b, uFrameMix);
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(0.0, 1.0);
  if (uWindFrom > 0.5) dir = -dir;
  float phase = sin(uTime * 0.65 + seed * 6.2831853);
  float amp = dustSpeed(uv) * uWindAmplitude * phase;
  return vec2(dir.x * amp, -dir.y * amp);
}

vec4 dustRamp(float t) {
  if (t < 0.33) return mix(uColor0, uColor1, t / 0.33);
  if (t < 0.66) return mix(uColor1, uColor2, (t - 0.33) / 0.33);
  return mix(uColor2, uColor3, clamp((t - 0.66) / 0.34, 0.0, 1.0));
}

float dustPresence(float intensity) {
  float shaped = pow(max(intensity, 0.0), uOpacityExponent);
  float presence = mix(1.0, shaped, uOpacityFromIntensity);
  return uOpacity * presence;
}
`;

export const DUST_POINT_VERTEX = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vIntensity;
uniform sampler2D uSoftField;

${DUST_FIELD_GLSL}

void main() {
  vUv = uv;
  float intensity = texture(uSoftField, dustCellUv(uv)).r;
  vIntensity = intensity;
  vec3 pos = position;
  pos.y += uGroundOffset + dustHeight(uv, intensity, aSeed);
  vec2 drift = dustDrift(uv, aSeed);
  pos.x += drift.x;
  pos.z += drift.y;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  float sizeMeters = uPointSize * mix(1.0, mix(0.45, 1.3, intensity), uSizeFromIntensity);
  // Only a high reading grows toward the next cell. The cap still wins,
  // so zoomed-in dots stay at Max particle px.
  float spill = smoothstep(0.02, 0.18, intensity);
  float coverMeters = mix(sizeMeters, max(sizeMeters, uCellMeters * 1.85), spill);
  vec4 clipEast = projectionMatrix * modelViewMatrix * vec4(pos + vec3(coverMeters, 0.0, 0.0), 1.0);
  float ndc = abs(
    clipEast.x / max(abs(clipEast.w), 0.0001) - clip.x / max(abs(clip.w), 0.0001)
  );
  gl_PointSize = clamp(ndc * uViewport.x * 0.5, 1.25, uMaxPointPixels);
  gl_Position = clip;
}
`;

export const DUST_POINT_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vIntensity;

${DUST_FIELD_GLSL}

void main() {
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float radius = dot(pc, pc);
  if (radius > 1.0) discard;
  float falloff = exp(-1.7 * radius);
  vec4 ramp = dustRamp(vIntensity);
  float alpha = dustPresence(vIntensity) * ramp.a * falloff;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(ramp.rgb, alpha);
}
`;

/** Fixed key light in the local Y-up frame, shared by columns and terrain. */
const DUST_LIGHT_GLSL = /* glsl */ `
const vec3 DUST_LIGHT = vec3(0.4082, 0.8165, 0.4082);
`;

/**
 * One instance per cell. The unit shape spans x/z in [-0.5, 0.5] for boxes
 * and radius 1 for hexes, with y in [0, 1]. Height is linear in intensity.
 */
export const DUST_CELL_VERTEX = /* glsl */ `
attribute vec2 aCenter;
attribute vec2 aSize;
attribute vec2 aCellUv;
uniform float uCoverage;
uniform float uColumnHeight;
varying float vIntensity;
varying vec2 vLocal;
varying float vShade;
varying float vTop;

${DUST_FIELD_GLSL}
${DUST_LIGHT_GLSL}

void main() {
  float intensity = dustIntensity(aCellUv);
  vIntensity = intensity;
  vec2 xz = aCenter + position.xz * aSize * uCoverage;
  vLocal = xz;
  vTop = normal.y;
  float side = 0.62 + 0.3 * max(dot(normal, DUST_LIGHT), 0.0);
  vShade = normal.y > 0.5 ? 1.0 : side;
  vec3 pos = vec3(xz.x, uGroundOffset + position.y * intensity * uColumnHeight, xz.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * Strokes in the heatmap plane. Spacing is one zoom-based ground scale for
 * the whole frame, so pitch and bearing do not bend the repeat. Screen
 * derivatives only antialias the edge.
 * uPattern: 0 solid, 1 diagonal, 2 plus, 3 x, 4 circle, 5 dot.
 */
export const DUST_PATTERN_GLSL = /* glsl */ `
uniform float uPattern;
uniform float uPatternSpacing;
uniform float uPatternStroke;
uniform float uPatternMeters;

float dustPatternCover(float distMeters, float halfWidthMeters, float aa) {
  float band = max(aa, 0.0001);
  return 1.0 - smoothstep(halfWidthMeters - band, halfWidthMeters + band, distMeters);
}

float dustPattern(vec2 localMeters, float intensity) {
  if (uPattern < 0.5) return 1.0;
  float spacingPx = max(uPatternSpacing, 2.0);
  float metersPerPixel = max(uPatternMeters, 0.0001);
  float aa = max(fwidth(localMeters.x), fwidth(localMeters.y));
  float strokePx = min(max(uPatternStroke, 0.0) * clamp(intensity, 0.0, 1.0), spacingPx * 0.85);
  if (strokePx < 0.12) return 0.0;
  float spacing = spacingPx * metersPerPixel;
  float halfStroke = 0.5 * strokePx * metersPerPixel;
  vec2 cell = fract(localMeters / spacing) - 0.5;
  vec2 p = cell * spacing;

  if (uPattern < 1.5) {
    float along = dot(localMeters, vec2(0.70710678, -0.70710678));
    float dist = abs(fract(along / spacing) - 0.5) * spacing;
    return dustPatternCover(dist, halfStroke, aa);
  }
  float arm = spacing * 0.36;
  if (uPattern < 2.5) {
    float horiz = dustPatternCover(abs(p.y), halfStroke, aa)
      * (1.0 - smoothstep(arm, arm + aa, abs(p.x)));
    float vert = dustPatternCover(abs(p.x), halfStroke, aa)
      * (1.0 - smoothstep(arm, arm + aa, abs(p.y)));
    return max(horiz, vert);
  }
  if (uPattern < 3.5) {
    vec2 r = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
    float horiz = dustPatternCover(abs(r.y), halfStroke, aa)
      * (1.0 - smoothstep(arm, arm + aa, abs(r.x)));
    float vert = dustPatternCover(abs(r.x), halfStroke, aa)
      * (1.0 - smoothstep(arm, arm + aa, abs(r.y)));
    return max(horiz, vert);
  }
  if (uPattern < 4.5) {
    float dist = abs(length(p) - spacing * 0.30);
    return dustPatternCover(dist, halfStroke, aa);
  }
  float radius = min(strokePx, spacingPx * 0.42) * metersPerPixel;
  return dustPatternCover(length(p), radius, aa);
}
`;

/**
 * Isolines on the raw reading, so a level means the same µg/m³ whatever the
 * clip. Width is in device pixels through fwidth. Where levels crowd closer
 * than a few line widths they fade out instead of merging into a solid.
 * uContourStyle: 0 auto, 1 darker, 2 lighter, 3 custom.
 */
export const DUST_CONTOUR_GLSL = /* glsl */ `
uniform float uContourOn;
uniform float uContourLog;
uniform float uContourStep;
uniform float uContourMajor;
uniform float uContourWidth;
uniform float uContourStyle;
uniform vec4 uContourColor;
uniform float uContourOpacity;
uniform float uContourLinesOnly;

float dustContourIndex(float raw) {
  if (uContourLog > 0.5) {
    float v = max(raw, 0.0001);
    float decade = floor(log(v) * 0.4342944819 + 0.000001);
    float m = v / pow(10.0, decade);
    float f = m < 2.0 ? m - 1.0 : (m < 5.0 ? 1.0 + (m - 2.0) / 3.0 : 2.0 + (m - 5.0) / 5.0);
    return decade * 3.0 + f;
  }
  return raw / max(uContourStep, 0.0001);
}

float dustContourCover(float raw, out float major) {
  major = 0.0;
  float index = dustContourIndex(raw);
  float fw = max(fwidth(index), 0.00001);
  if (uContourOn < 0.5) return 0.0;
  float level = floor(index + 0.5);
  if (uContourLog > 0.5 ? level < -0.5 : level < 0.5) return 0.0;
  if (uContourLog > 0.5) major = abs(mod(level, 3.0)) < 0.5 ? 1.0 : 0.0;
  else if (uContourMajor > 0.5) major = abs(mod(level, uContourMajor)) < 0.5 ? 1.0 : 0.0;
  float width = uContourWidth * (major > 0.5 ? 1.8 : 1.0);
  float distPx = abs(index - level) / fw;
  float cover = 1.0 - smoothstep(0.5 * width - 0.5, 0.5 * width + 0.5, distPx);
  float spacingPx = 1.0 / fw;
  return cover * smoothstep(2.0 * width, 4.0 * width, spacingPx);
}

vec4 dustApplyContours(vec4 fill, float raw, float intensity) {
  vec4 base = uContourLinesOnly > 0.5 && uContourOn > 0.5 ? vec4(fill.rgb, 0.0) : fill;
  float major;
  float cover = dustContourCover(raw, major);
  if (cover <= 0.0) return base;
  vec3 ramp = dustRamp(intensity).rgb;
  vec3 darker = ramp * 0.38;
  vec3 lighter = mix(ramp, vec3(1.0), 0.45);
  vec3 line = ramp;
  float lineAlpha = uOpacity * uContourOpacity;
  if (uContourStyle > 2.5) {
    line = uContourColor.rgb;
    lineAlpha *= uContourColor.a;
  } else if (uContourStyle > 1.5) {
    line = lighter;
  } else if (uContourStyle > 0.5) {
    line = darker;
  } else if (base.a >= 0.35) {
    float lum = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
    line = lum > 0.45 ? darker : lighter;
  }
  float a = cover * lineAlpha;
  float outA = a + base.a * (1.0 - a);
  vec3 rgb = (line * a + base.rgb * base.a * (1.0 - a)) / max(outA, 0.0001);
  return vec4(rgb, outA);
}
`;

export const DUST_CELL_FRAGMENT = /* glsl */ `
varying float vIntensity;
varying vec2 vLocal;
varying float vShade;
varying float vTop;

${DUST_FIELD_GLSL}
${DUST_PATTERN_GLSL}

void main() {
  vec4 ramp = dustRamp(vIntensity);
  float pattern = vTop > 0.5 ? dustPattern(vLocal, vIntensity) : 1.0;
  float alpha = dustPresence(vIntensity) * ramp.a * pattern;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(ramp.rgb * vShade, alpha);
}
`;

/**
 * Soft sheet raised by the blurred field. The slope comes from the same
 * texture, so shading follows the smoothed surface, not the raw cells.
 */
export const DUST_TERRAIN_VERTEX = /* glsl */ `
uniform sampler2D uSoftField;
uniform float uColumnHeight;
/** Signed meters per column (x) and per row (z). */
uniform vec2 uCellStep;
varying vec2 vUv;
varying vec2 vLocal;
varying float vIntensity;
varying float vShade;

${DUST_FIELD_GLSL}
${DUST_LIGHT_GLSL}

float dustSoftAt(vec2 uv) {
  return texture(uSoftField, dustCellUv(uv)).r;
}

void main() {
  vUv = uv;
  vLocal = position.xz;
  float intensity = dustSoftAt(uv);
  vIntensity = intensity;
  vec2 du = vec2(1.0 / max(uCols - 1.0, 1.0), 0.0);
  vec2 dv = vec2(0.0, 1.0 / max(uRows - 1.0, 1.0));
  float dhdx = (dustSoftAt(uv + du) - dustSoftAt(uv - du)) * uColumnHeight
    / (2.0 * (abs(uCellStep.x) > 0.001 ? uCellStep.x : 1.0));
  float dhdz = (dustSoftAt(uv + dv) - dustSoftAt(uv - dv)) * uColumnHeight
    / (2.0 * (abs(uCellStep.y) > 0.001 ? uCellStep.y : 1.0));
  vec3 n = normalize(vec3(-dhdx, 1.0, -dhdz));
  vShade = clamp(0.35 + 0.8 * dot(n, DUST_LIGHT), 0.35, 1.05);
  vec3 pos = position;
  pos.y += uGroundOffset + intensity * uColumnHeight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/** Field is sampled per fragment so contour lines stay crisp between vertices. */
export const DUST_TERRAIN_FRAGMENT = /* glsl */ `
uniform sampler2D uSoftField;
varying vec2 vUv;
varying vec2 vLocal;
varying float vIntensity;
varying float vShade;

${DUST_FIELD_GLSL}
${DUST_PATTERN_GLSL}
${DUST_CONTOUR_GLSL}

void main() {
  vec2 soft = texture(uSoftField, dustCellUv(vUv)).rg;
  vec4 ramp = dustRamp(soft.r);
  float alpha = dustPresence(soft.r) * ramp.a * dustPattern(vLocal, soft.r);
  vec4 color = dustApplyContours(vec4(ramp.rgb * vShade, alpha), soft.g, soft.r);
  if (color.a < 0.02) discard;
  gl_FragColor = color;
}
`;

export const DUST_SOFT_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec2 vLocal;
uniform float uGroundOffset;

void main() {
  vUv = uv;
  vLocal = position.xz;
  vec3 pos = position;
  pos.y += uGroundOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/**
 * Capture pass samples the blurred cell texture. Present pass samples the
 * screen frost at the same pixel so the sheet can still depth-test. Patterns
 * and contour lines draw in the present pass so the frost does not soften them.
 */
export const DUST_SOFT_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec2 vLocal;
uniform sampler2D uSoftField;
uniform sampler2D uFrost;
uniform float uReadFrost;

${DUST_FIELD_GLSL}
${DUST_PATTERN_GLSL}
${DUST_CONTOUR_GLSL}

void main() {
  if (uReadFrost > 0.5) {
    vec2 screenUv = gl_FragCoord.xy / max(uViewport, vec2(1.0));
    vec4 frosted = texture(uFrost, screenUv);
    vec2 soft = texture(uSoftField, dustCellUv(vUv)).rg;
    float intensity = soft.r;
    vec4 fill = frosted;
    if (uPattern > 0.5) {
      vec4 ramp = dustRamp(intensity);
      float cover = dustPresence(intensity) * ramp.a;
      // Frost alpha matches cover inside the sheet and falls off at the blur edge.
      float fade = clamp(frosted.a / max(cover, 0.02), 0.0, 1.0);
      fill = vec4(ramp.rgb, cover * dustPattern(vLocal, intensity) * fade);
    }
    vec4 color = dustApplyContours(fill, soft.g, intensity);
    if (color.a < 0.004) discard;
    gl_FragColor = color;
    return;
  }
  float intensity = texture(uSoftField, dustCellUv(vUv)).r;
  vec4 ramp = dustRamp(intensity);
  float alpha = dustPresence(intensity) * ramp.a;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(ramp.rgb, alpha);
}
`;
