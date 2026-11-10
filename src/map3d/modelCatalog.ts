import type {
  AircraftModel,
  DeliveryVehicleModel,
  GeometricPrimitive,
  GroundVehicleModel,
  MilitaryAircraftModel,
  PrimitiveType,
  WatercraftModel,
} from "@/lib/types";

export type ModelCategoryId =
  | "geometric"
  | "ground-vehicles"
  | "watercraft"
  | "aircraft"
  | "military"
  | "delivery";

export type {
  AircraftModel,
  DeliveryVehicleModel,
  GeometricPrimitive,
  GroundVehicleModel,
  MilitaryAircraftModel,
  WatercraftModel,
};

export type ModelEntry = {
  id: PrimitiveType;
  label: string;
  category: ModelCategoryId;
};

export const MODEL_CATEGORIES: Record<
  ModelCategoryId,
  { id: ModelCategoryId; label: string }
> = {
  geometric: { id: "geometric", label: "Geometric" },
  "ground-vehicles": { id: "ground-vehicles", label: "Ground Vehicles" },
  watercraft: { id: "watercraft", label: "Watercraft" },
  aircraft: { id: "aircraft", label: "Aircraft" },
  military: { id: "military", label: "Military" },
  delivery: { id: "delivery", label: "Delivery" },
};

export const GEOMETRIC_MODELS: readonly ModelEntry[] = [
  { id: "pillar", label: "Pillars (cubes)", category: "geometric" },
  { id: "icosphere", label: "Icospheres", category: "geometric" },
  { id: "octahedron", label: "Octahedrons", category: "geometric" },
] as const;

export const GROUND_VEHICLE_MODELS: readonly ModelEntry[] = [
  { id: "delivery", label: "Delivery", category: "ground-vehicles" },
  { id: "garbage-truck", label: "Garbage truck", category: "ground-vehicles" },
  {
    id: "hatchback-sports",
    label: "Hatchback sports",
    category: "ground-vehicles",
  },
  { id: "police", label: "Police", category: "ground-vehicles" },
  { id: "sedan", label: "Sedan", category: "ground-vehicles" },
  { id: "suv-luxury", label: "SUV luxury", category: "ground-vehicles" },
  { id: "truck", label: "Truck", category: "ground-vehicles" },
  { id: "van", label: "Van", category: "ground-vehicles" },
] as const;

export const WATERCRAFT_MODELS: readonly ModelEntry[] = [
  {
    id: "boat-fishing-small",
    label: "Fishing boat (small)",
    category: "watercraft",
  },
  { id: "boat-sail-a", label: "Sailboat", category: "watercraft" },
  { id: "boat-speed-a", label: "Speedboat", category: "watercraft" },
  { id: "boat-tow-a", label: "Tow boat", category: "watercraft" },
  { id: "boat-tug-a", label: "Tugboat", category: "watercraft" },
  { id: "buoy-flag", label: "Buoy (flag)", category: "watercraft" },
  { id: "buoy", label: "Buoy", category: "watercraft" },
  {
    id: "ship-ocean-liner-small",
    label: "Ocean liner (small)",
    category: "watercraft",
  },
  { id: "ship-ocean-liner", label: "Ocean liner", category: "watercraft" },
  { id: "ship-small", label: "Ship (small)", category: "watercraft" },
] as const;

export const AIRCRAFT_MODELS: readonly ModelEntry[] = [
  { id: "narrow-body", label: "Narrow-body", category: "aircraft" },
  { id: "wide-body", label: "Wide-body", category: "aircraft" },
  { id: "superjumbo", label: "Superjumbo", category: "aircraft" },
  { id: "humpback-jumbo", label: "Humpback jumbo", category: "aircraft" },
  { id: "regional-jet", label: "Regional jet", category: "aircraft" },
  { id: "turboprop", label: "Turboprop", category: "aircraft" },
  { id: "business-jet", label: "Business jet", category: "aircraft" },
  { id: "light-aircraft", label: "Light aircraft", category: "aircraft" },
  { id: "helicopter", label: "Helicopter", category: "aircraft" },
] as const;

export const MILITARY_AIRCRAFT_MODELS: readonly ModelEntry[] = [
  { id: "multirole-fighter", label: "Multirole fighter", category: "military" },
  { id: "stealth-fighter", label: "Stealth fighter", category: "military" },
  { id: "strike-aircraft", label: "Strike aircraft", category: "military" },
  {
    id: "flying-wing-bomber",
    label: "Flying-wing bomber",
    category: "military",
  },
  {
    id: "tactical-transport",
    label: "Tactical transport",
    category: "military",
  },
  { id: "aerial-tanker", label: "Aerial tanker", category: "military" },
  {
    id: "airborne-surveillance",
    label: "Airborne surveillance",
    category: "military",
  },
  {
    id: "long-endurance-drone",
    label: "Long-endurance drone",
    category: "military",
  },
  {
    id: "attack-helicopter",
    label: "Attack helicopter",
    category: "military",
  },
  {
    id: "utility-helicopter",
    label: "Utility helicopter",
    category: "military",
  },
] as const;

export const DELIVERY_VEHICLE_MODELS: readonly ModelEntry[] = [
  { id: "scooter", label: "Scooter", category: "delivery" },
  { id: "scooter-rider", label: "Scooter with rider", category: "delivery" },
] as const;

