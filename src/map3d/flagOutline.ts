import * as THREE from "three";
import {
  assignLookdevFlag,
  flagColorHex,
  flagValueRange,
  isLookdevFlagCovered,
  type FlagAuraSource,
} from "@/lib/flagAura";
import {
  AREA_MASK_FRAGMENT,
  AREA_MASK_VERTEX,
  DISC_MASK_FRAGMENT,
  DISC_MASK_VERTEX,
  FLAG_OUTLINE_BLOOM_FRAGMENT,
  FLAG_OUTLINE_COMPOSITE_FRAGMENT,
  FLAG_OUTLINE_STROKE_FRAGMENT,
} from "@/lib/shaders/flagOutline";
import type { AreaFlagSpan } from "@/lib/extrudedAreas";
import type { FlagAuraSettings } from "@/lib/types";
import type { AdaptiveZoomUniformState } from "@/lib/zoomScaling";

/** How far the stroke is pulled toward white so a red shape cannot swallow it. */
export const FLAG_OUTLINE_WHITE_MIX = 0.72;

/** How far the bloom source is pulled toward white. The stroke stays brighter. */
const OUTLINE_BLOOM_WHITE_MIX = 0.35;

export type FlagOutlineStats = {
  enabled: boolean;
  lastMs: number;
  averageMs: number;
  width: number;
  height: number;
};

export type OutlineMaskDraw = {
  mesh: THREE.Mesh | THREE.InstancedMesh;
  material: THREE.Material;
};

const TARGET_OPTIONS: THREE.RenderTargetOptions = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false,
};

/** Match the mesh pass. A binary mask replaces the antialiased silhouette. */
const MASK_SAMPLES = 4;

const _color = new THREE.Color();

type GlSnapshot = {
  framebuffer: WebGLFramebuffer | null;
  viewport: Int32Array;
  scissor: Int32Array;
  scissorTest: boolean;
};

export function outlineCaptureSize(
  drawingWidth: number,
  drawingHeight: number,
): { width: number; height: number } {
  // Pixel-for-pixel with the drawing buffer. A smaller mask upscales into a
  // stair-stepped stroke that covers the mesh's antialiased edge.
  return {
    width: Math.max(1, Math.floor(drawingWidth)),
    height: Math.max(1, Math.floor(drawingHeight)),
  };
}

/** On-screen blur radius. Zoom tracking doubles the stroke each zoom level. */
export function outlineStrokeRadius(
  width: number,
  followsZoom: boolean,
  zoom: number,
  anchorZoom: number,
): number {
  const base = Math.max(0.4, width);
  if (!followsZoom || !Number.isFinite(zoom) || !Number.isFinite(anchorZoom)) {
    return base;
  }
  const scaled = base * 2 ** (zoom - anchorZoom);
  return Math.min(96, Math.max(0.4, scaled));
}

/**
 * A single 5-tap blur with a large radius stamps copies of the mask.
 * Keep every pass dense, and spread a wide stroke across several of them.
 */
export const OUTLINE_BLUR_PASS_RADIUS = 2;

export function outlineBlurPlan(radius: number): {
  downsample: number;
  passes: number;
  passRadius: number;
} {
  const safe = Math.max(0.4, radius);
  if (safe <= OUTLINE_BLUR_PASS_RADIUS) {
    return { downsample: 1, passes: 1, passRadius: safe };
  }
  const downsample = safe > 24 ? 4 : safe > 8 ? 2 : 1;
  const screenPerPass = OUTLINE_BLUR_PASS_RADIUS * downsample;
  const passes = Math.min(12, Math.max(1, Math.round(safe / screenPerPass)));
  return {
    downsample,
    passes,
    passRadius: OUTLINE_BLUR_PASS_RADIUS,
  };
}

function createFullscreenTriangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
  );
  return geometry;
}

function snapshotGl(gl: WebGLRenderingContext | WebGL2RenderingContext): GlSnapshot {
  return {
    framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
    viewport: Int32Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array),
    scissor: Int32Array.from(gl.getParameter(gl.SCISSOR_BOX) as Int32Array),
    scissorTest: Boolean(gl.getParameter(gl.SCISSOR_TEST)),
  };
}

