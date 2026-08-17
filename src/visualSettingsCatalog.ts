/**
 * Visual settings catalog remapped from Notion
 * "Visualization Configuration Fields" — Configurable = Yes only.
 * Nav groups are Notion Sub Categories, filtered by the selected visual type.
 */

import type { ControlType, Opt } from "./chartModel";

export type NotionVisualType =
  | "All Charts & KPIs"
  | "All Data Tables"
  | "All Map Layers"
  | "Vertical Bar"
  | "Horizontal Bar"
  | "Progress Bar"
  | "Line"
  | "Area"
  | "Scatter"
  | "Pie/Donut"
  | "Gauge"
  | "Score Indicator"
  | "Polar"
  | "Range"
  | "Availability"
  | "KPI Card"
  | "KPI Grid"
  | "Data Table"
  | "Points"
  | "Wind"
  | "Fences"
  | "Pillars"
  | "Areas"
  | "Heatmap"
  | "Discs"
  | "Arcs";

export const NOTION_TYPE_BY_VISUAL_ID: Record<string, NotionVisualType> = {
  "vertical-bar": "Vertical Bar",
  "horizontal-bar": "Horizontal Bar",
  "progress-bar": "Progress Bar",
  "line-chart": "Line",
  "area-chart": "Area",
  "scatter-plot": "Scatter",
  "donut-chart": "Pie/Donut",
  "gauge-linear": "Gauge",
  "gauge-circular": "Gauge",
  "score-indicator": "Score Indicator",
  "polar-wind-rose": "Polar",
  range: "Range",
  availability: "Availability",
  "kpi-card": "KPI Card",
  "kpi-grid": "KPI Grid",
  table: "Data Table",
  points: "Points",
  wind: "Wind",
  fences: "Fences",
  pillars: "Pillars",
  "map-area": "Areas",
  heatmap: "Heatmap",
  discs: "Discs",
  arcs: "Arcs",
};

const ALL_CHARTS_KPIS: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Gauge",
  "Score Indicator",
  "Polar",
  "Range",
  "Availability",
  "KPI Card",
  "KPI Grid",
];

const ALL_MAP_LAYERS: NotionVisualType[] = [
  "Arcs",
  "Discs",
  "Fences",
  "Heatmap",
  "Wind",
  "Points",
  "Areas",
  "Pillars",
];

const AXIS_CHARTS: NotionVisualType[] = ["Vertical Bar", "Horizontal Bar", "Line", "Area", "Scatter", "Range"];
const STORY_KPI: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Score Indicator",
  "Range",
];
const COLOR_MODE: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Availability",
];
const LEGEND: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Range",
  "Availability",
];
const BADGE: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Progress Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Gauge",
  "Score Indicator",
  "Polar",
  "Range",
  "Availability",
  "KPI Card",
];
const BADGE_COLOR: NotionVisualType[] = BADGE.filter((t) => t !== "Gauge");
const TOOLTIPS: NotionVisualType[] = [
  "Vertical Bar",
  "Horizontal Bar",
  "Line",
  "Area",
  "Scatter",
  "Pie/Donut",
  "Gauge",
  "Score Indicator",
  "Polar",
  "Range",
];
const BARS: NotionVisualType[] = ["Vertical Bar", "Horizontal Bar"];
const LINE_AREA: NotionVisualType[] = ["Line", "Area"];
const MAP_COLOR: NotionVisualType[] = ["Arcs", "Discs", "Fences", "Heatmap", "Wind", "Points", "Areas"];
const MAP_TOOLTIPS: NotionVisualType[] = ["Arcs", "Discs", "Fences", "Heatmap", "Pillars", "Points", "Areas"];

