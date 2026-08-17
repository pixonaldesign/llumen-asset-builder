export type VisualCategoryId = "chart" | "map-layer";

export interface VisualType {
  id: string;
  label: string;
  chartId: string;
  category: VisualCategoryId;
}

export interface VisualCategory {
  id: VisualCategoryId;
  label: string;
}

export const VISUAL_CATEGORIES: VisualCategory[] = [
  { id: "chart", label: "Chart" },
  { id: "map-layer", label: "Map Layer" },
];

export const VISUAL_TYPES: VisualType[] = [
  { id: "vertical-bar", label: "Vertical Bar Chart", chartId: "bar", category: "chart" },
  { id: "horizontal-bar", label: "Horizontal Bar Chart", chartId: "horizontalBar", category: "chart" },
  { id: "line-chart", label: "Line Chart", chartId: "line", category: "chart" },
  { id: "area-chart", label: "Area Chart", chartId: "area", category: "chart" },
  { id: "scatter-plot", label: "Scatter Plot", chartId: "scatter", category: "chart" },
  { id: "donut-chart", label: "Donut Chart", chartId: "pie", category: "chart" },
  { id: "progress-bar", label: "Progress Bar", chartId: "progress", category: "chart" },
  { id: "gauge-linear", label: "Gauge / Meter", chartId: "gauge", category: "chart" },
  { id: "gauge-circular", label: "Gauge / Meter", chartId: "gauge", category: "chart" },
  { id: "score-indicator", label: "Score Indicator", chartId: "score", category: "chart" },
  { id: "polar-wind-rose", label: "Polar / Wind Rose", chartId: "polar", category: "chart" },
  { id: "range", label: "Range", chartId: "range", category: "chart" },
  { id: "availability", label: "Availability", chartId: "availability", category: "chart" },
  { id: "kpi-card", label: "KPI Card", chartId: "kpi", category: "chart" },
  { id: "kpi-grid", label: "KPI Grid", chartId: "kpiGrid", category: "chart" },
  { id: "table", label: "Data Table", chartId: "table", category: "chart" },

  { id: "arcs", label: "Arcs", chartId: "polar", category: "map-layer" },
  { id: "fences", label: "Fences", chartId: "line", category: "map-layer" },
  { id: "pillars", label: "Pillars", chartId: "bar", category: "map-layer" },
  { id: "discs", label: "Discs", chartId: "pie", category: "map-layer" },
  { id: "map-area", label: "Area", chartId: "area", category: "map-layer" },
  { id: "heatmap", label: "Heatmap", chartId: "bar", category: "map-layer" },
  { id: "points", label: "Points", chartId: "scatter", category: "map-layer" },
  { id: "wind", label: "Wind", chartId: "line", category: "map-layer" },
];

export function visualTypesForCategory(categoryId: VisualCategoryId): VisualType[] {
  return VISUAL_TYPES.filter((v) => v.category === categoryId);
}

export function visualTypeByChartId(chartId: string): VisualType | undefined {
  return VISUAL_TYPES.find((v) => v.chartId === chartId);
}

export function visualTypeById(id: string): VisualType | undefined {
  return VISUAL_TYPES.find((v) => v.id === id);
}
