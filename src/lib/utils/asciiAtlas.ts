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

// ─────────────────────────────────────────────────────────────────────────────
// Atlas builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a THREE.CanvasTexture font atlas for a charset string.
 *
 * cellPx should match the shader's cellSize in physical pixels so that the
 * atlas maps 1:1 to screen cells. Combined with NearestFilter this gives
 * pixel-perfect, blur-free characters.
 *
 * Layout: one row of characters, each occupying cellPx × cellPx pixels.
 * White glyph on black background (red channel carries the mask).
 *
 * Shader UV conventions (flipY = true default):
 *   atlasUV.x = (charIndex + cellFract.x) / numChars
 *   atlasUV.y = cellFract.y   — no extra flip needed
 */
export function buildAsciiAtlas(
  chars: string,
  fontWeight: FontWeight = "regular",
  cellPx: number = 32,
): THREE.CanvasTexture {
  const n = Math.max(chars.length, 1);
  const px = Math.max(Math.round(cellPx), 4);  // never smaller than 4px

  const canvas = document.createElement("canvas");
  canvas.width  = n * px;
  canvas.height = px;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const weightMap: Record<FontWeight, string> = {
    thin:    "100",
    regular: "400",
    bold:    "700",
  };

  const fontSize = Math.max(Math.floor(px * 0.85), 4);
  ctx.fillStyle    = "#ffffff";
  ctx.font         = `${weightMap[fontWeight]} ${fontSize}px monospace`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < n; i++) {
    ctx.fillText(chars[i], (i + 0.5) * px, px * 0.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  // NearestFilter is critical: atlas cells are built to match the screen cell
  // size exactly (1:1 pixel mapping). Linear filtering would blur the glyphs.
  tex.magFilter   = THREE.NearestFilter;
  tex.minFilter   = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
