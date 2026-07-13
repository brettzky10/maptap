"use client";

import { useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/hands";
import { loadScriptOnce, HANDS_SCRIPT_SRC, type MediapipeHandsInstance } from "@/lib/mediapipeHandsLoader";
import {
  type HandLabel,
  type Point2D,
  HAND_CONNECTIONS,
  smoothLandmarkList,
  getFingerStates,
  isFist,
  isPeaceSign,
  isPinching,
  dist,
  ZOOM_DEADZONE,
  PAN_DEADZONE,
  ROTATE_DEADZONE,
} from "@/lib/handGestureMath";
import { gestureTargetRegistry } from "@/lib/gestureTargetRegistry";

interface Props {
  /** Whether at least one visible splat layer currently wants gesture control. */
  active: boolean;
}

// --- Tuning knobs -----------------------------------------------------------
// @mediapipe/hands (the legacy "solutions" package used here — same one the
// original viewer used) runs its WASM inference synchronously on the main
// thread, with no Worker or GPU delegate in this build. That inference
// competes directly with the Spark/Three.js render loop for the same thread,
// so a slow or too-frequent inference call shows up as dropped render frames.

/** 0 = "lite" landmark model, 1 = "full". Lite is meaningfully cheaper per
 * inference and plenty precise for coarse fist/pinch/peace classification —
 * bump to 1 only if you need finer per-finger accuracy and can afford the cost. */
const HAND_MODEL_COMPLEXITY = 0;

/** Capture at a lower resolution than the original 640x480 — less pixel data
 * for MediaPipe to preprocess per frame, with no real loss for gesture
 * classification (we only need coarse hand pose, not fine detail). */
const CAPTURE_WIDTH = 480;
const CAPTURE_HEIGHT = 360;

/** Hard cap on how often we run inference, independent of display refresh
 * rate. `await hands.send()` already self-paces to however long inference
 * actually takes, but with zero enforced gap it will happily consume every
 * single available main-thread tick — this reserves headroom for the
 * renderer instead of racing it. ~12fps is still responsive for the coarse
 * gestures here (dual pinch/fist/peace) while leaving the rest of the frame
 * budget for splat rendering at full display refresh rate. */
const MIN_INFERENCE_INTERVAL_MS = 80;

/**
 * One shared hand-tracking pipeline for the whole output window — not one
 * per splat layer, so enabling gesture control on several layers at once
 * doesn't try to open several webcam streams. Mounts a hidden <video> (the
 * tracking input) and a transparent, full-viewport <canvas> (just the hand
 * skeleton, drawn in "selfie" — i.e. already mirrored — coordinates).
 *
 * Gesture vocabulary (two hands, mirrors the reference viewer exactly):
 *   - both hands pinching           -> zoom, driven by the change in
 *                                       distance between the two hands
 *   - both hands in a fist          -> pan, driven by the average hand
 *                                       movement
 *   - one fist + one peace sign     -> rotate, driven by the peace hand's
 *                                       movement
 */
export function HandGestureManager({ active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<MediapipeHandsInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastInferenceTimeRef = useRef(0);

  const gestureMemory = useRef<{
    prevZoomDist: number | null;
    prevPanCenter: Point2D | null;
    prevRotateCenter: Point2D | null;
  }>({ prevZoomDist: null, prevPanCenter: null, prevRotateCenter: null });

  const smoothedHands = useRef<Record<HandLabel, NormalizedLandmark[] | null>>({ Left: null, Right: null });

  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const drawHandOverlay = (hands: NormalizedLandmark[][]) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { clientWidth, clientHeight } = canvas;
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const landmarks of hands) {
      ctx.strokeStyle = "rgba(125, 211, 252, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        const from = landmarks[a];
        const to = landmarks[b];
        ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
        ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
      }
      ctx.stroke();

      ctx.fillStyle = "rgba(56, 189, 248, 0.95)";
      for (const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const applyGestures = (hands: NormalizedLandmark[][]) => {
    const memory = gestureMemory.current;

    if (gestureTargetRegistry.size === 0) return;

    if (hands.length < 2) {
      memory.prevZoomDist = null;
      memory.prevPanCenter = null;
      memory.prevRotateCenter = null;
      setStatus(hands.length === 1 ? "Show your second hand to control the view" : "Show both hands to the camera");
      return;
    }

    const [handA, handB] = hands;
    const fingersA = getFingerStates(handA);
    const fingersB = getFingerStates(handB);
    const pinchA = isPinching(handA, fingersA);
    const pinchB = isPinching(handB, fingersB);
    const fistA = isFist(fingersA);
    const fistB = isFist(fingersB);
    const peaceA = isPeaceSign(fingersA);
    const peaceB = isPeaceSign(fingersB);

    const centerA: Point2D = handA[0];
    const centerB: Point2D = handB[0];

    if (pinchA && pinchB) {
      memory.prevPanCenter = null;
      memory.prevRotateCenter = null;
      const currentDist = dist(centerA, centerB);
      if (memory.prevZoomDist !== null) {
        const delta = currentDist - memory.prevZoomDist;
        if (Math.abs(delta) > ZOOM_DEADZONE) gestureTargetRegistry.zoomAll(delta);
      }
      memory.prevZoomDist = currentDist;
      setStatus("Zooming");
    } else if (fistA && fistB) {
      memory.prevZoomDist = null;
      memory.prevRotateCenter = null;
      const center: Point2D = { x: (centerA.x + centerB.x) / 2, y: (centerA.y + centerB.y) / 2 };
      if (memory.prevPanCenter) {
        const dx = center.x - memory.prevPanCenter.x;
        const dy = center.y - memory.prevPanCenter.y;
        if (Math.abs(dx) > PAN_DEADZONE || Math.abs(dy) > PAN_DEADZONE) gestureTargetRegistry.panAll(dx, dy);
      }
      memory.prevPanCenter = center;
      setStatus("Panning");
    } else if ((fistA && peaceB) || (fistB && peaceA)) {
      memory.prevZoomDist = null;
      memory.prevPanCenter = null;
      const peaceCenter = peaceA ? centerA : centerB;
      if (memory.prevRotateCenter) {
        const dx = peaceCenter.x - memory.prevRotateCenter.x;
        const dy = peaceCenter.y - memory.prevRotateCenter.y;
        if (Math.abs(dx) > ROTATE_DEADZONE || Math.abs(dy) > ROTATE_DEADZONE) gestureTargetRegistry.rotateAll(dx, dy);
      }
      memory.prevRotateCenter = { x: peaceCenter.x, y: peaceCenter.y };
      setStatus("Rotating");
    } else {
      memory.prevZoomDist = null;
      memory.prevPanCenter = null;
      memory.prevRotateCenter = null;
      setStatus("Pinch both hands to zoom \u00B7 two fists to pan \u00B7 fist + peace sign to rotate");
    }
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      const video = videoRef.current;
      if (!video) return;
      setIsStarting(true);
      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        await loadScriptOnce(HANDS_SCRIPT_SRC);
        if (typeof window.Hands !== "function") {
          throw new Error("MediaPipe Hands script loaded but window.Hands was not set. Try reloading the page.");
        }

        const hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: HAND_MODEL_COMPLEXITY,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
          selfieMode: true,
        });
        hands.onResults((results) => {
          const rawHands = results.multiHandLandmarks ?? [];
          const handedness = results.multiHandedness ?? [];
          const memory = smoothedHands.current;
          const seen = new Set<HandLabel>();

          const smoothedLandmarks = rawHands.map((landmarks, i) => {
            const label: HandLabel = (handedness[i]?.label as HandLabel) ?? "Right";
            const smoothed = smoothLandmarkList(memory[label], landmarks);
            memory[label] = smoothed;
            seen.add(label);
            return smoothed;
          });

          (["Left", "Right"] as const).forEach((label) => {
            if (!seen.has(label)) memory[label] = null;
          });

          drawHandOverlay(smoothedLandmarks);
          applyGestures(smoothedLandmarks);
        });
        handsRef.current = hands;

        // Poll every rAF (cheap — just a timestamp check most ticks), but
        // only actually run inference once MIN_INFERENCE_INTERVAL_MS has
        // elapsed. This is what actually protects render framerate: without
        // it, this loop calls the expensive `hands.send()` back-to-back with
        // zero gap, leaving no main-thread headroom for the splat renderer.
        const loop = async () => {
          if (cancelled) return;
          const now = performance.now();
          if (video.readyState >= 2 && now - lastInferenceTimeRef.current >= MIN_INFERENCE_INTERVAL_MS) {
            lastInferenceTimeRef.current = now;
            await hands.send({ image: video });
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        setIsStarting(false);
      } catch (err) {
        console.error("Hand tracking failed to start:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not access the webcam.");
          setIsStarting(false);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      handsRef.current?.close();
      handsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      const canvas = overlayCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

      gestureMemory.current = { prevZoomDist: null, prevPanCenter: null, prevRotateCenter: null };
      smoothedHands.current = { Left: null, Right: null };
      lastInferenceTimeRef.current = 0;
      setStatus("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <>
      <video ref={videoRef} playsInline muted style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
      <canvas
        ref={overlayCanvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 999999 }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 999999,
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          color: error ? "#fca5a5" : "#5b6068",
          maxWidth: 360,
          pointerEvents: "none",
        }}
      >
        {error ?? (isStarting ? "Requesting camera…" : status)}
      </div>
    </>
  );
}