export const SUBCATEGORY_ORDER = [
  "Mapping",
  "Story card KPI",
  "Color mode",
  "Layout & visibility",
  "Legend",
  "Status badge",
  "Bar",
  "Line",
  "Area styling",
  "Scatter",
  "Pie / Donut",
  "Gauge — zone colors",
  "Gauge — meter & labels",
  "Track & marker styling",
  "Intensity color ramp",
  "Bar gradient",
  "KPI card",
  "KPI Grid",
  "Status",
  "Scaling / axes",
  "Tooltips",
  "Annotations / guidelines",
  "Colors & Opacity",
  "Line Customization",
  "Height",
  "Size",
  "Disc Scaling",
  "Disc ring",
  "Ground disc",
  "Marker Shape",
  "Marker appearance",
  "Heatmap Style",
  "Bin & extrusion",
  "Contour Terrain",
  "Extrusion",
  "Opacity source",
  "Animation",
  "Advanced",
  "Map Legend",
  "Tooltip Fields",
] as const;

type VisibleWhen = { group: string; name: string; is: string | string[] };

type FieldDef = {
  name: string;
  desc?: string;
  control: ControlType;
  values?: string[];
  valuesByType?: Partial<Record<NotionVisualType, string[]>>;
  subCategory: string;
  types: NotionVisualType[];
  required?: boolean;
  def?: boolean;
  defaultValue?: unknown;
  visibleWhen?: VisibleWhen;
};

const f = (
  name: string,
  control: ControlType,
  subCategory: string,
  types: NotionVisualType[],
  extra: Omit<FieldDef, "name" | "control" | "subCategory" | "types"> = {},
): FieldDef => ({ name, control, subCategory, types, ...extra });

