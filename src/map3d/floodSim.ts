import * as THREE from "three";
import { floodChannel, type LoadedFloodGrid } from "@/lib/flood";
import {
  FLOOD_SIM_FLUX_FRAGMENT,
  FLOOD_SIM_INIT_FRAGMENT,
  FLOOD_SIM_STATE_FRAGMENT,
  FLOOD_SIM_VERTEX,
} from "@/lib/shaders/floodSim";
import type { FloodSettings } from "@/lib/types";

/** Largest stable step for 4 m cells and a few meters of harbor depth. */
export const FLOOD_SIM_MAX_DT = 0.25;
export const FLOOD_SIM_DAMPING = 0.999;
export const FLOOD_SIM_BREACH_RADIUS_CELLS = 3;

/** Harbor level the sim boundary holds for a source, NAVD88 meters. */
export function floodSimHarborLevel(
  settings: Pick<FloodSettings, "simSource" | "simSurgeMeters">,
  mhhw: number,
): number {
  return settings.simSource === "surge" ? mhhw + settings.simSurgeMeters : mhhw;
}

/** Half the shallow-water CFL limit for the deepest water the boundary can produce. */
export function floodSimStableDt(maxDepthMeters: number, cellMeters: number): number {
  const speed = Math.sqrt(9.81 * Math.max(0.1, maxDepthMeters));
  return Math.min(FLOOD_SIM_MAX_DT, (0.5 * cellMeters) / speed);
}

/** Substep size and count for one rendered frame. */
export function floodSimSteps(
  frameSeconds: number,
  simSpeed: number,
  substeps: number,
  maxDt = FLOOD_SIM_MAX_DT,
): { dt: number; steps: number } {
  const simSeconds = Math.max(0, frameSeconds) * Math.max(0, simSpeed);
  if (simSeconds <= 0 || maxDt <= 0) return { dt: 0, steps: 0 };
  const steps = Math.max(
    1,
    Math.min(Math.max(1, Math.round(substeps)) * 4, Math.ceil(simSeconds / maxDt)),
  );
  return { dt: Math.min(maxDt, simSeconds / steps), steps };
}

export function breachCellCount(radius: number): number {
  let count = 0;
  const r = Math.ceil(radius);
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (Math.hypot(x, y) <= radius) count += 1;
    }
  }
  return count;
}

export type FloodSimCpuGrid = {
  cols: number;
  rows: number;
  cell: number;
  ground: Float32Array;
  walls: Uint8Array;
  harbor: Uint8Array;
};

export type FloodSimCpuState = {
  depth: Float32Array;
  /** Four per cell: west, east, south, north outflow. */
  flux: Float32Array;
};

/** CPU mirror of one flux + state pass, for tests and reference runs. */
export function floodSimCpuStep(
  grid: FloodSimCpuGrid,
  state: FloodSimCpuState,
  dt: number,
  harborLevel: number,
  rainMetersPerSecond = 0,
): FloodSimCpuState {
  const { cols, rows, cell } = grid;
  const count = cols * rows;
  const flux = new Float32Array(count * 4);
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  const head = (i: number) => grid.ground[i]! + state.depth[i]!;
  const offsets: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const depth = state.depth[i]!;
      if (grid.walls[i] || depth <= 0) continue;
      let out = 0;
      offsets.forEach(([dc, dr], k) => {
        const nc = c + dc;
        const nr = r + dr;
        if (!inside(nc, nr)) return;
        const n = nr * cols + nc;
        if (grid.walls[n]) return;
        const f = Math.max(
          0,
          state.flux[i * 4 + k]! * FLOOD_SIM_DAMPING + dt * 9.81 * cell * (head(i) - head(n)),
        );
        flux[i * 4 + k] = f;
        out += f;
      });
      const volume = depth * cell * cell;
      if (out * dt > volume) {
        const scale = volume / (out * dt);
        for (let k = 0; k < 4; k += 1) flux[i * 4 + k] = flux[i * 4 + k]! * scale;
      }
    }
  }
  const depth = new Float32Array(count);
  const fluxAt = (c: number, r: number, k: number) =>
    inside(c, r) ? flux[(r * cols + c) * 4 + k]! : 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (grid.walls[i]) continue;
      const inflow =
        fluxAt(c - 1, r, 1) + fluxAt(c + 1, r, 0) + fluxAt(c, r - 1, 3) + fluxAt(c, r + 1, 2);
      const outflow = flux[i * 4]! + flux[i * 4 + 1]! + flux[i * 4 + 2]! + flux[i * 4 + 3]!;
      let next = Math.max(0, state.depth[i]! + (dt * (inflow - outflow)) / (cell * cell));
      next += rainMetersPerSecond * dt;
      if (grid.harbor[i]) next = Math.max(harborLevel - grid.ground[i]!, 0);
      depth[i] = next;
    }
  }
  return { depth, flux };
}

type GlSnapshot = {
  framebuffer: WebGLFramebuffer | null;
  viewport: Int32Array;
  scissor: Int32Array;
  scissorTest: boolean;
};

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

/** Run offscreen passes on Mapbox's context and hand its framebuffer state back untouched. */
export function runOffscreen(renderer: THREE.WebGLRenderer, passes: () => void): void {
  const gl = renderer.getContext();
  const snapshot = snapshotGl(gl);
  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  const previousClearColor = renderer.getClearColor(new THREE.Color());
  const previousClearAlpha = renderer.getClearAlpha();
  try {
    renderer.resetState();
    renderer.autoClear = false;
    passes();
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    restoreGl(gl, snapshot);
  }
}

