export type GeometricPrimitive = "pillar" | "icosphere" | "octahedron";

export type GroundVehicleModel =
  | "delivery"
  | "garbage-truck"
  | "hatchback-sports"
  | "police"
  | "sedan"
  | "suv-luxury"
  | "truck"
  | "van";

export type WatercraftModel =
  | "boat-fishing-small"
  | "boat-sail-a"
  | "boat-speed-a"
  | "boat-tow-a"
  | "boat-tug-a"
  | "buoy-flag"
  | "buoy"
  | "ship-ocean-liner-small"
  | "ship-ocean-liner"
  | "ship-small";

/** Llumen aircraft silhouettes. Authored nose-toward -Z; the loader turns them to +Z. */
export type AircraftModel =
  | "narrow-body"
  | "wide-body"
  | "superjumbo"
  | "humpback-jumbo"
  | "regional-jet"
  | "turboprop"
  | "business-jet"
  | "light-aircraft"
  | "helicopter";

/** Delivery scooters. Authored nose-toward -Z; the loader turns them to +Z. */
export type DeliveryVehicleModel = "scooter" | "scooter-rider";

/** Llumen military silhouettes. Same axis and LOD convention as the civil aircraft. */
export type MilitaryAircraftModel =
  | "multirole-fighter"
  | "stealth-fighter"
  | "strike-aircraft"
  | "flying-wing-bomber"
  | "tactical-transport"
  | "aerial-tanker"
  | "airborne-surveillance"
  | "long-endurance-drone"
  | "attack-helicopter"
  | "utility-helicopter";

/** Marker shape id: procedural primitives or GLB marker assets. */
export type PrimitiveType =
  | GeometricPrimitive
  | GroundVehicleModel
  | WatercraftModel
  | AircraftModel
  | MilitaryAircraftModel
  | DeliveryVehicleModel;

export type GeometryQuality = "low" | "medium" | "high";

export type ColorMode = "none" | "value" | "categorical";

/** Point representation: 3D markers, water plumes, oil spots, a dust storm, or a flood. */
export type PointVisual =
  | "marker"
  | "water-gradient"
  | "oil-spill"
  | "dust-storm"
  | "flood";

/** Depth wash on the ground, a 3D water surface, or both crossfaded by zoom. */
export type FloodView = "heatmap" | "surface" | "both";
/**
 * Baked harbor-level series (Sandy surge, sea level rise), NYC stormwater
 * class maps, or the live shallow-water sim.
 */
export type FloodScenario =
  | "sandy"
  | "slr"
  | "stormwater-moderate-current"
  | "stormwater-moderate-2050"
  | "stormwater-extreme-2080"
  | "sim";
/** Mapbox building tiles match what the basemap draws; baked footprints always exist. */
export type FloodBuildingSource = "auto" | "mapbox" | "baked";
/** What feeds water into the sim. */
export type FloodSimSource = "surge" | "rain" | "breach";

export type FloodSettings = {
  view: FloodView;
  scenario: FloodScenario;
  /** Seek position in frames of the active scenario. Playback continues from here. */
  frame: number;
  playing: boolean;
  /** Scenario hours advanced per real second. */
  hoursPerSecond: number;
  /** Meters added to every harbor level, for what-if surges. */
  levelOffset: number;
  /** Heatmap palette id from `heatmapPalettes`. */
  palette: string;
  heatmapOpacity: number;
  /** Depth that maps to the top of the palette. */
  maxDepthMeters: number;
  /** Quantize the heatmap into depth bands with thin lines between them. */
  depthBands: boolean;
  /** Band step in meters. */
  bandStepMeters: number;
  buildingSource: FloodBuildingSource;
  /** Surface fades in from this zoom when both views are on. */
  surfaceFadeStartZoom: number;
  /** Heatmap is gone and the surface fully in by this zoom. */
  surfaceFadeEndZoom: number;
  surfaceOpacity: number;
  shallowColor: string;
  deepColor: string;
  /** Beer-Lambert extinction per meter of depth. */
  absorption: number;
  /** Display-only shoreline smoothing, 0 raw cells to 1 full 3x3 blurred outline. */
  edgeSmoothing: number;
  /** Depth over which water fades in from transparent, meters. */
  shallowFadeMeters: number;
  waveStrength: number;
  waveSpeed: number;
  /** Draw the open harbor at the scenario level too. */
  showHarbor: boolean;
  /** Mapbox raster-dem terrain under the scene. The water then sits at its absolute level. */
  terrain: boolean;
  terrainExaggeration: number;
  simSource: FloodSimSource;
  /** Harbor level above MHHW that the surge boundary holds, in meters. */
  simSurgeMeters: number;
  simRainMmPerHour: number;
  /** Play the grid's recorded storm instead of a constant rate, when it has one. */
  simRainRecorded: boolean;
  /** Storm seconds per sim second for the recorded storm. Rain scales with it so the total is kept. */
  simRainTimeLapse: number;
  /** Breach inflow in cubic meters per second. */
  simBreachFlow: number;
  /** Breach inflow location. Outside the grid it falls back to the map center. */
  simBreachLng: number;
  simBreachLat: number;
  /** Solver steps per rendered frame. */
  simSubsteps: number;
  /** Simulated seconds per real second. */
  simSpeed: number;
  /** Particle trails advected by the sim's flow field. */
  flowLines: boolean;
  /** Share of the particle pool drawn, 0–1. */
  flowLineDensity: number;
  /** Sim seconds of travel each trail spans, so its length is velocity times this. */
  flowLineSeconds: number;
  flowLineOpacity: number;
  flowLineColor: string;
};

