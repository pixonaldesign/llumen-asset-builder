/**
 * Builder settings → Map 3D playground config for the live map preview.
 * `llumen default 2.json` is the base for every 3D visual; builder fields
 * override it, and colors only override it once the user has picked one.
 */

import llumenDefault from "@/lib/configs/llumen-default-2.json";
import {
  parseConfigJson,
  sanitizeDustStorm,
  sanitizeFlood,
  sanitizeOilSpill,
  sanitizeWaterGradient,
  DEFAULT_FLOOD,
} from "@/lib/configIO";
import { ensurePaletteForMode } from "@/lib/colorRamp";
import type { ColorMode, FloodSimSource, PlaygroundConfig, PrimitiveType } from "@/lib/types";
import type { Opt } from "./chartModel";
import { heatmapConfigFromSettings } from "./heatmapSettings";
import { asColorMode, asRecord, type ColorModeConfig } from "./previewTheme";
import { fieldsForVisual } from "./visualSettingsCatalog";
import {
  floodConfigFromSettings,
  oilSpillConfigFromSettings,
  waterGradientConfigFromSettings,
  waterSurfaceSettings,
} from "./waterSurfaceSettings";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

export type LiveMapScene = {
  datasetId: string;
  config: PlaygroundConfig;
};

export const LLUMEN_DEFAULT_CONFIG: PlaygroundConfig = parseConfigJson(llumenDefault);

const fieldCache = new Map<string, Opt[]>();
function field(visualId: string, group: string, name: string): Opt | undefined {
  let fields = fieldCache.get(visualId);
  if (!fields) {
    fields = fieldsForVisual(visualId);
    fieldCache.set(visualId, fields);
  }
  return fields.find((o) => o.group === group && o.name === name);
}

/** Slider fields store 0–100; the real range and default come from the catalog description. */
function slider(visualId: string, cfg: Cfg, group: string, name: string): number {
  const desc = field(visualId, group, name)?.desc ?? "";
  const range = desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const def = desc.match(/Default\s+(-?[\d.]+)/i);
  const lo = range ? parseFloat(range[1]) : 0;
  const hi = range ? parseFloat(range[2]) : 100;
  const fallback = def ? parseFloat(def[1]) : lo;
  const pct = Number(cfg(group, name, ((fallback - lo) / (hi - lo || 1)) * 100));
  if (!Number.isFinite(pct)) return fallback;
  return lo + (Math.max(0, Math.min(100, pct)) / 100) * (hi - lo);
}

function text(visualId: string, cfg: Cfg, group: string, name: string): string {
  const fallback = field(visualId, group, name)?.defaultValue;
  const v = cfg(group, name, fallback);
  return typeof v === "string" && v ? v : String(fallback ?? "");
}

function toggle(cfg: Cfg, group: string, name: string, fallback: boolean): boolean {
  const v = cfg(group, name, fallback);
  return v === true || v === "true";
}

type Explicit = Record<string, unknown>;
const isSet = (explicit: Explicit, group: string, name: string) =>
  explicit[`${group}::${name}`] !== undefined;

type ColorChoice = {
  colorMode: ColorMode;
  colorProperty: string | null;
  colorRamp: string[];
  materialColor?: string;
};

function paletteRamp(palette: ColorModeConfig): string[] {
  const stops = [...palette.stops].sort((a, b) => a.value - b.value).map((s) => s.color.slice(0, 7));
  return stops.length >= 2 ? stops : palette.colors.map((c) => c.slice(0, 7));
}

/**
 * Value colors follow the builder palette; Type colors follow the category map.
 * Untouched color fields keep the Llumen material.
 */
function colorChoice(
  cfg: Cfg,
  explicit: Explicit,
  base: PlaygroundConfig,
  valueProperty: string | null,
  categoryProperty: string | null,
): ColorChoice {
  const source = String(cfg("Color", "Color Source", "Value"));
  if (source === "Type" && categoryProperty) {
    const map = asRecord(cfg("Color", "Categorical color stops + Other", {}));
    const custom = isSet(explicit, "Color", "Categorical color stops + Other")
      ? Object.entries(map)
          .filter(([label]) => label !== "Other")
          .map(([, color]) => String(color).slice(0, 7))
      : [];
    return {
      colorMode: "categorical",
      colorProperty: categoryProperty,
      colorRamp: custom.length ? custom : ensurePaletteForMode("categorical", base.colorRamp),
    };
  }
  if (!isSet(explicit, "Color", "Palette")) {
    return { colorMode: base.colorMode, colorProperty: base.colorProperty, colorRamp: base.colorRamp };
  }
  const palette = asColorMode(cfg("Color", "Palette", undefined));
  if (palette.style === "Per Category" && categoryProperty) {
    const colors = Object.values(palette.categoryColors).map((c) => c.slice(0, 7));
    return {
      colorMode: "categorical",
      colorProperty: categoryProperty,
      colorRamp: colors.length >= 2 ? colors : palette.colors.map((c) => c.slice(0, 7)),
    };
  }
  if (palette.style === "Single" || palette.style === "Per Category" || !valueProperty) {
    return {
      colorMode: "none",
      colorProperty: null,
      colorRamp: base.colorRamp,
      materialColor: palette.color.slice(0, 7),
    };
  }
  return { colorMode: "value", colorProperty: valueProperty, colorRamp: paletteRamp(palette) };
}

