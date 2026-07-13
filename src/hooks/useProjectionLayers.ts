"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MaptasticLayerLayout } from "@/lib/maptastic";
import { createDefaultLayer, type LayerType, type ProjectionLayer } from "@/types/layer";
import { useProjectionChannel } from "@/lib/projectionSync";
import { putLocalFile, getLocalFile, deleteLocalFile } from "@/lib/localFileStore";

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

function isFileBackable(layer: ProjectionLayer): layer is Extract<ProjectionLayer, { type: "image" | "splat" }> {
  return layer.type === "image" || layer.type === "splat";
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
  // Local-only: object URLs for picked files, keyed by layer id. Never
  // persisted or broadcast as strings — see lib/localFileStore.ts.
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const hydrated = useRef(false);

  // Load persisted project + any locally-stored files on mount.
  useEffect(() => {
    (async () => {
      const stored = loadFromStorage();
      if (stored.length) {
        setLayers(stored);
        setSelectedId(stored[0].id);

        const urls: Record<string, string> = {};
        for (const layer of stored) {
          if (isFileBackable(layer) && layer.sourceMode === "file") {
            const blob = await getLocalFile(layer.id).catch(() => undefined);
            if (blob) urls[layer.id] = URL.createObjectURL(blob);
          }
        }
        if (Object.keys(urls).length) setBlobUrls(urls);
      }
      hydrated.current = true;
    })();

    // Revoke every object URL still outstanding when the whole hook unmounts.
    return () => {
      setBlobUrls((current) => {
        Object.values(current).forEach((url) => URL.revokeObjectURL(url));
        return current;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change (after initial hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    saveToStorage(layers);
  }, [layers]);

  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Broadcast full layer list to any open output tab whenever it changes,
  // merge geometry updates that come back from the output tab, and resend
  // both layers + any current files when the output tab (re)announces itself.
  const send = useProjectionChannel((msg) => {
    if (msg.kind === "geometry") {
      applyGeometry(msg.layout);
    } else if (msg.kind === "request-state") {
      send({ kind: "layers", layers: layersRef.current });
      resendAllFiles();
    }
  });

  const resendAllFiles = useCallback(async () => {
    for (const layer of layersRef.current) {
      if (isFileBackable(layer) && layer.sourceMode === "file") {
        const blob = await getLocalFile(layer.id).catch(() => undefined);
        if (blob) send({ kind: "file", layerId: layer.id, blob });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

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

  const removeLayer = useCallback(
    (id: string) => {
      setLayers((prev) => prev.filter((l) => l.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      setBlobUrls((prev) => {
        if (!prev[id]) return prev;
        URL.revokeObjectURL(prev[id]);
        const next = { ...prev };
        delete next[id];
        return next;
      });
      deleteLocalFile(id).catch(() => {});
      send({ kind: "file-cleared", layerId: id });
    },
    [send]
  );

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

  /** Switches a layer to sourceMode "file", stores the bytes, and pushes them to the output tab. */
  const pickFile = useCallback(
    async (id: string, file: File) => {
      await putLocalFile(id, file);
      setBlobUrls((prev) => {
        if (prev[id]) URL.revokeObjectURL(prev[id]);
        return { ...prev, [id]: URL.createObjectURL(file) };
      });
      setLayers((prev) =>
        prev.map((l) =>
          l.id === id && isFileBackable(l) ? ({ ...l, sourceMode: "file", fileName: file.name, src: "" } as ProjectionLayer) : l
        )
      );
      send({ kind: "file", layerId: id, blob: file });
    },
    [send]
  );

  /** Switches a layer back to sourceMode "url" and forgets the locally-stored bytes. */
  const clearFile = useCallback(
    (id: string) => {
      setBlobUrls((prev) => {
        if (!prev[id]) return prev;
        URL.revokeObjectURL(prev[id]);
        const next = { ...prev };
        delete next[id];
        return next;
      });
      deleteLocalFile(id).catch(() => {});
      setLayers((prev) =>
        prev.map((l) => (l.id === id && isFileBackable(l) ? ({ ...l, sourceMode: "url", fileName: undefined } as ProjectionLayer) : l))
      );
      send({ kind: "file-cleared", layerId: id });
    },
    [send]
  );

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
    blobUrls,
    addLayers,
    removeLayer,
    updateLayer,
    reorderLayer,
    toggleVisible,
    toggleLocked,
    pickFile,
    clearFile,
    exportProject,
    importProject,
  };
}
