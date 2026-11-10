import defaultPreset from "./configs/default.json";
import { sanitizeColorRamp } from "@/lib/colorRamp";
import { sanitizePrimitiveId } from "@/lib/modelCatalog";
import type {
  FlagAuraAnimation,
  FlagAuraAssignMode,
  FlagAuraSettings,
  LightingSettings,
  MaterialSettings,
  PlaygroundConfig,
  DustHeatPattern,
  DustStormSettings,
  FloodScenario,
  FloodSettings,
  OilSpillSettings,
  PointVisual,
  RendererSettings,
  WaterGradientSettings,
} from "@/lib/types";
import { DEFAULT_FLAG_AURA, sanitizeBeaconMark } from "@/lib/flagAura";
import { sanitizeSheenPalette } from "@/lib/sheenPalettes";
import { normalizeOpacityRange } from "@/lib/featureOpacity";
import { sanitizeMarkerLod } from "@/lib/markerLod";
import {
  DEFAULT_ZOOM_SCALE_MAX_PIXELS,
  DEFAULT_ZOOM_SCALE_MIN_PIXELS,
  normalizeZoomPixelBounds,
} from "@/lib/zoomScaling";

export const CONFIG_VERSION = 16;
/** Sim seconds per real second. A recorded storm runs about a day of sim time. */
export const FLOOD_SIM_MAX_SPEED = 960;
export const FLOOD_RAIN_MAX_TIME_LAPSE = 600;

export const DEFAULT_WATER_GRADIENT: WaterGradientSettings = {
  color: "#ff5e62",
  radiusMeters: 280,
  radiusFromValue: false,
  distortion: 40,
  noiseScale: 0.015,
  octaves: 3,
  animationSpeed: 0,
  stemMinHeightMeters: 8000,
  stemMaxHeightMeters: 42000,
  stemWidthPixels: 2.4,
  stemFadeStartZoom: 9,
  stemFadeEndZoom: 12.5,
};

export const DEFAULT_OIL_SPILL: OilSpillSettings = {
  radiusMeters: 650,
  hoursPerSecond: 4,
  residualSheen: 0.23,
  brightness: 2.5,
  saturation: 2,
  rimSheen: true,
  rimThickness: 0.43,
  animateSheen: true,
  sheenSpeed: 0.6,
  sheenMaskStrength: 0.8,
  sheenMaskScale: 1,
  sheenPalette: "thin-film",
  realisticSheen: true,
  sheenStreakScale: 1.5,
  sheenColorFade: 0.5,
  fillColor: "#000000",
  trailNoise: 0.67,
  trailMaskScale: 1.6,
  playing: true,
  trailStrength: 0.02,
  trailOpacity: 0.42,
  showParticles: false,
  showPathway: true,
  pathwayOpacity: 0.37,
  showStem: true,
  stemHeightMeters: 24000,
  stemWidthPixels: 2.4,
  stemFadeStartZoom: 7,
  stemFadeEndZoom: 9.5,
};

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const DEFAULT_DUST_STORM: DustStormSettings = {
  view: "particles",
  particlesExtruded: true,
  placement: "flow",
  blurCells: 1.5,
  cellShape: "square",
  hexSizeCells: 2,
  coverage: 1,
  heatmapExtruded: false,
  heatmapHeightMeters: 25000,
  contourEnabled: false,
  contourSpacing: "log",
  contourStep: 5,
  contourMajorEvery: 5,
  contourStyle: "auto",
  contourColor: "#ffffffcc",
  contourOpacity: 0.7,
  contourWidth: 1.5,
  contourLinesOnly: false,
  pattern: "solid",
  patternSpacing: 8,
  patternStroke: 3,
  signal: "pm10",
  normalization: "percentile-power",
  lowerPercentile: 10,
  upperPercentile: 99,
  heightExponent: 0.65,
  maxHeightMeters: 28000,
  turbulence: 0.22,
  windAmplitude: 450,
  windConvention: "from",
  particlesPerCell: 4,
  pointSizeMeters: 2400,
  maxPointPixels: 28,
  opacity: 0.72,
  sizeFromIntensity: 0.65,
  opacityFromIntensity: 0.85,
  opacityExponent: 0.8,
  hoursPerSecond: 1,
  playing: true,
  frame: 0,
  colorLow: "#f4e4c4",
  colorMid: "#e2a14a",
  colorHigh: "#e06a1c",
  colorExtreme: "#7a3412",
};

