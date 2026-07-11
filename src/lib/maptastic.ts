"use client";

/**
 * Maptastic (TypeScript port)
 * ---------------------------
 * Ported from the original vanilla-JS Maptastic engine. Maptastic's only job
 * is perspective ("quad-warp") mapping of DOM elements — it does NOT manage
 * stacking order. Layer z-index is the caller's responsibility (see
 * ProjectionStage, which derives it from list position).
 *
 * Fixes vs. the original source this was ported from:
 *  - `addLayer` had a dead-code path referencing an out-of-scope `layout[i]`
 *    when updating an already-registered layer; it now correctly clones the
 *    provided targetPoints onto the existing layer.
 *  - The original called a global `solve(a, b, true)` for the 8x8 DLT/
 *    homography system without shipping that solver. `solveLinearSystem`
 *    below (Gaussian elimination w/ partial pivoting) replaces it.
 *  - Added `removeLayer` and `destroy` so a React effect can cleanly tear
 *    this down (window listeners, canvas element) without leaking.
 *  - `storageKey` is configurable instead of a single hardcoded key, since a
 *    page may want independent saved layouts per project.
 */

export type Point = [number, number];

export interface MaptasticLayerLayout {
  id: string;
  targetPoints: Point[];
  sourcePoints: Point[];
}

export interface MaptasticConfig {
  /** Show the element id label in the center of each quad while editing. Default true. */
  labels?: boolean;
  /** Draw mouse crosshairs while editing. Default false. */
  crosshairs?: boolean;
  /** Show the "screen bounds" calibration overlay (toggle with the B key). Default false. */
  screenbounds?: boolean;
  /** Persist layout to localStorage automatically on every change. Default true. */
  autoSave?: boolean;
  /** Load a previously saved layout from localStorage on init. Default true. */
  autoLoad?: boolean;
  /** localStorage key used for autoSave/autoLoad. */
  storageKey?: string;
  /** Called whenever the layout changes (drag, keyboard nudge, etc). */
  onchange?: () => void;
}

export interface MaptasticInstance {
  getLayout(): MaptasticLayerLayout[];
  setLayout(layout: MaptasticLayerLayout[]): void;
  setConfigEnabled(enabled: boolean): void;
  addLayer(target: string | HTMLElement, targetPoints?: Point[]): void;
  removeLayer(target: string | HTMLElement): void;
  isConfigEnabled(): boolean;
  destroy(): void;
}

interface InternalLayer {
  visible: boolean;
  element: HTMLElement;
  width: number;
  height: number;
  sourcePoints: Point[];
  targetPoints: Point[];
}

function clonePoints(points: Point[]): Point[] {
  return points.map((p) => [p[0], p[1]] as Point);
}

