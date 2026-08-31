/**
 * Chart preview metadata and shared option types for the visual settings catalog.
 * Field definitions live in visualSettingsCatalog.ts (Notion remap).
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
  | "colorList"
  | "colorPair"
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
  defaultValue?: unknown;
  editableValue?: boolean;
  visibleWhen?: { group: string; name: string; is: string | string[] };
}

export interface Chart {
  name: string;
  preview: string;
}

export const charts: Record<string, Chart> = {
  bar: { name: "Bar (vertical)", preview: "bar" },
  horizontalBar: { name: "Horizontal bar", preview: "horizontalBar" },
  progress: { name: "Progress bar", preview: "horizontalBar" },
  line: { name: "Line", preview: "line" },
  area: { name: "Area", preview: "line" },
  scatter: { name: "Scatter", preview: "scatter" },
  pie: { name: "Pie / Donut", preview: "donut" },
  gauge: { name: "Gauge / Meter", preview: "gauge" },
  score: { name: "Score indicator", preview: "horizontalBar" },
  polar: { name: "Polar / Wind rose", preview: "donut" },
  range: { name: "Range", preview: "bar" },
  availability: { name: "Availability", preview: "bar" },
  kpi: { name: "KPI Card", preview: "kpi" },
  kpiGrid: { name: "KPI Grid", preview: "table" },
  table: { name: "Data Table", preview: "table" },
  legacyKpi: { name: "Legacy KPI", preview: "kpi" },
};
