import * as THREE from "three";
import type { LightingSettings } from "@/lib/types";

export const DEFAULT_LIGHTING: LightingSettings = {
  ambientEnabled: true,
  ambientColor: "#ffffff",
  ambientIntensity: 0.35,

  directionalEnabled: false,
  directionalColor: "#ffffff",
  directionalIntensity: 1.1,
  directionalAzimuth: 45,
  directionalElevation: 55,
  directionalCastShadow: false,

  directional2Enabled: false,
  directional2Color: "#a0c4ff",
  directional2Intensity: 0.25,
  directional2Azimuth: 225,
  directional2Elevation: 25,

  cameraFillEnabled: true,
  cameraFillColor: "#ffffff",
  cameraFillIntensity: 0.35,

  hemisphereEnabled: true,
  hemisphereSky: "#e0b0ff",
  hemisphereGround: "#7198c9",
  hemisphereIntensity: 0.9,

  pointEnabled: false,
  pointColor: "#ffffff",
  pointIntensity: 1,
  pointDistance: 0,
  pointDecay: 2,
  pointAzimuth: 0,
  pointElevation: 60,
  pointRadius: 50,

  spotEnabled: false,
  spotColor: "#ffffff",
  spotIntensity: 2,
  spotDistance: 200,
  spotAngle: 0.4,
  spotPenumbra: 0.3,
  spotDecay: 2,
  spotAzimuth: 30,
  spotElevation: 70,
  spotRadius: 80,

  environmentEnabled: false,
  environmentIntensity: 0.1,

  sunEnabled: true,
  sunAzimuth: 34,
  sunElevation: 67,
  sunIntensity: 2.45,
  sunColor: "#fff1d6",
  sunSyncHemisphere: true,

  contactShadowsEnabled: true,
  contactShadowsOpacity: 1,
  contactShadowsBlur: 0,
  contactShadowsSize: 28500,
  contactShadowsResolution: 256,
  contactShadowsDarkness: 2,
  contactShadowsQuality: "high",
  contactShadowsViewportPadding: 0,
  contactShadowsMaxExtent: 825000,
  contactShadowsGroundOffset: 0.01,
};

export type SceneLights = {
  ambient: THREE.AmbientLight;
  directional: THREE.DirectionalLight;
  directional2: THREE.DirectionalLight;
  cameraFill: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  point: THREE.PointLight;
  spot: THREE.SpotLight;
};

const _dir = new THREE.Vector3();

export function directionFromAzimuthElevation(
  azimuthDeg: number,
  elevationDeg: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return target.set(Math.sin(az) * cosEl, Math.sin(el), Math.cos(az) * cosEl);
}

function placeByAzEl(
  object: THREE.Object3D,
  azimuth: number,
  elevation: number,
  radius: number,
): void {
  directionFromAzimuthElevation(azimuth, elevation, _dir);
  object.position.copy(_dir).multiplyScalar(radius);
}

/** Unit vector pointing from origin toward the sun (light direction from surface → sun). */
export function getSunDirection(
  settings: LightingSettings,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  if (settings.sunEnabled) {
    return directionFromAzimuthElevation(
      settings.sunAzimuth,
      settings.sunElevation,
      target,
    );
  }
  return directionFromAzimuthElevation(
    settings.directionalAzimuth,
    settings.directionalElevation,
    target,
  );
}

function sunHemisphereColors(elevationDeg: number): {
  sky: string;
  ground: string;
  intensity: number;
} {
  if (elevationDeg < 4) {
    return { sky: "#1a1a2e", ground: "#0d0d0d", intensity: 0.15 };
  }
  if (elevationDeg < 15) {
    return { sky: "#ff9a5c", ground: "#4a3020", intensity: 0.4 };
  }
  if (elevationDeg < 40) {
    return { sky: "#9ec9ff", ground: "#4a4a40", intensity: 0.45 };
  }
  return { sky: "#b1e1ff", ground: "#5a5a48", intensity: 0.5 };
}

export function createSceneLights(
  settings: LightingSettings = DEFAULT_LIGHTING,
): SceneLights {
  const ambient = new THREE.AmbientLight(
    settings.ambientColor,
    settings.ambientIntensity,
  );
  const directional = new THREE.DirectionalLight(
    settings.directionalColor,
    settings.directionalIntensity,
  );
  const directional2 = new THREE.DirectionalLight(
    settings.directional2Color,
    settings.directional2Intensity,
  );
  const cameraFill = new THREE.DirectionalLight(
    settings.cameraFillColor,
    settings.cameraFillIntensity,
  );
  cameraFill.castShadow = false;
  const hemisphere = new THREE.HemisphereLight(
    settings.hemisphereSky,
    settings.hemisphereGround,
    settings.hemisphereIntensity,
  );
  const point = new THREE.PointLight(
    settings.pointColor,
    settings.pointIntensity,
    settings.pointDistance,
    settings.pointDecay,
  );
  const spot = new THREE.SpotLight(
    settings.spotColor,
    settings.spotIntensity,
    settings.spotDistance,
    settings.spotAngle,
    settings.spotPenumbra,
    settings.spotDecay,
  );
  spot.target.position.set(0, 0, 0);

  applyLightingSettings(
    { ambient, directional, directional2, cameraFill, hemisphere, point, spot },
    settings,
  );

  return {
    ambient,
    directional,
    directional2,
    cameraFill,
    hemisphere,
    point,
    spot,
  };
}

