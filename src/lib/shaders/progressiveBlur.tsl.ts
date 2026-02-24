import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec4,
  float,
  uniform,
  clamp,
  select,
  screenSize,
  length,
  texture as tslTexture,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import { sharedRenderTargetPool } from "@/lib/renderer/RenderTargetPool";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-normalised 9-tap Gaussian weights (σ ≈ 1.5). Sum = 1. */
const WEIGHTS = [0.0076, 0.0361, 0.1096, 0.2135, 0.2666, 0.2135, 0.1096, 0.0361, 0.0076];
const OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const PROGRESSIVE_BLUR_RT_OPTIONS = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: false,
  stencilBuffer: false,
  generateMipmaps: false,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ProgressiveBlurPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Progressive blur filter pass.
 *
 * Applies a two-pass separable Gaussian blur whose radius varies per pixel
 * based on a spatial gradient. The gradient can follow six direction modes:
 *
 *   Direction (_directionU):
 *     0 = top-to-bottom  — blur increases toward the bottom edge
 *     1 = bottom-to-top  — blur increases toward the top edge
 *     2 = left-to-right  — blur increases toward the right edge
 *     3 = right-to-left  — blur increases toward the left edge
 *     4 = center-out     — blur increases with distance from focusPoint;
 *                          pixels within focusSize radius are sharp
 *     5 = radial         — same as center-out (circular focus region)
 *
 * Falloff curves (_falloffU):
 *     0 = linear         — t unchanged
 *     1 = ease-in        — t² (gradual start)
 *     2 = ease-out       — 2t − t² (gradual finish)
 *     3 = ease-in-out    — 3t² − 2t³ (smooth both ends)
 *
 * Per-pixel blur radius = mix(startStrength, endStrength, falloff(t)).
 * Setting startStrength = 0 creates a sharp-to-blurred tilt-shift.
 *
 * Implementation:
 *   Pass 1 (H) — 9-tap Gaussian along X: inputTex        → _blurHRT
 *   Pass 2 (V) — 9-tap Gaussian along Y: _blurHRT.texture → outputTarget
 * Both passes scale each tap's step size by the per-pixel radius.
 */
