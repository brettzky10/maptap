import type { Point } from "@/lib/maptastic";

export type LayerType = "image" | "video" | "iframe" | "splat" | "shader";

export interface LayerBase {
  id: string;
  label: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-1
  /** Last-known Maptastic quad, if this layer has ever been mapped. */
  targetPoints?: Point[];
  sourcePoints?: Point[];
}

export interface ImageLayer extends LayerBase {
  type: "image";
  src: string;
  fit: "cover" | "contain" | "fill";
  /** True for transparent PNG overlays — just changes the default `fit` and UI copy. */
  transparent: boolean;
}

export interface VideoLayer extends LayerBase {
  type: "video";
  src: string;
  loop: boolean;
  muted: boolean;
  autoplay: boolean;
}

export interface IframeLayer extends LayerBase {
  type: "iframe";
  /** Embed URL — YouTube/Vimeo embed link, or any same-origin-friendly page. */
  src: string;
}

export interface SplatLayer extends LayerBase {
  type: "splat";
  /** URL to a .ply / .splat / .ksplat / .spz / .sog / .zip file. */
  src: string;
  flipUpsideDown: boolean;
  autoRotate: boolean;
  backgroundColor: string; // CSS color, or "transparent"
}

export interface ShaderLayer extends LayerBase {
  type: "shader";
  preset: string; // ShaderPreset id
  props: Record<string, number | string | string[]>;
}

export type ProjectionLayer = ImageLayer | VideoLayer | IframeLayer | SplatLayer | ShaderLayer;

export function createDefaultLayer(type: LayerType, id: string, index: number): ProjectionLayer {
  const base = {
    id,
    label: `Layer ${index + 1}`,
    visible: true,
    locked: false,
    opacity: 1,
  };

  switch (type) {
    case "image":
      return { ...base, type: "image", src: "", fit: "contain", transparent: true };
    case "video":
      return { ...base, type: "video", src: "", loop: true, muted: true, autoplay: true };
    case "iframe":
      return { ...base, type: "iframe", src: "" };
    case "splat":
      return {
        ...base,
        type: "splat",
        src: "",
        flipUpsideDown: true,
        autoRotate: false,
        backgroundColor: "transparent",
      };
    case "shader":
      return {
        ...base,
        type: "shader",
        preset: "pulsing-border",
        props: {},
      };
  }
}