function flagAura(cfg: Cfg, explicit: Explicit, base: PlaygroundConfig): PlaygroundConfig["flagAura"] {
  const names = ["Positive Flag", "Neutral Flag", "Negative Flag"];
  if (!names.some((n) => isSet(explicit, "Flags", n))) return base.flagAura;
  return { ...base.flagAura, enabled: names.some((n) => toggle(cfg, "Flags", n, false)) };
}

function withColor(base: PlaygroundConfig, choice: ColorChoice): PlaygroundConfig {
  return {
    ...base,
    colorMode: choice.colorMode,
    colorProperty: choice.colorProperty,
    colorRamp: choice.colorRamp,
    material: choice.materialColor ? { ...base.material, color: choice.materialColor } : base.material,
  };
}

const SHAPE_PRIMITIVE: Record<string, PrimitiveType> = {
  Circle: "icosphere",
  Sphere: "icosphere",
  Square: "pillar",
  Cube: "pillar",
  Diamond: "octahedron",
  Cone: "octahedron",
  "Vehicle model": "sedan",
};

function markerLod(visualId: string, cfg: Cfg, base: PlaygroundConfig): PlaygroundConfig["markerLod"] {
  const lod = slider(visualId, cfg, "Advanced", "Level of distance (zoom visibility)");
  if (lod <= 0) return base.markerLod;
  return { ...base.markerLod, enabled: true, maxFull3d: Math.max(50, Math.round(base.markerLod.maxFull3d * (1 - lod / 100))) };
}

function pillarsScene(cfg: Cfg, explicit: Explicit): LiveMapScene {
  const base = LLUMEN_DEFAULT_CONFIG;
  const maxHeight = slider("pillars", cfg, "Size", "Max Height");
  const choice: ColorChoice = isSet(explicit, "Color", "High value color")
    ? {
        colorMode: "value",
        colorProperty: "speed_kmh",
        colorRamp: [base.material.color, String(cfg("Color", "High value color", "#25C1E6")).slice(0, 7)],
      }
    : { colorMode: base.colorMode, colorProperty: base.colorProperty, colorRamp: base.colorRamp };
  const config: PlaygroundConfig = {
    ...withColor(base, choice),
    datasetId: "amsterdam_ground_vehicles",
    pointVisual: "marker",
    primitive: "pillar",
    pointScaleProfile: "local",
    valueProperty: "speed_kmh",
    localHeightScale: base.localHeightScale * (maxHeight / 3000),
    flagAura: flagAura(cfg, explicit, base),
  };
  return { datasetId: config.datasetId, config };
}

function pointsScene(cfg: Cfg, explicit: Explicit): LiveMapScene {
  const base = LLUMEN_DEFAULT_CONFIG;
  const kind = text("points", cfg, "Marker Shape", "Marker type");
  const shape = kind === "3D" ? text("points", cfg, "Marker Shape", "3D shape") : text("points", cfg, "Marker Shape", "2D shape");
  const size = slider("points", cfg, "Marker appearance", "Point Size");
  let choice = colorChoice(cfg, explicit, base, "speed_kmh", "vehicle_type");
  const categoryField = text("points", cfg, "Color", "Color by category field");
  if (choice.colorMode === "none" && categoryField && categoryField !== "None") {
    choice = {
      colorMode: "categorical",
      colorProperty: "vehicle_type",
      colorRamp: ensurePaletteForMode("categorical", base.colorRamp),
    };
  } else if (choice.colorMode === "none" && !choice.materialColor && isSet(explicit, "Color", "Marker color")) {
    choice = { ...choice, materialColor: String(cfg("Color", "Marker color", base.material.color)).slice(0, 7) };
  }
  const config: PlaygroundConfig = {
    ...withColor(base, choice),
    datasetId: "amsterdam_ground_vehicles",
    pointVisual: "marker",
    primitive: SHAPE_PRIMITIVE[shape] ?? "icosphere",
    pointScaleProfile: "local",
    valueProperty: "speed_kmh",
    localBaseScale: base.localBaseScale * (size / 1.2),
    markerLod: markerLod("points", cfg, base),
    flagAura: flagAura(cfg, explicit, base),
  };
  return { datasetId: config.datasetId, config };
}

