import { DEFAULT_COLOR_MODE, type ColorModeConfig } from "./previewTheme";

/** Solid plume tint from the tuned Map 3D water-gradient panel. */
export const WATER_PLUME_PALETTE: ColorModeConfig = {
  ...DEFAULT_COLOR_MODE,
  paletteName: "Plume",
  paletteFamily: "Sequential",
  colors: ["#b7e22a", "#e2f4a0"],
  style: "Single",
  color: "#b7e22a",
  opacity: 100,
  stops: [
    { value: 0, color: "#b7e22a", opacity: 100 },
    { value: 100, color: "#e2f4a0", opacity: 100 },
  ],
};

/** Solid slick body. The rim keeps the thin-film sheen. */
export const WATER_SPILL_PALETTE: ColorModeConfig = {
  ...DEFAULT_COLOR_MODE,
  paletteName: "Spill",
  paletteFamily: "Sequential",
  colors: ["#000000", "#3a3a3a"],
  style: "Single",
  color: "#000000",
  opacity: 100,
  stops: [
    { value: 0, color: "#000000", opacity: 100 },
    { value: 100, color: "#3a3a3a", opacity: 100 },
  ],
};

/** Solid ocean tint from staging water-current defaults, at 30% opacity. */
export const WATER_CURRENT_PALETTE: ColorModeConfig = {
  ...DEFAULT_COLOR_MODE,
  paletteName: "Current",
  paletteFamily: "Sequential",
  colors: ["#0d6d78", "#7ec8c3"],
  style: "Single",
  color: "#0d6d78",
  opacity: 30,
  stops: [
    { value: 0, color: "#0d6d78", opacity: 30 },
    { value: 100, color: "#7ec8c3", opacity: 30 },
  ],
};
