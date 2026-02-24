"use client";

import * as React from "react";
import gsap from "gsap";
import {
  Camera,
  Cube,
  CaretDown,
  CaretRight,
  DotsSixVertical,
  DotsThreeVertical,
  FolderSimple,
  Image as ImageIcon,
  PencilSimple,
  Plus,
  Shapes,
  Stack,
  Trash,
  VideoCamera,
} from "@phosphor-icons/react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Text,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useLayerStore } from "@/store/layerStore";
import { MAX_LAYERS } from "@/store/layerStore";
import { LayerItem } from "./LayerItem";
import type { Layer, LayerGroup, ShaderType } from "@/types";

type DisplayRow =
  | { type: "group"; group: LayerGroup; childCount: number }
  | { type: "layer"; layer: Layer; inGroup: boolean };

const GROUP_ROW_PREFIX = "group:";

function toGroupRowId(groupId: string): string {
  return `${GROUP_ROW_PREFIX}${groupId}`;
}

function fromGroupRowId(rowId: string): string | null {
  return rowId.startsWith(GROUP_ROW_PREFIX)
    ? rowId.slice(GROUP_ROW_PREFIX.length)
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shader type menu data
// ─────────────────────────────────────────────────────────────────────────────

const SHADER_SECTIONS: Array<{
  label: string;
  items: Array<{ type: ShaderType; label: string }>;
}> = [
  {
    label: "Texture Effects",
    items: [
      { type: "pixelation", label: "Pixelation" },
      { type: "halftone", label: "Halftone" },
      { type: "ascii", label: "ASCII" },
      { type: "dithering", label: "Dithering" },
      { type: "masonry", label: "Masonry" },
      { type: "grain", label: "Grain" },
      { type: "noise-generator", label: "Noise Generator" },
      { type: "sdf-shapes", label: "SDF Shapes" },
    ],
  },
  {
    label: "Optical Effects",
    items: [
      { type: "bloom", label: "Bloom" },
      { type: "fluted-glass", label: "Fluted Glass" },
      { type: "progressive-blur", label: "Progressive Blur" },
      { type: "warp-distortion", label: "Warp Distortion" },
      { type: "mesh-gradient", label: "Mesh Gradient" },
      { type: "guilloche", label: "Guilloche" },
      { type: "3d-shapes", label: "3D Shapes" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Add Layer dropdown (includes shader types + media import + groups)
// ─────────────────────────────────────────────────────────────────────────────

function AddLayerMenu() {
  const addLayer = useLayerStore((s) => s.addLayer);
  const createGroup = useLayerStore((s) => s.createGroup);
  const setLayerMedia = useLayerStore((s) => s.setLayerMedia);
  const { toast } = useToast();

  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);
  const modelInputRef = React.useRef<HTMLInputElement>(null);

  const notifyLayerLimit = React.useCallback(() => {
    toast({
      variant: "warning",
      title: "Layer limit reached",
      description: `Maximum ${MAX_LAYERS} layers. Remove one before adding another.`,
    });
  }, [toast]);

  const tryAddLayer = React.useCallback(
    (kind: "shader" | "image" | "video" | "webcam" | "model", shaderType?: ShaderType): string | null => {
      const id = addLayer(kind, shaderType);
      if (!id) notifyLayerLimit();
      return id;
    },
    [addLayer, notifyLayerLimit],
  );

  const handleCreateGroup = React.useCallback(() => {
    createGroup();
  }, [createGroup]);

  function handleMediaFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const kind =
      file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("image/")
          ? "image"
          : lowerName.endsWith(".glb") || lowerName.endsWith(".gltf") || lowerName.endsWith(".obj")
            ? "model"
            : null;
    if (!kind) return;
    const id = tryAddLayer(kind);
    if (!id) return;
    const url = URL.createObjectURL(file);
    setLayerMedia(id, url, kind, file.name);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Add layer">
            <Plus size={13} />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6}>
          {SHADER_SECTIONS.map((section, i) => (
            <React.Fragment key={section.label}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
              {section.items.map((item) => (
                <DropdownMenuItem
                  key={item.type}
                  onSelect={() => {
                    tryAddLayer("shader", item.type);
                  }}
                >
                  <Shapes
                    size={13}
                    className="shrink-0 text-[var(--color-fg-tertiary)]"
                  />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </React.Fragment>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Grouping</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleCreateGroup}>
            <FolderSimple
              size={13}
              className="shrink-0 text-[var(--color-fg-tertiary)]"
            />
            New Group
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Media</DropdownMenuLabel>

          <DropdownMenuItem onSelect={() => imageInputRef.current?.click()}>
            <ImageIcon
              size={13}
              className="shrink-0 text-[var(--color-fg-tertiary)]"
            />
            Import Image
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => videoInputRef.current?.click()}>
            <VideoCamera
              size={13}
              className="shrink-0 text-[var(--color-fg-tertiary)]"
            />
            Import Video
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => modelInputRef.current?.click()}>
            <Cube
              size={13}
              className="shrink-0 text-[var(--color-fg-tertiary)]"
            />
            Import 3D Model
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => { tryAddLayer("webcam"); }}>
            <Camera
              size={13}
              className="shrink-0 text-[var(--color-fg-tertiary)]"
            />
            Use Webcam
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleMediaFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleMediaFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={modelInputRef}
        type="file"
        accept=".glb,.gltf,.obj,model/*,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleMediaFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Group row
// ─────────────────────────────────────────────────────────────────────────────

function GroupRow({
  group,
  childCount,
  canAddSelected,
  onAddSelected,
  onToggle,
  onRename,
  onDelete,
}: {
  group: LayerGroup;
  childCount: number;
  canAddSelected: boolean;
  onAddSelected: () => void;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: toGroupRowId(group.id),
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-layer-row="true"
      className="group mx-3xs my-[2px] flex items-center gap-2xs rounded-sm border border-transparent bg-[var(--color-bg-subtle)] py-[6px] pl-[8px] pr-xs"
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-[var(--color-fg-disabled)] opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Reorder group"
        tabIndex={-1}
      >
        <DotsSixVertical size={12} weight="bold" />
      </button>
      <button
        className="shrink-0 text-[var(--color-fg-tertiary)] transition-colors hover:text-[var(--color-fg-primary)]"
        onClick={onToggle}
        aria-label={group.collapsed ? "Expand group" : "Collapse group"}
      >
        {group.collapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
      </button>

      <FolderSimple size={14} className="shrink-0 text-[var(--color-fg-tertiary)]" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-[var(--color-fg-primary)]">{group.name}</p>
        <p className="text-[10px] leading-none text-[var(--color-fg-disabled)]">
          {childCount} layer{childCount === 1 ? "" : "s"}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="shrink-0 text-[var(--color-fg-tertiary)] opacity-0 transition-colors hover:text-[var(--color-fg-primary)] group-hover:opacity-100"
            aria-label="Group options"
          >
            <DotsThreeVertical size={14} weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4}>
          <DropdownMenuItem disabled={!canAddSelected} onSelect={onAddSelected}>
            <Plus size={13} />
            Add selected layer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRename}>
            <PencilSimple size={13} />
            Rename group
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={onDelete}>
            <Trash size={13} />
            Delete group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LayerPanel
// ─────────────────────────────────────────────────────────────────────────────

export function LayerPanel() {
  const layers = useLayerStore((s) => s.layers);
  const groups = useLayerStore((s) => s.groups);
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const reorderLayers = useLayerStore((s) => s.reorderLayers);
  const selectLayer = useLayerStore((s) => s.selectLayer);
  const removeLayer = useLayerStore((s) => s.removeLayer);
  const setLayerVisibility = useLayerStore((s) => s.setLayerVisibility);
  const assignLayerToGroup = useLayerStore((s) => s.assignLayerToGroup);
  const renameGroup = useLayerStore((s) => s.renameGroup);
  const removeGroup = useLayerStore((s) => s.removeGroup);
  const toggleGroupCollapsed = useLayerStore((s) => s.toggleGroupCollapsed);
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());
  const listRef = React.useRef<HTMLDivElement>(null);
  const layerOrderKey = React.useMemo(
    () => `${layers.map((l) => `${l.id}:${l.groupId ?? "-"}`).join("|")}::${groups.map((g) => `${g.id}:${g.collapsed}`).join("|")}`,
    [groups, layers],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const childCountByGroup = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of groups) counts.set(group.id, 0);
    for (const layer of layers) {
      if (!layer.groupId) continue;
      if (!counts.has(layer.groupId)) continue;
      counts.set(layer.groupId, (counts.get(layer.groupId) ?? 0) + 1);
    }
    return counts;
  }, [groups, layers]);

  const rows = React.useMemo<DisplayRow[]>(() => {
    const groupMap = new Map(groups.map((group) => [group.id, group]));
    const emitted = new Set<string>();
    const nextRows: DisplayRow[] = [];

    for (const layer of layers) {
      const groupId = layer.groupId;
      const group = groupId ? groupMap.get(groupId) : undefined;
      if (!group) {
        nextRows.push({ type: "layer", layer, inGroup: false });
        continue;
      }
      if (!emitted.has(group.id)) {
        emitted.add(group.id);
        nextRows.push({
          type: "group",
          group,
          childCount: childCountByGroup.get(group.id) ?? 0,
        });
      }
      if (!group.collapsed) {
        nextRows.push({ type: "layer", layer, inGroup: true });
      }
    }

    for (const group of groups) {
      if (emitted.has(group.id)) continue;
      nextRows.push({
        type: "group",
        group,
        childCount: childCountByGroup.get(group.id) ?? 0,
      });
    }

    return nextRows;
  }, [childCountByGroup, groups, layers]);

  const visibleLayerIds = React.useMemo(
    () => rows.filter((row): row is Extract<DisplayRow, { type: "layer" }> => row.type === "layer").map((row) => row.layer.id),
    [rows],
  );

  const sortableRowIds = React.useMemo(
    () =>
      rows.flatMap((row) => {
        if (row.type === "group") return [toGroupRowId(row.group.id)];
        if (!row.inGroup) return [row.layer.id];
        return [];
      }),
    [rows],
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const activeGroupId = fromGroupRowId(activeId);
    const overGroupId = fromGroupRowId(overId);

    const oldIndex = activeGroupId
      ? layers.findIndex((layer) => layer.groupId === activeGroupId)
      : layers.findIndex((layer) => layer.id === activeId);
    const newIndex = overGroupId
      ? layers.findIndex((layer) => layer.groupId === overGroupId)
      : layers.findIndex((layer) => layer.id === overId);

    if (oldIndex !== -1 && newIndex !== -1) reorderLayers(oldIndex, newIndex);
  }

  const registerRowRef = React.useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) rowRefs.current.set(id, node);
    else rowRefs.current.delete(id);
  }, []);

  const focusRow = React.useCallback((id: string) => {
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.focus();
    });
  }, []);

  const handleRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, layerId: string) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const idx = visibleLayerIds.findIndex((id) => id === layerId);
      if (idx === -1) return;

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex =
          event.key === "ArrowUp"
            ? Math.max(0, idx - 1)
            : Math.min(visibleLayerIds.length - 1, idx + 1);
        const nextId = visibleLayerIds[nextIndex];
        if (!nextId) return;
        selectLayer(nextId);
        focusRow(nextId);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        selectLayer(layerId);
        return;
      }

      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        const layer = layers.find((l) => l.id === layerId);
        if (!layer) return;
        setLayerVisibility(layer.id, !layer.visible);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const nextIndex = Math.min(idx, visibleLayerIds.length - 2);
        const nextId = nextIndex >= 0 ? visibleLayerIds[nextIndex] : null;
        removeLayer(layerId);
        if (nextId) {
          selectLayer(nextId);
          focusRow(nextId);
        }
      }
    },
    [focusRow, layers, removeLayer, selectLayer, setLayerVisibility, visibleLayerIds],
  );

  const handleRenameGroup = React.useCallback(
    (group: LayerGroup) => {
      if (typeof window === "undefined") return;
      const nextName = window.prompt("Rename group", group.name)?.trim();
      if (!nextName) return;
      renameGroup(group.id, nextName);
    },
    [renameGroup],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const root = listRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll("[data-layer-row='true']"));
    if (nodes.length === 0) return;
    gsap.fromTo(
      nodes,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.18, ease: "power2.out", stagger: 0.03, overwrite: "auto" },
    );
  }, [layerOrderKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-xs">
        <div className="flex items-center gap-3xs">
          <Stack size={14} className="text-[var(--color-fg-tertiary)]" />
          <Text variant="caption" color="secondary" className="font-medium">
            Layers
          </Text>
        </div>
        <AddLayerMenu />
      </div>

      <ScrollArea className="flex-1">
        {layers.length === 0 && groups.length === 0 ? (
          <div className="flex items-center justify-center px-md py-lg">
            <Text variant="caption" color="disabled" className="text-center">
              No layers yet.
              <br />
              Click <span className="font-medium">+</span> to add one.
            </Text>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div ref={listRef} role="listbox" aria-label="Layer stack">
              <SortableContext
                items={sortableRowIds}
                strategy={verticalListSortingStrategy}
              >
                {rows.map((row, i) => {
                  if (row.type === "group") {
                    const selectedLayer = selectedLayerId
                      ? layers.find((layer) => layer.id === selectedLayerId)
                      : null;
                    const canAddSelected =
                      Boolean(selectedLayer) &&
                      selectedLayer?.groupId !== row.group.id;
                    return (
                      <GroupRow
                        key={`group-${row.group.id}`}
                        group={row.group}
                        childCount={row.childCount}
                        canAddSelected={canAddSelected}
                        onAddSelected={() => {
                          if (!selectedLayer) return;
                          assignLayerToGroup(selectedLayer.id, row.group.id);
                        }}
                        onToggle={() => toggleGroupCollapsed(row.group.id)}
                        onRename={() => handleRenameGroup(row.group)}
                        onDelete={() => removeGroup(row.group.id)}
                      />
                    );
                  }

                  const layer = row.layer;
                  const firstVisibleId = visibleLayerIds[0] ?? null;
                  return (
                    <LayerItem
                      key={layer.id}
                      layer={layer}
                      sortable={!row.inGroup}
                      rowClassName={row.inGroup ? "ml-sm" : undefined}
                      tabIndex={
                        selectedLayerId
                          ? selectedLayerId === layer.id
                            ? 0
                            : -1
                          : firstVisibleId === layer.id || (firstVisibleId === null && i === 0)
                            ? 0
                            : -1
                      }
                      itemRef={(node) => registerRowRef(layer.id, node)}
                      onRowKeyDown={(event) => handleRowKeyDown(event, layer.id)}
                    />
                  );
                })}
              </SortableContext>
            </div>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  );
}
