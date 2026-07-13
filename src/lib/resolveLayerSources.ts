import type { ProjectionLayer } from "@/types/layer";

/**
 * `layer.src` is only meaningful for sourceMode "url". For sourceMode
 * "file", the real bytes live in IndexedDB/were broadcast as a Blob, and
 * each window keeps its own `URL.createObjectURL` result in a local
 * `blobUrls` map (keyed by layer id) — never persisted or sent as a string,
 * since a blob: URL only reliably resolves in the context that created it.
 * This just merges that local map onto the layers right before rendering.
 */
export function resolveLayerSources(
  layers: ProjectionLayer[],
  blobUrls: Record<string, string>
): ProjectionLayer[] {
  return layers.map((layer) => {
    if ((layer.type === "image" || layer.type === "splat") && layer.sourceMode === "file") {
      const url = blobUrls[layer.id];
      return url ? ({ ...layer, src: url } as ProjectionLayer) : layer;
    }
    return layer;
  });
}
