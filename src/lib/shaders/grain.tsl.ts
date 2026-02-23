import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec4,
  float,
  uniform,
  fract,
  sin,
  dot,
  floor,
  clamp,
  select,
  mix,
  screenSize,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// GrainPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Film grain filter pass.
 *
 * Generates screen-space noise from a time-seeded 2-D hash function and
 * composites it over the source image using one of three blend modes.
 *
 * Hash function:
 *   noise(p) = fract(sin(dot(p, vec2(127.1, 311.7))) × 43758.5453)
 *
 * The UV is quantized to `size`-pixel blocks so that `size > 1` produces
 * coarser (but still per-frame animated) grain.  Animating the hash seed
 * with `time × speed` gives independent per-frame patterns with no texture.
 *
 * Blend modes (internal to the effect, separate from the layer blend mode):
 *   overlay    — grain = 0.5 is neutral; bright/dark noise punches through
 *   soft-light — gentle luminance modulation; lower contrast than overlay
 *   add        — adds (noise − 0.5)×intensity; can brighten or darken
 *
 * Monochrome (_monoU = 1): one noise value for all channels → neutral tint
 * Color      (_monoU = 0): independent R/G/B hashes → coloured grain
 */
export class GrainPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _intensityU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _sizeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _speedU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _monoU: any;     // 1 = monochrome, 0 = colour
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blendU: any;    // 0 = overlay, 1 = soft-light, 2 = add
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _timeU: any;

  constructor(layerId: string) {
    super(layerId);

    this._intensityU = uniform(0.15);
    this._sizeU      = uniform(1.0);
    this._speedU     = uniform(1.0);
    this._monoU      = uniform(1.0);
    this._blendU     = uniform(0.0);
    this._timeU      = uniform(0.0);

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
    this._timeU.value = time;
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this._intensityU) return this._inputNode;

    // ── Pixel coordinate, quantized by grain size ──────────────────────────
    // floor() keeps all pixels within each size-block sharing the same noise.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pixCoord: any = (vec2 as any)(uv()).mul(screenSize);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sizedCoord: any = floor(pixCoord.div(this._sizeU));

    // Animate by offsetting the x-component by time × speed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animSeed: any = sizedCoord.add(
      (vec2 as any)(this._timeU.mul(this._speedU), float(0.0)),
    );

    // ── 2-D hash (sin-based, no texture required) ──────────────────────────
    // Returns a value in [0, 1] for the given seed offset.
    // Different constant offsets give independent noise per channel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = (offset: any): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = animSeed.add(offset);
      return fract(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sin(dot(p, vec2(127.1, 311.7))) as any).mul(43758.5453),
      );
    };

    const noiseR = hash(vec2(0.0,  0.0));
    const noiseG = hash(vec2(17.3, 41.2));
    const noiseB = hash(vec2(83.7, 19.5));

    // Monochrome: use noiseR for all channels; colour: independent per-channel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gR: any = select(this._monoU.greaterThan(float(0.5)), noiseR, noiseR);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gG: any = select(this._monoU.greaterThan(float(0.5)), noiseR, noiseG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gB: any = select(this._monoU.greaterThan(float(0.5)), noiseR, noiseB);

    // Mix grain with 0.5 (neutral) by intensity.
    // At intensity=0 → grain=0.5 (identity for overlay & soft-light, zero-add).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blend = (g: any): any => (mix as any)(float(0.5), g, this._intensityU);
    const bR = blend(gR);
    const bG = blend(gG);
    const bB = blend(gB);

    // ── Source colour ──────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src: any = this._inputNode;
    const sR = float(src.r);
    const sG = float(src.g);
    const sB = float(src.b);

    // ── Overlay blend ──────────────────────────────────────────────────────
    // base < 0.5 → 2·base·grain; else → 1 − 2·(1−base)·(1−grain)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overlay = (base: any, grain: any): any =>
      select(
        base.lessThan(float(0.5)),
        base.mul(grain).mul(float(2.0)),
        float(1.0).sub(
          float(1.0).sub(base).mul(float(1.0).sub(grain)).mul(float(2.0)),
        ),
      );

    // ── Soft-light blend ───────────────────────────────────────────────────
    // Approximation: (1 − 2g)·b² + 2g·b
    // At g=0.5: (−0)·b² + 1·b = b (identity).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const softLight = (base: any, grain: any): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const twoG: any = grain.mul(float(2.0));
      return float(1.0).sub(twoG).mul(base).mul(base).add(twoG.mul(base));
    };

    // ── Additive blend ─────────────────────────────────────────────────────
    // Adds (grain − 0.5); intensity already scales the deviation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const additive = (base: any, grain: any): any =>
      clamp(base.add(grain.sub(float(0.5))), float(0.0), float(1.0));

    // ── Select blend mode and compose ─────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyBlend = (base: any, grain: any): any =>
      select(
        this._blendU.lessThan(float(0.5)),
        overlay(base, grain),
        select(
          this._blendU.lessThan(float(1.5)),
          softLight(base, grain),
          additive(base, grain),
        ),
      );

    const outR = applyBlend(sR, bR);
    const outG = applyBlend(sG, bG);
    const outB = applyBlend(sB, bB);

    return vec4(outR, outG, outB, float(1.0));
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "intensity":
          this._intensityU.value = typeof p.value === "number" ? p.value : 0.15;
          break;
        case "size":
          this._sizeU.value = typeof p.value === "number" ? p.value : 1.0;
          break;
        case "speed":
          this._speedU.value = typeof p.value === "number" ? p.value : 1.0;
          break;
        case "monochrome":
          this._monoU.value = p.value ? 1.0 : 0.0;
          break;
        case "blendMode": {
          const map: Record<string, number> = {
            "overlay":    0,
            "soft-light": 1,
            "add":        2,
          };
          this._blendU.value = map[p.value as string] ?? 0;
          break;
        }
      }
    }
  }
}
