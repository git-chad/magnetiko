import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec4,
  float,
  uniform,
  exp,
  clamp,
  select,
  length,
  screenSize,
  texture as tslTexture,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RIPPLES   = 8;      // maximum concurrent ripple rings
const MAX_RIPPLE_AGE = 3.0;   // seconds before a ring fully fades out
const WAVE_SPEED    = 0.4;    // UV units/second at which rings expand
const RING_WIDTH    = 0.015;  // Gaussian half-width of each ring (UV units)

// ─────────────────────────────────────────────────────────────────────────────
// InteractivityPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interactive effects shader pass.
 *
 * Phase 7 will wire this to mouse/touch events. For now it exposes
 * setPointer() and addClick() for manual integration.
 *
 * Effects (_effectU):
 *   0 = ripple   — concentric rings expanding from each click/tap
 *   1 = trail    — fluid ink dye that follows and smears with the cursor
 *   2 = repel    — pushes the underlying texture away from the cursor
 *   3 = attract  — pulls the underlying texture toward the cursor
 *   4 = glow     — additive colour spotlight following the cursor
 *
 * Trail implementation (inspired by Pavel Dobryakov's WebGL Fluid Simulation
 * and the useFluid React hook):
 *   Each frame:
 *     1. Sample prev fluid at (uv − mouseVelocity × stretch) — advect forward
 *     2. Multiply by decay — dissipate
 *     3. Add Gaussian splat at current cursor position
 *   The resulting "dye" texture is additively composited over the source image.
 *   No pressure solver is needed — the advection-only approach gives a
 *   smooth, smeary trail that fades naturally.
 *
 * Pointer convention (setPointer / addClick):
 *   uvX, uvY in [0, 1] with (0, 0) = top-left  (standard browser coords).
 *   Internally Y is flipped to match the render-target convention.
 */
export class InteractivityPass extends PassNode {
  // ── Mouse state (set externally via setPointer) ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseXU:      any;  // RT UV: 0=left  1=right
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseYU:      any;  // RT UV: 0=top   1=bottom (flipped)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseDXU:     any;  // UV delta this frame (flipped)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseDYU:     any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseActiveU: any;  // 1 = cursor is over canvas

  // ── Effect params ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _effectU:   any;  // 0–4
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _radiusPxU: any;  // interaction radius in screen pixels
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _strengthU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _decayU:    any;  // per-frame multiplier for trail dye
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorRU:   any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorGU:   any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorBU:   any;

  // ── Ripple history (round-robin, up to MAX_RIPPLES concurrent rings) ───────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _rippleXU:   any[];  // click position X (RT UV)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _rippleYU:   any[];  // click position Y (RT UV, flipped)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _rippleAgeU: any[];  // seconds since this ring was spawned
  private _rippleSlot = 0;

  // ── Trail: simplified fluid dye (double FBO + advect+splat scene) ─────────
  private _fluidRead:  THREE.WebGLRenderTarget;
  private _fluidWrite: THREE.WebGLRenderTarget;
  private readonly _fluidCamera: THREE.OrthographicCamera;
  private readonly _fluidScene:  THREE.Scene;
  private readonly _fluidMat:    THREE.MeshBasicNodeMaterial;

  // Mutable texture nodes for the fluid pipeline:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _fluidAdvNode: any; // samples _fluidRead at advected UV (fluid update pass)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _fluidDisplayNode: any = null; // samples _fluidRead at display UV (effect node)

  // Mutable texture nodes for repel/attract — sample inputTex at displaced UV:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _repelNode:   any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _attractNode: any = null;

  // ───────────────────────────────────────────────────────────────────────────

