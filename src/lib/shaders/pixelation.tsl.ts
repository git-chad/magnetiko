import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  float,
  uniform,
  floor,
  fract,
  length,
  smoothstep,
  mix,
  select,
  screenSize,
  texture as tslTexture,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// PixelationPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pixelation filter pass.
 *
 * Floors the input UV to a cell grid and samples the texture once at each
 * cell center, producing a blocky pixel effect.
 *
 * Shape variants (uniform _shapeU):
 *   0 = square  — full cell filled with the cell-center color
 *   1 = circle  — circular dot; original input shows outside the dot
 *   2 = diamond — diamond dot; original input shows outside the dot
 *
 * Anti-aliasing at cell edges via smoothstep.
 */
export class PixelationPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _cellSizeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _viewportScaleU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _preserveAspectU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _shapeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _pixelatedNode: any;

  constructor(layerId: string) {
    super(layerId);

    // Note: super() already called _buildEffectNode() once, but the guard
    // below returned the passthrough _inputNode because these uniforms didn't
    // exist yet.  Now they do — rebuild the real effect.
    this._cellSizeU = uniform(8.0);
    this._viewportScaleU = uniform(1.0);
    this._preserveAspectU = uniform(1.0);
    this._shapeU = uniform(0.0);

    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    // Keep the cell-center sample node pointing at the current input texture
    if (this._pixelatedNode) this._pixelatedNode.value = inputTex;
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms are initialised
    if (!this._cellSizeU || !this._viewportScaleU) return this._inputNode;

    // Y-flipped UV — WebGPU render-target textures have V=0 at the top,
    // which is opposite to PlaneGeometry UVs (V=0=bottom).
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));

    // ── Grid ────────────────────────────────────────────────────────────────
    // cellCoord: position in "cell units" (integer part = which cell;
    // fractional part = position within cell).
    // Each cell is cellSize × cellSize screen pixels (preserveAspect=true).
    const virtualScreen = screenSize.div(this._viewportScaleU);
    const cellCoord = rtUV.mul(virtualScreen).div(this._cellSizeU);

    // UV of this cell's center (used to sample the pixelated color)
    const cellCenterUV = floor(cellCoord)
      .add(float(0.5))
      .mul(this._cellSizeU)
      .div(virtualScreen);

    // Sample input texture at cell center.
    // _pixelatedNode.value is updated every frame in render() to match the
    // current input texture without triggering a shader recompile.
    this._pixelatedNode = tslTexture(this._inputNode.value, cellCenterUV);

    // ── Shape mask ──────────────────────────────────────────────────────────
    // fractPos: position within the current cell, centred at (0,0).
    // Range [-0.5, 0.5]² in cell units (= square in screen-pixel space).
    const fractPos = fract(cellCoord).sub(float(0.5));

    // Normalised distances: 1.0 = cell boundary
    const circleD = length(fractPos).mul(float(2.0));
    const diamondD = fractPos.x.abs().add(fractPos.y.abs()).mul(float(2.0));

    // Anti-aliased masks: 1 inside shape, 0 outside
    const aa = float(0.08);
    const circleMask = smoothstep(
      float(1.0).add(aa),
      float(1.0).sub(aa),
      circleD,
    );
    const diamondMask = smoothstep(
      float(1.0).add(aa),
      float(1.0).sub(aa),
      diamondD,
    );

    const pixColor = this._pixelatedNode;

    // square:  entire cell filled with the cell-center color
    const squareOut = pixColor;
    // circle / diamond:  pixelated color inside shape, original input outside
    const circleOut = mix(this._inputNode, pixColor, circleMask);
    const diamondOut = mix(this._inputNode, pixColor, diamondMask);

    // Select output by shape uniform
    return select(
      this._shapeU.lessThan(float(0.5)),
      squareOut,
      select(this._shapeU.lessThan(float(1.5)), circleOut, diamondOut),
    );
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "cellSize":
          this._cellSizeU.value = typeof p.value === "number" ? p.value : 8;
          break;
        case "preserveAspect":
          this._preserveAspectU.value = p.value === true ? 1.0 : 0.0;
          break;
        case "shape": {
          const shapeMap: Record<string, number> = {
            square: 0,
            circle: 1,
            diamond: 2,
          };
          this._shapeU.value = shapeMap[p.value as string] ?? 0;
          break;
        }
      }
    }
  }

  override updateViewportScale(scale: number): void {
    this._viewportScaleU.value =
      Number.isFinite(scale) && scale > 0 ? scale : 1.0;
  }
}
