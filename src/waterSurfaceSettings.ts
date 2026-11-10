/**
 * Water Surfaces settings: the asset builder fields resolved to real values,
 * and their translation to the Map 3D water-gradient, oil-spill and flood
 * configs and the staging water-current options. The field-to-key mapping
 * lives here so the preview and the export agree.
 */

import type { Opt } from "./chartModel";
import { valueFade } from "./heatmapSettings";
import {
  asColorMode,
  type ColorModeConfig,
  type ValueOpacity,
} from "./previewTheme";
import { fieldsForVisual } from "./visualSettingsCatalog";
import { WATER_CURRENT_PALETTE, WATER_PLUME_PALETTE, WATER_SPILL_PALETTE } from "./waterPalettes";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

export type WaterSurfaceMode = "Plume" | "Spill" | "Current" | "Flood";

export type FloodBuildings = "Baked + Mapbox" | "Mapbox tiles" | "Baked footprints";

export type WaterSurfaceSettings = {
  mode: WaterSurfaceMode;
  /** On for every mode but Flood, which spreads over land. */
  clipToWater: boolean;
  opacity: number;
  plume: {
    radiusMeters: number;
    radiusFromValue: boolean;
    distortion: number;
    driftSpeed: number;
    noiseScale: number;
    octaves: number;
  };
  spill: {
    cohesionMeters: number;
    rimSheen: boolean;
    fillColor: string;
    animateSheen: boolean;
    sheenSpeed: number;
    trailStreaks: number;
    trailStrength: number;
    residualSheen: number;
    showPathway: boolean;
    pathwayOpacity: number;
    brightness: number;
    saturation: number;
  };
  current: {
    animationSpeed: number;
    trailLength: number;
    particleDensity: number;
    resetRate: number;
    particleSize: number;
  };
  flood: {
    showFlowLines: boolean;
    showHarbor: boolean;
    buildings: FloodBuildings;
    terrain: boolean;
    terrainExaggeration: number;
  };
  stems: {
    show: boolean;
    minHeightMeters: number;
    maxHeightMeters: number;
    widthPixels: number;
    fadeStartZoom: number;
    fadeEndZoom: number;
    color: string;
  };
  palette: ColorModeConfig;
  colorBy: string;
  fade: ValueOpacity | null;
  clipOutliers: boolean;
};

let surfaceFields: Opt[] | null = null;
function field(group: string, name: string): Opt | undefined {
  surfaceFields ??= fieldsForVisual("water-surfaces");
  return surfaceFields.find((o) => o.group === group && o.name === name);
}

/** Slider fields store 0–100; the real range and default come from the catalog description. */
function slider(cfg: Cfg, group: string, name: string): number {
  const desc = field(group, name)?.desc ?? "";
  const range = desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const def = desc.match(/Default\s+(-?[\d.]+)/i);
  const lo = range ? parseFloat(range[1]) : 0;
  const hi = range ? parseFloat(range[2]) : 100;
  const fallback = def ? parseFloat(def[1]) : lo;
  const stepMatch = desc.match(/step\s+(-?\d*\.?\d+)/i);
  const step = stepMatch ? parseFloat(stepMatch[1]) : 0;
  const stored = ((fallback - lo) / (hi - lo || 1)) * 100;
  const pct = Number(cfg(group, name, Math.round(stored)));
  if (!Number.isFinite(pct)) return fallback;
  const raw = lo + (Math.max(0, Math.min(100, pct)) / 100) * (hi - lo);
  return step > 0 ? Math.min(hi, lo + Math.round((raw - lo) / step) * step) : raw;
}

/** The number the slider shows before anyone moves it. */
function catalogSlider(group: string, name: string): number {
  return slider((_g, _n, fallback) => fallback, group, name);
}

/**
 * Shared sliders keep one catalog default (the Plume one). Until the slider
 * moves, Spill and Current take their own default.
 */
function sliderForMode(
  cfg: Cfg,
  group: string,
  name: string,
  mode: WaterSurfaceMode,
  byMode: Record<WaterSurfaceMode, number>,
): number {
  const value = slider(cfg, group, name);
  if (Math.abs(value - catalogSlider(group, name)) < 1e-6) return byMode[mode];
  return value;
}

function text(cfg: Cfg, group: string, name: string): string {
  const fallback = field(group, name)?.defaultValue;
  const v = cfg(group, name, fallback);
  return typeof v === "string" && v ? v : String(fallback ?? "");
}

