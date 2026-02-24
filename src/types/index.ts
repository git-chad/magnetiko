// ─────────────────────────────────────────────────────────────────────────────
// Shader Studio — Shared TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Blend modes ───────────────────────────────────────────────────────────────

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

// ── Layer kind ────────────────────────────────────────────────────────────────

export type LayerKind = "shader" | "image" | "video" | "webcam" | "model";

// ── Filter vs mask mode ───────────────────────────────────────────────────────

/**
 * filter — the shader processes the underlying texture (sequential filter chain)
 * mask   — the shader generates independent output composited via blend mode
 */
export type FilterMode = "filter" | "mask";
export type FrameAspectMode = "auto-base" | "locked" | "custom";

// ── Shader types ──────────────────────────────────────────────────────────────

export type ShaderType =
  | "pixelation"
  | "halftone"
  | "ascii"
  | "dithering"
  | "bloom"
  | "fluted-glass"
  | "progressive-blur"
  | "warp-distortion"
  | "noise-generator"
  | "mesh-gradient"
  | "guilloche"
  | "sdf-shapes"
  | "3d-shapes"
  | "grain"
  | "interactivity"
  | "masonry";

// ── Shader parameter ──────────────────────────────────────────────────────────

export type ShaderParamType =
  | "float"
  | "int"
  | "vec2"
  | "vec3"
  | "color"
  | "enum"
  | "bool";

export interface ShaderParam {
  key: string;
  label: string;
  type: ShaderParamType;
  value: number | number[] | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Valid options when type === 'enum' */
  options?: { label: string; value: string }[];
  /** Groups controls in the sidebar (collapsible sections) */
  group?: string;
  /** Tooltip text shown next to the control */
  description?: string;
}

// ── Layer ─────────────────────────────────────────────────────────────────────

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  groupId?: string;
  shaderType?: ShaderType;
  filterMode: FilterMode;
  visible: boolean;
  /** Solo this layer — hides all others temporarily */
  solo: boolean;
  /** 0–1 */
  opacity: number;
  blendMode: BlendMode;
  params: ShaderParam[];
  locked: boolean;
  /** UI: expanded in the layer panel */
  expanded: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "webcam" | "model";
  /** Upload/render lifecycle for media layers. */
  mediaStatus?: "idle" | "loading" | "ready" | "error";
  /** Human-readable media error when mediaStatus === 'error'. */
  mediaError?: string;
  /** Bumped to force a media reload (retry). */
  mediaVersion?: number;
  /** Runtime shader/pipeline error message for this layer. */
  runtimeError?: string;
  /** Base-64 thumbnail preview for the layer panel row */
  thumbnail?: string;
  mediaName?: string;
}

export interface LayerGroup {
  id: string;
  name: string;
  collapsed: boolean;
}

// ── Editor state ──────────────────────────────────────────────────────────────

export interface EditorState {
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
}

// ── History ───────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  layers: Layer[];
  timestamp: number;
  label: string;
}

// ── Media asset ───────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string;
  name: string;
  /** Object URL created from the uploaded File */
  url: string;
  type: "image" | "video" | "model";
  width: number;
  height: number;
  /** Video duration in seconds, if applicable */
  duration?: number;
}
