import type { Map as MapboxMap, CustomLayerInterface } from "mapbox-gl";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
  FlagAuraSettings,
  VizArea,
  OilSpillSettings,
  DustStormSettings,
  FloodSettings,
  VizPoint,
  WaterGradientSettings,
} from "@/lib/types";
import type {
  ColorMode,
  GeometryQuality,
  LightingSettings,
  MarkerLodSettings,
  MaterialSettings,
  PrimitiveType,
  RendererSettings,
  ShadowMapTypeName,
  ToneMappingName,
} from "@/lib/types";
import {
  applyMaterialSettings,
  createMarkerMaterial,
  setAdaptiveScaleMode,
  setAdaptiveZoomUniforms,
  setFresnelCameraPosition,
  setPillarBottomLight,
  setWorldBevelEnabled,
} from "@/lib/materials";
import {
  applyLightingSettings,
  contactShadowSettingsFromLighting,
  createSceneLights,
  DEFAULT_LIGHTING,
  getSunDirection,
  updateCameraFillLight,
  type SceneLights,
} from "@/lib/lighting";
import {
  ContactShadowAtlas,
  type ContactShadowStats,
} from "@/lib/contactShadows";
import {
  buildModelTransformMatrix,
  createSceneOrigin,
  lngLatToLocalMeters,
  mapCameraToLocalMeters,
  type SceneOrigin,
} from "@/lib/mercator";
import {
  createInstancedMarkerMesh,
  disposeInstancedMesh,
  prepareMarkerInstances,
  setInstancedFrustumCulled,
  writePreparedMarkers,
  type PreparedMarkerInstance,
} from "@/lib/instancedMarkers";
import {
  createBearingTriangleMaterial,
  createBearingTriangleMesh,
  disposeBearingTriangles,
  writeBearingTriangles,
} from "@/lib/bearingTriangles";
import {
  DEFAULT_MARKER_LOD,
  geometryLodLevel,
  lodRadiusMetersFromViewport,
  markerLodKey,
  partitionMarkerLod,
  renderedMarkerPixels,
  splitIndicesByGeometryLod,
} from "@/lib/markerLod";
import { centroidOfPoints } from "@/lib/geo/loadDataset";
import { primitiveUsesWorldBevel } from "@/lib/primitives";
import { isGlbMarkerModel } from "@/lib/modelCatalog";
import { loadMarkerModelLods } from "@/lib/glbGeometry";
import { FpsSampler } from "@/lib/perf";
import {
  buildExtrudedAreas,
  disposeExtrudedAreas,
  type AreaFlagSpan,
} from "@/lib/extrudedAreas";
import { centroidOfAreas } from "@/lib/geo/loadDataset";
import {
  adaptiveScaleFactor,
  applyCollisionScaleCap,
  makeAdaptiveZoomUniformState,
  metersPerPixelAtLatitude,
  type AdaptiveZoomSettings,
} from "@/lib/zoomScaling";
import { DEFAULT_OIL_SPILL, DEFAULT_WATER_GRADIENT } from "@/lib/configIO";
import {
  applyFlagAuraSettings,
  applyFlagBeaconPoolSettings,
  applyFlagBeaconSettings,
  createFlagAuraMaterial,
  createFlagAuraMesh,
  createFlagBeaconMaterial,
  createFlagBeaconMesh,
  createFlagBeaconPoolMaterial,
  createFlagBeaconPoolMesh,
  createFlagMaskMaterial,
  disposeFlagAura,
  flagAuraMeshKey,
  flagAuraNeedsAnimation,
  flagAuraSourcesFromPoints,
  flagOutlineNeedsAnimation,
  isLookdevFlagCovered,
  setFlagAuraAdaptiveUniforms,
  setFlagAuraCameraPosition,
  setFlagAuraTime,
  setFlagBeaconFootprint,
  setFlagBeaconPoolFootprint,
  setFlagBeaconPoolStemPresence,
  setFlagBeaconScreen,
  writeFlagAura,
  writePillarBottomLight,
  DEFAULT_FLAG_AURA,
  type FlagAuraSource,
} from "@/lib/flagAura";
import {
  beaconAnchorY,
  beaconSpriteHit,
  projectSceneToCss,
  type BeaconPickTarget,
} from "@/lib/flagBeaconPick";
import {
  FlagOutline,
  createAreaMaskMaterial,
  createDiscMaskMaterial,
  setAreaMaskAdaptiveUniforms,
  setDiscMaskRadius,
  writeAreaFlagAttributes,
  writeDiscFlagAttributes,
  type FlagOutlineStats,
  type OutlineMaskDraw,
} from "@/lib/flagOutline";
import {
  FlagAuraBloom,
  type FlagAuraBloomStats,
} from "@/lib/flagAuraBloom";
import {
  applyWaterGradientSettings,
  applyWaterMaskToMaterial,
  applyWaterStemSettings,
  applyWaterStemZoom,
  buildWaterGradients,
  buildWaterStems,
  createWaterGradientMaterial,
  createWaterStemMaterial,
  disposeWaterGradientMaterial,
  disposeWaterGradients,
  disposeWaterStems,
  maskBoundsForPoints,
  setWaterGradientTime,
  waterGradientNeedsAnimation,
  WATER_GRADIENT_ALTITUDE,
} from "@/lib/waterGradients";
import {
  applyOilSpillMask,
  applyOilSpillSettings,
  createOilBlob,
  createOilSpillMaterial,
  disposeOilBlob,
  disposeOilSpillMaterial,
  oilSpillExtentPoints,
  setOilSpillCamera,
  applyOilBlobPresentation,
  setOilPathwayTime,
  setOilPathwayZoom,
  setOilParticleZoom,
  setOilStemZoom,
  setOilSpillTime,
  updateOilBlob,
  type OilBlob,
  type OilSpillTracks,
} from "@/lib/oilSpill";
import { OilSpillSmooth } from "@/lib/oilSpillSmooth";
import { DustSoftField, DustSoftFrost } from "@/lib/dustSoftPass";
import { DEFAULT_DUST_STORM } from "@/lib/configIO";
import {
  buildDustHexCellGeometry,
  buildDustHexField,
  buildDustPointGeometry,
  buildDustSoftGeometry,
  buildDustSquareCellGeometry,
  createDustCellMaterial,
  createDustHexUniforms,
  createDustPointMaterial,
  createDustSoftMaterial,
  createDustTerrainMaterial,
  createDustTextures,
  createDustUniforms,
  dustDrawCount,
  dustHexRadiusMeters,
  dustSceneOrigin,
  dustTimestampLabel,
  setDustSolidDepth,
  syncDustUniforms,
  type DustHexField,
  type DustUniforms,
  type LoadedDustField,
} from "@/lib/dustStorm";
import { DEFAULT_FLOOD } from "@/lib/configIO";
import {
  advanceFloodFrame,
  bakedBuildingHeights,
  buildFloodSurfaceGeometry,
  createFloodBuildingMaskTexture,
  createFloodBuildingTexture,
  createFloodGridTexture,
  createFloodHeatmapMaterial,
  createFloodSurfaceMaterial,
  createFloodUniforms,
  floodCellAt,
  floodLocalFrame,
  floodRainAt,
  floodRainDuration,
  floodRainTotal,
  floodScenarioHeader,
  floodSceneOrigin,
  formatFloodLabel,
  formatFloodRainTime,
  mergeBuildingHeights,
  syncFloodUniforms,
  type FloodFrameState,
  type FloodRainSeries,
  type FloodUniforms,
  type LoadedFloodGrid,
} from "@/lib/flood";
import {
  FloodSim,
  floodSimHarborLevel,
  floodSimSteps,
  type FloodSimRun,
} from "@/lib/floodSim";
import { FloodFlowLines } from "@/lib/floodFlowLines";
import { FloodDisplayField } from "@/lib/floodDisplay";
import {
  BUILDING_MASK_SCALE,
  queryMapboxBuildings,
  rasterizeBuildingFootprints,
  rasterizeBuildingMask,
} from "@/lib/buildingMask";
import {
  createEmptyWaterMaskTexture,
  createWaterMaskTexture,
  extractWaterRings,
  mercatorTileRing,
  queryMapboxWater,
  rasterizeLngLatPolygons,
  type WaterTileId,
} from "@/lib/waterMask";

export type MarkerBuildParams = {
  points: VizPoint[];
  primitive: PrimitiveType;
  quality: GeometryQuality;
  icosphereSubdivisions: number;
  bevelEnabled: boolean;
  bevelSize: number;
  bevelSegments: number;
  baseScale: number;
  heightScale: number;
  colorMode: ColorMode;
  colorProperty: string | null;
  colorRamp: string[];
  opacityRandomMin: number;
  opacityRandomMax: number;
  lod: MarkerLodSettings;
  flagAura: FlagAuraSettings;
};

export type AreaBuildParams = {
  areas: VizArea[];
  baseHeight: number;
  extrusionScale: number;
  bevelEnabled: boolean;
  bevelSize: number;
  bevelSegments: number;
  colorMode: ColorMode;
  colorProperty: string | null;
  colorRamp: string[];
  opacityRandomMin: number;
  opacityRandomMax: number;
};

export type WaterGradientBuildParams = {
  points: VizPoint[];
  settings: WaterGradientSettings;
  colorMode: ColorMode;
  colorProperty: string | null;
  colorRamp: string[];
  fallbackWater?: GeoJSON.GeoJSON | null;
};

export type OilSpillBuildParams = {
  tracks: OilSpillTracks;
  settings: OilSpillSettings;
  fallbackWater?: GeoJSON.GeoJSON | null;
};

export type DustStormBuildParams = {
  field: LoadedDustField;
  settings: DustStormSettings;
};

export type FloodBuildParams = {
  grid: LoadedFloodGrid;
  settings: FloodSettings;
};

export type FloodReadout = {
  label: string;
  /** Harbor level in `datum` meters. */
  level: number;
  datum: string;
  frame: number;
  frameCount: number;
  simSeconds: number;
  /** Cells in the building raster that came from Mapbox tiles. */
  mapboxBuildingCells: number;
  /** Overlap of the bathtub Sandy peak with the observed inundation zone. */
  validationIou: number | null;
  /** Recorded storm playback, when the cloudburst sim runs one. */
  rain: { label: string; clock: string; mmPerHour: number; totalMm: number; done: boolean } | null;
};

export type WaterMaskStatus = "idle" | "ready" | "empty";

const FLOOD_TERRAIN_SOURCE = "flood-terrain-dem";

