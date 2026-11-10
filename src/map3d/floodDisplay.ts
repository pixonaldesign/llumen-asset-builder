import * as THREE from "three";
import type { FloodUniforms, LoadedFloodGrid } from "@/lib/flood";
import { floodFloatTarget, runOffscreen } from "@/lib/floodSim";
import { FLOOD_DISPLAY_FRAGMENT, FLOOD_DISPLAY_VERTEX } from "@/lib/shaders/floodSurface";

/** Seconds for the drawn outline to settle most of the way onto a new sim state. */
export const FLOOD_EDGE_SETTLE_SECONDS = 0.35;

/** Inputs that change the display field; the sim state is redrawn every frame anyway. */
export function floodDisplayKey(uniforms: FloodUniforms, smoothing: number): string {
  const buildings = uniforms.uBuildings.value;
  return [
    uniforms.uSource.value,
    uniforms.uLevel.value,
    uniforms.uClassScale.value,
    uniforms.uHarborRest.value,
    uniforms.uShowHarbor.value,
    smoothing,
    buildings.uuid,
    buildings.version,
  ].join("|");
}

/** Share of the new coverage to take this frame; 1 when there is no motion to ease. */
export function floodEdgeBlend(frameSeconds: number, settleSeconds = FLOOD_EDGE_SETTLE_SECONDS): number {
  if (!(frameSeconds > 0) || !(settleSeconds > 0)) return 1;
  return 1 - Math.exp(-frameSeconds / settleSeconds);
}

/**
 * Smoothed wet coverage for drawing only. The heatmap and surface read it
 * through uDisplay to place the shoreline; depth everywhere stays raw. Two
 * targets ping-pong so each frame can ease from the last one.
 */
export class FloodDisplayField {
  private readonly targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly placeholder: THREE.DataTexture;
  private current = 0;
  private key = "";
  /** The last frame eased, so the next still frame snaps to the settled outline. */
  private easing = false;

  constructor(renderer: THREE.WebGLRenderer, grid: LoadedFloodGrid, uniforms: FloodUniforms) {
    this.targets = [
      floodFloatTarget(renderer, grid.cols, grid.rows),
      floodFloatTarget(renderer, grid.cols, grid.rows),
    ];
    this.placeholder = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    this.placeholder.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        // Sampling the target while rendering into it is a feedback loop.
        uDisplay: { value: this.placeholder },
        uUseDisplay: { value: 0 },
        uSmoothing: { value: 1 },
        uPrevCoverage: { value: this.targets[1].texture },
        uBlend: { value: 1 },
      },
      vertexShader: FLOOD_DISPLAY_VERTEX,
      fragmentShader: FLOOD_DISPLAY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get texture(): THREE.Texture {
    return this.targets[this.current]!.texture;
  }

  /**
   * `frameSeconds` is the wall-clock time the sim advanced this frame, 0 when
   * paused or static; the outline then snaps to the current state.
   */
  update(
    renderer: THREE.WebGLRenderer,
    uniforms: FloodUniforms,
    smoothing: number,
    simActive: boolean,
    frameSeconds: number,
  ): void {
    const key = floodDisplayKey(uniforms, smoothing);
    const blend = simActive ? floodEdgeBlend(frameSeconds) : 1;
    if (blend >= 1 && key === this.key && !this.easing) return;
    this.key = key;
    this.easing = blend < 1;
    const next = 1 - this.current;
    const u = this.material.uniforms;
    u.uSmoothing!.value = smoothing;
    u.uPrevCoverage!.value = this.targets[this.current]!.texture;
    u.uBlend!.value = blend;
    runOffscreen(renderer, () => {
      renderer.setRenderTarget(this.targets[next]!);
      renderer.render(this.scene, this.camera);
    });
    this.current = next;
    uniforms.uDisplay.value = this.texture;
  }

  dispose(): void {
    for (const target of this.targets) target.dispose();
    this.placeholder.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
