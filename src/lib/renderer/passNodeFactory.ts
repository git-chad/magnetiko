import { PassNode } from "./PassNode";
import { PixelationPass } from "@/lib/shaders/pixelation.tsl";
import { HalftonePass } from "@/lib/shaders/halftone.tsl";
import { AsciiPass } from "@/lib/shaders/ascii.tsl";

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the correct PassNode subclass for a given shader type.
 * Falls back to a base passthrough PassNode for unknown types.
 */
export function createPassNode(layerId: string, shaderType?: string): PassNode {
  switch (shaderType) {
    case "pixelation": return new PixelationPass(layerId);
    case "halftone":   return new HalftonePass(layerId);
    case "ascii":      return new AsciiPass(layerId);
    default:           return new PassNode(layerId);
  }
}
