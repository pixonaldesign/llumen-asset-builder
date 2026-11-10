import * as THREE from "three";
import type { MaterialSettings, MaterialSide } from "@/lib/types";
import {
  WORLD_BEVEL_BEGIN_VERTEX,
  WORLD_BEVEL_VERTEX_DECLARATIONS,
} from "@/lib/shaders/worldBevel";
import {
  ADAPTIVE_AREA_BEGIN_NORMAL,
  ADAPTIVE_AREA_BEGIN_VERTEX,
  ADAPTIVE_POINT_BEGIN_VERTEX,
  ADAPTIVE_POINT_COLLISION_DECLARATIONS,
  ADAPTIVE_SCALE_VERTEX_DECLARATIONS,
} from "@/lib/shaders/adaptiveScale";
import type { AdaptiveZoomUniformState } from "@/lib/zoomScaling";

/** Defaults aligned with `configs/default.json` (Llumen look). */
export const DEFAULT_MATERIAL: MaterialSettings = {
  color: "#ffffff",
  metalness: 0,
  roughness: 0.55,
  opacity: 0.9,
  transparent: false,
  emissive: "#000000",
  emissiveIntensity: 0,
  clearcoat: 0.6,
  clearcoatRoughness: 1,
  transmission: 0,
  thickness: 0.93,
  ior: 1.43,
  attenuationColor: "#ffffff",
  attenuationDistance: 0,
  sheen: 0,
  sheenRoughness: 1,
  sheenColor: "#ffffff",
  specularIntensity: 1,
  specularColor: "#ffffff",
  iridescence: 0.42,
  iridescenceIOR: 1.3,
  iridescenceThicknessMin: 100,
  iridescenceThicknessMax: 400,
  envMapIntensity: 1,
  flatShading: false,
  wireframe: false,
  side: "double",
  depthTest: true,
  depthWrite: true,
  alphaTest: 0,
  fog: false,
  dithering: true,
  fresnelEnabled: true,
  fresnelColor: "#ffffff",
  fresnelIntensity: 0.15,
  fresnelPower: 7.25,
};

const SIDE_MAP: Record<MaterialSide, THREE.Side> = {
  front: THREE.FrontSide,
  back: THREE.BackSide,
  double: THREE.DoubleSide,
};

type PillarLightUniforms = {
  uPillarLight: { value: number };
  uPillarReach: { value: number };
  uPillarBottom: { value: number };
  uPillarTop: { value: number };
};

type FresnelUniforms = {
  uFresnelColor: { value: THREE.Color };
  uFresnelIntensity: { value: number };
  uFresnelPower: { value: number };
  uFresnelCameraPos: { value: THREE.Vector3 };
};

export type AdaptiveScaleMode = "none" | "point" | "area";

type AdaptiveScaleUniforms = {
  uAdaptiveScaleEnabled: { value: number };
  uAdaptiveMetersPerPixel: { value: number };
  uAdaptiveMinPixels: { value: number };
  uAdaptiveMaxPixels: { value: number };
  uCollisionAwareEnabled: { value: number };
};

type FresnelUserData = {
  fresnelPatched?: boolean;
  fresnelUniforms?: FresnelUniforms;
  fresnelPending?: MaterialSettings;
  fresnelCameraPending?: THREE.Vector3;
  worldBevelEnabled?: boolean;
  adaptiveScaleMode?: AdaptiveScaleMode;
  adaptiveScaleUniforms?: AdaptiveScaleUniforms;
  adaptiveScaleState?: AdaptiveZoomUniformState;
  pillarLightEnabled?: boolean;
  pillarLightUniforms?: PillarLightUniforms;
};

function writeAdaptiveScaleUniforms(
  uniforms: AdaptiveScaleUniforms,
  state: AdaptiveZoomUniformState,
): void {
  uniforms.uAdaptiveScaleEnabled.value = state.enabled ? 1 : 0;
  uniforms.uAdaptiveMetersPerPixel.value = state.metersPerPixel;
  uniforms.uAdaptiveMinPixels.value = state.minPixels;
  uniforms.uAdaptiveMaxPixels.value = state.maxPixels;
  uniforms.uCollisionAwareEnabled.value = state.collisionAware === false ? 0 : 1;
}

/**
 * Stable uniform objects shared across bevel/plain shader variants.
 * Three.js only runs onBeforeCompile when a program is first compiled; switching
 * back to a cached variant must not drop these references or zoom updates stall.
 */
