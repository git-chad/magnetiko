"use client";

import * as React from "react";
import * as THREE from "three/webgpu";
import { ArrowSquareIn, ImageSquare } from "@phosphor-icons/react";
import { isWebGPUSupported } from "@/lib/renderer/WebGPURenderer";
import { PipelineManager } from "@/lib/renderer/PipelineManager";
import type {
  ExportImageOptions,
  PipelineLayer,
} from "@/lib/renderer/PipelineManager";
import { useLayerStore } from "@/store/layerStore";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useMediaStore } from "@/store/mediaStore";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useMouseInteraction } from "@/hooks/useMouseInteraction";
import { useToast } from "@/components/ui/toast";
import { GROUPS_ENABLED } from "@/config/featureFlags";
import type { Layer, LayerGroup } from "@/types";

type VideoExportPhase = "recording" | "encoding";
type ExportVideoOptions = {
  durationSec: number;
  fps: number;
  mimeType: string;
  bitrate: number;
  onProgress?: (progress: number, phase: VideoExportPhase) => void;
};
type ExportVideoResult = {
  blob: Blob;
  mimeType: string;
};

// ─────────────────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    __magnetikoExportImage?: (options?: ExportImageOptions) => Promise<Blob>;
    __magnetikoExportPng?: () => Promise<Blob>;
    __magnetikoExportVideo?: (
      options: ExportVideoOptions,
    ) => Promise<ExportVideoResult>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface CanvasProps {
  className?: string;
}

type SourceMedia = {
  kind: "image" | "video" | "webcam" | "model";
  url: string | null;
};

type RenderRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const LOW_FPS_THRESHOLD = 30;
const LOW_FPS_STREAK_SECONDS = 3;
const LOW_FPS_WARN_COOLDOWN_MS = 20_000;
const LOW_FPS_RECOVERY_HYSTERESIS = 5;
const THUMBNAIL_INTERVAL_MS = 600;
const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_HEIGHT = 90;
const OOM_WARN_COOLDOWN_MS = 8000;
const MASK_PAINT_HISTORY_LABEL = "Paint mask";
const ZOOM_SUPERSAMPLE_MAX = 2;

function toSourceMedia(layer: Layer): SourceMedia | null {
  if (layer.kind === "webcam") return { kind: "webcam", url: null };
  if (
    (layer.kind === "image" ||
      layer.kind === "video" ||
      layer.kind === "model") &&
    layer.mediaUrl
  ) {
    return { kind: layer.kind, url: layer.mediaUrl };
  }
  return null;
}

function getAutoBaseSourceMedia(
  layers: Layer[],
  groups: LayerGroup[],
): SourceMedia | null {
  const hasSolo = layers.some((layer) => layer.solo);
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const isVisibleWithGroup = (layer: Layer): boolean => {
    if (!layer.visible) return false;
    if (!layer.groupId) return true;
    const group = groupsById.get(layer.groupId);
    return group ? group.visible : true;
  };
  const activeLayers = hasSolo
    ? layers.filter((layer) => layer.solo && isVisibleWithGroup(layer))
    : layers.filter(isVisibleWithGroup);

  // In panel order index 0 is top/front; use bottom-most active media as base frame source.
  for (let i = activeLayers.length - 1; i >= 0; i--) {
    const source = toSourceMedia(activeLayers[i]);
    if (source) return source;
  }

  return null;
}

function safeAspect(width: number, height: number): number {
  return Math.max(width, 1) / Math.max(height, 1);
}

function fitRect(
  outerWidth: number,
  outerHeight: number,
  aspect: number,
): RenderRect {
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

function loadImageAspect(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () =>
      reject(new Error(`Failed to load image metadata for ${url}`));
    img.src = url;
  });
}

