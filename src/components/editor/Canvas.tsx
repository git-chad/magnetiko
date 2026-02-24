"use client";

import * as React from "react";
import * as THREE from "three/webgpu";
import { ArrowSquareIn, ImageSquare } from "@phosphor-icons/react";
import { isWebGPUSupported } from "@/lib/renderer/WebGPURenderer";
import { PipelineManager } from "@/lib/renderer/PipelineManager";
import type { PipelineLayer } from "@/lib/renderer/PipelineManager";
import { useLayerStore } from "@/store/layerStore";
import { useEditorStore } from "@/store/editorStore";
import { useMediaStore } from "@/store/mediaStore";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useMouseInteraction } from "@/hooks/useMouseInteraction";
import type { Layer } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────

interface CanvasProps {
  className?: string;
}

type SourceMedia = {
  kind: "image" | "video" | "webcam";
  url: string | null;
};

type RenderRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function toSourceMedia(layer: Layer): SourceMedia | null {
  if (layer.kind === "webcam") return { kind: "webcam", url: null };
  if ((layer.kind === "image" || layer.kind === "video") && layer.mediaUrl) {
    return { kind: layer.kind, url: layer.mediaUrl };
  }
  return null;
}

function getActiveSourceMedia(layers: Layer[], selectedLayerId: string | null): SourceMedia | null {
  const hasSolo = layers.some((layer) => layer.solo);
  const activeLayers = hasSolo ? layers.filter((layer) => layer.solo) : layers.filter((layer) => layer.visible);

  // If the selected layer is itself a media layer, it owns the canvas aspect.
  if (selectedLayerId) {
    const selected = activeLayers.find((layer) => layer.id === selectedLayerId);
    if (selected) {
      const source = toSourceMedia(selected);
      if (source) return source;
    }
  }

  // Otherwise choose the front-most active media layer (panel order is top -> bottom).
  for (let i = 0; i < activeLayers.length; i++) {
    const source = toSourceMedia(activeLayers[i]);
    if (source) return source;
  }

  return null;
}

function safeAspect(width: number, height: number): number {
  return Math.max(width, 1) / Math.max(height, 1);
}

function fitRect(outerWidth: number, outerHeight: number, aspect: number): RenderRect {
  const ow = Math.max(Math.floor(outerWidth), 1);
  const oh = Math.max(Math.floor(outerHeight), 1);
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  const outerAspect = ow / oh;
  if (outerAspect > a) {
    const h = oh;
    const w = Math.max(Math.floor(h * a), 1);
    return {
      width: w,
      height: h,
      left: Math.floor((ow - w) * 0.5),
      top: 0,
    };
  }

  const w = ow;
  const h = Math.max(Math.floor(w / a), 1);
  return {
    width: w,
    height: h,
    left: 0,
    top: Math.floor((oh - h) * 0.5),
  };
}