export const ALL_MODELS: readonly ModelEntry[] = [
  ...GEOMETRIC_MODELS,
  ...GROUND_VEHICLE_MODELS,
  ...WATERCRAFT_MODELS,
  ...AIRCRAFT_MODELS,
  ...MILITARY_AIRCRAFT_MODELS,
  ...DELIVERY_VEHICLE_MODELS,
];

const MODEL_BY_ID = new Map<string, ModelEntry>(
  ALL_MODELS.map((entry) => [entry.id, entry]),
);

const GROUND_VEHICLE_IDS = new Set<string>(
  GROUND_VEHICLE_MODELS.map((entry) => entry.id),
);

const DELIVERY_VEHICLE_IDS = new Set<string>(
  DELIVERY_VEHICLE_MODELS.map((entry) => entry.id),
);

const WATERCRAFT_IDS = new Set<string>(
  WATERCRAFT_MODELS.map((entry) => entry.id),
);

const AIRCRAFT_IDS = new Set<string>([
  ...AIRCRAFT_MODELS.map((entry) => entry.id),
  ...MILITARY_AIRCRAFT_MODELS.map((entry) => entry.id),
]);

const GEOMETRIC_IDS = new Set<string>(
  GEOMETRIC_MODELS.map((entry) => entry.id),
);

const GLB_ASSET_DIR: Partial<Record<ModelCategoryId, string>> = {
  "ground-vehicles": "/assets/vehicles",
  watercraft: "/assets/watercraft",
  aircraft: "/assets/aircraft",
  military: "/assets/military",
  delivery: "/assets/delivery",
};

/**
 * Extra yaw applied when the GLB is loaded so local forward matches the
 * marker convention (+Z). Aircraft and scooters are authored nose-toward -Z.
 */
const GLB_YAW_ALIGN: Partial<Record<ModelCategoryId, number>> = {
  aircraft: Math.PI,
  military: Math.PI,
  delivery: Math.PI,
};

/** Leva select options with category prefixes for easier scanning. */
export function modelSelectOptions(): Record<string, PrimitiveType> {
  const options: Record<string, PrimitiveType> = {};
  for (const entry of ALL_MODELS) {
    if (entry.id === "pillar") continue;
    const category = MODEL_CATEGORIES[entry.category].label;
    options[`${category} / ${entry.label}`] = entry.id;
  }
  return options;
}

export function isKnownModelId(id: string): id is PrimitiveType {
  return MODEL_BY_ID.has(id);
}

export function isGeometricPrimitive(
  id: PrimitiveType,
): id is GeometricPrimitive {
  return GEOMETRIC_IDS.has(id);
}

export function isGroundVehicleModel(
  id: PrimitiveType,
): id is GroundVehicleModel {
  return GROUND_VEHICLE_IDS.has(id);
}

export function isDeliveryVehicleModel(
  id: PrimitiveType,
): id is DeliveryVehicleModel {
  return DELIVERY_VEHICLE_IDS.has(id);
}

/** Cars, trucks, and delivery scooters share the road dataset. */
export function isRoadVehicleModel(
  id: PrimitiveType,
): id is GroundVehicleModel | DeliveryVehicleModel {
  return isGroundVehicleModel(id) || isDeliveryVehicleModel(id);
}

export function isWatercraftModel(id: PrimitiveType): id is WatercraftModel {
  return WATERCRAFT_IDS.has(id);
}

export function isAircraftModel(
  id: PrimitiveType,
): id is AircraftModel | MilitaryAircraftModel {
  return AIRCRAFT_IDS.has(id);
}

export function isGlbMarkerModel(id: PrimitiveType): boolean {
  return (
    isRoadVehicleModel(id) || isWatercraftModel(id) || isAircraftModel(id)
  );
}

/** Aircraft and delivery scooters ship three authored meshes. Other GLBs have one. */
export function glbMarkerLodCount(id: PrimitiveType): number {
  return isAircraftModel(id) || isDeliveryVehicleModel(id) ? 3 : 1;
}

export function glbMarkerModelUrl(id: PrimitiveType, lod = 0): string {
  const entry = MODEL_BY_ID.get(id);
  const dir = entry ? GLB_ASSET_DIR[entry.category] : undefined;
  if (!dir) {
    throw new Error(`Model "${id}" is not a GLB marker asset`);
  }
  const level = Math.max(0, Math.round(lod));
  if (level === 0) return `${dir}/${id}.glb`;
  return `${dir}/${id}-lod${level}.glb`;
}

/** Yaw that turns the authored nose onto +Z. Zero for Kenney-style assets. */
export function glbMarkerYawAlign(id: PrimitiveType): number {
  const entry = MODEL_BY_ID.get(id);
  const yaw = entry ? GLB_YAW_ALIGN[entry.category] : undefined;
  return yaw ?? 0;
}

export function sanitizePrimitiveId(
  value: unknown,
  fallback: PrimitiveType = "octahedron",
): PrimitiveType {
  if (typeof value === "string" && isKnownModelId(value)) return value;
  // Legacy disk primitive → icosphere
  if (value === "disk") return "icosphere";
  return fallback;
}
