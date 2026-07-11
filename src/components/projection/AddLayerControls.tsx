"use client";

import { useState } from "react";
import type { LayerType } from "@/types/layer";
import styles from "./panel.module.css";

const TYPE_LABELS: Record<LayerType, string> = {
  image: "Image / transparent PNG",
  video: "Video",
  iframe: "Embed (iframe)",
  splat: "Splat viewer (ply/splat/sog)",
  shader: "Shader (CSS)",
};

export function AddLayerControls({ onAdd }: { onAdd: (type: LayerType, count: number) => void }) {
  const [type, setType] = useState<LayerType>("image");
  const [count, setCount] = useState(1);

  return (
    <div className={styles.addLayerBox}>
      <div className={styles.addLayerRow}>
        <select className={styles.select} value={type} onChange={(e) => setType(e.target.value as LayerType)}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className={styles.numberInput}
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
        />
      </div>
      <button className={styles.buttonPrimary} onClick={() => onAdd(type, count)}>
        + Add {count > 1 ? `${count} layers` : "layer"}
      </button>
    </div>
  );
}