function restoreGl(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  snapshot: GlSnapshot,
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, snapshot.framebuffer);
  gl.viewport(
    snapshot.viewport[0],
    snapshot.viewport[1],
    snapshot.viewport[2],
    snapshot.viewport[3],
  );
  gl.scissor(
    snapshot.scissor[0],
    snapshot.scissor[1],
    snapshot.scissor[2],
    snapshot.scissor[3],
  );
  if (snapshot.scissorTest) gl.enable(gl.SCISSOR_TEST);
  else gl.disable(gl.SCISSOR_TEST);
}

function syncRendererViewportToCanvas(renderer: THREE.WebGLRenderer): void {
  const canvas = renderer.domElement;
  const pr = Math.max(renderer.getPixelRatio(), 1e-6);
  const width = canvas.width / pr;
  const height = canvas.height / pr;
  renderer.setViewport(0, 0, width, height);
  renderer.setScissor(0, 0, width, height);
}

export function createAreaMaskMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAdaptiveScaleEnabled: { value: 0 },
      uAdaptiveMetersPerPixel: { value: 1 },
      uAdaptiveMinPixels: { value: 8 },
      uAdaptiveMaxPixels: { value: 64 },
    },
    vertexShader: AREA_MASK_VERTEX,
    fragmentShader: AREA_MASK_FRAGMENT,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  return material;
}

export function setAreaMaskAdaptiveUniforms(
  material: THREE.ShaderMaterial,
  state: AdaptiveZoomUniformState,
): void {
  material.uniforms.uAdaptiveScaleEnabled!.value = state.enabled ? 1 : 0;
  material.uniforms.uAdaptiveMetersPerPixel!.value = state.metersPerPixel;
  material.uniforms.uAdaptiveMinPixels!.value = state.minPixels;
  material.uniforms.uAdaptiveMaxPixels!.value = state.maxPixels;
}

export function createDiscMaskMaterial(
  radiusMeters: number,
  altitude = 0.3,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRadiusMeters: { value: radiusMeters },
      uAltitude: { value: altitude },
    },
    vertexShader: DISC_MASK_VERTEX,
    fragmentShader: DISC_MASK_FRAGMENT,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  material.defines = { USE_INSTANCING: "" };
  return material;
}

export function setDiscMaskRadius(
  material: THREE.ShaderMaterial,
  radiusMeters: number,
): void {
  material.uniforms.uRadiusMeters!.value = radiusMeters;
}

export function writeDiscFlagAttributes(
  mesh: THREE.InstancedMesh,
  points: readonly FlagAuraSource[],
  settings: FlagAuraSettings,
): void {
  const covered = mesh.geometry.getAttribute("flagCovered");
  const colors = mesh.geometry.getAttribute("flagColor");
  if (!covered || !colors) return;
  const range = flagValueRange(points);
  const coverage = settings.coverage ?? 1;
  const count = Math.min(points.length, covered.count);
  for (let i = 0; i < count; i++) {
    const source = points[i] ?? { id: String(i) };
    const on = isLookdevFlagCovered(source.id, coverage);
    covered.setX(i, on ? 1 : 0);
    if (!on) {
      colors.setXYZ(i, 0, 0, 0);
      continue;
    }
    _color.set(flagColorHex(assignLookdevFlag(source, settings.assignMode, range), settings));
    colors.setXYZ(i, _color.r, _color.g, _color.b);
  }
  covered.needsUpdate = true;
  colors.needsUpdate = true;
}

