"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MaptasticLayerLayout } from "@/lib/maptastic";
import { createDefaultLayer, type LayerType, type ProjectionLayer } from "@/types/layer";
import { useProjectionChannel } from "@/lib/projectionSync";

const STORAGE_KEY = "projection-mapping.project.v1";

function loadFromStorage(): ProjectionLayer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProjectionLayer[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(layers: ProjectionLayer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
  } catch {
    /* ignore quota/availability errors */
  }
}

let idCounter = 0;
function makeId() {
  idCounter += 1;
  // Prefixed + monotonic so it's always a valid DOM id (crypto.randomUUID()
  // starts with a digit sometimes, which is invalid as a raw HTML id in some
  // older browsers) and stable across a single session.
  return `layer-${Date.now().toString(36)}-${idCounter}`;
}

export function useProjectionLayers() {
  const [layers, setLayers] = useState<ProjectionLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hydrated = useRef(false);

  // Load persisted project on mount (client only, so no SSR/hydration mismatch).
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored.length) {
      setLayers(stored);
      setSelectedId(stored[0].id);
    }
    hydrated.current = true;
  }, []);

  // Persist on every change (after initial hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    saveToStorage(layers);
  }, [layers]);

  // Broadcast full layer list to any open output tab whenever it changes,
  // and merge geometry updates that come back from the output tab.
  const send = useProjectionChannel((msg) => {
    if (msg.kind === "geometry") {
      applyGeometry(msg.layout);
    } else if (msg.kind === "request-state") {
      send({ kind: "layers", layers: layersRef.current });
    }
  });

  const layersRef = useRef(layers);
  layersRef.current = layers;

  useEffect(() => {
    if (!hydrated.current) return;
    send({ kind: "layers", layers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  const applyGeometry = useCallback((layout: MaptasticLayerLayout[]) => {
    setLayers((prev) =>
      prev.map((layer) => {
        const entry = layout.find((l) => l.id === layer.id);
        return entry ? { ...layer, targetPoints: entry.targetPoints, sourcePoints: entry.sourcePoints } : layer;
      })
    );
  }, []);

  const addLayers = useCallback((type: LayerType, count: number) => {
    setLayers((prev) => {
      const additions: ProjectionLayer[] = [];
      for (let i = 0; i < count; i++) {
        additions.push(createDefaultLayer(type, makeId(), prev.length + i));
      }
      const next = [...additions, ...prev]; // new layers land on top (index 0)
      setSelectedId(additions[0]?.id ?? null);
      return next;
    });
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<ProjectionLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as ProjectionLayer) : l)));
  }, []);

  const reorderLayer = useCallback((fromIndex: number, toIndex: number) => {
    setLayers((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const toggleVisible = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }, []);

  const toggleLocked = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)));
  }, []);

  const exportProject = useCallback(() => {
    const blob = new Blob([JSON.stringify(layers, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projection-mapping-project.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [layers]);

  const importProject = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as ProjectionLayer[];
      setLayers(parsed);
      setSelectedId(parsed[0]?.id ?? null);
    } catch (err) {
      console.error("Failed to import project:", err);
      throw err;
    }
  }, []);

  return {
    layers,
    selectedId,
    setSelectedId,
    addLayers,
    removeLayer,
    updateLayer,
    reorderLayer,
    toggleVisible,
    toggleLocked,
    exportProject,
    importProject,
  };
}
