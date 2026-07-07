/** Figma-exported card previews for the Add Component picker (`public/component-previews/`). */
export type ComponentPreviewFit = "wide" | "square" | "cover" | "fill";

export type ComponentPreviewImage = {
  src: string;
  fit?: ComponentPreviewFit;
  /** Shrinks the preview inside the box (0–1). Defaults to 1. */
  scale?: number;
};

export const COMPONENT_PREVIEW_IMAGES: Record<string, ComponentPreviewImage> = {
  high_heat_districts: { src: "/component-previews/high-heat-districts.png", fit: "wide" },
  average_price_gap_to_benchmark: {
    src: "/component-previews/average-price-gap-to-benchmark.png",
    fit: "wide",
  },
  market_stability_score_cluster_average: {
    src: "/component-previews/market-stability-score-cluster-average.png",
    fit: "wide",
  },
  registration_completion_rate: {
    src: "/component-previews/registration-completion-rate.png",
    fit: "wide",
  },
  transaction_value_registered: {
    src: "/component-previews/transaction-value-registered.png",
    fit: "square",
  },
  fee_revenue_potential: {
    src: "/component-previews/fee-revenue-potential.png",
    fit: "square",
  },
  contaminant_exceedance_frequency: {
    src: "/component-previews/contaminant-exceedance-frequency.png",
    fit: "wide",
  },
  top_3_facilities_by_repeated_incidents: {
    src: "/component-previews/top-3-facilities-by-repeated-incidents.png",
    fit: "wide",
  },
  high_heat_districts_emerging: {
    src: "/component-previews/high-heat-districts-emerging-map.png",
    fit: "cover",
  },
  valuation_variance_trending_up: {
    src: "/component-previews/valuation-variance-trend-map.png",
    fit: "cover",
  },
  registration_load_increasing: {
    src: "/component-previews/registration-load-heatmap.png",
    fit: "cover",
  },
  high_risk_trade_clusters: {
    src: "/component-previews/high-risk-trade-clusters-map.png",
    fit: "cover",
  },
};

export function getComponentPreviewImage(componentId: string): ComponentPreviewImage | undefined {
  return COMPONENT_PREVIEW_IMAGES[componentId];
}

export function isSquarePreviewComponent(componentId: string): boolean {
  return getComponentPreviewImage(componentId)?.fit === "square";
}

const COMPACT_PREVIEW_COMPONENT_IDS = new Set([
  "transaction_value_registered",
  "fee_revenue_potential",
]);

export function isCompactPreviewComponent(componentId: string): boolean {
  return COMPACT_PREVIEW_COMPONENT_IDS.has(componentId);
}

export function hasComponentPreviewImage(componentId: string): boolean {
  return componentId in COMPONENT_PREVIEW_IMAGES;
}
