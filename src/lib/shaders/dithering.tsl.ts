import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  floor,
  clamp,
  select,
  screenSize,
  texture as tslTexture,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";
import { buildDitherTextures } from "@/lib/utils/ditherTextures";
import type { DitherTextures } from "@/lib/utils/ditherTextures";

// ─────────────────────────────────────────────────────────────────────────────
// DitheringPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ordered dithering filter pass.
 *
 * Each pixel's channel value is compared against a tiling threshold map
 * (Bayer matrix or IGN blue-noise) and quantized to the nearest level.
 *
 * Quantization formula:
 *   q(x) = clamp(floor(x*(levels-1) + threshold*spread) / (levels-1), 0, 1)
 *
 * Algorithm → threshold texture mapping:
 *   ordered-bayer + 2×2  → 2×2 Bayer DataTexture
 *   ordered-bayer + 4×4  → 4×4 Bayer DataTexture (default)
 *   ordered-bayer + 8×8  → 8×8 Bayer DataTexture
 *   floyd-steinberg       → 64×64 IGN blue-noise (GPU approximation)
 *   atkinson              → 64×64 IGN blue-noise (GPU approximation)
 *   blue-noise            → 64×64 IGN blue-noise
 *
 * Color modes (_colorModeU):
 *   0 = monochrome — luma dithered → grayscale output
 *   1 = source     — each RGB channel dithered independently (preserves hue)
 *   2 = palette    — same as monochrome (palette selection via Phase 5 UI)
 */
export class DitheringPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _levelsU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _spreadU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorModeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _matrixSizeU: any; // UV divisor — tiles the threshold texture

  // Mutable texture node; swap .value to change dither pattern without recompile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _ditherSampledNode: any;

  // All threshold DataTextures — allocated once, shared across algorithm switches.
  private readonly _textures: DitherTextures;
  private _currentTexture: THREE.DataTexture;

  // Track current params to avoid redundant updates.
  private _currentAlgorithm  = "ordered-bayer";
  private _currentMatrixSize = "4x4";

  constructor(layerId: string) {
    super(layerId);
    // super() already called _buildEffectNode() once; the guard returned the
    // passthrough _inputNode because uniforms weren't initialised yet.

    this._textures       = buildDitherTextures();
    this._currentTexture = this._textures.bayer4;

    this._levelsU     = uniform(2.0);
    this._spreadU     = uniform(1.0);
    this._colorModeU  = uniform(0.0);  // 0=mono 1=source 2=palette
    this._matrixSizeU = uniform(4.0);

    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms are initialised.
    if (!this._levelsU) return this._inputNode;

    // Pixel-space coordinate for tiling the threshold texture.
    // uv() ∈ [0,1]² → pixCoord ∈ [0, screenWidth] × [0, screenHeight].
    // The Y direction doesn't matter for a tiling pattern, so no flip needed.
    const pixCoord = vec2(uv()).mul(screenSize);

    // ── Threshold from tiling dither texture ──────────────────────────────────
    // pixCoord / matrixSize gives a UV that repeats every matrixSize pixels.
    // RepeatWrapping on the DataTexture handles values outside [0,1].
    const ditherUV = pixCoord.div(this._matrixSizeU);
    this._ditherSampledNode = tslTexture(this._currentTexture, ditherUV);
    const threshold = float(this._ditherSampledNode.r);

    // ── Source color ─────────────────────────────────────────────────────────
    // _inputNode samples at Y-flipped RT UV — base PassNode convention.
    const srcColor = this._inputNode;

    // ── Quantization ─────────────────────────────────────────────────────────
    // q(x) = clamp(floor(x*(levels-1) + threshold*spread) / (levels-1), 0, 1)
    // With levels=2, spread=1: a pixel at luma L is white if its threshold < L.
    const levelsM1 = this._levelsU.sub(float(1.0));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quantize = (ch: any) =>
      clamp(
        floor(
          float(ch).mul(levelsM1).add(threshold.mul(this._spreadU)),
        ).div(levelsM1),
        float(0.0),
        float(1.0),
      );

    // ── Luminance (Rec. 709) for monochrome / palette modes ───────────────────
    const luma = float(srcColor.r)
      .mul(float(0.2126))
      .add(float(srcColor.g).mul(float(0.7152)))
      .add(float(srcColor.b).mul(float(0.0722)));
    const qLuma = quantize(luma);

    // ── Per-channel quantization for source color mode ────────────────────────
    const qR = quantize(srcColor.r);
    const qG = quantize(srcColor.g);
    const qB = quantize(srcColor.b);

    // ── Color mode ────────────────────────────────────────────────────────────
    // 0 = monochrome (and palette): luma-only → gray
    // 1 = source: per-channel → hue preserved
    const monoOut = vec3(qLuma, qLuma, qLuma);
    const srcOut  = vec3(qR, qG, qB);

    const outColor = select(
      this._colorModeU.greaterThan(float(0.5)),
      srcOut,
      monoOut,
    );

    return vec4(outColor, float(1.0));
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "algorithm": {
          const val = p.value as string;
          if (val !== this._currentAlgorithm) {
            this._currentAlgorithm = val;
            this._updateDitherTexture();
          }
          break;
        }
        case "matrixSize": {
          const val = p.value as string;
          if (val !== this._currentMatrixSize) {
            this._currentMatrixSize = val;
            this._updateDitherTexture();
          }
          break;
        }
        case "colorMode": {
          const modeMap: Record<string, number> = {
            monochrome: 0, source: 1, palette: 2,
          };
          this._colorModeU.value = modeMap[p.value as string] ?? 0;
          break;
        }
        case "levels":
          this._levelsU.value = typeof p.value === "number" ? p.value : 2;
          break;
        case "spread":
          this._spreadU.value = typeof p.value === "number" ? p.value : 1.0;
          break;
      }
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Swap the active threshold texture + update the matrix-size uniform.
   * Called from updateUniforms() when algorithm or matrixSize changes.
   * No shader recompile — only _ditherSampledNode.value and _matrixSizeU change.
   */
  private _updateDitherTexture(): void {
    let tex: THREE.DataTexture;
    let size: number;

    if (this._currentAlgorithm === "ordered-bayer") {
      switch (this._currentMatrixSize) {
        case "2x2": tex = this._textures.bayer2; size = 2;  break;
        case "8x8": tex = this._textures.bayer8; size = 8;  break;
        default:    tex = this._textures.bayer4; size = 4;  break;
      }
    } else {
      // floyd-steinberg / atkinson / blue-noise → IGN blue-noise approximation
      tex  = this._textures.blueNoise;
      size = 64;
    }

    this._currentTexture    = tex;
    this._matrixSizeU.value = size;
    if (this._ditherSampledNode) {
      this._ditherSampledNode.value = tex;
    }
  }

  override dispose(): void {
    this._textures.bayer2.dispose();
    this._textures.bayer4.dispose();
    this._textures.bayer8.dispose();
    this._textures.blueNoise.dispose();
    super.dispose();
  }
}