export type DustView = "particles" | "squares" | "soft";
/** Cell heatmap shape. Hex cells average the grid cells whose centers fall inside. */
export type DustCellShape = "square" | "hex";
export type DustPlacement = "flow" | "locked";
export type DustContourSpacing = "log" | "linear";
/** Auto darkens on light fill, lightens on dark fill, and uses the ramp color over faint fill. */
export type DustContourStyle = "auto" | "darker" | "lighter" | "custom";
/** Heatmap fill. Solid is a color wash. The others are strokes whose thickness follows intensity. */
export type DustHeatPattern = "solid" | "diagonal" | "plus" | "x" | "circle" | "dot";
export type DustStormSignal = "pm10" | "pm25" | "coarse";
export type DustStormNormalization = "percentile-power" | "log";
export type DustWindConvention = "from" | "to";

/** Extruded particulate field. Height is visual intensity, not altitude. */
export type DustStormSettings = {
  /** One view at a time: a particle field, or a heatmap. */
  view: DustView;
  /** Particles rise with intensity. Off lays them on the ground. */
  particlesExtruded: boolean;
  /** Flow scatters and drifts inside the cell. Locked sits on a lattice. */
  placement: DustPlacement;
  /** Soft-heatmap blur radius in cells. Sigma is 0.55× this value. Squares ignore this. */
  blurCells: number;
  /** Cell heatmap shape. The soft heatmap ignores this. */
  cellShape: DustCellShape;
  /** Hex circumradius in grid cells. */
  hexSizeCells: number;
  /** Cell footprint as a fraction of its slot. Below 1 leaves a gap between cells. */
  coverage: number;
  /** Raise cells into columns and the soft sheet into terrain. Height is visual, not altitude. */
  heatmapExtruded: boolean;
  /** Scene-meter height at full intensity. Height is linear in intensity. */
  heatmapHeightMeters: number;
  /** Contour lines over the soft heatmap, flat or extruded. Levels are in data units. */
  contourEnabled: boolean;
  /** 1-2-5 levels (1, 2, 5, 10, 20…) suit long-tailed readings. Linear uses `contourStep`. */
  contourSpacing: DustContourSpacing;
  /** Linear level step in µg/m³. */
  contourStep: number;
  /** Linear: every Nth line is bold. 0 turns it off. 1-2-5 levels bold every decade. */
  contourMajorEvery: number;
  contourStyle: DustContourStyle;
  /** Line color for the custom style. Alpha scales the line. */
  contourColor: string;
  /** Line opacity for every style. Multiplies the custom color's alpha. */
  contourOpacity: number;
  /** Line width in CSS pixels. Bold lines are 1.8× this. */
  contourWidth: number;
  /** Hide the fill so only the lines draw. */
  contourLinesOnly: boolean;
  /** Solid wash, or a repeating stroke whose width follows intensity. */
  pattern: DustHeatPattern;
  /** Screen spacing between pattern repeats, in pixels. Solid ignores this. */
  patternSpacing: number;
  /** Stroke width in pixels at full intensity. Dots use this as their radius. */
  patternStroke: number;
  signal: DustStormSignal;
  normalization: DustStormNormalization;
  /** Percentile of the whole file used as the bottom of the intensity window. */
  lowerPercentile: number;
  /** Percentile of the whole file used as the top of the intensity window. */
  upperPercentile: number;
  heightExponent: number;
  /** Scene-meter exaggeration. Not an atmospheric altitude. */
  maxHeightMeters: number;
  /** 0 disables procedural rolling. Noise is scaled by intensity. */
  turbulence: number;
  /** Meters of local drift per 1 m/s of wind. Particles stay on their anchors. */
  windAmplitude: number;
  windConvention: DustWindConvention;
  particlesPerCell: number;
  pointSizeMeters: number;
  maxPointPixels: number;
  opacity: number;
  sizeFromIntensity: number;
  opacityFromIntensity: number;
  opacityExponent: number;
  hoursPerSecond: number;
  playing: boolean;
  /** Seek position in hours from the first frame. Playback continues from here. */
  frame: number;
  colorLow: string;
  colorMid: string;
  colorHigh: string;
  colorExtreme: string;
};

