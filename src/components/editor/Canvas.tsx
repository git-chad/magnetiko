"use client";

import * as React from "react";
import * as THREE from "three/webgpu";
import { ArrowSquareIn, ImageSquare } from "@phosphor-icons/react";
import { isWebGPUSupported } from "@/lib/renderer/WebGPURenderer";
import { PipelineManager } from "@/lib/renderer/PipelineManager";
import type { PipelineLayer } from "@/lib/renderer/PipelineManager";
import { useLayerStore } from "@/store/layerStore";
import { useEditorStore } from "@/store/editorStore";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useMouseInteraction } from "@/hooks/useMouseInteraction";
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
  const interaction = useMouseInteraction({ targetRef: outerRef });

  const [status, setStatus] = React.useState<"loading" | "ready" | "unsupported" | "error">(
    "loading",
  );

  // ── Store subscriptions ────────────────────────────────────────────────────
  const zoom      = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const setFps    = useEditorStore((s) => s.setFps);

  // True when at least one media layer with a loaded URL exists
  const hasMediaLayers = useLayerStore(
    (s) => s.layers.some((l) => l.kind === "webcam" || ((l.kind === "image" || l.kind === "video") && l.mediaUrl)),
  );

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const { upload, isLoading: uploadLoading } = useMediaUpload();
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragCountRef = React.useRef(0);

  const handleDragEnter = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCountRef.current++;
    setIsDragOver(true);
  }, []);

  const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = React.useCallback(() => {
    if (--dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = React.useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) await upload(file);
    },
    [upload],
  );

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

        // Animation loop
        let frames = 0, lastFpsSec = 0, prevTimeSec = 0;
        renderer.setAnimationLoop((timeMs: number) => {
          const timeSec = timeMs / 1000;
          const delta = prevTimeSec > 0 ? timeSec - prevTimeSec : 0;
          prevTimeSec = timeSec;

          const pointer = interaction.getFrameData();
          pipeline!.setPointerForInteractivity(
            pointer.uvX,
            pointer.uvY,
            pointer.duvX,
            pointer.duvY,
            pointer.isActive,
          );
          for (const click of interaction.consumeClicks()) {
            pipeline!.addClickForInteractivity(click.uvX, click.uvY);
          }

          const didRender = pipeline!.render(timeSec, delta);
          if (didRender) frames++;
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

  // ── Layer sync via direct Zustand subscription ────────────────────────────
  React.useEffect(() => {
    if (status !== "ready") return;

    function sync(layers: Layer[]) {
      const p = pipelineRef.current;
      if (!p) return;

      // All layers — both media and shader — become passes in the pipeline,
      // ordered bottom → top so the render chain composites correctly.
      const passes: PipelineLayer[] = [...layers].reverse().map((l) => ({
        id:         l.id,
        kind:       l.kind,
        visible:    l.visible,
        opacity:    l.opacity,
        blendMode:  l.blendMode,
        filterMode: l.filterMode,
        params:     l.params,
        shaderType: l.shaderType,
        mediaUrl:   l.mediaUrl,
      }));

      p.syncLayers(passes);
    }

    sync(useLayerStore.getState().layers);
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
    <div
      ref={outerRef}
      className={`relative overflow-hidden ${className ?? ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={innerRef} className="absolute inset-0" style={{ transformOrigin: "center center" }}>
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: status === "ready" ? "block" : "none" }}
        />
      </div>

      {status !== "ready" && <CanvasFallback status={status} />}

      {/* Empty state — shown when canvas is ready but no media is loaded */}
      {status === "ready" && !hasMediaLayers && !isDragOver && (
        <_EmptyState />
      )}

      {/* Drag-over overlay */}
      {isDragOver && <_DropOverlay />}

      {/* Upload progress overlay */}
      {uploadLoading && <_LoadingOverlay />}

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

function _FpsBadge() {
  const fps = useEditorStore((s) => s.fps);
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">
      {fps} fps
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function _EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-xs select-none">
      <div className="flex flex-col items-center gap-xs rounded-md border border-dashed border-[var(--color-border-hover)] px-xl py-lg text-center">
        <ImageSquare
          size={32}
          weight="thin"
          className="text-[var(--color-fg-disabled)]"
        />
        <div className="flex flex-col gap-[3px]">
          <p className="text-sm font-medium text-[var(--color-fg-secondary)]">
            Drop media to get started
          </p>
          <p className="text-xs text-[var(--color-fg-disabled)]">
            PNG · JPG · WebP · GIF · MP4 · WebM
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Drop overlay ──────────────────────────────────────────────────────────────

function _DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-xs">
      {/* Tinted backdrop */}
      <div className="absolute inset-0 bg-[var(--color-accent)] opacity-[0.06]" />
      {/* Dashed border inset */}
      <div className="absolute inset-3 rounded-md border-2 border-dashed border-[var(--color-accent)] opacity-60" />
      {/* Label */}
      <div className="relative flex items-center gap-xs rounded-sm bg-[var(--color-bg-raised)] px-sm py-xs shadow-mid">
        <ArrowSquareIn size={16} className="text-[var(--color-accent)]" />
        <span className="text-sm font-medium text-[var(--color-fg-primary)]">
          Drop to import
        </span>
      </div>
    </div>
  );
}

// ── Loading overlay ───────────────────────────────────────────────────────────

function _LoadingOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--color-bg)] opacity-40" />
      <div className="relative flex items-center gap-xs rounded-sm bg-[var(--color-bg-raised)] px-sm py-xs shadow-mid">
        <svg
          className="h-4 w-4 animate-spin text-[var(--color-accent)]"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <span className="text-sm text-[var(--color-fg-secondary)]">Loading…</span>
      </div>
    </div>
  );
}
