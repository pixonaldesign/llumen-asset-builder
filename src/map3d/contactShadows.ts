import * as THREE from "three";
import type { Map as MapboxMap } from "mapbox-gl";
import type { ContactShadowQuality } from "@/lib/types";
import {
  viewportGroundFootprint,
  type SceneOrigin,
  type ViewportGroundFootprint,
} from "@/lib/mercator";
import {
  WORLD_BEVEL_BEGIN_VERTEX,
  WORLD_BEVEL_VERTEX_DECLARATIONS,
} from "@/lib/shaders/worldBevel";
import {
  ADAPTIVE_AREA_BEGIN_VERTEX,
  ADAPTIVE_POINT_BEGIN_VERTEX,
  ADAPTIVE_POINT_COLLISION_DECLARATIONS,
  ADAPTIVE_SCALE_VERTEX_DECLARATIONS,
} from "@/lib/shaders/adaptiveScale";
import type {
  AdaptiveZoomUniformState,
} from "@/lib/zoomScaling";
import type { AdaptiveScaleMode } from "@/lib/materials";

export const CONTACT_SHADOW_LAYER = 1;

export type ContactShadowSettings = {
  enabled: boolean;
  opacity: number;
  blur: number;
  /** Legacy field retained as minimum atlas coverage in meters. */
  size: number;
  resolution: number;
  darkness: number;
  quality: ContactShadowQuality;
  viewportPadding: number;
  maxExtent: number;
  groundOffset: number;
};

export type ContactShadowTier = "off" | "low" | "medium" | "high";

export type ContactShadowStats = {
  averageMs: number;
  /** Shadow cost amortized over 60 Hz frame intervals. */
  amortizedMs: number;
  lastMs: number;
  tier: ContactShadowTier;
  updates: number;
  skipReason: "disabled" | "no-caster" | "viewport-too-large" | null;
  timing: "gpu" | "cpu";
};

export function resolveContactShadowTier(
  quality: ContactShadowQuality,
  moving: boolean,
  averageMs: number,
): Exclude<ContactShadowTier, "off"> {
  if (quality !== "auto") return quality;
  if (moving || averageMs > 2.5) return "low";
  return "medium";
}

export function resolutionForContactShadowTier(
  tier: Exclude<ContactShadowTier, "off">,
  configuredResolution: number,
): number {
  const configured = THREE.MathUtils.clamp(
    Math.round(configuredResolution),
    128,
    1024,
  );
  if (tier === "low") return 64;
  if (tier === "high") return Math.max(512, configured);
  return THREE.MathUtils.clamp(configured, 192, 512);
}

