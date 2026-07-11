"use client";

import type { ProjectionLayer } from "@/types/layer";
import { LayerContent } from "./LayerContent";
import styles from "./panel.module.css";

interface Props {
  layer: ProjectionLayer | null;
}

export function InputPreview({ layer }: Props) {
  if (!layer) {
    return <div className={styles.emptyStage}>Select a layer to preview its raw content here.</div>;
  }
  return (
    <div className={styles.stageBodyInner}>
      <LayerContent layer={layer} />
    </div>
  );
}