function ensureAdaptiveScaleUniforms(
  ud: FresnelUserData,
): AdaptiveScaleUniforms {
  if (!ud.adaptiveScaleUniforms) {
    ud.adaptiveScaleUniforms = {
      uAdaptiveScaleEnabled: { value: 0 },
      uAdaptiveMetersPerPixel: { value: 1 },
      uAdaptiveMinPixels: { value: 8 },
      uAdaptiveMaxPixels: { value: 64 },
      uCollisionAwareEnabled: { value: 1 },
    };
  }
  return ud.adaptiveScaleUniforms;
}

function writeFresnelUniforms(
  uniforms: FresnelUniforms,
  settings: MaterialSettings,
): void {
  uniforms.uFresnelColor.value.set(settings.fresnelColor);
  uniforms.uFresnelIntensity.value = settings.fresnelEnabled
    ? settings.fresnelIntensity
    : 0;
  uniforms.uFresnelPower.value = Math.max(settings.fresnelPower, 0.0001);
}

function ensureFresnelShader(material: THREE.MeshPhysicalMaterial): void {
  const ud = material.userData as FresnelUserData;
  if (ud.fresnelPatched) return;
  ud.fresnelPatched = true;

  // v2: camera-facing rim using explicit world-space camera position
  // (Mapbox custom layers don't give Three a real view matrix).
  material.customProgramCacheKey = () =>
    `physical-fresnel-rim-v7-${ud.worldBevelEnabled ? "bevel" : "plain"}-${ud.adaptiveScaleMode ?? "none"}-${ud.pillarLightEnabled ? "plit" : "off"}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFresnelColor = { value: new THREE.Color("#ffffff") };
    shader.uniforms.uFresnelIntensity = { value: 0 };
    shader.uniforms.uFresnelPower = { value: 2.5 };
    shader.uniforms.uFresnelCameraPos = {
      value: new THREE.Vector3(0, 1000, 0),
    };
    const adaptiveUniforms = ensureAdaptiveScaleUniforms(ud);
    shader.uniforms.uAdaptiveScaleEnabled =
      adaptiveUniforms.uAdaptiveScaleEnabled;
    shader.uniforms.uAdaptiveMetersPerPixel =
      adaptiveUniforms.uAdaptiveMetersPerPixel;
    shader.uniforms.uAdaptiveMinPixels = adaptiveUniforms.uAdaptiveMinPixels;
    shader.uniforms.uAdaptiveMaxPixels = adaptiveUniforms.uAdaptiveMaxPixels;
    shader.uniforms.uCollisionAwareEnabled =
      adaptiveUniforms.uCollisionAwareEnabled;

    const uniforms: FresnelUniforms = {
      uFresnelColor: shader.uniforms
        .uFresnelColor as FresnelUniforms["uFresnelColor"],
      uFresnelIntensity: shader.uniforms
        .uFresnelIntensity as FresnelUniforms["uFresnelIntensity"],
      uFresnelPower: shader.uniforms
        .uFresnelPower as FresnelUniforms["uFresnelPower"],
      uFresnelCameraPos: shader.uniforms
        .uFresnelCameraPos as FresnelUniforms["uFresnelCameraPos"],
    };
    ud.fresnelUniforms = uniforms;

    if (ud.fresnelPending) {
      writeFresnelUniforms(uniforms, ud.fresnelPending);
      delete ud.fresnelPending;
    }
    if (ud.fresnelCameraPending) {
      uniforms.uFresnelCameraPos.value.copy(ud.fresnelCameraPending);
      delete ud.fresnelCameraPending;
    }
    if (ud.adaptiveScaleState) {
      writeAdaptiveScaleUniforms(
        adaptiveUniforms,
        ud.adaptiveScaleState,
      );
    }

    const adaptiveMode = ud.adaptiveScaleMode ?? "none";
    if (adaptiveMode !== "none") {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        ${ADAPTIVE_SCALE_VERTEX_DECLARATIONS}
        ${adaptiveMode === "point" ? ADAPTIVE_POINT_COLLISION_DECLARATIONS : ""}
        `,
      );
    }

    if (ud.worldBevelEnabled) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        ${WORLD_BEVEL_VERTEX_DECLARATIONS}
        `,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        WORLD_BEVEL_BEGIN_VERTEX,
      );
    } else if (adaptiveMode === "point") {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        ADAPTIVE_POINT_BEGIN_VERTEX,
      );
    } else if (adaptiveMode === "area") {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        ADAPTIVE_AREA_BEGIN_VERTEX,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        ADAPTIVE_AREA_BEGIN_NORMAL,
      );
    }

    // World-space position + normal so rim tracks the real Mapbox camera.
    const pillarOn = Boolean(ud.pillarLightEnabled);
    if (!ud.pillarLightUniforms) {
      ud.pillarLightUniforms = {
        uPillarLight: { value: 0 },
        uPillarReach: { value: 0.35 },
        uPillarBottom: { value: -0.5 },
        uPillarTop: { value: 0.5 },
      };
    }
    const pillarUniforms = ud.pillarLightUniforms;
    shader.uniforms.uPillarLight = pillarUniforms.uPillarLight;
    shader.uniforms.uPillarReach = pillarUniforms.uPillarReach;
    shader.uniforms.uPillarBottom = pillarUniforms.uPillarBottom;
    shader.uniforms.uPillarTop = pillarUniforms.uPillarTop;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      attribute float featureOpacity;
      varying float vFeatureOpacity;
      varying vec3 vFresnelWorldPos;
      varying vec3 vFresnelWorldNormal;
      ${
        pillarOn
          ? `
      attribute vec3 pillarColor;
      attribute float pillarLit;
      varying vec3 vPillarColor;
      varying float vPillarClimb;
      uniform float uPillarReach;
      uniform float uPillarBottom;
      uniform float uPillarTop;
      `
          : ""
      }
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      /* glsl */ `
      vFeatureOpacity = featureOpacity;
      #include <project_vertex>
      {
        vec4 _fWorld = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          _fWorld = instanceMatrix * _fWorld;
        #endif
        _fWorld = modelMatrix * _fWorld;
        vFresnelWorldPos = _fWorld.xyz;

        vec3 _fN = objectNormal;
        #ifdef USE_INSTANCING
          mat3 _fIm = mat3( instanceMatrix );
          _fN = _fIm * _fN;
        #endif
        vFresnelWorldNormal = normalize( mat3( modelMatrix ) * _fN );
      }
      ${
        pillarOn
          ? `
      vPillarColor = pillarColor * pillarLit;
      {
        float h;
        ${
          ud.worldBevelEnabled
            ? `
        float fullH = max(instanceSize.y * collisionAwareAdaptiveScaleFactorFor(adaptiveScaleSize), 0.001);
        h = clamp(transformed.y / fullH, 0.0, 1.0);
        `
            : `
        float span = max(uPillarTop - uPillarBottom, 0.001);
        h = clamp((position.y - uPillarBottom) / span, 0.0, 1.0);
        `
        }
        float reach = clamp(uPillarReach, 0.05, 1.0);
        vPillarClimb = 1.0 - smoothstep(reach * 0.08, reach, h);
      }
      `
          : ""
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      /* glsl */ `
      uniform vec3 uFresnelColor;
      uniform float uFresnelIntensity;
      uniform float uFresnelPower;
      uniform vec3 uFresnelCameraPos;
      varying float vFeatureOpacity;
      varying vec3 vFresnelWorldPos;
      varying vec3 vFresnelWorldNormal;
      ${
        pillarOn
          ? `
      uniform float uPillarLight;
      varying vec3 vPillarColor;
      varying float vPillarClimb;
      `
          : ""
      }
      void main() {
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "vec4 diffuseColor = vec4( diffuse, opacity );",
      /* glsl */ `
      vec4 diffuseColor = vec4( diffuse, opacity );
      diffuseColor.a *= vFeatureOpacity;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      /* glsl */ `
      {
        vec3 _fN = normalize( vFresnelWorldNormal );
        vec3 _fV = normalize( uFresnelCameraPos - vFresnelWorldPos );
        float _ndotv = abs( dot( _fN, _fV ) );
        float _fresnel = pow( clamp( 1.0 - _ndotv, 0.0, 1.0 ), uFresnelPower );
        outgoingLight += uFresnelColor * ( uFresnelIntensity * _fresnel );
        ${
          pillarOn
            ? "outgoingLight += vPillarColor * (uPillarLight * vPillarClimb);"
            : ""
        }
      }
      #include <opaque_fragment>
      `,
    );
  };
}

