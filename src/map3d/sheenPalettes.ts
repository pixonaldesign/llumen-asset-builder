/**
 * Sheen swatches from the Llumen asset builder color presets
 * (`llumen-asset-builder/src/ColorPalette.tsx` and `heatmapPalettes.ts`,
 * commit 0a4832f). `thin-film` keeps the spill's interference colors.
 * Opacity ramps are left out; trail opacity already controls that.
 */

export const THIN_FILM_SHEEN_ID = "thin-film";

export type SheenPalette = {
  id: string;
  label: string;
  /** Empty for the built-in interference sheen. */
  stops: string[];
};

export const SHEEN_PALETTES: SheenPalette[] = [
  { id: THIN_FILM_SHEEN_ID, label: "Thin film", stops: [] },
  {
    id: "blue-white",
    label: "Blue → White",
    stops: ["#2b61f5", "#356eea", "#4f86ea", "#6a9ef3", "#a8c9fa", "#d8e6fd", "#f7f9ff"],
  },
  {
    id: "purple-white",
    label: "Purple → White",
    stops: ["#5a2fc7", "#764fd8", "#9673e8", "#b899f5", "#d6c2fb", "#e9ddff", "#f6f2ff"],
  },
  {
    id: "teal-white",
    label: "Teal → White",
    stops: ["#159a7d", "#23b899", "#45cdb9", "#94e8dc", "#b8f0e6", "#d5f8f2", "#eefcfa"],
  },
  {
    id: "red-white",
    label: "Red → White",
    stops: ["#c62828", "#f56b6b", "#ff9292", "#ffbbbb", "#ffd5d5", "#ffe7e7", "#fff7f7"],
  },
  {
    id: "gold-white",
    label: "Gold → White",
    stops: ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a", "#fef3c7", "#fef7d6", "#fffbeb"],
  },
  {
    id: "default-cat",
    label: "Default",
    stops: ["#6a9ef0", "#bdb6f4", "#26ada0", "#7ad488", "#fceed6", "#f38666", "#cac5f6", "#ed7986", "#534d8f", "#a8ded9"],
  },
  {
    id: "deep-cat",
    label: "Deep",
    stops: ["#557ec0", "#4a438b", "#329d93", "#24502a", "#90651d", "#f9c3b3", "#405f90", "#f19ba4", "#8b81ee", "#3ec4b8"],
  },
  {
    id: "ember-cat",
    label: "Ember",
    stops: ["#823864", "#f06840", "#aa4073", "#f6bcc3", "#6f67be", "#604313", "#47a155", "#25766e", "#ecd09f", "#7b6fe8"],
  },
  {
    id: "earth-cat",
    label: "Earth",
    stops: ["#cac5f6", "#47a155", "#38345f", "#90651d", "#572642", "#25766e", "#ed7986", "#a66e0d", "#a6c5f6", "#aa4073"],
  },
  {
    id: "spectrum-cat",
    label: "Spectrum",
    stops: ["#47a155", "#f6bcc3", "#c08626", "#0f4540", "#7b6fe8", "#65d0c6", "#ae4b85", "#c3d8f9", "#dd73a6", "#533706"],
  },
  {
    id: "red-white-blue",
    label: "Red → White → Blue",
    stops: ["#9f1d1d", "#df3f3f", "#f7a0a0", "#f3f4f6", "#cce4fb", "#68b1ee", "#1565c0"],
  },
  {
    id: "purple-white-teal",
    label: "Purple → White → Teal",
    stops: ["#6b21a8", "#9333c9", "#c084fc", "#f3e8ff", "#99f6e4", "#2dd4bf", "#0f766e"],
  },
  {
    id: "purple-white-green",
    label: "Purple → White → Green",
    stops: ["#8e00a8", "#bd00d3", "#ed75e7", "#f7f7f7", "#8bdc84", "#2dbb25", "#18851f"],
  },
  {
    id: "blue-white-lime",
    label: "Blue → White → Lime",
    stops: ["#002cd4", "#245eeb", "#7b79f2", "#f7f7f7", "#e5e676", "#c9ca2d", "#9c9d1c"],
  },
  {
    id: "dust",
    label: "Dust",
    stops: ["#f4e4c4", "#ebc387", "#e2a14a", "#e18633", "#e06a1c", "#ad4f17", "#7a3412"],
  },
  {
    id: "yellow-red",
    label: "Yellow → Red",
    stops: ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"],
  },
  {
    id: "inferno",
    label: "Inferno",
    stops: ["#280b54", "#65156e", "#9f2a63", "#d44842", "#f57d15", "#fac127", "#fcffa4"],
  },
  {
    id: "magma",
    label: "Magma",
    stops: ["#2c115f", "#5f187f", "#982d80", "#d3436e", "#f8765c", "#febb81", "#fcfdbf"],
  },
  {
    id: "viridis",
    label: "Viridis",
    stops: ["#440154", "#443983", "#31688e", "#21918c", "#35b779", "#90d743", "#fde725"],
  },
  {
    id: "turbo",
    label: "Turbo",
    stops: ["#466be3", "#28bceb", "#2ef19c", "#a4fc3c", "#f3c63a", "#fb8022", "#900c00"],
  },
];

export const SHEEN_PALETTE_OPTIONS: Record<string, string> = Object.fromEntries(
  SHEEN_PALETTES.map((palette) => [palette.label, palette.id]),
);

export function sheenPalette(id: string): SheenPalette | null {
  return SHEEN_PALETTES.find((palette) => palette.id === id) ?? null;
}

export function sanitizeSheenPalette(value: unknown): string {
  return typeof value === "string" && sheenPalette(value)
    ? value
    : THIN_FILM_SHEEN_ID;
}
