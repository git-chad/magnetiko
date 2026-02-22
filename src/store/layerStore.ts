import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuidv4 } from "uuid";
import type { Layer, LayerKind, ShaderType, BlendMode, FilterMode } from "@/types";
import {
  getDefaultParams,
  getDefaultLayerName,
} from "@/lib/utils/defaultParams";

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface LayerState {
  layers: Layer[];
  selectedLayerId: string | null;
  hoveredLayerId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

interface LayerActions {
  addLayer(kind: LayerKind, shaderType?: ShaderType, insertIndex?: number): string;
  removeLayer(id: string): void;
  duplicateLayer(id: string): string | null;
  reorderLayers(fromIndex: number, toIndex: number): void;
  selectLayer(id: string | null): void;
  setHoveredLayer(id: string | null): void;
  setLayerVisibility(id: string, visible: boolean): void;
  toggleLayerSolo(id: string): void;
  setLayerOpacity(id: string, opacity: number): void;
  setLayerBlendMode(id: string, blendMode: BlendMode): void;
  setLayerFilterMode(id: string, filterMode: FilterMode): void;
  setLayerLocked(id: string, locked: boolean): void;
  renameLayer(id: string, name: string): void;
  updateParam(layerId: string, paramKey: string, value: Layer["params"][number]["value"]): void;
  resetParams(layerId: string): void;
  setLayerMedia(id: string, url: string, type: "image" | "video"): void;
  setLayerThumbnail(id: string, thumbnail: string): void;
  /** Restore a full snapshot (used by undo/redo). */
  setLayers(layers: Layer[], selectedLayerId: string | null): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

interface LayerSelectors {
  getSelectedLayer(): Layer | null;
  getVisibleLayers(): Layer[];
  getLayersByOrder(): Layer[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

type LayerStore = LayerState & LayerActions & LayerSelectors;

function createDefaultLayer(
  kind: LayerKind,
  shaderType: ShaderType | undefined,
  existingCount: number,
): Layer {
  return {
    id: uuidv4(),
    name: shaderType
      ? getDefaultLayerName(shaderType, existingCount)
      : kind === "image"
        ? "Image"
        : kind === "video"
          ? "Video"
          : "Layer",
    kind,
    shaderType,
    filterMode: "filter",
    visible: true,
    solo: false,
    opacity: 1,
    blendMode: "normal",
    params: shaderType ? getDefaultParams(shaderType) : [],
    locked: false,
    expanded: true,
  };
}

export const useLayerStore = create<LayerStore>()(
  immer((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    layers: [],
    selectedLayerId: null,
    hoveredLayerId: null,

    // ── Actions ───────────────────────────────────────────────────────────

    addLayer(kind, shaderType, insertIndex) {
      const { layers } = get();
      const sameTypeCount = shaderType
        ? layers.filter((l) => l.shaderType === shaderType).length
        : 0;
      const newLayer = createDefaultLayer(kind, shaderType, sameTypeCount);

      set((state) => {
        if (insertIndex !== undefined) {
          state.layers.splice(insertIndex, 0, newLayer);
        } else {
          // Insert at top (index 0 = front of stack / top in panel)
          state.layers.unshift(newLayer);
        }
        state.selectedLayerId = newLayer.id;
      });

      return newLayer.id;
    },

    removeLayer(id) {
      set((state) => {
        const idx = state.layers.findIndex((l) => l.id === id);
        if (idx === -1) return;

        state.layers.splice(idx, 1);

        // Select nearest neighbor
        if (state.selectedLayerId === id) {
          const newIdx = Math.min(idx, state.layers.length - 1);
          state.selectedLayerId = newIdx >= 0 ? state.layers[newIdx].id : null;
        }
        if (state.hoveredLayerId === id) {
          state.hoveredLayerId = null;
        }
      });
    },

    duplicateLayer(id) {
      const { layers } = get();
      const source = layers.find((l) => l.id === id);
      if (!source) return null;

      const copy: Layer = {
        ...source,
        id: uuidv4(),
        name: `${source.name} copy`,
        params: source.params.map((p) => ({ ...p })),
        expanded: true,
      };

      set((state) => {
        const idx = state.layers.findIndex((l) => l.id === id);
        state.layers.splice(idx, 0, copy);
        state.selectedLayerId = copy.id;
      });

      return copy.id;
    },

    reorderLayers(fromIndex, toIndex) {
      set((state) => {
        const [moved] = state.layers.splice(fromIndex, 1);
        state.layers.splice(toIndex, 0, moved);
      });
    },

    selectLayer(id) {
      set((state) => {
        state.selectedLayerId = id;
      });
    },

    setHoveredLayer(id) {
      set((state) => {
        state.hoveredLayerId = id;
      });
    },

    setLayerVisibility(id, visible) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.visible = visible;
      });
    },

    toggleLayerSolo(id) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (!layer) return;
        const wasSolo = layer.solo;
        // Clear all solo states first
        state.layers.forEach((l) => (l.solo = false));
        // Toggle this layer's solo (off if it was already on)
        if (!wasSolo) layer.solo = true;
      });
    },

    setLayerOpacity(id, opacity) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.opacity = Math.max(0, Math.min(1, opacity));
      });
    },

    setLayerBlendMode(id, blendMode) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.blendMode = blendMode;
      });
    },

    setLayerFilterMode(id, filterMode) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.filterMode = filterMode;
      });
    },

    setLayerLocked(id, locked) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.locked = locked;
      });
    },

    renameLayer(id, name) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.name = name;
      });
    },

    updateParam(layerId, paramKey, value) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === layerId);
        if (!layer) return;
        const param = layer.params.find((p) => p.key === paramKey);
        if (param) param.value = value;
      });
    },

    resetParams(layerId) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === layerId);
        if (!layer?.shaderType) return;
        layer.params = getDefaultParams(layer.shaderType);
      });
    },

    setLayerMedia(id, url, type) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) {
          layer.mediaUrl = url;
          layer.mediaType = type;
        }
      });
    },

    setLayerThumbnail(id, thumbnail) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.thumbnail = thumbnail;
      });
    },

    setLayers(layers, selectedLayerId) {
      set((state) => {
        state.layers = layers;
        state.selectedLayerId = selectedLayerId;
      });
    },

    // ── Selectors ─────────────────────────────────────────────────────────

    getSelectedLayer() {
      const { layers, selectedLayerId } = get();
      return layers.find((l) => l.id === selectedLayerId) ?? null;
    },

    getVisibleLayers() {
      const { layers } = get();
      const hasSolo = layers.some((l) => l.solo);
      return hasSolo ? layers.filter((l) => l.solo) : layers.filter((l) => l.visible);
    },

    getLayersByOrder() {
      // Returns layers bottom-to-top (render order: first = base, last = front)
      return [...get().layers].reverse();
    },
  })),
);