/** Toggle post-size world-space bevel deformation for the active geometry. */
export function setWorldBevelEnabled(
  material: THREE.MeshPhysicalMaterial,
  enabled: boolean,
): void {
  ensureFresnelShader(material);
  const ud = material.userData as FresnelUserData;
  if (ud.worldBevelEnabled === enabled) return;
  ud.worldBevelEnabled = enabled;
  // Keep adaptiveScaleUniforms — variants share the same uniform objects.
  material.needsUpdate = true;
}

/** Bottom-up tint on the mesh. Reach is how far up the body the light climbs. */
export function setPillarBottomLight(
  material: THREE.MeshPhysicalMaterial,
  options: {
    enabled: boolean;
    intensity: number;
    reach: number;
    bottom: number;
    top: number;
  },
): void {
  ensureFresnelShader(material);
  const ud = material.userData as FresnelUserData;
  if (ud.pillarLightEnabled !== options.enabled) {
    ud.pillarLightEnabled = options.enabled;
    material.needsUpdate = true;
  }
  if (!ud.pillarLightUniforms) {
    ud.pillarLightUniforms = {
      uPillarLight: { value: 0 },
      uPillarReach: { value: 0.35 },
      uPillarBottom: { value: -0.5 },
      uPillarTop: { value: 0.5 },
    };
  }
  const uniforms = ud.pillarLightUniforms;
  uniforms.uPillarLight.value = options.enabled ? options.intensity : 0;
  uniforms.uPillarReach.value = options.reach;
  uniforms.uPillarBottom.value = options.bottom;
  uniforms.uPillarTop.value = options.top;
}