function isSameRect(a: RenderRect, b: RenderRect): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function loadImageAspect(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image metadata for ${url}`));
    img.src = url;
  });
}

function loadVideoAspect(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    video.onerror = () => reject(new Error(`Failed to load video metadata for ${url}`));
    video.src = url;
  });
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
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pipelineRef = React.useRef<PipelineManager | null>(null);
  const rendererRef = React.useRef<THREE.WebGPURenderer | null>(null);
  const interaction = useMouseInteraction({ targetRef: surfaceRef });

  const [status, setStatus] = React.useState<"loading" | "ready" | "unsupported" | "error">(
    "loading",
  );
  const [renderRect, setRenderRect] = React.useState<RenderRect>({
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  });

  // ── Store subscriptions ────────────────────────────────────────────────────
  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const setFps = useEditorStore((s) => s.setFps);
  const setCanvasSize = useEditorStore((s) => s.setCanvasSize);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const hasMediaLayers = useLayerStore((s) =>
    s.layers.some(
      (l) =>
        l.kind === "webcam" ||
        ((l.kind === "image" || l.kind === "video") && Boolean(l.mediaUrl)),
    ),
  );
  const sourceMediaKind = useLayerStore(
    (s) => getActiveSourceMedia(s.layers, s.selectedLayerId)?.kind ?? null,
  );
  const sourceMediaUrl = useLayerStore(
    (s) => getActiveSourceMedia(s.layers, s.selectedLayerId)?.url ?? null,
  );
  const sourceMedia = React.useMemo<SourceMedia | null>(() => {
    if (!sourceMediaKind) return null;
    return {
      kind: sourceMediaKind,
      url: sourceMediaUrl,
    };
  }, [sourceMediaKind, sourceMediaUrl]);
  const matchedAsset = useMediaStore((s) =>
    sourceMedia?.url ? s.assets.find((a) => a.url === sourceMedia.url) ?? null : null,
  );
  const fallbackAspect = safeAspect(canvasSize.width, canvasSize.height);
  const [sourceAspect, setSourceAspect] = React.useState(fallbackAspect);
  const sourceAspectRef = React.useRef(sourceAspect);

  const resizeSurface = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const rect = outer.getBoundingClientRect();
    const next = fitRect(rect.width, rect.height, sourceAspectRef.current);
    setRenderRect((prev) => (isSameRect(prev, next) ? prev : next));

    const renderer = rendererRef.current;
    const pipeline = pipelineRef.current;
    if (renderer && pipeline) {
      renderer.setSize(next.width, next.height, false);
      pipeline.resize(next.width, next.height);
    }
  }, []);

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

  React.useEffect(() => {
    sourceAspectRef.current = sourceAspect;
    resizeSurface();
  }, [sourceAspect, resizeSurface]);

  React.useEffect(() => {
    let cancelled = false;

    async function resolveAspect() {
      if (!sourceMedia) {
        setSourceAspect(fallbackAspect);
        return;
      }

      if (sourceMedia.kind === "webcam") {
        setSourceAspect(fallbackAspect);
        return;
      }

      if (!sourceMedia.url) {
        setSourceAspect(fallbackAspect);
        return;
      }

      if (matchedAsset) {
        const nextAspect = safeAspect(matchedAsset.width, matchedAsset.height);
        setSourceAspect(nextAspect);
        setCanvasSize(matchedAsset.width, matchedAsset.height);
        return;
      }

      try {
        const size =
          sourceMedia.kind === "video"
            ? await loadVideoAspect(sourceMedia.url)
            : await loadImageAspect(sourceMedia.url);
        if (cancelled) return;
        setCanvasSize(size.width, size.height);
        setSourceAspect(safeAspect(size.width, size.height));
      } catch {
        if (!cancelled) setSourceAspect(fallbackAspect);
      }
    }

    void resolveAspect();

    return () => {
      cancelled = true;
    };
  }, [fallbackAspect, matchedAsset, setCanvasSize, sourceMedia]);

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
        const initialRect = fitRect(rect.width, rect.height, sourceAspectRef.current);
        setRenderRect((prev) => (isSameRect(prev, initialRect) ? prev : initialRect));
        renderer.setSize(initialRect.width, initialRect.height, false);

        await renderer.init();
        if (disposed) { renderer.dispose(); return; }

        rendererRef.current = renderer;
        pipeline = new PipelineManager(renderer, initialRect.width, initialRect.height);
        pipelineRef.current = pipeline;
        resizeSurface();

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
        ro = new ResizeObserver(() => {
          resizeSurface();
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
  }, [resizeSurface]);

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
      <div
        ref={surfaceRef}
        className="absolute"
        style={{
          left: `${renderRect.left}px`,
          top: `${renderRect.top}px`,
          width: `${renderRect.width}px`,
          height: `${renderRect.height}px`,
        }}
      >
        <div ref={innerRef} className="absolute inset-0" style={{ transformOrigin: "center center" }}>
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            style={{ display: status === "ready" ? "block" : "none" }}
          />
        </div>
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
