import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuidv4 } from "uuid";
import type { Layer, LayerGroup, LayerKind, ShaderType, BlendMode, FilterMode } from "@/types";
import {
  getDefaultParamsForLayer,
  getDefaultLayerName,
} from "@/lib/utils/defaultParams";

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface LayerState {
  layers: Layer[];
  groups: LayerGroup[];
  selectedLayerId: string | null;
  hoveredLayerId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

interface LayerActions {
  addLayer(kind: LayerKind, shaderType?: ShaderType, insertIndex?: number): string | null;
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
  setLayerMedia(id: string, url: string, type: "image" | "video" | "model", name?: string): void;
  setLayerMediaStatus(
    id: string,
    status: "idle" | "loading" | "ready" | "error",
    error?: string,
  ): void;
  retryLayerMedia(id: string): void;
  setLayerRuntimeError(id: string, error: string | null): void;
  setLayerThumbnail(id: string, thumbnail: string): void;
  createGroup(name?: string, layerIds?: string[]): string | null;
  removeGroup(groupId: string): void;
  renameGroup(groupId: string, name: string): void;
  toggleGroupCollapsed(groupId: string): void;
  assignLayerToGroup(layerId: string, groupId: string | null): void;
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
  getGroupById(groupId: string): LayerGroup | null;
  hasReachedLayerLimit(): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

type LayerStore = LayerState & LayerActions & LayerSelectors;
export const MAX_LAYERS = 20;

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
          : kind === "webcam"
            ? "Webcam"
            : kind === "model"
              ? "3D Model"
            : "Layer",
    kind,
    shaderType,
    filterMode: "filter",
    visible: true,
    solo: false,
    opacity: 1,
    blendMode: "normal",
    params: getDefaultParamsForLayer(kind, shaderType),
    locked: false,
    expanded: true,
    mediaStatus: "idle",
    mediaVersion: 0,
  };
}

