"use client";

import { useEffect, useState } from "react";
import { useProjectionChannel } from "@/lib/projectionSync";
import { ProjectionStage } from "@/components/projection/ProjectionStage";
import { ShaderGlobalStyles } from "@/components/projection/ShaderGlobalStyles";
import { resolveLayerSources } from "@/lib/resolveLayerSources";
import type { ProjectionLayer } from "@/types/layer";
import type { MaptasticLayerLayout } from "@/lib/maptastic";

export default function ProjectionOutputPage() {
  const [layers, setLayers] = useState<ProjectionLayer[]>([]);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);

  const send = useProjectionChannel((msg) => {
    if (msg.kind === "layers") {
      setConnected(true);
      // Merge incoming content/order with whatever geometry we already have
      // locally, so a content edit in the control window doesn't reset a
      // corner-drag that just happened here and hasn't round-tripped yet.
      setLayers((prev) =>
        msg.layers.map((incoming) => {
          const existing = prev.find((l) => l.id === incoming.id);
          return existing
            ? { ...incoming, targetPoints: existing.targetPoints ?? incoming.targetPoints, sourcePoints: existing.sourcePoints ?? incoming.sourcePoints }
            : incoming;
        })
      );
    } else if (msg.kind === "file") {
      setBlobUrls((prev) => {
        if (prev[msg.layerId]) URL.revokeObjectURL(prev[msg.layerId]);
        return { ...prev, [msg.layerId]: URL.createObjectURL(msg.blob) };
      });
    } else if (msg.kind === "file-cleared") {
      setBlobUrls((prev) => {
        if (!prev[msg.layerId]) return prev;
        URL.revokeObjectURL(prev[msg.layerId]);
        const next = { ...prev };
        delete next[msg.layerId];
        return next;
      });
    }
  });

  useEffect(() => {
    send({ kind: "request-state" });
  }, [send]);

  // Revoke every object URL we created when this tab closes.
  useEffect(() => {
    return () => {
      Object.values(blobUrls).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLayoutChange = (layout: MaptasticLayerLayout[]) => {
    send({ kind: "geometry", layout });
  };

  const resolvedLayers = resolveLayerSources(layers, blobUrls);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <ShaderGlobalStyles />
      <ProjectionStage layers={resolvedLayers} onLayoutChange={handleLayoutChange} />
      {layers.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#3a3d42",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            textAlign: "center",
            padding: 24,
          }}
        >
          {connected ? "No layers yet — add some in the control tab." : "Waiting for the control tab…"}
        </div>
      )}
    </div>
  );
}
