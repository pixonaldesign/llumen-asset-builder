/**
 * One oil slick from a density field. Overlapping particles raise the field
 * into a single blob; once they drift apart the field falls apart into
 * separate slicks. The oil film shades that field, not each particle.
 */

/**
 * Local film thickness is the hourly thickness times this factor, from the
 * thinnest sheen to the densest pile. The palette domain uses the same span.
 */
export const OIL_THICKNESS_SPREAD = [0.3, 1.6] as const;

export const OIL_SPILL_VERTEX = /* glsl */ `
uniform vec2 uFieldOrigin;
uniform vec2 uFieldSize;

varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vUv = (world.xz - uFieldOrigin) / max(uFieldSize, vec2(1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const OIL_SPILL_FRAGMENT = /* glsl */ `
uniform sampler2D uDensity;
uniform float uTime;
uniform float uAdvect;
uniform float uThreshold;
uniform float uSurface;
uniform float uThicknessNm;
uniform float uResidual;
uniform float uBrightness;
uniform float uSaturation;
uniform float uRimSheen;
uniform float uRimThickness;
uniform float uAnimateSheen;
uniform float uSheenSpeed;
uniform float uSheenMaskScale;
uniform float uSheenMaskStrength;
uniform float uTrailMaskScale;
uniform sampler2D uSheenRamp;
uniform float uSheenRampOn;
uniform float uRealistic;
uniform float uStreakScale;
uniform float uColorFade;
uniform vec2 uThicknessLogRange;
uniform vec3 uFillColor;
uniform float uTrailNoise;
uniform float uTrailOpacity;
uniform vec3 uCameraPos;
uniform sampler2D uWaterMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;
uniform float uMaskReady;
uniform vec2 uFieldSize;
uniform vec2 uTexel;

varying vec2 vUv;
varying vec3 vWorld;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

float filmPath(float thicknessNm, float cosTheta, float wobble) {
  float nFilm = 1.48;
  float sinAir2 = max(0.0, 1.0 - cosTheta * cosTheta);
  float cosInFilm = sqrt(max(0.0, 1.0 - sinAir2 / (nFilm * nFilm)));
  float spin = uAnimateSheen * uSheenSpeed * uTime * 220.0;
  return 2.0 * nFilm * max(thicknessNm, 80.0) * cosInFilm + wobble + spin;
}

vec3 thinFilm(float thicknessNm, float cosTheta, float wobble) {
  float path = filmPath(thicknessNm, cosTheta, wobble);
  if (uSheenRampOn > 0.5) {
    float t = fract(path / 1400.0);
    return srgbToLinear(texture2D(uSheenRamp, vec2(t, 0.5)).rgb);
  }
  vec3 lambda = vec3(640.0, 530.0, 460.0);
  return (sin(6.2831853 * path / lambda) * 0.5 + 0.5) * vec3(1.05, 0.95, 0.85);
}

vec4 texField(vec2 uv) {
  return texture2D(uDensity, uv);
}