export type WaterGradientSettings = {
  /** Solid plume color; radial falloff is alpha-only. */
  color: string;
  /** Plume radius in local meters. */
  radiusMeters: number;
  /** Multiply radius by the normalized value property. */
  radiusFromValue: boolean;
  /** Domain-warp amplitude in meters. */
  distortion: number;
  /** FBM sample scale (1 / feature size in meters). */
  noiseScale: number;
  /** FBM octave count. */
  octaves: number;
  /** Noise scroll speed. 0 keeps the field static. */
  animationSpeed: number;
  /** World-space stem height at the smallest outfall value, in meters. */
  stemMinHeightMeters: number;
  /** World-space stem height at the largest outfall value, in meters. */
  stemMaxHeightMeters: number;
  /** Screen-space stem thickness in CSS pixels. */
  stemWidthPixels: number;
  /** Zoom where stems begin fading out (region → city). */
  stemFadeStartZoom: number;
  /** Zoom where stems are fully hidden (city level). */
  stemFadeEndZoom: number;
};

export type OilSpillSettings = {
  /** Kernel radius in meters. Particles inside it merge into one slick. */
  radiusMeters: number;
  /** Simulated hours advanced per real second while playing. */
  hoursPerSecond: number;
  /** Opacity that remains after the model says the surface film is gone. */
  residualSheen: number;
  /** Multiplier on the slick's color and presence. 1 leaves it unchanged. */
  brightness: number;
  /** 0 is gray, 1 is the film as shaded, higher pushes the iridescence. */
  saturation: number;
  /** Keep the rainbow film on the edge and fill the body with `fillColor`. */
  rimSheen: boolean;
  /** How far the rim sheen reaches into the body. 0 is a hairline, 1 covers most of the slick. */
  rimThickness: number;
  /** Cycle the thin-film colors over time, independent of the camera. */
  animateSheen: boolean;
  /** How fast the sheen colors cycle. 1 is the default sweep. */
  sheenSpeed: number;
  /** How strongly the grayscale mask opens and closes the sheen. 0 is a solid film. */
  sheenMaskStrength: number;
  /** Size of that mask. Higher breaks the film into finer patches. */
  sheenMaskScale: number;
  /** Asset-builder palette id, or `thin-film` for interference colors. */
  sheenPalette: string;
  /**
   * Shade the slick from a streaky film thickness: silver edge, rainbow
   * bands, metallic, then crude. Off keeps the legacy camera-angle gradient.
   */
  realisticSheen: boolean;
  /** Size of the wind streaks that set the film thickness. Higher is finer. */
  sheenStreakScale: number;
  /** How quickly interference colors wash out to metallic as the film thickens. */
  sheenColorFade: number;
  /** Body color used when the sheen is pushed to the rim. */
  fillColor: string;
  /** How strongly the wake mask roughens the trail. 0 leaves the brush smooth. */
  trailNoise: number;
  /** Size of the wake mask. Higher combs the trail into finer liquid filaments. */
  trailMaskScale: number;
  playing: boolean;
  /** How much fading residue the slick leaves behind. */
  trailStrength: number;
  /** Opacity of that residue. 1 leaves the wake as shaded. */
  trailOpacity: number;
  /** Draw a ring at every particle so the source discs are visible. */
  showParticles: boolean;
  /** Draw the centreline the slick follows. */
  showPathway: boolean;
  /** Opacity of that centreline. */
  pathwayOpacity: number;
  /** Red stem rising from the slick's centre. */
  showStem: boolean;
  /** World-space stem height, in meters. */
  stemHeightMeters: number;
  /** Screen-space stem thickness in CSS pixels. */
  stemWidthPixels: number;
  /** Zoom where the stem begins fading out. */
  stemFadeStartZoom: number;
  /** Zoom where the stem is fully hidden. */
  stemFadeEndZoom: number;
};

