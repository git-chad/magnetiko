"use client";

import * as React from "react";
import {
  ArrowClockwise,
  Camera,
  Copy,
  DotsThreeVertical,
  DotsSixVertical,
  Eye,
  EyeSlash,
  Image as ImageIcon,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Shapes,
  Trash,
  VideoCamera,
} from "@phosphor-icons/react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { useLayerStore } from "@/store/layerStore";
import { cn } from "@/lib/utils";
import type { Layer } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────

function LayerIcon({ layer }: { layer: Layer }) {
  if (layer.kind === "image")
    return <ImageIcon size={14} className="text-[var(--color-fg-tertiary)]" />;
  if (layer.kind === "video")
    return (
      <VideoCamera size={14} className="text-[var(--color-fg-tertiary)]" />
    );
  if (layer.kind === "webcam")
    return <Camera size={14} className="text-[var(--color-fg-tertiary)]" />;
  return <Shapes size={14} className="text-[var(--color-fg-tertiary)]" />;
}

// ─────────────────────────────────────────────────────────────────────────────

interface LayerItemProps {
  layer: Layer;
  tabIndex?: number;
  rowClassName?: string;
  itemRef?: (node: HTMLDivElement | null) => void;
  onRowKeyDown?: (
    event: React.KeyboardEvent<HTMLDivElement>,
    layer: Layer,
  ) => void;
}

