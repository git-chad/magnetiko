"use client";

import * as React from "react";
import { Sparkle } from "@phosphor-icons/react";
import { v4 as uuidv4 } from "uuid";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useLayerStore } from "@/store/layerStore";
import { MAX_LAYERS } from "@/store/layerStore";
import { getDefaultParams } from "@/lib/utils/defaultParams";
import { cn } from "@/lib/utils";
import { IMAGE_PRESETS, SHADER_PRESETS, STATIC_ASSETS } from "@/config/presets";
import type { ImagePreset, ShaderPreset, StaticAsset } from "@/config/presets";
import type { Layer } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Paint a linear gradient onto a 512×512 canvas and return a JPEG data URL */
function gradientToDataUrl(preset: ImagePreset): string {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // Convert CSS angle (0° = up, clockwise) to canvas coordinates
  const rad = ((preset.angle - 90) * Math.PI) / 180;
  const cx = 256,
    cy = 256,
    r = 362; // r = half-diagonal ≈ sqrt(256²+256²)
  const grad = ctx.createLinearGradient(
    cx - r * Math.cos(rad),
    cy - r * Math.sin(rad),
    cx + r * Math.cos(rad),
    cy + r * Math.sin(rad),
  );
  for (const stop of preset.stops) {
    grad.addColorStop(stop.position, stop.color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Build a full Layer object from a shader preset layer config */
function buildShaderLayer(config: ShaderPreset["layers"][number]): Layer {
  return {
    id: uuidv4(),
    name: config.name,
    kind: "shader",
    shaderType: config.shaderType,
    filterMode: "filter",
    visible: true,
    solo: false,
    opacity: config.opacity ?? 1,
    blendMode: config.blendMode ?? "normal",
    params: getDefaultParams(config.shaderType),
    locked: false,
    expanded: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PresetCard
// ─────────────────────────────────────────────────────────────────────────────

interface PresetCardProps {
  label: string;
  description: string;
  preview: React.ReactNode;
  onSelect: () => void;
}

function PresetCard({
  label,
  description,
  preview,
  onSelect,
}: PresetCardProps) {
  return (
    <button
      className={cn(
        "group flex flex-col overflow-hidden rounded-sm",
        "border border-[var(--color-border)] bg-[var(--color-bg)]",
        "text-left outline-none",
        "transition-all duration-micro",
        "hover:border-[var(--color-accent)] hover:shadow-mid",
        "focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        "active:scale-[0.98]",
      )}
      onClick={onSelect}
    >
      {/* Preview — aspect-video */}
      <div className="aspect-video w-full overflow-hidden">{preview}</div>

      {/* Label + description */}
      <div className="px-xs py-2xs flex flex-col">
        <Text as="p" variant="caption" color="primary" className="font-medium">
          {label}
        </Text>
        <Text as="p" variant="caption" color="tertiary" className="mt-[2px]">
          {description}
        </Text>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PresetBrowser
// ─────────────────────────────────────────────────────────────────────────────

export interface PresetBrowserProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PresetBrowser({ open, onOpenChange }: PresetBrowserProps) {
  const addLayer = useLayerStore((s) => s.addLayer);
  const setLayerMedia = useLayerStore((s) => s.setLayerMedia);
  const setLayers = useLayerStore((s) => s.setLayers);
  const layersCount = useLayerStore((s) => s.layers.length);
  const { toast } = useToast();

  const addLayerWithLimit = React.useCallback(
    (kind: "image" | "video"): string | null => {
      const id = addLayer(kind);
      if (id) return id;
      toast({
        variant: "warning",
        title: "Layer limit reached",
        description: `Maximum ${MAX_LAYERS} layers. Remove one before adding more.`,
      });
      return null;
    },
    [addLayer, toast],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleBlankCanvas() {
    onOpenChange(false);
  }

  function handleSolidColor(hex: string) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 64, 64);
    const id = addLayerWithLimit("image");
    if (!id) return;
    setLayerMedia(id, canvas.toDataURL("image/png"), "image");
    onOpenChange(false);
  }

  function handleImagePreset(preset: ImagePreset) {
    const dataUrl = gradientToDataUrl(preset);
    const id = addLayerWithLimit("image");
    if (!id) return;
    setLayerMedia(id, dataUrl, "image");
    onOpenChange(false);
  }

  function handleStaticAsset(asset: StaticAsset) {
    const id = addLayer(asset.type);
    if (!id) {
      toast({
        variant: "warning",
        title: "Layer limit reached",
        description: `Maximum ${MAX_LAYERS} layers. Remove one before adding more.`,
      });
      return;
    }
    setLayerMedia(id, asset.path, asset.type);
    onOpenChange(false);
  }

  function handleShaderPreset(preset: ShaderPreset) {
    const availableSlots = Math.max(MAX_LAYERS - layersCount, 0);
    if (availableSlots === 0) {
      toast({
        variant: "warning",
        title: "Layer limit reached",
        description: `Maximum ${MAX_LAYERS} layers. Remove one before applying presets.`,
      });
      return;
    }

    const newLayers = preset.layers
      .slice(0, availableSlots)
      .map(buildShaderLayer);
    const existingLayers = useLayerStore.getState().layers;
    // Prepend new layers to the top of whatever is already in the stack
    setLayers([...newLayers, ...existingLayers], newLayers[0]?.id ?? null);
    if (newLayers.length < preset.layers.length) {
      toast({
        variant: "info",
        title: "Preset partially applied",
        description: `Added ${newLayers.length}/${preset.layers.length} layers (limit ${MAX_LAYERS}).`,
      });
    }
    onOpenChange(false);
  }

  function handleSurpriseMe() {
    if (SHADER_PRESETS.length === 0) return;
    const preset = SHADER_PRESETS[Math.floor(Math.random() * SHADER_PRESETS.length)];
    handleShaderPreset(preset);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[48rem] min-h-[660px]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-sm">
            <DialogTitle>Get Started</DialogTitle>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleSurpriseMe}
            >
              <Sparkle size={14} />
              Surprise me
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="photos">
          <TabsList>
            <TabsTrigger value="fresh">Start fresh</TabsTrigger>
            <TabsTrigger value="photos">Photos & Video</TabsTrigger>
            <TabsTrigger value="images">Gradients</TabsTrigger>
            <TabsTrigger value="shaders">Shader presets</TabsTrigger>
          </TabsList>

          {/* ── Start fresh ──────────────────────────────────────────── */}
          <TabsContent value="fresh">
              <div className="grid grid-cols-2 gap-xs sm:grid-cols-4">
                <PresetCard
                  label="Empty Canvas"
                  description="Start blank — add layers and media manually"
                  preview={
                    <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-subtle)]">
                      <Sparkle
                        size={28}
                        weight="thin"
                        className="text-[var(--color-fg-disabled)]"
                      />
                    </div>
                  }
                  onSelect={handleBlankCanvas}
                />
                {[
                  {
                    hex: "#f5f5f0",
                    label: "Off White",
                    description: "Neutral warm white",
                  },
                  {
                    hex: "#111110",
                    label: "Near Black",
                    description: "Deep neutral dark",
                  },
                  {
                    hex: "#ff6a1f",
                    label: "Orange",
                    description: "App accent color",
                  },
                ].map(({ hex, label, description }) => (
                  <PresetCard
                    key={hex}
                    label={label}
                    description={description}
                    preview={
                      <div
                        className="h-full w-full"
                        style={{ background: hex }}
                      />
                    }
                    onSelect={() => handleSolidColor(hex)}
                  />
                ))}
              </div>
              <Text variant="caption" color="tertiary" className="mt-xs block">
                Use the{" "}
                <span className="font-medium text-[var(--color-fg-secondary)]">
                  +
                </span>{" "}
                button in the layer panel to add effects, or import media from
                the toolbar.
              </Text>
          </TabsContent>

          {/* ── Photos & Video ───────────────────────────────────────── */}
          <TabsContent value="photos">
              <div className="grid grid-cols-3 gap-xs sm:grid-cols-4">
                {STATIC_ASSETS.map((asset) => (
                  <PresetCard
                    key={asset.id}
                    label={asset.label}
                    description={asset.description}
                    preview={
                      asset.type === "video" ? (
                        <video
                          src={asset.path}
                          className="h-full w-full object-cover"
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.path}
                          alt={asset.label}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )
                    }
                    onSelect={() => handleStaticAsset(asset)}
                  />
                ))}
              </div>
          </TabsContent>

          {/* ── Gradients ────────────────────────────────────────────── */}
          <TabsContent value="images">
              <div className="grid grid-cols-3 gap-xs sm:grid-cols-4">
                {IMAGE_PRESETS.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    label={preset.label}
                    description={preset.description}
                    preview={
                      <div
                        className="h-full w-full"
                        style={{ background: preset.css }}
                      />
                    }
                    onSelect={() => handleImagePreset(preset)}
                  />
                ))}
              </div>
          </TabsContent>

          {/* ── Shader presets ───────────────────────────────────────── */}
          <TabsContent value="shaders">
              <div className="grid grid-cols-3 gap-xs">
                {SHADER_PRESETS.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    label={preset.label}
                    description={preset.description}
                    preview={
                      <div
                        className="h-full w-full"
                        style={{ background: preset.css }}
                      />
                    }
                    onSelect={() => handleShaderPreset(preset)}
                  />
                ))}
              </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
