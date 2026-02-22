import type { BlendMode, ShaderType } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Image presets — gradient bitmaps generated on the client
// ─────────────────────────────────────────────────────────────────────────────

export interface GradientStop {
  position: number; // 0–1
  color: string;
}

export interface ImagePreset {
  id: string;
  label: string;
  description: string;
  /** Linear gradient angle in degrees (CSS convention: 0 = up, 90 = right) */
  angle: number;
  stops: GradientStop[];
  /** CSS gradient string for preview thumbnails (no canvas needed) */
  css: string;
}

export const IMAGE_PRESETS: ImagePreset[] = [
  {
    id: "warm-dusk",
    label: "Warm Dusk",
    description: "Orange to deep purple",
    angle: 135,
    stops: [
      { position: 0, color: "#e8a87c" },
      { position: 0.5, color: "#c56183" },
      { position: 1, color: "#6c3483" },
    ],
    css: "linear-gradient(135deg, #e8a87c 0%, #c56183 50%, #6c3483 100%)",
  },
  {
    id: "ocean-deep",
    label: "Ocean Deep",
    description: "Midnight blue to forest green",
    angle: 135,
    stops: [
      { position: 0, color: "#0d47a1" },
      { position: 0.5, color: "#006064" },
      { position: 1, color: "#1b5e20" },
    ],
    css: "linear-gradient(135deg, #0d47a1 0%, #006064 50%, #1b5e20 100%)",
  },
  {
    id: "monochrome",
    label: "Monochrome",
    description: "Light to dark neutral tones",
    angle: 135,
    stops: [
      { position: 0, color: "#f5f5f0" },
      { position: 0.5, color: "#888878" },
      { position: 1, color: "#111110" },
    ],
    css: "linear-gradient(135deg, #f5f5f0 0%, #888878 50%, #111110 100%)",
  },
  {
    id: "sunset-fire",
    label: "Sunset Fire",
    description: "Warm fire and amber tones",
    angle: 135,
    stops: [
      { position: 0, color: "#ff6b35" },
      { position: 0.4, color: "#f7931e" },
      { position: 1, color: "#ffd23f" },
    ],
    css: "linear-gradient(135deg, #ff6b35 0%, #f7931e 40%, #ffd23f 100%)",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shader presets — pre-configured layer stacks
// ─────────────────────────────────────────────────────────────────────────────

export interface ShaderPresetLayer {
  shaderType: ShaderType;
  name: string;
  blendMode?: BlendMode;
  opacity?: number;
}

export interface ShaderPreset {
  id: string;
  label: string;
  description: string;
  /** CSS background for the card preview */
  css: string;
  layers: ShaderPresetLayer[];
}

export const SHADER_PRESETS: ShaderPreset[] = [
  {
    id: "classic-halftone",
    label: "Classic Halftone",
    description: "Dot-grid newspaper reproduction",
    css: "linear-gradient(135deg, #f5f5f0 0%, #d0c8b0 100%)",
    layers: [{ shaderType: "halftone", name: "Halftone" }],
  },
  {
    id: "pixel-grid",
    label: "Pixel Grid",
    description: "Chunky retro pixel art",
    css: "linear-gradient(135deg, #ff6b35 0%, #c56183 100%)",
    layers: [{ shaderType: "pixelation", name: "Pixelation" }],
  },
  {
    id: "film-grain",
    label: "Film Grain",
    description: "Subtle cinematic texture",
    css: "linear-gradient(135deg, #888878 0%, #f5f5f0 100%)",
    layers: [{ shaderType: "grain", name: "Grain", blendMode: "overlay", opacity: 0.6 }],
  },
  {
    id: "ascii-terminal",
    label: "ASCII Terminal",
    description: "Classic green-on-black character art",
    css: "linear-gradient(135deg, #001400 0%, #005500 100%)",
    layers: [{ shaderType: "ascii", name: "ASCII" }],
  },
  {
    id: "tilt-shift",
    label: "Tilt Shift",
    description: "Miniature-world directional blur",
    css: "linear-gradient(to bottom, rgba(130,160,200,0.7) 0%, transparent 40%, transparent 60%, rgba(130,160,200,0.7) 100%), linear-gradient(135deg, #4a90d9 0%, #7b68ee 100%)",
    layers: [{ shaderType: "progressive-blur", name: "Progressive Blur" }],
  },
  {
    id: "neon-glow",
    label: "Neon Glow",
    description: "Dreamy bloom on bright highlights",
    css: "radial-gradient(ellipse at center, rgba(255,200,255,0.9) 0%, rgba(100,50,200,0.7) 50%, rgba(0,0,40,1) 100%)",
    layers: [{ shaderType: "bloom", name: "Bloom" }],
  },
];
