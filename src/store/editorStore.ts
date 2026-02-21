import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface EditorState {
  zoom: number;
  panOffset: { x: number; y: number };
  canvasSize: { width: number; height: number };
  showGrid: boolean;
  theme: "light" | "dark";
  sidebarOpen: { left: boolean; right: boolean };
  fps: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

interface EditorActions {
  setZoom(zoom: number): void;
  setPan(x: number, y: number): void;
  resetView(): void;
  setCanvasSize(width: number, height: number): void;
  toggleGrid(): void;
  toggleTheme(): void;
  setTheme(theme: "light" | "dark"): void;
  toggleSidebar(side: "left" | "right"): void;
  setSidebarOpen(side: "left" | "right", open: boolean): void;
  setFps(fps: number): void;
}

type EditorStore = EditorState & EditorActions;

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;

export const useEditorStore = create<EditorStore>()(
  immer((set) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    canvasSize: { width: 1920, height: 1080 },
    showGrid: false,
    theme: "light",
    sidebarOpen: { left: true, right: true },
    fps: 0,

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
        state.canvasSize = { width, height };
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
  })),
);
