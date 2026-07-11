"use client";

import type { ProjectionLayer } from "@/types/layer";
import { SplatLayerViewer } from "./SplatLayerViewer";
import { ShaderLayerView } from "./ShaderLayerView";

/** Renders just the layer's content, filling whatever box it's placed in. */
export function LayerContent({ layer }: { layer: ProjectionLayer }) {
  switch (layer.type) {
    case "image":
      return layer.src ? (
        <img
          src={layer.src}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: layer.fit, opacity: layer.opacity, display: "block" }}
        />
      ) : (
        <EmptyState label={layer.transparent ? "Set a transparent PNG URL" : "Set an image URL"} />
      );

    case "video":
      return layer.src ? (
        <video
          src={layer.src}
          autoPlay={layer.autoplay}
          loop={layer.loop}
          muted={layer.muted}
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: layer.opacity, display: "block" }}
        />
      ) : (
        <EmptyState label="Set a video URL" />
      );

    case "iframe":
      return layer.src ? (
        <iframe
          src={layer.src}
          allow="autoplay; fullscreen"
          style={{ width: "100%", height: "100%", border: "none", opacity: layer.opacity }}
        />
      ) : (
        <EmptyState label="Set an embed URL" />
      );

    case "splat":
      return <SplatLayerViewer layer={layer} />;

    case "shader":
      return <ShaderLayerView layer={layer} />;
  }
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 16,
        fontSize: 12,
        color: "#64748b",
        background: "repeating-conic-gradient(#1a1c20 0% 25%, #16171a 0% 50%) 0 0 / 16px 16px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {label}
    </div>
  );
}