export const DEFAULT_FLOOD: FloodSettings = {
  view: "both",
  scenario: "sim",
  frame: 60,
  playing: true,
  hoursPerSecond: 1.5,
  levelOffset: 0,
  palette: "flood",
  heatmapOpacity: 0.8,
  maxDepthMeters: 3,
  depthBands: false,
  bandStepMeters: 0.5,
  buildingSource: "auto",
  surfaceFadeStartZoom: 13.2,
  surfaceFadeEndZoom: 14.6,
  surfaceOpacity: 1,
  shallowColor: "#00d9ff",
  deepColor: "#051c2f",
  absorption: 1.29,
  edgeSmoothing: 1,
  shallowFadeMeters: 0.05,
  waveStrength: 0.43,
  waveSpeed: 1.8,
  showHarbor: true,
  terrain: false,
  terrainExaggeration: 1,
  simSource: "breach",
  simSurgeMeters: 2.7,
  simRainMmPerHour: 90,
  simRainRecorded: true,
  simRainTimeLapse: 240,
  simBreachFlow: 3000,
  /** South Street by the Seaport: open street about 2.2 m NAVD88 behind the East River edge. */
  simBreachLng: -74.00337,
  simBreachLat: 40.70581,
  simSubsteps: 16,
  simSpeed: 1,
  flowLines: true,
  flowLineDensity: 0.25,
  flowLineSeconds: 3.5,
  flowLineOpacity: 1,
  flowLineColor: "#88d8eade",
};

const FLOOD_SCENARIOS: readonly FloodScenario[] = [
  "sandy",
  "slr",
  "stormwater-moderate-current",
  "stormwater-moderate-2050",
  "stormwater-extreme-2080",
  "sim",
];

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeFlood(
  value: unknown,
  fallback: FloodSettings = DEFAULT_FLOOD,
): FloodSettings {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Partial<FloodSettings>)
      : {};
  const bool = (v: unknown, f: boolean) => (typeof v === "boolean" ? v : f);
  const fadeStart = clampNumber(
    raw.surfaceFadeStartZoom,
    fallback.surfaceFadeStartZoom,
    8,
    20,
  );
  return {
    view:
      raw.view === "heatmap" || raw.view === "surface" || raw.view === "both"
        ? raw.view
        : fallback.view,
    scenario: FLOOD_SCENARIOS.includes(raw.scenario as FloodScenario)
      ? (raw.scenario as FloodScenario)
      : fallback.scenario,
    frame: clampNumber(raw.frame, fallback.frame, 0, 100000),
    playing: bool(raw.playing, fallback.playing),
    hoursPerSecond: clampNumber(raw.hoursPerSecond, fallback.hoursPerSecond, 0, 24),
    levelOffset: clampNumber(raw.levelOffset, fallback.levelOffset, -2, 6),
    palette:
      typeof raw.palette === "string" && raw.palette.trim()
        ? raw.palette
        : fallback.palette,
    heatmapOpacity: clampNumber(raw.heatmapOpacity, fallback.heatmapOpacity, 0, 1),
    maxDepthMeters: clampNumber(raw.maxDepthMeters, fallback.maxDepthMeters, 0.1, 20),
    depthBands: bool(raw.depthBands, fallback.depthBands),
    bandStepMeters: clampNumber(raw.bandStepMeters, fallback.bandStepMeters, 0.05, 5),
    buildingSource:
      raw.buildingSource === "auto" ||
      raw.buildingSource === "mapbox" ||
      raw.buildingSource === "baked"
        ? raw.buildingSource
        : fallback.buildingSource,
    surfaceFadeStartZoom: fadeStart,
    surfaceFadeEndZoom: Math.max(
      fadeStart,
      clampNumber(raw.surfaceFadeEndZoom, fallback.surfaceFadeEndZoom, 8, 22),
    ),
    surfaceOpacity: clampNumber(raw.surfaceOpacity, fallback.surfaceOpacity, 0, 1),
    shallowColor: sanitizeHexColor(raw.shallowColor, fallback.shallowColor),
    deepColor: sanitizeHexColor(raw.deepColor, fallback.deepColor),
    absorption: clampNumber(raw.absorption, fallback.absorption, 0, 5),
    edgeSmoothing: clampNumber(raw.edgeSmoothing, fallback.edgeSmoothing, 0, 1),
    shallowFadeMeters: clampNumber(raw.shallowFadeMeters, fallback.shallowFadeMeters, 0.01, 0.5),
    waveStrength: clampNumber(raw.waveStrength, fallback.waveStrength, 0, 2),
    waveSpeed: clampNumber(raw.waveSpeed, fallback.waveSpeed, 0, 5),
    showHarbor: bool(raw.showHarbor, fallback.showHarbor),
    terrain: bool(raw.terrain, fallback.terrain),
    terrainExaggeration: clampNumber(
      raw.terrainExaggeration,
      fallback.terrainExaggeration,
      0.5,
      5,
    ),
    simSource:
      raw.simSource === "surge" ||
      raw.simSource === "rain" ||
      raw.simSource === "breach"
        ? raw.simSource
        : fallback.simSource,
    simSurgeMeters: clampNumber(raw.simSurgeMeters, fallback.simSurgeMeters, 0, 6),
    simRainMmPerHour: clampNumber(
      raw.simRainMmPerHour,
      fallback.simRainMmPerHour,
      0,
      500,
    ),
    simRainRecorded: bool(raw.simRainRecorded, fallback.simRainRecorded),
    simRainTimeLapse: clampNumber(
      raw.simRainTimeLapse,
      fallback.simRainTimeLapse,
      1,
      FLOOD_RAIN_MAX_TIME_LAPSE,
    ),
    simBreachFlow: clampNumber(raw.simBreachFlow, fallback.simBreachFlow, 0, 5000),
    simBreachLng: clampNumber(raw.simBreachLng, fallback.simBreachLng, -180, 180),
    simBreachLat: clampNumber(raw.simBreachLat, fallback.simBreachLat, -85, 85),
    simSubsteps: Math.round(clampNumber(raw.simSubsteps, fallback.simSubsteps, 1, 24)),
    simSpeed: clampNumber(raw.simSpeed, fallback.simSpeed, 1, FLOOD_SIM_MAX_SPEED),
    flowLines: bool(raw.flowLines, fallback.flowLines),
    flowLineDensity: clampNumber(raw.flowLineDensity, fallback.flowLineDensity, 0.05, 1),
    flowLineSeconds: clampNumber(raw.flowLineSeconds, fallback.flowLineSeconds, 1, 30),
    flowLineOpacity: clampNumber(raw.flowLineOpacity, fallback.flowLineOpacity, 0, 1),
    flowLineColor: sanitizeHexColor(raw.flowLineColor, fallback.flowLineColor),
  };
}

