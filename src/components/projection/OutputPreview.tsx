"use client";

import type { ProjectionLayer } from "@/types/layer";
import styles from "./panel.module.css";

interface Props {
  layers: ProjectionLayer[];
  selectedId: string | null;
  outputConnected: boolean;
  onOpenOutput: () => void;
}

function computeBounds(layers: ProjectionLayer[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const layer of layers) {
    if (!layer.targetPoints) continue;
    for (const [x, y] of layer.targetPoints) {
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) return { minX: 0, minY: 0, maxX: 1920, maxY: 1080 };
  const padX = (maxX - minX) * 0.12 || 100;
  const padY = (maxY - minY) * 0.12 || 100;
  return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
}

export function OutputPreview({ layers, selectedId, outputConnected, onOpenOutput }: Props) {
  const bounds = computeBounds(layers);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const mapped = layers.filter((l) => l.targetPoints);

  return (
    <div className={styles.stageBody}>
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${w} ${h}`}
        style={{ width: "100%", height: "100%" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="#000" />
        {[...layers]
          .filter((l) => l.visible && l.targetPoints)
          .reverse() // draw bottom-of-list first so top layers' outlines render last
          .map((layer) => {
            const pts = layer.targetPoints!;
            const d = `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} Z`;
            const isSelected = layer.id === selectedId;
            return (
              <g key={layer.id}>
                <path
                  d={d}
                  fill={isSelected ? "rgba(52, 228, 234, 0.08)" : "none"}
                  stroke={isSelected ? "#34e4ea" : "#3a3d42"}
                  strokeWidth={isSelected ? 2 : 1}
                />
                {isSelected &&
                  pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={6} fill="#34e4ea" />)}
              </g>
            );
          })}
      </svg>

      {mapped.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={styles.emptyStage}>
            No layers mapped yet.
            <br />
            Open the output window and drag the quad corners there.
          </div>
        </div>
      )}

      <div style={{ position: "absolute", top: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, ui-monospace, monospace", color: outputConnected ? "#34e4ea" : "#8b8f97" }}>
          ● {outputConnected ? "output window connected" : "output window not open"}
        </span>
        <button className={styles.button} onClick={onOpenOutput}>
          Open output window ↗
        </button>
      </div>
    </div>
  );
}
