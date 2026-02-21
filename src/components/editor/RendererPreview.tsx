"use client";

import * as React from "react";
import { Badge, Text } from "@/components/ui";
import { isWebGPUSupported, createRenderer } from "@/lib/renderer/WebGPURenderer";
import type { MagnetikoRenderer } from "@/lib/renderer/WebGPURenderer";

// ─────────────────────────────────────────────────────────────────────────────
// Fallback shown when WebGPU is not available
// ─────────────────────────────────────────────────────────────────────────────

function WebGPUFallback({ reason }: { reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-xs text-center">
      <Text variant="subhead" color="secondary">
        WebGPU not available
      </Text>
      <Text variant="caption" color="tertiary" className="max-w-xs">
        {reason}
      </Text>
      <Text variant="caption" color="disabled">
        Requires Chrome 113+, Edge 113+, or Safari 18+ with WebGPU enabled.
      </Text>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RendererPreview
// ─────────────────────────────────────────────────────────────────────────────

export function RendererPreview() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<MagnetikoRenderer | null>(null);

  const [status, setStatus] = React.useState<"loading" | "ok" | "unsupported" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = React.useState("");
  const [fps, setFps] = React.useState(0);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let disposed = false;
    let ro: ResizeObserver | null = null;
    let instance: MagnetikoRenderer | null = null;

    async function init() {
      // ── 1. Check support ───────────────────────────────────────────────
      if (!isWebGPUSupported()) {
        setStatus("unsupported");
        return;
      }

      try {
        // ── 2. Boot renderer ─────────────────────────────────────────────
        instance = await createRenderer(canvas!, { antialias: true });
        if (disposed) { instance.dispose(); return; }
        rendererRef.current = instance;

        // ── 3. Build scene: fullscreen quad with animated TSL shader ─────
        // Dynamic imports keep Three.js/TSL out of the SSR bundle.
        const THREE = await import("three/webgpu");
        const { uv, time, sin, mix, color } = await import("three/tsl");

        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshBasicNodeMaterial();

        // Plasma wave using brand palette
        // wave functions oscillate between -1 and 1, remapped to 0–1
        const uvCoord = uv();
        const wave1 = sin(uvCoord.x.mul(8.0).add(time));
        const wave2 = sin(uvCoord.y.mul(6.0).add(time.mul(1.2)));
        const wave3 = sin(uvCoord.x.add(uvCoord.y).mul(5.0).sub(time.mul(0.7)));
        const plasma = wave1.add(wave2).add(wave3).div(3.0).mul(0.5).add(0.5);

        const colDark   = color("#1d1d1c"); // --primary
        const colAccent = color("#64643a"); // --accent
        const colLight  = color("#d4d4cf"); // --primary-300

        // double-mix gives a richer palette sweep than a single lerp
        material.colorNode = mix(
          mix(colDark, colAccent, plasma),
          colLight,
          plasma.mul(plasma),
        );

        const mesh = new THREE.Mesh(geometry, material);
        instance.scene.add(mesh);

        // ── 4. FPS counter ───────────────────────────────────────────────
        let frames = 0;
        let lastFpsSec = 0;
        instance.setAnimationCallback((timeSec) => {
          frames++;
          if (timeSec - lastFpsSec >= 1) {
            setFps(frames);
            frames = 0;
            lastFpsSec = timeSec;
          }
        });

        // ── 5. Resize observer ───────────────────────────────────────────
        ro = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            instance?.resize(Math.floor(width), Math.floor(height));
          }
        });
        ro.observe(container!);

        setStatus("ok");
      } catch (err) {
        if (!disposed) {
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
    }

    init();

    return () => {
      disposed = true;
      ro?.disconnect();
      instance?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-56 w-full overflow-hidden rounded-sm border border-[var(--color-border)] bg-primary"
    >
      {/* Canvas fills container; renderer controls actual pixel dimensions */}
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: status === "ok" ? "block" : "none" }}
      />

      {/* Loading state */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Text variant="caption" color="disabled">
            Initialising WebGPU…
          </Text>
        </div>
      )}

      {/* Unsupported */}
      {status === "unsupported" && (
        <WebGPUFallback reason="navigator.gpu is not available in this browser or context." />
      )}

      {/* Error */}
      {status === "error" && (
        <WebGPUFallback reason={errorMsg || "An unexpected error occurred during renderer initialisation."} />
      )}

      {/* Overlay badges */}
      {status === "ok" && (
        <div className="absolute bottom-xs right-xs flex items-center gap-3xs">
          <Badge variant="secondary" className="bg-black/40 text-white border-0 backdrop-blur-sm">
            {fps} fps
          </Badge>
          <Badge variant="accent" className="bg-black/40 border-0 backdrop-blur-sm">
            WebGPU
          </Badge>
        </div>
      )}
    </div>
  );
}
