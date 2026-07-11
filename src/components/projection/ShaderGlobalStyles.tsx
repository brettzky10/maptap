"use client";

/**
 * Mount this once near the root of any tree that might render a ShaderLayerView
 * (both the control window and the bare output window need it). Individual
 * shader instances only set CSS custom properties inline — the animation
 * definitions themselves live here so they're not duplicated per layer.
 */
export function ShaderGlobalStyles() {
  return (
    <style>{`
      @property --shader-angle {
        syntax: '<angle>';
        inherits: false;
        initial-value: 0deg;
      }

      @keyframes shader-spin {
        to { --shader-angle: 360deg; }
      }

      @keyframes shader-pulse {
        0%, 100% {
          opacity: calc(0.55 + var(--shader-pulse-intensity, 0.2) * 0.45);
          transform: scale(1);
        }
        50% {
          opacity: 1;
          transform: scale(calc(1 + var(--shader-pulse-intensity, 0.2) * 0.08));
        }
      }

      @keyframes shader-radial-pulse {
        0%, 100% {
          opacity: calc(0.4 + var(--shader-pulse-intensity, 0.3) * 0.3);
          transform: scale(0.94);
        }
        50% {
          opacity: calc(0.7 + var(--shader-pulse-intensity, 0.3) * 0.3);
          transform: scale(1.06);
        }
      }

      .shader-layer-root {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: transparent;
      }

      .shader-pulsing-border {
        position: relative;
        width: calc(var(--shader-scale, 0.6) * 100%);
        aspect-ratio: var(--shader-aspect, 1.6);
        border-radius: var(--shader-radius, 24px);
        padding: var(--shader-border-width, 6px);
        background: conic-gradient(from var(--shader-angle), var(--shader-color-stops));
        -webkit-mask:
          linear-gradient(#000 0 0) content-box,
          linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        animation:
          shader-spin calc(8s / var(--shader-speed, 1)) linear infinite,
          shader-pulse calc(2.4s / var(--shader-speed, 1)) ease-in-out infinite;
        filter: blur(calc(var(--shader-softness, 0.5) * 3px));
      }

      .shader-pulsing-border::after {
        content: "";
        position: absolute;
        inset: calc(var(--shader-border-width, 6px) * -1.5);
        border-radius: inherit;
        background: inherit;
        filter: blur(calc(var(--shader-bloom, 0) * 28px));
        opacity: var(--shader-bloom, 0);
        z-index: -1;
      }

      .shader-chromatic-pulse {
        position: relative;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle at 50% 50%, var(--shader-color-stops), transparent 70%);
        animation: shader-radial-pulse calc(3s / var(--shader-speed, 1)) ease-in-out infinite;
        filter: blur(calc(var(--shader-softness, 0.5) * 18px));
      }

      .shader-chromatic-pulse::after {
        content: "";
        position: absolute;
        inset: 0;
        background: inherit;
        filter: blur(calc(var(--shader-bloom, 0) * 60px));
        opacity: var(--shader-bloom, 0);
      }
    `}</style>
  );
}
