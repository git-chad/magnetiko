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
  Separator,
  ThemeToggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore, registerHistoryShortcuts } from "@/store/historyStore";
import { useLayerStore } from "@/store/layerStore";
import { useMediaUpload } from "@/hooks/useMediaUpload";

// ─────────────────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    __magnetikoExportPng?: () => Promise<Blob>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const ZOOM_STEP = 1.25;
const RENDER_SCALE_OPTIONS: Array<1 | 0.75 | 0.5> = [1, 0.75, 0.5];

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

  const handleExport = React.useCallback(async () => {
    const exportPng = window.__magnetikoExportPng;
    if (!exportPng) {
      toast({
        variant: "error",
        title: "Export failed",
        description: "Renderer is not ready yet.",
      });
      return;
    }

    try {
      const blob = await exportPng();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.download = `magnetiko-${stamp}.png`;
      link.href = url;
      link.click();
      queueMicrotask(() => URL.revokeObjectURL(url));

      toast({
        variant: "success",
        title: "Exported PNG",
        description: "Saved current canvas frame.",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export image.",
      });
    }
  }, [toast]);

  React.useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "s") return;
      if (_isEditableTarget(event.target)) return;
      event.preventDefault();
      handleExport();
    }
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [handleExport]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
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
            <Button size="icon-sm" variant="ghost" aria-label="Export PNG" onClick={handleExport}>
              <Export size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export PNG (⌘/Ctrl+S)</TooltipContent>
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
  );
}
