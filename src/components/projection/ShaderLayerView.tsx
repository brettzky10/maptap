"use client";

import type { CSSProperties } from "react";
import type { ShaderLayer } from "@/types/layer";
import { getShaderPreset, withDefaultShaderProps } from "@/lib/shaderPresets";

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

function colorStops(v: unknown, fallback: string[]): string {
  const colors = Array.isArray(v) && v.length > 0 ? (v as string[]) : fallback;
  const ring = [...colors, colors[0]];
  return ring.join(", ");
}

export function ShaderLayerView({ layer }: { layer: ShaderLayer }) {
  const preset = getShaderPreset(layer.preset);
  const props = withDefaultShaderProps(layer.preset, layer.props);

  const vars: CSSProperties & Record<string, string> = {
    "--shader-color-stops": colorStops(props.borderColors, preset.defaultProps.borderColors as string[]),
    "--shader-speed": String(num(props.animationSpeed, 1)),
    "--shader-pulse-intensity": String(num(props.pulseIntensity, 0.2)),
    "--shader-softness": String(num(props.edgeSoftness, 0.5)),
    "--shader-bloom": String(num(props.bloom, 0.3)),
  };

  if (layer.preset === "pulsing-border") {
    vars["--shader-scale"] = String(num(props.overallScale, 0.6));
    vars["--shader-aspect"] = String(num(props.aspectRatio, 1.6));
    vars["--shader-radius"] = `${num(props.cornerRoundness, 0.25) * 50}%`;
    vars["--shader-border-width"] = `${Math.max(1, num(props.borderThickness, 0.1) * 40)}px`;
    return (
      <div className="shader-layer-root" style={{ opacity: layer.opacity }}>
        <div className="shader-pulsing-border" style={vars} />
      </div>
    );
  }

  // chromatic-pulse and any future full-bleed preset
  return (
    <div className="shader-layer-root" style={{ opacity: layer.opacity }}>
      <div className="shader-chromatic-pulse" style={vars} />
    </div>
  );
}
