"use client";

import { useEffect, useRef } from "react";
import { createMaptastic, type MaptasticInstance, type MaptasticLayerLayout } from "@/lib/maptastic";
import type { ProjectionLayer } from "@/types/layer";
import { LayerContent } from "./LayerContent";
import { HandGestureManager } from "./HandGestureManager";

interface Props {
  layers: ProjectionLayer[];
  onLayoutChange: (layout: MaptasticLayerLayout[]) => void;
}

/**
 * Mounts one `id`'d div per *visible* layer (hidden layers are unmounted
 * entirely, not just CSS-hidden, so Maptastic drops them from its internal
 * list and stops drawing their quad). z-index comes straight from list
 * position — index 0 (top of the layer list) always wins, independent of
 * whatever Maptastic itself is doing with the transform.
 *
 * Press Shift+Space to toggle edit mode; drag corners/quads to warp, arrow
 * keys to nudge, H/V to flip, R to rotate 90°, C for crosshairs, B for the
 * screen-bounds calibration grid, S to solo the selected layer.
 */
export function ProjectionStage({ layers, onLayoutChange }: Props) {
  const instanceRef = useRef<MaptasticInstance | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  const visibleLayers = layers.filter((l) => l.visible);
  const gestureControlActive = visibleLayers.some((l) => l.type === "splat" && l.gestureControl);

  // Create the engine once.
  useEffect(() => {
    const instance = createMaptastic({
      autoSave: false,
      autoLoad: false,
      labels: true,
      onchange: () => onLayoutChangeRef.current(instance.getLayout()),
    });
    instanceRef.current = instance;
    return () => {
      instance.destroy();
      instanceRef.current = null;
      knownIdsRef.current.clear();
    };
  }, []);

  // Keep Maptastic's registered layers in sync with what's actually mounted.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    const currentIds = new Set(visibleLayers.map((l) => l.id));

    for (const layer of visibleLayers) {
      if (!knownIdsRef.current.has(layer.id)) {
        instance.addLayer(layer.id, layer.targetPoints);
        knownIdsRef.current.add(layer.id);
      }
    }
    for (const id of Array.from(knownIdsRef.current)) {
      if (!currentIds.has(id)) {
        instance.removeLayer(id);
        knownIdsRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLayers.map((l) => l.id).join(",")]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
      {visibleLayers.map((layer, index) => (
        <div
          key={layer.id}
          id={layer.id}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: visibleLayers.length - index,
          }}
        >
          <LayerContent layer={layer} />
        </div>
      ))}
      <HandGestureManager active={gestureControlActive} />
    </div>
  );
}
