import type { BlendMode, ShaderType } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Static assets — bundled in /public/assets/
// ─────────────────────────────────────────────────────────────────────────────

export interface StaticAsset {
  id: string;
  label: string;
  description: string;
  /** Path relative to origin — served from /public, e.g. "/assets/nature-01.jpeg" */
  path: string;
  type: "image" | "video";
}

export const STATIC_ASSETS: StaticAsset[] = [
  {
    id: "nature-01",
    label: "Forest",
    description: "Dense foliage — rich greens for halftone & dithering",
    path: "/assets/nature-01.jpeg",
    type: "image",
  },
  {
    id: "nature-02",
    label: "Landscape",
    description: "Open natural terrain with strong horizon",
    path: "/assets/nature-02.jpeg",
    type: "image",
  },
  {
    id: "nature-03",
    label: "Scenery",
    description: "Organic forms and natural light",
    path: "/assets/nature-03.jpeg",
    type: "image",
  },
  {
    id: "portrait-01",
    label: "Portrait I",
    description: "Close-up face — ideal for halftone & ASCII",
    path: "/assets/portrait-01.jpg",
    type: "image",
  },
  {
    id: "portrait-02",
    label: "Portrait II",
    description: "Studio lighting with soft contrast",
    path: "/assets/portrait-02.jpeg",
    type: "image",
  },
  {
    id: "art-01",
    label: "Abstract Art",
    description: "Bold shapes and vivid color fields",
    path: "/assets/art-01.jpeg",
    type: "image",
  },
  {
    id: "japan-02",
    label: "Japan Street",
    description: "Urban architecture with graphic geometry",
    path: "/assets/japan-02.jpg",
    type: "image",
  },
  {
    id: "anime-01",
    label: "Anime Clip",
    description: "Animated characters — great for grain & ASCII",
    path: "/assets/anime-01.mp4",
    type: "video",
  },
  {
    id: "japan-01",
    label: "Japan City",
    description: "Street-level urban footage",
    path: "/assets/japan-01.mp4",
    type: "video",
  },
];

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
  {
    id: "prism-drift",
    label: "Prism Drift",
    description: "Chromatic fringing with cinematic film grain",
    css: "linear-gradient(135deg, #26150d 0%, #ff6a1f 38%, #f5f5f0 100%)",
    layers: [
      { shaderType: "chromatic-aberration", name: "Prism Split", opacity: 0.9 },
      { shaderType: "grain", name: "Film Grain", blendMode: "overlay", opacity: 0.45 },
    ],
  },
  {
    id: "editorial-print",
    label: "Editorial Print",
    description: "Halftone print layered with subtle prism edges",
    css: "linear-gradient(135deg, #f5f5f0 0%, #d6cebc 55%, #ff6a1f 100%)",
    layers: [
      { shaderType: "halftone", name: "Halftone", opacity: 0.9 },
      { shaderType: "chromatic-aberration", name: "Prism Split", opacity: 0.35 },
    ],
  },
  {
    id: "digital-heat",
    label: "Digital Heat",
    description: "Glitchy split + ordered dither for posterized energy",
    css: "linear-gradient(135deg, #1d201e 0%, #3b2a22 35%, #ff6a1f 100%)",
    layers: [
      { shaderType: "chromatic-aberration", name: "Prism Split", opacity: 0.95 },
      { shaderType: "dithering", name: "Dithering", blendMode: "soft-light", opacity: 0.75 },
      { shaderType: "grain", name: "Grain", blendMode: "overlay", opacity: 0.4 },
    ],
  },
];