function areaScene(cfg: Cfg, explicit: Explicit): LiveMapScene {
  const base = LLUMEN_DEFAULT_CONFIG;
  const mode = text("map-area", cfg, "Extrusion", "Extrusion mode") || "None";
  const fixed = slider("map-area", cfg, "Extrusion", "Extrusion scaling");
  const config: PlaygroundConfig = {
    ...withColor(base, colorChoice(cfg, explicit, base, "POP_EST", "CONTINENT")),
    datasetId: "countries",
    valueProperty: "POP_EST",
    areaBaseHeight: mode === "Fixed height" ? base.areaBaseHeight * (fixed / 50) : base.areaBaseHeight,
    areaExtrusionScale: mode === "Data" ? base.areaExtrusionScale : 0,
    bevelEnabled: base.bevelEnabled,
  };
  return { datasetId: config.datasetId, config };
}

function heatmapScene(cfg: Cfg, explicit: Explicit): LiveMapScene {
  const base = LLUMEN_DEFAULT_CONFIG;
  const dust = sanitizeDustStorm(heatmapConfigFromSettings(cfg), base.dustStorm);
  const { colorLow, colorMid, colorHigh, colorExtreme } = base.dustStorm;
  const config: PlaygroundConfig = {
    ...base,
    datasetId: "dust_storm",
    pointVisual: "dust-storm",
    adaptiveZoomScaling: false,
    dustStorm: isSet(explicit, "Color", "Palette")
      ? dust
      : { ...dust, colorLow, colorMid, colorHigh, colorExtreme },
  };
  return { datasetId: config.datasetId, config };
}

const HIDDEN_STEM = { stemFadeStartZoom: 0, stemFadeEndZoom: 0.01 };

function floodSimSource(cfg: Cfg): FloodSimSource {
  const mapped = (name: string) => String(cfg("Mapping", name, "") ?? "");
  if (mapped("Rain rate")) return "rain";
  if (mapped("Inflow rate")) return "breach";
  if (mapped("Water level")) return "surge";
  return "rain";
}

function waterScene(cfg: Cfg): LiveMapScene | null {
  const base = LLUMEN_DEFAULT_CONFIG;
  const s = waterSurfaceSettings(cfg);
  if (s.mode === "Plume") {
    const w = waterGradientConfigFromSettings(cfg);
    const tinted = s.palette.style !== "Single";
    const config: PlaygroundConfig = {
      ...base,
      datasetId: "nyc_water_outfalls",
      pointVisual: "water-gradient",
      adaptiveZoomScaling: false,
      valueProperty: "of_size",
      colorMode: tinted ? "value" : "none",
      colorProperty: tinted ? "of_size" : null,
      colorRamp: tinted ? paletteRamp(s.palette) : base.colorRamp,
      waterGradient: sanitizeWaterGradient(
        {
          ...w,
          color: w.color.slice(0, 7),
          stemMinHeightMeters: w.stemMinHeight,
          stemMaxHeightMeters: w.stemMaxHeight,
          stemFadeStartZoom: w.stemFadeStart,
          stemFadeEndZoom: w.stemFadeEnd,
          ...(w.showStem ? {} : HIDDEN_STEM),
        },
        base.waterGradient,
      ),
    };
    return { datasetId: config.datasetId, config };
  }
  if (s.mode === "Spill") {
    const o = oilSpillConfigFromSettings(cfg);
    const config: PlaygroundConfig = {
      ...base,
      datasetId: "oil_spill",
      pointVisual: "oil-spill",
      adaptiveZoomScaling: false,
      oilSpill: sanitizeOilSpill(
        {
          ...base.oilSpill,
          ...o,
          fillColor: o.fillColor.slice(0, 7),
          stemHeightMeters: o.stemHeight,
          stemFadeStartZoom: o.stemFadeStart,
          stemFadeEndZoom: o.stemFadeEnd,
        },
        base.oilSpill,
      ),
    };
    return { datasetId: config.datasetId, config };
  }
  if (s.mode === "Flood") {
    const f = floodConfigFromSettings(cfg);
    const config: PlaygroundConfig = {
      ...base,
      datasetId: "dubai_flood",
      pointVisual: "flood",
      adaptiveZoomScaling: false,
      flood: sanitizeFlood(
        { ...DEFAULT_FLOOD, ...f, simSource: floodSimSource(cfg), simRainRecorded: true },
        DEFAULT_FLOOD,
      ),
    };
    return { datasetId: config.datasetId, config };
  }
  return null;
}

/** Null when the visual has no Map 3D renderer yet and keeps the SVG preview. */
export function liveMapScene(visualId: string, cfg: Cfg, explicit: Explicit): LiveMapScene | null {
  switch (visualId) {
    case "pillars":
      return pillarsScene(cfg, explicit);
    case "points":
      return pointsScene(cfg, explicit);
    case "map-area":
      return areaScene(cfg, explicit);
    case "heatmap":
      return heatmapScene(cfg, explicit);
    case "water-surfaces":
      return waterScene(cfg);
    default:
      return null;
  }
}
