import { getDatasetMeta } from "@/lib/geo/catalog";
import {
  isAircraftModel,
  isGeometricPrimitive,
  isRoadVehicleModel,
  isWatercraftModel,
} from "@/lib/modelCatalog";
import type {
  DatasetKind,
  PointVisual,
  PrimitiveType,
} from "@/lib/types";

/** Top-level representation shown in the Visual dropdown. */
export type SceneVisual =
  | "markers"
  | "pillars"
  | "areas"
  | "water-gradient"
  | "oil-spill"
  | "dust-storm"
  | "flood";

export const SCENE_VISUAL_OPTIONS: Record<string, SceneVisual> = {
  "3D markers": "markers",
  Pillars: "pillars",
  "Extruded areas": "areas",
  "Water gradient": "water-gradient",
  "Oil spill": "oil-spill",
  "Heat map": "dust-storm",
  Flood: "flood",
};

export const PORTS_DATASET_ID = "ports";
export const GROUND_VEHICLE_DATASET_ID = "amsterdam_ground_vehicles";
export const WATERCRAFT_DATASET_ID = "amsterdam_watercraft";
export const AIRPORTS_DATASET_ID = "airports";
export const WATER_GRADIENT_DATASET_ID = "nyc_water_outfalls";
export const OIL_SPILL_DATASET_ID = "oil_spill";
export const DUST_STORM_DATASET_ID = "dust_storm";
export const FLOOD_DATASET_ID = "nyc_flood";
/** Natural Earth 1:50m states and provinces. */
export const EXTRUDED_AREAS_DATASET_ID = "admin_regions";

export function sanitizeSceneVisual(
  value: unknown,
  fallback: SceneVisual,
): SceneVisual {
  if (
    value === "markers" ||
    value === "pillars" ||
    value === "areas" ||
    value === "water-gradient" ||
    value === "oil-spill" ||
    value === "dust-storm" ||
    value === "flood"
  ) {
    return value;
  }
  return fallback;
}

export function sceneVisualFromState(
  datasetKind: DatasetKind,
  pointVisual: PointVisual,
  primitive: PrimitiveType,
): SceneVisual {
  if (datasetKind === "area") return "areas";
  if (pointVisual === "water-gradient") return "water-gradient";
  if (pointVisual === "oil-spill") return "oil-spill";
  if (pointVisual === "dust-storm") return "dust-storm";
  if (pointVisual === "flood") return "flood";
  if (primitive === "pillar") return "pillars";
  return "markers";
}

/**
 * Keep a model the user just picked when the dataset's suggested model is
 * the same family (truck stays truck; icosphere stays icosphere).
 */
export function primitiveAfterDatasetDefault(
  current: PrimitiveType,
  suggested: PrimitiveType | undefined,
): PrimitiveType | undefined {
  if (!suggested || suggested === current) return undefined;
  if (isRoadVehicleModel(current) && isRoadVehicleModel(suggested)) {
    return undefined;
  }
  if (isWatercraftModel(current) && isWatercraftModel(suggested)) {
    return undefined;
  }
  if (isAircraftModel(current) && isAircraftModel(suggested)) {
    return undefined;
  }
  if (
    isGeometricPrimitive(current) &&
    isGeometricPrimitive(suggested) &&
    current !== "pillar" &&
    suggested !== "pillar"
  ) {
    return undefined;
  }
  return suggested;
}

/** Dataset that matches a 3D marker, so picking a shape lands on useful data. */
export function datasetIdForPrimitive(primitive: PrimitiveType): string {
  if (isRoadVehicleModel(primitive)) return GROUND_VEHICLE_DATASET_ID;
  if (isWatercraftModel(primitive)) return WATERCRAFT_DATASET_ID;
  if (isAircraftModel(primitive)) return AIRPORTS_DATASET_ID;
  return PORTS_DATASET_ID;
}

export type ResolvedSceneVisual = {
  primitive: PrimitiveType;
  pointVisual: PointVisual;
  datasetId: string;
  adaptiveZoomScaling?: boolean;
};

/**
 * Choosing a visual also loads the dataset that shows it well.
 * Geometric markers and pillars use ports. Road vehicles, including delivery scooters, use Amsterdam roads.
 * Watercraft use Amsterdam canals. Aircraft use airports.
 * Extruded areas use admin regions.
 */
export function resolveSceneVisual(args: {
  visual: SceneVisual;
  primitive: PrimitiveType;
  pointVisual: PointVisual;
  /** Kept when it already suits the visual, e.g. another flood grid. */
  datasetId?: string;
}): ResolvedSceneVisual {
  if (args.visual === "areas") {
    return {
      primitive: args.primitive,
      pointVisual: args.pointVisual,
      datasetId: EXTRUDED_AREAS_DATASET_ID,
    };
  }
  if (args.visual === "water-gradient") {
    return {
      primitive: args.primitive,
      pointVisual: "water-gradient",
      datasetId: WATER_GRADIENT_DATASET_ID,
      adaptiveZoomScaling: false,
    };
  }
  if (args.visual === "oil-spill") {
    return {
      primitive: args.primitive,
      pointVisual: "oil-spill",
      datasetId: OIL_SPILL_DATASET_ID,
      adaptiveZoomScaling: false,
    };
  }
  if (args.visual === "dust-storm") {
    return {
      primitive: args.primitive,
      pointVisual: "dust-storm",
      datasetId: DUST_STORM_DATASET_ID,
      adaptiveZoomScaling: false,
    };
  }
  if (args.visual === "flood") {
    return {
      primitive: args.primitive,
      pointVisual: "flood",
      datasetId:
        args.datasetId && getDatasetMeta(args.datasetId)?.floodPath
          ? args.datasetId
          : FLOOD_DATASET_ID,
      adaptiveZoomScaling: false,
    };
  }
  if (args.visual === "pillars") {
    return {
      primitive: "pillar",
      pointVisual: "marker",
      datasetId: PORTS_DATASET_ID,
    };
  }
  const marker = args.primitive === "pillar" ? "icosphere" : args.primitive;
  return {
    primitive: marker,
    pointVisual: "marker",
    datasetId: datasetIdForPrimitive(marker),
  };
}
