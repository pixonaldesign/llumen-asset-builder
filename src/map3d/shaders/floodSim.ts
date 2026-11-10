/**
 * Virtual pipe shallow-water model (Mei, Decaudin & Hu 2007) on the flood grid.
 *
 * State target: r depth (m), g flow east (m/s), b flow north (m/s).
 * Flux target: outflow to the west, east, south, north neighbors (m³/s).
 * Row 0 is south, so "north" is +row. Roofs are walls: their cells hold no water
 * and pass no flux. Open-water cells are a fixed-level boundary.
 */
export const FLOOD_SIM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FLOOD_SIM_COMMON = /* glsl */ `
uniform sampler2D uGrid;
uniform sampler2D uBuildings;
uniform float uCols;
uniform float uRows;
uniform float uCell;
uniform float uDt;
uniform float uHarborLevel;

bool simInside(ivec2 c) {
  return c.x >= 0 && c.y >= 0 && c.x < int(uCols) && c.y < int(uRows);
}

bool simWall(ivec2 c) {
  return texelFetch(uBuildings, c, 0).r > 0.5;
}

bool simHarbor(ivec2 c) {
  return mod(floor(texelFetch(uGrid, c, 0).a + 0.5), 2.0) > 0.5;
}

float simGround(ivec2 c) {
  return texelFetch(uGrid, c, 0).r;
}
`;

/** Starting state: open water at the harbor level, land dry. */
export const FLOOD_SIM_INIT_FRAGMENT = /* glsl */ `
${FLOOD_SIM_COMMON}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float depth = simHarbor(c) ? max(uHarborLevel - simGround(c), 0.0) : 0.0;
  gl_FragColor = vec4(depth, 0.0, 0.0, 1.0);
}
`;

export const FLOOD_SIM_FLUX_FRAGMENT = /* glsl */ `
${FLOOD_SIM_COMMON}
uniform sampler2D uState;
uniform sampler2D uFlux;
uniform float uDamping;

float simHead(ivec2 c) {
  return simGround(c) + texelFetch(uState, c, 0).r;
}

float simPipe(float previous, float head, ivec2 n) {
  if (!simInside(n) || simWall(n)) return 0.0;
  return max(0.0, previous * uDamping + uDt * 9.81 * uCell * (head - simHead(n)));
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float depth = texelFetch(uState, c, 0).r;
  if (simWall(c) || depth <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float head = simGround(c) + depth;
  vec4 f = texelFetch(uFlux, c, 0);
  vec4 next = vec4(
    simPipe(f.x, head, c + ivec2(-1, 0)),
    simPipe(f.y, head, c + ivec2(1, 0)),
    simPipe(f.z, head, c + ivec2(0, -1)),
    simPipe(f.w, head, c + ivec2(0, 1)));
  float outflow = (next.x + next.y + next.z + next.w) * uDt;
  float volume = depth * uCell * uCell;
  if (outflow > volume) next *= volume / outflow;
  gl_FragColor = next;
}
`;

export const FLOOD_SIM_STATE_FRAGMENT = /* glsl */ `
${FLOOD_SIM_COMMON}
uniform sampler2D uState;
uniform sampler2D uFlux;
/** Rain in meters per second. */
uniform float uRain;
/** Cubic meters per second spread over the breach disc. */
uniform float uBreachFlow;
uniform vec2 uBreachCell;
uniform float uBreachRadius;
uniform float uBreachCells;

vec4 simFluxAt(ivec2 c) {
  return simInside(c) ? texelFetch(uFlux, c, 0) : vec4(0.0);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  if (simWall(c)) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float depth = texelFetch(uState, c, 0).r;
  vec4 f = texelFetch(uFlux, c, 0);
  float inWest = simFluxAt(c + ivec2(-1, 0)).y;
  float inEast = simFluxAt(c + ivec2(1, 0)).x;
  float inSouth = simFluxAt(c + ivec2(0, -1)).w;
  float inNorth = simFluxAt(c + ivec2(0, 1)).z;
  float net = inWest + inEast + inSouth + inNorth - (f.x + f.y + f.z + f.w);
  float area = uCell * uCell;
  float next = max(0.0, depth + uDt * net / area);
  next += uRain * uDt;
  if (uBreachFlow > 0.0 && distance(vec2(c), uBreachCell) <= uBreachRadius) {
    next += uBreachFlow * uDt / (area * max(uBreachCells, 1.0));
  }
  if (simHarbor(c)) next = max(uHarborLevel - simGround(c), 0.0);
  float mean = max(0.5 * (depth + next), 0.05);
  float east = 0.5 * ((inWest - f.x) + (f.y - inEast)) / (uCell * mean);
  float north = 0.5 * ((inSouth - f.z) + (f.w - inNorth)) / (uCell * mean);
  gl_FragColor = vec4(next, clamp(east, -8.0, 8.0), clamp(north, -8.0, 8.0), 1.0);
}
`;