/** Float when the context can render to it, else half float. */
export function floodFloatTarget(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    type: renderer.extensions.has("EXT_color_buffer_float")
      ? THREE.FloatType
      : THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

export type FloodSimRun = {
  harborLevel: number;
  rainMetersPerSecond: number;
  breachFlow: number;
  breachCell: { col: number; row: number } | null;
};

/**
 * GPU solver. State and flux ping-pong between two float targets each. All
 * passes run from the custom layer's prerender, and restore Mapbox's
 * framebuffer afterwards.
 */
export class FloodSim {
  readonly cols: number;
  readonly rows: number;
  /** Lowest ground in the grid, which bounds the deepest water. */
  readonly minGround: number;
  private readonly cell: number;
  private readonly state: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly flux: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly initMaterial: THREE.ShaderMaterial;
  private readonly fluxMaterial: THREE.ShaderMaterial;
  private readonly stateMaterial: THREE.ShaderMaterial;
  private current = 0;
  private needsReset = true;
  /** Simulated seconds since the last reset. */
  simSeconds = 0;
  readonly floatPrecision: boolean;

  constructor(
    renderer: THREE.WebGLRenderer,
    grid: LoadedFloodGrid,
    gridTex: THREE.Texture,
    buildingTex: THREE.Texture,
  ) {
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cell = grid.cellMeters;
    let minGround = Infinity;
    for (const ground of floodChannel(grid, 0)) {
      if (ground < minGround) minGround = ground;
    }
    this.minGround = Number.isFinite(minGround) ? minGround : 0;
    this.floatPrecision = renderer.extensions.has("EXT_color_buffer_float");
    const target = () => floodFloatTarget(renderer, this.cols, this.rows);
    this.state = [target(), target()];
    this.flux = [target(), target()];
    const common = () => ({
      uGrid: { value: gridTex },
      uBuildings: { value: buildingTex },
      uCols: { value: this.cols },
      uRows: { value: this.rows },
      uCell: { value: this.cell },
      uDt: { value: FLOOD_SIM_MAX_DT },
      uHarborLevel: { value: grid.datums.MHHW ?? 0.7 },
    });
    const material = (fragmentShader: string, extra: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        uniforms: { ...common(), ...extra },
        vertexShader: FLOOD_SIM_VERTEX,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
    this.initMaterial = material(FLOOD_SIM_INIT_FRAGMENT, {});
    this.fluxMaterial = material(FLOOD_SIM_FLUX_FRAGMENT, {
      uState: { value: null },
      uFlux: { value: null },
      uDamping: { value: FLOOD_SIM_DAMPING },
    });
    this.stateMaterial = material(FLOOD_SIM_STATE_FRAGMENT, {
      uState: { value: null },
      uFlux: { value: null },
      uRain: { value: 0 },
      uBreachFlow: { value: 0 },
      uBreachCell: { value: new THREE.Vector2(-1000, -1000) },
      uBreachRadius: { value: FLOOD_SIM_BREACH_RADIUS_CELLS },
      uBreachCells: { value: breachCellCount(FLOOD_SIM_BREACH_RADIUS_CELLS) },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.initMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  stableDt(harborLevel: number): number {
    return floodSimStableDt(harborLevel - this.minGround, this.cell);
  }

  get texture(): THREE.Texture {
    return this.state[this.current]!.texture;
  }

  reset(): void {
    this.needsReset = true;
  }

  setBuildings(buildingTex: THREE.Texture): void {
    for (const material of [this.initMaterial, this.fluxMaterial, this.stateMaterial]) {
      material.uniforms.uBuildings!.value = buildingTex;
    }
  }

  private draw(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget,
  ): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  /** Advance by `steps` substeps of `dt` seconds. */
  step(
    renderer: THREE.WebGLRenderer,
    run: FloodSimRun,
    dt: number,
    steps: number,
  ): void {
    if (!this.needsReset && (steps <= 0 || dt <= 0)) return;
    runOffscreen(renderer, () => {
      for (const material of [this.initMaterial, this.fluxMaterial, this.stateMaterial]) {
        material.uniforms.uHarborLevel!.value = run.harborLevel;
        material.uniforms.uDt!.value = dt;
      }
      if (this.needsReset) {
        renderer.setClearColor(0x000000, 0);
        for (const target of [...this.flux, ...this.state]) {
          renderer.setRenderTarget(target);
          renderer.clear(true, false, false);
        }
        this.current = 0;
        this.draw(renderer, this.initMaterial, this.state[0]!);
        this.needsReset = false;
        this.simSeconds = 0;
      }
      const su = this.stateMaterial.uniforms;
      su.uRain!.value = run.rainMetersPerSecond;
      su.uBreachFlow!.value = run.breachCell ? run.breachFlow : 0;
      (su.uBreachCell!.value as THREE.Vector2).set(
        run.breachCell?.col ?? -1000,
        run.breachCell?.row ?? -1000,
      );
      for (let i = 0; i < steps; i += 1) {
        const next = 1 - this.current;
        this.fluxMaterial.uniforms.uState!.value = this.state[this.current]!.texture;
        this.fluxMaterial.uniforms.uFlux!.value = this.flux[this.current]!.texture;
        this.draw(renderer, this.fluxMaterial, this.flux[next]!);
        su.uState!.value = this.state[this.current]!.texture;
        su.uFlux!.value = this.flux[next]!.texture;
        this.draw(renderer, this.stateMaterial, this.state[next]!);
        this.current = next;
        this.simSeconds += dt;
      }
    });
  }

  dispose(): void {
    for (const target of [...this.state, ...this.flux]) target.dispose();
    this.initMaterial.dispose();
    this.fluxMaterial.dispose();
    this.stateMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
