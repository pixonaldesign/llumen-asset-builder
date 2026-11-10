import * as THREE from "three";

/** Layer used to capture only the flag-aura mesh for selective bloom. */
export const FLAG_AURA_BLOOM_LAYER = 2;

export type FlagAuraBloomStats = {
  enabled: boolean;
  lastMs: number;
  averageMs: number;
  amortizedMs: number;
  width: number;
  height: number;
};

const TARGET_OPTIONS: THREE.RenderTargetOptions = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false,
};

type GlSnapshot = {
  framebuffer: WebGLFramebuffer | null;
  viewport: Int32Array;
  scissor: Int32Array;
  scissorTest: boolean;
};

export function bloomCaptureSize(
  drawingWidth: number,
  drawingHeight: number,
  resolutionScale: number,
): { width: number; height: number } {
  const scale = THREE.MathUtils.clamp(resolutionScale, 0.15, 0.75);
  return {
    width: Math.max(1, Math.floor(drawingWidth * scale)),
    height: Math.max(1, Math.floor(drawingHeight * scale)),
  };
}

/** Cover the NDC clip square with a single triangle. UV (0,0) is bottom-left. */
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

/**
 * Keep Three's stored viewport in lockstep with Mapbox's live drawing buffer.
 * `setRenderTarget(null)` otherwise reapplies the onAdd size and slides the blit.
 */
function syncRendererViewportToCanvas(renderer: THREE.WebGLRenderer): void {
  const canvas = renderer.domElement;
  const pr = Math.max(renderer.getPixelRatio(), 1e-6);
  const width = canvas.width / pr;
  const height = canvas.height / pr;
  renderer.setViewport(0, 0, width, height);
  renderer.setScissor(0, 0, width, height);
}

/**
 * Selective aura bloom that never takes over Mapbox's framebuffer.
 * Capture + blur run into offscreen targets; a fullscreen additive quad is
 * composited after the main Three pass with autoClear left false.
 */
export class FlagAuraBloom {
  private readonly captureTarget: THREE.WebGLRenderTarget;
  private readonly blurTargetA: THREE.WebGLRenderTarget;
  private readonly blurTargetB: THREE.WebGLRenderTarget;
  private readonly blurScene = new THREE.Scene();
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0,
    1,
  );
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly samples: number[] = [];
  private lastMs = 0;
  private width = 1;
  private height = 1;
  private enabled = false;

  constructor() {
    this.captureTarget = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS);
    this.blurTargetA = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      depthBuffer: false,
    });
    this.blurTargetB = new THREE.WebGLRenderTarget(1, 1, {
      ...TARGET_OPTIONS,
      depthBuffer: false,
    });
    this.blurCamera.matrixWorldAutoUpdate = false;
    this.compositeCamera.matrixWorldAutoUpdate = false;

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
          vec3 color = texture2D(tDiffuse, vUv).rgb * 0.227027;
          color += texture2D(tDiffuse, vUv + stepUv * 1.384615).rgb * 0.316216;
          color += texture2D(tDiffuse, vUv - stepUv * 1.384615).rgb * 0.316216;
          color += texture2D(tDiffuse, vUv + stepUv * 3.230769).rgb * 0.070270;
          color += texture2D(tDiffuse, vUv - stepUv * 3.230769).rgb * 0.070270;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const blurMesh = new THREE.Mesh(createFullscreenTriangle(), this.blurMaterial);
    blurMesh.frustumCulled = false;
    this.blurScene.add(blurMesh);

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tBloom: { value: this.blurTargetB.texture },
        uStrength: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tBloom;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D(tBloom, vUv).rgb * uStrength;
          if (dot(color, vec3(0.333)) < 0.004) discard;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
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
    this.lastMs = 0;
    this.samples.length = 0;
    this.width = 0;
    this.height = 0;
  }

  getStats(): FlagAuraBloomStats {
    const average =
      this.samples.length === 0
        ? 0
        : this.samples.reduce((sum, value) => sum + value, 0) /
          this.samples.length;
    return {
      enabled: this.enabled,
      lastMs: this.lastMs,
      averageMs: average,
      amortizedMs: average,
      width: this.width,
      height: this.height,
    };
  }

  captureAndBlur(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    enabled: boolean,
    strength: number,
    radius: number,
    resolutionScale: number,
  ): void {
    this.enabled = enabled;
    if (!enabled) return;

    const gl = renderer.getContext();
    const snapshot = snapshotGl(gl);
    const { width, height } = bloomCaptureSize(
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      resolutionScale,
    );
    this.setSize(width, height);

    const start = performance.now();
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = new THREE.Color();
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(previousClearColor);
    const previousLayerMask = camera.layers.mask;

    try {
      // Same camera as the Mapbox 3D pass — only the layer mask changes so
      // clip positions cannot drift from the on-mesh aura.
      camera.layers.set(FLAG_AURA_BLOOM_LAYER);
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.captureTarget);
      renderer.clear();
      renderer.render(scene, camera);

      this.blurMaterial.uniforms.resolution!.value.set(width, height);
      this.blurMaterial.uniforms.radius!.value = Math.max(0.4, radius);
      this.blurMaterial.uniforms.tDiffuse!.value = this.captureTarget.texture;
      this.blurMaterial.uniforms.direction!.value.set(1, 0);
      renderer.setRenderTarget(this.blurTargetA);
      renderer.clear();
      renderer.render(this.blurScene, this.blurCamera);

      this.blurMaterial.uniforms.tDiffuse!.value = this.blurTargetA.texture;
      this.blurMaterial.uniforms.direction!.value.set(0, 1);
      renderer.setRenderTarget(this.blurTargetB);
      renderer.clear();
      renderer.render(this.blurScene, this.blurCamera);

      this.compositeMaterial.uniforms.uStrength!.value = strength;
      this.compositeMaterial.uniforms.tBloom!.value = this.blurTargetB.texture;
    } finally {
      camera.layers.mask = previousLayerMask;
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
    // Do not call setRenderTarget(null): that binds FBO 0 with Three's stored
    // (often stale) viewport. The main Mapbox/Three pass already left the live
    // framebuffer and viewport bound.
    syncRendererViewportToCanvas(renderer);
    renderer.render(this.compositeScene, this.compositeCamera);
    renderer.autoClear = previousAutoClear;
  }

  dispose(): void {
    this.captureTarget.dispose();
    this.blurTargetA.dispose();
    this.blurTargetB.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    const blurMesh = this.blurScene.children[0] as THREE.Mesh | undefined;
    blurMesh?.geometry.dispose();
    const compositeMesh = this.compositeScene.children[0] as
      | THREE.Mesh
      | undefined;
    compositeMesh?.geometry.dispose();
  }

  private setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.captureTarget.setSize(width, height);
    this.blurTargetA.setSize(width, height);
    this.blurTargetB.setSize(width, height);
  }
}
