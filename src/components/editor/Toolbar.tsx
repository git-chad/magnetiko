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
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore, registerHistoryShortcuts } from "@/store/historyStore";
import { useLayerStore } from "@/store/layerStore";
import { useMediaUpload } from "@/hooks/useMediaUpload";

// ─────────────────────────────────────────────────────────────────────────────

const ZOOM_STEP = 1.25;

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

  // History state
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undo    = useHistoryStore((s) => s.undo);
  const redo    = useHistoryStore((s) => s.redo);

  // Layer actions
  const setLayers = useLayerStore((s) => s.setLayers);

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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Export" disabled>
              <Export size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export (coming soon)</TooltipContent>
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
