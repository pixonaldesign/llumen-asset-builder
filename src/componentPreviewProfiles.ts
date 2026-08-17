import type { ComponentLibraryItem } from "./componentCatalog";

export type MarkTip = {
  label: string;
  value: number;
  category: string;
  timestamp: string;
  unit: string;
  status: string;
};

export type PreviewSeries = {
  values?: number[];
  labels?: string[];
  gaugeValue?: number;
  kpiPrimary?: string;
  kpiUnit?: string;
  kpiComparison?: string;
  legend?: string;
  title?: string;
  insight?: string;
  badge?: { text: string; tone: "positive" | "warning" | "negative" | "neutral"; color?: string };
  markTips?: MarkTip[];
  scatterPoints?: { x: number; y: number; r?: number; category?: string }[];
  table?: { columns: string[]; headers?: string[]; rows: Record<string, string | number>[] };
  groups?: { name: string; values: number[] }[];
  ranges?: { label: string; low: number; high: number }[];
  reference?: number;
  maxTotal?: number;
  storyKpi?: { value: string; unit: string };
  kpiTiles?: { label: string; secondary?: string; value: string; status: string }[];
  mapPoints?: {
    id: string;
    label: string;
    x: number;
    y: number;
    value: number;
    category: string;
    status: string;
    origin?: string;
    destination?: string;
    direction?: string;
    speed?: number;
  }[];
  mapArcs?: { from: string; to: string; value: number }[];
  polar?: { direction: string; speed: number; frequency: number }[];
  availability?: { label: string; cells: number[] }[];
};

export type ComponentPreviewProfile = {
  config: Record<string, unknown>;
  series: PreviewSeries;
};

export type PreviewCfg = (group: string, name: string, fallback: unknown) => unknown;

const CARD_DEFAULTS: Record<string, unknown> = {
  "Layout & visibility::Show title": false,
  "Layout & visibility::Show data labels": true,
  "Legend::Show legend": false,
  "Bar::Show values on bars": false,
  "Pie Styling::Show center value": true,
  "Gauge — meter & labels::Show center value": true,
  "KPI card::Show comparison vs last period": true,
  "KPI card::Show unit": true,
};

const PROFILES: Record<string, ComponentPreviewProfile> = {
  high_heat_districts: {
    config: { "Color mode::Single color": "#f0888c" },
    series: { kpiPrimary: "18", kpiUnit: "", kpiComparison: "+3 vs last month" },
  },
  average_price_gap_to_benchmark: {
    config: { "Color mode::Single color": "#73adf5", "Bar::Sort by value": false },
    series: { values: [12, 8, 15, 6, 11, 9] },
  },
  market_stability_score_cluster_average: {
    config: { "Color mode::Single color": "#c6a7ff" },
    series: { values: [42, 28, 18, 12] },
  },
  registration_completion_rate: {
    config: { "Progress Styling::Fill color": "#7ee0c0" },
    series: { values: [73] },
  },
  transaction_value_registered: {
    config: { "Color mode::Single color": "#9bd1ff" },
    series: { values: [2.1, 2.8, 3.4, 2.9, 4.1, 3.7] },
  },
  fee_revenue_potential: {
    config: { "Color mode::Single color": "#7ee0c0" },
    series: { kpiPrimary: "94", kpiUnit: "M AED", kpiComparison: "+12.8%" },
  },
  quarterly_revenue_index: {
    config: { "Color mode::Single color": "#ffd58a" },
    series: { kpiPrimary: "112", kpiUnit: " idx", kpiComparison: "+4.2% QoQ" },
  },
  mobility_throughput: {
    config: { "Color mode::Single color": "#73adf5" },
    series: { values: [840, 920, 780, 1050, 990, 1120] },
  },
  contaminant_exceedance_frequency: {
    config: { "Color mode::Single color": "#73adf5", "Line::Chart style": "Area" },
    series: { values: [12, 18, 9, 22, 15, 19] },
  },
  top_3_facilities_by_repeated_incidents: {
    config: { "Color mode::Single color": "#4db8a4", "Bar::Sort by value": false },
    series: { values: [4, 3, 3] },
  },
  annual_revenue_bar_chart: {
    config: { "Color mode::Single color": "#73adf5", "Bar::Sort by value": false },
    series: { values: [4.2, 4.8, 5.1, 5.6, 6.0, 5.4] },
  },
  average_dispatch_time: {
    config: { "Color mode::Single color": "#ffd58a", "Bar::Sort by value": false },
    series: { values: [18, 16, 14, 15, 12, 11] },
  },
  average_handling_cost: {
    config: { "Color mode::Single color": "#f0888c" },
    series: { values: [32, 28, 24, 26, 22, 20] },
  },
  average_order_value: {
    config: { "Color mode::Single color": "#c6a7ff" },
    series: { values: [68, 72, 75, 71, 78, 82] },
  },
  average_resolution_time: {
    config: { "Color mode::Single color": "#9bd1ff", "Bar::Sort by value": false },
    series: { values: [4.2, 3.8, 3.5, 3.1, 2.9, 2.6] },
  },
  average_response_latency: {
    config: { "Color mode::Single color": "#73adf5", "Line::Chart style": "Line" },
    series: { values: [240, 210, 195, 180, 165, 150, 142] },
  },
  average_session_duration: {
    config: { "Color mode::Single color": "#7ee0c0", "Line::Chart style": "Area" },
    series: { values: [6.2, 6.8, 7.1, 6.5, 7.4, 7.9, 8.2] },
  },
  average_ticket_volume: {
    config: { "Color mode::Single color": "#ffd58a" },
    series: { values: [420, 380, 510, 460, 390, 440] },
  },
  average_time_to_hire: {
    config: { "Color mode::Single color": "#c6a7ff", "Bar::Sort by value": false },
    series: { values: [38, 35, 32, 30, 28, 26] },
  },
  average_traffic_speed_by_road_type: {
    config: { "Color mode::Single color": "#73adf5", "Bar::Sort by value": false },
    series: { values: [42, 58, 36, 64, 48, 52] },
  },
};

function defaultProfileFor(item: ComponentLibraryItem): ComponentPreviewProfile {
  if (item.visualId === "donut-chart") {
    return { config: { "Color mode::Single color": "#73adf5" }, series: { values: [34, 24, 18, 14, 10] } };
  }
  if (item.visualId === "progress-bar") {
    return { config: { "Progress Styling::Fill color": "#73adf5" }, series: { values: [68] } };
  }
  if (item.visualId === "gauge-linear" || item.visualId === "gauge-circular") {
    return { config: {}, series: { gaugeValue: 72 } };
  }
  if (item.visualId === "kpi-card") {
    return { config: {}, series: { kpiPrimary: "84", kpiUnit: "%", kpiComparison: "+6.2%" } };
  }
  if (item.visualId === "line-chart" || item.visualId === "area-chart") {
    return { config: { "Color mode::Single color": "#73adf5" }, series: { values: [52, 48, 55, 42, 58, 61, 54] } };
  }
  return { config: { "Color mode::Single color": "#73adf5" }, series: { values: [40, 72, 30, 58, 90, 64] } };
}

export function getComponentPreviewProfile(item: ComponentLibraryItem): ComponentPreviewProfile {
  return PROFILES[item.id] ?? defaultProfileFor(item);
}

export function createComponentPreviewCfg(item: ComponentLibraryItem): PreviewCfg {
  const profile = getComponentPreviewProfile(item);
  const merged = { ...CARD_DEFAULTS, ...profile.config };

  return (group, name, fallback) => {
    const key = `${group}::${name}`;
    const value = merged[key];
    return value === undefined ? fallback : value;
  };
}