function distanceTo(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function pointInTriangle(point: Point, a: Point, b: Point, c: Point) {
  let s = a[1] * c[0] - a[0] * c[1] + (c[1] - a[1]) * point[0] + (a[0] - c[0]) * point[1];
  let t = a[0] * b[1] - a[1] * b[0] + (a[1] - b[1]) * point[0] + (b[0] - a[0]) * point[1];

  if (s < 0 !== t < 0) return false;

  let A = -b[1] * c[0] + a[1] * (c[0] - b[0]) + a[0] * (b[1] - c[1]) + b[0] * c[1];
  if (A < 0) {
    s = -s;
    t = -t;
    A = -A;
  }
  return s > 0 && t > 0 && s + t < A;
}

function pointInLayer(point: Point, layer: InternalLayer) {
  const a = pointInTriangle(point, layer.targetPoints[0], layer.targetPoints[1], layer.targetPoints[2]);
  const b = pointInTriangle(point, layer.targetPoints[3], layer.targetPoints[0], layer.targetPoints[2]);
  return a || b;
}

function swapLayerPoints(points: Point[], i1: number, i2: number) {
  const tx = points[i1][0];
  const ty = points[i1][1];
  points[i1][0] = points[i2][0];
  points[i1][1] = points[i2][1];
  points[i2][0] = tx;
  points[i2][1] = ty;
}

/** Gaussian elimination with partial pivoting. Solves A x = b for square A. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const pivotVal = M[col][col] || 1e-12;
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivotVal;
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let col = row + 1; col < n; col++) sum -= M[row][col] * x[col];
    x[row] = sum / (M[row][row] || 1e-12);
  }
  return x;
}

export function createMaptastic(config: MaptasticConfig = {}): MaptasticInstance {
  const showLayerNames = config.labels ?? true;
  let showCrosshairs = config.crosshairs ?? false;
  let showScreenBounds = config.screenbounds ?? false;
  const autoSave = config.autoSave ?? true;
  const autoLoad = config.autoLoad ?? true;
  const storageKey = config.storageKey ?? "maptastic.layers";
  const notifyChange = config.onchange ?? (() => {});

  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;

  const layers: InternalLayer[] = [];

  let configActive = false;
  let dragging = false;

  let selectedLayer: InternalLayer | null = null;
  let selectedPoint: Point | null = null;
  const selectionRadius = 20;
  let hoveringPoint: Point | null = null;
  let hoveringLayer: InternalLayer | null = null;
  let isLayerSoloed = false;

  const mousePosition: Point = [0, 0];
  const mouseDelta: Point = [0, 0];

  function findLayer(target: string | HTMLElement): InternalLayer | undefined {
    const id = typeof target === "string" ? target : target.id;
    return layers.find((l) => l.element.id === id);
  }

  function draw() {
    if (!configActive || !canvas || !context) return;
    const ctx = context;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const layer of layers) {
      if (!layer.visible) {
        layer.element.style.visibility = "hidden";
        continue;
      }
      layer.element.style.visibility = "visible";

      ctx.beginPath();
      ctx.strokeStyle = layer === hoveringLayer || layer === selectedLayer ? "red" : "white";
      ctx.moveTo(layer.targetPoints[0][0], layer.targetPoints[0][1]);
      for (const p of layer.targetPoints) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(layer.targetPoints[3][0], layer.targetPoints[3][1]);
      ctx.closePath();
      ctx.stroke();

      const centerPoint: Point = [0, 0];
      for (const p of layer.targetPoints) {
        ctx.strokeStyle = p === hoveringPoint || p === selectedPoint ? "red" : "white";
        centerPoint[0] += p[0];
        centerPoint[1] += p[1];
        ctx.beginPath();
        ctx.arc(p[0], p[1], selectionRadius / 2, 0, 2 * Math.PI, false);
        ctx.stroke();
      }
      centerPoint[0] /= 4;
      centerPoint[1] /= 4;

      if (showLayerNames) {
        const label = layer.element.id.toUpperCase();
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        const metrics = ctx.measureText(label);
        const size = [metrics.width + 8, 32];
        ctx.fillStyle = "white";
        ctx.fillRect(centerPoint[0] - size[0] / 2, centerPoint[1] - size[1] + 8, size[0], size[1]);
        ctx.fillStyle = "black";
        ctx.fillText(label, centerPoint[0], centerPoint[1]);
      }
    }

    if (showCrosshairs) {
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mousePosition[0], 0);
      ctx.lineTo(mousePosition[0], canvas.height);
      ctx.moveTo(0, mousePosition[1]);
      ctx.lineTo(canvas.width, mousePosition[1]);
      ctx.stroke();
    }

    if (showScreenBounds) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#909090";
      ctx.beginPath();
      const stepX = canvas.width / 10;
      const stepY = canvas.height / 10;
      for (let i = 0; i < 10; i++) {
        ctx.moveTo(i * stepX, 0);
        ctx.lineTo(i * stepX, canvas.height);
        ctx.moveTo(0, i * stepY);
        ctx.lineTo(canvas.width, i * stepY);
      }
      ctx.stroke();
      ctx.strokeStyle = "white";
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

      const fontSize = Math.round(stepY * 0.6);
      ctx.font = `${fontSize}px monospace, sans-serif`;
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.fillText(`${canvas.width} x ${canvas.height}`, canvas.width / 2, canvas.height / 2 + fontSize * 0.75);
      ctx.fillText("display size", canvas.width / 2, canvas.height / 2 - fontSize * 0.75);
    }
  }

  function rotateLayer(layer: InternalLayer, angle: number) {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const center: Point = [0, 0];
    for (const p of layer.targetPoints) {
      center[0] += p[0];
      center[1] += p[1];
    }
    center[0] /= 4;
    center[1] /= 4;
    for (const p of layer.targetPoints) {
      const px = p[0] - center[0];
      const py = p[1] - center[1];
      p[0] = px * c - py * s + center[0];
      p[1] = px * s + py * c + center[1];
    }
  }

  function scaleLayer(layer: InternalLayer, scale: number) {
    const center: Point = [0, 0];
    for (const p of layer.targetPoints) {
      center[0] += p[0];
      center[1] += p[1];
    }
    center[0] /= 4;
    center[1] /= 4;
    for (const p of layer.targetPoints) {
      const px = p[0] - center[0];
      const py = p[1] - center[1];
      p[0] = px * scale + center[0];
      p[1] = py * scale + center[1];
    }
  }

  function updateTransform() {
    const transformProp = "transform";
    for (const layer of layers) {
      const a: number[][] = [];
      const b: number[] = [];
      for (let i = 0; i < layer.sourcePoints.length; i++) {
        const s = layer.sourcePoints[i];
        const t = layer.targetPoints[i];
        a.push([s[0], s[1], 1, 0, 0, 0, -s[0] * t[0], -s[1] * t[0]]);
        b.push(t[0]);
        a.push([0, 0, 0, s[0], s[1], 1, -s[0] * t[1], -s[1] * t[1]]);
        b.push(t[1]);
      }
      const X = solveLinearSystem(a, b);
      const matrix = [
        X[0], X[3], 0, X[6],
        X[1], X[4], 0, X[7],
        0, 0, 1, 0,
        X[2], X[5], 0, 1,
      ];
      layer.element.style[transformProp as any] = `matrix3d(${matrix.join(",")})`;
      layer.element.style[(transformProp + "Origin") as any] = "0px 0px 0px";
    }
  }

  function keyDown(event: KeyboardEvent) {
    if (!configActive) {
      if (event.code === "Space" && event.shiftKey) setConfigEnabled(true);
      return;
    }

    const increment = event.shiftKey ? 10 : 1;
    let dirty = false;
    const delta: Point = [0, 0];

    switch (event.keyCode) {
      case 32: // space
        if (event.shiftKey) {
          setConfigEnabled(false);
          return;
        }
        break;
      case 37: delta[0] -= increment; break; // left
      case 38: delta[1] -= increment; break; // up
      case 39: delta[0] += increment; break; // right
      case 40: delta[1] += increment; break; // down
      case 67: // C - crosshairs
        showCrosshairs = !showCrosshairs;
        dirty = true;
        break;
      case 83: // S - solo/unsolo
        if (!isLayerSoloed) {
          if (selectedLayer) {
            for (const l of layers) l.visible = false;
            selectedLayer.visible = true;
            isLayerSoloed = true;
            dirty = true;
          }
        } else {
          for (const l of layers) l.visible = true;
          isLayerSoloed = false;
          dirty = true;
        }
        break;
      case 66: // B - screen bounds
        showScreenBounds = !showScreenBounds;
        draw();
        break;
      case 72: // H - flip horizontal
        if (selectedLayer) {
          swapLayerPoints(selectedLayer.sourcePoints, 0, 1);
          swapLayerPoints(selectedLayer.sourcePoints, 3, 2);
          updateTransform();
          draw();
        }
        break;
      case 86: // V - flip vertical
        if (selectedLayer) {
          swapLayerPoints(selectedLayer.sourcePoints, 0, 3);
          swapLayerPoints(selectedLayer.sourcePoints, 1, 2);
          updateTransform();
          draw();
        }
        break;
      case 82: // R - rotate 90
        if (selectedLayer) {
          rotateLayer(selectedLayer, Math.PI / 2);
          updateTransform();
          draw();
        }
        break;
    }

    if (!showScreenBounds) {
      if (selectedPoint) {
        selectedPoint[0] += delta[0];
        selectedPoint[1] += delta[1];
        dirty = true;
      } else if (selectedLayer) {
        if (event.altKey) {
          rotateLayer(selectedLayer, delta[0] * 0.01);
          scaleLayer(selectedLayer, delta[1] * -0.005 + 1);
        } else {
          for (const p of selectedLayer.targetPoints) {
            p[0] += delta[0];
            p[1] += delta[1];
          }
        }
        dirty = true;
      }
    }

    if (dirty) {
      updateTransform();
      draw();
      if (autoSave) saveSettings();
      notifyChange();
    }
  }

  function mouseMove(event: MouseEvent) {
    if (!configActive || !canvas) return;
    event.preventDefault();

    mouseDelta[0] = event.clientX - mousePosition[0];
    mouseDelta[1] = event.clientY - mousePosition[1];
    mousePosition[0] = event.clientX;
    mousePosition[1] = event.clientY;

    if (dragging) {
      const scale = event.shiftKey ? 0.1 : 1;
      if (selectedPoint) {
        selectedPoint[0] += mouseDelta[0] * scale;
        selectedPoint[1] += mouseDelta[1] * scale;
      } else if (selectedLayer) {
        if (event.altKey) {
          rotateLayer(selectedLayer, mouseDelta[0] * (0.01 * scale));
          scaleLayer(selectedLayer, mouseDelta[1] * (-0.005 * scale) + 1);
        } else {
          for (const p of selectedLayer.targetPoints) {
            p[0] += mouseDelta[0] * scale;
            p[1] += mouseDelta[1] * scale;
          }
        }
      }
      updateTransform();
      if (autoSave) saveSettings();
      draw();
      notifyChange();
    } else {
      canvas.style.cursor = "default";
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      const previousPoint = hoveringPoint != null;
      const previousLayer = hoveringLayer != null;

      hoveringPoint = null;
      for (const layer of layers) {
        if (!layer.visible) continue;
        for (const p of layer.targetPoints) {
          if (distanceTo(p[0], p[1], mouseX, mouseY) < selectionRadius) {
            canvas.style.cursor = "pointer";
            hoveringPoint = p;
            break;
          }
        }
        if (hoveringPoint) break;
      }

      hoveringLayer = null;
      for (const layer of layers) {
        if (layer.visible && pointInLayer(mousePosition, layer)) {
          hoveringLayer = layer;
          break;
        }
      }

      if (showCrosshairs || previousPoint !== (hoveringPoint != null) || previousLayer !== (hoveringLayer != null)) {
        draw();
      }
    }
  }

  function mouseUp(event: MouseEvent) {
    if (!configActive) return;
    event.preventDefault();
    dragging = false;
  }

  function mouseDown(event: MouseEvent) {
    if (!configActive || showScreenBounds || !canvas) return;
    event.preventDefault();

    hoveringPoint = null;

    if (hoveringLayer) {
      selectedLayer = hoveringLayer;
      dragging = true;
    } else {
      selectedLayer = null;
    }
    selectedPoint = null;

    const mouseX = event.clientX;
    const mouseY = event.clientY;

    for (const layer of layers) {
      for (const p of layer.targetPoints) {
        if (distanceTo(p[0], p[1], mouseX, mouseY) < selectionRadius) {
          selectedLayer = layer;
          selectedPoint = p;
          dragging = true;
          break;
        }
      }
      if (selectedPoint) break;
    }
    draw();
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
  }

  function saveSettings() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(getLayout()));
    } catch {
      /* storage unavailable — ignore */
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const data: MaptasticLayerLayout[] = JSON.parse(raw);
      for (const entry of data) {
        const layer = findLayer(entry.id);
        if (layer) {
          layer.targetPoints = clonePoints(entry.targetPoints);
          layer.sourcePoints = clonePoints(entry.sourcePoints);
        }
      }
      updateTransform();
    } catch {
      /* corrupt/unavailable storage — ignore */
    }
  }

  function addLayer(target: string | HTMLElement, targetPoints?: Point[]) {
    let element: HTMLElement | null = null;
    if (typeof target === "string") {
      element = document.getElementById(target);
      if (!element) throw new Error(`Maptastic: No element found with id: ${target}`);
    } else {
      element = target;
    }

    const existing = findLayer(element.id);
    if (existing) {
      if (targetPoints) existing.targetPoints = clonePoints(targetPoints);
      updateTransform();
      return;
    }

    const offsetX = element.offsetLeft;
    const offsetY = element.offsetTop;

    element.style.position = "fixed";
    element.style.top = "0px";
    element.style.left = "0px";
    element.style.padding = "0px";
    element.style.margin = "0px";

    const width = element.clientWidth || window.innerWidth;
    const height = element.clientHeight || window.innerHeight;

    const layer: InternalLayer = {
      visible: true,
      element,
      width,
      height,
      sourcePoints: [[0, 0], [width, 0], [width, height], [0, height]],
      targetPoints: [],
    };

    if (targetPoints) {
      layer.targetPoints = clonePoints(targetPoints);
    } else {
      layer.targetPoints = [
        [offsetX, offsetY],
        [width + offsetX, offsetY],
        [width + offsetX, height + offsetY],
        [offsetX, height + offsetY],
      ];
    }

    layers.push(layer);
    updateTransform();
  }

  function removeLayer(target: string | HTMLElement) {
    const id = typeof target === "string" ? target : target.id;
    const idx = layers.findIndex((l) => l.element.id === id);
    if (idx === -1) return;
    const [removed] = layers.splice(idx, 1);
    if (selectedLayer === removed) {
      selectedLayer = null;
      selectedPoint = null;
    }
    if (hoveringLayer === removed) hoveringLayer = null;
    draw();
  }

  function getLayout(): MaptasticLayerLayout[] {
    return layers.map((l) => ({
      id: l.element.id,
      targetPoints: clonePoints(l.targetPoints),
      sourcePoints: clonePoints(l.sourcePoints),
    }));
  }

  function setLayout(layout: MaptasticLayerLayout[]) {
    for (const entry of layout) {
      const layer = findLayer(entry.id);
      if (layer) {
        layer.targetPoints = clonePoints(entry.targetPoints);
        layer.sourcePoints = clonePoints(entry.sourcePoints);
      } else {
        const element = document.getElementById(entry.id);
        if (element) addLayer(element, entry.targetPoints);
      }
    }
    updateTransform();
    draw();
  }

  function setConfigEnabled(enabled: boolean) {
    configActive = enabled;
    if (canvas) canvas.style.display = enabled ? "block" : "none";
    if (!enabled) {
      selectedPoint = null;
      selectedLayer = null;
      dragging = false;
      showScreenBounds = false;
    } else {
      draw();
    }
  }

  function destroy() {
    window.removeEventListener("resize", resize);
    window.removeEventListener("mousemove", mouseMove);
    window.removeEventListener("mouseup", mouseUp);
    window.removeEventListener("mousedown", mouseDown);
    window.removeEventListener("keydown", keyDown);
    if (canvas?.parentElement) canvas.parentElement.removeChild(canvas);
    canvas = null;
    context = null;
    layers.length = 0;
  }

  // --- init ---
  canvas = document.createElement("canvas");
  canvas.style.display = "none";
  canvas.style.position = "fixed";
  canvas.style.top = "0px";
  canvas.style.left = "0px";
  canvas.style.zIndex = "1000000";
  context = canvas.getContext("2d");
  document.body.appendChild(canvas);

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", mouseMove);
  window.addEventListener("mouseup", mouseUp);
  window.addEventListener("mousedown", mouseDown);
  window.addEventListener("keydown", keyDown);
  resize();

  if (autoLoad) loadSettings();

  return {
    getLayout,
    setLayout,
    setConfigEnabled,
    addLayer,
    removeLayer,
    isConfigEnabled: () => configActive,
    destroy,
  };
}