export function applyLightingSettings(
  lights: SceneLights,
  settings: LightingSettings,
): void {
  lights.ambient.visible = settings.ambientEnabled;
  lights.ambient.color.set(settings.ambientColor);
  lights.ambient.intensity = settings.ambientIntensity;

  // Key light: sun mode overrides directional key for consistent outdoor lighting
  if (settings.sunEnabled) {
    lights.directional.visible = true;
    lights.directional.color.set(settings.sunColor);
    lights.directional.intensity = settings.sunIntensity;
    placeByAzEl(
      lights.directional,
      settings.sunAzimuth,
      settings.sunElevation,
      100,
    );
  } else {
    lights.directional.visible = settings.directionalEnabled;
    lights.directional.color.set(settings.directionalColor);
    lights.directional.intensity = settings.directionalIntensity;
    placeByAzEl(
      lights.directional,
      settings.directionalAzimuth,
      settings.directionalElevation,
      100,
    );
  }
  lights.directional.castShadow = settings.directionalCastShadow;

  lights.directional2.visible = settings.directional2Enabled;
  lights.directional2.color.set(settings.directional2Color);
  lights.directional2.intensity = settings.directional2Intensity;
  placeByAzEl(
    lights.directional2,
    settings.directional2Azimuth,
    settings.directional2Elevation,
    100,
  );

  lights.cameraFill.visible = settings.cameraFillEnabled;
  lights.cameraFill.color.set(settings.cameraFillColor);
  lights.cameraFill.intensity = settings.cameraFillIntensity;
  lights.cameraFill.castShadow = false;

  lights.hemisphere.visible = settings.hemisphereEnabled;
  if (settings.sunEnabled && settings.sunSyncHemisphere) {
    const hemi = sunHemisphereColors(settings.sunElevation);
    lights.hemisphere.color.set(hemi.sky);
    lights.hemisphere.groundColor.set(hemi.ground);
    lights.hemisphere.intensity = hemi.intensity;
  } else {
    lights.hemisphere.color.set(settings.hemisphereSky);
    lights.hemisphere.groundColor.set(settings.hemisphereGround);
    lights.hemisphere.intensity = settings.hemisphereIntensity;
  }

  lights.point.visible = settings.pointEnabled;
  lights.point.color.set(settings.pointColor);
  lights.point.intensity = settings.pointIntensity;
  lights.point.distance = settings.pointDistance;
  lights.point.decay = settings.pointDecay;
  placeByAzEl(
    lights.point,
    settings.pointAzimuth,
    settings.pointElevation,
    settings.pointRadius,
  );

  lights.spot.visible = settings.spotEnabled;
  lights.spot.color.set(settings.spotColor);
  lights.spot.intensity = settings.spotIntensity;
  lights.spot.distance = settings.spotDistance;
  lights.spot.angle = settings.spotAngle;
  lights.spot.penumbra = settings.spotPenumbra;
  lights.spot.decay = settings.spotDecay;
  placeByAzEl(
    lights.spot,
    settings.spotAzimuth,
    settings.spotElevation,
    settings.spotRadius,
  );
  lights.spot.target.updateMatrixWorld();
}

const _fillLook = new THREE.Vector3();

/**
 * Aim the camera fill along the real view (camera → look-at).
 * The Mapbox custom layer's Three camera has an identity transform, so this
 * must be called each frame with Mapbox-derived local-meter positions.
 */
export function updateCameraFillLight(
  light: THREE.DirectionalLight,
  cameraPos: THREE.Vector3,
  lookAt: THREE.Vector3,
): void {
  light.position.copy(cameraPos);
  _fillLook.subVectors(lookAt, cameraPos);
  if (_fillLook.lengthSq() < 1e-8) {
    light.target.position.set(cameraPos.x, cameraPos.y - 1, cameraPos.z);
  } else {
    light.target.position.copy(lookAt);
  }
  light.target.updateMatrixWorld();
}

export function contactShadowSettingsFromLighting(
  settings: LightingSettings,
) {
  return {
    enabled: settings.contactShadowsEnabled,
    opacity: settings.contactShadowsOpacity,
    blur: settings.contactShadowsBlur,
    size: settings.contactShadowsSize,
    resolution: settings.contactShadowsResolution,
    darkness: settings.contactShadowsDarkness,
    quality: settings.contactShadowsQuality,
    viewportPadding: settings.contactShadowsViewportPadding,
    maxExtent: settings.contactShadowsMaxExtent,
    groundOffset: settings.contactShadowsGroundOffset,
  };
}