export type DatasetKind = "point" | "area";
export type PointScaleProfile = "global" | "local";

export type MaterialSide = "front" | "back" | "double";

export type ToneMappingName =
  | "none"
  | "linear"
  | "reinhard"
  | "cineon"
  | "aces"
  | "agx"
  | "neutral";

export type ShadowMapTypeName = "basic" | "pcf" | "pcfsoft" | "vsm";

export type ContactShadowQuality = "auto" | "low" | "medium" | "high";

export type VizPoint = {
  id: string;
  lng: number;
  lat: number;
  value?: number;
  label?: string;
  properties: Record<string, unknown>;
};

export type VizArea = {
  id: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  value?: number;
  label?: string;
  properties: Record<string, unknown>;
};

export type VizDataset =
  | { kind: "point"; points: VizPoint[] }
  | { kind: "area"; areas: VizArea[] };

export type DatasetMeta = {
  id: string;
  label: string;
  path: string;
  description: string;
  defaultValueProperty: string | null;
  defaultColorProperty: string | null;
  defaultColorMode: ColorMode;
  source: string;
  kind: DatasetKind;
  /** Suggested point-size controls for this dataset's geographic extent. */
  scaleProfile?: PointScaleProfile;
  /** Optional marker model to select when this dataset is loaded. */
  defaultPrimitive?: PrimitiveType;
  /** Optional point representation to select when this dataset is loaded. */
  defaultPointVisual?: PointVisual;
  /** Optional GeoJSON water polygons used when Mapbox water tiles are unavailable. */
  waterMaskPath?: string;
  /** Hourly particle tracks for the oil-spill visual. */
  tracksPath?: string;
  /** Per-hour surface fraction and film thickness, aligned with the tracks. */
  surfacePath?: string;
  /** JSON header for a baked dust-storm raster. The binary path lives in that file. */
  fieldPath?: string;
  /** JSON header for a baked flood grid. The binary path lives in that file. */
  floodPath?: string;
  /** Baked scenarios in that grid. The live sim is always available. */
  floodScenarios?: FloodScenario[];
  /** The grid ships a recorded hourly rain series for the cloudburst sim. */
  floodRecordedRain?: boolean;
  /** Display cap to apply when this dataset is selected. */
  defaultMaxPoints?: number;
};

export type LookdevFlag = "positive" | "neutral" | "negative";
export type FlagAuraAssignMode = "random" | "value";
export type FlagAuraAnimation =
  | "pulse"
  | "noise"
  | "caustic"
  | "outline"
  | "pillar";

/** Beacon head mark. Ordinal spikes avoid a Christian cross. */
export type FlagBeaconMark = "cross" | "ordinal";