function toggle(cfg: Cfg, group: string, name: string): boolean {
  const o = field(group, name);
  const v = cfg(group, name, o ? o.def !== false : false);
  return v === true || v === "true";
}

function samePalette(a: ColorModeConfig, b: ColorModeConfig): boolean {
  return (
    a.style === b.style &&
    a.color.toLowerCase() === b.color.toLowerCase() &&
    a.opacity === b.opacity &&
    a.stops.length === b.stops.length &&
    a.stops.every((s, i) => s.color.toLowerCase() === b.stops[i].color.toLowerCase() && s.opacity === b.stops[i].opacity)
  );
}

export function waterSurfaceSettings(cfg: Cfg): WaterSurfaceSettings {
  const mode = (text(cfg, "Surface Style", "Mode") || "Plume") as WaterSurfaceMode;
  const stemChoice = text(cfg, "Stems", "Stem color") || "Auto";
  const customStem = text(cfg, "Stems", "Custom color") || "#ff2b2b";
  const palette = asColorMode(cfg("Color", "Palette", WATER_PLUME_PALETTE));
  const resolvedPalette =
    mode === "Current" && samePalette(palette, WATER_PLUME_PALETTE)
      ? WATER_CURRENT_PALETTE
      : mode === "Spill" && samePalette(palette, WATER_PLUME_PALETTE)
        ? WATER_SPILL_PALETTE
        : palette;
  return {
    mode,
    clipToWater: mode !== "Flood",
    opacity: sliderForMode(cfg, "Surface Style", "Opacity", mode, {
      Plume: 1,
      Spill: 1,
      Current: 0.3,
      Flood: 1,
    }),
    plume: {
      radiusMeters: slider(cfg, "Surface Style", "Radius"),
      radiusFromValue: toggle(cfg, "Surface Style", "Radius from value"),
      distortion: slider(cfg, "Surface Style", "Distortion"),
      driftSpeed: slider(cfg, "Surface Style", "Drift speed"),
      noiseScale: slider(cfg, "Surface Style", "Noise scale"),
      octaves: Math.round(slider(cfg, "Surface Style", "Octaves")),
    },
    spill: {
      cohesionMeters: slider(cfg, "Surface Style", "Cohesion"),
      rimSheen: toggle(cfg, "Surface Style", "Rim sheen"),
      fillColor: resolvedPalette.color,
      animateSheen: toggle(cfg, "Surface Style", "Animate sheen"),
      sheenSpeed: slider(cfg, "Surface Style", "Sheen speed"),
      trailStreaks: slider(cfg, "Surface Style", "Trail streaks"),
      trailStrength: slider(cfg, "Surface Style", "Trail strength"),
      residualSheen: slider(cfg, "Surface Style", "Residual sheen"),
      showPathway: toggle(cfg, "Surface Style", "Show pathway"),
      pathwayOpacity: slider(cfg, "Surface Style", "Pathway opacity"),
      brightness: slider(cfg, "Surface Style", "Brightness"),
      saturation: slider(cfg, "Surface Style", "Saturation"),
    },
    current: {
      animationSpeed: slider(cfg, "Surface Style", "Animation speed"),
      trailLength: slider(cfg, "Surface Style", "Trail length"),
      particleDensity: Math.round(slider(cfg, "Surface Style", "Particle density")),
      resetRate: slider(cfg, "Surface Style", "Reset rate"),
      particleSize: slider(cfg, "Surface Style", "Particle size"),
    },
    flood: {
      showFlowLines: toggle(cfg, "Surface Style", "Show flow lines"),
      showHarbor: toggle(cfg, "Surface Style", "Show harbor water"),
      buildings: (text(cfg, "Surface Style", "Buildings") || "Baked + Mapbox") as FloodBuildings,
      terrain: toggle(cfg, "Surface Style", "3D terrain"),
      terrainExaggeration: slider(cfg, "Surface Style", "Terrain exaggeration"),
    },
    stems: {
      show: mode !== "Current" && mode !== "Flood" && toggle(cfg, "Stems", "Show stems"),
      minHeightMeters: slider(cfg, "Stems", "Min height"),
      maxHeightMeters: sliderForMode(cfg, "Stems", "Max height", mode, {
        Plume: 42000,
        Spill: 24000,
        Current: 42000,
        Flood: 42000,
      }),
      widthPixels: slider(cfg, "Stems", "Width"),
      fadeStartZoom: sliderForMode(cfg, "Stems", "Fade start zoom", mode, {
        Plume: 9,
        Spill: 7,
        Current: 9,
        Flood: 9,
      }),
      fadeEndZoom: sliderForMode(cfg, "Stems", "Hidden by zoom", mode, {
        Plume: 12.5,
        Spill: 9.5,
        Current: 12.5,
        Flood: 12.5,
      }),
      color: stemChoice === "Custom" ? customStem : mode === "Spill" ? "#ff2b2b" : resolvedPalette.color,
    },
    palette: resolvedPalette,
    colorBy: text(cfg, "Color", "Color by"),
    fade: mode === "Spill" || mode === "Flood" ? null : valueFade(cfg),
    clipOutliers: toggle(cfg, "Color", "Clip outliers"),
  };
}

