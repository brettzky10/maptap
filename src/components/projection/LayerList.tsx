"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { useSortable, isSortable } from "@dnd-kit/react/sortable";
import type { ProjectionLayer } from "@/types/layer";
import styles from "./panel.module.css";

const TYPE_ICON: Record<ProjectionLayer["type"], string> = {
  image: "IMG",
  video: "VID",
  iframe: "EMB",
  splat: "3D",
  shader: "FX",
};

interface RowProps {
  layer: ProjectionLayer;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onRemove: (id: string) => void;
}

function LayerRow({ layer, index, selected, onSelect, onToggleVisible, onToggleLocked, onRemove }: RowProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: layer.id, index });

  return (
    <div
      ref={ref}
      className={styles.layerRow}
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      onClick={() => onSelect(layer.id)}
    >
      <button ref={handleRef} className={styles.dragHandle} aria-label="Drag to reorder" onClick={(e) => e.stopPropagation()}>
        ⠿
      </button>
      <span className={styles.layerType}>{TYPE_ICON[layer.type]}</span>
      <span className={styles.layerLabel}>{layer.label}</span>
      <button
        className={styles.iconButton}
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
        data-active={layer.visible || undefined}
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible(layer.id);
        }}
      >
        {layer.visible ? "👁" : "–"}
      </button>
      <button
        className={styles.iconButton}
        aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
        data-active={layer.locked || undefined}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLocked(layer.id);
        }}
      >
        {layer.locked ? "🔒" : "🔓"}
      </button>
      <button
        className={styles.iconButton}
        aria-label="Remove layer"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(layer.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}

interface Props {
  layers: ProjectionLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onRemove: (id: string) => void;
}

export function LayerList({ layers, selectedId, onSelect, onReorder, onToggleVisible, onToggleLocked, onRemove }: Props) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return;
        const { source } = event.operation;
        if (!isSortable(source)) return;
        const { initialIndex, index } = source;
        if (initialIndex !== index) onReorder(initialIndex, index);
      }}
    >
      <div className={styles.layerList}>
        {layers.length === 0 && <div className={styles.emptyList}>No layers yet — add one below.</div>}
        {layers.map((layer, index) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            index={index}
            selected={layer.id === selectedId}
            onSelect={onSelect}
            onToggleVisible={onToggleVisible}
            onToggleLocked={onToggleLocked}
            onRemove={onRemove}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