/** Look-dev overlay: additive glow shell tinted by a simulated flag. */
export type FlagAuraSettings = {
  enabled: boolean;
  /** Random hash of feature id, or tertiles of the numeric value property. */
  assignMode: FlagAuraAssignMode;
  /** Fraction of points that receive a look-dev flag (0 = none, 1 = all). */
  coverage: number;
  positiveColor: string;
  neutralColor: string;
  negativeColor: string;
  intensity: number;
  animation: FlagAuraAnimation;
  /** Time scale for pulse, noise, and caustic. */
  pulseSpeed: number;
  /** Pulse depth, noise displacement, or caustic contrast. */
  pulseAmplitude: number;
  /** Shell gap as a fraction of the shortest instance axis (even in world space). */
  faceOffset: number;
  /** Spatial frequency for noise and caustic, in zoom-independent pixel space. */
  noiseScale: number;
  /** Fresnel power; higher = tighter rim. */
  falloff: number;
  /** Cylindrical highlight rooted at the bottom of the form. */
  pillarBase: boolean;
  /** Light-pillar rise from the bottom of the form, as a fraction of its height. */
  pillarHeight: number;
  /** Screen-space beacon diameter in CSS pixels. */
  pillarBeaconSize: number;
  /** Head mark. Ordinal spikes are diagonal ticks instead of a cross. */
  pillarBeaconMark: FlagBeaconMark;
  /** Screen-space stem from the top of the form up to the beacon, in CSS pixels. */
  pillarStemSize: number;
  /** Strength of the light cast on the mesh from below. */
  pillarLight: number;
  /** When true, every instance pulses in lockstep. */
  syncPulse: boolean;
  /** Mapbox-safe selective bloom of the aura (offscreen blur + additive composite). */
  bloomEnabled: boolean;
  bloomStrength: number;
  bloomRadius: number;
  /** Bloom render-target size as a fraction of the canvas. */
  bloomResolution: number;
  /** Brightness pulse of the silhouette stroke. */
  outlinePulse: boolean;
  /** Marching dashes along the contour. */
  outlineDashes: boolean;
  /** Stroke thickness in pixels. With zoom tracking, this is the width at `outlineWidthZoom`. */
  outlineWidth: number;
  /** When true, the stroke grows and shrinks with map zoom. */
  outlineWidthFollowsZoom: boolean;
  /** Zoom at which `outlineWidth` matches the on-screen pixel thickness. */
  outlineWidthZoom: number;
  /** Soft additive halo around the stroke. Breathes on its own. */
  outlineBloom: boolean;
  /** Brightness of the outline halo. */
  outlineBloomStrength: number;
};

/** Nearby full 3D markers vs far 2D bearing ticks. */
export type MarkerLodSettings = {
  enabled: boolean;
  /** Fraction of the shorter canvas side used as the 3D disk diameter. */
  viewportCoverage: number;
  maxFull3d: number;
};

/** Full MeshPhysicalMaterial scalar/color surface (no texture maps). */
export type MaterialSettings = {
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  transparent: boolean;
  emissive: string;
  emissiveIntensity: number;
  // Clearcoat
  clearcoat: number;
  clearcoatRoughness: number;
  // Transmission / glass
  transmission: number;
  thickness: number;
  ior: number;
  attenuationColor: string;
  attenuationDistance: number;
  // Sheen
  sheen: number;
  sheenRoughness: number;
  sheenColor: string;
  // Specular
  specularIntensity: number;
  specularColor: string;
  // Iridescence
  iridescence: number;
  iridescenceIOR: number;
  iridescenceThicknessMin: number;
  iridescenceThicknessMax: number;
  // Env / shading
  envMapIntensity: number;
  flatShading: boolean;
  wireframe: boolean;
  side: MaterialSide;
  depthTest: boolean;
  depthWrite: boolean;
  alphaTest: number;
  fog: boolean;
  dithering: boolean;
  // Rim Fresnel (custom shader term — included in save/load configs)
  fresnelEnabled: boolean;
  fresnelColor: string;
  fresnelIntensity: number;
  fresnelPower: number;
};

