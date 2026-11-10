export const EARTH_CIRCUMFERENCE_METERS = 40075016.68557849;
export const WEB_MERCATOR_TILE_SIZE = 512;
export const MAX_MERCATOR_LATITUDE = 85.051129;

export const DEFAULT_ZOOM_SCALE_MIN_PIXELS = 8;
export const DEFAULT_ZOOM_SCALE_MAX_PIXELS = 64;

export type AdaptiveZoomSettings = {
  enabled: boolean;
  minPixels: number;
  maxPixels: number;
  /** Cap min-pixel scale-up so neighboring markers do not overlap. */
  collisionAware?: boolean;
};

export type AdaptiveZoomUniformState = AdaptiveZoomSettings & {
  metersPerPixel: number;
};

export function normalizeZoomPixelBounds(
  minPixels: unknown,
  maxPixels: unknown,
): { minPixels: number; maxPixels: number } {
  const parsedMin =
    typeof minPixels === "number" ? minPixels : Number(minPixels);
  const parsedMax =
    typeof maxPixels === "number" ? maxPixels : Number(maxPixels);
  const min = Number.isFinite(parsedMin) && parsedMin >= 1
    ? parsedMin
    : DEFAULT_ZOOM_SCALE_MIN_PIXELS;
  const max = Number.isFinite(parsedMax) && parsedMax >= 1
    ? parsedMax
    : DEFAULT_ZOOM_SCALE_MAX_PIXELS;
  return { minPixels: min, maxPixels: Math.max(min, max) };
}

/** Nominal CSS-pixel ground resolution for a 512 px Web Mercator tile. */
export function metersPerPixelAtLatitude(
  zoom: number,
  latitude: number,
): number {
  const safeZoom = Number.isFinite(zoom) ? zoom : 0;
  const safeLatitude = Number.isFinite(latitude)
    ? Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude))
    : 0;
  return (
    (Math.cos((safeLatitude * Math.PI) / 180) *
      EARTH_CIRCUMFERENCE_METERS) /
    (WEB_MERCATOR_TILE_SIZE * 2 ** safeZoom)
  );
}

export function collisionAwareEnabled(
  settings: Pick<AdaptiveZoomSettings, "collisionAware"> | undefined,
): boolean {
  return settings?.collisionAware !== false;
}

/** Keep true-meter size as a floor; only min-pixel scale-up is collision-capped. */
export function applyCollisionScaleCap(
  factor: number,
  cap: number,
  enabled = true,
): number {
  if (!enabled) return factor;
  const safe = Number.isFinite(cap) && cap > 0 ? cap : Number.POSITIVE_INFINITY;
  return Math.min(factor, Math.max(1, safe));
}

export function adaptiveScaleFactor(
  sizeMeters: number,
  metersPerPixel: number,
  settings: AdaptiveZoomSettings,
): number {
  if (!settings.enabled) return 1;
  if (
    !Number.isFinite(sizeMeters) ||
    sizeMeters <= 0 ||
    !Number.isFinite(metersPerPixel) ||
    metersPerPixel <= 0
  ) {
    return 1;
  }
  const bounds = normalizeZoomPixelBounds(
    settings.minPixels,
    settings.maxPixels,
  );
  const projectedPixels = sizeMeters / metersPerPixel;
  const clampedPixels = Math.max(
    bounds.minPixels,
    Math.min(bounds.maxPixels, projectedPixels),
  );
  return clampedPixels / projectedPixels;
}

export function makeAdaptiveZoomUniformState(
  zoom: number,
  latitude: number,
  settings: AdaptiveZoomSettings,
): AdaptiveZoomUniformState {
  const bounds = normalizeZoomPixelBounds(
    settings.minPixels,
    settings.maxPixels,
  );
  return {
    enabled: settings.enabled,
    minPixels: bounds.minPixels,
    maxPixels: bounds.maxPixels,
    collisionAware: collisionAwareEnabled(settings),
    metersPerPixel: metersPerPixelAtLatitude(zoom, latitude),
  };
}