  constructor(layerId: string) {
    super(layerId);
    // super() already called _buildEffectNode() once; the guard returned
    // _inputNode because uniforms weren't initialised yet.

    // ── Mouse ──────────────────────────────────────────────────────────────
    this._mouseXU      = uniform(0.5);
    this._mouseYU      = uniform(0.5);
    this._mouseDXU     = uniform(0.0);
    this._mouseDYU     = uniform(0.0);
    this._mouseActiveU = uniform(0.0);

    // ── Params ─────────────────────────────────────────────────────────────
    this._effectU   = uniform(0.0);
    this._radiusPxU = uniform(50.0);
    this._strengthU = uniform(0.5);
    this._decayU    = uniform(0.95);
    // Default colour #64643a → (100, 100, 58) / 255
    this._colorRU   = uniform(100 / 255);
    this._colorGU   = uniform(100 / 255);
    this._colorBU   = uniform(58  / 255);

    // ── Ripple slots ───────────────────────────────────────────────────────
    // Default positions off-screen so stale slots produce zero contribution.
    this._rippleXU   = Array.from({ length: MAX_RIPPLES }, () => uniform(-10.0));
    this._rippleYU   = Array.from({ length: MAX_RIPPLES }, () => uniform(-10.0));
    this._rippleAgeU = Array.from({ length: MAX_RIPPLES }, () => uniform(999.0));

    // ── Trail fluid FBOs ───────────────────────────────────────────────────
    this._fluidRead   = makeRT(1, 1);
    this._fluidWrite  = makeRT(1, 1);
    this._fluidCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── Fluid update TSL graph (advect + decay + splat) ────────────────────
    //
    // Inspired by Pavel Dobryakov's WebGL Fluid Simulation advection shader:
    //   coord = vUv - dt × velocity × texelSize
    //   result = dissipation × texture(source, coord)
    // Here we skip the separate velocity FBO and drive advection directly
    // from the mouse delta uniforms, producing a simpler smeary ink trail.
    //
    const frtUV: any = vec2(uv().x, float(1.0).sub(uv().y));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fuvx: any = float(frtUV.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fuvy: any = float(frtUV.y);

    // Advected UV: step backward by a multiple of mouse delta so the ink
    // stretches in the direction of travel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advUV: any = (vec2 as any)(
      fuvx.sub(this._mouseDXU.mul(float(2.0))),
      fuvy.sub(this._mouseDYU.mul(float(2.0))),
    );
    // One mutable texture node for the advection read.
    this._fluidAdvNode = tslTexture(new THREE.Texture(), advUV);

    // Decay the advected sample.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advR: any = float(this._fluidAdvNode.r).mul(this._decayU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advG: any = float(this._fluidAdvNode.g).mul(this._decayU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advB: any = float(this._fluidAdvNode.b).mul(this._decayU);

    // Gaussian splat at cursor — only when mouse is active.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fdx: any = fuvx.sub(this._mouseXU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fdy: any = fuvy.sub(this._mouseYU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fDistSq: any = fdx.mul(fdx).add(fdy.mul(fdy));
    // Radius² in UV units — compute per-fragment from pixel radius uniform.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fRadUV: any = this._radiusPxU.div(screenSize.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fRadSq: any = fRadUV.mul(fRadUV).mul(float(4.0)); // ×4 for wider splat
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const splatAmt: any = exp(fDistSq.negate().div(fRadSq))
      .mul(this._strengthU)
      .mul(this._mouseActiveU);

    // Combined: advected+decayed + fresh splat, clamped to [0, 1].
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fluidUpdate: any = vec4(
      clamp(advR.add(this._colorRU.mul(splatAmt)), float(0.0), float(1.0)),
      clamp(advG.add(this._colorGU.mul(splatAmt)), float(0.0), float(1.0)),
      clamp(advB.add(this._colorBU.mul(splatAmt)), float(0.0), float(1.0)),
      float(1.0),
    );

    this._fluidMat = new THREE.MeshBasicNodeMaterial();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._fluidMat.colorNode = fluidUpdate as any;
    this._fluidMat.needsUpdate = true;

    const fMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._fluidMat);
    fMesh.frustumCulled = false;
    this._fluidScene = new THREE.Scene();
    this._fluidScene.add(fMesh);

    // ── Build display effect node & finalise ───────────────────────────────
    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  // ── Public pointer API ─────────────────────────────────────────────────────

  /**
   * Update the cursor state. Call once per frame (or on every move event).
   *
   * @param uvX     X in normalised [0,1] — 0 = left edge
   * @param uvY     Y in normalised [0,1] — 0 = top  edge (browser coords)
   * @param duvX    X delta since last call (UV units)
   * @param duvY    Y delta since last call (UV units, top-positive)
   * @param isActive  true while the cursor is over the canvas
   */
  setPointer(
    uvX: number,
    uvY: number,
    duvX: number,
    duvY: number,
    isActive: boolean,
  ): void {
    this._mouseXU.value      = uvX;
    this._mouseYU.value      = 1.0 - uvY; // flip to RT convention
    this._mouseDXU.value     = duvX;
    this._mouseDYU.value     = -duvY;      // flip Y delta
    this._mouseActiveU.value = isActive ? 1.0 : 0.0;
  }

