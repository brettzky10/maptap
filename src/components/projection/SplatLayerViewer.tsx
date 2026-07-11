"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SplatLayer } from "@/types/layer";

interface Props {
  layer: SplatLayer;
}

/**
 * Renders one splat file (.ply/.splat/.ksplat/.spz/.sog/.zip) into its own
 * three.js + Spark scene, sized to fill the parent element. Deliberately
 * trimmed down from a full standalone viewer: no file picker, no webcam hand
 * tracking — just `src`, `flipUpsideDown`, `autoRotate`, `backgroundColor`,
 * all driven by the layer's Properties panel.
 */
export function SplatLayerViewer({ layer }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentSplatRef = useRef<InstanceType<typeof SplatMesh> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Core scene setup — runs once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let running = true;
    const { clientWidth: width, clientHeight: height } = container;

    const camera = new THREE.PerspectiveCamera(60, (width || 1) / (height || 1), 0.0001, 100000);
    camera.position.set(0, 1, 4);

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width || 1, height || 1);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    const onResize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    function animate() {
      if (!running) return;
      controls.update();
      if (currentSplatRef.current && layer.autoRotate) {
        currentSplatRef.current.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(animate);

    return () => {
      running = false;
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      currentSplatRef.current?.removeFromParent();
      (currentSplatRef.current as unknown as { dispose?: () => void } | null)?.dispose?.();
      currentSplatRef.current = null;
      spark.dispose();
      scene.remove(spark);
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load (or reload) the splat whenever the source URL changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !layer.src) return;

    let cancelled = false;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const mesh = new SplatMesh({ url: layer.src, fileName: layer.src });
        await mesh.initialized;
        if (cancelled) return;

        const quat: [number, number, number, number] = layer.flipUpsideDown ? [1, 0, 0, 0] : [0, 0, 0, 1];
        mesh.quaternion.set(...quat);

        currentSplatRef.current?.removeFromParent();
        (currentSplatRef.current as unknown as { dispose?: () => void } | null)?.dispose?.();

        scene.add(mesh);
        currentSplatRef.current = mesh;

        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const box = mesh.getBoundingBox?.();
        if (camera && controls && box && !box.isEmpty()) {
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(size);
          const radius = Math.max(size.length() * 0.5, 0.001);
          controls.target.copy(center);
          camera.position.copy(center).addScaledVector(new THREE.Vector3(0.4, 0.3, 1).normalize(), radius * 2.2);
          camera.near = Math.max(radius / 1000, 0.0001);
          camera.far = radius * 1000;
          camera.updateProjectionMatrix();
          controls.update();
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load splat:", err);
          setError(err instanceof Error ? err.message : "Failed to load this splat file.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [layer.src, layer.flipUpsideDown]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: layer.backgroundColor === "transparent" ? "transparent" : layer.backgroundColor,
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!layer.src && (
        <div style={overlayStyle}>Set a .ply / .splat / .spz / .sog URL in Properties</div>
      )}
      {loading && <div style={overlayStyle}>Loading splat…</div>}
      {error && <div style={{ ...overlayStyle, color: "#fca5a5" }}>{error}</div>}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: 16,
  fontSize: 12,
  color: "#94a3b8",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  pointerEvents: "none",
};