export class ProgressiveBlurPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _directionU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _startStrU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _endStrU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _falloffU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _focusXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _focusYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _focusSizeU: any;

  // ── H-pass internals ───────────────────────────────────────────────────────
  private _blurHRT: THREE.WebGLRenderTarget;
  private readonly _blurHScene: THREE.Scene;
  private readonly _blurHMat: THREE.MeshBasicNodeMaterial;
  private readonly _blurHCamera: THREE.OrthographicCamera;

  // 9 mutable texture nodes for H-pass taps (updated to inputTex each frame).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _hTapNodes: any[];

  // 9 mutable texture nodes for V-pass taps (updated to _blurHRT.texture each frame).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _vTapNodes: any[] = [];

  constructor(layerId: string) {
    super(layerId);
    // super() has already called _buildEffectNode() once; the guard inside
    // returned the passthrough _inputNode because uniforms didn't exist yet.

    this._directionU  = uniform(0.0);   // 0 = top-to-bottom
    this._startStrU   = uniform(0.0);   // pixels/tap at the "sharp" end
    this._endStrU     = uniform(8.0);   // pixels/tap at the "blurred" end
    this._falloffU    = uniform(3.0);   // 3 = ease-in-out
    this._focusXU     = uniform(0.5);
    this._focusYU     = uniform(0.5);
    this._focusSizeU  = uniform(0.3);   // normalised UV radius of sharp zone

    // ── H-pass render target ───────────────────────────────────────────────
    this._blurHRT = sharedRenderTargetPool.acquire(1, 1, PROGRESSIVE_BLUR_RT_OPTIONS);
    this._blurHCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── H-pass TSL graph ───────────────────────────────────────────────────
    // Sample inputTex with 9 horizontally-offset taps; step ∝ per-pixel radius.
    const { uvx: huvx, uvy: huvy, blurRadius: hRadius } = this._buildGradientNodes();
    const hStepX = hRadius.div(screenSize.x);
    this._hTapNodes = OFFSETS.map((off) =>
      tslTexture(new THREE.Texture(), vec2(huvx.add(float(off).mul(hStepX)), huvy)),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hAcc: any = vec4(0, 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      hAcc = hAcc.add(this._hTapNodes[i].mul(float(WEIGHTS[i])));
    }
    this._blurHMat = new THREE.MeshBasicNodeMaterial();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._blurHMat.colorNode = hAcc as any;
    this._blurHMat.needsUpdate = true;
    const hMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._blurHMat);
    hMesh.frustumCulled = false;
    this._blurHScene = new THREE.Scene();
    this._blurHScene.add(hMesh);

    // ── V-pass TSL graph (via _buildEffectNode) ────────────────────────────
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
    // 1. H pass: blur horizontally from inputTex → _blurHRT.
    for (const s of this._hTapNodes) s.value = inputTex;
    renderer.setRenderTarget(this._blurHRT);
    renderer.render(this._blurHScene, this._blurHCamera);

    // 2. V pass: blur vertically from _blurHRT → outputTarget.
    //    _vTapNodes sample the H result; _inputNode (set by super.render) keeps
    //    the original inputTex for blend-mode compositing.
    for (const s of this._vTapNodes) s.value = this._blurHRT.texture;
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Effect node (V-pass) ───────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms exist.
    if (!this._directionU) return this._inputNode;

    const { uvx, uvy, blurRadius } = this._buildGradientNodes();
    const stepY = blurRadius.div(screenSize.y);

    this._vTapNodes = OFFSETS.map((off) =>
      tslTexture(new THREE.Texture(), vec2(uvx, uvy.add(float(off).mul(stepY)))),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let acc: any = vec4(0, 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      acc = acc.add(this._vTapNodes[i].mul(float(WEIGHTS[i])));
    }

    return vec4(float(acc.r), float(acc.g), float(acc.b), float(1.0));
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  override resize(width: number, height: number): void {
    this._blurHRT.setSize(Math.max(width, 1), Math.max(height, 1));
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "direction": {
          const map: Record<string, number> = {
            "top-to-bottom": 0,
            "bottom-to-top": 1,
            "left-to-right": 2,
            "right-to-left": 3,
            "center-out":    4,
            "radial":        5,
          };
          this._directionU.value = map[p.value as string] ?? 0;
          break;
        }
        case "startStrength":
          this._startStrU.value = typeof p.value === "number" ? p.value : 0;
          break;
        case "endStrength":
          this._endStrU.value = typeof p.value === "number" ? p.value : 8;
          break;
        case "falloff": {
          const map: Record<string, number> = {
            "linear":      0,
            "ease-in":     1,
            "ease-out":    2,
            "ease-in-out": 3,
          };
          this._falloffU.value = map[p.value as string] ?? 3;
          break;
        }
        case "focusPoint": {
          const [x, y] = p.value as number[];
          this._focusXU.value = x;
          this._focusYU.value = y;
          break;
        }
        case "focusSize":
          this._focusSizeU.value = typeof p.value === "number" ? p.value : 0.3;
          break;
      }
    }
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  override dispose(): void {
    sharedRenderTargetPool.release(this._blurHRT);
    this._blurHMat.dispose();
    super.dispose();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build TSL nodes for the per-pixel blur radius at the current UV.
   * Called twice — once for the H-pass material, once for the V-pass — so
   * each shader program gets its own independent node graph.
   *
   * Returns { uvx, uvy, blurRadius } where blurRadius is in screen pixels.
   */
  private _buildGradientNodes(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uvx: any; uvy: any; blurRadius: any;
  } {
    // Y-flipped UV (render-target convention: V=0=top in WebGPU).
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(rtUV.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(rtUV.y);

    // Distance from the focus point (used for center-out / radial modes).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dx: any = uvx.sub(this._focusXU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dy: any = uvy.sub(this._focusYU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dist: any = float(length(vec2(dx, dy)));

    // ── Raw gradient t ─────────────────────────────────────────────────────
    // Linear modes: t = position along the chosen axis [0, 1].
    // center-out / radial: t = 0 within focusSize, rises to 1 beyond it.
    const t_ttb = uvy;                             // top   → bottom
    const t_btt = float(1.0).sub(uvy);            // bottom → top
    const t_ltr = uvx;                             // left  → right
    const t_rtl = float(1.0).sub(uvx);            // right → left

    // Map distance so focusSize → 0, far edge (dist=1) → 1.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t_center: any = clamp(
      dist.sub(this._focusSizeU).div(
        float(1.0).sub(this._focusSizeU).add(float(1e-5)),
      ),
      float(0.0),
      float(1.0),
    );

    // Select t by direction (0–5; 4 and 5 both map to center-out).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t_raw: any = select(
      this._directionU.lessThan(float(0.5)), t_ttb,
      select(this._directionU.lessThan(float(1.5)), t_btt,
      select(this._directionU.lessThan(float(2.5)), t_ltr,
      select(this._directionU.lessThan(float(3.5)), t_rtl, t_center))),
    );

    // ── Falloff curves ─────────────────────────────────────────────────────
    const t_lin       = t_raw;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t_easeIn:  any = t_raw.mul(t_raw);                              // t²
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t_easeOut: any = t_raw.mul(float(2.0)).sub(t_raw.mul(t_raw)); // 2t − t²
    // 3t² − 2t³  (smoothstep)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t_easeIO:  any = t_raw.mul(t_raw).mul(float(3.0).sub(t_raw.mul(float(2.0))));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t: any = select(
      this._falloffU.lessThan(float(0.5)), t_lin,
      select(this._falloffU.lessThan(float(1.5)), t_easeIn,
      select(this._falloffU.lessThan(float(2.5)), t_easeOut, t_easeIO)),
    );

    // ── Per-pixel blur radius (screen pixels) ──────────────────────────────
    // radius = startStr + (endStr - startStr) * t  (same as mix without the
    // type-inference headache of the TSL mix() overload).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blurRadius: any = this._startStrU.add(
      this._endStrU.sub(this._startStrU).mul(t),
    );

    return { uvx, uvy, blurRadius };
  }
}
