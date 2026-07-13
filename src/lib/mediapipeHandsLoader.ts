import type { HandsConfig, Options as HandsOptions, ResultsListener as HandsResultsListener } from "@mediapipe/hands";

// @mediapipe/hands doesn't ship real ESM/CJS exports — it just attaches
// `Hands` onto the global object as a side effect of evaluating the module,
// and it's marked `"sideEffects": []` in its package.json, which makes
// bundlers tree-shake away a plain `import "@mediapipe/hands"`. The reliable
// fix — and what MediaPipe's own docs/demos do — is to load it as a plain
// <script> tag pointed at the CDN and read the resulting global off
// `window`. The npm package is only used here for its TypeScript types
// (type-only imports have zero runtime footprint).
export interface MediapipeHandsInstance {
  onResults(listener: HandsResultsListener): void;
  send(inputs: { image: HTMLVideoElement }): Promise<void>;
  setOptions(options: HandsOptions): void;
  close(): Promise<void>;
}

declare global {
  interface Window {
    Hands: new (config?: HandsConfig) => MediapipeHandsInstance;
  }
}

export const HANDS_SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";

/** Loads a script exactly once — safe to call repeatedly (e.g. toggling hand tracking on/off/on); later calls resolve immediately. */
export function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)));
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)));
    document.head.appendChild(script);
  });
}
