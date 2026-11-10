import type { ColorMode } from "@/lib/types";

/** Default value→color stops (matches the historical hardcoded ramp). */
export const DEFAULT_COLOR_RAMP = ["#1b9e77", "#d95f02", "#7570b3"] as const;

/** Tableau 10 — historical categorical assignment for 3D markers / areas. */
export const DEFAULT_CATEGORY_PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ab",
] as const;

export type ColorRampPreset = {
  id: string;
  label: string;
  stops: string[];
};

export const COLOR_RAMP_PRESETS: ColorRampPreset[] = [
  {
    id: "default",
    label: "Teal – Orange – Purple",
    stops: [...DEFAULT_COLOR_RAMP],
  },
  {
    id: "viridis",
    label: "Viridis",
    stops: ["#440154", "#31688e", "#35b779", "#fde725"],
  },
  {
    id: "inferno",
    label: "Inferno",
    stops: ["#000004", "#781c6d", "#ed6925", "#fcffa4"],
  },
  {
    id: "coolwarm",
    label: "Cool – Warm",
    stops: ["#3b4cc0", "#f7f7f7", "#b40426"],
  },
  {
    id: "grayscale",
    label: "Grayscale",
    stops: ["#000000", "#ffffff"],
  },
];

export const CATEGORY_PALETTE_PRESETS: ColorRampPreset[] = [
  {
    id: "tableau",
    label: "Tableau 10",
    stops: [...DEFAULT_CATEGORY_PALETTE],
  },
  {
    id: "set1",
    label: "Set 1",
    stops: [
      "#e41a1c",
      "#377eb8",
      "#4daf4a",
      "#984ea3",
      "#ff7f00",
      "#ffff33",
      "#a65628",
      "#f781bf",
    ],
  },
  {
    id: "dark2",
    label: "Dark 2",
    stops: [
      "#1b9e77",
      "#d95f02",
      "#7570b3",
      "#e7298a",
      "#66a61e",
      "#e6ab02",
      "#a6761d",
      "#666666",
    ],
  },
  {
    id: "paired",
    label: "Paired",
    stops: [
      "#a6cee3",
      "#1f78b4",
      "#b2df8a",
      "#33a02c",
      "#fb9a99",
      "#e31a1c",
      "#fdbf6f",
      "#ff7f00",
    ],
  },
];

const ALL_PRESETS = [...COLOR_RAMP_PRESETS, ...CATEGORY_PALETTE_PRESETS];

function stopsKey(stops: readonly string[]): string {
  return stops.map((s) => s.toLowerCase()).join("|");
}

/** Palettes shown for the active color mode. */
export function palettesForMode(mode: ColorMode): ColorRampPreset[] {
  return mode === "categorical" ? CATEGORY_PALETTE_PRESETS : COLOR_RAMP_PRESETS;
}

/** Keep a matching preset; otherwise snap to the mode default. */
export function ensurePaletteForMode(
  mode: ColorMode,
  stops: string[],
): string[] {
  if (mode === "none") return stops;
  const presets = palettesForMode(mode);
  const key = stopsKey(stops);
  if (presets.some((preset) => stopsKey(preset.stops) === key)) return stops;
  return [...presets[0]!.stops];
}

export function findPalettePreset(id: string): ColorRampPreset | undefined {
  return ALL_PRESETS.find((preset) => preset.id === id);
}

/** Stops used when assigning category colors to 3D objects. */
export function categoryPaletteStops(stops: string[]): string[] {
  return stops.length >= 2 ? stops : [...DEFAULT_CATEGORY_PALETTE];
}

/** Ensure at least two valid hex-like stops; fall back to defaults. */
export function sanitizeColorRamp(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_COLOR_RAMP];
  const stops = value.filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0,
  );
  if (stops.length < 2) return [...DEFAULT_COLOR_RAMP];
  return stops;
}

export function colorRampCss(stops: string[]): string {
  if (stops.length === 0) return "transparent";
  if (stops.length === 1) return stops[0]!;
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Match a ramp to a known preset id, or null if custom. */
export function matchColorRampPreset(stops: string[]): string | null {
  const key = stopsKey(stops);
  for (const preset of ALL_PRESETS) {
    if (stopsKey(preset.stops) === key) return preset.id;
  }
  return null;
}
