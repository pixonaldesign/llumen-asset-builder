import { DEFAULT_DUST_STORM } from "@/lib/configIO";
import type { DustStormSettings } from "@/lib/types";

export type HeatmapPalette = Pick<
  DustStormSettings,
  "colorLow" | "colorMid" | "colorHigh" | "colorExtreme"
>;

/**
 * Four stops at 0, 0.33, 0.66 and 1. Perceptual ramps are sampled from
 * matplotlib; Yellow–red and Blues are ColorBrewer.
 */
export const HEATMAP_PALETTES = {
  storm: {
    colorLow: DEFAULT_DUST_STORM.colorLow,
    colorMid: DEFAULT_DUST_STORM.colorMid,
    colorHigh: DEFAULT_DUST_STORM.colorHigh,
    colorExtreme: DEFAULT_DUST_STORM.colorExtreme,
  },
  "yellow-red": {
    colorLow: "#ffffb2",
    colorMid: "#fecc5c",
    colorHigh: "#f03b20",
    colorExtreme: "#bd0026",
  },
  inferno: {
    colorLow: "#2a0b54",
    colorMid: "#9c2964",
    colorHigh: "#ed6925",
    colorExtreme: "#fcffa4",
  },
  magma: {
    colorLow: "#2c115f",
    colorMid: "#b5367a",
    colorHigh: "#fb8761",
    colorExtreme: "#fcfdbf",
  },
  viridis: {
    colorLow: "#440154",
    colorMid: "#31688e",
    colorHigh: "#35b779",
    colorExtreme: "#fde725",
  },
  turbo: {
    colorLow: "#466be3",
    colorMid: "#2ef19c",
    colorHigh: "#fb8022",
    colorExtreme: "#900c00",
  },
  blues: {
    colorLow: "#eff3ff",
    colorMid: "#9ecae1",
    colorHigh: "#3182bd",
    colorExtreme: "#08519c",
  },
  flood: {
    colorLow: "#bfe9f2",
    colorMid: "#3fb2d8",
    colorHigh: "#1f5fae",
    colorExtreme: "#1b1f6b",
  },
} satisfies Record<string, HeatmapPalette>;

export type HeatmapPaletteId = keyof typeof HEATMAP_PALETTES;

export const HEATMAP_PALETTE_OPTIONS: Record<string, HeatmapPaletteId> = {
  "Dust storm (default)": "storm",
  "Yellow–red": "yellow-red",
  Inferno: "inferno",
  Magma: "magma",
  Viridis: "viridis",
  Turbo: "turbo",
  Blues: "blues",
  "Flood depth": "flood",
};

export function heatmapPalette(id: string): HeatmapPalette | null {
  return Object.hasOwn(HEATMAP_PALETTES, id)
    ? HEATMAP_PALETTES[id as HeatmapPaletteId]
    : null;
}

export function matchHeatmapPalette(
  colors: HeatmapPalette,
): HeatmapPaletteId | null {
  const key = (p: HeatmapPalette) =>
    [p.colorLow, p.colorMid, p.colorHigh, p.colorExtreme]
      .map((c) => c.toLowerCase())
      .join("|");
  const target = key(colors);
  const match = Object.entries(HEATMAP_PALETTES).find(
    ([, palette]) => key(palette) === target,
  );
  return match ? (match[0] as HeatmapPaletteId) : null;
}
