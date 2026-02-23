import * as THREE from "three/webgpu";

// ─────────────────────────────────────────────────────────────────────────────
// Charset registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Characters ordered light → dark (index 0 = minimum ink, last = maximum ink).
 * The shader maps luma 0 → char[0], luma 1 → char[last].
 */
export const CHARSETS: Record<string, string> = {
  light:    " .:-=+*#%@",
  dense:    " .',:;!|({#@",
  blocks:   " ░▒▓█",
  hatching: " ╱╲╳░▒",
  binary:   "01",
};

export type FontWeight = "thin" | "regular" | "bold";

// Each character cell in the atlas is this many pixels square.
// Higher = more detail in the glyph, but larger GPU texture.
const ATLAS_CELL_PX = 32;

// ─────────────────────────────────────────────────────────────────────────────
// Atlas builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a THREE.CanvasTexture font atlas for a charset string.
 *
 * Layout: one row of characters, each occupying ATLAS_CELL_PX × ATLAS_CELL_PX
 * pixels. White glyph on black background (red channel carries the mask).
 *
 * Shader UV conventions (with flipY = true default):
 *   atlasUV.x = (charIndex + cellUV.x) / numChars
 *   atlasUV.y = cellUV.y  — no extra flip needed
 */
export function buildAsciiAtlas(
  chars: string,
  fontWeight: FontWeight = "regular",
): THREE.CanvasTexture {
  const n = Math.max(chars.length, 1);
  const cellPx = ATLAS_CELL_PX;

  const canvas = document.createElement("canvas");
  canvas.width  = n * cellPx;
  canvas.height = cellPx;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const weightMap: Record<FontWeight, string> = {
    thin:    "100",
    regular: "400",
    bold:    "700",
  };

  const fontSize = Math.floor(cellPx * 0.85);
  ctx.fillStyle  = "#ffffff";
  ctx.font       = `${weightMap[fontWeight]} ${fontSize}px monospace`;
  ctx.textAlign  = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < n; i++) {
    ctx.fillText(chars[i], (i + 0.5) * cellPx, cellPx * 0.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter  = THREE.LinearFilter;
  tex.minFilter  = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
