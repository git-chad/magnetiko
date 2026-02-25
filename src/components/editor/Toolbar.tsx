"use client";

import * as React from "react";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowLineLeft,
  ArrowLineRight,
  CornersOut,
  Export,
  Gear,
  Minus,
  Plus,
  Sparkle,
  Upload,
} from "@phosphor-icons/react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Separator,
  Switch,
  ThemeToggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { ExportImageFormat, ExportImageOptions } from "@/lib/renderer/PipelineManager";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore, registerHistoryShortcuts } from "@/store/historyStore";
import { useLayerStore } from "@/store/layerStore";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import type { Layer, LayerGroup, ShaderType, BlendMode } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    __magnetikoExportImage?: (options?: ExportImageOptions) => Promise<Blob>;
    __magnetikoExportPng?: () => Promise<Blob>;
    __magnetikoExportVideo?: (options: {
      durationSec: number;
      fps: number;
      mimeType: string;
      bitrate: number;
      onProgress?: (progress: number, phase: "recording" | "encoding") => void;
    }) => Promise<{ blob: Blob; mimeType: string }>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const ZOOM_STEP = 1.25;
const RENDER_SCALE_OPTIONS: Array<1 | 0.75 | 0.5> = [1, 0.75, 0.5];
const EXPORT_SCALE_OPTIONS = [
  { value: "viewport-1x", label: "Viewport 1x" },
  { value: "viewport-2x", label: "Viewport 2x" },
  { value: "viewport-4x", label: "Viewport 4x" },
  { value: "custom", label: "Custom" },
] as const;
const VIDEO_FPS_OPTIONS = [24, 30, 60] as const;
const VIDEO_FORMAT_OPTIONS = [
  { value: "webm", label: "WebM" },
  { value: "mp4", label: "MP4" },
  { value: "gif", label: "GIF" },
] as const;
const PRESET_VERSION = 1;
const MAX_PRESET_LAYERS = 20;

type ExportScaleMode = (typeof EXPORT_SCALE_OPTIONS)[number]["value"];
type ExportTarget = "image" | "video" | "preset";
type VideoExportFormat = (typeof VIDEO_FORMAT_OPTIONS)[number]["value"];
type VideoExportPhase = "idle" | "recording" | "encoding";
type PresetPayload = {
  version: number;
  exportedAt: string;
  selectedLayerId: string | null;
  layers: Layer[];
  groups: LayerGroup[];
};

const VALID_SHADER_TYPES = new Set<ShaderType>([
  "pixelation",
  "halftone",
  "ascii",
  "dithering",
  "bloom",
  "fluted-glass",
  "progressive-blur",
  "warp-distortion",
  "noise-generator",
  "mesh-gradient",
  "guilloche",
  "sdf-shapes",
  "3d-shapes",
  "grain",
  "interactivity",
  "masonry",
]);

const VALID_BLEND_MODES = new Set<BlendMode>([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

function _clampPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(16_384, Math.round(value)));
}