const FIELDS: FieldDef[] = [
  /* ---- Mapping (shared + per type) ---- */
  f("Aggregation", "dropdown", "Mapping", ["All Charts & KPIs"], {
    desc: "How to combine rows: None (raw), Sum, Average, Min, Max, Count.",
    values: ["None (raw value)", "Sum", "Average", "Min", "Max", "Count"],
    defaultValue: "None (raw value)",
  }),
  f("Y-axis values (ML only)", "segmented", "Mapping", ["All Charts & KPIs"], {
    desc: "For ML-prediction sources: Predicted only / Actual only / Actual vs predicted.",
    values: ["Predicted only", "Actual only", "Actual vs predicted"],
  }),
  f("X axis", "field", "Mapping", ["Vertical Bar", "Line", "Area", "Range"], {
    desc: "Categorical, datetime or numeric column.",
    required: true,
  }),
  f("Y axis", "field", "Mapping", ["Vertical Bar", "Line", "Area"], {
    desc: "Numeric column. Skipped when aggregation is Count.",
    required: true,
  }),
  f("Series", "field", "Mapping", ["Vertical Bar", "Horizontal Bar", "Line", "Area"], {
    desc: "Categorical column, ≤50 unique values.",
  }),
  f("Max/Total", "field", "Mapping", BARS.concat(["Progress Bar"]), {
    desc: "Numeric column used as the bar maximum / total.",
  }),
  f("Reference value", "field", "Mapping", ["Line", "Area", "Range"], {
    desc: "Draws a reference line.",
  }),
  f("X value", "field", "Mapping", ["Horizontal Bar", "Progress Bar", "Scatter"], {
    desc: "Numeric column.",
    required: true,
  }),
  f("Y category", "field", "Mapping", ["Horizontal Bar", "Progress Bar"], {
    desc: "Used when stacked or aggregation is Count.",
  }),
  f("Y value", "field", "Mapping", ["Scatter"], {
    desc: "Skipped when aggregation is Count.",
    required: true,
  }),
  f("Point size", "field", "Mapping", ["Scatter"]),
  f("Color/Category", "field", "Mapping", ["Scatter"]),
  f("Category", "field", "Mapping", ["Pie/Donut"], { required: true }),
  f("Value", "field", "Mapping", ["Pie/Donut", "Gauge", "Availability", "KPI Card", "KPI Grid"], {
    required: true,
  }),
  f("Unit", "field", "Mapping", ["Gauge", "KPI Card", "KPI Grid"]),
  f("Status", "field", "Mapping", ["Gauge", "KPI Grid"]),
  f("Min/Max", "number", "Mapping", ["Gauge"], {
    desc: "Fallback numbers when min/max fields are empty.",
    defaultValue: "0 / 100",
  }),
  f("Value calculation", "dropdown", "Mapping", ["KPI Card"], {
    values: ["First row", "Last row", "Maximum", "Minimum", "Sum"],
    defaultValue: "First row",
  }),
  f("Max value", "field", "Mapping", ["KPI Card"]),
  f("Comparison value", "field", "Mapping", ["KPI Card"]),
  f("Metric label", "field", "Mapping", ["KPI Grid"], { required: true }),
  f("Secondary label/context", "field", "Mapping", ["KPI Grid"]),
  f("Low value", "field", "Mapping", ["Range"], { required: true }),
  f("High value", "field", "Mapping", ["Range"], { required: true }),
  f("Direction", "field", "Mapping", ["Polar"], { required: true }),
  f("Wind speed / band", "field", "Mapping", ["Polar"], { required: true }),
  f("Frequency", "field", "Mapping", ["Polar"], {
    desc: "Unmapped — each row counts as 1.",
  }),
  f("Visible columns", "multi", "Mapping", ["Data Table"], {
    desc: "Multi-select with Select all / Clear.",
    required: true,
    values: [
      "district",
      "region",
      "category",
      "timestamp",
      "value",
      "amount",
      "incidents",
      "completion_rate",
      "status",
      "unit",
      "series",
      "predicted",
      "actual",
      "name",
      "type",
      "direction",
      "wind_speed",
      "origin",
      "destination",
    ],
  }),
  f("Header label per column", "text", "Mapping", ["Data Table"], {
    desc: "Blank uses the raw column name.",
  }),
  f("Origin", "field", "Mapping", ["Arcs"], { required: true }),
  f("Destination", "field", "Mapping", ["Arcs"], { required: true }),
  f("Geometry Column", "field", "Mapping", ["Arcs"]),
  f("Location field", "field", "Mapping", ["Discs", "Points"], { required: true }),
  f("Coordinates (Geometry)", "field", "Mapping", ["Fences"], { required: true }),
  f("Location", "field", "Mapping", ["Pillars"], { required: true }),
  f("Value", "field", "Mapping", ["Pillars", "Areas"]),
  f("Geometry", "field", "Mapping", ["Areas"], { required: true }),
  f("Name", "field", "Mapping", ["Areas"]),
  f("Type", "field", "Mapping", ["Areas"]),
  f("Coordinates", "field", "Mapping", ["Heatmap", "Wind"], { required: true }),
  f("Intensity Value Field", "field", "Mapping", ["Heatmap"]),
  f("U Component (Eastward)", "field", "Mapping", ["Wind"]),
  f("V Component (Northward)", "field", "Mapping", ["Wind"]),

  /* ---- Story card KPI ---- */
  f("KPI value field", "field", "Story card KPI", STORY_KPI, {
    desc: "Numeric column for the headline number.",
  }),
  f("KPI value calculation", "dropdown", "Story card KPI", STORY_KPI, {
    values: ["Hidden unless manual value is set", "Last row", "First row", "Maximum", "Minimum", "Sum"],
    defaultValue: "Sum",
  }),
  f("KPI unit field", "field", "Story card KPI", STORY_KPI),
  f("KPI min / max value fields", "field", "Story card KPI", STORY_KPI, {
    desc: "Columns for range context. On Score Indicator these also define the gradient bar's scale.",
  }),
  f("Manual override", "toggle", "Story card KPI", STORY_KPI, {
    desc: "Replace mapped KPI value, range, and unit with static values.",
    def: false,
  }),
  f("Value", "text", "Story card KPI", STORY_KPI, {
    desc: "Headline number shown on the story card.",
    visibleWhen: { group: "Story card KPI", name: "Manual override", is: "true" },
  }),
  f("Min", "text", "Story card KPI", STORY_KPI, {
    desc: "Manual minimum for range context and score scale.",
    visibleWhen: { group: "Story card KPI", name: "Manual override", is: "true" },
  }),
  f("Max", "text", "Story card KPI", STORY_KPI, {
    desc: "Manual maximum for range context and score scale.",
    visibleWhen: { group: "Story card KPI", name: "Manual override", is: "true" },
  }),
  f("Unit", "text", "Story card KPI", STORY_KPI, {
    desc: "Unit label, e.g. % or M AED.",
    visibleWhen: { group: "Story card KPI", name: "Manual override", is: "true" },
  }),

  /* ---- Color mode ---- */
  f("Palette", "color", "Color mode", COLOR_MODE, {
    desc: "Pick a palette, then apply it as a single color, a gradient, or discrete steps.",
  }),

  /* ---- Layout & visibility ---- */
  f("Show insight", "toggle", "Layout & visibility", ["All Charts & KPIs"], {
    desc: "Footer caption from the mapped Insight column, or the Insight field in General Info as fallback.",
  }),
  f("Show data labels", "toggle", "Layout & visibility", ["All Charts & KPIs"], {
    desc: "Value labels on marks (also drives values on bars).",
    def: false,
  }),

  /* ---- Legend ---- */
  f("Show legend", "toggle", "Legend", LEGEND, {
    desc: "Hidden entirely for Progress Bar and horizontal category-stack bars.",
    def: false,
  }),
  f("Position", "segmented", "Legend", LEGEND, {
    values: ["Top", "Bottom"],
    valuesByType: { "Pie/Donut": ["Left", "Right"] },
    defaultValue: "Top",
    visibleWhen: { group: "Legend", name: "Show legend", is: "true" },
  }),
  f("Content", "multi", "Legend", LEGEND, {
    desc: "Show labels · Show values · Show percentages.",
    values: ["Show labels", "Show values", "Show percentages"],
    visibleWhen: { group: "Legend", name: "Show legend", is: "true" },
  }),

  /* ---- Status badge ---- */
  f("Show status badge", "toggle", "Status badge", BADGE, {
    desc: "One toggle fans out to the renderer and KPI-card paths.",
  }),
  f("Text source", "dropdown", "Status badge", BADGE, {
    values: ["Mapped status field", "Specific column", "Manual text", "Template"],
    defaultValue: "Mapped status field",
  }),
  f("Column / Manual / Template / Fallback", "text", "Status badge", BADGE, {
    desc: "Source-specific inputs; template supports tokens like {status}, {value}, {columnName}.",
  }),
  f("Color source field", "field", "Status badge", BADGE_COLOR, {
    desc: "Numeric column → thresholds, text column → value map.",
  }),
  f("Color thresholds", "repeatable", "Status badge", BADGE_COLOR, {
    desc: "min/max → color, first match wins, inclusive bounds. Shown when the color source is numeric.",
  }),

  /* ---- Bar ---- */
  f("Show values on bars", "toggle", "Bar", BARS, { def: false }),
  f("Sort by value", "toggle", "Bar", BARS, { def: false }),
  f("Sort order", "segmented", "Bar", BARS, {
    values: ["Ascending", "Descending"],
    defaultValue: "Descending",
    visibleWhen: { group: "Bar", name: "Sort by value", is: "true" },
  }),
  f("Stack series", "toggle", "Bar", BARS, { def: false }),
  f("Top N categories", "slider", "Bar", BARS, {
    desc: "0–100 (0 = auto by card height).",
  }),
  f("Background track style", "segmented", "Bar", BARS, {
    values: ["None", "Full", "Segmented"],
    defaultValue: "None",
  }),
  f("Layout", "segmented", "Bar", ["Horizontal Bar"], {
    values: ["Inline", "Cartesian"],
  }),
  f("KPI number mode", "segmented", "Bar", ["Progress Bar"], {
    values: ["Percentage", "Value of total"],
  }),

  /* ---- Line / Area / Scatter / Pie ---- */
  f("Chart style", "segmented", "Line", LINE_AREA, {
    values: ["Line", "Area"],
  }),
  f("Show data points", "toggle", "Line", LINE_AREA, { def: false }),
  f("Curve interpolation", "dropdown", "Line", LINE_AREA, {
    values: ["Smooth", "Linear", "Step", "Step before", "Step after", "Natural"],
    defaultValue: "Smooth",
  }),
  f("Line + Area colors", "colorPair", "Area styling", ["Area"], {
    desc: "Stroke and fill.",
  }),
  f("Fill opacity", "slider", "Area styling", ["Area"], {
    desc: "0–1.",
  }),
  f("Min / max bubble radius", "slider", "Scatter", ["Scatter"], {
    desc: "min 1–20 / max 10–100 px.",
  }),
  f("Label format", "segmented", "Pie / Donut", ["Pie/Donut"], {
    values: ["Percentage", "Value", "Both"],
  }),

  /* ---- Gauge / Score / Polar / Range ---- */
  f("Color zones on dial", "toggle", "Gauge — zone colors", ["Gauge"]),
  f("Movement state", "dropdown", "Gauge — meter & labels", ["Gauge"], {
    values: ["Rising", "Falling", "Stabilizing"],
    defaultValue: "Rising",
  }),
  f("Show status badge", "toggle", "Gauge — meter & labels", ["Gauge"], { def: false }),
  f("Show center value", "toggle", "Gauge — meter & labels", ["Gauge"]),
  f("Tick subdivisions", "slider", "Gauge — meter & labels", ["Gauge"], {
    desc: "12–120.",
  }),
  f("Show marker", "toggle", "Track & marker styling", ["Score Indicator"]),
  f("Fill track to marker", "toggle", "Track & marker styling", ["Score Indicator"], { def: false }),
  f("Change Intensity legend label", "text", "Intensity color ramp", ["Polar"]),
  f("Ramp colors (low→high)", "repeatable", "Intensity color ramp", ["Polar"], {
    desc: "Low→high intensity colors; add/remove rows.",
  }),
  f("Bar gradient", "gradient", "Bar gradient", ["Range"], {
    desc: "Value-mapped gradient editor.",
  }),

  /* ---- KPI card / grid ---- */
  f("Value format", "dropdown", "KPI card", ["KPI Card"], {
    values: ["Number", "Currency (USD)", "Percentage", "Duration (minutes)"],
  }),
  f("Show unit", "toggle", "KPI card", ["KPI Card"]),
  f("Show comparison vs last period", "toggle", "KPI card", ["KPI Card"], {
    desc: "Uses mapped comparison value.",
  }),
  f("Show status pill", "toggle", "KPI Grid", ["KPI Grid"]),
  f("Highlight critical tiles (glow)", "toggle", "KPI Grid", ["KPI Grid"], { def: false }),
  f("Status → tile accent color", "repeatable", "Status", ["KPI Grid"], {
    desc: "Repeatable color rows per status.",
  }),

  /* ---- Scaling / axes ---- */
  f("Show label", "toggle", "Scaling / axes", AXIS_CHARTS, { def: false }),
  f("Axis label", "text", "Scaling / axes", AXIS_CHARTS, {
    desc: "Override; empty uses the mapped field name.",
    visibleWhen: { group: "Scaling / axes", name: "Show label", is: "true" },
  }),
  f("Format", "text", "Scaling / axes", AXIS_CHARTS, {
    desc: "D3 number format for ticks (e.g. .2f, $,.0f, %).",
  }),
  f("Tick mode", "segmented", "Scaling / axes", AXIS_CHARTS, {
    values: ["Standard", "Endpoints Only"],
    defaultValue: "Standard",
  }),
  f("Show ticks / tick labels / gridlines", "multi", "Scaling / axes", AXIS_CHARTS, {
    desc: "Three independent toggles.",
    values: ["Show Ticks", "Show Tick Labels", "Show Grid Lines"],
  }),
  f("Manual range (min/max)", "number", "Scaling / axes", AXIS_CHARTS, {
    desc: "Hard-set the domain; blank = auto.",
  }),

  /* ---- Tooltips / Annotations ---- */
  f("Enable tooltip", "toggle", "Tooltips", TOOLTIPS),
  f("Tooltip format", "text", "Tooltips", ["Vertical Bar", "Horizontal Bar", "Line", "Area", "Scatter", "Pie/Donut"], {
    desc: "D3 number format for the value (e.g. .0f), or a template with {value}, {category}, {timestamp}, {unit}, {status}.",
    defaultValue: ".0f",
  }),
  f("Tooltip content fields", "multi", "Tooltips", TOOLTIPS, {
    desc: "Hover shows these mock-data columns: value, category, timestamp, unit, status.",
    values: ["value", "category", "timestamp", "unit", "status"],
    defaultValue: ["value", "category", "timestamp"],
  }),
  f("Source", "dropdown", "Annotations / guidelines", AXIS_CHARTS, {
    values: ["Average", "Maximum", "Minimum", "Linear trend (OLS)", "Manual position"],
    defaultValue: "Average",
  }),
  f("Axis (manual only)", "dropdown", "Annotations / guidelines", AXIS_CHARTS, {
    values: ["X only (vertical)", "Y only (horizontal)", "X and Y (cross)"],
    defaultValue: "Y only (horizontal)",
    visibleWhen: { group: "Annotations / guidelines", name: "Source", is: "Manual position" },
  }),
  f("X position / Y value (manual)", "text", "Annotations / guidelines", AXIS_CHARTS, {
    desc: "X: band/category key · Y: number.",
    visibleWhen: { group: "Annotations / guidelines", name: "Source", is: "Manual position" },
  }),
  f("Line shape (avg/max/min)", "dropdown", "Annotations / guidelines", AXIS_CHARTS, {
    values: ["Straight (full width)", "Follow categories (line)"],
    defaultValue: "Straight (full width)",
  }),
  f("Label", "text", "Annotations / guidelines", AXIS_CHARTS, {
    desc: "Caption text.",
  }),
  f("Unit", "text", "Annotations / guidelines", AXIS_CHARTS, {
    desc: "Appended after the value.",
  }),
  f("Show caption on chart", "toggle", "Annotations / guidelines", AXIS_CHARTS),

  /* ---- Map: Colors & Opacity ---- */
  f("Color Mode", "segmented", "Colors & Opacity", MAP_COLOR, {
    values: ["Solid", "Gradient"],
    defaultValue: "Solid",
  }),
  f("Solid color", "color", "Colors & Opacity", MAP_COLOR, {
    defaultValue: "#1FCE7A",
    visibleWhen: { group: "Colors & Opacity", name: "Color Mode", is: "Solid" },
  }),
  f("Data Field", "field", "Colors & Opacity", MAP_COLOR),
  f("Distribution", "dropdown", "Colors & Opacity", ["Arcs", "Discs", "Fences", "Heatmap", "Wind", "Areas"], {
    values: ["Linear", "Quantile", "Quantize"],
    defaultValue: "Linear",
  }),
  f("Color stops", "gradient", "Colors & Opacity", MAP_COLOR, {
    visibleWhen: { group: "Colors & Opacity", name: "Color Mode", is: "Gradient" },
  }),
  f("Categorical color stops + Other", "colorList", "Colors & Opacity", ["Points", "Areas"]),
  f("Color by category field", "field", "Colors & Opacity", ["Points"]),
  f("Marker color", "color", "Colors & Opacity", ["Points"]),
  f("Normalize values", "toggle", "Colors & Opacity", ["Pillars"]),
  f("Border Thickness", "slider", "Colors & Opacity", ["Arcs"], { desc: "0–10 px." }),

  /* ---- Map type-specific ---- */
  f("Source → Destination Indicator", "text", "Line Customization", ["Arcs"]),
  f("Height Exaggeration", "toggle", "Height", ["Fences"], { def: false }),
  f("Fence height", "slider", "Height", ["Fences"], { desc: "0–5000." }),
  f("Max Height", "slider", "Size", ["Pillars"], { desc: "0–8000. Default 3000." }),
  f("Disc scaling", "repeatable", "Disc Scaling", ["Discs"]),
  f("Fill style", "segmented", "Disc ring", ["Discs"], { values: ["Solid", "None"] }),
  f("Disc base color", "color", "Disc ring", ["Discs"], { defaultValue: "#1FCE7A" }),
  f("Disc radius multiplier", "slider", "Disc ring", ["Discs"], { desc: "0.2–4. Default 1.2." }),
  f("Show endpoint discs", "toggle", "Disc ring", ["Arcs"], { def: false }),
  f("Endpoint disc scaling", "repeatable", "Disc ring", ["Arcs"]),
  f("Show ground disc", "toggle", "Ground disc", ["Points"]),
  f("Fill style", "segmented", "Ground disc", ["Points"], { values: ["None", "Solid"] }),
  f("Disc color", "color", "Ground disc", ["Points"]),
  f("Disc radius multiplier", "slider", "Ground disc", ["Points"], { desc: "0.2–4. Default 1.2." }),
  f("Disc fill opacity", "slider", "Ground disc", ["Points"], { desc: "0–1. Default 0.18." }),
  f("Ground disc scaling", "repeatable", "Ground disc", ["Points"]),
  f("Marker type", "segmented", "Marker Shape", ["Points"], { values: ["2D", "3D"] }),
  f("2D shape", "segmented", "Marker Shape", ["Points"], { values: ["Circle", "Square", "Diamond"] }),
  f("3D shape", "segmented", "Marker Shape", ["Points"], { values: ["Sphere", "Cube", "Cone"] }),
  f("Empty filled shape (no icon)", "toggle", "Marker Shape", ["Points"], { def: false }),
  f("Icon mode", "segmented", "Marker Shape", ["Points"], { values: ["Static", "By category"] }),
  f("Static Phosphor icon", "dropdown", "Marker Shape", ["Points"], {
    values: ["MapPin", "Circle", "Warning", "Flag"],
    defaultValue: "MapPin",
  }),
  f("Icon category field + mapping", "colorList", "Marker Shape", ["Points"]),
  f("Point Size", "slider", "Marker appearance", ["Points"], { desc: "0.2–8. Default 1.2." }),
  f("Marker size by data", "repeatable", "Marker appearance", ["Points"]),
  f("Style", "segmented", "Heatmap Style", ["Heatmap"], {
    values: ["Pond", "Grid", "Contour"],
    defaultValue: "Pond",
  }),
  f("Gradient fill", "toggle", "Bin & extrusion", ["Heatmap"], { def: false }),
  f("3D extrusion", "toggle", "Bin & extrusion", ["Heatmap"]),
  f("Elevation Scale", "slider", "Bin & extrusion", ["Heatmap"], { desc: "Default 500." }),
  f("Color Aggregation", "dropdown", "Bin & extrusion", ["Heatmap"], {
    values: ["SUM", "MEAN", "MAX", "MIN", "COUNT"],
    defaultValue: "SUM",
  }),
  f("Elevation Aggregation", "dropdown", "Bin & extrusion", ["Heatmap"], {
    values: ["SUM", "MEAN", "MAX", "MIN", "COUNT"],
    defaultValue: "SUM",
  }),
  f("Coverage", "slider", "Bin & extrusion", ["Heatmap"], { desc: "0–1. Default 0.95." }),
  f("Cell size", "slider", "Bin & extrusion", ["Heatmap"], { desc: "Default 1000." }),
  f("Band width", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 0.06." }),
  f("Contour aggregation", "dropdown", "Contour Terrain", ["Heatmap"], {
    values: ["SUM", "MEAN", "MAX", "MIN", "COUNT"],
    defaultValue: "SUM",
  }),
  f("Cell Size (m)", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 1000." }),
  f("Max Height", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 500." }),
  f("Band count", "slider", "Contour Terrain", ["Heatmap"], { desc: "Default 8." }),
  f("Extrusion mode", "segmented", "Extrusion", ["Areas"], {
    values: ["None", "Height", "Data"],
  }),
  f("Extrusion scaling", "repeatable", "Extrusion", ["Areas"]),
  f("Opacity source", "segmented", "Opacity source", ["Areas"], {
    values: ["Master", "Data"],
  }),
  f("Opacity scaling", "repeatable", "Opacity source", ["Areas"]),
  f("Particle Density", "slider", "Animation", ["Wind"], { desc: "Default 16384." }),
  f("Trail Length", "slider", "Animation", ["Wind"], { desc: "Default 0.996." }),
  f("Animation Speed", "slider", "Animation", ["Wind"], { desc: "Default 0.20." }),
  f("Highlight borders", "toggle", "Advanced", ["Areas"], { def: false }),
  f("Level of distance (zoom visibility)", "slider", "Advanced", ["Areas", "Points"], {
    desc: "0 = off.",
    def: false,
  }),
  f("Falloff Rate", "slider", "Advanced", ["Heatmap"], { desc: "Default 0.2." }),
  f("Sprites per Point", "slider", "Advanced", ["Heatmap"], { desc: "Default 1." }),
  f("Size Multiplier", "slider", "Advanced", ["Heatmap"], { desc: "Default 1.0." }),
  f("Fence zoom scaling", "repeatable", "Advanced", ["Fences"]),
  f("Show legend in Map Data", "toggle", "Map Legend", ["All Map Layers"]),
  f("Tooltip fields", "multi", "Tooltip Fields", MAP_TOOLTIPS, {
    desc: "Hover shows these mock-data columns: name, value, type, status.",
    values: ["name", "value", "type", "status"],
    defaultValue: ["name", "value", "type"],
  }),
];

function expandTypes(types: NotionVisualType[]): Set<NotionVisualType> {
  const out = new Set<NotionVisualType>();
  for (const t of types) {
    if (t === "All Charts & KPIs") ALL_CHARTS_KPIS.forEach((x) => out.add(x));
    else if (t === "All Data Tables") out.add("Data Table");
    else if (t === "All Map Layers") ALL_MAP_LAYERS.forEach((x) => out.add(x));
    else out.add(t);
  }
  return out;
}

function toOpt(def: FieldDef, notionType: NotionVisualType): Opt {
  const values = def.valuesByType?.[notionType] ?? def.values ?? [];
  return {
    name: def.name,
    desc: def.desc ?? "",
    level: def.required || /\(required/i.test(def.name) ? "required" : "core",
    type: def.control,
    values,
    group: def.subCategory,
    def: def.def !== false,
    defaultValue: def.defaultValue,
    visibleWhen: def.visibleWhen,
  };
}

export function notionTypeForVisual(visualId: string): NotionVisualType | undefined {
  return NOTION_TYPE_BY_VISUAL_ID[visualId];
}

export function fieldsForVisual(visualId: string): Opt[] {
  const notionType = NOTION_TYPE_BY_VISUAL_ID[visualId];
  if (!notionType) return [];
  return FIELDS.filter((def) => expandTypes(def.types).has(notionType))
    .map((def) => toOpt(def, notionType))
    .sort((a, b) => Number(a.level !== "required") - Number(b.level !== "required"));
}

export function subCategoriesForVisual(visualId: string): string[] {
  const groups = new Set(fieldsForVisual(visualId).map((o) => o.group));
  return SUBCATEGORY_ORDER.filter((name) => groups.has(name));
}

/** Always-on mapping / appearance tabs. Everything else sits under Extra. */
export const SETTINGS_NAV_CORE = ["Mapping", "Story card KPI", "Color mode"] as const;

export type SettingsNavSection = {
  id: "core" | "extra";
  label: string;
  tabs: string[];
};

export function settingsNavSections(visualId: string): SettingsNavSection[] {
  const tabs = subCategoriesForVisual(visualId);
  const coreSet = new Set<string>(SETTINGS_NAV_CORE);
  const core = tabs.filter((name) => coreSet.has(name));
  const extra = tabs.filter((name) => !coreSet.has(name));
  const sections: SettingsNavSection[] = [];
  if (core.length) sections.push({ id: "core", label: "Core", tabs: core });
  if (extra.length) sections.push({ id: "extra", label: "Extra", tabs: extra });
  return sections;
}

export function isFieldVisible(o: Opt, getValByKey: (group: string, name: string) => unknown): boolean {
  if (!o.visibleWhen) return true;
  const current = String(getValByKey(o.visibleWhen.group, o.visibleWhen.name) ?? "");
  const expected = o.visibleWhen.is;
  return Array.isArray(expected) ? expected.includes(current) : current === expected;
}
