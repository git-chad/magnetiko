import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuidv4 } from "uuid";
import type { MediaAsset } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Validation constants
// ─────────────────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface MediaState {
  assets: MediaAsset[];
}

interface MediaActions {
  /** Load a File into the asset registry. Returns the created MediaAsset. */
  loadAsset(file: File): Promise<MediaAsset>;
  removeAsset(id: string): void;
  getAssetById(id: string): MediaAsset | undefined;
}

type MediaStore = MediaState & MediaActions;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateFile(file: File): void {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error(
      `Unsupported file type "${file.type}". Accepted types: PNG, JPG, WebP, MP4, WebM.`,
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 50 MB.`,
    );
  }
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image dimensions."));
    img.src = url;
  });
}

function loadVideoDimensions(
  url: string,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
    video.onerror = () => reject(new Error("Failed to load video metadata."));
    video.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useMediaStore = create<MediaStore>()(
  immer((set, get) => ({
    assets: [],

    async loadAsset(file) {
      validateFile(file);

      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      const id = uuidv4();

      let asset: MediaAsset;

      if (isVideo) {
        const { width, height, duration } = await loadVideoDimensions(url);
        asset = {
          id,
          name: file.name,
          url,
          type: "video",
          width,
          height,
          duration,
        };
      } else {
        const { width, height } = await loadImageDimensions(url);
        asset = {
          id,
          name: file.name,
          url,
          type: "image",
          width,
          height,
        };
      }

      set((state) => {
        state.assets.push(asset);
      });

      return asset;
    },

    removeAsset(id) {
      const { assets } = get();
      const asset = assets.find((a) => a.id === id);
      if (asset) {
        // Revoke the object URL to free memory
        URL.revokeObjectURL(asset.url);
      }
      set((state) => {
        state.assets = state.assets.filter((a) => a.id !== id);
      });
    },

    getAssetById(id) {
      return get().assets.find((a) => a.id === id);
    },
  })),
);
