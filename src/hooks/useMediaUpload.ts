"use client";

import * as React from "react";
import { useMediaStore } from "@/store/mediaStore";
import { useLayerStore } from "@/store/layerStore";
import { MAX_LAYERS } from "@/store/layerStore";
import { useToast } from "@/components/ui/toast";

// ─────────────────────────────────────────────────────────────────────────────
// useMediaUpload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared upload logic for both the Toolbar file-picker and the Canvas
 * drag-and-drop zone.
 *
 * - Validates the file via mediaStore (type, size)
 * - Creates a tracked MediaAsset (object URL + metadata)
 * - Adds an image/video layer to layerStore pointing at the asset
 * - Shows an error toast on validation or load failure
 */
export function useMediaUpload() {
  const loadAsset    = useMediaStore((s) => s.loadAsset);
  const removeAsset  = useMediaStore((s) => s.removeAsset);
  const addLayer     = useLayerStore((s) => s.addLayer);
  const setLayerMedia = useLayerStore((s) => s.setLayerMedia);
  const { toast }    = useToast();

  const [isLoading, setIsLoading] = React.useState(false);

  const upload = React.useCallback(
    async (file: File) => {
      setIsLoading(true);
      try {
        const asset = await loadAsset(file);
        const id    = addLayer(asset.type === "video" ? "video" : "image");
        if (!id) {
          removeAsset(asset.id);
          toast({
            variant: "warning",
            title: "Layer limit reached",
            description: `Maximum ${MAX_LAYERS} layers. Remove one before importing media.`,
          });
          return;
        }
        setLayerMedia(id, asset.url, asset.type);
      } catch (err) {
        toast({
          variant:     "error",
          title:       "Upload failed",
          description: err instanceof Error ? err.message : "Could not load media.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [loadAsset, removeAsset, addLayer, setLayerMedia, toast],
  );

  return { upload, isLoading };
}