export function LayerItem({
  layer,
  tabIndex = -1,
  rowClassName,
  itemRef,
  onRowKeyDown,
}: LayerItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: layer.id,
  });

  const [isRenaming, setIsRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(layer.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const layers = useLayerStore((s) => s.layers);
  const selectLayer = useLayerStore((s) => s.selectLayer);
  const setLayerVisibility = useLayerStore((s) => s.setLayerVisibility);
  const setLayerLocked = useLayerStore((s) => s.setLayerLocked);
  const removeLayer = useLayerStore((s) => s.removeLayer);
  const duplicateLayer = useLayerStore((s) => s.duplicateLayer);
  const renameLayer = useLayerStore((s) => s.renameLayer);
  const resetParams = useLayerStore((s) => s.resetParams);
  const retryLayerMedia = useLayerStore((s) => s.retryLayerMedia);
  const reorderLayers = useLayerStore((s) => s.reorderLayers);

  const isSelected = selectedLayerId === layer.id;
  const myIndex = layers.findIndex((l) => l.id === layer.id);

  const style = { transform: CSS.Transform.toString(transform), transition };
  const setCombinedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      itemRef?.(node);
    },
    [itemRef, setNodeRef],
  );

  // ── Rename ────────────────────────────────────────────────────────────────

  function startRename() {
    setDraftName(layer.name);
    setIsRenaming(true);
  }

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== layer.name) renameLayer(layer.id, trimmed);
    else setDraftName(layer.name);
    setIsRenaming(false);
  }

  function handleRenameKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") {
      setDraftName(layer.name);
      setIsRenaming(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={setCombinedRef}
      style={style}
      id={`layer-row-${layer.id}`}
      data-layer-row="true"
      role="option"
      aria-selected={isSelected}
      tabIndex={tabIndex}
      className={cn(
        "group relative mx-3xs my-[2px] flex items-center gap-2xs rounded-sm py-[6px] pl-[6px] pr-xs",
        "cursor-pointer select-none border border-transparent transition-colors",
        isSelected
          ? "border-[color:rgba(255,106,31,0.35)] bg-[var(--color-selected-bg)]"
          : "hover:border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)]",
        isDragging && "opacity-50 shadow-mid",
        !isDragging && !layer.visible && "opacity-40",
        rowClassName,
      )}
      onClick={() => selectLayer(layer.id)}
      onKeyDown={(e) => onRowKeyDown?.(e, layer)}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-[var(--color-fg-disabled)] opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Reorder layer"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <DotsSixVertical size={12} weight="bold" />
      </button>

      {/* Thumbnail */}
      {layer.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={layer.thumbnail}
          alt=""
          className="h-8 w-8 shrink-0 rounded-xs border border-[var(--color-border)] object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xs border border-[var(--color-border)] bg-[var(--color-bg)]">
          <LayerIcon layer={layer} />
        </div>
      )}

      {/* Name + type label */}
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        {isRenaming ? (
          <input
            ref={inputRef}
            className="w-full rounded-xs border border-[var(--color-accent)] bg-[var(--color-bg)] px-3xs py-0 text-xs text-[var(--color-fg-primary)] outline-none"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKey}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span
            className="truncate text-xs font-medium text-[var(--color-fg-primary)]"
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRename();
            }}
          >
            {layer.name}
          </span>
        )}
        {layer.shaderType && (
          <span className="truncate text-[10px] capitalize leading-none text-[var(--color-fg-disabled)]">
            {layer.shaderType.replace(/-/g, " ")}
          </span>
        )}
        {(layer.kind === "image" ||
          layer.kind === "video" ||
          layer.kind === "webcam") &&
          layer.mediaStatus === "loading" && (
            <span className="truncate text-[10px] leading-none text-[var(--color-fg-disabled)]">
              loading media…
            </span>
          )}
        {(layer.kind === "image" ||
          layer.kind === "video" ||
          layer.kind === "webcam") &&
          layer.mediaStatus === "error" && (
            <span className="truncate text-[10px] leading-none text-[var(--color-error)]">
              {layer.mediaError ?? "media failed"}
            </span>
          )}
        {layer.kind === "shader" && layer.runtimeError && (
          <span className="truncate text-[10px] leading-none text-[var(--color-error)]">
            shader disabled
          </span>
        )}
      </div>

      {/* Lock (always visible when locked; hover-only when unlocked) */}
      <button
        className={cn(
          "shrink-0 transition-colors",
          layer.locked
            ? "text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)]"
            : "text-[var(--color-fg-disabled)] opacity-0 hover:text-[var(--color-fg-tertiary)] group-hover:opacity-100",
        )}
        aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
        onClick={(e) => {
          e.stopPropagation();
          setLayerLocked(layer.id, !layer.locked);
        }}
      >
        {layer.locked ? <LockSimple size={13} /> : <LockSimpleOpen size={13} />}
      </button>

      {/* Context menu (3-dot, hover-only) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="shrink-0 text-[var(--color-fg-tertiary)] opacity-0 transition-colors hover:text-[var(--color-fg-primary)] group-hover:opacity-100"
            aria-label="Layer options"
            onClick={(e) => e.stopPropagation()}
          >
            <DotsThreeVertical size={14} weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4}>
          <DropdownMenuItem onSelect={startRename}>
            <PencilSimple size={13} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicateLayer(layer.id)}>
            <Copy size={13} />
            Duplicate
          </DropdownMenuItem>
          {layer.shaderType && (
            <DropdownMenuItem onSelect={() => resetParams(layer.id)}>
              Reset parameters
            </DropdownMenuItem>
          )}
          {(layer.kind === "image" ||
            layer.kind === "video" ||
            layer.kind === "webcam") &&
            layer.mediaStatus === "error" && (
              <DropdownMenuItem onSelect={() => retryLayerMedia(layer.id)}>
                <ArrowClockwise size={13} />
                Retry media
              </DropdownMenuItem>
            )}
          {myIndex > 0 && (
            <DropdownMenuItem onSelect={() => reorderLayers(myIndex, 0)}>
              Move to top
            </DropdownMenuItem>
          )}
          {myIndex < layers.length - 1 && (
            <DropdownMenuItem
              onSelect={() => reorderLayers(myIndex, layers.length - 1)}
            >
              Move to bottom
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => removeLayer(layer.id)}>
            <Trash size={13} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Visibility toggle */}
      <button
        className="shrink-0 text-[var(--color-fg-tertiary)] transition-colors hover:text-[var(--color-fg-primary)]"
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
        onClick={(e) => {
          e.stopPropagation();
          setLayerVisibility(layer.id, !layer.visible);
        }}
      >
        {layer.visible ? <Eye size={13} /> : <EyeSlash size={13} />}
      </button>
    </div>
  );
}
