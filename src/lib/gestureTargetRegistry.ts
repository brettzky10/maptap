/**
 * A splat layer with `gestureControl` on registers itself here with its own
 * zoom/pan/rotate functions (closing over its own camera, OrbitControls, and
 * distance limits). HandGestureManager computes one shared gesture per frame
 * and applies it to every currently-registered target — if two layers both
 * have gesture control on, they move in lockstep, which is an acceptable
 * edge case (most setups will only gesture-control one model at a time).
 */
export interface GestureTarget {
  zoom(delta: number): void;
  pan(dx: number, dy: number): void;
  rotate(dx: number, dy: number): void;
}

class GestureTargetRegistry {
  private targets = new Map<string, GestureTarget>();

  register(id: string, target: GestureTarget) {
    this.targets.set(id, target);
  }

  unregister(id: string) {
    this.targets.delete(id);
  }

  zoomAll(delta: number) {
    this.targets.forEach((t) => t.zoom(delta));
  }

  panAll(dx: number, dy: number) {
    this.targets.forEach((t) => t.pan(dx, dy));
  }

  rotateAll(dx: number, dy: number) {
    this.targets.forEach((t) => t.rotate(dx, dy));
  }

  get size() {
    return this.targets.size;
  }
}

export const gestureTargetRegistry = new GestureTargetRegistry();
