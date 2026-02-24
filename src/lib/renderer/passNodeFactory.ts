import { PassNode } from "./PassNode";
import { PixelationPass } from "@/lib/shaders/pixelation.tsl";
import { HalftonePass } from "@/lib/shaders/halftone.tsl";
import { AsciiPass } from "@/lib/shaders/ascii.tsl";
import { DitheringPass } from "@/lib/shaders/dithering.tsl";
import { FlutedGlassPass } from "@/lib/shaders/flutedGlass.tsl";
import { ProgressiveBlurPass } from "@/lib/shaders/progressiveBlur.tsl";
import { WarpDistortionPass } from "@/lib/shaders/warpDistortion.tsl";
import { NoiseGeneratorPass } from "@/lib/shaders/noiseGenerator.tsl";
import { MeshGradientPass } from "@/lib/shaders/meshGradient.tsl";
import { GuillochePass } from "@/lib/shaders/guilloche.tsl";
import { SdfShapesPass } from "@/lib/shaders/sdfShapes.tsl";
import { GrainPass } from "@/lib/shaders/grain.tsl";
import { InteractivityPass } from "@/lib/shaders/interactivity.tsl";
import { MasonryPass } from "@/lib/shaders/masonry.tsl";

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
    case "dithering":     return new DitheringPass(layerId);
    case "fluted-glass":      return new FlutedGlassPass(layerId);
    case "progressive-blur":  return new ProgressiveBlurPass(layerId);
    case "warp-distortion":   return new WarpDistortionPass(layerId);
    case "noise-generator":   return new NoiseGeneratorPass(layerId);
    case "mesh-gradient":     return new MeshGradientPass(layerId);
    case "guilloche":         return new GuillochePass(layerId);
    case "sdf-shapes":        return new SdfShapesPass(layerId);
    case "grain":             return new GrainPass(layerId);
    case "interactivity":     return new InteractivityPass(layerId);
    case "masonry":           return new MasonryPass(layerId);
    default:                  return new PassNode(layerId);
  }
}
