"use client";

import * as React from "react";
import * as THREE from "three/webgpu";
import { Badge, Button, Text } from "@/components/ui";
import { UploadSimple, Plus, Minus } from "@phosphor-icons/react";
import { isWebGPUSupported } from "@/lib/renderer/WebGPURenderer";
import { PipelineManager } from "@/lib/renderer/PipelineManager";
import type { PipelineLayer } from "@/lib/renderer/PipelineManager";
import { useMediaStore } from "@/store/mediaStore";

// ─────────────────────────────────────────────────────────────────────────────

export function PipelinePreview() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pipelineRef = React.useRef<PipelineManager | null>(null);
  const threeRendererRef = React.useRef<THREE.WebGPURenderer | null>(null);

  const [status, setStatus] = React.useState<"loading" | "ready" | "unsupported" | "error">(
    "loading",
  );
  const [fps, setFps] = React.useState(0);
  const [hasMedia, setHasMedia] = React.useState(false);
  const [loadingMedia, setLoadingMedia] = React.useState(false);

  // Local layer list — in Phase 3 this will be driven by layerStore
  const [layers, setLayers] = React.useState<PipelineLayer[]>([]);

  const loadAsset = useMediaStore((s) => s.loadAsset);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ── Renderer + Pipeline init ──────────────────────────────────────────────
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    if (!isWebGPUSupported()) {
      setStatus("unsupported");
      return;
    }

    let disposed = false;
    let threeRenderer: THREE.WebGPURenderer | null = null;
    let pipeline: PipelineManager | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        threeRenderer = new THREE.WebGPURenderer({ canvas: canvas!, antialias: true });
        threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const rect = container.getBoundingClientRect();
        const w = Math.max(Math.floor(rect.width), 1);
        const h = Math.max(Math.floor(rect.height), 1);
        threeRenderer.setSize(w, h, false);

        await threeRenderer.init();
        if (disposed) { threeRenderer.dispose(); return; }

        threeRendererRef.current = threeRenderer;
        pipeline = new PipelineManager(threeRenderer, w, h);
        pipelineRef.current = pipeline;

        // Animation loop
        let frames = 0, lastFpsSec = 0, prevTimeSec = 0;
        threeRenderer.setAnimationLoop((timeMs: number) => {
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

        ro = new ResizeObserver(([entry]) => {
          const { width: rw, height: rh } = entry.contentRect;
          if (rw > 0 && rh > 0) {
            threeRenderer?.setSize(Math.floor(rw), Math.floor(rh), false);
            pipeline?.resize(Math.floor(rw), Math.floor(rh));
          }
        });
        ro.observe(container!);

        setStatus("ready");
      } catch (err) {
        if (!disposed) setStatus("error");
        console.error("[PipelinePreview]", err);
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      threeRenderer?.setAnimationLoop(null);
      pipeline?.dispose();
      threeRenderer?.dispose();
      pipelineRef.current = null;
      threeRendererRef.current = null;
    };
  }, []);

  // ── Sync layers → pipeline whenever local state changes ───────────────────
  React.useEffect(() => {
    pipelineRef.current?.syncLayers(layers);
  }, [layers]);

  // ── Media upload ──────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setLoadingMedia(true);
    try {
      const asset = await loadAsset(file);
      // Add media as the bottom layer so shader passes composite over it
      const mediaLayer: PipelineLayer = {
        id:         "preview-media",
        kind:       asset.type === "video" ? "video" : "image",
        visible:    true,
        opacity:    1,
        blendMode:  "normal",
        filterMode: "filter",
        params:     [],
        mediaUrl:   asset.url,
      };
      setLayers((prev) => [
        mediaLayer,
        ...prev.filter((l) => l.id !== "preview-media"),
      ]);
      setHasMedia(true);
    } catch (err) {
      console.error("[PipelinePreview] upload error:", err);
    } finally {
      setLoadingMedia(false);
    }
  }

  // ── Layer management (demo controls) ─────────────────────────────────────
  function addPass() {
    const newLayer: PipelineLayer = {
      id:         `pass-${Date.now()}`,
      kind:       "shader",
      visible:    true,
      opacity:    1,
      blendMode:  "normal",
      filterMode: "filter",
      params:     [],
    };
    setLayers((prev) => [...prev, newLayer]);
  }

  function removePass() {
    setLayers((prev) => prev.slice(0, -1));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const canvasVisible = status === "ready";

  return (
    <div className="space-y-xs">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative h-56 w-full overflow-hidden rounded-sm border border-[var(--color-border)] bg-primary"
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: canvasVisible ? "block" : "none" }}
        />

        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Text variant="caption" color="disabled">Initialising pipeline…</Text>
          </div>
        )}
        {status === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-xs">
            <Text variant="subhead" color="secondary">WebGPU unavailable</Text>
            <Text variant="caption" color="tertiary">Requires Chrome 113+ or Safari 18+</Text>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Text variant="caption" color="secondary">Pipeline error — see console</Text>
          </div>
        )}

        {canvasVisible && !hasMedia && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-xs">
            <UploadSimple size={22} className="text-[var(--color-fg-secondary)] opacity-30" />
            <Text variant="caption" color="disabled">Upload media first, then add passes</Text>
          </div>
        )}

        {canvasVisible && (
          <div className="absolute bottom-xs right-xs flex items-center gap-3xs">
            <Badge variant="secondary" className="border-0 bg-black/40 text-white backdrop-blur-sm">
              {layers.length} pass{layers.length !== 1 ? "es" : ""}
            </Badge>
            <Badge variant="secondary" className="border-0 bg-black/40 text-white backdrop-blur-sm">
              {fps} fps
            </Badge>
            <Badge variant="accent" className="border-0 bg-black/40 backdrop-blur-sm">
              WebGPU
            </Badge>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-xs">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={status !== "ready" || loadingMedia}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadSimple size={14} />
          {loadingMedia ? "Loading…" : "Upload media"}
        </Button>

        <Button
          size="sm"
          variant="secondary"
          disabled={status !== "ready"}
          onClick={addPass}
        >
          <Plus size={14} />
          Add passthrough pass
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={status !== "ready" || layers.length === 0}
          onClick={removePass}
        >
          <Minus size={14} />
          Remove pass
        </Button>

        {layers.length > 0 && (
          <Text variant="caption" color="tertiary" className="ml-auto">
            {layers.length} passthrough pass{layers.length !== 1 ? "es" : ""} — media should still display unchanged
          </Text>
        )}
      </div>
    </div>
  );
}
