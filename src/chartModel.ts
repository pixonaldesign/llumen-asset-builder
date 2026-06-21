/**
 * Chart Builder Information Architecture
 * Ported from the Lumen chart_builder_hierarchy spec.
 *
 * Four intent-based sections group every control:
 *   Mapping      — what data powers the visual
 *   Customization — how the visual looks
 *   Insights     — meaning layered on top (KPI, status, annotations)
 *   Readout      — precision/detail (scaling, axes, tooltips)
 *
 * Each option has a disclosure level (required/core/advanced/conditional),
 * a control type, optional values, a group (rendered as a card), and a
 * `def` flag that controls whether a toggle starts on (true) or off (false).
 */

export type Level = "required" | "core" | "advanced" | "conditional";

export type ControlType =
  | "field"
  | "dropdown"
  | "toggle"
  | "segmented"
  | "slider"
  | "number"
  | "text"
  | "color"
  | "multi"
  | "repeatable"
  | "gradient"
  | "posgrid"
  | "margins";

export interface Opt {
  name: string;
  desc: string;
  level: Level;
  type: ControlType;
  values: string[];
  group: string;
  def: boolean;
}

export type SectionId = "data" | "design" | "insights" | "advanced";

export interface SectionMeta {
  id: SectionId;
  label: string;
  description: string;
}

export interface Chart {
  name: string;
  preview: string;
  desc: string;
  recs: string[];
  sections: Record<SectionId, Opt[]>;
}

export const sectionMeta: SectionMeta[] = [
  { id: "data", label: "Mapping", description: "Data fields and aggregation controls defined for this visual." },
  { id: "design", label: "Customization", description: "Visual styling, color, layout, legend, and status controls defined for this visual." },
  { id: "insights", label: "Insights", description: "Story KPI and annotation controls when supported." },
  { id: "advanced", label: "Readout", description: "Scaling and tooltip controls when supported." },
];

const opt = (
  name: string,
  desc: string,
  level: Level,
  type: ControlType,
  values: string[] = [],
  group = "General",
  def = true
): Opt => ({ name, desc, level, type, values, group, def });

const req = (name: string, desc = "", type: ControlType = "field", group = "Field Mapping") =>
  opt(name, desc, "required", type, [], group);
const core = (name: string, desc: string, type: ControlType = "toggle", values: string[] = [], group = "General", def = true) =>
  opt(name, desc, "core", type, values, group, def);
const adv = (name: string, desc: string, type: ControlType = "toggle", values: string[] = [], group = "General", def = true) =>
  opt(name, desc, "advanced", type, values, group, def);
const cond = (name: string, desc: string, type: ControlType = "toggle", values: string[] = [], group = "General", def = true) =>
  opt(name, desc, "conditional", type, values, group, def);

const aggregation = () =>
  core("Aggregation", "How to combine rows: None, Sum, Average, Min, Max, Count.", "dropdown", ["None", "Sum", "Average", "Min", "Max", "Count"], "Data Transformation");
const mlYValues = () =>
  cond("Y-axis values (ML only)", "For ML-prediction sources: Predicted only / Actual only / Actual vs predicted.", "segmented", ["Predicted only", "Actual only", "Actual vs predicted"], "Data Transformation");

const storyKpi = (): Opt[] => [
  core("KPI value field", "Numeric column for the headline number.", "field", [], "Story Card KPI"),
  core("KPI value calculation", "How to derive it.", "dropdown", ["Hidden", "First", "Last", "Max", "Min", "Sum"], "Story Card KPI"),
  adv("KPI unit field", "Column supplying the unit.", "field", [], "Story Card KPI"),
  adv("KPI min / max value fields", "Columns for range context.", "field", [], "Story Card KPI"),
  adv("Manual KPI value / min / max / unit", "Static fallbacks, or a full override if a manual value is set.", "text", [], "Story Card KPI"),
];

const colorMode = (): Opt[] => [
  core("Single color", "One color for the whole series.", "color", [], "Colors"),
];