function _clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function _pickMediaRecorderMimeType(format: "webm" | "mp4"): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates =
    format === "webm"
      ? [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
        ]
      : [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/mp4;codecs=avc1.42E01E",
          "video/mp4",
        ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function _wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

async function _encodeGifFromCanvas(
  canvas: HTMLCanvasElement,
  fps: number,
  frameCount: number,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const frameDelay = Math.max(1, Math.round(1000 / fps));
  const frameIntervalMs = 1000 / fps;
  const gif = GIFEncoder();
  const readCanvas = document.createElement("canvas");
  readCanvas.width = width;
  readCanvas.height = height;
  const ctx = readCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create canvas context for GIF export.");

  let nextFrameAt = performance.now();
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    ctx.drawImage(canvas, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const palette = quantize(rgba, 256, { format: "rgb565" });
    const indexed = applyPalette(rgba, palette, "rgb565");
    gif.writeFrame(indexed, width, height, {
      palette,
      delay: frameDelay,
    });
    onProgress((frameIndex + 1) / frameCount);
    nextFrameAt += frameIntervalMs;
    if (frameIndex < frameCount - 1) {
      await _wait(nextFrameAt - performance.now());
    }
  }
  gif.finish();
  return new Blob([new Uint8Array(gif.bytesView())], { type: "image/gif" });
}

function _isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function _newLayerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `layer-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function _safePresetMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const normalized = url.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.startsWith("blob:") || normalized.startsWith("data:")) {
    return undefined;
  }
  return url;
}

function _sanitizePresetLayer(raw: Layer): Layer {
  return {
    ...raw,
    groupId: typeof raw.groupId === "string" && raw.groupId.length > 0 ? raw.groupId : undefined,
    mediaUrl: _safePresetMediaUrl(raw.mediaUrl),
    mediaStatus: raw.kind === "shader" ? undefined : "idle",
    mediaError: undefined,
    mediaVersion: 0,
    runtimeError: undefined,
    thumbnail: undefined,
  };
}

function _sanitizePresetGroup(raw: LayerGroup): LayerGroup {
  return {
    id: raw.id,
    name: raw.name,
    collapsed: raw.collapsed ?? false,
    visible: raw.visible ?? true,
    opacity: _clampNumber(
      typeof raw.opacity === "number" ? raw.opacity : Number(raw.opacity),
      0,
      1,
      1,
    ),
    blendMode: VALID_BLEND_MODES.has(raw.blendMode as BlendMode)
      ? (raw.blendMode as BlendMode)
      : "normal",
  };
}

function _buildPresetPayload(
  layers: Layer[],
  selectedLayerId: string | null,
  groups: LayerGroup[],
): PresetPayload {
  const sanitized = layers.slice(0, MAX_PRESET_LAYERS).map(_sanitizePresetLayer);
  const referencedGroupIds = new Set(
    sanitized.map((layer) => layer.groupId).filter((id): id is string => typeof id === "string"),
  );
  const sanitizedGroups = groups
    .filter((group) => referencedGroupIds.has(group.id))
    .map(_sanitizePresetGroup);
  const resolvedSelection =
    selectedLayerId && sanitized.some((layer) => layer.id === selectedLayerId)
      ? selectedLayerId
      : sanitized[0]?.id ?? null;
  return {
    version: PRESET_VERSION,
    exportedAt: new Date().toISOString(),
    selectedLayerId: resolvedSelection,
    layers: sanitized,
    groups: sanitizedGroups,
  };
}

function _parsePresetPayload(input: unknown): {
  layers: Layer[];
  selectedLayerId: string | null;
  groups: LayerGroup[];
} {
  const rawLayers = Array.isArray(input)
    ? input
    : _isObjectRecord(input) && Array.isArray(input.layers)
      ? input.layers
      : null;
  const rawSelectedLayerId =
    _isObjectRecord(input) && typeof input.selectedLayerId === "string"
      ? input.selectedLayerId
      : null;
  const rawGroups =
    _isObjectRecord(input) && Array.isArray(input.groups)
      ? input.groups
      : [];

  if (!rawLayers) {
    throw new Error("Invalid preset file format.");
  }

  const parsed: Layer[] = [];

  for (const item of rawLayers) {
    if (!_isObjectRecord(item)) continue;

    const rawKind = item.kind;
    const kind =
      rawKind === "shader" ||
      rawKind === "image" ||
      rawKind === "video" ||
      rawKind === "webcam" ||
      rawKind === "model"
        ? rawKind
        : null;
    if (!kind) continue;

    const rawShaderType =
      typeof item.shaderType === "string" && VALID_SHADER_TYPES.has(item.shaderType as ShaderType)
        ? (item.shaderType as ShaderType)
        : undefined;
    const rawBlendMode =
      typeof item.blendMode === "string" && VALID_BLEND_MODES.has(item.blendMode as BlendMode)
        ? (item.blendMode as BlendMode)
        : "normal";
    const rawFilterMode = item.filterMode === "mask" ? "mask" : "filter";
    const rawMediaType =
      item.mediaType === "image" ||
      item.mediaType === "video" ||
      item.mediaType === "webcam" ||
      item.mediaType === "model"
        ? item.mediaType
        : undefined;
    const rawParams = Array.isArray(item.params) ? (item.params as Layer["params"]) : [];

    const layer: Layer = {
      id: typeof item.id === "string" && item.id.length > 0 ? item.id : _newLayerId(),
      name: typeof item.name === "string" && item.name.trim().length > 0 ? item.name : "Layer",
      kind,
      groupId: typeof item.groupId === "string" && item.groupId.length > 0 ? item.groupId : undefined,
      shaderType: kind === "shader" ? rawShaderType : undefined,
      filterMode: rawFilterMode,
      visible: item.visible !== false,
      solo: item.solo === true,
      opacity: _clampNumber(typeof item.opacity === "number" ? item.opacity : Number(item.opacity), 0, 1, 1),
      blendMode: rawBlendMode,
      params: rawParams,
      locked: item.locked === true,
      expanded: item.expanded !== false,
      mediaUrl: _safePresetMediaUrl(typeof item.mediaUrl === "string" ? item.mediaUrl : undefined),
      mediaType: rawMediaType,
      mediaName: typeof item.mediaName === "string" ? item.mediaName : undefined,
      mediaStatus: kind === "shader" ? undefined : "idle",
      mediaError: undefined,
      mediaVersion: 0,
      runtimeError: undefined,
      thumbnail: undefined,
    };

    parsed.push(layer);
    if (parsed.length >= MAX_PRESET_LAYERS) break;
  }

  if (parsed.length === 0) {
    throw new Error("Preset contains no valid layers.");
  }

  const selectedLayerId =
    rawSelectedLayerId && parsed.some((layer) => layer.id === rawSelectedLayerId)
      ? rawSelectedLayerId
      : parsed[0]?.id ?? null;
  const parsedGroups: LayerGroup[] = [];
  const seenGroupIds = new Set<string>();
  for (const rawGroup of rawGroups) {
    if (!_isObjectRecord(rawGroup)) continue;
    if (typeof rawGroup.id !== "string" || rawGroup.id.length === 0 || seenGroupIds.has(rawGroup.id)) {
      continue;
    }
    seenGroupIds.add(rawGroup.id);
    parsedGroups.push(
      _sanitizePresetGroup({
        id: rawGroup.id,
        name:
          typeof rawGroup.name === "string" && rawGroup.name.trim().length > 0
            ? rawGroup.name
            : "Group",
        collapsed: rawGroup.collapsed === true,
        visible: rawGroup.visible !== false,
        opacity: _clampNumber(
          typeof rawGroup.opacity === "number"
            ? rawGroup.opacity
            : Number(rawGroup.opacity),
          0,
          1,
          1,
        ),
        blendMode:
          typeof rawGroup.blendMode === "string" &&
          VALID_BLEND_MODES.has(rawGroup.blendMode as BlendMode)
            ? (rawGroup.blendMode as BlendMode)
            : "normal",
      }),
    );
  }

  const referencedGroupIds = new Set(
    parsed.map((layer) => layer.groupId).filter((id): id is string => typeof id === "string"),
  );
  const groups = parsedGroups.filter((group) => referencedGroupIds.has(group.id));
  const parsedGroupIds = new Set(groups.map((group) => group.id));
  for (const layer of parsed) {
    if (layer.groupId && !parsedGroupIds.has(layer.groupId)) {
      layer.groupId = undefined;
    }
  }

  return { layers: parsed, selectedLayerId, groups };
}

function _readViewportExportSize(fallbackWidth: number, fallbackHeight: number): {
  width: number;
  height: number;
} {
  if (typeof document === "undefined") {
    return {
      width: _clampPositiveInt(fallbackWidth, 1920),
      height: _clampPositiveInt(fallbackHeight, 1080),
    };
  }
  const canvas = document.getElementById("editor-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return {
      width: _clampPositiveInt(fallbackWidth, 1920),
      height: _clampPositiveInt(fallbackHeight, 1080),
    };
  }
  return {
    width: _clampPositiveInt(canvas.width, fallbackWidth),
    height: _clampPositiveInt(canvas.height, fallbackHeight),
  };
}

function _isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ToolbarProps {
  onBrowsePresets?: () => void;
}

export function Toolbar({ onBrowsePresets }: ToolbarProps) {
  // Editor state
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const leftOpen      = useEditorStore((s) => s.sidebarOpen.left);
  const rightOpen     = useEditorStore((s) => s.sidebarOpen.right);
  const zoom          = useEditorStore((s) => s.zoom);
  const setZoom       = useEditorStore((s) => s.setZoom);
  const resetView     = useEditorStore((s) => s.resetView);
  const fps           = useEditorStore((s) => s.fps);
  const renderScale   = useEditorStore((s) => s.renderScale);
  const setRenderScale = useEditorStore((s) => s.setRenderScale);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const showGrid = useEditorStore((s) => s.showGrid);
  const layerCount = useLayerStore((s) => s.layers.length);

  // History state
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undo    = useHistoryStore((s) => s.undo);
  const redo    = useHistoryStore((s) => s.redo);
  const pushHistoryState = useHistoryStore((s) => s.pushState);

  // Layer actions
  const setLayers = useLayerStore((s) => s.setLayers);
  const { toast } = useToast();

  // ── File import ──────────────────────────────────────────────────────────
  const { upload, isLoading: uploadLoading } = useMediaUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const presetFileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file
    await upload(file);
  }

  // ── Undo / redo ──────────────────────────────────────────────────────────
  const handleUndo = React.useCallback(() => {
    const entry = undo();
    if (entry) setLayers(entry.layers, entry.selectedLayerId, entry.groups);
  }, [undo, setLayers]);

  const handleRedo = React.useCallback(() => {
    const entry = redo();
    if (entry) setLayers(entry.layers, entry.selectedLayerId, entry.groups);
  }, [redo, setLayers]);

  React.useEffect(
    () => registerHistoryShortcuts(handleUndo, handleRedo),
    [handleUndo, handleRedo],
  );

  // ── Zoom ─────────────────────────────────────────────────────────────────
  function handleZoomIn()  { setZoom(zoom * ZOOM_STEP); }
  function handleZoomOut() { setZoom(zoom / ZOOM_STEP); }

  // ── Export ───────────────────────────────────────────────────────────────
  const [exportDialogOpen, setExportDialogOpen] = React.useState(false);
  const [exportTarget, setExportTarget] = React.useState<ExportTarget>("image");
  const [exportFormat, setExportFormat] = React.useState<ExportImageFormat>("png");
  const [exportScaleMode, setExportScaleMode] = React.useState<ExportScaleMode>("viewport-1x");
  const [customWidthInput, setCustomWidthInput] = React.useState(String(canvasSize.width));
  const [customHeightInput, setCustomHeightInput] = React.useState(String(canvasSize.height));
  const [viewportExportBase, setViewportExportBase] = React.useState(() => ({
    width: _clampPositiveInt(canvasSize.width, 1920),
    height: _clampPositiveInt(canvasSize.height, 1080),
  }));
  const [jpegQuality, setJpegQuality] = React.useState(0.92);
  const [includeUiOverlays, setIncludeUiOverlays] = React.useState(false);
  const [includeGridOverlay, setIncludeGridOverlay] = React.useState(showGrid);
  const [videoDurationSec, setVideoDurationSec] = React.useState(5);
  const [videoFps, setVideoFps] = React.useState<(typeof VIDEO_FPS_OPTIONS)[number]>(30);
  const [videoFormat, setVideoFormat] = React.useState<VideoExportFormat>("webm");
  const [videoBitrateMbps, setVideoBitrateMbps] = React.useState(10);
  const [videoExportPhase, setVideoExportPhase] = React.useState<VideoExportPhase>("idle");
  const [videoExportProgress, setVideoExportProgress] = React.useState(0);
  const [isImportingPreset, setIsImportingPreset] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const supportedVideoFormats = React.useMemo(
    () => ({
      webm: _pickMediaRecorderMimeType("webm") !== null,
      mp4: _pickMediaRecorderMimeType("mp4") !== null,
      gif: true,
    }),
    [],
  );

  React.useEffect(() => {
    if (!exportDialogOpen) return;
    const base = _readViewportExportSize(canvasSize.width, canvasSize.height);
    setViewportExportBase(base);
    setCustomWidthInput(String(base.width));
    setCustomHeightInput(String(base.height));
    setIncludeGridOverlay(showGrid);
  }, [canvasSize.height, canvasSize.width, exportDialogOpen, showGrid]);

  React.useEffect(() => {
    if (videoFormat === "webm" && !supportedVideoFormats.webm) {
      setVideoFormat(supportedVideoFormats.mp4 ? "mp4" : "gif");
      return;
    }
    if (videoFormat === "mp4" && !supportedVideoFormats.mp4) {
      setVideoFormat(supportedVideoFormats.webm ? "webm" : "gif");
    }
  }, [supportedVideoFormats.mp4, supportedVideoFormats.webm, videoFormat]);

  const resolvedExportSize = React.useMemo(() => {
    const baseWidth = _clampPositiveInt(viewportExportBase.width, 1920);
    const baseHeight = _clampPositiveInt(viewportExportBase.height, 1080);

    if (exportScaleMode === "viewport-2x") {
      return { width: baseWidth * 2, height: baseHeight * 2 };
    }
    if (exportScaleMode === "viewport-4x") {
      return { width: baseWidth * 4, height: baseHeight * 4 };
    }
    if (exportScaleMode === "custom") {
      return {
        width: _clampPositiveInt(Number.parseInt(customWidthInput, 10), baseWidth),
        height: _clampPositiveInt(Number.parseInt(customHeightInput, 10), baseHeight),
      };
    }
    return { width: baseWidth, height: baseHeight };
  }, [customHeightInput, customWidthInput, exportScaleMode, viewportExportBase.height, viewportExportBase.width]);

  const runExport = React.useCallback(async (closeDialogOnSuccess: boolean) => {
    if (isExporting) return;

    const exportImage = window.__magnetikoExportImage;
    if (!exportImage) {
      toast({
        variant: "error",
        title: "Export failed",
        description: "Renderer is not ready yet.",
      });
      return;
    }

    const viewportBase = _readViewportExportSize(canvasSize.width, canvasSize.height);
    let width = viewportBase.width;
    let height = viewportBase.height;

    if (exportScaleMode === "viewport-2x") {
      width = viewportBase.width * 2;
      height = viewportBase.height * 2;
    } else if (exportScaleMode === "viewport-4x") {
      width = viewportBase.width * 4;
      height = viewportBase.height * 4;
    } else if (exportScaleMode === "custom") {
      const parsedWidth = Number.parseInt(customWidthInput, 10);
      const parsedHeight = Number.parseInt(customHeightInput, 10);
      if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
        toast({
          variant: "error",
          title: "Invalid export size",
          description: "Width must be a positive number.",
        });
        return;
      }
      if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
        toast({
          variant: "error",
          title: "Invalid export size",
          description: "Height must be a positive number.",
        });
        return;
      }
      width = parsedWidth;
      height = parsedHeight;
    }

    const request: ExportImageOptions = {
      format: exportFormat,
      width: _clampPositiveInt(width, viewportBase.width),
      height: _clampPositiveInt(height, viewportBase.height),
      includeUiOverlays,
      includeGridOverlay: includeUiOverlays && includeGridOverlay,
    };
    if (exportFormat === "jpeg") {
      request.quality = jpegQuality;
    }

    setIsExporting(true);
    try {
      const blob = await exportImage(request);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      const ext = exportFormat === "jpeg" ? "jpg" : "png";
      link.download = `magnetiko-${stamp}.${ext}`;
      link.href = url;
      link.click();
      queueMicrotask(() => URL.revokeObjectURL(url));

      if (closeDialogOnSuccess) {
        setExportDialogOpen(false);
      }

      toast({
        variant: "success",
        title: `Exported ${exportFormat.toUpperCase()}`,
        description: `Saved ${request.width}x${request.height} image.`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export image.",
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    canvasSize.height,
    canvasSize.width,
    customHeightInput,
    customWidthInput,
    exportFormat,
    exportScaleMode,
    includeGridOverlay,
    includeUiOverlays,
    isExporting,
    jpegQuality,
    toast,
  ]);

  const runVideoExport = React.useCallback(async (closeDialogOnSuccess: boolean) => {
    if (isExporting) return;

    const canvas = document.getElementById("editor-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      toast({
        variant: "error",
        title: "Export failed",
        description: "Canvas is not ready yet.",
      });
      return;
    }

    const durationMs = Math.round(_clampNumber(videoDurationSec, 1, 20, 5) * 1000);
    const durationSec = durationMs / 1000;
    const fps = _clampPositiveInt(videoFps, 30);
    const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));
    const bitrate = Math.round(_clampNumber(videoBitrateMbps, 2, 24, 10) * 1_000_000);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    setIsExporting(true);
    setVideoExportPhase("recording");
    setVideoExportProgress(0);
    try {
      let blob: Blob;
      let extension: "webm" | "mp4" | "gif";

      if (videoFormat === "gif") {
        extension = "gif";
        blob = await _encodeGifFromCanvas(canvas, fps, frameCount, (progress) => {
          setVideoExportProgress(Math.min(progress, 0.98));
        });
      } else {
        const mimeType = _pickMediaRecorderMimeType(videoFormat);
        if (!mimeType) {
          throw new Error(
            videoFormat === "mp4"
              ? "MP4 recording is not supported in this browser."
              : "WebM recording is not supported in this browser.",
          );
        }

        extension = videoFormat;
        const exportVideo = window.__magnetikoExportVideo;
        if (exportVideo) {
          const result = await exportVideo({
            durationSec,
            fps,
            mimeType,
            bitrate,
            onProgress: (progress, phase) => {
              setVideoExportPhase(phase);
              setVideoExportProgress(Math.min(Math.max(progress, 0), 0.999));
            },
          });
          blob = result.blob;
        } else {
          if (typeof canvas.captureStream !== "function") {
            throw new Error("Canvas capture is not supported in this browser.");
          }
          if (typeof MediaRecorder === "undefined") {
            throw new Error("Video recording is not supported in this browser.");
          }

          const capturedStream = canvas.captureStream(fps);
          const recorder = new MediaRecorder(capturedStream, {
            mimeType,
            videoBitsPerSecond: bitrate,
          });

          const chunks: BlobPart[] = [];
          blob = await new Promise<Blob>((resolve, reject) => {
            let timeoutId: number | null = null;
            recorder.ondataavailable = (event: BlobEvent) => {
              if (event.data.size > 0) chunks.push(event.data);
            };
            recorder.onerror = () => {
              reject(new Error(`Failed to record ${videoFormat.toUpperCase()}.`));
            };
            recorder.onstop = () => {
              if (timeoutId !== null) window.clearTimeout(timeoutId);
              const tracks = capturedStream.getTracks();
              for (const track of tracks) track.stop();
              setVideoExportPhase("encoding");
              setVideoExportProgress(0.99);
              if (chunks.length === 0) {
                reject(new Error("No video frames were captured."));
                return;
              }
              resolve(new Blob(chunks, { type: mimeType }));
            };

            recorder.start(250);
            timeoutId = window.setTimeout(() => {
              if (recorder.state !== "inactive") recorder.stop();
            }, durationMs);
          });
        }
      }

      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.download = `magnetiko-${stamp}.${extension}`;
      link.href = url;
      link.click();
      queueMicrotask(() => URL.revokeObjectURL(url));
      setVideoExportProgress(1);

      if (closeDialogOnSuccess) {
        setExportDialogOpen(false);
      }

      toast({
        variant: "success",
        title: `Exported ${videoFormat.toUpperCase()}`,
        description: `Saved ${Math.round(durationMs / 1000)}s @ ${fps}fps.`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export video.",
      });
    } finally {
      setIsExporting(false);
      setVideoExportPhase("idle");
      setVideoExportProgress(0);
    }
  }, [isExporting, toast, videoBitrateMbps, videoDurationSec, videoFormat, videoFps]);

  const runPresetExport = React.useCallback((closeDialogOnSuccess: boolean) => {
    if (isExporting || isImportingPreset) return;

    setIsExporting(true);
    try {
      const { layers, selectedLayerId, groups } = useLayerStore.getState();
      if (layers.length === 0) {
        throw new Error("There are no layers to export.");
      }

      const payload = _buildPresetPayload(layers, selectedLayerId, groups);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.download = `magnetiko-preset-${stamp}.json`;
      link.href = url;
      link.click();
      queueMicrotask(() => URL.revokeObjectURL(url));

      if (closeDialogOnSuccess) {
        setExportDialogOpen(false);
      }

      toast({
        variant: "success",
        title: "Preset exported",
        description: `Saved ${payload.layers.length} layers to JSON.`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Preset export failed",
        description: err instanceof Error ? err.message : "Could not export preset.",
      });
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, isImportingPreset, toast]);

  const handlePresetFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || isExporting || isImportingPreset) return;

      setIsImportingPreset(true);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const imported = _parsePresetPayload(parsed);

        const currentState = useLayerStore.getState();
        pushHistoryState(
          {
            layers: currentState.layers,
            selectedLayerId: currentState.selectedLayerId,
            groups: currentState.groups,
            label: "Import preset",
          },
          false,
        );

        setLayers(imported.layers, imported.selectedLayerId, imported.groups);
        setExportDialogOpen(false);
        toast({
          variant: "success",
          title: "Preset imported",
          description: `Loaded ${imported.layers.length} layers.`,
        });
      } catch (err) {
        toast({
          variant: "error",
          title: "Preset import failed",
          description: err instanceof Error ? err.message : "Could not import preset.",
        });
      } finally {
        setIsImportingPreset(false);
      }
    },
    [isExporting, isImportingPreset, pushHistoryState, setLayers, toast],
  );

  React.useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "s") return;
      if (_isEditableTarget(event.target)) return;
      event.preventDefault();
      void runExport(false);
    }
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [runExport]);

  // ─────────────────────────────────────────────────────────────────────────

  const isCustomScale = exportScaleMode === "custom";
  const viewportSize = _readViewportExportSize(canvasSize.width, canvasSize.height);
  const isBusy = isExporting || isImportingPreset;

  return (
    <>
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-raised)]/82 px-xs backdrop-blur-xl">

      {/* ── Left: sidebar toggle · logo · import ──────────────────────── */}
      <div className="flex items-center gap-2xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Toggle layer panel"
              aria-expanded={leftOpen}
              onClick={() => toggleSidebar("left")}
            >
              <ArrowLineLeft size={15} className={leftOpen ? "opacity-100" : "opacity-40"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{leftOpen ? "Collapse" : "Expand"} layers</TooltipContent>
        </Tooltip>

        <span className="select-none text-sm font-medium tracking-tight text-[var(--color-fg-primary)]">
          magnetiko
        </span>

        <Separator orientation="vertical" className="mx-2xs h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Browse presets"
              onClick={onBrowsePresets}
            >
              <Sparkle size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Browse presets</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Import media"
              disabled={uploadLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload
                size={15}
                className={uploadLoading ? "animate-spin opacity-50" : ""}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import media</TooltipContent>
        </Tooltip>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,.glb,.gltf,.obj,model/*,application/octet-stream"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={presetFileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handlePresetFileChange}
        />
      </div>

      {/* ── Center: undo · redo · zoom ────────────────────────────────── */}
      <div className="flex items-center gap-2xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={handleUndo}
            >
              <ArrowCounterClockwise size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (⌘Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={handleRedo}
            >
              <ArrowClockwise size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-2xs h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={handleZoomOut}>
              <Minus size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={resetView}
              className="min-w-[3rem] rounded-xs px-xs py-3xs text-center font-mono text-xs text-[var(--color-fg-secondary)] transition-colors hover:bg-[var(--color-bg-subtle)]"
              aria-label="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
          </TooltipTrigger>
          <TooltipContent>Reset view (100%)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={handleZoomIn}>
              <Plus size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Fit to screen" onClick={resetView}>
              <CornersOut size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit to screen</TooltipContent>
        </Tooltip>
      </div>

      {/* ── Right: fps · export · settings · theme · sidebar ──────────── */}
      <div className="flex items-center gap-2xs">
        {process.env.NODE_ENV === "development" && fps > 0 && (
          <span className="font-mono text-xs text-[var(--color-fg-disabled)]">{fps} fps</span>
        )}

        <div
          className="hidden items-center gap-[2px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-[2px] lg:flex"
          role="group"
          aria-label="Render quality"
        >
          {RENDER_SCALE_OPTIONS.map((scale) => {
            const active = renderScale === scale;
            return (
              <button
                key={scale}
                type="button"
                onClick={() => setRenderScale(scale)}
                aria-pressed={active}
                className={[
                  "rounded-[8px] px-[6px] py-[2px] text-[10px] font-mono transition-colors",
                  active
                    ? "bg-[var(--color-accent)] text-[var(--color-fg-on-accent)]"
                    : "text-[var(--color-fg-secondary)] hover:bg-[var(--color-hover-bg)]",
                ].join(" ")}
              >
                {scale}x
              </button>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Open export settings"
              onClick={() => setExportDialogOpen(true)}
            >
              <Export size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export (⌘/Ctrl+S)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Settings" disabled>
              <Gear size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings (coming soon)</TooltipContent>
        </Tooltip>

        <ThemeToggle />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Toggle properties panel"
              aria-expanded={rightOpen}
              onClick={() => toggleSidebar("right")}
            >
              <ArrowLineRight size={15} className={rightOpen ? "opacity-100" : "opacity-40"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{rightOpen ? "Collapse" : "Expand"} properties</TooltipContent>
        </Tooltip>
      </div>
    </header>
    <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
      <DialogContent className="max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>
            {exportTarget === "image"
              ? "Export Image"
              : exportTarget === "video"
                ? "Export Video"
                : "Preset JSON"}
          </DialogTitle>
          <DialogDescription>
            {exportTarget === "image"
              ? "Export the current frame as PNG or JPEG with custom resolution."
              : exportTarget === "video"
                ? "Record the current canvas as WebM/MP4, or encode it as GIF."
                : "Export or import a layer-stack preset (media binaries are not embedded)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-xs">
          <div className="flex items-center gap-xs">
            <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">Type</span>
            <Select
              value={exportTarget}
              onValueChange={(value) => setExportTarget(value as ExportTarget)}
            >
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="preset">Preset (JSON)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {exportTarget === "image" ? (
            <>
              <div className="flex items-center gap-xs">
                <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">Format</span>
                <Select
                  value={exportFormat}
                  onValueChange={(value) => setExportFormat(value as ExportImageFormat)}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-xs">
                <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">
                  Resolution
                </span>
                <Select
                  value={exportScaleMode}
                  onValueChange={(value) => setExportScaleMode(value as ExportScaleMode)}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_SCALE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isCustomScale && (
                <div className="grid grid-cols-2 gap-xs pl-[6.5rem]">
                  <Input
                    type="number"
                    min={1}
                    value={customWidthInput}
                    onChange={(event) => setCustomWidthInput(event.target.value)}
                    placeholder="Width"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={customHeightInput}
                    onChange={(event) => setCustomHeightInput(event.target.value)}
                    placeholder="Height"
                  />
                </div>
              )}

              {exportFormat === "jpeg" && (
                <div className="flex items-center gap-xs">
                  <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">
                    Quality
                  </span>
                  <Slider
                    className="flex-1"
                    min={0.05}
                    max={1}
                    step={0.01}
                    value={[jpegQuality]}
                    onValueChange={([value]) => setJpegQuality(value)}
                  />
                  <span className="w-10 text-right font-mono text-[10px] text-[var(--color-fg-tertiary)]">
                    {Math.round(jpegQuality * 100)}%
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between rounded-sm border border-[var(--color-border)] px-xs py-2xs">
                <span className="text-xs text-[var(--color-fg-secondary)]">Include UI overlays</span>
                <Switch
                  checked={includeUiOverlays}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setIncludeUiOverlays(enabled);
                    if (!enabled) setIncludeGridOverlay(false);
                    if (enabled && showGrid) setIncludeGridOverlay(true);
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-sm border border-[var(--color-border)] px-xs py-2xs">
                <span className="text-xs text-[var(--color-fg-secondary)]">Include grid overlay</span>
                <Switch
                  checked={includeGridOverlay}
                  disabled={!includeUiOverlays}
                  onCheckedChange={(checked) => setIncludeGridOverlay(checked === true)}
                />
              </div>

              <div className="rounded-sm bg-[var(--color-bg-subtle)] px-xs py-2xs">
                <p className="text-[11px] text-[var(--color-fg-tertiary)]">
                  Output: {resolvedExportSize.width} × {resolvedExportSize.height}
                </p>
              </div>
            </>
          ) : exportTarget === "video" ? (
            <>
              <div className="flex items-center gap-xs">
                <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">
                  Format
                </span>
                <Select
                  value={videoFormat}
                  onValueChange={(value) => setVideoFormat(value as VideoExportFormat)}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_FORMAT_OPTIONS.map((option) => {
                      const isSupported =
                        option.value === "gif" ||
                        (option.value === "webm" ? supportedVideoFormats.webm : supportedVideoFormats.mp4);
                      return (
                        <SelectItem key={option.value} value={option.value} disabled={!isSupported}>
                          {isSupported ? option.label : `${option.label} (unsupported)`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-xs">
                <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">
                  Duration
                </span>
                <Slider
                  className="flex-1"
                  min={1}
                  max={20}
                  step={1}
                  value={[videoDurationSec]}
                  onValueChange={([value]) => setVideoDurationSec(_clampNumber(value, 1, 20, 5))}
                />
                <span className="w-10 text-right font-mono text-[10px] text-[var(--color-fg-tertiary)]">
                  {Math.round(videoDurationSec)}s
                </span>
              </div>

              <div className="flex items-center gap-xs">
                <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">FPS</span>
                <Select
                  value={String(videoFps)}
                  onValueChange={(value) =>
                    setVideoFps(_clampPositiveInt(Number.parseInt(value, 10), 30) as (typeof VIDEO_FPS_OPTIONS)[number])
                  }
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_FPS_OPTIONS.map((fpsValue) => (
                      <SelectItem key={fpsValue} value={String(fpsValue)}>
                        {fpsValue} fps
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {videoFormat !== "gif" && (
                <div className="flex items-center gap-xs">
                  <span className="w-24 text-xs font-medium text-[var(--color-fg-secondary)]">
                    Bitrate
                  </span>
                  <Slider
                    className="flex-1"
                    min={2}
                    max={24}
                    step={0.5}
                    value={[videoBitrateMbps]}
                    onValueChange={([value]) => setVideoBitrateMbps(_clampNumber(value, 2, 24, 10))}
                  />
                  <span className="w-14 text-right font-mono text-[10px] text-[var(--color-fg-tertiary)]">
                    {videoBitrateMbps.toFixed(1)}M
                  </span>
                </div>
              )}

              <div className="rounded-sm bg-[var(--color-bg-subtle)] px-xs py-2xs">
                <p className="text-[11px] text-[var(--color-fg-tertiary)]">
                  Output: {viewportSize.width} × {viewportSize.height} · {videoFormat.toUpperCase()}
                </p>
              </div>

              {isExporting && (
                <div className="space-y-3xs rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-xs py-2xs">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-[var(--color-fg-secondary)]">
                      {videoExportPhase === "recording" ? "Recording…" : "Encoding…"}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--color-fg-tertiary)]">
                      {Math.round(videoExportProgress * 100)}%
                    </p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-100"
                      style={{ width: `${Math.round(videoExportProgress * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-xs py-2xs">
                <p className="text-[11px] text-[var(--color-fg-tertiary)]">
                  Preset export stores layer order, params, blend/filter settings, and media references.
                  Uploaded blob/data media is stripped from the file by design.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-sm border border-[var(--color-border)] px-xs py-2xs">
                <span className="text-xs text-[var(--color-fg-secondary)]">Current layers</span>
                <span className="font-mono text-[10px] text-[var(--color-fg-tertiary)]">
                  {layerCount}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => presetFileInputRef.current?.click()}
                disabled={isBusy}
              >
                {isImportingPreset ? "Importing…" : "Import preset JSON"}
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExportDialogOpen(false)}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (exportTarget === "image") {
                void runExport(true);
                return;
              }
              if (exportTarget === "video") {
                void runVideoExport(true);
                return;
              }
              runPresetExport(true);
            }}
            disabled={isBusy}
          >
            {isBusy
              ? exportTarget === "image"
                ? "Exporting…"
                : exportTarget === "video"
                  ? videoExportPhase === "encoding"
                    ? "Encoding…"
                    : videoFormat === "gif"
                      ? "Exporting…"
                      : "Recording…"
                  : "Working…"
              : exportTarget === "image"
                ? "Export"
                : exportTarget === "video"
                  ? videoFormat === "gif"
                    ? "Export GIF"
                    : "Record"
                  : "Export preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