export function setAdaptiveScaleMode(
  material: THREE.MeshPhysicalMaterial,
  mode: AdaptiveScaleMode,
): void {
  ensureFresnelShader(material);
  const ud = material.userData as FresnelUserData;
  if (ud.adaptiveScaleMode === mode) return;
  ud.adaptiveScaleMode = mode;
  material.needsUpdate = true;
}

export function setAdaptiveZoomUniforms(
  material: THREE.MeshPhysicalMaterial,
  state: AdaptiveZoomUniformState,
): void {
  ensureFresnelShader(material);
  const ud = material.userData as FresnelUserData;
  ud.adaptiveScaleState = { ...state };
  writeAdaptiveScaleUniforms(ensureAdaptiveScaleUniforms(ud), state);
}

function applyFresnelUniforms(
  material: THREE.MeshPhysicalMaterial,
  settings: MaterialSettings,
): void {
  ensureFresnelShader(material);
  const ud = material.userData as FresnelUserData;
  if (ud.fresnelUniforms) {
    writeFresnelUniforms(ud.fresnelUniforms, settings);
  } else {
    // First compile hasn't run yet — apply once the program links
    ud.fresnelPending = settings;
    material.needsUpdate = true;
  }
}

/** Update rim-light camera position each frame (local scene meters). */
export function setFresnelCameraPosition(
  material: THREE.MeshPhysicalMaterial,
  position: THREE.Vector3,
): void {
  ensureFresnelShader(material);
  const ud = material.userData as FresnelUserData;
  if (ud.fresnelUniforms) {
    ud.fresnelUniforms.uFresnelCameraPos.value.copy(position);
  } else {
    ud.fresnelCameraPending = position.clone();
  }
}

export function createMarkerMaterial(
  settings: MaterialSettings = DEFAULT_MATERIAL,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial();
  applyMaterialSettings(mat, settings);
  return mat;
}

export function applyMaterialSettings(
  material: THREE.MeshPhysicalMaterial,
  settings: MaterialSettings,
): void {
  material.color.set(settings.color);
  material.metalness = settings.metalness;
  material.roughness = settings.roughness;
  material.opacity = settings.opacity;
  material.transparent =
    settings.transparent ||
    settings.opacity < 1 ||
    settings.transmission > 0 ||
    Boolean(material.userData.needsFeatureOpacityTransparency);
  // Mapbox custom layers composite with premultiplied alpha; keep Three output
  // in that format so translucent markers don't wash out against the basemap.
  material.premultipliedAlpha = true;
  material.emissive.set(settings.emissive);
  material.emissiveIntensity = settings.emissiveIntensity;

  material.clearcoat = settings.clearcoat;
  material.clearcoatRoughness = settings.clearcoatRoughness;

  material.transmission = settings.transmission;
  material.thickness = settings.thickness;
  material.ior = settings.ior;
  material.attenuationColor.set(settings.attenuationColor);
  material.attenuationDistance =
    settings.attenuationDistance <= 0 ? Infinity : settings.attenuationDistance;

  material.sheen = settings.sheen;
  material.sheenRoughness = settings.sheenRoughness;
  material.sheenColor.set(settings.sheenColor);

  material.specularIntensity = settings.specularIntensity;
  material.specularColor.set(settings.specularColor);

  material.iridescence = settings.iridescence;
  material.iridescenceIOR = settings.iridescenceIOR;
  material.iridescenceThicknessRange = [
    settings.iridescenceThicknessMin,
    settings.iridescenceThicknessMax,
  ];

  material.envMapIntensity = settings.envMapIntensity;
  material.flatShading = settings.flatShading;
  material.wireframe = settings.wireframe;
  material.side = SIDE_MAP[settings.side];
  material.depthTest = settings.depthTest;
  material.depthWrite = settings.depthWrite;
  material.alphaTest = settings.alphaTest;
  material.fog = settings.fog;
  material.dithering = settings.dithering;

  applyFresnelUniforms(material, settings);
}