export function sanitizePointVisual(value: unknown): PointVisual {
  if (
    value === "water-gradient" ||
    value === "oil-spill" ||
    value === "dust-storm" ||
    value === "flood"
  ) {
    return value;
  }
  return "marker";
}

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : fallback;
}

function sanitizeAssignMode(
  value: unknown,
  fallback: FlagAuraAssignMode,
): FlagAuraAssignMode {
  return value === "value" || value === "random" ? value : fallback;
}

function sanitizeAnimation(
  value: unknown,
  fallback: FlagAuraAnimation,
): FlagAuraAnimation {
  return value === "pulse" ||
    value === "noise" ||
    value === "caustic" ||
    value === "outline" ||
    value === "pillar"
    ? value
    : fallback;
}

function sanitizeFlagCoverage(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function migrateFaceOffset(
  raw: Partial<FlagAuraSettings> & { shellScale?: unknown },
  fallback: FlagAuraSettings,
): number {
  if (typeof raw.faceOffset === "number" && Number.isFinite(raw.faceOffset)) {
    return sanitizeScale(raw.faceOffset, fallback.faceOffset, { min: 0 });
  }
  if (typeof raw.shellScale === "number" && Number.isFinite(raw.shellScale)) {
    const migrated = Math.max(0, raw.shellScale - 1) * 0.2;
    if (migrated <= 0) return fallback.faceOffset;
    return sanitizeScale(migrated, fallback.faceOffset, { min: 0 });
  }
  return fallback.faceOffset;
}

export function sanitizeFlagAura(
  value: unknown,
  fallback: FlagAuraSettings = DEFAULT_FLAG_AURA,
): FlagAuraSettings {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Partial<FlagAuraSettings> & {
          shellScale?: unknown;
          outlineEnabled?: unknown;
        })
      : {};
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    assignMode: sanitizeAssignMode(raw.assignMode, fallback.assignMode),
    coverage: sanitizeFlagCoverage(raw.coverage, fallback.coverage),
    positiveColor: sanitizeHexColor(raw.positiveColor, fallback.positiveColor),
    neutralColor: sanitizeHexColor(raw.neutralColor, fallback.neutralColor),
    negativeColor: sanitizeHexColor(raw.negativeColor, fallback.negativeColor),
    intensity: sanitizeScale(raw.intensity, fallback.intensity, { min: 0 }),
    animation:
      raw.outlineEnabled === true
        ? "outline"
        : sanitizeAnimation(raw.animation, fallback.animation),
    pulseSpeed: sanitizeScale(raw.pulseSpeed, fallback.pulseSpeed, { min: 0 }),
    pulseAmplitude: Math.min(
      1,
      sanitizeScale(raw.pulseAmplitude, fallback.pulseAmplitude, { min: 0 }),
    ),
    faceOffset: migrateFaceOffset(raw, fallback),
    noiseScale: sanitizeScale(raw.noiseScale, fallback.noiseScale, {
      min: 0.05,
    }),
    falloff: sanitizeScale(raw.falloff, fallback.falloff, { min: 0.05 }),
    pillarBase:
      typeof raw.pillarBase === "boolean" ? raw.pillarBase : fallback.pillarBase,
    pillarHeight: Math.min(
      1.5,
      sanitizeScale(raw.pillarHeight, fallback.pillarHeight, { min: 0.05 }),
    ),
    pillarBeaconSize: Math.min(
      160,
      sanitizeScale(raw.pillarBeaconSize, fallback.pillarBeaconSize, { min: 8 }),
    ),
    pillarBeaconMark: sanitizeBeaconMark(
      raw.pillarBeaconMark,
      fallback.pillarBeaconMark,
    ),
    pillarStemSize: Math.min(
      240,
      sanitizeScale(raw.pillarStemSize, fallback.pillarStemSize, { min: 0 }),
    ),
    pillarLight: Math.min(
      4,
      sanitizeScale(raw.pillarLight, fallback.pillarLight, { min: 0 }),
    ),
    syncPulse:
      typeof raw.syncPulse === "boolean" ? raw.syncPulse : fallback.syncPulse,
    bloomEnabled:
      typeof raw.bloomEnabled === "boolean"
        ? raw.bloomEnabled
        : fallback.bloomEnabled,
    bloomStrength: sanitizeScale(
      raw.bloomStrength,
      fallback.bloomStrength,
      { min: 0 },
    ),
    bloomRadius: sanitizeScale(raw.bloomRadius, fallback.bloomRadius, {
      min: 0.1,
    }),
    bloomResolution: Math.min(
      0.75,
      sanitizeScale(raw.bloomResolution, fallback.bloomResolution, {
        min: 0.15,
      }),
    ),
    outlinePulse:
      typeof raw.outlinePulse === "boolean"
        ? raw.outlinePulse
        : fallback.outlinePulse,
    outlineDashes:
      typeof raw.outlineDashes === "boolean"
        ? raw.outlineDashes
        : fallback.outlineDashes,
    outlineWidth: Math.min(
      12,
      Math.max(
        0.5,
        sanitizeScale(raw.outlineWidth, fallback.outlineWidth, { min: 0.5 }),
      ),
    ),
    outlineWidthFollowsZoom:
      typeof raw.outlineWidthFollowsZoom === "boolean"
        ? raw.outlineWidthFollowsZoom
        : fallback.outlineWidthFollowsZoom,
    outlineWidthZoom: Math.min(
      24,
      Math.max(
        0,
        sanitizeScale(raw.outlineWidthZoom, fallback.outlineWidthZoom, {
          min: 0,
        }),
      ),
    ),
    outlineBloom:
      typeof raw.outlineBloom === "boolean"
        ? raw.outlineBloom
        : fallback.outlineBloom,
    outlineBloomStrength: Math.min(
      4,
      sanitizeScale(raw.outlineBloomStrength, fallback.outlineBloomStrength, {
        min: 0,
      }),
    ),
  };
}

