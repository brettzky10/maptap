"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MaptasticLayerLayout } from "@/lib/maptastic";
import type { ProjectionLayer } from "@/types/layer";

export const PROJECTION_CHANNEL_NAME = "projection-mapping-sync";

export type ProjectionSyncMessage =
  /** Control window -> output tab: full layer list (content, order, visibility, etc). */
  | { kind: "layers"; layers: ProjectionLayer[] }
  /** Output tab -> control window: geometry-only update after a drag/nudge. */
  | { kind: "geometry"; layout: MaptasticLayerLayout[] }
  /** Output tab -> control window, sent on mount: "send me what you have". */
  | { kind: "request-state" }
  /** Control window -> output tab: the actual bytes for a locally-picked file. Blobs are structured-cloneable, so this works over BroadcastChannel without any base64 round-trip. */
  | { kind: "file"; layerId: string; blob: Blob }
  /** Control window -> output tab: a previously-sent file no longer applies (switched back to URL mode, or the layer was removed). */
  | { kind: "file-cleared"; layerId: string };

/**
 * Thin wrapper around BroadcastChannel so both windows can share one type-safe
 * message shape. Returns `null` outside the browser (SSR) or if
 * BroadcastChannel isn't supported (falls back silently — the two windows
 * just won't sync, which only matters if you're actually using the pop-out
 * output tab).
 */
export function useProjectionChannel(onMessage: (msg: ProjectionSyncMessage) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(PROJECTION_CHANNEL_NAME);
    channelRef.current = channel;

    const listener = (event: MessageEvent<ProjectionSyncMessage>) => {
      handlerRef.current(event.data);
    };
    channel.addEventListener("message", listener);

    return () => {
      channel.removeEventListener("message", listener);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const send = useCallback((msg: ProjectionSyncMessage) => {
    channelRef.current?.postMessage(msg);
  }, []);

  return send;
}
