import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { FrameAspectMode } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface EditorState {
  zoom: number;
  panOffset: { x: number; y: number };
  canvasSize: { width: number; height: number };
  frameAspectMode: FrameAspectMode;
  frameAspectCustom: { width: number; height: number };
  frameAspectLocked: number;
  resolvedFrameAspect: number;
  renderScale: 1 | 0.75 | 0.5;
  showGrid: boolean;
  theme: "light" | "dark";
  sidebarOpen: { left: boolean; right: boolean };
  fps: number;
  maskPaint: {
    enabled: boolean;
    brushSize: number;
    softness: number;
    erase: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

interface EditorActions {
  setZoom(zoom: number): void;
  setPan(x: number, y: number): void;
  resetView(): void;
  setCanvasSize(width: number, height: number): void;
  setFrameAspectMode(mode: FrameAspectMode): void;
  setFrameAspectCustom(width: number, height: number): void;
  setFrameAspectLocked(aspect: number): void;
  setResolvedFrameAspect(aspect: number): void;
  lockFrameAspect(aspect?: number): void;
  setRenderScale(scale: 1 | 0.75 | 0.5): void;
  toggleGrid(): void;
  toggleTheme(): void;
  setTheme(theme: "light" | "dark"): void;
  toggleSidebar(side: "left" | "right"): void;
  setSidebarOpen(side: "left" | "right", open: boolean): void;
  setFps(fps: number): void;
  setMaskPaintEnabled(enabled: boolean): void;
  setMaskPaintBrushSize(size: number): void;
  setMaskPaintSoftness(softness: number): void;
  setMaskPaintErase(erase: boolean): void;
}

type EditorStore = EditorState & EditorActions;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;
const DEFAULT_ASPECT = 1920 / 1080;
const ASPECT_EPSILON = 1e-6;

export const useEditorStore = create<EditorStore>()(
  immer((set) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    canvasSize: { width: 1920, height: 1080 },
    frameAspectMode: "auto-base",
    frameAspectCustom: { width: 16, height: 9 },
    frameAspectLocked: DEFAULT_ASPECT,
    resolvedFrameAspect: DEFAULT_ASPECT,
    renderScale: 1,
    showGrid: false,
    theme: "light",
    sidebarOpen: { left: true, right: true },
    fps: 0,
    maskPaint: {
      enabled: false,
      brushSize: 42,
      softness: 0.65,
      erase: false,
    },

    // ── Actions ───────────────────────────────────────────────────────────

    setZoom(zoom) {
      set((state) => {
        state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
      });
    },

    setPan(x, y) {
      set((state) => {
        state.panOffset = { x, y };
      });
    },

    resetView() {
      set((state) => {
        state.zoom = 1;
        state.panOffset = { x: 0, y: 0 };
      });
    },

    setCanvasSize(width, height) {
      set((state) => {
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        if (state.canvasSize.width === w && state.canvasSize.height === h) return;
        state.canvasSize = { width: w, height: h };
      });
    },

    setFrameAspectMode(mode) {
      set((state) => {
        if (state.frameAspectMode === mode) return;
        state.frameAspectMode = mode;
      });
    },

    setFrameAspectCustom(width, height) {
      set((state) => {
        const w = Math.max(1, Math.min(10000, Math.round(width)));
        const h = Math.max(1, Math.min(10000, Math.round(height)));
        if (state.frameAspectCustom.width === w && state.frameAspectCustom.height === h) return;
        state.frameAspectCustom = { width: w, height: h };
      });
    },

    setFrameAspectLocked(aspect) {
      set((state) => {
        if (!Number.isFinite(aspect) || aspect <= 0) return;
        if (Math.abs(state.frameAspectLocked - aspect) <= ASPECT_EPSILON) return;
        state.frameAspectLocked = aspect;
      });
    },

    setResolvedFrameAspect(aspect) {
      set((state) => {
        if (!Number.isFinite(aspect) || aspect <= 0) return;
        if (Math.abs(state.resolvedFrameAspect - aspect) <= ASPECT_EPSILON) return;
        state.resolvedFrameAspect = aspect;
      });
    },

    lockFrameAspect(aspect) {
      set((state) => {
        const next =
          typeof aspect === "number" && Number.isFinite(aspect) && aspect > 0
            ? aspect
            : state.resolvedFrameAspect;
        if (!Number.isFinite(next) || next <= 0) return;
        if (Math.abs(state.frameAspectLocked - next) > ASPECT_EPSILON) {
          state.frameAspectLocked = next;
        }
        if (state.frameAspectMode !== "locked") {
          state.frameAspectMode = "locked";
        }
      });
    },

    setRenderScale(scale) {
      set((state) => {
        state.renderScale = scale;
      });
    },

    toggleGrid() {
      set((state) => {
        state.showGrid = !state.showGrid;
      });
    },

    toggleTheme() {
      set((state) => {
        state.theme = state.theme === "light" ? "dark" : "light";
      });
    },

    setTheme(theme) {
      set((state) => {
        state.theme = theme;
      });
    },

    toggleSidebar(side) {
      set((state) => {
        state.sidebarOpen[side] = !state.sidebarOpen[side];
      });
    },

    setSidebarOpen(side, open) {
      set((state) => {
        state.sidebarOpen[side] = open;
      });
    },

    setFps(fps) {
      set((state) => {
        state.fps = fps;
      });
    },

    setMaskPaintEnabled(enabled) {
      set((state) => {
        state.maskPaint.enabled = enabled;
      });
    },

    setMaskPaintBrushSize(size) {
      set((state) => {
        state.maskPaint.brushSize = Math.max(2, Math.min(300, size));
      });
    },

    setMaskPaintSoftness(softness) {
      set((state) => {
        state.maskPaint.softness = Math.max(0, Math.min(1, softness));
      });
    },

    setMaskPaintErase(erase) {
      set((state) => {
        state.maskPaint.erase = erase;
      });
    },
  })),
);