export type ThreeLayerApi = {
  layer: CustomLayerInterface;
  setMarkers: (params: MarkerBuildParams) => void;
  setAreas: (params: AreaBuildParams) => void;
  setWaterGradients: (params: WaterGradientBuildParams) => void;
  setOilSpill: (params: OilSpillBuildParams) => void;
  setDustStorm: (params: DustStormBuildParams) => void;
  setFlood: (params: FloodBuildParams) => void;
  applyMaterial: (settings: MaterialSettings) => void;
  applyLighting: (settings: LightingSettings) => void;
  applyRenderer: (settings: RendererSettings) => void;
  applyZoomScaling: (settings: AdaptiveZoomSettings) => void;
  applyWaterGradient: (settings: WaterGradientSettings) => void;
  applyOilSpill: (settings: OilSpillSettings) => void;
  applyDustStorm: (settings: DustStormSettings) => void;
  applyFlood: (settings: FloodSettings) => void;
  seekFlood: (frame: number) => void;
  resetFloodSim: () => void;
  getFloodReadout: () => FloodReadout | null;
  applyMarkerLod: (settings: MarkerLodSettings) => void;
  applyFlagAura: (settings: FlagAuraSettings) => void;
  getFps: () => number;
  getInstanceCount: () => number;
  getLodStats: () => {
    full3d: number;
    lod2d: number;
    geometry?: number[];
  };
  getContactShadowStats: () => ContactShadowStats;
  getFlagAuraBloomStats: () => FlagAuraBloomStats;
  getFlagOutlineStats: () => FlagOutlineStats;
  getWaterMaskStatus: () => WaterMaskStatus;
  getOilSpillHour: () => number;
  seekOilSpill: (frame: number) => void;
  getDustStormFrame: () => number;
  getDustStormLabel: () => string;
  pickBeacon: (cssX: number, cssY: number) => { lng: number; lat: number } | null;
  dispose: () => void;
};

const TONE_MAP: Record<ToneMappingName, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

const SHADOW_MAP: Record<ShadowMapTypeName, THREE.ShadowMapType> = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  pcfsoft: THREE.PCFSoftShadowMap,
  vsm: THREE.VSMShadowMap,
};

const COLOR_SPACE: Record<
  RendererSettings["outputColorSpace"],
  THREE.ColorSpace
> = {
  srgb: THREE.SRGBColorSpace,
  "srgb-linear": THREE.LinearSRGBColorSpace,
  linear: THREE.LinearSRGBColorSpace,
};

