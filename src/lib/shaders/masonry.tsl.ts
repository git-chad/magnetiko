import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec4,
  float,
  uniform,
  floor,
  mix,
  texture as tslTexture,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum total cells (32×32). DataTextures are pre-allocated at this size. */
const MAX_CELLS = 1024;

// ─────────────────────────────────────────────────────────────────────────────
// MasonryPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Masonry filter pass.
 *
 * Divides the input frame into a rectangular grid of cells and scrambles their
 * order — like a puzzle being mixed up.  Cells auto-reshuffle at a configurable
 * interval with a smooth slide animation.
 *
 * GPU side:
 *   Each pixel looks up its cell index in a 1-D DataTexture (the permutation
 *   map) to find which source cell it should display.  Two permutation maps
 *   (prev and cur) are kept in sync with a _progressU uniform so the GPU can
 *   linearly interpolate between them, producing the "tiles slide to new
 *   positions" animation.
 *
 * CPU side:
 *   Fisher-Yates shuffle generates a new permutation.  _triggerReshuffle()
 *   copies cur → prev in-place, fills cur with the new shuffle, and resets the
 *   animation progress to 0.  render() advances the progress each frame.
 */
export class MasonryPass extends PassNode {
  // ── TSL uniforms ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _gridWU: any;     // float: horizontal cell count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _gridHU: any;     // float: vertical cell count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _progressU: any;  // float: animation progress 0→1

  // ── DataTextures (pre-allocated at MAX_CELLS) ─────────────────────────────
  private readonly _permDataCur:  Float32Array;
  private readonly _permDataPrev: Float32Array;
  private readonly _permTexCur:   THREE.DataTexture;
  private readonly _permTexPrev:  THREE.DataTexture;

  // ── Mutable TSL texture nodes — .value swapped each frame / reshuffle ─────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _inputSamplerNode: any;  // samples inputTex at remapped UV
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _permTexCurNode:  any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _permTexPrevNode: any;

  // ── CPU animation state ───────────────────────────────────────────────────
  private _elapsed:            number  = 0;
  private _animating:          boolean = false;
  private _animProgress:       number  = 1.0;
  private _reshuffleInterval:  number  = 1.0;  // seconds; 0 = off
  private _animDuration:       number  = 0.4;  // seconds; 0 = snap
  private _gridW:              number  = 4;
  private _gridH:              number  = 4;