export function writeAreaFlagAttributes(
  geometry: THREE.BufferGeometry,
  spans: readonly AreaFlagSpan[],
  settings: FlagAuraSettings,
): void {
  const covered = geometry.getAttribute("flagCovered");
  const colors = geometry.getAttribute("flagColor");
  if (!covered || !colors) return;
  for (let vertex = 0; vertex < covered.count; vertex++) {
    covered.setX(vertex, 0);
    colors.setXYZ(vertex, 0, 0, 0);
  }
  const sources: FlagAuraSource[] = spans.map((span) => ({
    id: span.id,
    value: span.value,
  }));
  const range = flagValueRange(sources);
  const coverage = settings.coverage ?? 1;
  const seen = new Map<string, { on: boolean; r: number; g: number; b: number }>();
  for (const span of spans) {
    let paint = seen.get(span.id);
    if (!paint) {
      const on = isLookdevFlagCovered(span.id, coverage);
      if (on) {
        _color.set(
          flagColorHex(
            assignLookdevFlag(
              { id: span.id, value: span.value },
              settings.assignMode,
              range,
            ),
            settings,
          ),
        );
        paint = { on: true, r: _color.r, g: _color.g, b: _color.b };
      } else {
        paint = { on: false, r: 0, g: 0, b: 0 };
      }
      seen.set(span.id, paint);
    }
    const end = Math.min(span.vertexStart + span.vertexCount, covered.count);
    for (let vertex = span.vertexStart; vertex < end; vertex++) {
      covered.setX(vertex, paint.on ? 1 : 0);
      colors.setXYZ(vertex, paint.r, paint.g, paint.b);
    }
  }
  covered.needsUpdate = true;
  colors.needsUpdate = true;
}

/**
 * Mapbox-safe silhouette stroke.
 * Flagged meshes are drawn solid into an offscreen mask, blurred, and the
 * pixels outside the mask are composited as a near-white tinted contour.
 */
export class FlagOutline {
  private readonly maskTarget: THREE.WebGLRenderTarget;
  private readonly blurTargetA: THREE.WebGLRenderTarget;
  private readonly blurTargetB: THREE.WebGLRenderTarget;
  private readonly wideBlurA: THREE.WebGLRenderTarget;
  private readonly wideBlurB: THREE.WebGLRenderTarget;
  private readonly strokeTarget: THREE.WebGLRenderTarget;
  private readonly bloomTarget: THREE.WebGLRenderTarget;
  private readonly bloomPing: THREE.WebGLRenderTarget;
  private readonly maskScene = new THREE.Scene();
  private readonly blurScene = new THREE.Scene();
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly strokeScene = new THREE.Scene();
  private readonly strokeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly strokeMaterial: THREE.ShaderMaterial;
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly bloomScene = new THREE.Scene();
  private readonly bloomCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bloomMaterial: THREE.ShaderMaterial;
  private readonly softScene = new THREE.Scene();
  private readonly softCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly softMaterial: THREE.ShaderMaterial;
  private bloomActive = false;
  private readonly samples: number[] = [];
  private lastMs = 0;
  private width = 1;
  private height = 1;
  private wideWidth = 0;
  private wideHeight = 0;
  private enabled = false;

