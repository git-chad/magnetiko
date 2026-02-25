import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Layer, LayerGroup } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// History entry — snapshot of layer state
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  layers: Layer[];
  groups: LayerGroup[];
  selectedLayerId: string | null;
  timestamp: number;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Cursor position currently playing out a debounce — used internally */
  _debounceTimer: ReturnType<typeof setTimeout> | null;
}

interface HistoryActions {
  /** Push a snapshot. Set `debounce: true` for slider-like continuous changes. */
  pushState(entry: Omit<HistoryEntry, "timestamp">, debounce?: boolean): void;
  undo(): HistoryEntry | null;
  redo(): HistoryEntry | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clearHistory(): void;
}

type HistoryStore = HistoryState & HistoryActions;

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 300;

export const useHistoryStore = create<HistoryStore>()(
  immer((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    past: [],
    future: [],
    _debounceTimer: null,

    // ── Actions ───────────────────────────────────────────────────────────

    pushState(entry, debounce = false) {
      const snapshot: HistoryEntry = { ...entry, timestamp: Date.now() };

      if (debounce) {
        // Cancel the running timer and start a new one
        const prev = get()._debounceTimer;
        if (prev) clearTimeout(prev);

        const timer = setTimeout(() => {
          set((state) => {
            state.past.push(snapshot);
            if (state.past.length > MAX_HISTORY) {
              state.past.shift();
            }
            state.future = [];
            state._debounceTimer = null;
          });
        }, DEBOUNCE_MS);

        set((state) => {
          state._debounceTimer = timer;
        });
      } else {
        // Immediate push — also clears any pending debounce
        const prev = get()._debounceTimer;
        if (prev) clearTimeout(prev);

        set((state) => {
          state.past.push(snapshot);
          if (state.past.length > MAX_HISTORY) {
            state.past.shift();
          }
          state.future = [];
          state._debounceTimer = null;
        });
      }
    },

    undo() {
      const { past } = get();
      if (past.length === 0) return null;

      const previous = past[past.length - 1];

      set((state) => {
        state.past.pop();
        state.future.unshift(previous);
      });

      return previous;
    },

    redo() {
      const { future } = get();
      if (future.length === 0) return null;

      const next = future[0];

      set((state) => {
        state.future.shift();
        state.past.push(next);
      });

      return next;
    },

    canUndo() {
      return get().past.length > 0;
    },

    canRedo() {
      return get().future.length > 0;
    },

    clearHistory() {
      const prev = get()._debounceTimer;
      if (prev) clearTimeout(prev);
      set((state) => {
        state.past = [];
        state.future = [];
        state._debounceTimer = null;
      });
    },
  })),
);

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard shortcut registration (call once in layout/root)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register global keyboard shortcuts for undo/redo.
 * Returns a cleanup function to remove the listener.
 *
 * The caller is responsible for wiring the returned entries back into
 * layerStore: `const snapshot = undo(); if (snapshot) { setLayers(snapshot.layers, snapshot.selectedLayerId, snapshot.groups); }`
 */
export function registerHistoryShortcuts(
  onUndo: () => void,
  onRedo: () => void,
): () => void {
  function handleKeyDown(e: KeyboardEvent) {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    if (!ctrlOrCmd) return;

    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      onUndo();
    } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
      e.preventDefault();
      onRedo();
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}