export function createMapboxThreeLayer(map: MapboxMap): ThreeLayerApi {
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const lights = createSceneLights();
  scene.add(
    lights.ambient,
    lights.directional,
    lights.directional2,
    lights.cameraFill,
    lights.cameraFill.target,
    lights.hemisphere,
    lights.point,
    lights.spot,
    lights.spot.target,
  );

  let renderer: THREE.WebGLRenderer | null = null;
  let markers: THREE.InstancedMesh | null = null;
  let markerLodMeshes: THREE.InstancedMesh[] = [];
  let markerTicks: THREE.InstancedMesh | null = null;
  let flagAura: THREE.InstancedMesh | null = null;
  let flagBeacon: THREE.InstancedMesh | null = null;
  let flagBeaconPool: THREE.InstancedMesh | null = null;
  let preparedMarkers: PreparedMarkerInstance[] = [];
  let markerFlagSources: FlagAuraSource[] = [];
  let markerLngLats: Array<{ lng: number; lat: number }> = [];
  let beaconPickTargets: BeaconPickTarget[] = [];
  const _pickClip = new THREE.Vector4();
  let flagAuraSettings: FlagAuraSettings = { ...DEFAULT_FLAG_AURA };
  let markerLodSettings: MarkerLodSettings = { ...DEFAULT_MARKER_LOD };
  let lastLodKey = "";
  let lodStats: {
    full3d: number;
    lod2d: number;
    geometry?: number[];
  } = { full3d: 0, lod2d: 0 };
  let areas: THREE.Mesh | null = null;
  let waterGradients: THREE.InstancedMesh | null = null;
  let waterStems: THREE.InstancedMesh | null = null;
  let oilBlob: OilBlob | null = null;
  let oilKernelMeters = DEFAULT_OIL_SPILL.radiusMeters;
  let oilFrameCount = 1;
  let oilSimFrame = 0;
  let oilLastMs = 0;
  let oilPlaying = DEFAULT_OIL_SPILL.playing;
  let oilHoursPerSecond = DEFAULT_OIL_SPILL.hoursPerSecond;
  let dustField: LoadedDustField | null = null;
  let dustPoints: THREE.Points | null = null;
  let dustCells: THREE.Mesh | null = null;
  let dustCellsExtruded = false;
  let dustHexCells: THREE.Mesh | null = null;
  let dustHexExtruded = false;
  let dustHexField: DustHexField | null = null;
  let dustHexRadius = Number.NaN;
  let dustSoft: THREE.Mesh | null = null;
  let dustTerrain: THREE.Mesh | null = null;
  let dustPointMaterial: THREE.ShaderMaterial | null = null;
  let dustCellMaterial: THREE.ShaderMaterial | null = null;
  let dustHexMaterial: THREE.ShaderMaterial | null = null;
  let dustSoftMaterial: THREE.ShaderMaterial | null = null;
  let dustTerrainMaterial: THREE.ShaderMaterial | null = null;
  let dustFieldTex: THREE.DataArrayTexture | null = null;
  let dustWindTex: THREE.DataArrayTexture | null = null;
  let dustUniforms: DustUniforms | null = null;
  let dustFrame = 0;
  let dustLastMs = 0;
  let dustPlaying = DEFAULT_DUST_STORM.playing;
  let dustHoursPerSecond = DEFAULT_DUST_STORM.hoursPerSecond;
  let dustFrameCount = 1;
  let dustSeekFrame = DEFAULT_DUST_STORM.frame;
  let dustParticlesPerCell = DEFAULT_DUST_STORM.particlesPerCell;
  let dustPlacement = DEFAULT_DUST_STORM.placement;
  let dustSettings: DustStormSettings = { ...DEFAULT_DUST_STORM };
  let floodGrid: LoadedFloodGrid | null = null;
  let floodSettings: FloodSettings = { ...DEFAULT_FLOOD };
  let floodUniforms: FloodUniforms | null = null;
  let floodGridTex: THREE.DataTexture | null = null;
  let floodBuildingTex: THREE.DataTexture | null = null;
  let floodHeatmap: THREE.Mesh | null = null;
  let floodSurface: THREE.Mesh | null = null;
  let floodBakedHeights: Float32Array | null = null;
  let floodMapboxHeights: Float32Array | null = null;
  let floodHeights: Float32Array | null = null;
  let floodMapboxCells = 0;
  let floodMaskData: Uint8Array | null = null;
  let floodMaskTex: THREE.DataTexture | null = null;
  let floodFrame = DEFAULT_FLOOD.frame;
  let floodSeekFrame = DEFAULT_FLOOD.frame;
  let floodLastMs = 0;
  let floodState: FloodFrameState | null = null;
  let floodSim: FloodSim | null = null;
  let floodFlowLines: FloodFlowLines | null = null;
  let floodDisplay: FloodDisplayField | null = null;
  /** Wall-clock seconds the sim advanced this frame, 0 when it held still. */
  let floodSimFrameSeconds = 0;
  let floodSimKey = "";
  let floodSimLastMs = 0;
  /** Recorded-storm clock; runs time-lapse times faster than the sim clock. */
  let floodStormSeconds = 0;
  let floodBreachCell: { col: number; row: number } | null = null;
  let floodBuildingTimer = 0;
  let floodBuildingListener = false;
  let floodTerrainOwned = false;
  let markersGeneration = 0;
  const material = createMarkerMaterial();
  const waterGradientMaterial = createWaterGradientMaterial(
    DEFAULT_WATER_GRADIENT,
  );
  const waterStemMaterial = createWaterStemMaterial(DEFAULT_WATER_GRADIENT);
  const oilSpillMaterial = createOilSpillMaterial(DEFAULT_OIL_SPILL);
  const oilScene = new THREE.Scene();
  const pathScene = new THREE.Scene();
  const oilSmooth = new OilSpillSmooth();
  const dustSoftScene = new THREE.Scene();
  const dustSoftFrost = new DustSoftFrost();
  let dustSoftField: DustSoftField | null = null;
  const flagAuraMaterial = createFlagAuraMaterial(DEFAULT_FLAG_AURA);
  const flagBeaconMaterial = createFlagBeaconMaterial(DEFAULT_FLAG_AURA);
  const flagBeaconPoolMaterial = createFlagBeaconPoolMaterial(DEFAULT_FLAG_AURA);
  const markerMaskMaterial = createFlagMaskMaterial(DEFAULT_FLAG_AURA);
  const areaMaskMaterial = createAreaMaskMaterial();
  const discMaskMaterial = createDiscMaskMaterial(
    DEFAULT_WATER_GRADIENT.radiusMeters,
    WATER_GRADIENT_ALTITUDE,
  );
  let origin: SceneOrigin = createSceneOrigin(0, 0, 0);
  let modelMatrix = buildModelTransformMatrix(origin);
  let frustumCulled = true;
  let instanceCount = 0;
  let envMap: THREE.Texture | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  let lightingState: LightingSettings | null = null;
  let adaptiveZoomSettings: AdaptiveZoomSettings = {
    enabled: false,
    minPixels: 8,
    maxPixels: 64,
    collisionAware: true,
  };
  let lastAdaptiveKey = "";
  const fps = new FpsSampler();
  const _sunDir = new THREE.Vector3();
  const _camLocal = new THREE.Vector3();
  const _camLookAt = new THREE.Vector3();
  const _lodCenter = new THREE.Vector3();
  let fallbackWaterRings: Array<Array<[number, number]>> = [];
  let maskPoints: VizPoint[] = [];
  let maskRadiusMeters = DEFAULT_WATER_GRADIENT.radiusMeters;
  let waterMaskStatus: WaterMaskStatus = "idle";
  let maskCoverageKey = "";
  let maskListenersAttached = false;
  let maskRebuildTimer = 0;

  const contactShadows = new ContactShadowAtlas(
    contactShadowSettingsFromLighting(DEFAULT_LIGHTING),
  );
  scene.add(contactShadows.group);
  const flagAuraBloom = new FlagAuraBloom();
  const flagOutline = new FlagOutline();

  const scratchProjection = new THREE.Matrix4();
  const scratchFinal = new THREE.Matrix4();

  function ensureEnvironment(enabled: boolean, intensity: number) {
    if (!renderer) return;
    if (enabled) {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      if (!envMap) {
        const room = new RoomEnvironment();
        envMap = pmrem.fromScene(room, 0.04).texture;
      }
      scene.environment = envMap;
      scene.environmentIntensity = intensity;
    } else {
      scene.environment = null;
      scene.environmentIntensity = 1;
    }
  }

  function syncContactFromLighting(settings: LightingSettings) {
    contactShadows.applySettings(contactShadowSettingsFromLighting(settings));
    contactShadows.setSunDirection(getSunDirection(settings, _sunDir));
  }

  function syncAdaptiveZoom(force = false) {
    const state = makeAdaptiveZoomUniformState(
      map.getZoom(),
      origin.lat,
      adaptiveZoomSettings,
    );
    const key = [
      state.enabled ? 1 : 0,
      state.metersPerPixel,
      state.minPixels,
      state.maxPixels,
      state.collisionAware ? 1 : 0,
    ].join(":");
    if (!force && key === lastAdaptiveKey) return;
    lastAdaptiveKey = key;
    setAdaptiveZoomUniforms(material, state);
    setFlagAuraAdaptiveUniforms(flagAuraMaterial, state);
    setFlagAuraAdaptiveUniforms(flagBeaconMaterial, state);
    setFlagAuraAdaptiveUniforms(flagBeaconPoolMaterial, state);
    setFlagAuraAdaptiveUniforms(markerMaskMaterial, state);
    setAreaMaskAdaptiveUniforms(areaMaskMaterial, state);
    contactShadows.setAdaptiveZoomState(state);
    if (waterStems) {
      applyWaterStemZoom(
        waterStemMaterial,
        map.getZoom(),
        state.metersPerPixel,
      );
    }
  }

  function clearWaterGradients() {
    disposeWaterGradients(waterGradients);
    waterGradients = null;
    disposeWaterStems(waterStems);
    waterStems = null;
    maskPoints = [];
    fallbackWaterRings = [];
    waterMaskStatus = "idle";
    detachMaskListeners();
    applyWaterMaskToMaterial(
      waterGradientMaterial,
      createEmptyWaterMaskTexture(),
    );
  }

  function clearDustStorm() {
    if (dustPoints) {
      scene.remove(dustPoints);
      dustPoints.geometry.dispose();
      dustPoints = null;
    }
    if (dustCells) {
      scene.remove(dustCells);
      dustCells.geometry.dispose();
      dustCells = null;
    }
    clearDustHex();
    if (dustSoft) {
      dustSoftScene.remove(dustSoft);
      dustSoft.geometry.dispose();
      dustSoft = null;
    }
    if (dustTerrain) {
      scene.remove(dustTerrain);
      dustTerrain.geometry.dispose();
      dustTerrain = null;
    }
    dustSoftField?.dispose();
    dustSoftField = null;
    dustPointMaterial?.dispose();
    dustCellMaterial?.dispose();
    dustSoftMaterial?.dispose();
    dustTerrainMaterial?.dispose();
    dustPointMaterial = null;
    dustCellMaterial = null;
    dustSoftMaterial = null;
    dustTerrainMaterial = null;
    dustFieldTex?.dispose();
    dustWindTex?.dispose();
    dustFieldTex = null;
    dustWindTex = null;
    dustUniforms = null;
    dustField = null;
    dustFrame = 0;
    dustLastMs = 0;
    dustFrameCount = 1;
  }

  function clearDustHex() {
    if (dustHexCells) {
      scene.remove(dustHexCells);
      dustHexCells.geometry.dispose();
      dustHexCells = null;
    }
    dustHexMaterial?.dispose();
    dustHexMaterial = null;
    dustHexField?.texture.dispose();
    dustHexField = null;
    dustHexRadius = Number.NaN;
  }

  function replaceDustMesh(
    current: THREE.Mesh | null,
    geometry: THREE.BufferGeometry,
    meshMaterial: THREE.ShaderMaterial,
  ): THREE.Mesh {
    if (current) {
      scene.remove(current);
      current.geometry.dispose();
    }
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    return mesh;
  }

  /** Builds cell meshes on demand. Hexes rebuild only when their size changes. */
  function syncDustCells(settings: DustStormSettings) {
    if (!dustField || !dustUniforms || !dustCellMaterial) return;
    const extruded = settings.heatmapExtruded;
    const cellsOn = settings.view === "squares";
    if (!dustCells || dustCellsExtruded !== extruded) {
      dustCells = replaceDustMesh(
        dustCells,
        buildDustSquareCellGeometry(dustField, origin, extruded),
        dustCellMaterial,
      );
      dustCellsExtruded = extruded;
    }
    if (cellsOn && settings.cellShape === "hex") {
      const radius = dustHexRadiusMeters(dustField, settings.hexSizeCells);
      if (!dustHexField || Math.abs(radius - dustHexRadius) > 1e-3) {
        clearDustHex();
        dustHexField = buildDustHexField(dustField, origin, radius);
        dustHexMaterial = createDustCellMaterial(
          createDustHexUniforms(dustUniforms, dustHexField),
        );
        dustHexRadius = radius;
      }
      if (!dustHexCells || dustHexExtruded !== extruded) {
        dustHexCells = replaceDustMesh(
          dustHexCells,
          buildDustHexCellGeometry(dustHexField.layout, extruded),
          dustHexMaterial!,
        );
        dustHexExtruded = extruded;
      }
    }
    setDustSolidDepth(dustCellMaterial, extruded);
    if (dustHexMaterial) setDustSolidDepth(dustHexMaterial, extruded);
  }

  function applyDustVisibility(settings: DustStormSettings) {
    const particlesOn = settings.view === "particles";
    const cellsOn = settings.view === "squares";
    const hex = settings.cellShape === "hex";
    const softOn = settings.view === "soft";
    if (dustPoints) dustPoints.visible = particlesOn;
    if (dustCells) dustCells.visible = cellsOn && !hex;
    if (dustHexCells) dustHexCells.visible = cellsOn && hex;
    if (dustSoft) dustSoft.visible = softOn && !settings.heatmapExtruded;
    if (dustTerrain) dustTerrain.visible = softOn && settings.heatmapExtruded;
  }

  function clearOilSpillMesh() {
    disposeOilBlob(oilBlob);
    oilBlob = null;
    oilFrameCount = 1;
    oilSimFrame = 0;
    oilLastMs = 0;
    clearDustStorm();
    clearFlood();
  }

  function clearFlood() {
    detachFloodBuildingListener();
    for (const mesh of [floodHeatmap, floodSurface]) {
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    floodHeatmap = null;
    floodSurface = null;
    const simState = floodUniforms?.uSimState.value;
    if (simState && simState !== floodSim?.texture) simState.dispose();
    if (floodFlowLines) {
      scene.remove(floodFlowLines.mesh);
      floodFlowLines.dispose();
      floodFlowLines = null;
    }
    floodSim?.dispose();
    floodSim = null;
    floodDisplay?.dispose();
    floodDisplay = null;
    floodSimKey = "";
    floodSimLastMs = 0;
    floodUniforms = null;
    floodGridTex?.dispose();
    floodBuildingTex?.dispose();
    floodGridTex = null;
    floodBuildingTex = null;
    floodBakedHeights = null;
    floodMapboxHeights = null;
    floodMaskTex?.dispose();
    floodMaskTex = null;
    floodMaskData = null;
    floodHeights = null;
    floodMapboxCells = 0;
    floodGrid = null;
    floodState = null;
    floodLastMs = 0;
    floodBreachCell = null;
    syncFloodTerrain(false, 1);
  }

  /** Mapbox terrain is only switched on for the flood scene, and only off again if the flood turned it on. */
  function syncFloodTerrain(enabled: boolean, exaggeration: number) {
    if (enabled) {
      if (!map.getSource(FLOOD_TERRAIN_SOURCE)) {
        map.addSource(FLOOD_TERRAIN_SOURCE, {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: FLOOD_TERRAIN_SOURCE, exaggeration });
      floodTerrainOwned = true;
    } else if (floodTerrainOwned) {
      map.setTerrain(null);
      floodTerrainOwned = false;
    }
  }

  function refreshFloodBuildings() {
    if (!floodGrid || !floodBakedHeights || !floodHeights || !floodBuildingTex) return;
    if (floodSettings.buildingSource !== "baked") {
      const footprints = queryMapboxBuildings(map);
      if (footprints.length > 0) {
        const buildingGrid = { cols: floodGrid.cols, rows: floodGrid.rows, ...floodGrid.bounds };
        floodMapboxHeights ??= new Float32Array(floodHeights.length);
        rasterizeBuildingFootprints(buildingGrid, footprints, floodMapboxHeights);
        floodMapboxCells = 0;
        for (const height of floodMapboxHeights) if (height > 0) floodMapboxCells += 1;
        const width = floodGrid.cols * BUILDING_MASK_SCALE;
        const height = floodGrid.rows * BUILDING_MASK_SCALE;
        floodMaskData ??= new Uint8Array(width * height * 2);
        rasterizeBuildingMask(buildingGrid, footprints, floodMapboxHeights, BUILDING_MASK_SCALE, floodMaskData);
        if (!floodMaskTex) {
          floodMaskTex = createFloodBuildingMaskTexture(floodMaskData, width, height);
          floodUniforms!.uBuildingMask.value = floodMaskTex;
        }
        floodMaskTex.needsUpdate = true;
      }
    }
    if (floodUniforms) {
      floodUniforms.uBuildingMaskOn.value =
        floodMaskTex && floodSettings.buildingSource !== "baked" ? 1 : 0;
    }
    mergeBuildingHeights(
      floodBakedHeights,
      floodMapboxHeights,
      floodSettings.buildingSource,
      floodHeights,
    );
    floodBuildingTex.needsUpdate = true;
    map.triggerRepaint();
  }

  function scheduleFloodBuildings() {
    if (!floodGrid) return;
    if (floodBuildingTimer) window.clearTimeout(floodBuildingTimer);
    floodBuildingTimer = window.setTimeout(() => {
      floodBuildingTimer = 0;
      refreshFloodBuildings();
    }, 300);
  }

  function attachFloodBuildingListener() {
    if (floodBuildingListener) return;
    floodBuildingListener = true;
    map.on("idle", scheduleFloodBuildings);
  }

  function detachFloodBuildingListener() {
    if (floodBuildingTimer) {
      window.clearTimeout(floodBuildingTimer);
      floodBuildingTimer = 0;
    }
    if (!floodBuildingListener) return;
    floodBuildingListener = false;
    map.off("idle", scheduleFloodBuildings);
  }

  function floodRecordedRain(): FloodRainSeries | null {
    return floodSettings.simSource === "rain" && floodSettings.simRainRecorded
      ? (floodGrid?.rain ?? null)
      : null;
  }

  function floodSimRun(): FloodSimRun {
    const mhhw = floodGrid?.datums.MHHW ?? 0.7;
    const source = floodSettings.simSource;
    const recorded = floodRecordedRain();
    const rainMmPerHour = recorded
      ? floodRainAt(recorded, floodStormSeconds) * floodSettings.simRainTimeLapse
      : floodSettings.simRainMmPerHour;
    return {
      harborLevel: floodSimHarborLevel(floodSettings, mhhw),
      rainMetersPerSecond: source === "rain" ? rainMmPerHour / 1000 / 3600 : 0,
      breachFlow: source === "breach" ? floodSettings.simBreachFlow : 0,
      breachCell: source === "breach" ? floodBreachCell : null,
    };
  }

  function resetFloodSim() {
    if (!floodGrid) return;
    const center = map.getCenter();
    floodBreachCell = floodCellAt(
      floodGrid,
      floodSettings.simBreachLng,
      floodSettings.simBreachLat,
    ) ??
      floodCellAt(floodGrid, center.lng, center.lat) ?? {
        col: Math.floor(floodGrid.cols / 2),
        row: Math.floor(floodGrid.rows / 2),
      };
    floodSim?.reset();
    floodFlowLines?.reset();
    floodSimLastMs = 0;
    floodStormSeconds = 0;
    map.triggerRepaint();
  }

  /** Runs in prerender so the sim passes never interrupt Mapbox's main framebuffer. */
  function stepFloodSim(activeRenderer: THREE.WebGLRenderer) {
    if (!floodGrid || !floodUniforms || !floodGridTex || !floodBuildingTex) return;
    floodSimFrameSeconds = 0;
    if (floodSettings.scenario !== "sim") {
      floodSimLastMs = 0;
      return;
    }
    if (!floodSim) {
      floodSim = new FloodSim(activeRenderer, floodGrid, floodGridTex, floodBuildingTex);
      floodSimKey = "";
    }
    const key =
      floodSettings.simSource === "breach"
        ? `breach:${floodSettings.simBreachLng}:${floodSettings.simBreachLat}`
        : floodSettings.simSource === "rain"
          ? `rain:${floodRecordedRain() ? "recorded" : "constant"}`
          : floodSettings.simSource;
    if (key !== floodSimKey) {
      floodSimKey = key;
      resetFloodSim();
    }
    const nowMs = performance.now();
    const frameSeconds =
      floodSimLastMs > 0 && floodSettings.playing
        ? Math.min(0.1, (nowMs - floodSimLastMs) / 1000)
        : 0;
    floodSimLastMs = nowMs;
    const run = floodSimRun();
    const { dt, steps } = floodSimSteps(
      frameSeconds,
      floodSettings.simSpeed,
      floodSettings.simSubsteps,
      floodSim.stableDt(run.harborLevel),
    );
    floodSim.step(activeRenderer, run, dt, steps);
    floodStormSeconds += dt * steps * floodSettings.simRainTimeLapse;
    floodSimFrameSeconds = steps > 0 ? frameSeconds : 0;
    floodUniforms.uSimState.value = floodSim.texture;
    if (floodSettings.flowLines) {
      if (!floodFlowLines) {
        floodFlowLines = new FloodFlowLines(
          activeRenderer,
          floodGrid,
          floodUniforms,
          floodLocalFrame(floodGrid, origin),
        );
        floodFlowLines.applySettings(floodSettings);
        scene.add(floodFlowLines.mesh);
      }
      floodFlowLines.update(activeRenderer, dt * steps);
    }
  }

  function updateFloodDisplay(activeRenderer: THREE.WebGLRenderer) {
    if (!floodGrid || !floodUniforms) return;
    if (!floodDisplay) {
      floodDisplay = new FloodDisplayField(activeRenderer, floodGrid, floodUniforms);
    }
    floodUniforms.uUseDisplay.value = floodSettings.edgeSmoothing > 0 ? 1 : 0;
    if (floodSettings.edgeSmoothing <= 0) return;
    const simActive = floodSettings.scenario === "sim" && floodSim !== null;
    floodDisplay.update(
      activeRenderer,
      floodUniforms,
      floodSettings.edgeSmoothing,
      simActive,
      floodSimFrameSeconds,
    );
  }

  function syncFloodFrame(nowMs: number) {
    if (!floodGrid || !floodUniforms) return;
    const dt =
      floodLastMs > 0 && floodSettings.playing
        ? Math.min(0.1, (nowMs - floodLastMs) / 1000)
        : 0;
    floodLastMs = nowMs;
    const simActive = floodSettings.scenario === "sim" && floodSim !== null;
    const header = floodScenarioHeader(floodGrid, floodSettings.scenario);
    if (!simActive && header && header.levels.length > 1 && dt > 0) {
      floodFrame = advanceFloodFrame(
        floodFrame,
        dt,
        floodSettings.hoursPerSecond,
        header.frameHours,
        header.levels.length,
      );
    }
    floodState = syncFloodUniforms(floodUniforms, {
      grid: floodGrid,
      settings: floodSettings,
      frame: floodFrame,
      zoom: map.getZoom(),
      timeSeconds: nowMs * 0.001,
      simActive,
    });
    floodUniforms.uCameraPos.value.copy(_camLocal);
    getSunDirection(lightingState ?? DEFAULT_LIGHTING, floodUniforms.uSunDir.value);
    if (floodHeatmap) floodHeatmap.visible = floodUniforms.uHeatmapAlpha.value > 0.001;
    if (floodSurface) floodSurface.visible = floodUniforms.uSurfaceAlpha.value > 0.001;
    if (floodFlowLines) floodFlowLines.mesh.visible = simActive && floodSettings.flowLines;
  }

  function floodReadout(): FloodReadout | null {
    if (!floodGrid) return null;
    const header = floodScenarioHeader(floodGrid, floodSettings.scenario);
    const sim = floodSettings.scenario === "sim";
    const simSeconds = floodSim?.simSeconds ?? 0;
    const hours = Math.floor(simSeconds / 3600);
    const minutes = Math.floor((simSeconds % 3600) / 60);
    const seconds = Math.floor(simSeconds % 60);
    const clock =
      hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
    const recorded = sim ? floodRecordedRain() : null;
    return {
      label: sim ? `Sim +${clock}` : formatFloodLabel(floodState?.label ?? ""),
      level: sim ? floodSimRun().harborLevel : (floodState?.level ?? 0),
      datum: floodGrid.datum,
      frame: floodFrame,
      frameCount: header?.levels.length ?? 1,
      simSeconds,
      mapboxBuildingCells: floodMapboxCells,
      validationIou: floodGrid.validation?.iou ?? null,
      rain: recorded
        ? {
            label: recorded.label,
            clock: formatFloodRainTime(recorded, floodStormSeconds),
            mmPerHour: floodRainAt(recorded, floodStormSeconds),
            totalMm: floodRainTotal(recorded, floodStormSeconds),
            done: floodStormSeconds >= floodRainDuration(recorded),
          }
        : null,
    };
  }

  function rebuildWaterMask() {
    if ((!waterGradients && !oilBlob) || !maskPoints.length) {
      waterMaskStatus = "idle";
      return;
    }
    const bounds = maskBoundsForPoints(origin, maskPoints, maskRadiusMeters);
    if (!bounds) {
      waterMaskStatus = "empty";
      const empty = createEmptyWaterMaskTexture();
      if (oilBlob) applyOilSpillMask(oilSpillMaterial, empty);
      else applyWaterMaskToMaterial(waterGradientMaterial, empty);
      map.triggerRepaint();
      return;
    }
    const queried =
      fallbackWaterRings.length > 0
        ? { polygons: [fallbackWaterRings], tiles: [] as WaterTileId[] }
        : queryMapboxWater(map);
    const tileKey = queried.tiles
      .map((tile) => `${tile.z}/${tile.x}/${tile.y}`)
      .sort()
      .join("|");
    const coverageKey = [
      bounds.minX.toFixed(0),
      bounds.minZ.toFixed(0),
      bounds.maxX.toFixed(0),
      bounds.maxZ.toFixed(0),
      tileKey,
    ].join(":");
    if (coverageKey === maskCoverageKey && waterMaskStatus === "ready") return;
    maskCoverageKey = coverageKey;
    const raster = rasterizeLngLatPolygons(
      queried.polygons,
      origin,
      bounds,
      undefined,
      queried.tiles.map((tile) => mercatorTileRing(tile.z, tile.x, tile.y)),
    );
    const texture = createWaterMaskTexture(raster);
    if (oilBlob) applyOilSpillMask(oilSpillMaterial, texture);
    else applyWaterMaskToMaterial(waterGradientMaterial, texture);
    waterMaskStatus = raster.hasWater ? "ready" : "empty";
    map.triggerRepaint();
  }

  function scheduleWaterMaskRebuild() {
    if (!waterGradients && !oilBlob) return;
    if (maskRebuildTimer) window.clearTimeout(maskRebuildTimer);
    maskRebuildTimer = window.setTimeout(() => {
      maskRebuildTimer = 0;
      rebuildWaterMask();
    }, 250);
  }

  function attachMaskListeners() {
    if (maskListenersAttached) return;
    maskListenersAttached = true;
    map.on("idle", scheduleWaterMaskRebuild);
  }

  function detachMaskListeners() {
    if (!maskListenersAttached) return;
    maskListenersAttached = false;
    map.off("idle", scheduleWaterMaskRebuild);
    if (maskRebuildTimer) {
      window.clearTimeout(maskRebuildTimer);
      maskRebuildTimer = 0;
    }
  }

  const layer: CustomLayerInterface = {
    id: "three-instanced-markers",
    type: "custom",
    renderingMode: "3d",
    onAdd(_map: MapboxMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGLRenderingContext,
        antialias: true,
      });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.transmissionResolutionScale = 0.5;
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      if (lightingState) {
        ensureEnvironment(
          lightingState.environmentEnabled,
          lightingState.environmentIntensity,
        );
        syncContactFromLighting(lightingState);
      }
    },
    prerender() {
      if (!renderer) return;
      syncAdaptiveZoom();
      applyMarkerLodPartition();
      contactShadows.prerender(
        renderer,
        scene,
        markerShadowCaster(),
        map,
        origin,
      );
      stepFloodSim(renderer);
      updateFloodDisplay(renderer);
      renderer.resetState();
    },
    render(_gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: number[]) {
      if (!renderer) return;

      syncAdaptiveZoom();
      applyMarkerLodPartition();
      // Keep fresnel rim locked to the real Mapbox camera (view matrix is identity here).
      mapCameraToLocalMeters(map, origin, _camLocal);
      setFresnelCameraPosition(material, _camLocal);
      setFlagAuraCameraPosition(flagAuraMaterial, _camLocal);
      setFlagAuraCameraPosition(flagBeaconMaterial, _camLocal);
      if (lights.cameraFill.visible) {
        const center = map.getCenter();
        lngLatToLocalMeters(origin, center.lng, center.lat, 0, _camLookAt);
        updateCameraFillLight(lights.cameraFill, _camLocal, _camLookAt);
      }

      scratchProjection.fromArray(matrix);
      scratchFinal.copy(scratchProjection).multiply(modelMatrix);
      camera.projectionMatrix.copy(scratchFinal);
      if (waterGradients && waterGradientNeedsAnimation(waterGradientMaterial)) {
        setWaterGradientTime(waterGradientMaterial, performance.now() * 0.001);
      }
      if (oilBlob) {
        const nowMs = performance.now();
        const dt =
          oilLastMs > 0 && oilPlaying
            ? Math.min(0.1, (nowMs - oilLastMs) / 1000)
            : 0;
        if (dt > 0 && oilHoursPerSecond > 0) {
          oilSimFrame =
            (oilSimFrame + dt * oilHoursPerSecond) % Math.max(1, oilFrameCount);
        }
        oilLastMs = nowMs;
        updateOilBlob(
          oilBlob,
          oilSpillMaterial,
          oilSimFrame,
          oilKernelMeters,
          dt,
        );
        setOilSpillTime(oilSpillMaterial, nowMs * 0.001);
        setOilSpillCamera(oilSpillMaterial, _camLocal);
        setOilPathwayTime(oilBlob, nowMs * 0.001);
        const oilMetersPerPixel = metersPerPixelAtLatitude(
          map.getZoom(),
          origin.lat,
        );
        setOilPathwayZoom(oilBlob, oilMetersPerPixel);
        setOilStemZoom(oilBlob, map.getZoom(), oilMetersPerPixel);
        setOilParticleZoom(oilBlob, oilMetersPerPixel);
      }
      if (dustField && dustUniforms) {
        const nowMs = performance.now();
        const dt =
          dustLastMs > 0 && dustPlaying
            ? Math.min(0.1, (nowMs - dustLastMs) / 1000)
            : 0;
        if (dt > 0 && dustHoursPerSecond > 0) {
          dustFrame = (dustFrame + dt * dustHoursPerSecond) % Math.max(1, dustFrameCount);
        }
        dustLastMs = nowMs;
        const canvas = map.getCanvas();
        syncDustUniforms(
          dustUniforms,
          dustField,
          dustSettings,
          dustFrame,
          nowMs * 0.001,
          canvas.width,
          canvas.height,
          metersPerPixelAtLatitude(map.getZoom(), map.getCenter().lat),
          canvas.width / Math.max(1, canvas.clientWidth),
        );
        applyDustVisibility(dustSettings);
        const dustParticlesOn = dustSettings.view === "particles";
        if ((dustParticlesOn || dustSettings.view === "soft") && dustSoftField) {
          // Particles re-shape the blurred value with a power curve, which
          // pulls a one-cell feather back into a step. Spread a little wider
          // so a high reading falls off as a gradient.
          const fieldBlur = dustParticlesOn
            ? dustSettings.blurCells * 3.2
            : dustSettings.blurCells;
          dustSoftField.update(renderer, fieldBlur);
          dustUniforms.uSoftField.value = dustSoftField.texture;
        }
        // The frost capture has no depth buffer, so terrain skips it.
        if (
          dustSettings.view === "soft" &&
          !dustSettings.heatmapExtruded &&
          dustSoft &&
          dustSoftField &&
          dustSoftMaterial
        ) {
          dustUniforms.uReadFrost.value = 0;
          dustSoftMaterial.depthTest = false;
          dustSoftMaterial.blending = THREE.NoBlending;
          dustSoftFrost.captureAndBlur(renderer, dustSoftScene, camera);
          dustUniforms.uFrost.value = dustSoftFrost.texture;
          dustUniforms.uReadFrost.value = 1;
          dustSoftMaterial.depthTest = true;
          dustSoftMaterial.blending = THREE.NormalBlending;
        }
      }
      if (floodGrid) syncFloodFrame(performance.now());
      const outlineOn = outlineIsActive();
      if (flagAura) {
        flagAura.visible =
          !outlineOn && flagAuraSettings.animation !== "pillar";
      }
      syncPillarBottomLight();
      const beaconOn =
        !outlineOn && flagAuraSettings.animation === "pillar";
      if (flagBeacon) flagBeacon.visible = beaconOn;
      if (flagBeaconPool) flagBeaconPool.visible = beaconOn;
      const nowSeconds = performance.now() * 0.001;
      if (!outlineOn && flagAura && flagAuraNeedsAnimation(flagAuraSettings)) {
        setFlagAuraTime(flagAuraMaterial, nowSeconds);
        setFlagAuraTime(flagBeaconMaterial, nowSeconds);
        setFlagAuraTime(flagBeaconPoolMaterial, nowSeconds);
      }
      if (beaconOn) {
        const canvas = map.getCanvas();
        setFlagBeaconScreen(
          flagBeaconMaterial,
          flagAuraSettings.pillarBeaconSize,
          flagAuraSettings.pillarStemSize ?? 64,
          canvas.width,
          canvas.height,
          canvas.clientWidth,
        );
        setFlagBeaconPoolStemPresence(
          flagBeaconPoolMaterial,
          flagAuraSettings.pillarStemSize ?? 64,
        );
      }
      if (!outlineOn && flagAura && flagAuraSettings.bloomEnabled) {
        flagAuraBloom.captureAndBlur(
          renderer,
          scene,
          camera,
          true,
          flagAuraSettings.bloomStrength,
          flagAuraSettings.bloomRadius,
          flagAuraSettings.bloomResolution,
        );
      } else {
        flagAuraBloom.disable();
      }
      if (outlineOn) {
        setDiscMaskRadius(discMaskMaterial, maskRadiusMeters);
        flagOutline.captureAndBlur(
          renderer,
          camera,
          collectOutlineDraws(),
          flagAuraSettings,
          nowSeconds,
          map.getZoom(),
        );
      } else {
        flagOutline.disable();
      }
      renderer.resetState();
      renderer.autoClear = false;
      renderer.render(scene, camera);
      if (
        dustSettings.view === "soft" &&
        !dustSettings.heatmapExtruded &&
        dustSoft &&
        dustSoftField &&
        dustUniforms
      ) {
        renderer.autoClear = false;
        renderer.render(dustSoftScene, camera);
      }
      if (oilBlob) {
        oilSmooth.present(renderer, camera, oilScene);
        renderer.autoClear = false;
        renderer.render(pathScene, camera);
      }
      if (outlineOn) {
        flagOutline.composite(renderer);
      } else if (flagAura && flagAuraSettings.bloomEnabled) {
        flagAuraBloom.composite(renderer);
      }
      renderer.resetState();
      fps.tick();
      if (
        (waterGradients && waterGradientNeedsAnimation(waterGradientMaterial)) ||
        oilBlob !== null ||
        dustField !== null ||
        floodGrid !== null ||
        (!outlineOn && flagAura && flagAuraNeedsAnimation(flagAuraSettings)) ||
        (outlineOn && flagOutlineNeedsAnimation(flagAuraSettings))
      ) {
        map.triggerRepaint();
      }
    },
    onRemove() {
      detachMaskListeners();
      disposeInstancedMesh(markers);
      markers = null;
      disposeMarkerLodMeshes();
      disposeBearingTriangles(markerTicks);
      markerTicks = null;
      disposeFlagAura(flagAura);
      flagAura = null;
      disposeFlagAura(flagBeacon);
      flagBeacon = null;
      disposeFlagAura(flagBeaconPool);
      flagBeaconPool = null;
      preparedMarkers = [];
      markerFlagSources = [];
      markerLngLats = [];
      beaconPickTargets = [];
      disposeExtrudedAreas(areas);
      areas = null;
      disposeWaterGradients(waterGradients);
      waterGradients = null;
      disposeWaterStems(waterStems);
      waterStems = null;
      clearOilSpillMesh();
      disposeWaterGradientMaterial(waterGradientMaterial);
      disposeOilSpillMaterial(oilSpillMaterial);
      oilSmooth.dispose();
      dustSoftFrost.dispose();
      dustSoftField?.dispose();
      dustSoftField = null;
      waterStemMaterial.dispose();
      flagAuraMaterial.dispose();
      flagBeaconMaterial.dispose();
      flagBeaconPoolMaterial.dispose();
      markerMaskMaterial.dispose();
      areaMaskMaterial.dispose();
      discMaskMaterial.dispose();
      material.dispose();
      contactShadows.dispose();
      flagAuraBloom.dispose();
      flagOutline.dispose();
      envMap?.dispose();
      envMap = null;
      pmrem?.dispose();
      pmrem = null;
      renderer = null;
    },
  };

  function clearFlagBeaconMesh() {
    disposeFlagAura(flagBeacon);
    flagBeacon = null;
    disposeFlagAura(flagBeaconPool);
    flagBeaconPool = null;
  }

  function clearFlagAuraMesh() {
    disposeFlagAura(flagAura);
    flagAura = null;
    clearFlagBeaconMesh();
    beaconPickTargets = [];
  }

  function rebuildBeaconPickTargets(indices: readonly number[]) {
    beaconPickTargets = [];
    if (!flagAuraSettings.enabled || flagAuraSettings.animation !== "pillar") return;
    const coverage = flagAuraSettings.coverage ?? 1;
    for (const index of indices) {
      const item = preparedMarkers[index];
      const source = markerFlagSources[index];
      const coord = markerLngLats[index];
      if (!item || !source || !coord) continue;
      if (!isLookdevFlagCovered(source.id, coverage)) continue;
      beaconPickTargets.push({
        lng: coord.lng,
        lat: coord.lat,
        x: item.x,
        y: item.y,
        z: item.z,
        sy: item.sy,
        adaptiveSize: item.adaptiveSize,
        scaleCap: item.scaleCap,
      });
    }
  }

  function pickBeacon(
    cssX: number,
    cssY: number,
  ): { lng: number; lat: number } | null {
    if (
      !flagAuraSettings.enabled ||
      flagAuraSettings.animation !== "pillar" ||
      beaconPickTargets.length === 0
    ) {
      return null;
    }
    const canvas = map.getCanvas();
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const zoomState = makeAdaptiveZoomUniformState(
      map.getZoom(),
      origin.lat,
      adaptiveZoomSettings,
    );
    const objectTop =
      (flagBeaconMaterial.uniforms.uObjectTop as { value: number } | undefined)
        ?.value ?? 1;
    const head = flagAuraSettings.pillarBeaconSize;
    const stem = flagAuraSettings.pillarStemSize ?? 64;
    let best: { lng: number; lat: number } | null = null;
    let bestScore = Infinity;
    for (const target of beaconPickTargets) {
      const factor = applyCollisionScaleCap(
        adaptiveScaleFactor(
          target.adaptiveSize,
          zoomState.metersPerPixel,
          adaptiveZoomSettings,
        ),
        target.scaleCap,
        zoomState.collisionAware,
      );
      const anchorY = beaconAnchorY(target.y, target.sy, objectTop, factor);
      _pickClip.set(target.x, anchorY, target.z, 1);
      _pickClip.applyMatrix4(camera.projectionMatrix);
      const screen = projectSceneToCss(
        _pickClip.x,
        _pickClip.y,
        _pickClip.w,
        cssW,
        cssH,
      );
      if (!screen) continue;
      if (!beaconSpriteHit(cssX, cssY, screen.x, screen.y, head, stem)) continue;
      const radius = Math.max(1, head) * 0.5;
      const headY = screen.y - (Math.max(0, stem) + radius);
      const score = (cssX - screen.x) ** 2 + (cssY - headY) ** 2;
      if (score < bestScore) {
        bestScore = score;
        best = { lng: target.lng, lat: target.lat };
      }
    }
    return best;
  }

  function syncFlagAuraMesh(indices: readonly number[]) {
    if (
      !flagAuraSettings.enabled ||
      !markers ||
      preparedMarkers.length === 0 ||
      markerFlagSources.length === 0
    ) {
      clearFlagAuraMesh();
      return;
    }
    applyFlagAuraSettings(flagAuraMaterial, flagAuraSettings);
    const cap = markers.instanceMatrix.count;
    const sourceUuid = flagAuraMeshKey(
      markers.geometry.uuid,
      flagAuraSettings.animation,
    );
    if (
      !flagAura ||
      flagAura.instanceMatrix.count !== cap ||
      flagAura.userData.sourceGeometryUuid !== sourceUuid
    ) {
      clearFlagAuraMesh();
      flagAura = createFlagAuraMesh(
        flagAuraMaterial,
        cap,
        frustumCulled && !adaptiveZoomSettings.enabled,
        markers.geometry,
        flagAuraSettings.animation,
      );
      if (flagAura) scene.add(flagAura);
    }
    if (flagAura) {
      writeFlagAura(
        flagAura,
        preparedMarkers,
        markerFlagSources,
        indices,
        flagAuraSettings,
      );
    }
    rebuildBeaconPickTargets(indices);
    if (flagAuraSettings.animation === "pillar" && flagAura) {
      const auraUniforms = flagAuraMaterial.uniforms as unknown as {
        uObjectTop: { value: number };
        uPillarRadius: { value: number };
      };
      applyFlagBeaconSettings(flagBeaconMaterial, flagAuraSettings);
      applyFlagBeaconPoolSettings(flagBeaconPoolMaterial, flagAuraSettings);
      const beaconTop = markers?.userData.useWorldBevel
        ? 1
        : auraUniforms.uObjectTop.value;
      setFlagBeaconFootprint(
        flagBeaconMaterial,
        beaconTop,
        auraUniforms.uPillarRadius.value,
      );
      setFlagBeaconPoolFootprint(
        flagBeaconPoolMaterial,
        beaconTop,
        auraUniforms.uPillarRadius.value,
      );
      if (
        !flagBeacon ||
        !flagBeaconPool ||
        flagBeacon.instanceMatrix.count !== cap
      ) {
        clearFlagBeaconMesh();
        flagBeacon = createFlagBeaconMesh(
          flagBeaconMaterial,
          cap,
          frustumCulled && !adaptiveZoomSettings.enabled,
        );
        flagBeaconPool = createFlagBeaconPoolMesh(
          flagBeaconPoolMaterial,
          cap,
          frustumCulled && !adaptiveZoomSettings.enabled,
        );
        if (flagBeacon) scene.add(flagBeacon);
        if (flagBeaconPool) scene.add(flagBeaconPool);
      }
      if (flagBeacon) {
        writeFlagAura(
          flagBeacon,
          preparedMarkers,
          markerFlagSources,
          indices,
          flagAuraSettings,
        );
        flagBeacon.computeBoundingSphere();
      }
      if (flagBeaconPool) {
        writeFlagAura(
          flagBeaconPool,
          preparedMarkers,
          markerFlagSources,
          indices,
          flagAuraSettings,
        );
        flagBeaconPool.computeBoundingSphere();
      }
    } else {
      clearFlagBeaconMesh();
      beaconPickTargets = [];
    }
  }

  function disposeMarkerLodMeshes() {
    for (const mesh of markerLodMeshes) disposeInstancedMesh(mesh);
    markerLodMeshes = [];
  }

  function markerMeshes(): THREE.InstancedMesh[] {
    return markers ? [markers, ...markerLodMeshes] : markerLodMeshes;
  }

  /** Prefer a mesh that actually has instances so empty LOD buckets are skipped. */
  function markerShadowCaster(): THREE.InstancedMesh | THREE.Mesh | null {
    for (const mesh of markerMeshes()) {
      if (mesh.count > 0) return mesh;
    }
    return areas;
  }

  function setMarkerMeshesFrustumCulled(culled: boolean) {
    for (const mesh of markerMeshes()) {
      setInstancedFrustumCulled(mesh, culled);
    }
  }

  function clearMarkerMeshes() {
    disposeInstancedMesh(markers);
    markers = null;
    disposeMarkerLodMeshes();
    disposeBearingTriangles(markerTicks);
    markerTicks = null;
    clearFlagAuraMesh();
    preparedMarkers = [];
    markerFlagSources = [];
    markerLngLats = [];
    beaconPickTargets = [];
    lastLodKey = "";
    lodStats = { full3d: 0, lod2d: 0 };
  }

  function applyMarkerLodPartition(force = false) {
    if (!markers || preparedMarkers.length === 0) return;
    const center = map.getCenter();
    lngLatToLocalMeters(origin, center.lng, center.lat, 0, _lodCenter);
    const zoomState = makeAdaptiveZoomUniformState(
      map.getZoom(),
      origin.lat,
      adaptiveZoomSettings,
    );
    const canvas = map.getCanvas();
    const canvasW = canvas.clientWidth || canvas.width || 1;
    const canvasH = canvas.clientHeight || canvas.height || 1;
    const radiusMeters = lodRadiusMetersFromViewport(
      markerLodSettings.viewportCoverage,
      canvasW,
      canvasH,
      zoomState.metersPerPixel,
    );
    const key = markerLodKey(
      _lodCenter.x,
      _lodCenter.z,
      zoomState.metersPerPixel,
      markerLodSettings,
      Math.min(canvasW, canvasH),
      radiusMeters,
    );
    if (!force && key === lastLodKey) return;
    lastLodKey = key;
    const part = partitionMarkerLod(
      preparedMarkers,
      _lodCenter.x,
      _lodCenter.z,
      markerLodSettings,
      radiusMeters,
    );
    const levels =
      markerLodMeshes.length === 0
        ? [part.full3d]
        : splitIndicesByGeometryLod(
            part.full3d,
            (index) => {
              const item = preparedMarkers[index];
              if (!item) return markerLodMeshes.length;
              return geometryLodLevel(
                renderedMarkerPixels(
                  item.adaptiveSize,
                  zoomState.metersPerPixel,
                  adaptiveZoomSettings,
                  item.scaleCap,
                ),
              );
            },
            markerLodMeshes.length + 1,
          );
    const meshes = markerMeshes();
    for (let level = 0; level < meshes.length; level++) {
      const mesh = meshes[level]!;
      const indices = levels[level] ?? [];
      writePreparedMarkers(mesh, preparedMarkers, indices);
      writePillarBottomLight(
        mesh,
        markerFlagSources,
        indices,
        flagAuraSettings,
      );
    }
    syncFlagAuraMesh(part.full3d);
    if (markerTicks) {
      writeBearingTriangles(
        markerTicks,
        preparedMarkers,
        part.lod2d,
        zoomState,
      );
    }
    lodStats = {
      full3d: part.full3d.length,
      lod2d: part.lod2d.length,
      ...(levels.length > 1
        ? { geometry: levels.map((indices) => indices.length) }
        : {}),
    };
    instanceCount = lodStats.full3d + lodStats.lod2d;
  }

  function setMarkers(params: MarkerBuildParams) {
    const generation = ++markersGeneration;
    disposeExtrudedAreas(areas);
    areas = null;
    clearWaterGradients();
    clearOilSpillMesh();

    if (!params.points.length) {
      clearMarkerMeshes();
      instanceCount = 0;
      contactShadows.markDirty();
      map.triggerRepaint();
      return;
    }

    const c = centroidOfPoints(params.points) ?? { lng: 0, lat: 0 };
    origin = createSceneOrigin(c.lng, c.lat, 0);
    modelMatrix = buildModelTransformMatrix(origin);
    material.vertexColors = false;
    setWorldBevelEnabled(
      material,
      params.bevelEnabled &&
        params.bevelSize > 1e-4 &&
        primitiveUsesWorldBevel(params.primitive),
    );
    setAdaptiveScaleMode(material, "point");

    const commitMarkers = (geometries?: THREE.BufferGeometry[]) => {
      if (generation !== markersGeneration) {
        geometries?.forEach((geometry) => geometry.dispose());
        return;
      }

      markerLodSettings = { ...params.lod };
      flagAuraSettings = { ...(params.flagAura ?? DEFAULT_FLAG_AURA) };
      const markerOptions = {
        points: params.points,
        origin,
        primitive: params.primitive,
        quality: params.quality,
        icosphereSubdivisions: params.icosphereSubdivisions,
        bevelEnabled: params.bevelEnabled,
        bevelSize: params.bevelSize,
        bevelSegments: params.bevelSegments,
        material,
        baseScale: params.baseScale,
        heightScale: params.heightScale,
        colorMode: params.colorMode,
        colorProperty: params.colorProperty,
        colorRamp: params.colorRamp,
        opacityRandomMin: params.opacityRandomMin,
        opacityRandomMax: params.opacityRandomMax,
        frustumCulled: frustumCulled && !adaptiveZoomSettings.enabled,
      };
      const prepared = prepareMarkerInstances({
        ...markerOptions,
        geometry: geometries?.[0],
      });
      const cap = markerLodSettings.enabled
        ? Math.min(markerLodSettings.maxFull3d, prepared.length)
        : prepared.length;
      const geometryList = geometries?.length ? geometries : [undefined];
      const nextMeshes: THREE.InstancedMesh[] = [];
      for (const geometry of geometryList) {
        const mesh = createInstancedMarkerMesh(
          { ...markerOptions, geometry },
          cap,
        );
        if (mesh) nextMeshes.push(mesh);
      }
      const next = nextMeshes[0] ?? null;
      const ticks = markerLodSettings.enabled
        ? createBearingTriangleMesh(
            createBearingTriangleMaterial(`#${material.color.getHexString()}`),
            prepared.length,
            params.colorMode !== "none",
          )
        : null;

      if (generation !== markersGeneration) {
        for (const mesh of nextMeshes) disposeInstancedMesh(mesh);
        disposeBearingTriangles(ticks);
        return;
      }

      clearMarkerMeshes();
      preparedMarkers = prepared;
      markerFlagSources = flagAuraSourcesFromPoints(params.points);
      markerLngLats = params.points.map((point) => ({
        lng: point.lng,
        lat: point.lat,
      }));
      markers = next;
      markerLodMeshes = nextMeshes.slice(1);
      markerTicks = ticks;
      instanceCount = prepared.length;
      for (const mesh of nextMeshes) scene.add(mesh);
      if (markerTicks) scene.add(markerTicks);
      lastAdaptiveKey = "";
      lastLodKey = "";
      syncAdaptiveZoom(true);
      applyMarkerLodPartition(true);
      contactShadows.markDirty();
      map.triggerRepaint();
    };

    if (isGlbMarkerModel(params.primitive)) {
      void loadMarkerModelLods(params.primitive)
        .then((geometries) => commitMarkers(geometries))
        .catch((error) => {
          console.error(
            `[map-3d] Failed to load marker model "${params.primitive}"`,
            error,
          );
        });
      return;
    }

    commitMarkers();
  }

  function setAreas(params: AreaBuildParams) {
    markersGeneration += 1;
    clearMarkerMeshes();
    disposeExtrudedAreas(areas);
    areas = null;
    clearWaterGradients();
    clearOilSpillMesh();
    instanceCount = 0;

    if (!params.areas.length) {
      contactShadows.markDirty();
      map.triggerRepaint();
      return;
    }

    const center = centroidOfAreas(params.areas) ?? { lng: 0, lat: 0 };
    origin = createSceneOrigin(center.lng, center.lat, 0);
    modelMatrix = buildModelTransformMatrix(origin);
    setWorldBevelEnabled(material, false);
    setAdaptiveScaleMode(material, "area");
    areas = buildExtrudedAreas({
      areas: params.areas,
      origin,
      material,
      baseHeight: params.baseHeight,
      extrusionScale: params.extrusionScale,
      bevelEnabled: params.bevelEnabled,
      bevelSize: params.bevelSize,
      bevelSegments: params.bevelSegments,
      colorMode: params.colorMode,
      colorProperty: params.colorProperty,
      colorRamp: params.colorRamp,
      opacityRandomMin: params.opacityRandomMin,
      opacityRandomMax: params.opacityRandomMax,
      frustumCulled: frustumCulled && !adaptiveZoomSettings.enabled,
    });
    if (areas) {
      scene.add(areas);
      refreshFlagAttributes();
      instanceCount = params.areas.length;
    }
    lastAdaptiveKey = "";
    syncAdaptiveZoom(true);
    contactShadows.markDirty();
    map.triggerRepaint();
  }

  function setWaterGradients(params: WaterGradientBuildParams) {
    markersGeneration += 1;
    clearMarkerMeshes();
    disposeExtrudedAreas(areas);
    areas = null;
    disposeWaterGradients(waterGradients);
    waterGradients = null;
    disposeWaterStems(waterStems);
    waterStems = null;
    clearOilSpillMesh();
    instanceCount = 0;
    contactShadows.markDirty();

    if (!params.points.length) {
      fallbackWaterRings = [];
      maskPoints = [];
      waterMaskStatus = "idle";
      detachMaskListeners();
      applyWaterMaskToMaterial(
        waterGradientMaterial,
        createEmptyWaterMaskTexture(),
      );
      map.triggerRepaint();
      return;
    }

    const c = centroidOfPoints(params.points) ?? { lng: 0, lat: 0 };
    origin = createSceneOrigin(c.lng, c.lat, 0);
    modelMatrix = buildModelTransformMatrix(origin);
    maskPoints = params.points;
    maskRadiusMeters = params.settings.radiusMeters;
    fallbackWaterRings = params.fallbackWater
      ? extractWaterRings(params.fallbackWater)
      : [];

    applyWaterGradientSettings(waterGradientMaterial, params.settings);
    waterGradients = buildWaterGradients({
      points: params.points,
      origin,
      material: waterGradientMaterial,
      settings: params.settings,
      colorMode: params.colorMode,
      colorProperty: params.colorProperty,
      colorRamp: params.colorRamp,
      frustumCulled,
    });
    waterStems = buildWaterStems({
      points: params.points,
      origin,
      material: waterGradientMaterial,
      stemMaterial: waterStemMaterial,
      settings: params.settings,
      colorMode: params.colorMode,
      colorProperty: params.colorProperty,
      colorRamp: params.colorRamp,
      frustumCulled: false,
    });
    if (waterGradients) {
      scene.add(waterGradients);
      refreshFlagAttributes();
      instanceCount = waterGradients.count;
    }
    if (waterStems) {
      scene.add(waterStems);
    }
    lastAdaptiveKey = "";
    syncAdaptiveZoom(true);
    attachMaskListeners();
    rebuildWaterMask();
    map.triggerRepaint();
  }

  function applyWaterGradient(settings: WaterGradientSettings) {
    applyWaterGradientSettings(waterGradientMaterial, settings);
    applyWaterStemSettings(waterStemMaterial, settings);
    const radiusChanged = settings.radiusMeters !== maskRadiusMeters;
    maskRadiusMeters = settings.radiusMeters;
    if (waterGradients && radiusChanged) {
      rebuildWaterMask();
    }
    if (waterStems) {
      applyWaterStemZoom(
        waterStemMaterial,
        map.getZoom(),
        metersPerPixelAtLatitude(map.getZoom(), origin.lat),
      );
    }
    map.triggerRepaint();
  }

  function applyMarkerLod(settings: MarkerLodSettings) {
    markerLodSettings = { ...settings };
    lastLodKey = "";
    applyMarkerLodPartition(true);
    map.triggerRepaint();
  }

  function outlineIsActive(): boolean {
    return flagAuraSettings.enabled && flagAuraSettings.animation === "outline";
  }

  function areaFlagSpans(): AreaFlagSpan[] {
    const spans = areas?.userData.areaFlagSpans;
    return Array.isArray(spans) ? (spans as AreaFlagSpan[]) : [];
  }

  function refreshFlagAttributes(): void {
    if (areas) writeAreaFlagAttributes(areas.geometry, areaFlagSpans(), flagAuraSettings);
    if (waterGradients) {
      writeDiscFlagAttributes(waterGradients, maskPoints, flagAuraSettings);
    }
  }

  function collectOutlineDraws(): OutlineMaskDraw[] {
    const draws: OutlineMaskDraw[] = [];
    if (markers && flagAura && flagAura.count > 0) {
      draws.push({ mesh: flagAura, material: markerMaskMaterial });
    }
    if (areas && areaFlagSpans().length > 0) {
      draws.push({ mesh: areas, material: areaMaskMaterial });
    }
    if (waterGradients && waterGradients.count > 0) {
      draws.push({ mesh: waterGradients, material: discMaskMaterial });
    }
    return draws;
  }

  function syncPillarBottomLight() {
    let bottom = -0.5;
    let top = 0.5;
    const box = markers?.geometry.boundingBox;
    if (markers) {
      if (!box) markers.geometry.computeBoundingBox();
      const next = markers.geometry.boundingBox;
      if (next) {
        bottom = next.min.y;
        top = next.max.y;
      }
    }
    const enabled =
      flagAuraSettings.enabled &&
      flagAuraSettings.animation === "pillar" &&
      flagAuraSettings.pillarBase !== false &&
      Boolean(markers);
    setPillarBottomLight(material, {
      enabled,
      intensity: flagAuraSettings.pillarLight ?? 1.15,
      reach: flagAuraSettings.pillarHeight,
      bottom,
      top,
    });
  }

  function applyFlagAura(settings: FlagAuraSettings) {
    flagAuraSettings = { ...settings };
    applyFlagAuraSettings(flagAuraMaterial, settings);
    syncPillarBottomLight();
    refreshFlagAttributes();
    lastLodKey = "";
    applyMarkerLodPartition(true);
    map.triggerRepaint();
  }

  function applyMaterial(settings: MaterialSettings) {
    applyMaterialSettings(material, settings);
    if (markerTicks) {
      const tickMaterial = markerTicks.material as THREE.MeshBasicMaterial;
      tickMaterial.color.set(settings.color);
      tickMaterial.opacity = settings.opacity;
      tickMaterial.transparent = settings.transparent || settings.opacity < 1;
    }
    // Material opacity participates in the silhouette bake.
    contactShadows.setCasterObjectOpacity(settings.opacity);
    contactShadows.markDirty();
    map.triggerRepaint();
  }

  function applyLighting(settings: LightingSettings) {
    lightingState = settings;
    applyLightingSettings(lights as SceneLights, settings);
    ensureEnvironment(settings.environmentEnabled, settings.environmentIntensity);
    syncContactFromLighting(settings);
    map.triggerRepaint();
  }

  function applyRenderer(settings: RendererSettings) {
    if (!renderer) return;
    renderer.toneMapping = TONE_MAP[settings.toneMapping];
    renderer.toneMappingExposure = settings.exposure;
    renderer.transmissionResolutionScale = THREE.MathUtils.clamp(
      settings.transmissionResolutionScale,
      0.1,
      1,
    );
    // Shadow maps on a shared Mapbox GL context corrupt the framebuffer —
    // contact shadows are the supported path. Keep this off.
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = SHADOW_MAP[settings.shadowMapType];
    renderer.outputColorSpace = COLOR_SPACE[settings.outputColorSpace];
    lights.directional.castShadow = false;
    frustumCulled = settings.frustumCulled;
    setMarkerMeshesFrustumCulled(
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    setInstancedFrustumCulled(
      flagAura,
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    setInstancedFrustumCulled(
      flagBeacon,
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    setInstancedFrustumCulled(
      flagBeaconPool,
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    setInstancedFrustumCulled(markerTicks, false);
    if (areas) {
      areas.frustumCulled = frustumCulled && !adaptiveZoomSettings.enabled;
    }
    if (waterGradients) {
      waterGradients.frustumCulled = frustumCulled;
    }
    map.triggerRepaint();
  }

  function applyZoomScaling(settings: AdaptiveZoomSettings) {
    adaptiveZoomSettings = { ...settings };
    lastAdaptiveKey = "";
    lastLodKey = "";
    setMarkerMeshesFrustumCulled(
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    setInstancedFrustumCulled(
      flagAura,
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    setInstancedFrustumCulled(
      flagBeacon,
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    setInstancedFrustumCulled(
      flagBeaconPool,
      frustumCulled && !adaptiveZoomSettings.enabled,
    );
    if (areas) {
      areas.frustumCulled = frustumCulled && !adaptiveZoomSettings.enabled;
    }
    syncAdaptiveZoom(true);
    map.triggerRepaint();
  }

  function setOilSpill(params: OilSpillBuildParams) {
    markersGeneration += 1;
    clearMarkerMeshes();
    disposeExtrudedAreas(areas);
    areas = null;
    clearWaterGradients();
    clearOilSpillMesh();
    instanceCount = 0;
    contactShadows.markDirty();

    const tracks = params.tracks;
    if (tracks.particleCount < 1) {
      map.triggerRepaint();
      return;
    }

    const extent = oilSpillExtentPoints(tracks);
    const center = centroidOfPoints(extent) ?? { lng: 53.3, lat: 25.3 };
    origin = createSceneOrigin(center.lng, center.lat, 0);
    modelMatrix = buildModelTransformMatrix(origin);
    applyOilSpillSettings(oilSpillMaterial, params.settings);
    oilPlaying = params.settings.playing;
    oilHoursPerSecond = params.settings.hoursPerSecond;
    oilKernelMeters = params.settings.radiusMeters;
    oilFrameCount = tracks.frameCount;
    oilSimFrame = 0;
    oilLastMs = 0;

    oilBlob = createOilBlob(
      tracks,
      origin,
      oilSpillMaterial,
      params.settings.radiusMeters,
    );
    if (oilBlob) {
      oilScene.add(oilBlob.mesh);
      pathScene.add(
        oilBlob.pathRibbon,
        oilBlob.pathNodes,
        oilBlob.stem,
        oilBlob.particles,
      );
      applyOilBlobPresentation(oilBlob, params.settings);
      instanceCount = 1;
    }
    maskPoints = extent;
    maskRadiusMeters = params.settings.radiusMeters;
    fallbackWaterRings = params.fallbackWater
      ? extractWaterRings(params.fallbackWater)
      : [];
    attachMaskListeners();
    rebuildWaterMask();
    map.triggerRepaint();
  }

  function seekOilSpill(frame: number) {
    if (!oilBlob) return;
    const maxFrame = Math.max(0, oilFrameCount - 1);
    oilSimFrame = Math.min(maxFrame, Math.max(0, frame));
    oilLastMs = performance.now();
    updateOilBlob(oilBlob, oilSpillMaterial, oilSimFrame, oilKernelMeters, 0);
    map.triggerRepaint();
  }

  function applyOilSpill(settings: OilSpillSettings) {
    applyOilSpillSettings(oilSpillMaterial, settings);
    if (oilBlob && settings.showParticles && !oilBlob.particles.visible) {
      oilBlob.lastFrame = Number.NaN;
    }
    if (oilBlob) applyOilBlobPresentation(oilBlob, settings);
    oilPlaying = settings.playing;
    oilHoursPerSecond = settings.hoursPerSecond;
    oilKernelMeters = settings.radiusMeters;
    const radiusChanged = settings.radiusMeters !== maskRadiusMeters;
    maskRadiusMeters = settings.radiusMeters;
    if (oilBlob && radiusChanged) {
      oilBlob.lastKernel = Number.NaN;
      rebuildWaterMask();
    }
    map.triggerRepaint();
  }

  function syncDustPresentation(settings: DustStormSettings) {
    dustSettings = settings;
    dustPlaying = settings.playing;
    dustHoursPerSecond = settings.hoursPerSecond;
    if (Math.abs(settings.frame - dustSeekFrame) > 1e-4) {
      dustFrame = settings.frame;
      dustSeekFrame = settings.frame;
      dustLastMs = 0;
    }
    if (
      dustField &&
      dustPointMaterial &&
      (settings.particlesPerCell !== dustParticlesPerCell ||
        settings.placement !== dustPlacement)
    ) {
      dustParticlesPerCell = settings.particlesPerCell;
      dustPlacement = settings.placement;
      const geometry = buildDustPointGeometry(
        dustField,
        origin,
        dustParticlesPerCell,
        dustPlacement,
      );
      if (dustPoints) {
        scene.remove(dustPoints);
        dustPoints.geometry.dispose();
      }
      dustPoints = new THREE.Points(geometry, dustPointMaterial);
      dustPoints.frustumCulled = false;
      dustPoints.renderOrder = 2;
      scene.add(dustPoints);
      instanceCount = dustDrawCount(
        dustField.rows * dustField.cols,
        dustSettings,
      );
    }
    syncDustCells(settings);
    applyDustVisibility(settings);
    if (dustField && dustUniforms) {
      const canvas = map.getCanvas();
      syncDustUniforms(
        dustUniforms,
        dustField,
        dustSettings,
        dustFrame,
        performance.now() * 0.001,
        canvas.width,
        canvas.height,
        metersPerPixelAtLatitude(map.getZoom(), map.getCenter().lat),
        canvas.width / Math.max(1, canvas.clientWidth),
      );
    }
  }

  function setDustStorm(params: DustStormBuildParams) {
    markersGeneration += 1;
    clearMarkerMeshes();
    disposeExtrudedAreas(areas);
    areas = null;
    clearWaterGradients();
    clearOilSpillMesh();
    instanceCount = 0;
    contactShadows.markDirty();

    const field = params.field;
    if (field.frameCount < 1 || field.rows < 1 || field.cols < 1) {
      map.triggerRepaint();
      return;
    }

    origin = dustSceneOrigin(field, (lng, lat) => createSceneOrigin(lng, lat, 0));
    modelMatrix = buildModelTransformMatrix(origin);
    const textures = createDustTextures(field);
    dustFieldTex = textures.fieldTex;
    dustWindTex = textures.windTex;
    dustUniforms = createDustUniforms(field, dustFieldTex, dustWindTex, origin);
    dustPointMaterial = createDustPointMaterial(dustUniforms);
    dustCellMaterial = createDustCellMaterial(dustUniforms);
    dustSoftMaterial = createDustSoftMaterial(dustUniforms);
    dustTerrainMaterial = createDustTerrainMaterial(dustUniforms);
    dustSoftField = new DustSoftField(dustUniforms, field.cols, field.rows);
    dustField = field;
    dustFrameCount = field.frameCount;
    dustParticlesPerCell = params.settings.particlesPerCell;
    dustPlacement = params.settings.placement;
    dustFrame = params.settings.frame;
    dustSeekFrame = params.settings.frame;
    dustLastMs = 0;

    const points = new THREE.Points(
      buildDustPointGeometry(
        field,
        origin,
        dustParticlesPerCell,
        dustPlacement,
      ),
      dustPointMaterial,
    );
    points.frustumCulled = false;
    points.renderOrder = 2;
    dustPoints = points;
    scene.add(points);

    const soft = new THREE.Mesh(
      buildDustSoftGeometry(field, origin),
      dustSoftMaterial,
    );
    soft.frustumCulled = false;
    soft.renderOrder = 1;
    dustSoft = soft;
    dustSoftScene.add(soft);

    dustTerrain = replaceDustMesh(
      null,
      buildDustSoftGeometry(field, origin),
      dustTerrainMaterial,
    );

    syncDustPresentation(params.settings);
    instanceCount = dustDrawCount(field.rows * field.cols, params.settings);
    map.triggerRepaint();
  }

  function applyDustStorm(settings: DustStormSettings) {
    if (!dustField) return;
    syncDustPresentation(settings);
    instanceCount = dustDrawCount(dustField.rows * dustField.cols, settings);
    map.triggerRepaint();
  }

  function setFlood(params: FloodBuildParams) {
    markersGeneration += 1;
    clearMarkerMeshes();
    disposeExtrudedAreas(areas);
    areas = null;
    clearWaterGradients();
    clearOilSpillMesh();
    instanceCount = 0;
    contactShadows.markDirty();

    const grid = params.grid;
    if (grid.cols < 1 || grid.rows < 1) {
      map.triggerRepaint();
      return;
    }
    origin = floodSceneOrigin(grid, (lng, lat) => createSceneOrigin(lng, lat, 0));
    modelMatrix = buildModelTransformMatrix(origin);
    floodGrid = grid;
    floodGridTex = createFloodGridTexture(grid);
    floodBakedHeights = bakedBuildingHeights(grid);
    floodHeights = Float32Array.from(floodBakedHeights);
    floodBuildingTex = createFloodBuildingTexture(floodHeights, grid.cols, grid.rows);
    floodUniforms = createFloodUniforms(grid, floodGridTex, floodBuildingTex);
    const frame = floodLocalFrame(grid, origin);
    const heatmap = new THREE.Mesh(
      buildFloodSurfaceGeometry(grid, frame, 2),
      createFloodHeatmapMaterial(floodUniforms),
    );
    heatmap.frustumCulled = false;
    heatmap.renderOrder = 1;
    const surface = new THREE.Mesh(
      buildFloodSurfaceGeometry(grid, frame, 1),
      createFloodSurfaceMaterial(floodUniforms),
    );
    surface.frustumCulled = false;
    surface.renderOrder = 2;
    floodHeatmap = heatmap;
    floodSurface = surface;
    scene.add(heatmap, surface);
    floodFrame = params.settings.frame;
    floodSeekFrame = params.settings.frame;
    instanceCount = grid.cols * grid.rows;
    applyFlood(params.settings);
    attachFloodBuildingListener();
    scheduleFloodBuildings();
    map.triggerRepaint();
  }

  function applyFlood(settings: FloodSettings) {
    if (!floodGrid) return;
    const previous = floodSettings;
    floodSettings = settings;
    if (Math.abs(settings.frame - floodSeekFrame) > 1e-4) {
      floodFrame = settings.frame;
      floodSeekFrame = settings.frame;
      floodLastMs = 0;
    }
    if (settings.scenario !== previous.scenario) {
      const count = floodScenarioHeader(floodGrid, settings.scenario)?.levels.length ?? 1;
      floodFrame = Math.min(floodFrame, Math.max(0, count - 1));
    }
    if (settings.buildingSource !== previous.buildingSource) refreshFloodBuildings();
    if (
      settings.terrain !== floodTerrainOwned ||
      (settings.terrain && settings.terrainExaggeration !== previous.terrainExaggeration)
    ) {
      syncFloodTerrain(settings.terrain, settings.terrainExaggeration);
    }
    if (settings.scenario === "sim" && previous.scenario !== "sim") floodSimKey = "";
    floodFlowLines?.applySettings(settings);
    if (settings.flowLines && !previous.flowLines) floodFlowLines?.reset();
    syncFloodFrame(performance.now());
    map.triggerRepaint();
  }

  function seekFlood(frame: number) {
    if (!floodGrid) return;
    const count = floodScenarioHeader(floodGrid, floodSettings.scenario)?.levels.length ?? 1;
    floodFrame = Math.min(Math.max(0, count - 1), Math.max(0, frame));
    floodSeekFrame = floodFrame;
    floodLastMs = 0;
    map.triggerRepaint();
  }

  return {
    layer,
    setMarkers,
    setAreas,
    setWaterGradients,
    setOilSpill,
    setDustStorm,
    setFlood,
    applyMaterial,
    applyLighting,
    applyRenderer,
    applyZoomScaling,
    applyWaterGradient,
    applyOilSpill,
    applyDustStorm,
    applyFlood,
    seekFlood,
    resetFloodSim,
    getFloodReadout: floodReadout,
    applyMarkerLod,
    applyFlagAura,
    getFps: () => fps.value,
    getInstanceCount: () => instanceCount,
    getLodStats: () => lodStats,
    getContactShadowStats: () => contactShadows.getStats(),
    getFlagAuraBloomStats: () => flagAuraBloom.getStats(),
    getFlagOutlineStats: () => flagOutline.getStats(),
    getWaterMaskStatus: () => {
      if (!waterGradients && !oilBlob) return "idle";
      return waterMaskStatus === "ready" ? "ready" : "empty";
    },
    getOilSpillHour: () =>
      oilBlob ? Math.min(oilFrameCount, Math.floor(oilSimFrame) + 1) : 0,
    seekOilSpill,
    getDustStormFrame: () => (dustField ? dustFrame : 0),
    getDustStormLabel: () =>
      dustField ? dustTimestampLabel(dustField, dustFrame) : "",
    pickBeacon,
    dispose: () => {
      markersGeneration += 1;
      detachMaskListeners();
      disposeInstancedMesh(markers);
      markers = null;
      disposeMarkerLodMeshes();
      disposeBearingTriangles(markerTicks);
      markerTicks = null;
      disposeFlagAura(flagAura);
      flagAura = null;
      disposeFlagAura(flagBeacon);
      flagBeacon = null;
      disposeFlagAura(flagBeaconPool);
      flagBeaconPool = null;
      preparedMarkers = [];
      markerFlagSources = [];
      markerLngLats = [];
      beaconPickTargets = [];
      disposeExtrudedAreas(areas);
      areas = null;
      disposeWaterGradients(waterGradients);
      waterGradients = null;
      disposeWaterStems(waterStems);
      waterStems = null;
      if (map.getLayer(layer.id)) {
        map.removeLayer(layer.id);
      }
      clearOilSpillMesh();
      disposeWaterGradientMaterial(waterGradientMaterial);
      disposeOilSpillMaterial(oilSpillMaterial);
      oilSmooth.dispose();
      dustSoftFrost.dispose();
      dustSoftField?.dispose();
      dustSoftField = null;
      waterStemMaterial.dispose();
      flagAuraMaterial.dispose();
      flagBeaconMaterial.dispose();
      flagBeaconPoolMaterial.dispose();
      markerMaskMaterial.dispose();
      areaMaskMaterial.dispose();
      discMaskMaterial.dispose();
      material.dispose();
      contactShadows.dispose();
      flagAuraBloom.dispose();
      flagOutline.dispose();
      envMap?.dispose();
      envMap = null;
      pmrem?.dispose();
      pmrem = null;
      renderer = null;
    },
  };
}
