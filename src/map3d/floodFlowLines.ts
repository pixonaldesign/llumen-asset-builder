import * as THREE from "three";
import type { FloodLocalFrame, FloodUniforms, LoadedFloodGrid } from "@/lib/flood";
import { floodFloatTarget, runOffscreen } from "@/lib/floodSim";
import {
  FLOW_ADVECT_FRAGMENT,
  FLOW_LINE_FRAGMENT,
  FLOW_LINE_VERTEX,
  FLOW_PASS_VERTEX,
  FLOW_TRAIL_WRITE_FRAGMENT,
} from "@/lib/shaders/floodFlowLines";
import { hexToUnitRgba } from "@/lib/dustStormField";
import type { FloodSettings } from "@/lib/types";

/** Particles per side of the pool texture. */
export const FLOW_SIDE = 128;
/** Trail slots, written at an even interval across the trail duration. */
export const FLOW_TRAIL = 16;

/** Seconds between trail slot writes so the trail spans `seconds`. */
export function flowTrailInterval(seconds: number, trail = FLOW_TRAIL): number {
  return Math.max(seconds, 0.05) / (trail - 1);
}

/**
 * Advect passes per frame. Sim time past this budget is dropped from the
 * particles: one long Euler step would jump them across walls and past their
 * life, so at high playback speeds trails drift slower than the water instead.
 */
export const FLOW_MAX_PASSES = 32;

export type FlowLinePass = { seconds: number; write: boolean };

/**
 * Split a frame's sim seconds so every trail slot lands exactly one interval
 * after the previous one. No pass is longer than one interval.
 */
export function planFlowLinePasses(
  simSeconds: number,
  sinceWrite: number,
  interval: number,
  maxPasses = FLOW_MAX_PASSES,
): { passes: FlowLinePass[]; sinceWrite: number } {
  const passes: FlowLinePass[] = [];
  let remaining = Math.max(0, simSeconds);
  let since = sinceWrite;
  while (remaining > 0 && passes.length < maxPasses) {
    const toSlot = Math.max(interval - since, 0);
    if (toSlot <= remaining) {
      passes.push({ seconds: toSlot, write: true });
      remaining -= toSlot;
      since = 0;
    } else {
      passes.push({ seconds: remaining, write: false });
      since = Math.min(since + remaining, interval);
      remaining = 0;
    }
  }
  return { passes, sinceWrite: since };
}

/** Vertices to draw for a density, rounded down to whole particles. */
export function flowLineDrawCount(density: number, side = FLOW_SIDE, trail = FLOW_TRAIL): number {
  const particles = Math.floor(Math.min(1, Math.max(0, density)) * side * side);
  return particles * (trail - 1) * 2;
}

/** Line-segment refs: particle texel x, y, then segment * 2 + endpoint. */
export function buildFlowLineRefs(side = FLOW_SIDE, trail = FLOW_TRAIL): Float32Array {
  const segments = trail - 1;
  const refs = new Float32Array(side * side * segments * 2 * 3);
  let cursor = 0;
  // Spawn points are random per particle, so a prefix draw range stays spatially even.
  for (let i = 0; i < side * side; i += 1) {
    const x = i % side;
    const y = Math.floor(i / side);
    for (let s = 0; s < segments; s += 1) {
      for (let end = 0; end < 2; end += 1) {
        refs[cursor] = x;
        refs[cursor + 1] = y;
        refs[cursor + 2] = s * 2 + end;
        cursor += 3;
      }
    }
  }
  return refs;
}

export class FloodFlowLines {
  readonly mesh: THREE.LineSegments;
  private readonly particles: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly trail: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly advectMaterial: THREE.ShaderMaterial;
  private readonly writeMaterial: THREE.ShaderMaterial;
  private readonly lineMaterial: THREE.ShaderMaterial;
  private current = 0;
  private head = 0;
  private frame = 0;
  private sinceWrite = 0;
  private interval = flowTrailInterval(8);
  private needsClear = true;