  /**
   * Spawn a new ripple ring at the given UV position.
   * @param uvX  [0, 1], 0 = left
   * @param uvY  [0, 1], 0 = top
   */
  addClick(uvX: number, uvY: number): void {
    const s = this._rippleSlot;
    this._rippleXU[s].value   = uvX;
    this._rippleYU[s].value   = 1.0 - uvY; // flip
    this._rippleAgeU[s].value = 0.0;
    this._rippleSlot = (s + 1) % MAX_RIPPLES;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    // Age all active ripple rings.
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const age = this._rippleAgeU[i].value as number;
      if (age < MAX_RIPPLE_AGE) {
        this._rippleAgeU[i].value = age + delta;
      }
    }

    // ── Fluid trail: one advect+decay+splat step ──────────────────────────
    // Bind the previous frame's fluid as input, render into the write target.
    this._fluidAdvNode.value = this._fluidRead.texture;
    renderer.setRenderTarget(this._fluidWrite);
    renderer.render(this._fluidScene, this._fluidCamera);
    // Swap double-FBO (same pattern as useFluid's density.swap()).
    [this._fluidRead, this._fluidWrite] = [this._fluidWrite, this._fluidRead];

    // Update display-pass texture nodes to the freshly written fluid frame.
    if (this._fluidDisplayNode) {
      this._fluidDisplayNode.value = this._fluidRead.texture;
    }
    // Repel/attract sample the original input texture at displaced UVs.
    if (this._repelNode)   this._repelNode.value   = inputTex;
    if (this._attractNode) this._attractNode.value = inputTex;