export function sanitizeWaterGradient(
  value: unknown,
  fallback: WaterGradientSettings = DEFAULT_WATER_GRADIENT,
): WaterGradientSettings {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Partial<WaterGradientSettings> & { innerColor?: unknown })
      : {};
  const octaves = Math.round(
    sanitizeScale(raw.octaves, fallback.octaves, { min: 1 }),
  );
  return {
    color: sanitizeHexColor(raw.color ?? raw.innerColor, fallback.color),
    radiusMeters: sanitizeScale(raw.radiusMeters, fallback.radiusMeters, {
      min: 1,
    }),
    radiusFromValue:
      typeof raw.radiusFromValue === "boolean"
        ? raw.radiusFromValue
        : fallback.radiusFromValue,
    distortion: sanitizeScale(raw.distortion, fallback.distortion, { min: 0 }),
    noiseScale: sanitizeScale(raw.noiseScale, fallback.noiseScale, {
      min: 0.0001,
    }),
    octaves: Math.min(8, Math.max(1, octaves)),
    animationSpeed: sanitizeScale(
      raw.animationSpeed,
      fallback.animationSpeed,
      { min: 0 },
    ),
    stemMinHeightMeters: sanitizeScale(
      raw.stemMinHeightMeters,
      fallback.stemMinHeightMeters,
      { min: 0 },
    ),
    stemMaxHeightMeters: sanitizeScale(
      raw.stemMaxHeightMeters,
      fallback.stemMaxHeightMeters,
      { min: 1 },
    ),
    stemWidthPixels: sanitizeScale(
      raw.stemWidthPixels,
      fallback.stemWidthPixels,
      { min: 0.4 },
    ),
    stemFadeStartZoom: sanitizeScale(
      raw.stemFadeStartZoom,
      fallback.stemFadeStartZoom,
      { min: 0 },
    ),
    stemFadeEndZoom: sanitizeScale(
      raw.stemFadeEndZoom,
      fallback.stemFadeEndZoom,
      { min: 0 },
    ),
  };
}

