"use client";

import * as React from "react";
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

// ─────────────────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    __magnetikoExportImage?: (options?: ExportImageOptions) => Promise<Blob>;
    __magnetikoExportPng?: () => Promise<Blob>;
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

type ExportScaleMode = (typeof EXPORT_SCALE_OPTIONS)[number]["value"];

function _clampPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(16_384, Math.round(value)));
}

function _readViewportExportSize(fallbackWidth: number, fallbackHeight: number): {
  width: number;
  height: number;
} {
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

  // History state
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undo    = useHistoryStore((s) => s.undo);
  const redo    = useHistoryStore((s) => s.redo);

  // Layer actions
  const setLayers = useLayerStore((s) => s.setLayers);
  const { toast } = useToast();

  // ── File import ──────────────────────────────────────────────────────────
  const { upload, isLoading: uploadLoading } = useMediaUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file
    await upload(file);
  }

  // ── Undo / redo ──────────────────────────────────────────────────────────
  const handleUndo = React.useCallback(() => {
    const entry = undo();
    if (entry) setLayers(entry.layers, entry.selectedLayerId);
  }, [undo, setLayers]);

  const handleRedo = React.useCallback(() => {
    const entry = redo();
    if (entry) setLayers(entry.layers, entry.selectedLayerId);
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
  const [isExporting, setIsExporting] = React.useState(false);

  React.useEffect(() => {
    if (!exportDialogOpen) return;
    const base = _readViewportExportSize(canvasSize.width, canvasSize.height);
    setViewportExportBase(base);
    setCustomWidthInput(String(base.width));
    setCustomHeightInput(String(base.height));
    setIncludeGridOverlay(showGrid);
  }, [canvasSize.height, canvasSize.width, exportDialogOpen, showGrid]);

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

  return (
    <>
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-raised)] px-xs">

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
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileChange}
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
          className="hidden items-center gap-[2px] rounded-xs border border-[var(--color-border)] bg-[var(--color-bg)] p-[2px] lg:flex"
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
                  "rounded-[2px] px-[6px] py-[2px] text-[10px] font-mono transition-colors",
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
          <TooltipContent>Export image (⌘/Ctrl+S)</TooltipContent>
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
          <DialogTitle>Export Image</DialogTitle>
          <DialogDescription>
            Export the current frame as PNG or JPEG with custom resolution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-xs">
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
        </div>

        <DialogFooter>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExportDialogOpen(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runExport(true)}
            disabled={isExporting}
          >
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