vec4 sampleField(vec2 uv) {
  vec2 g = uv / uTexel - 0.5;
  vec2 base = (floor(g) + 0.5) * uTexel;
  vec2 f = fract(g);
  f = f * f * (3.0 - 2.0 * f);
  vec4 a = texField(base);
  vec4 b = texField(base + vec2(uTexel.x, 0.0));
  vec4 c = texField(base + vec2(0.0, uTexel.y));
  vec4 d = texField(base + uTexel);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Meters, not field UVs, so a close zoom still sees a crisp ripple
// instead of one soft wave stretched across the whole slick.
float liquidNoise(vec2 world) {
  vec2 p = world * 0.009;
  float n = noise(p);
  n += noise(p * 2.8 + 5.2) * 0.5;
  n += noise(p * 6.5 - 3.1) * 0.25;
  return n / 1.75;
}

// Warped coordinates, carried downstream with the spill and stretched along it.
vec2 filmWarp(vec2 world, vec2 dir, float scale) {
  float motion = uTime * uAnimateSheen * max(uSheenSpeed, 0.0) * uAdvect;
  vec2 heading = dot(dir, dir) > 0.04 ? normalize(dir) : vec2(0.0);
  vec2 p;
  if (dot(heading, heading) > 0.5) {
    vec2 side = vec2(-heading.y, heading.x);
    vec2 carried = world - heading * motion * 16.0;
    p = vec2(dot(carried, heading) * 0.0045, dot(world, side) * 0.014) * scale;
  } else {
    p = world * 0.008 * scale;
  }
  vec2 q = vec2(noise(p), noise(p + vec2(5.2, 1.3))) - 0.5;
  vec2 r = vec2(
    noise(p + q * 1.8 + vec2(1.7, 8.3)),
    noise(p + q * 1.8 + vec2(8.3, 1.7))
  ) - 0.5;
  return p + r * 2.4;
}

// Grayscale opacity mask on the warped coordinates.
// scale 1 is the sheen. A higher scale combs the trail into finer filaments.
// The legacy color gradient never reads this value.
float filmOpacity(vec2 world, vec2 dir, float scale) {
  vec2 warped = filmWarp(world, dir, scale);
  float n = noise(warped);
  n += noise(warped * 2.6 + 3.1) * 0.45;
  return n / 1.45;
}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Reflection off an oil film (n 1.48) on water. Air to oil flips the phase,
// oil to water does not, so the thinnest film starts dark. Coherence decays
// with thickness, which washes thick oil out to a metallic gray.
// Each channel averages three wavelengths across its band. One wavelength per
// channel gives neon RGB stripes; the spread gives the softer magenta, gold
// and teal of a real film, and higher orders blur out on their own.
vec3 filmInterference(float thicknessNm, float cosTheta) {
  float nFilm = 1.48;
  float cosInFilm = sqrt(max(0.0, 1.0 - (1.0 - cosTheta * cosTheta) / (nFilm * nFilm)));
  float k = 6.2831853 * 2.0 * nFilm * thicknessNm * cosInFilm;
  vec3 r = cos(k / vec3(600.0, 640.0, 690.0) + 3.14159265);
  vec3 g = cos(k / vec3(500.0, 535.0, 570.0) + 3.14159265);
  vec3 b = cos(k / vec3(420.0, 450.0, 480.0) + 3.14159265);
  vec3 wave = vec3(dot(r, vec3(1.0)), dot(g, vec3(1.0)), dot(b, vec3(1.0))) / 3.0;
  float coherence = exp(-thicknessNm / mix(2600.0, 450.0, uColorFade));
  return 0.5 + 0.5 * coherence * wave;
}

float slickHeight(vec2 world) {
  return liquidNoise(world * 3.0 + vec2(uTime * 9.0, -uTime * 6.0));
}

vec4 shadeRealistic(
  float blob,
  float softBlob,
  float trail,
  vec2 world,
  vec2 spillDir,
  vec3 viewDir,
  float cosTheta,
  float drift
) {
  // Thickness is the density, broken up by wind streaks carried with the
  // spill and a slower swirl, so colors change over meters, not kilometers.
  // Streaks run a few hundred meters; finer ones read as static at map zoom.
  float streak = noise(filmWarp(world, spillDir, max(uStreakScale, 0.05) * 0.25));
  float swirl = liquidNoise(world * 0.45 + vec2(drift * 0.3, -drift * 0.2));
  // A soft wake blend; a hard step left stepped shards where the brush
  // stamps of the residue cross the body.
  float trailEdge = smoothstep(uThreshold * 0.12, uThreshold * 0.45, trail);
  float wake = trailEdge * (1.0 - smoothstep(uThreshold * 0.3, uThreshold, softBlob));
  float body = smoothstep(uThreshold * 0.45, 1.3, softBlob);
  body = mix(body, 0.1, wake);
  // Thick crude is a small share of a real slick; most of the area is sheen.
  float coreStart = mix(0.45, 1.05, clamp(uRimThickness, 0.0, 1.0));
  float nearCore = smoothstep(coreStart - 0.15, coreStart, body);
  // One color cycle is under 200 nm of film. The noise swing stays within a
  // couple of cycles so the bands read as broad swatches, not contour lines,
  // and the lumpy particle field only biases the thickness.
  float shimmer = 1.0 + 0.05 * uAnimateSheen * sin(uTime * uSheenSpeed * 0.8 + swirl * 6.2831853);
  float thicknessNm = mix(110.0, 650.0, body) + nearCore * 1100.0;
  thicknessNm += (streak - 0.5) * 440.0 + (swirl - 0.5) * 260.0;
  thicknessNm = max(thicknessNm, 30.0) * shimmer;

  vec3 irid = filmInterference(thicknessNm, cosTheta);
  // Under about 150 nm the film is a gray silver sheen, not a rainbow.
  float silver = smoothstep(70.0, 240.0, thicknessNm);
  vec3 film = mix(vec3(dot(irid, LUMA)), irid, silver * uSaturation);
  film = max(film, 0.0) * mix(1.0, 0.6, smoothstep(1400.0, 3200.0, thicknessNm));

  // Glint off the ripple, from a fixed low sun. Oil damps capillary waves,
  // so the slick is smoother and the glint is tighter on the crude.
  float e = 5.0;
  float h0 = slickHeight(world);
  float hx = slickHeight(world + vec2(e, 0.0));
  float hz = slickHeight(world + vec2(0.0, e));
  vec3 normal = normalize(vec3((h0 - hx) * 5.0, 1.0, (h0 - hz) * 5.0));
  vec3 halfDir = normalize(normalize(vec3(-0.35, 0.8, 0.45)) + viewDir);
  float facing = max(dot(normal, halfDir), 0.0);

  // Scale back by the brightest channel instead of clamping each one, so a
  // high brightness keeps the hue rather than bleaching to white.
  vec3 sheen = film * (0.55 + 0.45 * uBrightness);
  sheen /= max(1.0, max(sheen.r, max(sheen.g, sheen.b)));
  sheen += pow(facing, 40.0) * 0.18;

  // Crude core. Its edge is patchy, broken into brown swatches by the streaks.
  float crudeWeight = clamp(uThicknessNm / 4500.0, 0.0, 1.0);
  float coreField = body + (streak - 0.5) * 0.45 + (swirl - 0.5) * 0.15;
  float coreAmt = smoothstep(coreStart, coreStart + 0.1, coreField) * crudeWeight * (1.0 - wake);
  vec3 crude = vec3(0.07, 0.04, 0.018);
  vec3 core = mix(crude, uFillColor, uRimSheen);
  // Thick oil still mirrors a dull metallic tint, so a black fill is not a hole.
  core = mix(core, sheen * (0.6 + 0.8 * streak), 0.07);
  core += pow(facing, 120.0) * 0.35 + pow(facing, 12.0) * 0.03;
  vec3 color = mix(sheen, core, coreAmt);

  if (uSheenRampOn > 0.5) {
    // Data-mapped palette. The data has one thickness per hour; local
    // density spreads it from thin sheen to the thickest pile, on a log
    // domain fixed for the run. The film's banding and the streaks only
    // shade the palette color, so it still reads as liquid.
    float spread = mix(${OIL_THICKNESS_SPREAD[0].toFixed(3)}, ${OIL_THICKNESS_SPREAD[1].toFixed(3)}, body);
    float localMm = max(uThicknessNm * 1e-6 * spread, 1e-4);
    float span = max(uThicknessLogRange.y - uThicknessLogRange.x, 0.01);
    float t = (log(localMm) - uThicknessLogRange.x) / span;
    t = clamp(t + (streak - 0.5) * 0.06, 0.0, 1.0);
    vec3 ramp = texture2D(uSheenRamp, vec2(t, 0.5)).rgb;
    vec3 tinted = ramp * (0.75 + 0.55 * dot(irid, LUMA));
    tinted = mix(tinted, ramp * 0.62, coreAmt);
    color = tinted + pow(facing, 40.0) * 0.14 * (1.0 - coreAmt)
      + pow(facing, 120.0) * 0.3 * coreAmt;
  }

  // Sheen is a faint reflection: the thinnest silver is barely there, the
  // rainbow is stronger, and grazing views reflect more.
  float presence = max(uResidual, mix(0.55, 1.0, smoothstep(0.0, 0.22, uSurface)));
  float sheenAlpha = mix(0.35, 0.95, smoothstep(60.0, 600.0, thicknessNm)) * presence;
  sheenAlpha *= mix(0.85, 1.3, pow(1.0 - cosTheta, 3.0)) * mix(1.0, uBrightness, 0.3);
  float filmNoise = filmOpacity(world, spillDir, max(uSheenMaskScale, 0.05));
  float sheenCover = mix(0.5, 1.0, smoothstep(0.18, 0.82, filmNoise));
  sheenAlpha *= mix(1.0, sheenCover, clamp(uSheenMaskStrength, 0.0, 1.0));

  // A soft, streak-ragged edge instead of a cut contour.
  float edgeField = blob * (0.7 + 0.6 * streak);
  float edge = smoothstep(uThreshold * 0.3, uThreshold * 0.9, edgeField);
  float blobAlpha = edge * mix(sheenAlpha, 0.9, coreAmt);

  float trailNoise = filmOpacity(world, spillDir, max(uTrailMaskScale, 0.05));
  float trailCover = mix(0.04, 1.0, smoothstep(0.22, 0.78, trailNoise));
  float trailAlpha = trailEdge * (1.0 - edge) * uTrailOpacity * sheenAlpha
    * mix(1.0, trailCover, clamp(uTrailNoise, 0.0, 1.0));

  return vec4(color, clamp(max(blobAlpha, trailAlpha), 0.0, 1.0));
}

void main() {
  if (vUv.x < 0.0 || vUv.y < 0.0 || vUv.x > 1.0 || vUv.y > 1.0) discard;

  if (uMaskReady > 0.5) {
    vec2 maskUv = (vWorld.xz - uMaskMin) / uMaskSize;
    if (maskUv.x >= 0.0 && maskUv.y >= 0.0 && maskUv.x <= 1.0 && maskUv.y <= 1.0) {
      vec3 cover = texture2D(uWaterMask, maskUv).rgb;
      // Green is land inside a loaded map tile. Black is a tile that has not
      // loaded, and clipping there would stop the slick on a tile edge.
      if (cover.g > 0.5 && cover.r < 0.5) discard;
    }
  }

  vec4 field = sampleField(vUv);
  // Red is this frame's particles, sampled where they are. The wake's
  // outline is pushed by a liquid ripple of a few tens of meters, which
  // does not slide the body off the disc.
  float blob = field.x;
  float drift = uTime * 28.0 * uAdvect;
  vec2 world = vWorld.xz;
  float n1 = liquidNoise(world + vec2(drift, -drift * 0.6));
  float n2 = liquidNoise(world + vec2(23.0, -11.0) + vec2(-drift * 0.55, drift * 0.8));
  vec2 meters = vec2(n1, n2) - 0.5;
  meters *= 140.0 * uAdvect;
  vec2 trailUv = clamp(vUv + meters / max(uFieldSize, vec2(1.0)), 0.0, 1.0);
  float trail = sampleField(trailUv).w;
  // A wide density fade turns the sheen into a black skirt on the dark map.
  // The contour is the density itself; the screen blur covers the pixel step.
  float blobMask = step(uThreshold * 0.45, blob);
  float trailMask = step(uThreshold * 0.22, trail);

  if (uRealistic > 0.5) {
    if (blob < uThreshold * 0.15 && trail < uThreshold * 0.1) discard;
    vec3 eye = normalize(uCameraPos - vWorld);
    vec2 spread = uTexel * 1.5;
    float softBlob = 0.2 * blob + 0.2 * (
      sampleField(vUv + vec2(spread.x, 0.0)).x +
      sampleField(vUv - vec2(spread.x, 0.0)).x +
      sampleField(vUv + vec2(0.0, spread.y)).x +
      sampleField(vUv - vec2(0.0, spread.y)).x
    );
    vec4 slick = shadeRealistic(
      blob, softBlob, trail, world, field.yz, eye,
      clamp(abs(eye.y), 0.08, 1.0), drift
    );
    if (slick.a < 0.004) discard;
    gl_FragColor = slick;
    return;
  }

  if (blobMask < 0.004 && trailMask < 0.004) discard;
  float density = blob;
  float inward = smoothstep(0.25, 1.6, log(1.0 + max(density, 0.0) * 0.45));
  float film = smoothstep(0.0, 0.22, uSurface);
  float stamp = smoothstep(uThreshold, 1.05, density);
  float wake = trailMask * (1.0 - blobMask);

  vec3 viewDir = normalize(uCameraPos - vWorld);
  float cosTheta = clamp(abs(viewDir.y), 0.08, 1.0);
  // Color follows thickness only, so the bands stay a smooth gradient.
  float thickness = mix(340.0, 820.0, cosTheta) + inward * 420.0;
  vec3 irid = thinFilm(thickness, cosTheta, 0.0);
  vec3 crude = vec3(0.045, 0.026, 0.012);
  // The stamp peaks near 1, so thickness darkens the core of the current
  // particles. The log curve never reached 1 under the paint cap, which left
  // the whole slick as sheen.
  float crudeWeight = clamp(uThicknessNm / 4500.0, 0.0, 1.0) * smoothstep(0.55, 1.2, blob);
  float reach = mix(0.32, 1.65, clamp(uRimThickness, 0.0, 1.0));
  float rim = (1.0 - smoothstep(0.16, reach, density)) * uRimSheen;

  float luma = dot(irid, vec3(0.2126, 0.7152, 0.0722));
  vec3 sheen = mix(vec3(luma), irid, uSaturation) * uBrightness;
  // The dark fill stays in the core. Mixing it into the rim painted a black
  // stroke over the sheen where the edge fades out.
  vec3 core = mix(crude * min(uBrightness, 1.35), uFillColor, uRimSheen);
  // Cut to the fill inside the rim. Blending toward black across the rim
  // was the drop shadow on the noise.
  float coreAmt = crudeWeight * step(0.98, 1.0 - rim);
  vec3 color = mix(sheen, core, clamp(coreAmt, 0.0, 1.0));

  float presence = max(uResidual, stamp * mix(0.5, 0.92, film));
  float bodyAlpha = blobMask * presence * mix(0.65, 0.95, inward);
  float rimAlpha = blobMask * smoothstep(0.2, 0.65, rim);
  float blobAlpha = max(bodyAlpha, rimAlpha);
  vec2 spillDir = field.yz;
  float trailNoise = filmOpacity(world, spillDir, max(uTrailMaskScale, 0.05));
  float trailCover = mix(0.04, 1.0, smoothstep(0.22, 0.78, trailNoise));
  float trailAlpha = wake * uTrailOpacity * mix(1.0, trailCover, clamp(uTrailNoise, 0.0, 1.0));
  float alpha = max(blobAlpha, trailAlpha);
  alpha = clamp(alpha * mix(1.0, uBrightness, 0.65), 0.0, 1.0);
  // Sheen opacity only. The trail has its own finer mask above.
  float filmNoise = filmOpacity(world, spillDir, max(uSheenMaskScale, 0.05));
  float sheenMask = clamp(rim * (1.0 - wake) * (1.0 - coreAmt), 0.0, 1.0);
  float sheenCover = mix(0.12, 1.0, smoothstep(0.18, 0.82, filmNoise));
  alpha *= mix(1.0, sheenCover, sheenMask * clamp(uSheenMaskStrength, 0.0, 1.0));
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`;