export const useLayerStore = create<LayerStore>()(
  immer((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    layers: [],
    groups: [],
    selectedLayerId: null,
    hoveredLayerId: null,

    // ── Actions ───────────────────────────────────────────────────────────

    addLayer(kind, shaderType, insertIndex) {
      const { layers } = get();
      if (layers.length >= MAX_LAYERS) return null;
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
        pruneEmptyGroups(state);

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
      if (layers.length >= MAX_LAYERS) return null;
      const source = layers.find((l) => l.id === id);
      if (!source) return null;

      const copy: Layer = {
        ...source,
        id: uuidv4(),
        name: `${source.name} copy`,
        params: source.params.map((p) => ({ ...p })),
        expanded: true,
        runtimeError: undefined,
        mediaError: undefined,
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
        if (
          fromIndex < 0 ||
          fromIndex >= state.layers.length ||
          toIndex < 0 ||
          toIndex >= state.layers.length ||
          fromIndex === toIndex
        ) {
          return;
        }

        const movingLayer = state.layers[fromIndex];
        if (!movingLayer) return;
        const directionDown = fromIndex < toIndex;

        // Grouped layers move as a block so grouped stacks behave like one unit.
        if (movingLayer.groupId) {
          const movingGroupId = movingLayer.groupId;
          const movingIndices = collectGroupIndices(state.layers, movingGroupId);
          if (movingIndices.length === 0) return;

          const targetLayer = state.layers[toIndex];
          if (targetLayer?.groupId === movingGroupId) return;

          const adjustedToIndex = normalizeTargetIndexForGroupBoundary(
            state.layers,
            toIndex,
            directionDown,
            movingGroupId,
          );
          const movingSet = new Set(movingIndices);
          const movingBlock = state.layers.filter((_, idx) => movingSet.has(idx));
          const remaining = state.layers.filter((_, idx) => !movingSet.has(idx));
          const removedBeforeTarget = movingIndices.filter((idx) => idx < adjustedToIndex).length;
          let insertIndex = adjustedToIndex - removedBeforeTarget;
          insertIndex = Math.max(0, Math.min(remaining.length, insertIndex));
          remaining.splice(insertIndex, 0, ...movingBlock);
          state.layers = remaining;
          return;
        }

        const adjustedToIndex = normalizeTargetIndexForGroupBoundary(
          state.layers,
          toIndex,
          directionDown,
          null,
        );
        const targetGroupId = state.layers[toIndex]?.groupId;
        const isDroppingOnGroupedBlock = typeof targetGroupId === "string";
        const insertIndex = isDroppingOnGroupedBlock && fromIndex < adjustedToIndex
          ? adjustedToIndex - 1
          : adjustedToIndex;
        const [moved] = state.layers.splice(fromIndex, 1);
        state.layers.splice(insertIndex, 0, moved);
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
        if (param) {
          param.value = value;
          layer.runtimeError = undefined;
        }
      });
    },

    resetParams(layerId) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === layerId);
        if (!layer) return;
        if (layer.kind !== "shader" && layer.kind !== "model") return;
        layer.params = getDefaultParamsForLayer(layer.kind, layer.shaderType);
        layer.runtimeError = undefined;
      });
    },

    setLayerMedia(id, url, type, name) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) {
          layer.mediaUrl = url;
          layer.mediaType = type;
          layer.mediaName = name;
          layer.mediaStatus = "loading";
          layer.mediaError = undefined;
          layer.mediaVersion = (layer.mediaVersion ?? 0) + 1;
        }
      });
    },

    setLayerMediaStatus(id, status, error) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (!layer) return;
        layer.mediaStatus = status;
        layer.mediaError = status === "error" ? (error ?? "Failed to load media.") : undefined;
      });
    },

    retryLayerMedia(id) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (!layer) return;
        if (layer.kind === "webcam" || layer.mediaUrl) {
          layer.mediaStatus = "loading";
          layer.mediaError = undefined;
          layer.mediaVersion = (layer.mediaVersion ?? 0) + 1;
        }
      });
    },

    setLayerRuntimeError(id, error) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (!layer) return;
        layer.runtimeError = error ?? undefined;
      });
    },

    setLayerThumbnail(id, thumbnail) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (layer) layer.thumbnail = thumbnail;
      });
    },

    createGroup(name, layerIds) {
      const { groups, layers, selectedLayerId } = get();
      const nextGroupId = uuidv4();
      const normalizedName = name?.trim();
      const fallbackName = getNextGroupName(groups);
      const selectedIds =
        layerIds && layerIds.length > 0
          ? layerIds
          : selectedLayerId
            ? [selectedLayerId]
            : [];
      const memberIds = selectedIds.filter((id) => layers.some((layer) => layer.id === id));

      set((state) => {
        state.groups.unshift({
          id: nextGroupId,
          name: normalizedName && normalizedName.length > 0 ? normalizedName : fallbackName,
          collapsed: false,
        });
        if (memberIds.length > 0) {
          const memberSet = new Set(memberIds);
          const firstMemberIndex = state.layers.findIndex((layer) => memberSet.has(layer.id));
          for (const layer of state.layers) {
            if (memberSet.has(layer.id)) {
              layer.groupId = nextGroupId;
            }
          }
          // Keep newly grouped members contiguous.
          if (firstMemberIndex >= 0 && memberIds.length > 1) {
            const groupedLayers = state.layers.filter((layer) => memberSet.has(layer.id));
            const nonGroupedLayers = state.layers.filter((layer) => !memberSet.has(layer.id));
            let insertIndex = 0;
            for (let i = 0; i < firstMemberIndex; i++) {
              if (!memberSet.has(state.layers[i].id)) insertIndex++;
            }
            nonGroupedLayers.splice(insertIndex, 0, ...groupedLayers);
            state.layers = nonGroupedLayers;
          }
        }
      });

      return nextGroupId;
    },

    removeGroup(groupId) {
      set((state) => {
        state.groups = state.groups.filter((group) => group.id !== groupId);
        for (const layer of state.layers) {
          if (layer.groupId === groupId) layer.groupId = undefined;
        }
      });
    },

    renameGroup(groupId, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId);
        if (group) group.name = trimmed;
      });
    },

    toggleGroupCollapsed(groupId) {
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId);
        if (group) group.collapsed = !group.collapsed;
      });
    },

    assignLayerToGroup(layerId, groupId) {
      set((state) => {
        const layer = state.layers.find((l) => l.id === layerId);
        if (!layer) return;
        const previousGroupId = layer.groupId;
        if (!groupId) {
          layer.groupId = undefined;
          pruneEmptyGroups(state);
          return;
        }
        if (!state.groups.some((group) => group.id === groupId)) return;
        if (layer.groupId === groupId) return;
        layer.groupId = groupId;

        // Keep destination group contiguous by moving the new member to the tail.
        const currentIndex = state.layers.findIndex((l) => l.id === layer.id);
        const destinationIndices = collectGroupIndices(state.layers, groupId).filter(
          (idx) => state.layers[idx]?.id !== layer.id,
        );
        if (currentIndex >= 0 && destinationIndices.length > 0) {
          const groupTailIndex = destinationIndices[destinationIndices.length - 1]!;
          const [moved] = state.layers.splice(currentIndex, 1);
          const insertIndex = currentIndex < groupTailIndex ? groupTailIndex : groupTailIndex + 1;
          state.layers.splice(insertIndex, 0, moved);
        }

        if (previousGroupId && previousGroupId !== groupId) {
          pruneEmptyGroups(state);
        }
      });
    },

    setLayers(layers, selectedLayerId) {
      set((state) => {
        const nextLayers = layers.slice(0, MAX_LAYERS);
        state.layers = nextLayers;
        const referencedGroupIds = new Set(
          nextLayers.map((layer) => layer.groupId).filter((id): id is string => typeof id === "string"),
        );
        state.groups = state.groups.filter((group) => referencedGroupIds.has(group.id));
        state.selectedLayerId =
          selectedLayerId && nextLayers.some((layer) => layer.id === selectedLayerId)
            ? selectedLayerId
            : nextLayers[0]?.id ?? null;
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

    getGroupById(groupId) {
      return get().groups.find((group) => group.id === groupId) ?? null;
    },

    hasReachedLayerLimit() {
      return get().layers.length >= MAX_LAYERS;
    },
  })),
);

