"use client";

import * as React from "react";
import * as THREE from "three/webgpu";
import { isWebGPUSupported } from "@/lib/renderer/WebGPURenderer";
import { loadImageTexture, createVideoTexture } from "@/lib/renderer/MediaTexture";
import { PipelineManager } from "@/lib/renderer/PipelineManager";
import type { PipelineLayer } from "@/lib/renderer/PipelineManager";
import { useLayerStore } from "@/store/layerStore";
import { useEditorStore } from "@/store/editorStore";
import type { Layer } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────

interface CanvasProps {
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback
// ─────────────────────────────────────────────────────────────────────────────

function CanvasFallback({ status }: { status: "loading" | "unsupported" | "error" }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
      {status === "loading" && (
        <p className="text-[var(--color-fg-disabled)] text-sm">Initialising WebGPU…</p>
      )}
      {status === "unsupported" && (
        <>
          <p className="text-[var(--color-fg-secondary)] text-sm font-medium">WebGPU unavailable</p>
          <p className="text-[var(--color-fg-tertiary)] text-xs">Requires Chrome 113+, Edge 113+, or Safari 18+</p>
        </>
      )}
      {status === "error" && (
        <p className="text-[var(--color-fg-secondary)] text-sm">Renderer error — check console</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Production WebGPU canvas.
 *
 * - Mounts a Three.js WebGPURenderer; disposes on unmount
 * - Drives PipelineManager from layerStore (shader passes) and any media
 *   layers (kind='image'|'video' with a mediaUrl set)
 * - Uses a direct Zustand store subscription (not a React effect dep chain)
 *   so media loads and pass syncs fire synchronously on every store update
 * - Applies zoom/pan from editorStore as a CSS transform on the inner wrapper
 * - Reports FPS back to editorStore
 * - ResizeObserver keeps the renderer in sync with container size
 */
export function Canvas({ className }: CanvasProps) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pipelineRef = React.useRef<PipelineManager | null>(null);
  const rendererRef = React.useRef<THREE.WebGPURenderer | null>(null);

  const [status, setStatus] = React.useState<"loading" | "ready" | "unsupported" | "error">(
    "loading",
  );

  // ── Store subscriptions ────────────────────────────────────────────────────
  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const setFps = useEditorStore((s) => s.setFps);

  // Track which media URL is currently loaded into the base quad
  const loadedBaseUrlRef = React.useRef<string | null>(null);

  // ── WebGPU init (once) ─────────────────────────────────────────────────────
  React.useEffect(() => {
    const outer = outerRef.current;
    const canvas = canvasRef.current;
    if (!outer || !canvas) return;

    if (!isWebGPUSupported()) {
      setStatus("unsupported");
      return;
    }

    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;
    let pipeline: PipelineManager | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        renderer = new THREE.WebGPURenderer({ canvas: canvas!, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const rect = outer.getBoundingClientRect();
        const w = Math.max(Math.floor(rect.width), 1);
        const h = Math.max(Math.floor(rect.height), 1);
        renderer.setSize(w, h, false);

        await renderer.init();
        if (disposed) { renderer.dispose(); return; }

        rendererRef.current = renderer;
        pipeline = new PipelineManager(renderer, w, h);
        pipelineRef.current = pipeline;
        pipeline.baseQuad.updateCanvasAspect(w, h);

        // Animation loop
        let frames = 0, lastFpsSec = 0, prevTimeSec = 0;
        renderer.setAnimationLoop((timeMs: number) => {
          const timeSec = timeMs / 1000;
          const delta = prevTimeSec > 0 ? timeSec - prevTimeSec : 0;
          prevTimeSec = timeSec;

          pipeline!.render(timeSec, delta);

          frames++;
          if (timeSec - lastFpsSec >= 1) {
            setFps(frames);
            frames = 0;
            lastFpsSec = timeSec;
          }
        });

        // Resize observer — keeps renderer in sync with container
        ro = new ResizeObserver(([entry]) => {
          const { width: rw, height: rh } = entry.contentRect;
          if (rw > 0 && rh > 0) {
            renderer?.setSize(Math.floor(rw), Math.floor(rh), false);
            pipeline?.resize(Math.floor(rw), Math.floor(rh));
          }
        });
        ro.observe(outer!);

        setStatus("ready");
      } catch (err) {
        if (!disposed) setStatus("error");
        console.error("[Canvas]", err);
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      renderer?.setAnimationLoop(null);
      pipeline?.dispose();
      renderer?.dispose();
      rendererRef.current = null;
      pipelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layer / media sync via direct Zustand subscription ───────────────────
  React.useEffect(() => {
    if (status !== "ready") return;

    function sync(layers: Layer[]) {
      // Always read the current pipeline — avoids stale closure + fixes TS null narrowing
      const p = pipelineRef.current;
      if (!p) return;

      const ordered = [...layers].reverse(); // bottom → top

      // Shader layers → pipeline passes
      const passes: PipelineLayer[] = ordered
        .filter((l) => l.kind === "shader")
        .map((l) => ({
          id: l.id,
          visible: l.visible,
          opacity: l.opacity,
          blendMode: l.blendMode,
          filterMode: l.filterMode,
          params: l.params,
        }));
      p.syncLayers(passes);

      // Base media: lowest media layer with a URL drives the base quad
      const mediaLayer = ordered.find(
        (l) => (l.kind === "image" || l.kind === "video") && l.mediaUrl,
      );

      if (mediaLayer?.mediaUrl && mediaLayer.mediaUrl !== loadedBaseUrlRef.current) {
        loadedBaseUrlRef.current = mediaLayer.mediaUrl;
        _loadBaseMedia(p, mediaLayer);
      }
    }

    // Sync immediately with current store state (handles pre-existing layers)
    sync(useLayerStore.getState().layers);

    // Subscribe to all future store changes — fires synchronously on every set()
    const unsub = useLayerStore.subscribe((state) => sync(state.layers));

    return unsub;
  }, [status]);

  // ── Zoom / pan → CSS transform ─────────────────────────────────────────────
  React.useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    inner.style.transform = `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`;
  }, [zoom, panOffset]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div ref={outerRef} className={`relative overflow-hidden ${className ?? ""}`}>
      <div ref={innerRef} className="absolute inset-0" style={{ transformOrigin: "center center" }}>
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: status === "ready" ? "block" : "none" }}
        />
      </div>

      {status !== "ready" && <CanvasFallback status={status} />}

      {/* FPS badge — dev only */}
      {process.env.NODE_ENV === "development" && status === "ready" && (
        <_FpsBadge />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _loadBaseMedia(pipeline: PipelineManager, layer: Layer): Promise<void> {
  if (!layer.mediaUrl) return;
  try {
    if (layer.kind === "image") {
      const tex = await loadImageTexture(layer.mediaUrl);
      pipeline.baseQuad.setTexture(tex, "cover");
    } else {
      const handle = await createVideoTexture(layer.mediaUrl);
      pipeline.baseQuad.setVideoHandle(handle, "cover");
    }
  } catch (err) {
    console.error("[Canvas] failed to load base media:", err);
  }
}

function _FpsBadge() {
  const fps = useEditorStore((s) => s.fps);
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">
      {fps} fps
    </div>
  );
}
