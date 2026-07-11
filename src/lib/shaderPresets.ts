/**
 * CSS "shader" presets. Each preset is pure CSS (custom properties + keyframe
 * animations declared once globally in <ShaderGlobalStyles/>) — no WebGL, no
 * canvas. The `controls` schema lets the Properties panel render generic
 * inputs (color lists, sliders) without any per-preset UI code; add a new
 * preset by adding an entry here and a render branch in ShaderLayerView.
 */

export type ShaderControlKind = "color-list" | "range";

export interface ShaderControl {
  key: string;
  label: string;
  kind: ShaderControlKind;
  min?: number;
  max?: number;
  step?: number;
  maxColors?: number;
}

export interface ShaderPreset {
  id: string;
  label: string;
  description: string;
  defaultProps: Record<string, number | string | string[]>;
  controls: ShaderControl[];
}

export const SHADER_PRESETS: ShaderPreset[] = [
  {
    id: "pulsing-border",
    label: "Pulsing Border",
    description: "A rounded glowing border that breathes and slowly cycles color.",
    defaultProps: {
      borderColors: ["#0dc1fd", "#d915ef", "#ff3f2e"],
      animationSpeed: 1,
      overallScale: 0.6,
      pulseIntensity: 0.2,
      cornerRoundness: 0.25,
      borderThickness: 0.1,
      edgeSoftness: 0.75,
      aspectRatio: 1.6,
      bloom: 0.4,
    },
    controls: [
      { key: "borderColors", label: "Border colors", kind: "color-list", maxColors: 4 },
      { key: "animationSpeed", label: "Animation speed", kind: "range", min: 0.1, max: 4, step: 0.05 },
      { key: "overallScale", label: "Overall scale", kind: "range", min: 0.1, max: 1.5, step: 0.01 },
      { key: "pulseIntensity", label: "Pulse intensity", kind: "range", min: 0, max: 1, step: 0.01 },
      { key: "cornerRoundness", label: "Corner roundness", kind: "range", min: 0, max: 1, step: 0.01 },
      { key: "borderThickness", label: "Border thickness", kind: "range", min: 0.01, max: 1, step: 0.01 },
      { key: "edgeSoftness", label: "Edge softness", kind: "range", min: 0, max: 1, step: 0.01 },
      { key: "aspectRatio", label: "Aspect ratio", kind: "range", min: 0.3, max: 3, step: 0.05 },
      { key: "bloom", label: "Bloom", kind: "range", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: "chromatic-pulse",
    label: "Chromatic Pulse",
    description: "A full-bleed radial glow that pulses, useful as an ambient background layer.",
    defaultProps: {
      borderColors: ["#34e4ea", "#7c5cfc"],
      animationSpeed: 0.6,
      pulseIntensity: 0.5,
      edgeSoftness: 0.6,
      bloom: 0.6,
    },
    controls: [
      { key: "borderColors", label: "Glow colors", kind: "color-list", maxColors: 3 },
      { key: "animationSpeed", label: "Animation speed", kind: "range", min: 0.1, max: 4, step: 0.05 },
      { key: "pulseIntensity", label: "Pulse intensity", kind: "range", min: 0, max: 1, step: 0.01 },
      { key: "edgeSoftness", label: "Edge softness", kind: "range", min: 0, max: 1, step: 0.01 },
      { key: "bloom", label: "Bloom", kind: "range", min: 0, max: 1, step: 0.01 },
    ],
  },
];

export function getShaderPreset(id: string): ShaderPreset {
  return SHADER_PRESETS.find((p) => p.id === id) ?? SHADER_PRESETS[0];
}

export function withDefaultShaderProps(
  presetId: string,
  props: Record<string, number | string | string[]>
): Record<string, number | string | string[]> {
  const preset = getShaderPreset(presetId);
  return { ...preset.defaultProps, ...props };
}
