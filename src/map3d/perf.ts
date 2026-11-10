export class FpsSampler {
  private frames = 0;
  private lastTs = 0;
  private fps = 0;

  tick(now = performance.now()): number {
    if (!this.lastTs) this.lastTs = now;
    this.frames += 1;
    const elapsed = now - this.lastTs;
    if (elapsed >= 500) {
      this.fps = (this.frames * 1000) / elapsed;
      this.frames = 0;
      this.lastTs = now;
    }
    return this.fps;
  }

  get value(): number {
    return this.fps;
  }
}

export function defaultPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 1.5);
}

export const DEFAULT_MAX_POINTS = 8000;