  constructor(
    renderer: THREE.WebGLRenderer,
    grid: LoadedFloodGrid,
    uniforms: FloodUniforms,
    localFrame: FloodLocalFrame,
  ) {
    this.particles = [
      floodFloatTarget(renderer, FLOW_SIDE, FLOW_SIDE),
      floodFloatTarget(renderer, FLOW_SIDE, FLOW_SIDE),
    ];
    this.trail = floodFloatTarget(renderer, FLOW_SIDE, FLOW_SIDE * FLOW_TRAIL);
    const pass = (fragmentShader: string, extra: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        uniforms: extra,
        vertexShader: FLOW_PASS_VERTEX,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
    this.advectMaterial = pass(FLOW_ADVECT_FRAGMENT, {
      uParticles: { value: null },
      uSimState: uniforms.uSimState,
      uBuildings: uniforms.uBuildings,
      uCols: { value: grid.cols },
      uRows: { value: grid.rows },
      uCell: { value: grid.cellMeters },
      uStep: { value: 0 },
      uLifeMin: { value: 0 },
      uLifeSpan: { value: 0 },
      uSeed: { value: 0 },
    });
    this.writeMaterial = pass(FLOW_TRAIL_WRITE_FRAGMENT, {
      uParticles: { value: null },
      uSlotOffset: { value: 0 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.advectMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.lineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        uParticles: { value: this.particles[0].texture },
        uTrail: { value: this.trail.texture },
        uHead: { value: 0 },
        uTrailLength: { value: FLOW_TRAIL },
        uSide: { value: FLOW_SIDE },
        uInterval: { value: this.interval },
        uSinceWrite: { value: 0 },
        uFrame: {
          value: new THREE.Vector4(localFrame.x0, localFrame.z0, localFrame.dx, localFrame.dz),
        },
        uLineColor: { value: new THREE.Vector3(1, 1, 1) },
        uLineOpacity: { value: 0.75 },
      },
      vertexShader: FLOW_LINE_VERTEX,
      fragmentShader: FLOW_LINE_FRAGMENT,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(buildFlowLineRefs(), 3));
    this.mesh = new THREE.LineSegments(geometry, this.lineMaterial);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  reset(): void {
    this.needsClear = true;
  }

  applySettings(settings: FloodSettings): void {
    const [r, g, b] = hexToUnitRgba(settings.flowLineColor);
    (this.lineMaterial.uniforms.uLineColor!.value as THREE.Vector3).set(r, g, b);
    this.lineMaterial.uniforms.uLineOpacity!.value = settings.flowLineOpacity;
    this.mesh.geometry.setDrawRange(0, flowLineDrawCount(settings.flowLineDensity));
    const interval = flowTrailInterval(settings.flowLineSeconds);
    // Slot ages are derived from the interval, so old slots are wrong under a new one.
    if (interval !== this.interval) this.needsClear = true;
    this.interval = interval;
    this.lineMaterial.uniforms.uInterval!.value = this.interval;
    const au = this.advectMaterial.uniforms;
    au.uLifeMin!.value = settings.flowLineSeconds * 1.2;
    au.uLifeSpan!.value = settings.flowLineSeconds * 1.5;
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

  private advect(renderer: THREE.WebGLRenderer, seconds: number): void {
    const next = 1 - this.current;
    this.frame += 1;
    const au = this.advectMaterial.uniforms;
    au.uParticles!.value = this.particles[this.current]!.texture;
    au.uStep!.value = seconds;
    au.uSeed!.value = this.frame % 9973;
    this.draw(renderer, this.advectMaterial, this.particles[next]!);
    this.current = next;
  }

  private writeSlot(renderer: THREE.WebGLRenderer): void {
    this.head = (this.head + 1) % FLOW_TRAIL;
    const offset = this.head * FLOW_SIDE;
    this.trail.viewport.set(0, offset, FLOW_SIDE, FLOW_SIDE);
    this.trail.scissor.set(0, offset, FLOW_SIDE, FLOW_SIDE);
    this.trail.scissorTest = true;
    this.writeMaterial.uniforms.uParticles!.value = this.particles[this.current]!.texture;
    this.writeMaterial.uniforms.uSlotOffset!.value = offset;
    this.draw(renderer, this.writeMaterial, this.trail);
    this.trail.viewport.set(0, 0, FLOW_SIDE, FLOW_SIDE * FLOW_TRAIL);
    this.trail.scissorTest = false;
  }

  /**
   * Advance by `simSeconds`, the sim time the water advanced this frame. Ages
   * and slot spacing are in sim seconds too, so a trail always spans the same
   * stretch of flow and playback speed only changes how fast it plays.
   */
  update(renderer: THREE.WebGLRenderer, simSeconds: number): void {
    if (simSeconds <= 0 && !this.needsClear) return;
    runOffscreen(renderer, () => {
      if (this.needsClear) {
        renderer.setClearColor(0x000000, 0);
        for (const target of [...this.particles, this.trail]) {
          target.scissorTest = false;
          renderer.setRenderTarget(target);
          renderer.clear(true, false, false);
        }
        this.needsClear = false;
        this.head = 0;
        this.sinceWrite = 0;
      }
      const plan = planFlowLinePasses(simSeconds, this.sinceWrite, this.interval);
      for (const pass of plan.passes) {
        if (pass.seconds > 0) this.advect(renderer, pass.seconds);
        if (pass.write) this.writeSlot(renderer);
      }
      this.sinceWrite = plan.sinceWrite;
    });
    this.lineMaterial.uniforms.uParticles!.value = this.particles[this.current]!.texture;
    this.lineMaterial.uniforms.uHead!.value = this.head;
    this.lineMaterial.uniforms.uSinceWrite!.value = this.sinceWrite;
  }

  dispose(): void {
    for (const target of [...this.particles, this.trail]) target.dispose();
    this.advectMaterial.dispose();
    this.writeMaterial.dispose();
    this.lineMaterial.dispose();
    this.quad.geometry.dispose();
    this.mesh.geometry.dispose();
  }
}