function loadVideoAspect(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    video.onerror = () =>
      reject(new Error(`Failed to load video metadata for ${url}`));
    video.src = url;
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback
// ─────────────────────────────────────────────────────────────────────────────

function CanvasFallback({
  status,
  message,
}: {
  status: "loading" | "unsupported" | "error";
  message?: string;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
      {status === "loading" && (
        <p className="text-[var(--color-fg-disabled)] text-sm">
          Initialising WebGPU…
        </p>
      )}
      {status === "unsupported" && (
        <>
          <p className="text-[var(--color-fg-secondary)] text-sm font-medium">
            WebGPU is not available in this browser.
          </p>
          <p className="text-[var(--color-fg-tertiary)] text-xs">
            Requires Chrome 113+, Edge 113+, or Safari 18+ with WebGPU enabled.
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <p className="text-[var(--color-fg-secondary)] text-sm font-medium">
            Renderer initialisation failed.
          </p>
          <p className="max-w-[22rem] text-[var(--color-fg-tertiary)] text-xs">
            {message ??
              "Please refresh the page or try a different browser/GPU driver."}
          </p>
        </>
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
  const maskOverlayRef = React.useRef<HTMLCanvasElement>(null);
  const pipelineRef = React.useRef<PipelineManager | null>(null);
  const rendererRef = React.useRef<THREE.WebGPURenderer | null>(null);
  const maskCanvasByLayerRef = React.useRef(
    new Map<string, HTMLCanvasElement>(),
  );
  const maskTextureByLayerRef = React.useRef(
    new Map<string, THREE.CanvasTexture>(),
  );
  const maskDataByLayerRef = React.useRef(
    new Map<string, string | undefined>(),
  );
  const maskLoadTokenByLayerRef = React.useRef(new Map<string, number>());
  const isMaskPaintingRef = React.useRef(false);
  const maskPaintLayerIdRef = React.useRef<string | null>(null);
  const didPushMaskHistoryRef = React.useRef(false);
  const interaction = useMouseInteraction({ targetRef: surfaceRef });
  const { toast } = useToast();

  const [status, setStatus] = React.useState<
    "loading" | "ready" | "unsupported" | "error"
  >("loading");
  const [statusMessage, setStatusMessage] = React.useState<string>("");
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
  const maskPaint = useEditorStore((s) => s.maskPaint);
  const setCanvasSize = useEditorStore((s) => s.setCanvasSize);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const frameAspectMode = useEditorStore((s) => s.frameAspectMode);
  const frameAspectCustom = useEditorStore((s) => s.frameAspectCustom);
  const frameAspectLocked = useEditorStore((s) => s.frameAspectLocked);
  const setResolvedFrameAspect = useEditorStore(
    (s) => s.setResolvedFrameAspect,
  );
  const renderScale = useEditorStore((s) => s.renderScale);
  const hasMediaLayers = useLayerStore((s) =>
    s.layers.some(
      (l) =>
        l.kind === "webcam" ||
        ((l.kind === "image" || l.kind === "video" || l.kind === "model") &&
          Boolean(l.mediaUrl)),
    ),
  );
  const layerCount = useLayerStore((s) => s.layers.length);
  const hasActiveAscii = useLayerStore((s) => {
    const groupsById = new Map(s.groups.map((group) => [group.id, group]));
    return s.layers.some((layer) => {
      if (
        !layer.visible ||
        layer.kind !== "shader" ||
        layer.shaderType !== "ascii"
      )
        return false;
      if (!layer.groupId) return true;
      return groupsById.get(layer.groupId)?.visible ?? true;
    });
  });
  const hasMediaLayersRef = React.useRef(hasMediaLayers);
  const toastRef = React.useRef(toast);
  const sourceMediaKind = useLayerStore(
    (s) => getAutoBaseSourceMedia(s.layers, s.groups)?.kind ?? null,
  );
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const selectedLayer = useLayerStore((s) =>
    s.selectedLayerId
      ? (s.layers.find((layer) => layer.id === s.selectedLayerId) ?? null)
      : null,
  );
  const setLayerMaskData = useLayerStore((s) => s.setLayerMaskData);
  const pushHistoryState = useHistoryStore((s) => s.pushState);
  const sourceMediaUrl = useLayerStore(
    (s) => getAutoBaseSourceMedia(s.layers, s.groups)?.url ?? null,
  );
  const sourceMedia = React.useMemo<SourceMedia | null>(() => {
    if (!sourceMediaKind) return null;
    return {
      kind: sourceMediaKind,
      url: sourceMediaUrl,
    };
  }, [sourceMediaKind, sourceMediaUrl]);
  const matchedAsset = useMediaStore((s) =>
    sourceMedia?.url
      ? (s.assets.find((a) => a.url === sourceMedia.url) ?? null)
      : null,
  );
  const isMaskPaintActive = Boolean(
    maskPaint.enabled && selectedLayer?.filterMode === "mask",
  );
  const fallbackAspect = safeAspect(canvasSize.width, canvasSize.height);
  const [sourceAspect, setSourceAspect] = React.useState(fallbackAspect);
  const resolvedAspect = React.useMemo(() => {
    if (frameAspectMode === "custom") {
      return safeAspect(frameAspectCustom.width, frameAspectCustom.height);
    }
    if (frameAspectMode === "locked") {
      return Number.isFinite(frameAspectLocked) && frameAspectLocked > 0
        ? frameAspectLocked
        : sourceAspect;
    }
    return sourceAspect;
  }, [
    frameAspectCustom.height,
    frameAspectCustom.width,
    frameAspectLocked,
    frameAspectMode,
    sourceAspect,
  ]);
  const resolvedAspectRef = React.useRef(resolvedAspect);
  const renderScaleRef = React.useRef(renderScale);
  const zoomRef = React.useRef(zoom);
  const sourceMediaKindRef = React.useRef(sourceMediaKind);
  const selectedLayerIdRef = React.useRef(selectedLayerId);
  const thumbnailNeedsRefreshRef = React.useRef(false);
  const thumbnailCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const lastThumbnailRef = React.useRef(new Map<string, string>());
  const shaderErrorNotifiedRef = React.useRef(new Set<string>());
  const mediaErrorNotifiedRef = React.useRef(new Set<string>());
  const lastOomWarnRef = React.useRef<number>(-Infinity);
  const lastMaskPointerRef = React.useRef<{ x: number; y: number } | null>(
    null,
  );

  const updateCanvasExportHints = React.useCallback((zoomBoost: number) => {
    const renderCanvas = canvasRef.current;
    if (!renderCanvas) return;
    const safeZoomBoost =
      Number.isFinite(zoomBoost) && zoomBoost > 0 ? zoomBoost : 1;
    const hintedWidth = Math.max(
      1,
      Math.round(renderCanvas.width / safeZoomBoost),
    );
    const hintedHeight = Math.max(
      1,
      Math.round(renderCanvas.height / safeZoomBoost),
    );
    renderCanvas.dataset.exportWidth = String(hintedWidth);
    renderCanvas.dataset.exportHeight = String(hintedHeight);
  }, []);

  const getMaskRenderSize = React.useCallback(() => {
    const renderCanvas = canvasRef.current;
    return {
      width: Math.max(renderCanvas?.width ?? 1, 1),
      height: Math.max(renderCanvas?.height ?? 1, 1),
    };
  }, []);

  const fillMaskCanvasWhite = React.useCallback(
    (maskCanvas: HTMLCanvasElement) => {
      const ctx = maskCanvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      ctx.restore();
    },
    [],
  );

  const fillMaskCanvasBlack = React.useCallback(
    (maskCanvas: HTMLCanvasElement) => {
      const ctx = maskCanvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      ctx.restore();
    },
    [],
  );

  const ensureMaskResources = React.useCallback(
    (layerId: string, width: number, height: number) => {
      let maskCanvas = maskCanvasByLayerRef.current.get(layerId) ?? null;
      let resized = false;

      if (!maskCanvas) {
        maskCanvas = document.createElement("canvas");
        maskCanvas.width = Math.max(1, width);
        maskCanvas.height = Math.max(1, height);
        fillMaskCanvasWhite(maskCanvas);
        maskCanvasByLayerRef.current.set(layerId, maskCanvas);
        resized = true;
      } else if (maskCanvas.width !== width || maskCanvas.height !== height) {
        const nextCanvas = document.createElement("canvas");
        nextCanvas.width = Math.max(1, width);
        nextCanvas.height = Math.max(1, height);
        const nextCtx = nextCanvas.getContext("2d");
        if (nextCtx) {
          nextCtx.drawImage(
            maskCanvas,
            0,
            0,
            nextCanvas.width,
            nextCanvas.height,
          );
        }
        maskCanvas = nextCanvas;
        maskCanvasByLayerRef.current.set(layerId, maskCanvas);
        resized = true;
      }

      let maskTexture = maskTextureByLayerRef.current.get(layerId) ?? null;
      if (!maskTexture || resized) {
        if (maskTexture) maskTexture.dispose();
        maskTexture = new THREE.CanvasTexture(maskCanvas);
        maskTexture.minFilter = THREE.LinearFilter;
        maskTexture.magFilter = THREE.LinearFilter;
        // PassNode samples masks with RT-space UV (Y-flipped), so keep mask
        // textures unflipped to avoid vertical inversion while painting.
        maskTexture.flipY = false;
        maskTexture.needsUpdate = true;
        maskTextureByLayerRef.current.set(layerId, maskTexture);
      } else if (maskTexture.flipY !== false) {
        // Handle pre-existing textures from earlier sessions/config.
        maskTexture.flipY = false;
        maskTexture.needsUpdate = true;
      }

      return { maskCanvas, maskTexture };
    },
    [fillMaskCanvasWhite],
  );

  const maybeApplyMaskDataUrl = React.useCallback(
    (layer: Layer, width: number, height: number): THREE.Texture | null => {
      if (!layer.maskDataUrl && !maskTextureByLayerRef.current.has(layer.id))
        return null;

      const { maskCanvas, maskTexture } = ensureMaskResources(
        layer.id,
        width,
        height,
      );
      const previousDataUrl = maskDataByLayerRef.current.get(layer.id);
      if (previousDataUrl !== layer.maskDataUrl) {
        maskDataByLayerRef.current.set(layer.id, layer.maskDataUrl);

        if (!layer.maskDataUrl) {
          fillMaskCanvasWhite(maskCanvas);
          maskTexture.needsUpdate = true;
        } else {
          const nextToken =
            (maskLoadTokenByLayerRef.current.get(layer.id) ?? 0) + 1;
          maskLoadTokenByLayerRef.current.set(layer.id, nextToken);
          const image = new Image();
          image.onload = () => {
            if (maskLoadTokenByLayerRef.current.get(layer.id) !== nextToken)
              return;
            const ctx = maskCanvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            ctx.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height);
            maskTexture.needsUpdate = true;
          };
          image.onerror = () => {
            if (maskLoadTokenByLayerRef.current.get(layer.id) !== nextToken)
              return;
            fillMaskCanvasWhite(maskCanvas);
            maskTexture.needsUpdate = true;
          };
          image.src = layer.maskDataUrl;
        }
      }

      return maskTexture;
    },
    [ensureMaskResources, fillMaskCanvasWhite],
  );

  const pruneMaskResources = React.useCallback((layers: Layer[]) => {
    const ids = new Set(layers.map((layer) => layer.id));
    for (const [layerId, texture] of maskTextureByLayerRef.current) {
      if (ids.has(layerId)) continue;
      texture.dispose();
      maskTextureByLayerRef.current.delete(layerId);
      maskCanvasByLayerRef.current.delete(layerId);
      maskDataByLayerRef.current.delete(layerId);
      maskLoadTokenByLayerRef.current.delete(layerId);
    }
  }, []);

  const drawMaskStroke = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, layerId: string) => {
      const overlay = maskOverlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const { width: maskWidth, height: maskHeight } = getMaskRenderSize();
      const { maskCanvas, maskTexture } = ensureMaskResources(
        layerId,
        maskWidth,
        maskHeight,
      );
      const ctx = maskCanvas.getContext("2d");
      if (!ctx) return;

      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;
      const x = Math.max(0, Math.min(1, nx)) * maskCanvas.width;
      const y = Math.max(0, Math.min(1, ny)) * maskCanvas.height;

      const scaleX = maskCanvas.width / rect.width;
      const radius = Math.max(1, maskPaint.brushSize * scaleX * 0.5);
      const innerRadius = Math.max(0, radius * (1 - maskPaint.softness));
      const targetValue = maskPaint.erase ? 0 : 255;
      const color = `rgba(${targetValue}, ${targetValue}, ${targetValue}, 1)`;

      const from = lastMaskPointerRef.current ?? { x, y };
      const dx = x - from.x;
      const dy = y - from.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const step = Math.max(radius * 0.35, 1);
      const steps = Math.max(1, Math.ceil(distance / step));

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = from.x + dx * t;
        const py = from.y + dy * t;
        const gradient = ctx.createRadialGradient(
          px,
          py,
          innerRadius,
          px,
          py,
          radius,
        );
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgba(127, 127, 127, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      lastMaskPointerRef.current = { x, y };
      maskTexture.needsUpdate = true;
    },
    [
      ensureMaskResources,
      getMaskRenderSize,
      maskPaint.brushSize,
      maskPaint.erase,
      maskPaint.softness,
    ],
  );

  const resizeSurface = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const rect = outer.getBoundingClientRect();
    const next = fitRect(rect.width, rect.height, resolvedAspectRef.current);
    setRenderRect((prev) => (isSameRect(prev, next) ? prev : next));

    const renderer = rendererRef.current;
    const pipeline = pipelineRef.current;
    if (renderer && pipeline) {
      const shouldSupersampleForZoom = sourceMediaKindRef.current === "image";
      const zoomBoost = shouldSupersampleForZoom
        ? Math.min(Math.max(zoomRef.current, 1), ZOOM_SUPERSAMPLE_MAX)
        : 1;
      const effectiveScale = renderScaleRef.current * zoomBoost;
      const renderWidth = Math.max(Math.round(next.width * effectiveScale), 1);
      const renderHeight = Math.max(
        Math.round(next.height * effectiveScale),
        1,
      );
      renderer.setSize(renderWidth, renderHeight, false);
      pipeline.resize(renderWidth, renderHeight);
      updateCanvasExportHints(zoomBoost);

      const overlay = maskOverlayRef.current;
      if (overlay) {
        if (overlay.width !== renderWidth) overlay.width = renderWidth;
        if (overlay.height !== renderHeight) overlay.height = renderHeight;
      }
    }
  }, [updateCanvasExportHints]);

  const commitPaintedMask = React.useCallback(
    (layerId: string) => {
      const maskCanvas = maskCanvasByLayerRef.current.get(layerId);
      if (!maskCanvas) return;
      const dataUrl = maskCanvas.toDataURL("image/png");
      maskDataByLayerRef.current.set(layerId, dataUrl);
      setLayerMaskData(layerId, dataUrl);
    },
    [setLayerMaskData],
  );

  const handleMaskPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const layerId = maskPaintLayerIdRef.current;
      if (!layerId || event.button !== 0) return;
      const overlay = maskOverlayRef.current;
      if (!overlay) return;

      if (!didPushMaskHistoryRef.current) {
        const {
          layers,
          groups,
          selectedLayerId: selection,
        } = useLayerStore.getState();
        pushHistoryState({
          layers,
          groups,
          selectedLayerId: selection,
          label: MASK_PAINT_HISTORY_LABEL,
        });
        didPushMaskHistoryRef.current = true;
      }

      const { width, height } = getMaskRenderSize();
      const { maskCanvas, maskTexture } = ensureMaskResources(
        layerId,
        width,
        height,
      );
      const hasPersistedMask = Boolean(
        useLayerStore.getState().layers.find((layer) => layer.id === layerId)
          ?.maskDataUrl,
      );
      if (!hasPersistedMask) {
        // First paint on a layer with no mask: start hidden so painting reveals.
        fillMaskCanvasBlack(maskCanvas);
        maskTexture.needsUpdate = true;
      }

      isMaskPaintingRef.current = true;
      lastMaskPointerRef.current = null;
      overlay.setPointerCapture(event.pointerId);
      drawMaskStroke(event, layerId);
    },
    [
      drawMaskStroke,
      ensureMaskResources,
      fillMaskCanvasBlack,
      getMaskRenderSize,
      pushHistoryState,
    ],
  );

  const handleMaskPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const layerId = maskPaintLayerIdRef.current;
      if (!layerId || !isMaskPaintingRef.current) return;
      drawMaskStroke(event, layerId);
    },
    [drawMaskStroke],
  );

  const finishMaskStroke = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const layerId = maskPaintLayerIdRef.current;
      if (!layerId || !isMaskPaintingRef.current) return;
      isMaskPaintingRef.current = false;
      lastMaskPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      commitPaintedMask(layerId);
      didPushMaskHistoryRef.current = false;
    },
    [commitPaintedMask],
  );

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const { upload, isLoading: uploadLoading } = useMediaUpload();
  const [isDragOver, setIsDragOver] = React.useState(false);
  const dragCountRef = React.useRef(0);

  const handleDragEnter = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!e.dataTransfer.types.includes("Files")) return;
      dragCountRef.current++;
      setIsDragOver(true);
    },
    [],
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [],
  );

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
    hasMediaLayersRef.current = hasMediaLayers;
  }, [hasMediaLayers]);

  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  React.useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
    if (selectedLayerId) thumbnailNeedsRefreshRef.current = true;
  }, [selectedLayerId]);

  React.useEffect(() => {
    if (
      selectedLayer &&
      selectedLayer.filterMode === "mask" &&
      maskPaint.enabled
    ) {
      maskPaintLayerIdRef.current = selectedLayer.id;
      return;
    }
    maskPaintLayerIdRef.current = null;
    isMaskPaintingRef.current = false;
    didPushMaskHistoryRef.current = false;
  }, [maskPaint.enabled, selectedLayer]);

  React.useEffect(() => {
    renderScaleRef.current = renderScale;
    resizeSurface();
  }, [renderScale, resizeSurface]);

  React.useEffect(() => {
    zoomRef.current = zoom;
    resizeSurface();
  }, [zoom, resizeSurface]);

  React.useEffect(() => {
    sourceMediaKindRef.current = sourceMediaKind;
    resizeSurface();
  }, [sourceMediaKind, resizeSurface]);

  React.useEffect(() => {
    if (status !== "ready") return;

    const timer = window.setInterval(() => {
      if (!thumbnailNeedsRefreshRef.current) return;
      if (document.visibilityState !== "visible") return;

      const layerId = selectedLayerIdRef.current;
      const canvas = canvasRef.current;
      if (!layerId || !canvas) return;
      if (canvas.width <= 0 || canvas.height <= 0) return;

      let thumbCanvas = thumbnailCanvasRef.current;
      if (!thumbCanvas) {
        thumbCanvas = document.createElement("canvas");
        thumbnailCanvasRef.current = thumbCanvas;
      }
      thumbCanvas.width = THUMBNAIL_WIDTH;
      thumbCanvas.height = THUMBNAIL_HEIGHT;

      const ctx = thumbCanvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

      const srcAspect = canvas.width / canvas.height;
      const dstAspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
      let sx = 0;
      let sy = 0;
      let sw = canvas.width;
      let sh = canvas.height;

      if (srcAspect > dstAspect) {
        sw = Math.floor(canvas.height * dstAspect);
        sx = Math.floor((canvas.width - sw) * 0.5);
      } else if (srcAspect < dstAspect) {
        sh = Math.floor(canvas.width / dstAspect);
        sy = Math.floor((canvas.height - sh) * 0.5);
      }

      ctx.drawImage(
        canvas,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        THUMBNAIL_WIDTH,
        THUMBNAIL_HEIGHT,
      );

      const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.7);
      const previous = lastThumbnailRef.current.get(layerId);
      if (previous === thumbnail) {
        thumbnailNeedsRefreshRef.current = false;
        return;
      }

      useLayerStore.getState().setLayerThumbnail(layerId, thumbnail);
      lastThumbnailRef.current.set(layerId, thumbnail);
      thumbnailNeedsRefreshRef.current = false;
    }, THUMBNAIL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [status]);

  React.useEffect(() => {
    resolvedAspectRef.current = resolvedAspect;
    resizeSurface();
  }, [resolvedAspect, resizeSurface]);

  React.useEffect(() => {
    setResolvedFrameAspect(resolvedAspect);
  }, [resolvedAspect, setResolvedFrameAspect]);

  React.useEffect(() => {
    if (status !== "ready") return;
    window.__magnetikoExportImage = async (options = {}) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) throw new Error("Renderer pipeline is not ready.");
      const nowSec = performance.now() / 1000;
      return pipeline.exportImageBlob(nowSec, 1 / 60, options);
    };
    window.__magnetikoExportPng = async () => {
      const pipeline = pipelineRef.current;
      if (!pipeline) throw new Error("Renderer pipeline is not ready.");
      const nowSec = performance.now() / 1000;
      return pipeline.exportPngBlob(nowSec, 1 / 60);
    };
    window.__magnetikoExportVideo = async (options) => {
      const pipeline = pipelineRef.current;
      const canvas = canvasRef.current;
      if (!pipeline || !canvas)
        throw new Error("Renderer pipeline is not ready.");
      if (typeof MediaRecorder === "undefined") {
        throw new Error("Video recording is not supported in this browser.");
      }
      if (typeof canvas.captureStream !== "function") {
        throw new Error("Canvas capture is not supported in this browser.");
      }

      const durationSec = Math.max(1, Math.min(20, options.durationSec));
      const fps = Math.max(1, Math.round(options.fps));
      const frameCount = Math.max(1, Math.round(durationSec * fps));
      const frameIntervalMs = 1000 / fps;
      const deltaSec = 1 / fps;
      const bitrate = Math.max(1_000_000, Math.round(options.bitrate));

      let stream = canvas.captureStream(0);
      let track = stream.getVideoTracks()[0] as
        | CanvasCaptureMediaStreamTrack
        | undefined;
      const hasManualFrameRequest = Boolean(
        track && typeof track.requestFrame === "function",
      );

      if (!hasManualFrameRequest) {
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        stream = canvas.captureStream(fps);
        track = stream.getVideoTracks()[0] as
          | CanvasCaptureMediaStreamTrack
          | undefined;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: options.mimeType,
        videoBitsPerSecond: bitrate,
      });
      const chunks: BlobPart[] = [];
      const blobPromise = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => {
          reject(new Error("Video export failed during recording."));
        };
        recorder.onstop = () => {
          if (chunks.length === 0) {
            reject(new Error("No video frames were captured."));
            return;
          }
          resolve(new Blob(chunks, { type: options.mimeType }));
        };
      });

      pipeline.beginExportSession();

      try {
        const startTimeSec = performance.now() / 1000;
        let nextFrameAt = performance.now();

        recorder.start(1000);
        options.onProgress?.(0, "recording");

        for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
          const timeSec = startTimeSec + frameIndex * deltaSec;
          pipeline.renderExportFrame(timeSec, deltaSec);

          if (track && typeof track.requestFrame === "function") {
            track.requestFrame();
          }

          options.onProgress?.((frameIndex + 1) / frameCount, "recording");
          nextFrameAt += frameIntervalMs;

          if (frameIndex < frameCount - 1) {
            const waitForMs = nextFrameAt - performance.now();
            if (waitForMs > 1) {
              await waitMs(waitForMs);
            } else {
              await waitNextFrame();
            }
          }
        }

        options.onProgress?.(0.99, "encoding");
        if (recorder.state !== "inactive") recorder.stop();

        const blob = await blobPromise;
        return { blob, mimeType: options.mimeType };
      } finally {
        if (recorder.state !== "inactive") recorder.stop();
        stream.getTracks().forEach((streamTrack) => streamTrack.stop());
        pipeline.endExportSession();
      }
    };
    return () => {
      if (window.__magnetikoExportImage) delete window.__magnetikoExportImage;
      if (window.__magnetikoExportPng) delete window.__magnetikoExportPng;
      if (window.__magnetikoExportVideo) delete window.__magnetikoExportVideo;
    };
  }, [status]);

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
      if (sourceMedia.kind === "model") {
        setSourceAspect(1);
        setCanvasSize(1, 1);
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
      setStatusMessage("");
      return;
    }

    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;
    let pipeline: PipelineManager | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        renderer = new THREE.WebGPURenderer({
          canvas: canvas!,
          antialias: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const rect = outer.getBoundingClientRect();
        const initialRect = fitRect(
          rect.width,
          rect.height,
          resolvedAspectRef.current,
        );
        setRenderRect((prev) =>
          isSameRect(prev, initialRect) ? prev : initialRect,
        );
        const shouldSupersampleForZoom = sourceMediaKindRef.current === "image";
        const zoomBoost = shouldSupersampleForZoom
          ? Math.min(Math.max(zoomRef.current, 1), ZOOM_SUPERSAMPLE_MAX)
          : 1;
        const effectiveScale = renderScaleRef.current * zoomBoost;
        const initialRenderWidth = Math.max(
          Math.round(initialRect.width * effectiveScale),
          1,
        );
        const initialRenderHeight = Math.max(
          Math.round(initialRect.height * effectiveScale),
          1,
        );
        renderer.setSize(initialRenderWidth, initialRenderHeight, false);
        updateCanvasExportHints(zoomBoost);

        await renderer.init();
        if (disposed) {
          renderer.dispose();
          return;
        }

        rendererRef.current = renderer;
        pipeline = new PipelineManager(
          renderer,
          initialRenderWidth,
          initialRenderHeight,
          {
            onShaderError: (layerId, error) => {
              const key = `${layerId}:${error.message}`;
              const layerState = useLayerStore.getState();
              layerState.setLayerRuntimeError(layerId, error.message);
              layerState.setLayerVisibility(layerId, false);

              if (!shaderErrorNotifiedRef.current.has(key)) {
                shaderErrorNotifiedRef.current.add(key);
                toastRef.current({
                  variant: "error",
                  title: "Shader layer disabled",
                  description:
                    "A shader pass failed to compile/render. The layer was disabled to keep the editor running.",
                });
              }
            },
            onMediaStatus: (layerId, mediaStatus, error) => {
              const layerState = useLayerStore.getState();
              layerState.setLayerMediaStatus(layerId, mediaStatus, error);

              if (mediaStatus === "error") {
                const key = `${layerId}:${error ?? "media-error"}`;
                if (!mediaErrorNotifiedRef.current.has(key)) {
                  mediaErrorNotifiedRef.current.add(key);
                  toastRef.current({
                    variant: "error",
                    title: "Media load failed",
                    description:
                      error ??
                      "Could not load media for this layer. Use retry in layer options.",
                  });
                }
              } else if (mediaStatus === "ready") {
                const keys = Array.from(mediaErrorNotifiedRef.current);
                for (const key of keys) {
                  if (key.startsWith(`${layerId}:`))
                    mediaErrorNotifiedRef.current.delete(key);
                }
              }
            },
            onOutOfMemory: () => {
              const now = performance.now();
              if (now - lastOomWarnRef.current < OOM_WARN_COOLDOWN_MS) return;
              lastOomWarnRef.current = now;
              toastRef.current({
                variant: "warning",
                title: "GPU memory pressure",
                description:
                  "Out of GPU memory. Remove layers or lower render quality.",
                duration: 7000,
              });
            },
          },
        );
        pipelineRef.current = pipeline;
        resizeSurface();

        // Animation loop
        let renderedFrames = 0;
        let loopFrames = 0;
        let lastFpsSec = 0;
        let prevTimeSec = 0;
        let lowFpsStreakSec = 0;
        let warnedForCurrentDrop = false;
        let lastWarnMs = -Infinity;
        renderer.setAnimationLoop((timeMs: number) => {
          const timeSec = timeMs / 1000;
          const delta = prevTimeSec > 0 ? timeSec - prevTimeSec : 0;
          prevTimeSec = timeSec;
          loopFrames++;

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

          let didRender = false;
          try {
            didRender = pipeline!.render(timeSec, delta);
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : "Unexpected renderer failure.";
            setStatus("error");
            setStatusMessage(message);
            toastRef.current({
              variant: "error",
              title: "Renderer crashed",
              description: "Rendering stopped due to a GPU/runtime error.",
            });
            console.error("[Canvas] render loop failed:", err);
            renderer?.setAnimationLoop(null);
            return;
          }
          if (didRender) {
            renderedFrames++;
            thumbnailNeedsRefreshRef.current = true;
          }
          if (timeSec - lastFpsSec >= 1) {
            const elapsed = Math.max(timeSec - lastFpsSec, 1 / 120);
            const renderFps = Math.round(renderedFrames / elapsed);
            const loopFps = loopFrames / elapsed;

            setFps(renderFps);

            const canWarn =
              document.visibilityState === "visible" &&
              hasMediaLayersRef.current;
            if (canWarn && loopFps < LOW_FPS_THRESHOLD) {
              lowFpsStreakSec += elapsed;
              const nowMs = performance.now();
              if (
                lowFpsStreakSec >= LOW_FPS_STREAK_SECONDS &&
                !warnedForCurrentDrop &&
                nowMs - lastWarnMs >= LOW_FPS_WARN_COOLDOWN_MS
              ) {
                toastRef.current({
                  variant: "warning",
                  title: "Low FPS detected",
                  description:
                    "Rendering is below 30 FPS. Try lowering quality or reducing active layers.",
                  duration: 6000,
                });
                warnedForCurrentDrop = true;
                lastWarnMs = nowMs;
              }
            } else {
              lowFpsStreakSec = 0;
              if (loopFps >= LOW_FPS_THRESHOLD + LOW_FPS_RECOVERY_HYSTERESIS) {
                warnedForCurrentDrop = false;
              }
            }

            renderedFrames = 0;
            loopFrames = 0;
            lastFpsSec = timeSec;
          }
        });

        // Resize observer — keeps renderer in sync with container
        ro = new ResizeObserver(() => {
          resizeSurface();
        });
        ro.observe(outer!);

        setStatus("ready");
        setStatusMessage("");
      } catch (err) {
        if (!disposed) {
          setStatus("error");
          setStatusMessage(
            err instanceof Error
              ? err.message
              : "Unknown initialisation error.",
          );
        }
        console.error("[Canvas]", err);
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      renderer?.setAnimationLoop(null);
      pipeline?.dispose();
      renderer?.dispose();
      for (const texture of maskTextureByLayerRef.current.values()) {
        texture.dispose();
      }
      maskTextureByLayerRef.current.clear();
      maskCanvasByLayerRef.current.clear();
      maskDataByLayerRef.current.clear();
      maskLoadTokenByLayerRef.current.clear();
      rendererRef.current = null;
      pipelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeSurface]);

  // ── Layer sync via direct Zustand subscription ────────────────────────────
  React.useEffect(() => {
    if (status !== "ready") return;

    function sync(layers: Layer[], groups: LayerGroup[]) {
      const p = pipelineRef.current;
      if (!p) return;
      if (
        !GROUPS_ENABLED &&
        (groups.length > 0 || layers.some((layer) => Boolean(layer.groupId)))
      ) {
        const { setLayers, selectedLayerId: currentSelection } =
          useLayerStore.getState();
        setLayers(
          layers.map((layer) => ({ ...layer, groupId: undefined })),
          currentSelection,
          [],
        );
        return;
      }
      const maskSize = getMaskRenderSize();
      pruneMaskResources(layers);

      // All layers — both media and shader — become passes in the pipeline,
      // ordered bottom → top so the render chain composites correctly.
      const passes: PipelineLayer[] = [...layers].reverse().map((l) => ({
        id: l.id,
        kind: l.kind,
        visible: l.visible,
        opacity: Math.max(0, Math.min(1, l.opacity)),
        blendMode: l.blendMode,
        filterMode: l.filterMode,
        params: l.params,
        shaderType: l.shaderType,
        mediaUrl: l.mediaUrl,
        mediaName: l.mediaName,
        mediaVersion: l.mediaVersion,
        maskTexture: maybeApplyMaskDataUrl(l, maskSize.width, maskSize.height),
      }));

      p.syncLayers(passes);
    }

    const initialState = useLayerStore.getState();
    sync(initialState.layers, initialState.groups);
    const unsub = useLayerStore.subscribe((state) =>
      sync(state.layers, state.groups),
    );
    return unsub;
  }, [getMaskRenderSize, maybeApplyMaskDataUrl, pruneMaskResources, status]);

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
        <div
          ref={innerRef}
          className="absolute inset-0"
          style={{ transformOrigin: "center center" }}
        >
          <canvas
            ref={canvasRef}
            id="editor-canvas"
            className="h-full w-full"
            style={{
              display: status === "ready" ? "block" : "none",
              imageRendering: hasActiveAscii && zoom > 1 ? "pixelated" : "auto",
            }}
          />
          <canvas
            ref={maskOverlayRef}
            className="absolute inset-0 h-full w-full"
            style={{
              pointerEvents: isMaskPaintActive ? "auto" : "none",
              cursor: isMaskPaintActive
                ? maskPaint.erase
                  ? "cell"
                  : "crosshair"
                : "default",
              opacity: isMaskPaintActive ? 1 : 0,
            }}
            onPointerDown={handleMaskPointerDown}
            onPointerMove={handleMaskPointerMove}
            onPointerUp={finishMaskStroke}
            onPointerCancel={finishMaskStroke}
            onPointerLeave={finishMaskStroke}
          />
        </div>
      </div>

      {status !== "ready" && (
        <CanvasFallback status={status} message={statusMessage} />
      )}

      {/* Empty state — shown when canvas is ready and stack is empty */}
      {status === "ready" && layerCount === 0 && !isDragOver && <_EmptyState />}

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
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm"
    >
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
            Get started by adding a layer
          </p>
          <p className="text-xs text-[var(--color-fg-disabled)]">
            Drop media here, use the Upload button, or open Presets.
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
        <span className="text-sm text-[var(--color-fg-secondary)]">
          Loading…
        </span>
      </div>
    </div>
  );
}