export function sanitizeOilSpill(
  value: unknown,
  fallback: OilSpillSettings = DEFAULT_OIL_SPILL,
): OilSpillSettings {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Partial<OilSpillSettings>)
      : {};
  const sheen = sanitizeScale(raw.residualSheen, fallback.residualSheen, {
    min: 0,
  });
  return {
    radiusMeters: sanitizeScale(raw.radiusMeters, fallback.radiusMeters, {
      min: 20,
    }),
    hoursPerSecond: Math.min(
      48,
      sanitizeScale(raw.hoursPerSecond, fallback.hoursPerSecond, { min: 0 }),
    ),
    residualSheen: Math.min(1, sheen),
    brightness: Math.min(
      3,
      sanitizeScale(raw.brightness, fallback.brightness, { min: 0 }),
    ),
    saturation: Math.min(
      3,
      sanitizeScale(raw.saturation, fallback.saturation, { min: 0 }),
    ),
    rimSheen:
      typeof raw.rimSheen === "boolean" ? raw.rimSheen : fallback.rimSheen,
    rimThickness: Math.min(
      1,
      sanitizeScale(raw.rimThickness, fallback.rimThickness, { min: 0 }),
    ),
    animateSheen:
      typeof raw.animateSheen === "boolean"
        ? raw.animateSheen
        : fallback.animateSheen,
    sheenSpeed: Math.min(
      8,
      sanitizeScale(raw.sheenSpeed, fallback.sheenSpeed, { min: 0 }),
    ),
    sheenMaskStrength: Math.min(
      1,
      sanitizeScale(raw.sheenMaskStrength, fallback.sheenMaskStrength, {
        min: 0,
      }),
    ),
    sheenMaskScale: Math.min(
      8,
      sanitizeScale(raw.sheenMaskScale, fallback.sheenMaskScale, { min: 0.05 }),
    ),
    sheenPalette: sanitizeSheenPalette(raw.sheenPalette ?? fallback.sheenPalette),
    realisticSheen:
      typeof raw.realisticSheen === "boolean"
        ? raw.realisticSheen
        : fallback.realisticSheen,
    sheenStreakScale: Math.min(
      6,
      sanitizeScale(raw.sheenStreakScale, fallback.sheenStreakScale, {
        min: 0.1,
      }),
    ),
    sheenColorFade: Math.min(
      1,
      sanitizeScale(raw.sheenColorFade, fallback.sheenColorFade, { min: 0 }),
    ),
    fillColor: sanitizeHexColor(raw.fillColor, fallback.fillColor),
    trailNoise: Math.min(
      1,
      sanitizeScale(raw.trailNoise, fallback.trailNoise, { min: 0 }),
    ),
    trailMaskScale: Math.min(
      12,
      sanitizeScale(raw.trailMaskScale, fallback.trailMaskScale, { min: 0.05 }),
    ),
    playing: typeof raw.playing === "boolean" ? raw.playing : fallback.playing,
    trailStrength: Math.min(
      1,
      sanitizeScale(raw.trailStrength, fallback.trailStrength, { min: 0 }),
    ),
    trailOpacity: Math.min(
      1,
      sanitizeScale(raw.trailOpacity, fallback.trailOpacity, { min: 0 }),
    ),
    showParticles:
      typeof raw.showParticles === "boolean"
        ? raw.showParticles
        : fallback.showParticles,
    showPathway:
      typeof raw.showPathway === "boolean"
        ? raw.showPathway
        : fallback.showPathway,
    pathwayOpacity: Math.min(
      1,
      sanitizeScale(raw.pathwayOpacity, fallback.pathwayOpacity, { min: 0 }),
    ),
    showStem:
      typeof raw.showStem === "boolean" ? raw.showStem : fallback.showStem,
    stemHeightMeters: sanitizeScale(
      raw.stemHeightMeters,
      fallback.stemHeightMeters,
      { min: 1 },
    ),
    stemWidthPixels: sanitizeScale(
      raw.stemWidthPixels,
      fallback.stemWidthPixels,
      { min: 0.4 },
    ),
    stemFadeStartZoom: sanitizeScale(
      raw.stemFadeStartZoom,
      fallback.stemFadeStartZoom,
      { min: 0 },
    ),
    stemFadeEndZoom: sanitizeScale(
      raw.stemFadeEndZoom,
      fallback.stemFadeEndZoom,
      { min: 0 },
    ),
  };
}

function sanitizeDustPattern(
  value: unknown,
  fallback: DustHeatPattern,
): DustHeatPattern {
  if (
    value === "solid" ||
    value === "diagonal" ||
    value === "plus" ||
    value === "x" ||
    value === "circle" ||
    value === "dot"
  ) {
    return value;
  }
  return fallback;
}

/** Older configs had separate "extruded" and "flat" particle views. */
function sanitizeDustView(
  raw: {
    view?: string;
    mode?: string;
    particles?: string;
    ground?: string;
    particlesExtruded?: unknown;
  },
  fallback: Pick<DustStormSettings, "view" | "particlesExtruded">,
): Pick<DustStormSettings, "view" | "particlesExtruded"> {
  const legacy =
    raw.view === "flat" || raw.view === "extruded"
      ? raw.view
      : raw.view === undefined && raw.particles !== "off"
        ? raw.particles === "flat" || raw.mode === "flat"
          ? "flat"
          : raw.particles === "extruded" || raw.mode === "extruded"
            ? "extruded"
            : null
        : null;
  const particlesExtruded =
    typeof raw.particlesExtruded === "boolean"
      ? raw.particlesExtruded
      : legacy
        ? legacy === "extruded"
        : fallback.particlesExtruded;
  if (raw.view === "particles" || raw.view === "squares" || raw.view === "soft") {
    return { view: raw.view, particlesExtruded };
  }
  if (legacy) return { view: "particles", particlesExtruded };
  if (raw.view === undefined) {
    if (raw.ground === "soft") return { view: "soft", particlesExtruded };
    if (raw.ground === "squares" || raw.mode === "heatmap") {
      return { view: "squares", particlesExtruded };
    }
  }
  return { view: fallback.view, particlesExtruded };
}

