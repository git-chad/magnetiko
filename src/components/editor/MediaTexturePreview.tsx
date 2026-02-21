"use client";

import * as React from "react";
import { Badge, Button, Text } from "@/components/ui";
import { UploadSimple, ArrowsHorizontal, ArrowsInCardinal } from "@phosphor-icons/react";
import { isWebGPUSupported, createRenderer } from "@/lib/renderer/WebGPURenderer";
import { FullscreenQuad, loadImageTexture, createVideoTexture } from "@/lib/renderer/MediaTexture";
import type { MagnetikoRenderer } from "@/lib/renderer/WebGPURenderer";
import type { FitMode } from "@/lib/renderer/MediaTexture";
import { useMediaStore } from "@/store/mediaStore";

// ─────────────────────────────────────────────────────────────────────────────

interface MediaInfo {
  name: string;
  width: number;
  height: number;
  type: "image" | "video";
  duration?: number;
}

export function MediaTexturePreview() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<MagnetikoRenderer | null>(null);
  const quadRef = React.useRef<FullscreenQuad | null>(null);

  // Keep fitMode in a ref too so the async load callback reads the current value
  const [fitMode, _setFitMode] = React.useState<FitMode>("cover");
  const fitModeRef = React.useRef<FitMode>("cover");
  function setFitMode(m: FitMode) {
    fitModeRef.current = m;
    _setFitMode(m);
  }

  const [status, setStatus] = React.useState<"loading" | "ready" | "unsupported" | "error">(
    "loading",
  );
  const [fps, setFps] = React.useState(0);
  const [mediaInfo, setMediaInfo] = React.useState<MediaInfo | null>(null);
  const [loadingMedia, setLoadingMedia] = React.useState(false);

  const loadAsset = useMediaStore((s) => s.loadAsset);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ── Renderer init (runs once) ─────────────────────────────────────────────
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    if (!isWebGPUSupported()) {
      setStatus("unsupported");
      return;
    }

    let disposed = false;
    let instance: MagnetikoRenderer | null = null;
    let quad: FullscreenQuad | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        instance = await createRenderer(canvas!, { antialias: true });
        if (disposed) { instance.dispose(); return; }
        rendererRef.current = instance;

        quad = new FullscreenQuad();
        quadRef.current = quad;
        instance.scene.add(quad.mesh);

        // Seed canvas aspect before first ResizeObserver fires
        const rect = container.getBoundingClientRect();
        if (rect.width > 0) quad.updateCanvasAspect(rect.width, rect.height);

        // FPS counter
        let frames = 0;
        let lastFpsSec = 0;
        instance.setAnimationCallback((timeSec) => {
          // Mark video texture dirty each frame so the GPU re-uploads it
          quad?.tick();

          frames++;
          if (timeSec - lastFpsSec >= 1) {
            setFps(frames);
            frames = 0;
            lastFpsSec = timeSec;
          }
        });

        // Resize → update renderer + canvas aspect uniform
        ro = new ResizeObserver(([entry]) => {
          const { width: w, height: h } = entry.contentRect;
          if (w > 0 && h > 0) {
            instance?.resize(Math.floor(w), Math.floor(h));
            quad?.updateCanvasAspect(w, h);
          }
        });
        ro.observe(container!);

        setStatus("ready");
      } catch (err) {
        if (!disposed) setStatus("error");
        console.error("[MediaTexturePreview]", err);
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      quad?.dispose();
      instance?.dispose();
      rendererRef.current = null;
      quadRef.current = null;
    };
  }, []);

  // ── Media loading ─────────────────────────────────────────────────────────
  async function loadMediaFromUrl(
    url: string,
    type: "image" | "video",
    name: string,
    width: number,
    height: number,
    duration?: number,
  ) {
    const quad = quadRef.current;
    if (!quad) return;

    setLoadingMedia(true);
    try {
      if (type === "image") {
        const tex = await loadImageTexture(url);
        quad.setTexture(tex, fitModeRef.current);
      } else {
        const handle = await createVideoTexture(url);
        quad.setVideoHandle(handle, fitModeRef.current);
      }
      setMediaInfo({ name, width, height, type, duration });
    } catch (err) {
      console.error("[MediaTexturePreview] failed to load media:", err);
    } finally {
      setLoadingMedia(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const asset = await loadAsset(file);
      await loadMediaFromUrl(
        asset.url,
        asset.type,
        asset.name,
        asset.width,
        asset.height,
        asset.duration,
      );
    } catch (err) {
      console.error("[MediaTexturePreview] upload error:", err);
    }
  }

  function handleFitToggle() {
    const next: FitMode = fitMode === "cover" ? "contain" : "cover";
    setFitMode(next);
    quadRef.current?.applyFitMode(next);
  }

  // ── Render ────────────────────────────────────────────────────────────────
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
            <Text variant="caption" color="disabled">Initialising WebGPU…</Text>
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
            <Text variant="caption" color="secondary">Renderer error — see console</Text>
          </div>
        )}

        {canvasVisible && !mediaInfo && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-xs">
            <UploadSimple size={22} className="text-[var(--color-fg-secondary)] opacity-30" />
            <Text variant="caption" color="disabled">Upload an image or video to display it here</Text>
          </div>
        )}

        {canvasVisible && (
          <div className="absolute bottom-xs right-xs flex items-center gap-3xs">
            {mediaInfo && (
              <Badge variant="secondary" className="border-0 bg-black/40 text-white backdrop-blur-sm">
                {fitMode}
              </Badge>
            )}
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
          {loadingMedia ? "Loading…" : "Upload image / video"}
        </Button>

        {mediaInfo && (
          <Button size="sm" variant="ghost" onClick={handleFitToggle}>
            {fitMode === "cover" ? (
              <><ArrowsHorizontal size={14} /> Cover → Contain</>
            ) : (
              <><ArrowsInCardinal size={14} /> Contain → Cover</>
            )}
          </Button>
        )}

        {mediaInfo && (
          <Text variant="caption" color="tertiary" className="ml-auto">
            {mediaInfo.name} · {mediaInfo.width}×{mediaInfo.height}
            {mediaInfo.duration ? ` · ${mediaInfo.duration.toFixed(1)}s` : ""}
          </Text>
        )}
      </div>
    </div>
  );
}