const gradientEditor = (): Opt[] => [
  adv("Color scheme", "Advanced color scheme.", "dropdown", ["Gradient", "Threshold", "Data-driven"], "Gradient Editor"),
  adv("Gradient type", "Gradient rendering mode.", "segmented", ["Linear", "Radial"], "Gradient Editor"),
  adv("Direction / angle", "Linear gradient direction.", "slider", [], "Gradient Editor"),
  adv("Stop positions", "How gradient stops are positioned.", "dropdown", ["Percent (0–100%)", "Axis values"], "Gradient Editor"),
  adv("Value axis", "Axis used by value mode.", "dropdown", ["Auto", "Y", "X"], "Gradient Editor"),
  adv("Color stops", "Add/remove/move stops.", "gradient", [], "Gradient Editor"),
];

const layoutVisibility = (): Opt[] => [
  adv("Margins", "Padding inside the chart frame.", "margins", [], "Layout & Visibility"),
  core("Show title", "Title text itself is set in the final step.", "toggle", [], "Layout & Visibility"),
  core("Show insight", "Footer caption from the Insight field or a mapped column.", "toggle", [], "Layout & Visibility"),
  core("Show data labels", "Value labels on marks.", "toggle", [], "Layout & Visibility"),
];

const legend = (positionValues: string[] = ["Top", "Bottom"]): Opt[] => {
  const topBottom = positionValues.includes("Top") || positionValues.includes("Bottom");
  return [
    core("Show legend", "Controls legend visibility.", "toggle", [], "Legend"),
    topBottom
      ? core("Placement", "Combined legend position and alignment.", "posgrid", [], "Legend")
      : core("Position", "Legend position.", "segmented", positionValues, "Legend"),
    adv("Content", "Legend content toggles.", "multi", ["Show labels", "Show values", "Show percentages"], "Legend"),
  ];
};

const statusBadge = (): Opt[] => [
  core("Show status badge", "Controls status badge visibility.", "toggle", [], "Status Badge"),
  core("Position", "Where the pill sits.", "dropdown", ["Under KPI (above chart)", "Under chart"], "Status Badge"),
  adv("Text source", "Where badge text comes from.", "dropdown", ["Mapped status", "Specific column", "Manual", "Template"], "Status Badge"),
  adv("Column / Manual / Template / Fallback", "Source-specific inputs; template supports tokens like {status}, {value}, {columnName}.", "text", [], "Status Badge"),
  adv("Color source field", "Drives badge color.", "field", [], "Status Badge"),
  adv("Default badge color", "Fallback color.", "color", [], "Status Badge"),
  adv("Color thresholds", "min/max → color, first match wins, inclusive bounds.", "repeatable", [], "Status Badge"),
  adv("Value → color", "Exact text → color.", "repeatable", [], "Status Badge"),
];

const scaling = (includeXAxisPosition = true): Opt[] => [
  core("Axis label", "Override; empty uses the mapped field name.", "text", [], "Axes"),
  ...(includeXAxisPosition ? [adv("X-axis position", "Top / Bottom.", "segmented", ["Top", "Bottom"], "Axes")] : []),
  core("Show label", "Controls axis label visibility.", "toggle", [], "Axes"),
  adv("Format", "D3 number format for ticks.", "text", [], "Axes"),
  adv("Tick mode", "Standard, or only first/last.", "segmented", ["Standard", "Endpoints only"], "Axes"),
  core("Show ticks", "Controls tick visibility.", "toggle", [], "Axes"),
  core("Show tick labels", "Controls tick label visibility.", "toggle", [], "Axes"),
  core("Show gridlines", "Controls gridline visibility.", "toggle", [], "Axes", false),
  adv("Grid color + opacity", "When grid is on.", "color", [], "Axes"),
  adv("Grid line style", "Grid line rendering style.", "segmented", ["Solid", "Dashed", "Dotted"], "Axes"),
  adv("Trim edge ticks", "Remove empty ticks at start/end (X only).", "toggle", [], "Axes", false),
  adv("Manual range (min/max)", "Hard-set the domain; blank = auto.", "number", [], "Axes"),
];

const tooltips = (): Opt[] => [
  core("Enable tooltip", "Controls tooltip visibility.", "toggle", [], "Tooltips"),
  core("Show on hover", "Reveal the tooltip on hover.", "toggle", [], "Tooltips"),
  core("Show on click", "Reveal the tooltip on click.", "toggle", [], "Tooltips", false),
  adv("Tooltip format", "Template, e.g. {x}: {y}.", "text", [], "Tooltips"),
  adv("Tooltip content fields", "Which columns appear in the tooltip.", "multi", [], "Tooltips"),
];

