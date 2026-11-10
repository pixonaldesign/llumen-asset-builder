import * as THREE from "three";

const TARGET: THREE.RenderTargetOptions = {
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

/**
 * Draws the oil field into its own buffer so it can be composited over the
 * map. The field is already filtered in the slick shader. Blurring this
 * buffer smears the sheen streaks into the black fill and leaves an outline
 * on the contour.
 */
export class OilSpillSmooth {
  private readonly capture: THREE.WebGLRenderTarget;
  private readonly blurA: THREE.WebGLRenderTarget;
  private readonly blurB: THREE.WebGLRenderTarget;
  private readonly blurScene = new THREE.Scene();
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private width = 1;
  private height = 1;

  constructor() {
    this.capture = new THREE.WebGLRenderTarget(1, 1, TARGET);
    this.blurA = new THREE.WebGLRenderTarget(1, 1, { ...TARGET, depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(1, 1, { ...TARGET, depthBuffer: false });
    this.blurCamera.matrixWorldAutoUpdate = false;
    this.compositeCamera.matrixWorldAutoUpdate = false;

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        direction: { value: new THREE.Vector2(1, 0) },
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
        uniform vec2 resolution;
        varying vec2 vUv;
        vec4 tap(vec2 uv) {
          vec4 c = texture2D(tDiffuse, uv);
          return vec4(c.rgb * c.a, c.a);
        }
        void main() {
          // A wide kernel blends the black core into the sheen and leaves a
          // drop shadow on the contour. One texel is enough to hide the grid.
          vec2 stepUv = direction * 0.65 / resolution;
          vec4 acc = vec4(0.0);
          acc += tap(vUv) * 0.5;
          acc += tap(vUv + stepUv) * 0.25;
          acc += tap(vUv - stepUv) * 0.25;
          float a = max(acc.a, 0.0001);
          gl_FragColor = vec4(acc.rgb / a, acc.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const blurMesh = new THREE.Mesh(fullscreenTriangle(), this.blurMaterial);
    blurMesh.frustumCulled = false;
    this.blurScene.add(blurMesh);

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: { tOil: { value: this.blurB.texture } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tOil;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tOil, vUv);
          if (c.a < 0.004) discard;
          gl_FragColor = c;
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const compositeMesh = new THREE.Mesh(
      fullscreenTriangle(),
      this.compositeMaterial,
    );
    compositeMesh.frustumCulled = false;
    this.compositeScene.add(compositeMesh);
  }

  private resize(renderer: THREE.WebGLRenderer) {
    const canvas = renderer.domElement;
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.capture.setSize(width, height);
    this.blurA.setSize(width, height);
    this.blurB.setSize(width, height);
    (
      this.blurMaterial.uniforms.resolution as { value: THREE.Vector2 }
    ).value.set(width, height);
  }

  present(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    oilScene: THREE.Scene,
  ) {
    if (oilScene.children.length === 0) return;
    const gl = renderer.getContext();
    const snapshot = snapshotGl(gl);
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    this.resize(renderer);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.capture);
    renderer.clear();
    renderer.render(oilScene, camera);
    (this.compositeMaterial.uniforms.tOil as { value: THREE.Texture }).value =
      this.capture.texture;
    renderer.setRenderTarget(previousTarget);
    restoreGl(gl, snapshot);
    renderer.autoClear = false;
    renderer.render(this.compositeScene, this.compositeCamera);
    renderer.autoClear = previousAutoClear;
  }

  dispose() {
    this.capture.dispose();
    this.blurA.dispose();
    this.blurB.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