function pruneEmptyGroups(state: LayerState): void {
  const used = new Set(
    state.layers.map((layer) => layer.groupId).filter((id): id is string => typeof id === "string"),
  );
  state.groups = state.groups.filter((group) => used.has(group.id));
}

function getNextGroupName(groups: LayerGroup[]): string {
  const usedNumbers = new Set<number>();
  for (const group of groups) {
    const match = /^Group\s+(\d+)$/i.exec(group.name.trim());
    if (!match) continue;
    const parsed = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      usedNumbers.add(parsed);
    }
  }
  let next = 1;
  while (usedNumbers.has(next)) next++;
  return `Group ${next}`;
}

function collectGroupIndices(layers: Layer[], groupId: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < layers.length; i++) {
    if (layers[i]?.groupId === groupId) indices.push(i);
  }
  return indices;
}

function normalizeTargetIndexForGroupBoundary(
  layers: Layer[],
  targetIndex: number,
  movingDown: boolean,
  ignoreGroupId: string | null,
): number {
  const targetLayer = layers[targetIndex];
  if (!targetLayer?.groupId || targetLayer.groupId === ignoreGroupId) {
    return targetIndex;
  }
  const targetGroupIndices = collectGroupIndices(layers, targetLayer.groupId);
  if (targetGroupIndices.length === 0) return targetIndex;
  const groupHead = targetGroupIndices[0]!;
  const groupTail = targetGroupIndices[targetGroupIndices.length - 1]!;
  return movingDown ? groupTail + 1 : groupHead;
}