/** Map 3D `waterGradient` keys. Masking is always on. */
export type MapWaterGradientConfig = {
  color: string;
  radiusMeters: number;
  radiusFromValue: boolean;
  distortion: number;
  noiseScale: number;
  octaves: number;
  animationSpeed: number;
  opacity: number;
  clipToWater: true;
  stemMinHeight: number;
  stemMaxHeight: number;
  stemWidthPixels: number;
  stemFadeStart: number;
  stemFadeEnd: number;
  stemColor: string;
  showStem: boolean;
};

/** Map 3D `oilSpill` keys. Playback stays at the engine defaults. */
export type MapOilSpillConfig = {
  radiusMeters: number;
  hoursPerSecond: number;
  playing: boolean;
  residualSheen: number;
  brightness: number;
  saturation: number;
  rimSheen: boolean;
  animateSheen: boolean;
  sheenSpeed: number;
  fillColor: string;
  trailNoise: number;
  trailStrength: number;
  showPathway: boolean;
  pathwayOpacity: number;
  opacity: number;
  clipToWater: true;
  showStem: boolean;
  stemHeight: number;
  stemWidthPixels: number;
  stemFadeStart: number;
  stemFadeEnd: number;
  stemColor: string;
};

/** Staging `waterCurrent*` option keys. Direction is the toward convention. */
export type WaterCurrentOptions = {
  waterCurrentColorPaletteType: "solid" | "gradient" | "steps";
  waterCurrentSelectedSolidColor: string;
  waterCurrentSolidOpacity: number;
  waterCurrentColorRamp: string[];
  waterCurrentOpacity: number;
  waterCurrentFadeOpacity: number;
  waterCurrentNumParticles: number;
  waterCurrentSpeedFactor: number;
  waterCurrentDropRate: number;
  waterCurrentParticleSize: number;
  waterCurrentColorDataField: string;
  clipToWater: true;
};

/**
 * Columns that drive the Map 3D flood sim, one reading per row. Unmapped
 * drivers are empty. Each row's time places it in the time series playback.
 */
export type FloodForcingMapping = {
  timeField: string;
  /** Gauge, rain station or inflow point of each row. */
  locationField: string;
  /** Groups rows from the same source. */
  sourceIdField: string;
  /** Meters above MHHW at the gauge. */
  waterLevelField: string;
  /** mm/h at the rain gauge. */
  rainRateField: string;
  /** m³/s entering at the row's location. */
  inflowRateField: string;
};

/**
 * Map 3D `flood` keys. The look is not configurable in the builder, so the
 * water, heatmap and flow line styling stays at the Map 3D defaults.
 */
export type MapFloodConfig = {
  view: "both";
  scenario: "sim";
  palette: "flood";
  heatmapOpacity: number;
  maxDepthMeters: number;
  depthBands: false;
  bandStepMeters: number;
  buildingSource: "auto" | "mapbox" | "baked";
  surfaceFadeStartZoom: number;
  surfaceFadeEndZoom: number;
  surfaceOpacity: number;
  shallowColor: string;
  deepColor: string;
  absorption: number;
  edgeSmoothing: number;
  shallowFadeMeters: number;
  waveStrength: number;
  waveSpeed: number;
  showHarbor: boolean;
  terrain: boolean;
  terrainExaggeration: number;
  simSubsteps: number;
  flowLines: boolean;
  flowLineDensity: number;
  flowLineSeconds: number;
  flowLineOpacity: number;
  flowLineColor: string;
  forcing: FloodForcingMapping;
};

const FLOOD_BUILDING_SOURCE: Record<FloodBuildings, MapFloodConfig["buildingSource"]> = {
  "Baked + Mapbox": "auto",
  "Mapbox tiles": "mapbox",
  "Baked footprints": "baked",
};