const annotations = (): Opt[] => [
  core("Source", "What the line represents.", "dropdown", ["Average", "Maximum", "Minimum", "Linear trend (OLS)", "Manual position"], "Annotations / Guidelines"),
  cond("Axis (manual only)", "Orientation.", "dropdown", ["X (vertical)", "Y (horizontal)", "Both (cross)"], "Annotations / Guidelines"),
  cond("X position / Y value (manual)", "Where the line sits.", "number", [], "Annotations / Guidelines"),
  adv("Line shape (avg/max/min)", "Straight rule or follow categories.", "dropdown", ["Straight", "Follow categories"], "Annotations / Guidelines"),
  core("Label", "Caption text.", "text", [], "Annotations / Guidelines"),
  adv("Unit", "Appended after the value.", "text", [], "Annotations / Guidelines"),
  core("Show caption on chart", "Controls caption visibility.", "toggle", [], "Annotations / Guidelines"),
  adv("Show value in caption", "Number + unit beside the line.", "toggle", [], "Annotations / Guidelines"),
  adv("Show value on axis", "Adds the value to axis ticks.", "toggle", [], "Annotations / Guidelines", false),
  adv("Show in legend", "Adds guideline to legend.", "toggle", [], "Annotations / Guidelines", false),
  adv("Line style", "Guideline stroke style.", "dropdown", ["Solid", "Dashed", "Dotted"], "Annotations / Guidelines"),
  adv("Stroke width", "Guideline stroke width.", "number", [], "Annotations / Guidelines"),
  adv("Color + opacity", "Guideline color and opacity.", "color", [], "Annotations / Guidelines"),
];

const barStyling = (): Opt[] => [
  core("Show values on bars", "Follows data labels.", "toggle", [], "Bar Styling"),
  core("Sort by value", "Sort bars by value.", "toggle", [], "Bar Styling", false),
  core("Stack series", "Stack mapped series.", "toggle", [], "Bar Styling", false),
  adv("Stroke width", "0–10 px.", "slider", [], "Bar Styling"),
  adv("Corner radius", "0–200 px.", "slider", [], "Bar Styling"),
  adv("Bar width", "1–100 px.", "slider", [], "Bar Styling"),
  adv("Category gap", "0–120 px.", "slider", [], "Bar Styling"),
  adv("Segment / stack gap", "0–40 px.", "slider", [], "Bar Styling"),
  adv("Top N categories", "0–100.", "slider", [], "Bar Styling"),
  adv("Background track style", "Full background / Segmented.", "segmented", ["Full background", "Segmented"], "Bar Styling"),
];

