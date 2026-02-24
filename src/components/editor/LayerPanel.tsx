"use client";

import * as React from "react";
import {
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
import { useLayerStore } from "@/store/layerStore";
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

  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  function handleMediaFile(file: File) {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    const id = addLayer(isVideo ? "video" : "image");
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
                  onSelect={() => addLayer("shader", item.type)}
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
  const reorderLayers = useLayerStore((s) => s.reorderLayers);

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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-xs">
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
            <SortableContext
              items={layers.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {layers.map((layer) => (
                <LayerItem key={layer.id} layer={layer} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  );
}
