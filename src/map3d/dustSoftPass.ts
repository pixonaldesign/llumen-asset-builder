import * as THREE from "three";
import { DUST_FIELD_GLSL } from "@/lib/shaders/dustStorm";
import type { DustUniforms } from "@/lib/dustStorm";

/** Sigma in cells for a blur radius expressed in cells. */
const CELL_SIGMA_SCALE = 0.55;

const DATA_TARGET: THREE.RenderTargetOptions = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  wrapS: THREE.ClampToEdgeWrapping,
  wrapT: THREE.ClampToEdgeWrapping,
  format: THREE.RGBAFormat,
  type: THREE.HalfFloatType,
  depthBuffer: false,
  stencilBuffer: false,
  generateMipmaps: false,
  colorSpace: THREE.NoColorSpace,
};

const FROST_TARGET: THREE.RenderTargetOptions = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  wrapS: THREE.ClampToEdgeWrapping,
  wrapT: THREE.ClampToEdgeWrapping,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: false,
  stencilBuffer: false,
  generateMipmaps: false,
  colorSpace: THREE.NoColorSpace,
};

type GlSnapshot = {
  framebuffer: WebGLFramebuffer | null;
  viewport: Int32Array;
  scissor: Int32Array;
  scissorTest: boolean;
};

function fullscreenTriangle(): THREE.BufferGeometry {
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
    snapshot.viewport[0]!,
    snapshot.viewport[1]!,
    snapshot.viewport[2]!,
    snapshot.viewport[3]!,
  );
  gl.scissor(
    snapshot.scissor[0]!,
    snapshot.scissor[1]!,
    snapshot.scissor[2]!,
    snapshot.scissor[3]!,
  );
  if (snapshot.scissorTest) gl.enable(gl.SCISSOR_TEST);
  else gl.disable(gl.SCISSOR_TEST);
}

function markData(target: THREE.WebGLRenderTarget) {
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.generateMipmaps = false;
}

const BAKE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BAKE_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  ${DUST_FIELD_GLSL}
  void main() {
    vec2 denom = max(vec2(uCols - 1.0, uRows - 1.0), vec2(1.0));
    vec2 cell = clamp((vUv * vec2(uCols, uRows) - 0.5) / denom, 0.0, 1.0);
    gl_FragColor = vec4(dustIntensity(cell), dustRaw(cell), 0.0, 1.0);
  }
`;

const CELL_BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uStep;
  uniform float uSigma;
  varying vec2 vUv;
  void main() {
    float sigma = max(uSigma, 0.0001);
    float support = min(ceil(sigma * 3.0), 8.0);
    vec2 sum = vec2(0.0);
    float weight = 0.0;
    for (int i = -8; i <= 8; i++) {
      float x = float(i);
      float keep = abs(x) <= support + 0.001 ? 1.0 : 0.0;
      float w = exp(-0.5 * (x * x) / (sigma * sigma)) * keep;
      sum += w * texture(tDiffuse, vUv + uStep * x).rg;
      weight += w;
    }
    gl_FragColor = vec4(sum / max(weight, 0.0001), 0.0, 1.0);
  }
`;

/**
 * One texel per grid cell, then a separable gaussian. R is clipped intensity
 * and G is the raw reading in µg/m³, which contour levels need. The sheet samples the
 * result with linear filtering, so a cell is a wash instead of a flat square.
 */
export class DustSoftField {
  private readonly intensity: THREE.WebGLRenderTarget;
  private readonly blurA: THREE.WebGLRenderTarget;
  private readonly blurB: THREE.WebGLRenderTarget;
  private readonly bakeScene = new THREE.Scene();
  private readonly bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bakeMaterial: THREE.ShaderMaterial;
  private readonly blurScene = new THREE.Scene();
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly clearColor = new THREE.Color();
  private readonly horizontal: THREE.Vector2;
  private readonly vertical: THREE.Vector2;
  private output: THREE.Texture;
  private disposed = false;

  constructor(uniforms: DustUniforms, cols: number, rows: number) {
    const width = Math.max(1, cols);
    const height = Math.max(1, rows);
    this.intensity = new THREE.WebGLRenderTarget(width, height, DATA_TARGET);
    this.blurA = new THREE.WebGLRenderTarget(width, height, DATA_TARGET);
    this.blurB = new THREE.WebGLRenderTarget(width, height, DATA_TARGET);
    markData(this.intensity);
    markData(this.blurA);
    markData(this.blurB);
    this.output = this.intensity.texture;
    this.horizontal = new THREE.Vector2(1 / width, 0);
    this.vertical = new THREE.Vector2(0, 1 / height);
    this.bakeCamera.matrixWorldAutoUpdate = false;
    this.blurCamera.matrixWorldAutoUpdate = false;

    this.bakeMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: BAKE_VERTEX,
      fragmentShader: BAKE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.geometry = fullscreenTriangle();
    const bakeMesh = new THREE.Mesh(this.geometry, this.bakeMaterial);
    bakeMesh.frustumCulled = false;
    this.bakeScene.add(bakeMesh);

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.intensity.texture },
        uStep: { value: new THREE.Vector2(1 / width, 0) },
        uSigma: { value: 1 },
      },
      vertexShader: BAKE_VERTEX,
      fragmentShader: CELL_BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    const blurMesh = new THREE.Mesh(fullscreenTriangle(), this.blurMaterial);
    blurMesh.frustumCulled = false;
    this.blurScene.add(blurMesh);
  }

  get texture(): THREE.Texture {
    return this.output;
  }

  update(renderer: THREE.WebGLRenderer, blurCells: number) {
    if (this.disposed) return;
    const gl = renderer.getContext();
    const snapshot = snapshotGl(gl);
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    gl.disable(gl.SCISSOR_TEST);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.intensity);
    renderer.clear();
    renderer.render(this.bakeScene, this.bakeCamera);

    const sigma = Math.max(0, blurCells) * CELL_SIGMA_SCALE;
    if (sigma < 0.02) {
      this.output = this.intensity.texture;
    } else {
      this.blur(renderer, this.intensity.texture, this.blurA, this.horizontal, sigma);
      this.blur(renderer, this.blurA.texture, this.blurB, this.vertical, sigma);
      this.output = this.blurB.texture;
    }

    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    renderer.setClearColor(this.clearColor, previousClearAlpha);
    restoreGl(gl, snapshot);
  }

  private blur(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget,
    step: THREE.Vector2,
    sigma: number,
  ) {
    this.blurMaterial.uniforms.tDiffuse!.value = source;
    (this.blurMaterial.uniforms.uStep!.value as THREE.Vector2).copy(step);
    this.blurMaterial.uniforms.uSigma!.value = sigma;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.blurScene, this.blurCamera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.intensity.dispose();
    this.blurA.dispose();
    this.blurB.dispose();
    this.bakeMaterial.dispose();
    this.blurMaterial.dispose();
    this.geometry.dispose();
    const blurMesh = this.blurScene.children[0] as THREE.Mesh | undefined;
    blurMesh?.geometry.dispose();
  }
}

