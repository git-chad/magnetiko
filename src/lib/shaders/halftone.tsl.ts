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
 * Each pixel checks its own cell plus the 8 immediate neighbours (3×3 grid)
 * and takes the maximum coverage — this lets large dots overflow their cell
 * boundary naturally.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _invertU: any;       // 0 = normal, 1 = invert luma

  // Texture nodes for the 3×3 neighbourhood cell-center samples.
  // All 9 point at the same input texture; updated each frame in render()
  // without triggering a shader recompile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _sampleNodes: any[] = [];

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
    this._invertU       = uniform(0.0);  // 0=normal 1=invert
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
    // Keep all 3×3 cell-center sample nodes pointing at the current input.
    for (const node of this._sampleNodes) {
      node.value = inputTex;
    }
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms are initialised.
    if (!this._gridSpacingU) return this._inputNode;

    // Reset sample-node registry each (re)build.
    this._sampleNodes = [];

    // Y-flipped UV — WebGPU render-target textures have V=0 at the top,
    // opposite to PlaneGeometry UVs (V=0=bottom).
    const rtUV     = vec2(uv().x, float(1.0).sub(uv().y));
    const pixCoord = rtUV.mul(screenSize); // pixel-space position

    // ── Rotation ──────────────────────────────────────────────────────────────
    const cosA = float(cos(this._angleU));
    const sinA = float(sin(this._angleU));

    // Forward rotation — screen space → rotated grid space:
    const rotX = float(cosA.mul(pixCoord.x).add(sinA.mul(pixCoord.y)));
    const rotY = float(cosA.mul(pixCoord.y).sub(sinA.mul(pixCoord.x)));

    // ── Current cell center (in rotated grid space) ───────────────────────────
    const ccrX = float(
      floor(float(rotX.div(this._gridSpacingU)).add(float(0.5)))
        .mul(this._gridSpacingU),
    );
    const ccrY = float(
      floor(float(rotY.div(this._gridSpacingU)).add(float(0.5)))
        .mul(this._gridSpacingU),
    );

    // ── Anti-aliasing width ───────────────────────────────────────────────────
    const aa = float(
      max(float(0.5), float(this._softnessU.mul(this._gridSpacingU)).mul(float(0.3))),
    );

    // ── 3×3 neighbourhood fold (pure functional — no mutable vars / If) ────────
    // JS variables below are TSL node references, not runtime values.
    // Each iteration wraps the previous result in a select/max node,
    // building a static DAG that the GPU evaluates per-pixel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let accCov:  any = float(0.0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let accR:    any = float(0.0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let accG:    any = float(0.0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let accB:    any = float(0.0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let accLuma: any = float(0.0);

    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        // Cell center in rotated space
        const cellRX = di === 0
          ? ccrX
          : float(ccrX.add(this._gridSpacingU.mul(float(di))));
        const cellRY = dj === 0
          ? ccrY
          : float(ccrY.add(this._gridSpacingU.mul(float(dj))));

        // Inverse rotation → screen-space UV of this cell's center
        const cellSX = float(cosA.mul(cellRX).sub(sinA.mul(cellRY)));
        const cellSY = float(sinA.mul(cellRX).add(cosA.mul(cellRY)));
        const cellUV = vec2(cellSX, cellSY).div(screenSize);

        // Sample input at this cell center
        const sNode = tslTexture(this._inputNode.value, cellUV);
        this._sampleNodes.push(sNode);

        // ── Luminance (Rec. 709) ──────────────────────────────────────────────
        const luma = float(sNode.r)
          .mul(float(0.2126))
          .add(float(sNode.g).mul(float(0.7152)))
          .add(float(sNode.b).mul(float(0.0722)));
        const clampedLuma = float(
          min(max(float(luma.mul(this._contrastU)), float(0.0)), float(1.0)),
        );

        // Optional luma inversion: dark areas → large dots, light → small
        const effectiveLuma = select(
          this._invertU.greaterThan(float(0.5)),
          float(1.0).sub(clampedLuma),
          clampedLuma,
        );

        // ── Dot radius ────────────────────────────────────────────────────────
        const radius = float(float(this._dotMinU).add(effectiveLuma.mul(this._dotSizeU)));

        // ── Distance from this pixel to this cell's dot center (rotated space)
        const dx = float(rotX.sub(cellRX));
        const dy = float(rotY.sub(cellRY));

        const dCircle  = length(vec2(dx, dy));
        const dSquare  = max(abs(dx), abs(dy));
        const dDiamond = abs(dx).add(abs(dy));
        const dLine    = abs(dy);

        const dist = select(
          this._shapeU.lessThan(float(0.5)),
          dCircle,
          select(
            this._shapeU.lessThan(float(1.5)),
            dSquare,
            select(
              this._shapeU.lessThan(float(2.5)),
              dDiamond,
              dLine,
            ),
          ),
        );

        const cellCov = smoothstep(radius.add(aa), radius.sub(aa), dist);

        // Fold: if this cell has higher coverage, it wins
        const isNew = cellCov.greaterThan(accCov);
        accR    = select(isNew, float(sNode.r),    accR);
        accG    = select(isNew, float(sNode.g),    accG);
        accB    = select(isNew, float(sNode.b),    accB);
        accLuma = select(isNew, effectiveLuma,      accLuma);
        accCov  = max(cellCov, accCov);
      }
    }

    // ── Typed duotone vec3 helpers ────────────────────────────────────────────
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

    // ── Dot color (derived from winning cell) ─────────────────────────────────
    const srcColor     = vec3(accR, accG, accB);
    const monoColor    = vec3(accLuma, accLuma, accLuma);
    const duotoneColor = mix(darkVec, lightVec, accLuma);

    const dotColor = select(
      this._colorModeU.lessThan(float(0.5)),
      srcColor,
      select(
        this._colorModeU.lessThan(float(1.5)),
        monoColor,
        duotoneColor,
      ),
    );

    // ── Background color (shown between dots) ─────────────────────────────────
    const bgColor = select(
      this._colorModeU.lessThan(float(0.5)),
      vec3(1.0, 1.0, 1.0),
      select(
        this._colorModeU.lessThan(float(1.5)),
        vec3(0.0, 0.0, 0.0),
        darkVec,
      ),
    );

    return vec4(mix(bgColor, dotColor, accCov), float(1.0));
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
        case "invertLuma":
          this._invertU.value = p.value === true ? 1.0 : 0.0;
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