export function sanitizeDustStorm(
  value: unknown,
  fallback: DustStormSettings = DEFAULT_DUST_STORM,
): DustStormSettings {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Partial<DustStormSettings> & {
          mode?: string;
          particles?: string;
          ground?: string;
        })
      : {};
  const { view, particlesExtruded } = sanitizeDustView(raw, fallback);
  const placement =
    raw.placement === "locked" || raw.placement === "flow"
      ? raw.placement
      : fallback.placement;
  const signal =
    raw.signal === "pm25" || raw.signal === "coarse" || raw.signal === "pm10"
      ? raw.signal
      : fallback.signal;
  const normalization =
    raw.normalization === "log" || raw.normalization === "percentile-power"
      ? raw.normalization
      : fallback.normalization;
  const lower = Math.min(
    95,
    sanitizeScale(raw.lowerPercentile, fallback.lowerPercentile, { min: 0 }),
  );
  const upper = Math.min(
    100,
    Math.max(
      lower + 0.5,
      sanitizeScale(raw.upperPercentile, fallback.upperPercentile, { min: 0 }),
    ),
  );
  return {
    view,
    particlesExtruded,
    placement,
    blurCells: Math.min(
      4,
      sanitizeScale(raw.blurCells, fallback.blurCells, { min: 0 }),
    ),
    cellShape:
      raw.cellShape === "hex" || raw.cellShape === "square"
        ? raw.cellShape
        : fallback.cellShape,
    hexSizeCells: Math.min(
      12,
      sanitizeScale(raw.hexSizeCells, fallback.hexSizeCells, { min: 1 }),
    ),
    coverage: Math.min(
      1,
      sanitizeScale(raw.coverage, fallback.coverage, { min: 0.2 }),
    ),
    heatmapExtruded:
      typeof raw.heatmapExtruded === "boolean"
        ? raw.heatmapExtruded
        : fallback.heatmapExtruded,
    heatmapHeightMeters: Math.min(
      200000,
      sanitizeScale(raw.heatmapHeightMeters, fallback.heatmapHeightMeters, {
        min: 0,
      }),
    ),
    contourEnabled:
      typeof raw.contourEnabled === "boolean"
        ? raw.contourEnabled
        : fallback.contourEnabled,
    contourSpacing:
      raw.contourSpacing === "linear" || raw.contourSpacing === "log"
        ? raw.contourSpacing
        : fallback.contourSpacing,
    contourStep: Math.min(
      1000,
      sanitizeScale(raw.contourStep, fallback.contourStep, { min: 0.1 }),
    ),
    contourMajorEvery: Math.min(
      20,
      Math.round(
        sanitizeScale(raw.contourMajorEvery, fallback.contourMajorEvery, {
          min: 0,
        }),
      ),
    ),
    contourStyle:
      raw.contourStyle === "auto" ||
      raw.contourStyle === "darker" ||
      raw.contourStyle === "lighter" ||
      raw.contourStyle === "custom"
        ? raw.contourStyle
        : fallback.contourStyle,
    contourColor: sanitizeHexColor(raw.contourColor, fallback.contourColor),
    contourOpacity: Math.min(
      1,
      sanitizeScale(raw.contourOpacity, fallback.contourOpacity, { min: 0 }),
    ),
    contourWidth: Math.min(
      6,
      sanitizeScale(raw.contourWidth, fallback.contourWidth, { min: 0.5 }),
    ),
    contourLinesOnly:
      typeof raw.contourLinesOnly === "boolean"
        ? raw.contourLinesOnly
        : fallback.contourLinesOnly,
    pattern: sanitizeDustPattern(raw.pattern, fallback.pattern),
    patternSpacing: Math.min(
      48,
      sanitizeScale(raw.patternSpacing, fallback.patternSpacing, { min: 2 }),
    ),
    patternStroke: Math.min(
      16,
      sanitizeScale(raw.patternStroke, fallback.patternStroke, { min: 0.2 }),
    ),
    signal,
    normalization,
    lowerPercentile: lower,
    upperPercentile: upper,
    heightExponent: Math.min(
      3,
      sanitizeScale(raw.heightExponent, fallback.heightExponent, { min: 0.05 }),
    ),
    maxHeightMeters: sanitizeScale(
      raw.maxHeightMeters,
      fallback.maxHeightMeters,
      { min: 0 },
    ),
    turbulence: Math.min(
      1,
      sanitizeScale(raw.turbulence, fallback.turbulence, { min: 0 }),
    ),
    windAmplitude: sanitizeScale(raw.windAmplitude, fallback.windAmplitude, {
      min: 0,
    }),
    windConvention: raw.windConvention === "to" ? "to" : "from",
    particlesPerCell: Math.min(
      8,
      Math.max(
        1,
        Math.round(
          sanitizeScale(raw.particlesPerCell, fallback.particlesPerCell, {
            min: 1,
          }),
        ),
      ),
    ),
    pointSizeMeters: sanitizeScale(
      raw.pointSizeMeters,
      fallback.pointSizeMeters,
      { min: 50 },
    ),
    maxPointPixels: sanitizeScale(raw.maxPointPixels, fallback.maxPointPixels, {
      min: 1,
    }),
    opacity: Math.min(
      1,
      sanitizeScale(raw.opacity, fallback.opacity, { min: 0 }),
    ),
    sizeFromIntensity: Math.min(
      1,
      sanitizeScale(raw.sizeFromIntensity, fallback.sizeFromIntensity, {
        min: 0,
      }),
    ),
    opacityFromIntensity: Math.min(
      1,
      sanitizeScale(raw.opacityFromIntensity, fallback.opacityFromIntensity, {
        min: 0,
      }),
    ),
    opacityExponent: Math.min(
      3,
      sanitizeScale(raw.opacityExponent, fallback.opacityExponent, {
        min: 0.05,
      }),
    ),
    hoursPerSecond: Math.min(
      24,
      sanitizeScale(raw.hoursPerSecond, fallback.hoursPerSecond, { min: 0 }),
    ),
    playing: typeof raw.playing === "boolean" ? raw.playing : fallback.playing,
    frame: sanitizeScale(raw.frame, fallback.frame, { min: 0 }),
    colorLow: sanitizeHexColor(raw.colorLow, fallback.colorLow),
    colorMid: sanitizeHexColor(raw.colorMid, fallback.colorMid),
    colorHigh: sanitizeHexColor(raw.colorHigh, fallback.colorHigh),
    colorExtreme: sanitizeHexColor(raw.colorExtreme, fallback.colorExtreme),
  };
}