  constructor(layerId: string) {
    super(layerId);
    // super() already called _buildEffectNode() once; the guard returned
    // _inputNode because these uniforms didn't exist yet.

    // ── Uniforms ──────────────────────────────────────────────────────────
    this._gridWU    = uniform(4.0);
    this._gridHU    = uniform(4.0);
    this._progressU = uniform(1.0);

    // ── DataTextures (RGBA float, 1024×1 — R channel = cell index) ────────
    this._permDataCur  = new Float32Array(MAX_CELLS * 4);
    this._permDataPrev = new Float32Array(MAX_CELLS * 4);

    this._permTexCur = new THREE.DataTexture(
      this._permDataCur, MAX_CELLS, 1, THREE.RGBAFormat, THREE.FloatType,
    );
    this._permTexCur.minFilter = THREE.NearestFilter;
    this._permTexCur.magFilter = THREE.NearestFilter;

    this._permTexPrev = new THREE.DataTexture(
      this._permDataPrev, MAX_CELLS, 1, THREE.RGBAFormat, THREE.FloatType,
    );
    this._permTexPrev.minFilter = THREE.NearestFilter;
    this._permTexPrev.magFilter = THREE.NearestFilter;

    // Initialise both textures to the same shuffled state (no startup anim).
    const perm = shuffle(this._gridW * this._gridH);
    fillPermData(perm, this._permDataCur);
    fillPermData(perm, this._permDataPrev);
    this._permTexCur.needsUpdate  = true;
    this._permTexPrev.needsUpdate = true;

    // ── Build the real TSL effect graph ────────────────────────────────────
    this._effectNode = this._buildEffectNode();

    // Bind actual DataTextures to the permutation sampler nodes now that
    // they've been allocated above.
    this._permTexCurNode.value  = this._permTexCur;
    this._permTexPrevNode.value = this._permTexPrev;

    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    _time: number,
    delta: number,
  ): void {
    // ── Auto-reshuffle timer ────────────────────────────────────────────────
    this._elapsed += delta;
    if (this._reshuffleInterval > 0 && this._elapsed >= this._reshuffleInterval) {
      this._elapsed -= this._reshuffleInterval;
      this._triggerReshuffle();
    }

    // ── Animation progress ─────────────────────────────────────────────────
    if (this._animating) {
      if (this._animDuration <= 0) {
        this._animProgress    = 1.0;
        this._progressU.value = 1.0;
        this._animating       = false;
      } else {
        this._animProgress = Math.min(1.0, this._animProgress + delta / this._animDuration);
        this._progressU.value = this._animProgress;
        if (this._animProgress >= 1.0) this._animating = false;
      }
    }

    // ── Sync input sampler ─────────────────────────────────────────────────
    this._inputSamplerNode.value = inputTex;
    super.render(renderer, inputTex, outputTarget, _time, delta);
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms are initialised.
    if (!this._gridWU) return this._inputNode;

    // Y-flipped UV — WebGPU render-target textures have V=0=top.
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));

    // ── Cell coordinates ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellFX: any = rtUV.x.mul(this._gridWU);  // fractional cell X
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellFY: any = rtUV.y.mul(this._gridHU);  // fractional cell Y
    const cellX  = floor(cellFX);
    const cellY  = floor(cellFY);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localU: any = cellFX.sub(floor(cellFX));  // fract(cellFX)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localV: any = cellFY.sub(floor(cellFY));  // fract(cellFY)

    // ── Permutation texture address ───────────────────────────────────────
    // The DataTexture is MAX_CELLS wide; each cell's index maps to one texel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellIdx: any = cellY.mul(this._gridWU).add(cellX);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const permU:   any = cellIdx.add(float(0.5)).div(float(MAX_CELLS));
    const permUV   = vec2(permU, float(0.5));

    // Two permutation sampler nodes — .value bound after this function.
    this._permTexCurNode  = tslTexture(new THREE.Texture(), permUV);
    this._permTexPrevNode = tslTexture(new THREE.Texture(), permUV);

    // ── Remap helper ──────────────────────────────────────────────────────
    // Given a permutation sample, compute the source UV for this pixel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remapUV = (samplerNode: any): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
      // R channel stores the raw float index of the mapped cell.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idx: any      = float(samplerNode.r);
      // mod(idx, gridW) — use x - y*floor(x/y) to avoid importing mod
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedCX: any = idx.sub(floor(idx.div(this._gridWU)).mul(this._gridWU));
      const mappedCY      = floor(idx.div(this._gridWU));
      return vec2(
        mappedCX.add(localU).div(this._gridWU),
        mappedCY.add(localV).div(this._gridHU),
      );
    };

    const sourceUVCur  = remapUV(this._permTexCurNode);
    const sourceUVPrev = remapUV(this._permTexPrevNode);

    // Lerp between prev and cur positions for the slide animation.
    const sourceUV = mix(sourceUVPrev, sourceUVCur, this._progressU);

    // Sample the input texture at the remapped UV — .value set each frame.
    this._inputSamplerNode = tslTexture(new THREE.Texture(), sourceUV);

    return vec4(
      float(this._inputSamplerNode.r),
      float(this._inputSamplerNode.g),
      float(this._inputSamplerNode.b),
      float(1.0),
    );
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    let gridChanged = false;

    for (const p of params) {
      switch (p.key) {
        case "columns": {
          const v = typeof p.value === "number" ? Math.max(2, Math.round(p.value)) : 4;
          if (v !== this._gridW) { this._gridW = v; gridChanged = true; }
          this._gridWU.value = v;
          break;
        }
        case "rows": {
          const v = typeof p.value === "number" ? Math.max(2, Math.round(p.value)) : 4;
          if (v !== this._gridH) { this._gridH = v; gridChanged = true; }
          this._gridHU.value = v;
          break;
        }
        case "interval":
          this._reshuffleInterval = typeof p.value === "number" ? p.value : 2.0;
          break;
        case "animDuration":
          this._animDuration = typeof p.value === "number" ? p.value : 0.4;
          break;
      }
    }

    if (gridChanged) {
      // Snap to a fresh shuffled state — no slide animation on grid resize.
      const n    = this._gridW * this._gridH;
      const perm = shuffle(n);
      fillPermData(perm, this._permDataCur);
      fillPermData(perm, this._permDataPrev);
      this._permTexCur.needsUpdate  = true;
      this._permTexPrev.needsUpdate = true;
      this._animProgress    = 1.0;
      this._progressU.value = 1.0;
      this._animating       = false;
      this._elapsed         = 0;
    }
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  override dispose(): void {
    this._permTexCur.dispose();
    this._permTexPrev.dispose();
    super.dispose();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _triggerReshuffle(): void {
    // Copy current permutation → previous slot (in-place, no allocation).
    this._permDataPrev.set(this._permDataCur);
    this._permTexPrev.needsUpdate = true;

    // Generate a new shuffled permutation into the current slot.
    fillPermData(shuffle(this._gridW * this._gridH), this._permDataCur);
    this._permTexCur.needsUpdate = true;

    // Kick off slide animation (or snap immediately if duration = 0).
    if (this._animDuration <= 0) {
      this._animProgress    = 1.0;
      this._progressU.value = 1.0;
      this._animating       = false;
    } else {
      this._animProgress    = 0.0;
      this._progressU.value = 0.0;
      this._animating       = true;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — returns a new array of n indices in random order. */
function shuffle(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Write integer indices into a Float32Array DataTexture buffer.
 * Layout: RGBA stride = 4 floats; index stored in R channel.
 */
function fillPermData(indices: number[], data: Float32Array): void {
  for (let i = 0; i < indices.length; i++) {
    data[i * 4] = indices[i];  // R — raw float index
    // G, B, A left as 0
  }
}