export function floodConfigFromSettings(cfg: Cfg): MapFloodConfig {
  const s = waterSurfaceSettings(cfg);
  const mapped = (name: string) => text(cfg, "Mapping", name);
  return {
    view: "both",
    scenario: "sim",
    palette: "flood",
    heatmapOpacity: 0.8 * s.opacity,
    maxDepthMeters: 3,
    depthBands: false,
    bandStepMeters: 0.5,
    buildingSource: FLOOD_BUILDING_SOURCE[s.flood.buildings] ?? "auto",
    surfaceFadeStartZoom: 13.2,
    surfaceFadeEndZoom: 14.6,
    surfaceOpacity: s.opacity,
    shallowColor: "#00d9ff",
    deepColor: "#051c2f",
    absorption: 1.29,
    edgeSmoothing: 1,
    shallowFadeMeters: 0.05,
    waveStrength: 0.43,
    waveSpeed: 1.8,
    showHarbor: s.flood.showHarbor,
    terrain: s.flood.terrain,
    terrainExaggeration: s.flood.terrainExaggeration,
    simSubsteps: 16,
    flowLines: s.flood.showFlowLines,
    flowLineDensity: 0.25,
    flowLineSeconds: 3.5,
    flowLineOpacity: 1,
    flowLineColor: "#88d8eade",
    forcing: {
      timeField: mapped("Time field"),
      locationField: mapped("Coordinates"),
      sourceIdField: mapped("Source ID"),
      waterLevelField: mapped("Water level"),
      rainRateField: mapped("Rain rate"),
      inflowRateField: mapped("Inflow rate"),
    },
  };
}

export function waterGradientConfigFromSettings(cfg: Cfg): MapWaterGradientConfig {
  const s = waterSurfaceSettings(cfg);
  return {
    color: s.palette.color,
    radiusMeters: s.plume.radiusMeters,
    radiusFromValue: s.plume.radiusFromValue,
    distortion: s.plume.distortion,
    noiseScale: s.plume.noiseScale,
    octaves: s.plume.octaves,
    animationSpeed: s.plume.driftSpeed,
    opacity: s.opacity,
    clipToWater: true,
    stemMinHeight: s.stems.minHeightMeters,
    stemMaxHeight: s.stems.maxHeightMeters,
    stemWidthPixels: s.stems.widthPixels,
    stemFadeStart: s.stems.fadeStartZoom,
    stemFadeEnd: s.stems.fadeEndZoom,
    stemColor: s.stems.color,
    showStem: s.stems.show,
  };
}

export function oilSpillConfigFromSettings(cfg: Cfg): MapOilSpillConfig {
  const s = waterSurfaceSettings(cfg);
  return {
    radiusMeters: s.spill.cohesionMeters,
    hoursPerSecond: 4,
    playing: true,
    residualSheen: s.spill.residualSheen,
    brightness: s.spill.brightness,
    saturation: s.spill.saturation,
    rimSheen: s.spill.rimSheen,
    animateSheen: s.spill.animateSheen,
    sheenSpeed: s.spill.sheenSpeed,
    fillColor: s.spill.fillColor,
    trailNoise: s.spill.trailStreaks,
    trailStrength: s.spill.trailStrength,
    showPathway: s.spill.showPathway,
    pathwayOpacity: s.spill.pathwayOpacity,
    opacity: s.opacity,
    clipToWater: true,
    showStem: s.stems.show,
    stemHeight: s.stems.maxHeightMeters,
    stemWidthPixels: s.stems.widthPixels,
    stemFadeStart: s.stems.fadeStartZoom,
    stemFadeEnd: s.stems.fadeEndZoom,
    stemColor: s.stems.color,
  };
}

export function waterCurrentOptionsFromSettings(cfg: Cfg): WaterCurrentOptions {
  const s = waterSurfaceSettings(cfg);
  const style = s.palette.style === "Steps" ? "steps" : s.palette.style === "Gradient" ? "gradient" : "solid";
  return {
    waterCurrentColorPaletteType: style,
    waterCurrentSelectedSolidColor: s.palette.color,
    waterCurrentSolidOpacity: Math.round(s.opacity * 100),
    waterCurrentColorRamp: s.palette.colors,
    waterCurrentOpacity: s.opacity,
    waterCurrentFadeOpacity: s.current.trailLength,
    waterCurrentNumParticles: s.current.particleDensity,
    waterCurrentSpeedFactor: s.current.animationSpeed,
    waterCurrentDropRate: s.current.resetRate,
    waterCurrentParticleSize: s.current.particleSize,
    waterCurrentColorDataField: s.colorBy,
    clipToWater: true,
  };
}