    // Render the effect via the base PassNode scene.
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  override resize(width: number, height: number): void {
    const w = Math.max(width,  1);
    const h = Math.max(height, 1);
    this._fluidRead.setSize(w, h);
    this._fluidWrite.setSize(w, h);
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms exist.
    if (!this._effectU) return this._inputNode;

    const rtUV: any = vec2(uv().x, float(1.0).sub(uv().y));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(rtUV.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(rtUV.y);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src: any = this._inputNode;

    // Radius in UV units (used by repel, attract, glow).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radUV: any = this._radiusPxU.div(screenSize.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radSq: any = radUV.mul(radUV);

    // Mouse distance² (shared by repel, attract, glow).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdx: any = uvx.sub(this._mouseXU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdy: any = uvy.sub(this._mouseYU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mDistSq: any = mdx.mul(mdx).add(mdy.mul(mdy));
    // Small epsilon guards division at cursor origin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mDist: any = float(length((vec2 as any)(mdx, mdy))).add(float(1e-5));
    // Gaussian falloff: 1 at cursor, 0 far away.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mGauss: any = exp(mDistSq.negate().div(radSq));

    // ── 0 · Ripple ─────────────────────────────────────────────────────────
    //
    // Unrolled loop over MAX_RIPPLES slots.
    // Each slot contributes a Gaussian-profile ring that expands at WAVE_SPEED
    // and fades linearly over MAX_RIPPLE_AGE seconds.
    //
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rippleSum: any = float(0.0);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rdx: any = uvx.sub(this._rippleXU[i]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rdy: any = uvy.sub(this._rippleYU[i]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rDist: any = float(length((vec2 as any)(rdx, rdy)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const age: any  = this._rippleAgeU[i];
      // Ring radius expands with time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ringR: any = age.mul(float(WAVE_SPEED)).add(float(0.005));
      // Linear fade from 1 → 0 over the ring's lifetime.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fade: any  = clamp(float(1.0).sub(age.div(float(MAX_RIPPLE_AGE))), float(0.0), float(1.0));
      // Gaussian ring shape: peak at ringR, half-width RING_WIDTH.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delta: any = rDist.sub(ringR);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ring: any  = exp(delta.negate().mul(delta).div(float(RING_WIDTH * RING_WIDTH)));
      rippleSum = rippleSum.add(ring.mul(fade));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rippleIntensity: any = clamp(rippleSum, float(0.0), float(1.0)).mul(this._strengthU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rippleResult: any = vec4(
      clamp(float(src.r).add(this._colorRU.mul(rippleIntensity)), float(0.0), float(1.0)),
      clamp(float(src.g).add(this._colorGU.mul(rippleIntensity)), float(0.0), float(1.0)),
      clamp(float(src.b).add(this._colorBU.mul(rippleIntensity)), float(0.0), float(1.0)),
      float(1.0),
    );

    // ── 1 · Trail ──────────────────────────────────────────────────────────
    //
    // The fluid dye texture (_fluidDisplayNode) is updated in render() before
    // the base PassNode renders this scene. Its RGB encodes accumulated ink.
    //
    this._fluidDisplayNode = tslTexture(new THREE.Texture(), rtUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fluid: any = this._fluidDisplayNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trailResult: any = vec4(
      clamp(float(src.r).add(float(fluid.r)), float(0.0), float(1.0)),
      clamp(float(src.g).add(float(fluid.g)), float(0.0), float(1.0)),
      clamp(float(src.b).add(float(fluid.b)), float(0.0), float(1.0)),
      float(1.0),
    );

    // ── 2 · Repel ──────────────────────────────────────────────────────────
    //
    // Each pixel's UV is nudged away from the cursor proportional to mGauss.
    // The repel node samples inputTex at the displaced UV (updated in render).
    //
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repelForce: any = mGauss.mul(radUV).mul(this._strengthU).mul(this._mouseActiveU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repelUV: any = (vec2 as any)(
      uvx.add(mdx.div(mDist).mul(repelForce)),
      uvy.add(mdy.div(mDist).mul(repelForce)),
    );
    this._repelNode = tslTexture(new THREE.Texture(), repelUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repelResult: any = vec4(
      float(this._repelNode.r), float(this._repelNode.g),
      float(this._repelNode.b), float(1.0),
    );

    // ── 3 · Attract ────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attractUV: any = (vec2 as any)(
      uvx.sub(mdx.div(mDist).mul(repelForce)),
      uvy.sub(mdy.div(mDist).mul(repelForce)),
    );
    this._attractNode = tslTexture(new THREE.Texture(), attractUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attractResult: any = vec4(
      float(this._attractNode.r), float(this._attractNode.g),
      float(this._attractNode.b), float(1.0),
    );

    // ── 4 · Glow ───────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const glowVal: any = mGauss.mul(this._strengthU).mul(this._mouseActiveU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const glowResult: any = vec4(
      clamp(float(src.r).add(this._colorRU.mul(glowVal)), float(0.0), float(1.0)),
      clamp(float(src.g).add(this._colorGU.mul(glowVal)), float(0.0), float(1.0)),
      clamp(float(src.b).add(this._colorBU.mul(glowVal)), float(0.0), float(1.0)),
      float(1.0),
    );

    // ── Select by effect mode ──────────────────────────────────────────────
    return select(
      this._effectU.lessThan(float(0.5)), rippleResult,
      select(this._effectU.lessThan(float(1.5)), trailResult,
      select(this._effectU.lessThan(float(2.5)), repelResult,
      select(this._effectU.lessThan(float(3.5)), attractResult,
      glowResult))),
    );
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "effect": {
          const map: Record<string, number> = {
            ripple: 0, trail: 1, repel: 2, attract: 3, glow: 4,
          };
          this._effectU.value = map[p.value as string] ?? 0;
          break;
        }
        case "radius":
          this._radiusPxU.value = typeof p.value === "number" ? p.value : 50;
          break;
        case "strength":
          this._strengthU.value = typeof p.value === "number" ? p.value : 0.5;
          break;
        case "decay":
          this._decayU.value = typeof p.value === "number" ? p.value : 0.95;
          break;
        case "trailLength": {
          // Map trail-length (5–50) to a decay value (0.80–0.98).
          // trailLength=20 → 1 − 1/(20×1.5) ≈ 0.967, matching the default decay.
          const n = typeof p.value === "number" ? p.value : 20;
          this._decayU.value = 1.0 - 1.0 / (n * 1.5);
          break;
        }
        case "color":
          parseCSSColor(p.value as string, this._colorRU, this._colorGU, this._colorBU);
          break;
      }
    }
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  override dispose(): void {
    this._fluidRead.dispose();
    this._fluidWrite.dispose();
    this._fluidMat.dispose();
    super.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRT(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(w, 1), Math.max(h, 1), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCSSColor(css: string, rU: any, gU: any, bU: any): void {
  const m = css.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  if (m) {
    rU.value = parseFloat(m[1]) / 255;
    gU.value = parseFloat(m[2]) / 255;
    bU.value = parseFloat(m[3]) / 255;
    return;
  }
  const c = new THREE.Color();
  try { c.setStyle(css); } catch { /* ignore */ }
  rU.value = c.r;
  gU.value = c.g;
  bU.value = c.b;
}