export type LightingSettings = {
  // Ambient
  ambientEnabled: boolean;
  ambientColor: string;
  ambientIntensity: number;
  // Directional (key)
  directionalEnabled: boolean;
  directionalColor: string;
  directionalIntensity: number;
  directionalAzimuth: number;
  directionalElevation: number;
  directionalCastShadow: boolean;
  // Directional fill
  directional2Enabled: boolean;
  directional2Color: string;
  directional2Intensity: number;
  directional2Azimuth: number;
  directional2Elevation: number;
  // Camera-tied fill (view-aligned directional, no shadows)
  cameraFillEnabled: boolean;
  cameraFillColor: string;
  cameraFillIntensity: number;
  // Hemisphere
  hemisphereEnabled: boolean;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  // Point
  pointEnabled: boolean;
  pointColor: string;
  pointIntensity: number;
  pointDistance: number;
  pointDecay: number;
  pointAzimuth: number;
  pointElevation: number;
  pointRadius: number;
  // Spot
  spotEnabled: boolean;
  spotColor: string;
  spotIntensity: number;
  spotDistance: number;
  spotAngle: number;
  spotPenumbra: number;
  spotDecay: number;
  spotAzimuth: number;
  spotElevation: number;
  spotRadius: number;
  // IBL
  environmentEnabled: boolean;
  environmentIntensity: number;
  // Sun (drives key directional for consistent outdoor lighting)
  sunEnabled: boolean;
  sunAzimuth: number;
  sunElevation: number;
  sunIntensity: number;
  sunColor: string;
  sunSyncHemisphere: boolean;
  // Contact shadows (screen-projected soft ground contact)
  contactShadowsEnabled: boolean;
  contactShadowsOpacity: number;
  contactShadowsBlur: number;
  contactShadowsSize: number;
  contactShadowsResolution: number;
  contactShadowsDarkness: number;
  contactShadowsQuality: ContactShadowQuality;
  /** Fractional padding around the visible ground footprint. */
  contactShadowsViewportPadding: number;
  /** Skip shadows when the viewport footprint exceeds this many meters. */
  contactShadowsMaxExtent: number;
  /** Receiver height above the Mapbox ground plane in meters. */
  contactShadowsGroundOffset: number;
};

export type RendererSettings = {
  pixelRatio: number;
  /** Transmission render-target resolution as a fraction of the viewport. */
  transmissionResolutionScale: number;
  toneMapping: ToneMappingName;
  exposure: number;
  shadows: boolean;
  shadowMapType: ShadowMapTypeName;
  frustumCulled: boolean;
  outputColorSpace: "srgb" | "srgb-linear" | "linear";
};

export type PlaygroundConfig = {
  styleUrl: string;
  datasetId: string;
  valueProperty: string | null;
  colorMode: ColorMode;
  colorProperty: string | null;
  /** Ordered hex stops for value ramps and categorical palettes. */
  colorRamp: string[];
  maxPoints: number;
  primitive: PrimitiveType;
  geometryQuality: GeometryQuality;
  /** Blender-style icosphere subdivisions (1 = icosahedron / chunkiest). Mapped to Three.js detail = n - 1. */
  icosphereSubdivisions: number;
  /** World-space bevel for pillars, and extrusion bevel for areas. */
  bevelEnabled: boolean;
  /** Corner radius in unit-geometry space (pillar is 1×1×1). Clamped under 0.5. */
  bevelSize: number;
  /** Segments along each rounded edge (pillars / areas). */
  bevelSegments: number;
  /** Local edge bevel for icosphere markers (independent of pillars / octahedrons). */
  icosphereBevelEnabled: boolean;
  icosphereBevelSize: number;
  icosphereBevelSegments: number;
  /** Local edge bevel for octahedron markers (independent of pillars / icospheres). */
  octahedronBevelEnabled: boolean;
  octahedronBevelSize: number;
  octahedronBevelSegments: number;
  baseScale: number;
  heightScale: number;
  pointScaleProfile: PointScaleProfile;
  localBaseScale: number;
  localHeightScale: number;
  /** Minimum area extrusion height in local meters. */
  areaBaseHeight: number;
  /** Additional normalized area extrusion height in local meters. */
  areaExtrusionScale: number;
  /** Clamp projected object dimensions to a readable screen-space range. */
  adaptiveZoomScaling: boolean;
  /** Minimum projected point diameter / area extrusion height in CSS pixels. */
  zoomScaleMinPixels: number;
  /** Maximum projected point diameter / area extrusion height in CSS pixels. */
  zoomScaleMaxPixels: number;
  /**
   * Limit adaptive min-pixel scale-up so neighboring markers do not overlap.
   * Isolated markers still grow to the min-pixel size.
   */
  collisionAwareScaling: boolean;
  /**
   * Per-feature opacity test range. Each marker/area gets a stable sample in
   * [min, max]; contact-shadow silhouettes use the same value.
   */
  opacityRandomMin: number;
  opacityRandomMax: number;
  /** Point dataset representation. Area datasets ignore this. */
  pointVisual: PointVisual;
  waterGradient: WaterGradientSettings;
  oilSpill: OilSpillSettings;
  dustStorm: DustStormSettings;
  flood: FloodSettings;
  markerLod: MarkerLodSettings;
  flagAura: FlagAuraSettings;
  material: MaterialSettings;
  lighting: LightingSettings;
  renderer: RendererSettings;
};
