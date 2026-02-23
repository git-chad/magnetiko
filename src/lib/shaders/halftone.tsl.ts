import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  floor,
  length,
  smoothstep,
  mix,
  select,
  screenSize,
  texture as tslTexture,
  sin,
  cos,
  abs,
  max,
  min,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// HalftonePass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Halftone filter pass.
 *
 * Divides the screen into a rotatable grid of cells, samples the input
 * texture once at each cell center, then renders a shaped dot whose radius
 * is proportional to the cell's luminance (bright → large dot).
 *
 * Shape variants (_shapeU):
 *   0 = circle   — smooth circular dot (default)
 *   1 = square   — axis-aligned square dot
 *   2 = diamond  — 45°-rotated square (Manhattan distance)
 *   3 = line     — horizontal band (in rotated grid space)
 *
 * Color modes (_colorModeU):
 *   0 = source    — dot inherits the cell-center color; input shows between dots
 *   1 = monochrome — grayscale dot on black background
 *   2 = duotone   — interpolates between _duotoneDarkU and _duotoneLightU
 */
export class HalftonePass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _gridSpacingU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _dotSizeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _shapeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _angleU: any; // radians
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorModeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _contrastU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _dotMinU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _softnessU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _duotoneLightU: any; // vec3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _duotoneDarkU: any;  // vec3

  // Mutable texture node for the cell-center sample — updated each frame
  // in render() without triggering a shader recompile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _sampledNode: any;

  constructor(layerId: string) {
    super(layerId);

    // Note: super() already called _buildEffectNode() once, but the guard
    // returned the passthrough _inputNode because these uniforms didn't exist
    // yet.  Initialise them now, then rebuild the real effect.
    const lightCol = new THREE.Color("#F5F5F0");
    const darkCol  = new THREE.Color("#1d1d1c");

    this._gridSpacingU  = uniform(20.0);
    this._dotSizeU      = uniform(8.0);
    this._dotMinU       = uniform(2.0);
    this._shapeU        = uniform(0.0);  // 0=circle 1=square 2=diamond 3=line
    this._angleU        = uniform((45.0 * Math.PI) / 180.0);
    this._colorModeU    = uniform(1.0);  // 0=source 1=mono 2=duotone
    this._contrastU     = uniform(1.0);
    this._softnessU     = uniform(0.1);
    this._duotoneLightU = uniform(
      new THREE.Vector3(lightCol.r, lightCol.g, lightCol.b),
    );
    this._duotoneDarkU  = uniform(
      new THREE.Vector3(darkCol.r, darkCol.g, darkCol.b),
    );

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
    // Keep the cell-center sample node pointing at the current input texture.
    if (this._sampledNode) this._sampledNode.value = inputTex;
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms are initialised.
    if (!this._gridSpacingU) return this._inputNode;

    // Y-flipped UV — WebGPU render-target textures have V=0 at the top,
    // opposite to PlaneGeometry UVs (V=0=bottom).
    const rtUV     = vec2(uv().x, float(1.0).sub(uv().y));
    const pixCoord = rtUV.mul(screenSize); // pixel-space position

    // ── Rotation ──────────────────────────────────────────────────────────────
    // Rotating the grid by angle A is equivalent to rotating the coordinate
    // system by A and placing an axis-aligned grid in that space.
    // Wrap in float() so TypeScript knows these are Node<"float"> despite the
    // uniform being typed as `any`.
    const cosA = float(cos(this._angleU));
    const sinA = float(sin(this._angleU));

    // Forward rotation — screen space → rotated grid space:
    //   rotX =  cos·px + sin·py
    //   rotY = -sin·px + cos·py   (= cos·py − sin·px)
    const rotX = float(cosA.mul(pixCoord.x).add(sinA.mul(pixCoord.y)));
    const rotY = float(cosA.mul(pixCoord.y).sub(sinA.mul(pixCoord.x)));

    // ── Grid cell ─────────────────────────────────────────────────────────────
    // Cell center in rotated space (nearest grid vertex).
    const ccrX = float(
      floor(float(rotX.div(this._gridSpacingU)).add(float(0.5)))
        .mul(this._gridSpacingU),
    );
    const ccrY = float(
      floor(float(rotY.div(this._gridSpacingU)).add(float(0.5)))
        .mul(this._gridSpacingU),
    );

    // Inverse rotation — rotated grid space → screen space:
    //   px = cos·rotX − sin·rotY
    //   py = sin·rotX + cos·rotY
    const ccSX = float(cosA.mul(ccrX).sub(sinA.mul(ccrY)));
    const ccSY = float(sinA.mul(ccrX).add(cosA.mul(ccrY)));

    // UV of this cell's center in the render target.
    const cellCenterUV = vec2(ccSX, ccSY).div(screenSize);

    // ── Sample input at cell center ───────────────────────────────────────────
    // _sampledNode.value is updated every frame in render() to track the
    // current input texture without triggering a shader recompile.
    this._sampledNode = tslTexture(this._inputNode.value, cellCenterUV);
    const sampledColor = this._sampledNode;

    // ── Luminance (Rec. 709) ──────────────────────────────────────────────────
    // Manual channel weighting + float() wrappers to keep TypeScript types
    // as Node<"float"> throughout (avoids any → Node<"vec3"> mis-inference).
    const luma = float(sampledColor.r)
      .mul(float(0.2126))
      .add(float(sampledColor.g).mul(float(0.7152)))
      .add(float(sampledColor.b).mul(float(0.0722)));
    const adjustedLuma = float(
      min(max(float(luma.mul(this._contrastU)), float(0.0)), float(1.0)),
    );

    // ── Dot radius in pixels ──────────────────────────────────────────────────
    // radius = minRadius + luma * dotSize
    // dotMin keeps dots visible in dark areas (matches reference's minDot param).
    const radius = float(float(this._dotMinU).add(adjustedLuma.mul(this._dotSizeU)));

    // ── Distance from this pixel to the dot center (in rotated space) ─────────
    // Rotation preserves distances, so grid-space distance = screen-space
    // distance.  Working in grid space keeps the shapes axis-aligned.
    const dx = float(rotX.sub(ccrX));
    const dy = float(rotY.sub(ccrY));

    const dCircle  = length(vec2(dx, dy));
    const dSquare  = max(abs(dx), abs(dy));
    const dDiamond = abs(dx).add(abs(dy)); // Manhattan; boundary at radius
    const dLine    = abs(dy);              // horizontal bands in grid space

    // ── Anti-aliasing width ───────────────────────────────────────────────────
    // Scale with cell size so softness=1 gives ~30% of a cell worth of blur.
    const aa = float(
      max(float(0.5), float(this._softnessU.mul(this._gridSpacingU)).mul(float(0.3))),
    );

    // ── Shape masks (1 inside dot, 0 outside) ─────────────────────────────────
    const mCircle  = smoothstep(radius.add(aa), radius.sub(aa), dCircle);
    const mSquare  = smoothstep(radius.add(aa), radius.sub(aa), dSquare);
    const mDiamond = smoothstep(radius.add(aa), radius.sub(aa), dDiamond);
    const mLine    = smoothstep(radius.add(aa), radius.sub(aa), dLine);

    const mask = select(
      this._shapeU.lessThan(float(0.5)),
      mCircle,
      select(
        this._shapeU.lessThan(float(1.5)),
        mSquare,
        select(
          this._shapeU.lessThan(float(2.5)),
          mDiamond,
          mLine,
        ),
      ),
    );

    // ── Typed duotone vec3 helpers ────────────────────────────────────────────
    // Reconstruct vec3 nodes from component accessors so TypeScript sees
    // Node<"vec3"> rather than inferring any uniform node as Node<"float">.
    const darkVec = vec3(
      float(this._duotoneDarkU.x),
      float(this._duotoneDarkU.y),
      float(this._duotoneDarkU.z),
    );
    const lightVec = vec3(
      float(this._duotoneLightU.x),
      float(this._duotoneLightU.y),
      float(this._duotoneLightU.z),
    );
    // ── Dot color ─────────────────────────────────────────────────────────────
    const srcColor     = vec3(float(sampledColor.r), float(sampledColor.g), float(sampledColor.b));
    const monoColor    = vec3(adjustedLuma, adjustedLuma, adjustedLuma);
    const duotoneColor = mix(darkVec, lightVec, adjustedLuma);

    const dotColor = select(
      this._colorModeU.lessThan(float(0.5)),
      srcColor,          // source: cell-center color
      select(
        this._colorModeU.lessThan(float(1.5)),
        monoColor,         // monochrome: grayscale
        duotoneColor,      // duotone: interpolated between two tones
      ),
    );

    // ── Background color (shown between dots) ─────────────────────────────────
    // source  → white, so colored dots are always clearly visible (ref. pattern)
    // mono    → black
    // duotone → dark tone
    const bgColor = select(
      this._colorModeU.lessThan(float(0.5)),
      vec3(1.0, 1.0, 1.0),
      select(
        this._colorModeU.lessThan(float(1.5)),
        vec3(0.0, 0.0, 0.0),
        darkVec,
      ),
    );

    // Return vec4 (alpha = 1) — matches pixelation's output type and ensures
    // buildBlendNode's blend.rgb accessor works correctly.
    return vec4(mix(bgColor, dotColor, mask), float(1.0));
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "gridSpacing":
          this._gridSpacingU.value = typeof p.value === "number" ? p.value : 8;
          break;
        case "dotSize":
          this._dotSizeU.value = typeof p.value === "number" ? p.value : 8;
          break;
        case "dotMin":
          this._dotMinU.value = typeof p.value === "number" ? p.value : 2;
          break;
        case "shape": {
          const shapeMap: Record<string, number> = {
            circle: 0, square: 1, diamond: 2, line: 3,
          };
          this._shapeU.value = shapeMap[p.value as string] ?? 0;
          break;
        }
        case "angle":
          this._angleU.value =
            typeof p.value === "number" ? (p.value * Math.PI) / 180.0 : 0.0;
          break;
        case "colorMode": {
          const modeMap: Record<string, number> = {
            source: 0, monochrome: 1, duotone: 2,
          };
          this._colorModeU.value = modeMap[p.value as string] ?? 0;
          break;
        }
        case "contrast":
          this._contrastU.value = typeof p.value === "number" ? p.value : 1.0;
          break;
        case "softness":
          this._softnessU.value = typeof p.value === "number" ? p.value : 0.1;
          break;
        case "duotoneLight": {
          const col = new THREE.Color(p.value as string);
          (this._duotoneLightU.value as THREE.Vector3).set(col.r, col.g, col.b);
          break;
        }
        case "duotoneDark": {
          const col = new THREE.Color(p.value as string);
          (this._duotoneDarkU.value as THREE.Vector3).set(col.r, col.g, col.b);
          break;
        }
      }
    }
  }
}