function settingsEqual(
  a: ContactShadowSettings,
  b: ContactShadowSettings,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type CasterUniforms = {
  uAdaptiveScaleEnabled: { value: number };
  uAdaptiveMetersPerPixel: { value: number };
  uAdaptiveMinPixels: { value: number };
  uAdaptiveMaxPixels: { value: number };
  uCollisionAwareEnabled: { value: number };
};

type CasterUserData = {
  adaptiveUniforms?: CasterUniforms;
  adaptiveState?: AdaptiveZoomUniformState;
  materialOpacity?: number;
  materialOpacityUniform?: { value: number };
};

function writeCasterUniforms(
  uniforms: CasterUniforms,
  state: AdaptiveZoomUniformState,
): void {
  uniforms.uAdaptiveScaleEnabled.value = state.enabled ? 1 : 0;
  uniforms.uAdaptiveMetersPerPixel.value = state.metersPerPixel;
  uniforms.uAdaptiveMinPixels.value = state.minPixels;
  uniforms.uAdaptiveMaxPixels.value = state.maxPixels;
  uniforms.uCollisionAwareEnabled.value = state.collisionAware === false ? 0 : 1;
}

function setCasterMaterialOpacity(
  material: THREE.MeshBasicMaterial,
  opacity: number,
): void {
  const data = material.userData as CasterUserData;
  const next = THREE.MathUtils.clamp(opacity, 0, 1);
  data.materialOpacity = next;
  if (data.materialOpacityUniform) {
    data.materialOpacityUniform.value = next;
  }
}

function makeCasterMaterial(
  mode: Exclude<AdaptiveScaleMode, "none">,
  worldBevel: boolean,
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    toneMapped: false,
  });
  material.customProgramCacheKey = () =>
    `contact-shadow-caster-v6-${mode}-${worldBevel ? "bevel" : "plain"}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAdaptiveScaleEnabled = { value: 0 };
    shader.uniforms.uAdaptiveMetersPerPixel = { value: 1 };
    shader.uniforms.uAdaptiveMinPixels = { value: 8 };
    shader.uniforms.uAdaptiveMaxPixels = { value: 64 };
    shader.uniforms.uCollisionAwareEnabled = { value: 1 };
    shader.uniforms.uMaterialOpacity = { value: 1 };
    const uniforms: CasterUniforms = {
      uAdaptiveScaleEnabled: shader.uniforms
        .uAdaptiveScaleEnabled as CasterUniforms["uAdaptiveScaleEnabled"],
      uAdaptiveMetersPerPixel: shader.uniforms
        .uAdaptiveMetersPerPixel as CasterUniforms["uAdaptiveMetersPerPixel"],
      uAdaptiveMinPixels: shader.uniforms
        .uAdaptiveMinPixels as CasterUniforms["uAdaptiveMinPixels"],
      uAdaptiveMaxPixels: shader.uniforms
        .uAdaptiveMaxPixels as CasterUniforms["uAdaptiveMaxPixels"],
      uCollisionAwareEnabled: shader.uniforms
        .uCollisionAwareEnabled as CasterUniforms["uCollisionAwareEnabled"],
    };
    const data = material.userData as CasterUserData;
    data.adaptiveUniforms = uniforms;
    data.materialOpacityUniform = shader.uniforms.uMaterialOpacity as {
      value: number;
    };
    if (data.adaptiveState) writeCasterUniforms(uniforms, data.adaptiveState);
    if (typeof data.materialOpacity === "number") {
      data.materialOpacityUniform.value = data.materialOpacity;
    }

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\n${ADAPTIVE_SCALE_VERTEX_DECLARATIONS}${mode === "point" ? `\n${ADAPTIVE_POINT_COLLISION_DECLARATIONS}` : ""}\nattribute float featureOpacity;\nvarying float vFeatureOpacity;`,
    );
    if (worldBevel) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>\n${WORLD_BEVEL_VERTEX_DECLARATIONS}`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        WORLD_BEVEL_BEGIN_VERTEX,
      );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        mode === "area"
          ? ADAPTIVE_AREA_BEGIN_VERTEX
          : ADAPTIVE_POINT_BEGIN_VERTEX,
      );
    }
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "vFeatureOpacity = featureOpacity;\n#include <project_vertex>",
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      /* glsl */ `
      uniform float uMaterialOpacity;
      varying float vFeatureOpacity;
      void main() {
      `,
    );
    // Must run AFTER color_fragment: instance/vertex colors would otherwise
    // multiply the silhouette and leave dark ghost shadows on transparent
    // features (especially dark ramp colors).
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      /* glsl */ `
      #include <color_fragment>
      {
        float featureShade = clamp(vFeatureOpacity * uMaterialOpacity, 0.0, 1.0);
        diffuseColor.rgb = vec3(1.0 - featureShade);
        diffuseColor.a = 1.0;
      }
      `,
    );
  };
  return material;
}

function setCasterAdaptiveState(
  material: THREE.MeshBasicMaterial,
  state: AdaptiveZoomUniformState,
): void {
  const data = material.userData as CasterUserData;
  data.adaptiveState = { ...state };
  if (data.adaptiveUniforms) {
    writeCasterUniforms(data.adaptiveUniforms, state);
  }
}

class GpuTimer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ext: {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  private pending: WebGLQuery | null = null;
  private active: WebGLQuery | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    const context = renderer.getContext();
    this.gl =
      typeof WebGL2RenderingContext !== "undefined" &&
      context instanceof WebGL2RenderingContext
        ? context
        : null;
    this.ext = this.gl
      ? (this.gl.getExtension(
          "EXT_disjoint_timer_query_webgl2",
        ) as GpuTimer["ext"])
      : null;
  }

  begin(): void {
    if (!this.gl || !this.ext || this.pending || this.active) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.gl || !this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending = this.active;
    this.active = null;
  }

  poll(): number | null {
    if (!this.gl || !this.ext || !this.pending) return null;
    const available = this.gl.getQueryParameter(
      this.pending,
      this.gl.QUERY_RESULT_AVAILABLE,
    ) as boolean;
    const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
    if (!available) return null;
    if (disjoint) {
      this.gl.deleteQuery(this.pending);
      this.pending = null;
      return null;
    }
    const nanoseconds = this.gl.getQueryParameter(
      this.pending,
      this.gl.QUERY_RESULT,
    ) as number;
    this.gl.deleteQuery(this.pending);
    this.pending = null;
    return nanoseconds / 1e6;
  }

  dispose(): void {
    if (!this.gl) return;
    if (this.pending) this.gl.deleteQuery(this.pending);
    if (this.active) this.gl.deleteQuery(this.active);
    this.pending = null;
    this.active = null;
  }

  get supported(): boolean {
    return Boolean(this.gl && this.ext);
  }
}

/**
 * Viewport-following contact-shadow atlas for a Mapbox shared WebGL context.
 * Offscreen work runs from the custom layer's `prerender`; the receiver is a
 * regular local-meter plane rendered in the main scene.
 */
export class ContactShadowAtlas {
  readonly group = new THREE.Group();

  private readonly plane: THREE.Mesh;
  private readonly planeMaterial: THREE.ShaderMaterial;
  private readonly shadowCamera: THREE.OrthographicCamera;
  private readonly renderTarget: THREE.WebGLRenderTarget;
  private readonly blurTargetA: THREE.WebGLRenderTarget;
  private readonly blurTargetB: THREE.WebGLRenderTarget;
  private readonly pointCasterMaterial = makeCasterMaterial("point", false);
  private readonly bevelCasterMaterial = makeCasterMaterial("point", true);
  private readonly areaCasterMaterial = makeCasterMaterial("area", false);
  private readonly blurScene = new THREE.Scene();
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMesh: THREE.Mesh;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly shadowMatrix = new THREE.Matrix4();
  private readonly biasMatrix = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1,
  );

  private settings: ContactShadowSettings;
  private sunDir = new THREE.Vector3(0.35, 0.85, 0.35).normalize();
  private dirty = true;
  private footprintKey = "";
  private resolution = 0;
  private lastAtlasAt = 0;
  private timer: GpuTimer | null = null;
  private timingWindowStart = performance.now();
  private timingWindowCost = 0;
  private stats: ContactShadowStats = {
    averageMs: 0,
    amortizedMs: 0,
    lastMs: 0,
    tier: "off",
    updates: 0,
    skipReason: "disabled",
    timing: "cpu",
  };

  constructor(settings: ContactShadowSettings) {
    this.settings = { ...settings };
    this.renderTarget = this.makeTarget(1);
    this.blurTargetA = this.makeTarget(1);
    this.blurTargetB = this.makeTarget(1);

    this.planeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tShadow: { value: this.blurTargetB.texture },
        shadowMatrix: { value: this.shadowMatrix },
        opacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform mat4 shadowMatrix;
        varying vec4 vShadowCoord;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vShadowCoord = shadowMatrix * worldPosition;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tShadow;
        uniform float opacity;
        varying vec4 vShadowCoord;
        void main() {
          vec3 projected = vShadowCoord.xyz / max(vShadowCoord.w, 0.00001);
          if (
            projected.x < 0.0 || projected.x > 1.0 ||
            projected.y < 0.0 || projected.y > 1.0 ||
            projected.z < 0.0 || projected.z > 1.0
          ) discard;
          float shade = texture2D(tShadow, projected.xy).r;
          gl_FragColor = vec4(0.0, 0.0, 0.0, shade * opacity);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      premultipliedAlpha: true,
      toneMapped: false,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.planeMaterial);
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.renderOrder = -100;
    this.group.add(this.plane);

    this.shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.shadowCamera.layers.set(CONTACT_SHADOW_LAYER);

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        direction: { value: new THREE.Vector2(1, 0) },
        resolution: { value: 128 },
        blur: { value: 1 },
        invertInput: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 direction;
        uniform float resolution;
        uniform float blur;
        uniform float invertInput;
        varying vec2 vUv;
        void main() {
          vec2 stepUv = direction * (blur / resolution);
          float sum = 0.0;
          sum += texture2D(tDiffuse, vUv - 4.0 * stepUv).r * 0.051;
          sum += texture2D(tDiffuse, vUv - 3.0 * stepUv).r * 0.0918;
          sum += texture2D(tDiffuse, vUv - 2.0 * stepUv).r * 0.12245;
          sum += texture2D(tDiffuse, vUv - 1.0 * stepUv).r * 0.1531;
          sum += texture2D(tDiffuse, vUv).r * 0.1633;
          sum += texture2D(tDiffuse, vUv + 1.0 * stepUv).r * 0.1531;
          sum += texture2D(tDiffuse, vUv + 2.0 * stepUv).r * 0.12245;
          sum += texture2D(tDiffuse, vUv + 3.0 * stepUv).r * 0.0918;
          sum += texture2D(tDiffuse, vUv + 4.0 * stepUv).r * 0.051;
          float shade = mix(sum, 1.0 - sum, invertInput);
          gl_FragColor = vec4(vec3(shade), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.blurMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.blurMaterial,
    );
    this.blurScene.add(this.blurMesh);
    this.applySettings(settings);
  }

  private makeTarget(resolution: number): THREE.WebGLRenderTarget {
    const target = new THREE.WebGLRenderTarget(resolution, resolution, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    });
    target.texture.generateMipmaps = false;
    return target;
  }

  applySettings(settings: ContactShadowSettings): void {
    if (!settingsEqual(this.settings, settings)) this.dirty = true;
    this.settings = { ...settings };
    this.group.visible = settings.enabled;
    this.plane.position.y = Math.max(0.01, settings.groundOffset);
    this.planeMaterial.uniforms.opacity!.value = THREE.MathUtils.clamp(
      settings.opacity * settings.darkness,
      0,
      1,
    );
  }

  setSunDirection(direction: THREE.Vector3): void {
    if (direction.lengthSq() < 1e-6) return;
    const next = direction.clone().normalize();
    if (next.y < 0.12) next.y = 0.12;
    next.normalize();
    if (this.sunDir.distanceToSquared(next) < 1e-8) return;
    this.sunDir.copy(next);
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  setAdaptiveZoomState(state: AdaptiveZoomUniformState): void {
    setCasterAdaptiveState(this.pointCasterMaterial, state);
    setCasterAdaptiveState(this.bevelCasterMaterial, state);
    setCasterAdaptiveState(this.areaCasterMaterial, state);
    this.dirty = true;
  }

  setCasterObjectOpacity(opacity: number): void {
    const next = THREE.MathUtils.clamp(opacity, 0, 1);
    const current =
      (this.pointCasterMaterial.userData as CasterUserData).materialOpacity ?? 1;
    if (Math.abs(current - next) < 1e-6) return;
    setCasterMaterialOpacity(this.pointCasterMaterial, next);
    setCasterMaterialOpacity(this.bevelCasterMaterial, next);
    setCasterMaterialOpacity(this.areaCasterMaterial, next);
    this.dirty = true;
  }

  private configureFootprint(footprint: ViewportGroundFootprint): void {
    this.plane.position.set(
      footprint.center.x,
      Math.max(0.01, this.settings.groundOffset),
      footprint.center.z,
    );
    this.plane.scale.set(footprint.width, footprint.depth, 1);
    this.plane.updateMatrixWorld(true);

    const halfExtent = Math.max(footprint.width, footprint.depth) * 0.75;
    const distance = Math.max(halfExtent * 2.5, 100);
    this.shadowCamera.left = -halfExtent;
    this.shadowCamera.right = halfExtent;
    this.shadowCamera.top = halfExtent;
    this.shadowCamera.bottom = -halfExtent;
    this.shadowCamera.near = 0.1;
    this.shadowCamera.far = distance * 3;
    this.shadowCamera.position
      .copy(this.sunDir)
      .multiplyScalar(distance)
      .add(footprint.center);
    this.shadowCamera.up.set(0, 1, 0);
    this.shadowCamera.lookAt(footprint.center);
    this.shadowCamera.updateProjectionMatrix();
    this.shadowCamera.updateMatrixWorld(true);
    this.shadowMatrix
      .copy(this.biasMatrix)
      .multiply(this.shadowCamera.projectionMatrix)
      .multiply(this.shadowCamera.matrixWorldInverse);
  }

  private setResolution(next: number): void {
    if (next === this.resolution) return;
    this.resolution = next;
    this.renderTarget.setSize(next, next);
    this.blurTargetA.setSize(next, next);
    this.blurTargetB.setSize(next, next);
    this.blurMaterial.uniforms.resolution!.value = next;
    this.dirty = true;
  }

  prerender(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    caster: THREE.Mesh | THREE.InstancedMesh | null,
    map: MapboxMap,
    origin: SceneOrigin,
  ): void {
    if (!this.timer) this.timer = new GpuTimer(renderer);
    const gpuResult = this.timer.poll();
    if (gpuResult !== null) this.recordTiming(gpuResult, "gpu");

    if (!this.settings.enabled) {
      this.skip("disabled");
      return;
    }
    if (!caster) {
      this.skip("no-caster");
      return;
    }

    const footprint = viewportGroundFootprint(map, origin, {
      padding: this.settings.viewportPadding,
      minExtent: Math.max(10, this.settings.size),
      maxExtent: Math.max(10, this.settings.maxExtent),
    });
    this.configureFootprint(footprint);
    if (footprint.skipReason) {
      this.skip(footprint.skipReason);
      return;
    }

    const moving = map.isMoving();
    if (footprint.key !== this.footprintKey) {
      this.footprintKey = footprint.key;
      this.dirty = true;
    }
    this.stats.skipReason = null;
    this.group.visible = true;

    const tier = resolveContactShadowTier(
      this.settings.quality,
      moving,
      this.stats.averageMs,
    );
    this.stats.tier = tier;
    if (!this.dirty) return;

    // Keep silhouettes locked to objects while navigating: update often at low
    // cost. Idle frames still get the full soft blur at the resolved tier.
    const now = performance.now();
    if (moving && now - this.lastAtlasAt < 50) return;

    const resolution = resolutionForContactShadowTier(
      tier,
      this.settings.resolution,
    );
    this.setResolution(resolution);
    this.lastAtlasAt = now;

    const start = now;
    this.timer.begin();
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousMaterial = caster.material;
    const previousGeometry = caster.geometry;
    const shadowGeometry = caster.userData
      .contactShadowGeometry as THREE.BufferGeometry | undefined;
    const previousFrustumCulled = caster.frustumCulled;
    const previousClearColor = new THREE.Color();
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(previousClearColor);

    try {
      const worldBevel = Boolean(caster.userData.contactShadowWorldBevel);
      const adaptiveMode = caster.userData
        .adaptiveScaleMode as AdaptiveScaleMode | undefined;
      const sourceMaterial = previousMaterial as THREE.Material & {
        opacity?: number;
      };
      const objectOpacity =
        typeof sourceMaterial.opacity === "number" ? sourceMaterial.opacity : 1;
      setCasterMaterialOpacity(this.pointCasterMaterial, objectOpacity);
      setCasterMaterialOpacity(this.bevelCasterMaterial, objectOpacity);
      setCasterMaterialOpacity(this.areaCasterMaterial, objectOpacity);
      caster.material =
        adaptiveMode === "area"
          ? this.areaCasterMaterial
          : worldBevel
            ? this.bevelCasterMaterial
            : this.pointCasterMaterial;
      if (shadowGeometry) caster.geometry = shadowGeometry;
      caster.frustumCulled = false;
      this.group.visible = false;

      renderer.autoClear = true;
      renderer.setRenderTarget(this.renderTarget);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(scene, this.shadowCamera);

      // While moving: one invert+minimal-blur pass into the receiver target.
      // Idle: full separable soft blur.
      const blurAmount = moving
        ? 0.5
        : Math.max(0.5, this.settings.blur);

      this.blurMaterial.uniforms.tDiffuse!.value = this.renderTarget.texture;
      this.blurMaterial.uniforms.direction!.value.set(1, 0);
      this.blurMaterial.uniforms.blur!.value = blurAmount;
      this.blurMaterial.uniforms.invertInput!.value = 1;
      renderer.setRenderTarget(moving ? this.blurTargetB : this.blurTargetA);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(this.blurScene, this.blurCamera);

      if (!moving) {
        this.blurMaterial.uniforms.tDiffuse!.value = this.blurTargetA.texture;
        this.blurMaterial.uniforms.direction!.value.set(0, 1);
        this.blurMaterial.uniforms.invertInput!.value = 0;
        renderer.setRenderTarget(this.blurTargetB);
        renderer.clear();
        renderer.render(this.blurScene, this.blurCamera);
        this.dirty = false;
      }
      // Motion bakes stay dirty so the first idle frame upgrades to soft/full quality.
      this.stats.updates += 1;
    } finally {
      caster.material = previousMaterial;
      caster.geometry = previousGeometry;
      caster.frustumCulled = previousFrustumCulled;
      this.group.visible = this.settings.enabled;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      this.timer.end();
      if (this.timer.supported) {
        // Timer-query results are asynchronous; request one follow-up frame to
        // poll the result even when the map is otherwise idle.
        map.triggerRepaint();
      } else {
        this.recordTiming(performance.now() - start, "cpu");
      }
    }
  }

  private skip(reason: NonNullable<ContactShadowStats["skipReason"]>): void {
    this.group.visible = false;
    this.stats.tier = "off";
    this.stats.skipReason = reason;
  }

  private recordTiming(value: number, timing: "gpu" | "cpu"): void {
    this.stats.lastMs = value;
    this.stats.averageMs =
      this.stats.averageMs === 0
        ? value
        : this.stats.averageMs * 0.85 + value * 0.15;
    this.stats.timing = timing;
    this.timingWindowCost += value;
    this.flushTimingWindow();
  }

  private flushTimingWindow(): void {
    const now = performance.now();
    const elapsed = now - this.timingWindowStart;
    if (elapsed < 500) return;
    this.stats.amortizedMs =
      this.timingWindowCost / Math.max(1, elapsed / (1000 / 60));
    this.timingWindowCost = 0;
    this.timingWindowStart = now;
  }

  getStats(): ContactShadowStats {
    this.flushTimingWindow();
    return { ...this.stats };
  }

  dispose(): void {
    this.timer?.dispose();
    this.plane.geometry.dispose();
    this.planeMaterial.dispose();
    this.pointCasterMaterial.dispose();
    this.bevelCasterMaterial.dispose();
    this.areaCasterMaterial.dispose();
    this.blurMaterial.dispose();
    this.blurMesh.geometry.dispose();
    this.renderTarget.dispose();
    this.blurTargetA.dispose();
    this.blurTargetB.dispose();
  }
}

/** @deprecated Use ContactShadowAtlas. */
export { ContactShadowAtlas as ContactShadowGround };
