import {
  type Icon,
  CalendarCheck,
  ChartBar,
  ChartBarHorizontal,
  ChartDonut,
  ChartLine,
  ChartLineUp,
  ChartScatter,
  Circle,
  Columns,
  Compass,
  Fire,
  Gauge,
  GridNine,
  MapTrifold,
  NumberSquareOne,
  Polygon,
  ShareNetwork,
  SlidersHorizontal,
  SquaresFour,
  Table,
} from "@phosphor-icons/react";

/** Phosphor icons for visualization types (picker cards, deep-dive headers, etc.). */
export const VISUAL_ICONS: Record<string, Icon> = {
  "vertical-bar": ChartBar,
  "horizontal-bar": ChartBarHorizontal,
  "line-chart": ChartLine,
  "area-chart": ChartLineUp,
  "scatter-plot": ChartScatter,
  "donut-chart": ChartDonut,
  "progress-bar": ChartBarHorizontal,
  "gauge-linear": Gauge,
  "gauge-circular": Gauge,
  "polar-wind-rose": Compass,
  range: SlidersHorizontal,
  availability: CalendarCheck,
  "kpi-card": NumberSquareOne,
  "kpi-grid": GridNine,
  table: Table,
  kpi: NumberSquareOne,

  arcs: ShareNetwork,
  fences: SquaresFour,
  pillars: Columns,
  discs: Circle,
  "map-area": Polygon,
  heatmap: Fire,
  "map-layer": MapTrifold,
};

export function getVisualIcon(visualId: string): Icon {
  return VISUAL_ICONS[visualId] ?? ChartBar;
}
