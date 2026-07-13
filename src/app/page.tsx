"use client";

import { useRef, useState } from "react";
import { useProjectionLayers } from "@/hooks/useProjectionLayers";
import { useProjectionChannel } from "@/lib/projectionSync";
import { LayerList } from "@/components/projection/LayerList";
import { AddLayerControls } from "@/components/projection/AddLayerControls";
import { InputPreview } from "@/components/projection/InputPreview";
import { OutputPreview } from "@/components/projection/OutputPreview";
import { PropertiesPanel } from "@/components/projection/PropertiesPanel";
import { ShaderGlobalStyles } from "@/components/projection/ShaderGlobalStyles";
import { resolveLayerSources } from "@/lib/resolveLayerSources";
import styles from "@/components/projection/panel.module.css";

export default function ProjectionMappingPage() {
  const {
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
  } = useProjectionLayers();

  const [outputConnected, setOutputConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputWindowRef = useRef<Window | null>(null);

  // We already listen for "geometry"/"request-state" inside useProjectionLayers;
  // this second listener just flips the "connected" indicator whenever the
  // output tab announces itself.
  useProjectionChannel((msg) => {
    if (msg.kind === "request-state") setOutputConnected(true);
  });

  const rawSelectedLayer = layers.find((l) => l.id === selectedId) ?? null;
  const resolvedSelectedLayer = resolveLayerSources(layers, blobUrls).find((l) => l.id === selectedId) ?? null;

  const openOutputWindow = () => {
    const win = window.open("/projection-mapping/output", "projection-output");
    outputWindowRef.current = win;
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      importProject(await file.text());
    } catch {
      alert("That file doesn't look like a valid project export.");
    }
  };

  return (
    <div className={styles.shell}>
      <ShaderGlobalStyles />

      <div className={styles.toolbar}>
        <span className={styles.brand}>
          <strong>Holomapped</strong> · projection mapping
        </span>
        <button className={styles.button} onClick={exportProject}>
          Export project
        </button>
        <button className={styles.button} onClick={handleImportClick}>
          Import project
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
      </div>

      <div className={styles.body}>
        <div className={styles.column}>
          <div className={styles.columnHeader}>
            <span>Layers</span>
            <span>{layers.length}</span>
          </div>
          <LayerList
            layers={layers}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={reorderLayer}
            onToggleVisible={toggleVisible}
            onToggleLocked={toggleLocked}
            onRemove={removeLayer}
          />
          <AddLayerControls onAdd={addLayers} />
        </div>

        <div className={styles.center}>
          <div className={styles.stagePane}>
            <div className={styles.columnHeader}>
              <span>Input</span>
              <span>{resolvedSelectedLayer ? resolvedSelectedLayer.type : "—"}</span>
            </div>
            <div className={styles.stageBody}>
              <InputPreview layer={resolvedSelectedLayer} />
            </div>
          </div>

          <div className={styles.stagePane}>
            <div className={styles.columnHeader}>
              <span>Output</span>
              <span>preview</span>
            </div>
            <OutputPreview
              layers={layers}
              selectedId={selectedId}
              outputConnected={outputConnected}
              onOpenOutput={openOutputWindow}
            />
          </div>
        </div>

        <div className={styles.column}>
          <div className={styles.columnHeader}>
            <span>Properties</span>
          </div>
          <PropertiesPanel layer={rawSelectedLayer} onChange={updateLayer} onPickFile={pickFile} onClearFile={clearFile} />
        </div>
      </div>
    </div>
  );
}