/** Canonical playground default — sourced from `configs/default.json` (Llumen look). */
const PRESET = defaultPreset.config;

export const DEFAULT_STYLE = PRESET.styleUrl;
export const DEFAULT_BASE_SCALE = PRESET.baseScale;
export const DEFAULT_HEIGHT_SCALE = PRESET.heightScale;

function sanitizeScale(
  value: unknown,
  fallback: number,
  opts?: { min?: number },
): number {
  const min = opts?.min ?? 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

/** Coerce invalid / zeroed scales back to sane defaults (e.g. bad localStorage). */
export function sanitizeConfigScales(config: PlaygroundConfig): PlaygroundConfig {
  const zoomBounds = normalizeZoomPixelBounds(
    config.zoomScaleMinPixels,
    config.zoomScaleMaxPixels,
  );
  return {
    ...config,
    // baseScale must be > 0 or markers vanish
    baseScale: sanitizeScale(config.baseScale, DEFAULT_BASE_SCALE, { min: 1 }),
    heightScale: sanitizeScale(config.heightScale, DEFAULT_HEIGHT_SCALE, {
      min: 0,
    }),
    localBaseScale: sanitizeScale(config.localBaseScale, 12, { min: 0.1 }),
    localHeightScale: sanitizeScale(config.localHeightScale, 30, { min: 0 }),
    areaBaseHeight: sanitizeScale(config.areaBaseHeight, 10000, { min: 0 }),
    areaExtrusionScale: sanitizeScale(config.areaExtrusionScale, 300000, {
      min: 0,
    }),
    zoomScaleMinPixels: zoomBounds.minPixels,
    zoomScaleMaxPixels: zoomBounds.maxPixels,
    ...(() => {
      const opacity = normalizeOpacityRange(
        config.opacityRandomMin,
        config.opacityRandomMax,
      );
      return {
        opacityRandomMin: opacity.min,
        opacityRandomMax: opacity.max,
      };
    })(),
    pointVisual: sanitizePointVisual(config.pointVisual),
    waterGradient: sanitizeWaterGradient(config.waterGradient),
    oilSpill: sanitizeOilSpill(config.oilSpill),
    dustStorm: sanitizeDustStorm(config.dustStorm),
    flood: sanitizeFlood(config.flood),
    markerLod: sanitizeMarkerLod(config.markerLod),
    flagAura: sanitizeFlagAura(config.flagAura),
  };
}

/** Factory for the playground's built-in default config. */
export function makeDefaultConfig(): PlaygroundConfig {
  return sanitizeConfigScales({
    ...(structuredClone(PRESET) as PlaygroundConfig),
  });
}

export type SavedConfigFile = {
  version: number;
  savedAt: string;
  config: PlaygroundConfig;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge a partial loaded config onto defaults (missing keys keep defaults). */
export function mergeWithDefaults(
  partial: Partial<PlaygroundConfig> | Record<string, unknown>,
): PlaygroundConfig {
  const base = makeDefaultConfig();
  const p = partial as Partial<PlaygroundConfig>;

  const merged: PlaygroundConfig = {
    ...base,
    ...p,
    material: {
      ...base.material,
      ...((p.material ?? {}) as Partial<MaterialSettings>),
    },
    lighting: {
      ...base.lighting,
      ...((p.lighting ?? {}) as Partial<LightingSettings>),
    },
    renderer: {
      ...base.renderer,
      ...((p.renderer ?? {}) as Partial<RendererSettings>),
    },
    waterGradient: sanitizeWaterGradient(p.waterGradient, base.waterGradient),
    oilSpill: sanitizeOilSpill(p.oilSpill, base.oilSpill),
    dustStorm: sanitizeDustStorm(p.dustStorm, base.dustStorm),
    flood: sanitizeFlood(p.flood, base.flood),
    markerLod: sanitizeMarkerLod(p.markerLod, base.markerLod),
    flagAura: sanitizeFlagAura(p.flagAura, base.flagAura),
    pointVisual: sanitizePointVisual(p.pointVisual ?? base.pointVisual),
    colorRamp: sanitizeColorRamp(p.colorRamp ?? base.colorRamp),
    primitive: sanitizePrimitiveId(p.primitive ?? base.primitive, base.primitive),
    // Prefer explicit values when valid; never keep a zeroed baseScale from old saves
    baseScale: sanitizeScale(
      p.baseScale ?? base.baseScale,
      DEFAULT_BASE_SCALE,
      { min: 1 },
    ),
    heightScale: sanitizeScale(
      p.heightScale ?? base.heightScale,
      DEFAULT_HEIGHT_SCALE,
      { min: 0 },
    ),
    localBaseScale: sanitizeScale(p.localBaseScale ?? base.localBaseScale, 12, {
      min: 0.1,
    }),
    localHeightScale: sanitizeScale(
      p.localHeightScale ?? base.localHeightScale,
      30,
      { min: 0 },
    ),
    areaBaseHeight: sanitizeScale(p.areaBaseHeight ?? base.areaBaseHeight, 10000, {
      min: 0,
    }),
    areaExtrusionScale: sanitizeScale(
      p.areaExtrusionScale ?? base.areaExtrusionScale,
      300000,
      { min: 0 },
    ),
    adaptiveZoomScaling:
      typeof p.adaptiveZoomScaling === "boolean"
        ? p.adaptiveZoomScaling
        : base.adaptiveZoomScaling,
    zoomScaleMinPixels: sanitizeScale(
      p.zoomScaleMinPixels ?? base.zoomScaleMinPixels,
      DEFAULT_ZOOM_SCALE_MIN_PIXELS,
      { min: 1 },
    ),
    zoomScaleMaxPixels: sanitizeScale(
      p.zoomScaleMaxPixels ?? base.zoomScaleMaxPixels,
      DEFAULT_ZOOM_SCALE_MAX_PIXELS,
      { min: 1 },
    ),
    collisionAwareScaling:
      typeof p.collisionAwareScaling === "boolean"
        ? p.collisionAwareScaling
        : base.collisionAwareScaling,
    ...(() => {
      const opacity = normalizeOpacityRange(
        typeof p.opacityRandomMin === "number"
          ? p.opacityRandomMin
          : base.opacityRandomMin,
        typeof p.opacityRandomMax === "number"
          ? p.opacityRandomMax
          : base.opacityRandomMax,
      );
      return {
        opacityRandomMin: opacity.min,
        opacityRandomMax: opacity.max,
      };
    })(),
  };

  // If an old save literally stored 0 for height after a Leva glitch, restore default
  // only when base was also invalid/zeroed in the same save (common paired reset).
  if (
    (typeof p.baseScale === "number" && p.baseScale <= 0) &&
    (typeof p.heightScale === "number" && p.heightScale <= 0)
  ) {
    merged.baseScale = DEFAULT_BASE_SCALE;
    merged.heightScale = DEFAULT_HEIGHT_SCALE;
  }

  return sanitizeConfigScales(merged);
}

export function parseConfigJson(data: unknown): PlaygroundConfig {
  if (!isObject(data)) {
    throw new Error("Config must be a JSON object");
  }

  // Accept either { version, config } wrapper or a raw PlaygroundConfig
  const raw = isObject(data.config) ? data.config : data;
  // v4 and raw legacy configs predate adaptive sizing. Preserve their visual
  // behavior unless the setting is explicitly present.
  const withAdaptive =
    "adaptiveZoomScaling" in raw
      ? raw
      : { ...raw, adaptiveZoomScaling: false };
  // Before v15 the oil stem used the water gradient's fade, which hid it too late.
  const version = typeof data.version === "number" ? data.version : 0;
  const oilSpill = (withAdaptive as { oilSpill?: unknown }).oilSpill;
  const withOilFade =
    version < 15 && isObject(oilSpill)
      ? {
          ...withAdaptive,
          oilSpill: {
            ...oilSpill,
            stemFadeStartZoom: undefined,
            stemFadeEndZoom: undefined,
          },
        }
      : withAdaptive;
  // Disks were removed; map legacy saves onto icospheres. Unknown ids fall back.
  const migrated = {
    ...withOilFade,
    primitive: sanitizePrimitiveId(
      (withAdaptive as { primitive?: unknown }).primitive,
      "octahedron",
    ),
  };
  return mergeWithDefaults(migrated);
}

export function buildSavePayload(config: PlaygroundConfig): SavedConfigFile {
  return {
    version: CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    config: sanitizeConfigScales(config),
  };
}

export function downloadConfig(config: PlaygroundConfig, filename?: string): void {
  const payload = buildSavePayload(config);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ??
    `map-3d-config-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readConfigFile(file: File): Promise<PlaygroundConfig> {
  const text = await file.text();
  const data = JSON.parse(text) as unknown;
  return parseConfigJson(data);
}

const LS_KEY = "map-3d-playground-config";

export function saveConfigToLocalStorage(config: PlaygroundConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(buildSavePayload(config)));
  } catch {
    // ignore quota / private mode
  }
}

export function loadConfigFromLocalStorage(): PlaygroundConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return parseConfigJson(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