export const charts: Record<string, Chart> = {
  bar: {
    name: "Bar (vertical)",
    preview: "bar",
    desc: "Bar chart builder options from the spec.",
    recs: [
      "Mapping: X axis, Y axis, Series, Max/Total, Aggregation.",
      "Customization: Colors, Bar styling, Layout, Legend, Status badge.",
      "Scaling, Tooltips, and Annotations are supported.",
    ],
    sections: {
      data: [req("X axis"), req("Y axis"), core("Series", "", "field", [], "Field Mapping"), cond("Max/Total", "", "field", [], "Field Mapping"), aggregation(), mlYValues()],
      design: [...colorMode(), ...layoutVisibility(), ...legend(), ...statusBadge(), ...barStyling()],
      insights: [...storyKpi(), ...annotations()],
      advanced: [...scaling(), ...tooltips()],
    },
  },
  horizontalBar: {
    name: "Horizontal bar",
    preview: "horizontalBar",
    desc: "Horizontal bar builder options from the spec.",
    recs: [
      "Mapping: X value, Y category, Series, Max/Total, Aggregation.",
      "Horizontal-only label controls are in Bar Styling.",
      "Scaling, Tooltips, and Annotations are supported.",
    ],
    sections: {
      data: [req("X value"), core("Y category", "Used when stacked or aggregation is Count.", "field", [], "Field Mapping"), core("Series", "", "field", [], "Field Mapping"), cond("Max/Total", "", "field", [], "Field Mapping"), aggregation()],
      design: [...colorMode(), ...gradientEditor(), ...layoutVisibility(), ...legend(), ...statusBadge(), ...barStyling(), core("Layout", "Inline / Cartesian.", "segmented", ["Inline", "Cartesian"], "Horizontal Bar Styling"), core("Category label position", "Above bar / Inline.", "dropdown", ["Above bar", "Inline"], "Horizontal Bar Styling"), adv("Category label color", "Category label color.", "color", [], "Horizontal Bar Styling"), adv("Category label gap", "0–48 px.", "slider", [], "Horizontal Bar Styling"), adv("Value label gap", "0–48 px.", "slider", [], "Horizontal Bar Styling"), cond("Track / remaining color", "Shown only when Max/Total mapped.", "color", [], "Horizontal Bar Styling")],
      insights: [...storyKpi(), ...annotations()],
      advanced: [...scaling(), ...tooltips()],
    },
  },
  progress: {
    name: "Progress bar",
    preview: "horizontalBar",
    desc: "Progress bar builder options from the spec.",
    recs: ["Uses built-in legend; no Annotations.", "Mapping: X value, Y category, Max/Total, Aggregation.", "Progress-specific styling only."],
    sections: {
      data: [req("X value", "Value field."), req("Y category", "Category field."), cond("Max/Total", "", "field", [], "Field Mapping"), aggregation()],
      design: [...colorMode(), ...layoutVisibility(), ...statusBadge(), core("Bar height", "Thin / Medium / Thick.", "segmented", ["Thin", "Medium", "Thick"], "Progress Styling"), core("Corner radius", "Square / Rounded / Pill.", "segmented", ["Square", "Rounded", "Pill"], "Progress Styling"), core("Fill color", "Progress fill color.", "color", [], "Progress Styling"), adv("Track color", "Progress track color.", "color", [], "Progress Styling"), core("KPI number mode", "Percentage / Value of total.", "segmented", ["Percentage", "Value of total"], "Progress Styling"), core("Show percentage label", "Shows percentage label.", "toggle", [], "Progress Styling"), adv("Show segment separators", "Shows segment separators.", "toggle", [], "Progress Styling")],
      insights: [...storyKpi()],
      advanced: [...scaling(), ...tooltips()],
    },
  },
  line: {
    name: "Line",
    preview: "line",
    desc: "Line builder options from the spec.",
    recs: ["Mapping: X axis, Y axis, Series, Reference value, Aggregation.", "Line-specific controls only.", "Scaling, Tooltips, and Annotations are supported."],
    sections: {
      data: [req("X axis"), req("Y axis"), core("Series", "", "field", [], "Field Mapping"), cond("Reference value", "", "field", [], "Field Mapping"), aggregation(), mlYValues()],
      design: [...colorMode(), ...gradientEditor(), ...layoutVisibility(), ...legend(), ...statusBadge(), core("Chart style", "Line / Area.", "segmented", ["Line", "Area"], "Line Styling"), core("Stroke width", "0–10 px.", "slider", [], "Line Styling"), core("Show data points", "Show point markers.", "toggle", [], "Line Styling", false), adv("Stroke dash array", "e.g. 5,5.", "text", [], "Line Styling"), core("Curve interpolation", "Smooth / Linear / Step / Step before / Step after / Natural.", "dropdown", ["Smooth", "Linear", "Step", "Step before", "Step after", "Natural"], "Line Styling")],
      insights: [...storyKpi(), ...annotations()],
      advanced: [...scaling(), ...tooltips()],
    },
  },
  area: {
    name: "Area",
    preview: "line",
    desc: "Area builder options from the spec.",
    recs: ["Same as Line, plus Line + Area colors and Fill opacity.", "Scaling, Tooltips, and Annotations are supported.", "No extra options beyond the spec."],
    sections: {
      data: [req("X axis"), req("Y axis"), core("Series", "", "field", [], "Field Mapping"), cond("Reference value", "", "field", [], "Field Mapping"), aggregation(), mlYValues()],
      design: [...colorMode(), ...gradientEditor(), ...layoutVisibility(), ...legend(), ...statusBadge(), core("Chart style", "Line / Area.", "segmented", ["Line", "Area"], "Line/Area Styling"), core("Stroke width", "0–10 px.", "slider", [], "Line/Area Styling"), core("Show data points", "Show point markers.", "toggle", [], "Line/Area Styling", false), adv("Stroke dash array", "e.g. 5,5.", "text", [], "Line/Area Styling"), core("Curve interpolation", "Smooth / Linear / Step / Step before / Step after / Natural.", "dropdown", ["Smooth", "Linear", "Step", "Step before", "Step after", "Natural"], "Line/Area Styling"), core("Line + Area colors", "Stroke & fill.", "color", [], "Line/Area Styling"), adv("Fill opacity", "0–1.", "slider", [], "Line/Area Styling")],
      insights: [...storyKpi(), ...annotations()],
      advanced: [...scaling(), ...tooltips()],
    },
  },
  scatter: {
    name: "Scatter",
    preview: "scatter",
    desc: "Scatter builder options from the spec.",
    recs: ["Mapping: X value, Y value, Point size, Color/Category, Aggregation.", "Regression overlays come from Annotations → Linear trend.", "Scaling and Tooltips are supported."],
    sections: {
      data: [req("X value"), req("Y value", "Skipped when aggregation is Count."), core("Point size", "", "field", [], "Field Mapping"), core("Color/Category", "", "field", [], "Field Mapping"), aggregation(), mlYValues()],
      design: [...colorMode(), ...gradientEditor(), ...layoutVisibility(), ...legend(), ...statusBadge(), core("Fill color", "Full gradient editor.", "color", [], "Point Styling"), adv("Stroke color", "Point stroke color.", "color", [], "Point Styling"), core("Radius", "1–20 px.", "slider", [], "Point Styling"), cond("Min / max bubble radius", "min 1–20 / max 10–100 px.", "slider", [], "Point Styling"), core("Point shape", "Circle / Square / Triangle.", "segmented", ["Circle", "Square", "Triangle"], "Point Styling"), core("Point opacity", "0–1.", "slider", [], "Point Styling"), adv("Highlight anomalies (>2σ)", "Anomaly color.", "toggle", [], "Point Styling", false), adv("Apply value jitter", "Adds jitter.", "toggle", [], "Point Styling", false)],
      insights: [...storyKpi(), ...annotations()],
      advanced: [...scaling(), ...tooltips()],
    },
  },
  pie: {
    name: "Pie / Donut",
    preview: "donut",
    desc: "Pie / Donut builder options from the spec.",
    recs: ["No axes/scaling controls are rendered.", "Legend position is Left/Right only.", "No Annotations."],
    sections: {
      data: [req("Category"), req("Value", "Skipped when aggregation is Count."), aggregation()],
      design: [...colorMode(), ...layoutVisibility(), ...legend(["Left", "Right"]), ...statusBadge(), core("Chart style", "Pie / Donut.", "segmented", ["Pie", "Donut"], "Pie Styling"), cond("Show center value", "Donut only.", "toggle", [], "Pie Styling"), adv("Inner radius", "0–0.9.", "slider", [], "Pie Styling"), adv("Start angle", "0–360°.", "slider", [], "Pie Styling"), adv("Pad angle (slice gap)", "0–0.1.", "slider", [], "Pie Styling"), adv("Corner radius", "0–20 px.", "slider", [], "Pie Styling"), core("Label format", "Percentage / Value / Both.", "segmented", ["Percentage", "Value", "Both"], "Pie Styling")],
      insights: [...storyKpi()],
      advanced: [...tooltips()],
    },
  },
  gauge: {
    name: "Gauge / Meter",
    preview: "gauge",
    desc: "Gauge / Meter builder options from the spec.",
    recs: ["No generic axis/tick/gridline controls are rendered.", "Gauge has zone colors and meter & labels controls only.", "Tooltips are supported."],
    sections: {
      data: [req("Value"), core("Unit", "Unit field.", "field", [], "Field Mapping"), core("Status", "Status field.", "field", [], "Field Mapping"), core("Min/Max value fields", "Min/Max fields.", "field", [], "Field Mapping"), adv("Min/Max fallback numbers", "Default 0 / 100.", "number", [], "Field Mapping")],
      design: [...layoutVisibility(), ...statusBadge(), core("Color zones on dial", "Zone colors on dial.", "toggle", [], "Gauge — zone colors"), adv("Zone colors (2–4)", "add/remove.", "repeatable", [], "Gauge — zone colors"), adv("Arc start angle", "−180–180°.", "slider", [], "Gauge — zone colors"), adv("Arc end angle", "−180–180°.", "slider", [], "Gauge — zone colors"), core("Movement state", "Rising / Falling / Stabilizing.", "dropdown", ["Rising", "Falling", "Stabilizing"], "Gauge — meter & labels"), core("Show status badge", "Needs Status mapped.", "toggle", [], "Gauge — meter & labels", false), core("Show center value", "Center value visibility.", "toggle", [], "Gauge — meter & labels"), core("Show Low / High labels", "Low / High label visibility.", "toggle", [], "Gauge — meter & labels"), core("Value format", "D3 format.", "text", [], "Gauge — meter & labels"), adv("Tick subdivisions", "12–120.", "slider", [], "Gauge — meter & labels")],
      insights: [],
      advanced: [...tooltips()],
    },
  },
  score: {
    name: "Score indicator",
    preview: "horizontalBar",
    desc: "Score indicator builder options from the spec.",
    recs: ["No color mode panel.", "Uses Story-card KPI value/min/max/unit for scale.", "Tooltips are supported."],
    sections: {
      data: [req("Story-card KPI value/min/max/unit", "Min & max define the gradient bar scale.")],
      design: [...layoutVisibility(), ...statusBadge(), core("Show marker", "Marker visibility.", "toggle", [], "Track & Marker"), core("Fill track to marker", "Fill behavior.", "toggle", [], "Track & Marker", false), core("Marker style", "Pill / Diamond / Arrow.", "dropdown", ["Pill", "Diamond", "Arrow"], "Track & Marker"), adv("Track gradient", "Reverse + add stop.", "gradient", [], "Track & Marker"), core("Show score", "Score panel control.", "toggle", [], "Score Panel"), core("Show bar range labels", "Range label visibility.", "toggle", [], "Score Panel")],
      insights: [...storyKpi()],
      advanced: [...tooltips()],
    },
  },
  polar: {
    name: "Polar / Wind rose",
    preview: "donut",
    desc: "Polar / Wind rose builder options from the spec.",
    recs: ["No color-mode panel.", "No Story-card KPI.", "No Annotations."],
    sections: {
      data: [req("Direction"), req("Wind speed / band"), core("Frequency", "", "field", [], "Field Mapping"), adv("Compass spokes", "16/18 sectors.", "segmented", ["16", "18"], "Field Mapping"), adv("Speed band thresholds (m/s)", "Advanced thresholds.", "repeatable", [], "Field Mapping")],
      design: [...layoutVisibility(), ...statusBadge(), core("Intensity legend label", "Legend label.", "text", [], "Intensity color ramp"), core("Ramp colors (low→high)", "Low→high intensity colors; add/remove rows.", "repeatable", [], "Intensity color ramp"), adv("Grid color", "Grid color.", "color", [], "Intensity color ramp"), adv("Spoke color", "Spoke color.", "color", [], "Intensity color ramp")],
      insights: [],
      advanced: [...tooltips()],
    },
  },
  range: {
    name: "Range",
    preview: "bar",
    desc: "Range builder options from the spec.",
    recs: ["No shared color-mode panel.", "Bar gradient is the color control.", "Scaling, Tooltips, and Annotations are supported."],
    sections: {
      data: [req("X axis"), req("Low value"), req("High value"), cond("Reference value", "Draws a reference line.", "field", [], "Field Mapping")],
      design: [...layoutVisibility(), ...legend(), ...statusBadge(), core("Bar gradient", "Value-mapped gradient editor.", "gradient", [], "Bar Gradient")],
      insights: [...storyKpi(), ...annotations()],
      advanced: [...scaling(), ...tooltips()],
    },
  },
  availability: {
    name: "Availability",
    preview: "bar",
    desc: "Availability builder options from the spec.",
    recs: ["Mapping: Value only.", "No Story-card KPI.", "No Annotations."],
    sections: {
      data: [req("Value")],
      design: [...colorMode(), ...layoutVisibility(), ...legend(), ...statusBadge()],
      insights: [],
      advanced: [...tooltips()],
    },
  },
  kpi: {
    name: "KPI Card",
    preview: "kpi",
    desc: "KPI Card builder options from the spec.",
    recs: ["This is itself a KPI visual, so no Story-card KPI group.", "Builder is Mapping + Customization only — no Readout tab.", "No legend, scaling, tooltips, or annotations."],
    sections: {
      data: [req("Value"), core("Value calculation", "First/Last/Max/Min/Sum.", "dropdown", ["First", "Last", "Max", "Min", "Sum"], "Field Mapping"), core("Unit", "Unit field.", "field", [], "Field Mapping"), core("Max value", "Max value field.", "field", [], "Field Mapping"), adv("Manual value/max/unit", "Manual override fields.", "text", [], "Field Mapping"), core("Comparison value", "Comparison value field.", "field", [], "Field Mapping")],
      design: [...colorMode(), ...layoutVisibility(), ...statusBadge(), core("Value format", "Number / Currency (USD) / Percentage / Duration (minutes).", "dropdown", ["Number", "Currency (USD)", "Percentage", "Duration (minutes)"], "KPI Card Display"), core("Show unit", "Unit visibility.", "toggle", [], "KPI Card Display"), core("Show comparison vs last period", "Uses mapped comparison value.", "toggle", [], "KPI Card Display")],
      insights: [],
      advanced: [],
    },
  },
  kpiGrid: {
    name: "KPI Grid",
    preview: "table",
    desc: "KPI Grid dedicated builder options from the spec.",
    recs: ["Dedicated builder: Mapping · Status · Customization.", "No axes, scales, legend, palette, or shared status-badge section.", "Tile pills replace shared status badge."],
    sections: {
      data: [req("Metric label"), core("Value", "Value field.", "field", [], "Field Mapping"), core("Secondary label/context", "Secondary context field.", "field", [], "Field Mapping"), core("Unit", "Unit field.", "field", [], "Field Mapping"), core("Status", "Status field.", "field", [], "Field Mapping")],
      design: [core("Show title / insight / badge", "Display toggles.", "multi", ["Show title", "Show insight", "Show badge"], "Customization"), core("Display mode", "Auto / Numeric values / Secondary text.", "dropdown", ["Auto", "Numeric values", "Secondary text"], "Customization"), core("Grid columns", "1–3.", "number", [], "Customization"), adv("Status pill style", "Subtle / Solid.", "dropdown", ["Subtle", "Solid"], "Customization"), adv("Status pill position", "Bottom / Inline.", "dropdown", ["Bottom", "Inline"], "Customization"), core("Show tile label", "Tile label visibility.", "toggle", [], "Customization"), core("Show value / secondary text", "Value/secondary visibility.", "toggle", [], "Customization"), core("Show unit", "Unit visibility.", "toggle", [], "Customization"), core("Show status pill", "Status pill visibility.", "toggle", [], "Customization"), adv("Highlight critical tiles (glow)", "Critical tile emphasis.", "toggle", [], "Customization", false)],
      insights: [core("Status → tile accent color", "Repeatable rows.", "repeatable", [], "Status"), adv("Threshold fallback", "per-metric min/max → status ranges.", "repeatable", [], "Status")],
      advanced: [],
    },
  },
  table: {
    name: "Data Table",
    preview: "table",
    desc: "Data Table dedicated builder options from the spec.",
    recs: ["Dedicated builder: Columns only.", "No chart-style controls.", "No Scaling, Tooltips, or Annotations."],
    sections: {
      data: [req("Visible columns", "Multi-select with Select all / Clear.", "multi", "Columns"), core("Header label per column", "Text rename; blank uses the raw column name.", "text", [], "Columns")],
      design: [],
      insights: [],
      advanced: [],
    },
  },
  legacyKpi: {
    name: "Legacy KPI",
    preview: "kpi",
    desc: "Legacy KPI dedicated builder options from the spec.",
    recs: ["Dedicated builder.", "No axes, scales, legend, palette, or shared status badge.", "Thresholds are the only advanced-like controls."],
    sections: {
      data: [req("Value field", "Value field."), core("Label", "Label text.", "text", [], "Value & label"), core("Format", "Number / Currency / Percentage / Compact.", "dropdown", ["Number", "Currency", "Percentage", "Compact"], "Value & label"), core("Delta field", "Delta field.", "field", [], "Delta"), core("Delta format", "Absolute / Percentage.", "dropdown", ["Absolute", "Percentage"], "Delta")],
      design: [],
      insights: [adv("Color thresholds: Good · Warning", "Good and Warning thresholds.", "repeatable", [], "Thresholds")],
      advanced: [],
    },
  },
};

export type VisibilityMode = "core" | "hybrid" | "all";

export const isAdvancedLike = (o: Opt) => o.level === "advanced" || o.level === "conditional";