const FROST_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Same 5-tap kernel as the oil smoother: about four pixels at 0.85 scale. */
const FROST_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 direction;
  uniform vec2 resolution;
  varying vec2 vUv;
  vec4 tap(vec2 uv) {
    vec4 c = texture(tDiffuse, uv);
    return vec4(c.rgb * c.a, c.a);
  }
  void main() {
    vec2 stepUv = direction * 1.15 / resolution;
    vec4 acc = vec4(0.0);
    acc += tap(vUv) * 0.227027;
    acc += tap(vUv + stepUv * 1.38) * 0.316216;
    acc += tap(vUv - stepUv * 1.38) * 0.316216;
    acc += tap(vUv + stepUv * 3.23) * 0.070270;
    acc += tap(vUv - stepUv * 3.23) * 0.070270;
    float a = max(acc.a, 0.0001);
    gl_FragColor = vec4(acc.rgb / a, acc.a);
  }
`;

/**
 * Screen-space frost of the shaded sheet. The caller draws the sheet into
 * the map afterwards, sampling this texture, so depth testing still holds.
 */
export class DustSoftFrost {
  private readonly capture: THREE.WebGLRenderTarget;
  private readonly blurA: THREE.WebGLRenderTarget;
  private readonly blurB: THREE.WebGLRenderTarget;
  private readonly blurScene = new THREE.Scene();
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly clearColor = new THREE.Color();
  private readonly horizontal = new THREE.Vector2(1, 0);
  private readonly vertical = new THREE.Vector2(0, 1);
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor() {
    this.capture = new THREE.WebGLRenderTarget(1, 1, FROST_TARGET);
    this.blurA = new THREE.WebGLRenderTarget(1, 1, FROST_TARGET);
    this.blurB = new THREE.WebGLRenderTarget(1, 1, FROST_TARGET);
    markData(this.capture);
    markData(this.blurA);
    markData(this.blurB);
    this.blurCamera.matrixWorldAutoUpdate = false;
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.capture.texture },
        direction: { value: new THREE.Vector2(1, 0) },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: FROST_VERTEX,
      fragmentShader: FROST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.geometry = fullscreenTriangle();
    const blurMesh = new THREE.Mesh(this.geometry, this.blurMaterial);
    blurMesh.frustumCulled = false;
    this.blurScene.add(blurMesh);
  }

  get texture(): THREE.Texture {
    return this.blurB.texture;
  }

  captureAndBlur(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    if (this.disposed || scene.children.length === 0) return;
    const gl = renderer.getContext();
    const snapshot = snapshotGl(gl);
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    this.resize(renderer);
    gl.disable(gl.SCISSOR_TEST);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.capture);
    renderer.clear();
    renderer.render(scene, camera);
    this.blur(renderer, this.capture.texture, this.blurA, this.horizontal);
    this.blur(renderer, this.blurA.texture, this.blurB, this.vertical);
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    renderer.setClearColor(this.clearColor, previousClearAlpha);
    restoreGl(gl, snapshot);
  }

  private resize(renderer: THREE.WebGLRenderer) {
    const canvas = renderer.domElement;
    const width = Math.max(1, Math.floor(canvas.width * 0.85));
    const height = Math.max(1, Math.floor(canvas.height * 0.85));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.capture.setSize(width, height);
    this.blurA.setSize(width, height);
    this.blurB.setSize(width, height);
    markData(this.capture);
    markData(this.blurA);
    markData(this.blurB);
    (this.blurMaterial.uniforms.resolution!.value as THREE.Vector2).set(width, height);
  }

  private blur(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget,
    direction: THREE.Vector2,
  ) {
    this.blurMaterial.uniforms.tDiffuse!.value = source;
    (this.blurMaterial.uniforms.direction!.value as THREE.Vector2).copy(direction);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.blurScene, this.blurCamera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.capture.dispose();
    this.blurA.dispose();
    this.blurB.dispose();
    this.blurMaterial.dispose();
    this.geometry.dispose();
  }
}