  constructor() {
    this.maskTarget = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      samples: MASK_SAMPLES,
    });
    this.blurTargetA = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.blurTargetB = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      depthBuffer: false,
    });
    this.wideBlurA = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      depthBuffer: false,
    });
    this.wideBlurB = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      depthBuffer: false,
    });
    this.strokeTarget = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.bloomTarget = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.bloomPing = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.blurCamera.matrixWorldAutoUpdate = false;
    this.strokeCamera.matrixWorldAutoUpdate = false;
    this.compositeCamera.matrixWorldAutoUpdate = false;
    this.bloomCamera.matrixWorldAutoUpdate = false;
    this.softCamera.matrixWorldAutoUpdate = false;

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        direction: { value: new THREE.Vector2(1, 0) },
        radius: { value: 1 },
        resolution: { value: new THREE.Vector2(1, 1) },
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
        uniform float radius;
        uniform vec2 resolution;
        varying vec2 vUv;
        void main() {
          vec2 stepUv = direction * radius / resolution;
          vec4 color = texture2D(tDiffuse, vUv) * 0.227027;
          color += texture2D(tDiffuse, vUv + stepUv * 1.384615) * 0.316216;
          color += texture2D(tDiffuse, vUv - stepUv * 1.384615) * 0.316216;
          color += texture2D(tDiffuse, vUv + stepUv * 3.230769) * 0.070270;
          color += texture2D(tDiffuse, vUv - stepUv * 3.230769) * 0.070270;
          gl_FragColor = color;
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const blurMesh = new THREE.Mesh(createFullscreenTriangle(), this.blurMaterial);
    blurMesh.frustumCulled = false;
    this.blurScene.add(blurMesh);

    this.softMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1, 1) },
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
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec4 sum = vec4(0.0);
          for (int y = 0; y < 4; y++) {
            for (int x = 0; x < 4; x++) {
              vec2 o = (vec2(float(x), float(y)) - 1.5) * uTexel;
              sum += texture2D(tDiffuse, vUv + o);
            }
          }
          gl_FragColor = sum * (3.0 / 16.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const softMesh = new THREE.Mesh(createFullscreenTriangle(), this.softMaterial);
    softMesh.frustumCulled = false;
    this.softScene.add(softMesh);

    this.strokeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: this.maskTarget.texture },
        tBlur: { value: this.blurTargetB.texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uPulseSpeed: { value: 1 },
        uDashesEnabled: { value: 0 },
        uBloomWhiteMix: { value: OUTLINE_BLOOM_WHITE_MIX },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: FLAG_OUTLINE_STROKE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const strokeMesh = new THREE.Mesh(createFullscreenTriangle(), this.strokeMaterial);
    strokeMesh.frustumCulled = false;
    this.strokeScene.add(strokeMesh);

    this.bloomMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tBloom: { value: this.bloomTarget.texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uStrength: { value: 1 },
        uTime: { value: 0 },
        uPulseSpeed: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: FLAG_OUTLINE_BLOOM_FRAGMENT,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const bloomMesh = new THREE.Mesh(createFullscreenTriangle(), this.bloomMaterial);
    bloomMesh.frustumCulled = false;
    this.bloomScene.add(bloomMesh);

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: this.maskTarget.texture },
        tBlur: { value: this.blurTargetB.texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uIntensity: { value: 1 },
        uTime: { value: 0 },
        uPulseSpeed: { value: 1 },
        uPulseAmplitude: { value: 0.35 },
        uPulseEnabled: { value: 0 },
        uDashesEnabled: { value: 0 },
        uWhiteMix: { value: FLAG_OUTLINE_WHITE_MIX },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: FLAG_OUTLINE_COMPOSITE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const compositeMesh = new THREE.Mesh(
      createFullscreenTriangle(),
      this.compositeMaterial,
    );
    compositeMesh.frustumCulled = false;
    this.compositeScene.add(compositeMesh);
  }

  disable(): void {
    this.enabled = false;
    this.bloomActive = false;
    this.lastMs = 0;
    this.samples.length = 0;
    this.width = 0;
    this.height = 0;
  }

  getStats(): FlagOutlineStats {
    const average =
      this.samples.length === 0
        ? 0
        : this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
    return {
      enabled: this.enabled,
      lastMs: this.lastMs,
      averageMs: average,
      width: this.width,
      height: this.height,
    };
  }

  captureAndBlur(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    draws: readonly OutlineMaskDraw[],
    settings: FlagAuraSettings,
    timeSeconds: number,
    zoom: number,
  ): void {
    this.enabled = draws.length > 0;
    if (!this.enabled) return;

    const gl = renderer.getContext();
    const snapshot = snapshotGl(gl);
    const { width, height } = outlineCaptureSize(
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    this.setSize(width, height);

    const start = performance.now();
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = new THREE.Color();
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(previousClearColor);

    const restores: Array<{
      mesh: THREE.Mesh;
      parent: THREE.Object3D | null;
      material: THREE.Material | THREE.Material[];
      visible: boolean;
    }> = [];

    try {
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.maskTarget);
      renderer.clear(true, true, true);

      for (const draw of draws) {
        const mesh = draw.mesh;
        restores.push({
          mesh,
          parent: mesh.parent,
          material: mesh.material,
          visible: mesh.visible,
        });
        this.maskScene.add(mesh);
        mesh.material = draw.material;
        mesh.visible = true;
        mesh.updateMatrixWorld(true);
        renderer.render(this.maskScene, camera);
        this.maskScene.remove(mesh);
      }

      const strokeRadius = outlineStrokeRadius(
        settings.outlineWidth,
        settings.outlineWidthFollowsZoom,
        zoom,
        settings.outlineWidthZoom,
      );
      const blurTexture = this.blurMask(renderer, strokeRadius, width, height);

      const uniforms = this.compositeMaterial.uniforms;
      uniforms.tMask!.value = this.maskTarget.texture;
      uniforms.tBlur!.value = blurTexture;
      uniforms.uTexel!.value.set(1 / width, 1 / height);
      uniforms.uIntensity!.value = settings.intensity;
      uniforms.uTime!.value = timeSeconds;
      uniforms.uPulseSpeed!.value = settings.pulseSpeed;
      uniforms.uPulseAmplitude!.value = settings.pulseAmplitude;
      uniforms.uPulseEnabled!.value = settings.outlinePulse ? 1 : 0;
      uniforms.uDashesEnabled!.value = settings.outlineDashes ? 1 : 0;

      this.bloomActive =
        settings.outlineBloom && settings.outlineBloomStrength > 0;
      if (this.bloomActive) {
        const strokeUniforms = this.strokeMaterial.uniforms;
        strokeUniforms.tMask!.value = this.maskTarget.texture;
        strokeUniforms.tBlur!.value = blurTexture;
        strokeUniforms.uTexel!.value.set(1 / width, 1 / height);
        strokeUniforms.uTime!.value = timeSeconds;
        strokeUniforms.uPulseSpeed!.value = settings.pulseSpeed;
        strokeUniforms.uDashesEnabled!.value = settings.outlineDashes ? 1 : 0;
        renderer.setRenderTarget(this.strokeTarget);
        renderer.clear();
        renderer.render(this.strokeScene, this.strokeCamera);

        const quarterW = Math.max(1, Math.floor(width / 4));
        const quarterH = Math.max(1, Math.floor(height / 4));
        const soft = this.softMaterial.uniforms;
        soft.tDiffuse!.value = this.strokeTarget.texture;
        soft.uTexel!.value.set(1 / width, 1 / height);
        renderer.setRenderTarget(this.bloomPing);
        renderer.clear();
        renderer.render(this.softScene, this.softCamera);

        const speed = Math.max(settings.pulseSpeed, 0.45);
        const breathe = 0.9 + 0.1 * Math.sin(timeSeconds * speed * 0.73 + 1.2);
        const blur = this.blurMaterial.uniforms;
        blur.resolution!.value.set(quarterW, quarterH);
        const radii = [4, 6, 9, 14 * breathe];
        let source: THREE.WebGLRenderTarget = this.bloomPing;
        for (const radius of radii) {
          blur.radius!.value = radius;
          blur.tDiffuse!.value = source.texture;
          blur.direction!.value.set(1, 0);
          renderer.setRenderTarget(this.bloomTarget);
          renderer.clear();
          renderer.render(this.blurScene, this.blurCamera);
          blur.tDiffuse!.value = this.bloomTarget.texture;
          blur.direction!.value.set(0, 1);
          renderer.setRenderTarget(source);
          renderer.clear();
          renderer.render(this.blurScene, this.blurCamera);
        }

        const bloomUniforms = this.bloomMaterial.uniforms;
        bloomUniforms.tBloom!.value = source.texture;
        bloomUniforms.uTexel!.value.set(1.5 / quarterW, 1.5 / quarterH);
        bloomUniforms.uStrength!.value = settings.outlineBloomStrength;
        bloomUniforms.uTime!.value = timeSeconds;
        bloomUniforms.uPulseSpeed!.value = settings.pulseSpeed;
      }
    } finally {
      for (const restore of restores) {
        restore.mesh.material = restore.material;
        restore.mesh.visible = restore.visible;
        if (restore.parent) restore.parent.add(restore.mesh);
      }
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      restoreGl(gl, snapshot);
    }

    this.lastMs = performance.now() - start;
    this.samples.push(this.lastMs);
    if (this.samples.length > 30) this.samples.shift();
  }

  composite(renderer: THREE.WebGLRenderer): void {
    if (!this.enabled) return;
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    syncRendererViewportToCanvas(renderer);
    if (this.bloomActive) {
      renderer.render(this.bloomScene, this.bloomCamera);
    }
    renderer.render(this.compositeScene, this.compositeCamera);
    renderer.autoClear = previousAutoClear;
  }

  dispose(): void {
    this.maskTarget.dispose();
    this.blurTargetA.dispose();
    this.blurTargetB.dispose();
    this.wideBlurA.dispose();
    this.wideBlurB.dispose();
    this.strokeTarget.dispose();
    this.bloomTarget.dispose();
    this.bloomPing.dispose();
    this.blurMaterial.dispose();
    this.strokeMaterial.dispose();
    this.compositeMaterial.dispose();
    this.bloomMaterial.dispose();
    this.softMaterial.dispose();
    const blurMesh = this.blurScene.children[0] as THREE.Mesh | undefined;
    blurMesh?.geometry.dispose();
    const strokeMesh = this.strokeScene.children[0] as THREE.Mesh | undefined;
    strokeMesh?.geometry.dispose();
    const compositeMesh = this.compositeScene.children[0] as THREE.Mesh | undefined;
    compositeMesh?.geometry.dispose();
    const bloomMesh = this.bloomScene.children[0] as THREE.Mesh | undefined;
    bloomMesh?.geometry.dispose();
    const softMesh = this.softScene.children[0] as THREE.Mesh | undefined;
    softMesh?.geometry.dispose();
  }

  private setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.maskTarget.setSize(width, height);
    this.blurTargetA.setSize(width, height);
    this.blurTargetB.setSize(width, height);
    this.strokeTarget.setSize(width, height);
    const quarterW = Math.max(1, Math.floor(width / 4));
    const quarterH = Math.max(1, Math.floor(height / 4));
    this.bloomTarget.setSize(quarterW, quarterH);
    this.bloomPing.setSize(quarterW, quarterH);
  }

  /**
   * Blur the mask into a texture the stroke can subtract.
   * Wide radii are several tight passes so the kernel cannot copy the shape.
   */
  private blurMask(
    renderer: THREE.WebGLRenderer,
    radius: number,
    width: number,
    height: number,
  ): THREE.Texture {
    const plan = outlineBlurPlan(radius);
    if (plan.downsample === 1) {
      return this.blurSeparable(
        renderer,
        this.maskTarget.texture,
        this.blurTargetA,
        this.blurTargetB,
        width,
        height,
        plan.passRadius,
        plan.passes,
      );
    }

    const bw = Math.max(1, Math.floor(width / plan.downsample));
    const bh = Math.max(1, Math.floor(height / plan.downsample));
    if (bw !== this.wideWidth || bh !== this.wideHeight) {
      this.wideWidth = bw;
      this.wideHeight = bh;
      this.wideBlurA.setSize(bw, bh);
      this.wideBlurB.setSize(bw, bh);
    }
    const soft = this.softMaterial.uniforms;
    soft.tDiffuse!.value = this.maskTarget.texture;
    soft.uTexel!.value.set(plan.downsample / width, plan.downsample / height);
    renderer.setRenderTarget(this.wideBlurB);
    renderer.clear();
    renderer.render(this.softScene, this.softCamera);
    return this.blurSeparable(
      renderer,
      this.wideBlurB.texture,
      this.wideBlurA,
      this.wideBlurB,
      bw,
      bh,
      plan.passRadius,
      plan.passes,
    );
  }

  private blurSeparable(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    horizontal: THREE.WebGLRenderTarget,
    vertical: THREE.WebGLRenderTarget,
    width: number,
    height: number,
    radius: number,
    passes: number,
  ): THREE.Texture {
    const blur = this.blurMaterial.uniforms;
    blur.resolution!.value.set(width, height);
    blur.radius!.value = radius;
    let input = source;
    for (let pass = 0; pass < passes; pass++) {
      blur.tDiffuse!.value = input;
      blur.direction!.value.set(1, 0);
      renderer.setRenderTarget(horizontal);
      renderer.clear();
      renderer.render(this.blurScene, this.blurCamera);
      blur.tDiffuse!.value = horizontal.texture;
      blur.direction!.value.set(0, 1);
      renderer.setRenderTarget(vertical);
      renderer.clear();
      renderer.render(this.blurScene, this.blurCamera);
      input = vertical.texture;
    }
    return vertical.texture;
  }
}
