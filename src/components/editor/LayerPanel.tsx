"use client";

import * as React from "react";
import gsap from "gsap";
import {
  Camera,
  Image as ImageIcon,
  Plus,
  Shapes,
  Stack,
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
import type { ShaderType } from "@/types";

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
    ],
  },
  {
    label: "Optical Effects",
    items: [
      { type: "bloom", label: "Bloom" },
      { type: "fluted-glass", label: "Fluted Glass" },
      { type: "progressive-blur", label: "Progressive Blur" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Add Layer dropdown (includes shader types + media import)
// ─────────────────────────────────────────────────────────────────────────────

function AddLayerMenu() {
  const addLayer = useLayerStore((s) => s.addLayer);
  const setLayerMedia = useLayerStore((s) => s.setLayerMedia);
  const { toast } = useToast();

  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  const notifyLayerLimit = React.useCallback(() => {
    toast({
      variant: "warning",
      title: "Layer limit reached",
      description: `Maximum ${MAX_LAYERS} layers. Remove one before adding another.`,
    });
  }, [toast]);

  const tryAddLayer = React.useCallback(
    (kind: "shader" | "image" | "video" | "webcam", shaderType?: ShaderType): string | null => {
      const id = addLayer(kind, shaderType);
      if (!id) notifyLayerLimit();
      return id;
    },
    [addLayer, notifyLayerLimit],
  );

  function handleMediaFile(file: File) {
    const isVideo = file.type.startsWith("video/");
    const id = tryAddLayer(isVideo ? "video" : "image");
    if (!id) return;
    const url = URL.createObjectURL(file);
    setLayerMedia(id, url, isVideo ? "video" : "image");
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LayerPanel
// ─────────────────────────────────────────────────────────────────────────────

export function LayerPanel() {
  const layers = useLayerStore((s) => s.layers);
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const reorderLayers = useLayerStore((s) => s.reorderLayers);
  const selectLayer = useLayerStore((s) => s.selectLayer);
  const removeLayer = useLayerStore((s) => s.removeLayer);
  const setLayerVisibility = useLayerStore((s) => s.setLayerVisibility);
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());
  const listRef = React.useRef<HTMLDivElement>(null);
  const layerOrderKey = React.useMemo(() => layers.map((l) => l.id).join("|"), [layers]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = layers.findIndex((l) => l.id === active.id);
    const newIndex = layers.findIndex((l) => l.id === over.id);
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
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx === -1) return;

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex =
          event.key === "ArrowUp"
            ? Math.max(0, idx - 1)
            : Math.min(layers.length - 1, idx + 1);
        const next = layers[nextIndex];
        if (!next) return;
        selectLayer(next.id);
        focusRow(next.id);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        selectLayer(layerId);
        return;
      }

      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        const layer = layers[idx];
        if (!layer) return;
        setLayerVisibility(layer.id, !layer.visible);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const nextIndex = Math.min(idx, layers.length - 2);
        const next = nextIndex >= 0 ? layers[nextIndex] : null;
        removeLayer(layerId);
        if (next) {
          selectLayer(next.id);
          focusRow(next.id);
        }
      }
    },
    [focusRow, layers, removeLayer, selectLayer, setLayerVisibility],
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
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-xs">
        <div className="flex items-center gap-3xs">
          <Stack size={14} className="text-[var(--color-fg-tertiary)]" />
          <Text variant="caption" color="secondary" className="font-medium">
            Layers
          </Text>
        </div>
        <AddLayerMenu />
      </div>

      {/* Layer list */}
      <ScrollArea className="flex-1">
        {layers.length === 0 ? (
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
                items={layers.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {layers.map((layer, i) => (
                  <LayerItem
                    key={layer.id}
                    layer={layer}
                    tabIndex={
                      selectedLayerId
                        ? selectedLayerId === layer.id
                          ? 0
                          : -1
                        : i === 0
                          ? 0
                          : -1
                    }
                    itemRef={(node) => registerRowRef(layer.id, node)}
                    onRowKeyDown={(event) => handleRowKeyDown(event, layer.id)}
                  />
                ))}
              </SortableContext>
            </div>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  );
}
