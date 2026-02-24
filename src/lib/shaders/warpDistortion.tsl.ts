import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec4,
  float,
  uniform,
  length,
  clamp,
  sin,
  max,
  select,
  screenSize,
  texture as tslTexture,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// WarpDistortionPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warp/Distortion filter pass.
 *
 * Modes:
 * - bulge: lens-like radial magnification/pinch
 * - wave: animated radial ripple that displaces UVs along the radius
 */
export class WarpDistortionPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _modeU: any; // 0=bulge, 1=wave
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _strengthU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _radiusU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _centerXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _centerYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _waveAmpU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _waveFreqU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _waveSpeedU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _timeU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _sampleNode: any;
  private _needsWaveAnimation = false;

  constructor(layerId: string) {
    super(layerId);
    // super() calls _buildEffectNode() once; guard returns passthrough because
    // uniforms below do not exist yet.

    this._modeU = uniform(1.0);
    this._strengthU = uniform(0.7);
    this._radiusU = uniform(0.35);
    this._centerXU = uniform(0.5);
    this._centerYU = uniform(0.5);
    this._waveAmpU = uniform(0.015);
    this._waveFreqU = uniform(5.0);
    this._waveSpeedU = uniform(1.0);
    this._timeU = uniform(0.0);

    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    _delta: number,
  ): void {
    this._timeU.value = time;
    if (this._sampleNode) this._sampleNode.value = inputTex;
    super.render(renderer, inputTex, outputTarget, time, _delta);
  }

  override needsContinuousRender(): boolean {
    return this._needsWaveAnimation;
  }

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this._modeU) return this._inputNode;

    // Y-flipped UV (render-target sampling convention in this pipeline).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(uv().x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(float(1.0).sub(uv().y));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dx: any = uvx.sub(this._centerXU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dy: any = uvy.sub(this._centerYU);

    // Aspect-correct distance/falloff so radius stays circular on any frame.
    const aspect = screenSize.x.div(screenSize.y);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dxAspect: any = dx.mul(aspect);
    const dAspect = vec2(dxAspect, dy);
    const dist = length(dAspect);
    const safeRadius = max(this._radiusU, float(0.0001));
    const falloff = clamp(float(1.0).sub(dist.div(safeRadius)), float(0.0), float(1.0));

    // ── Bulge ──────────────────────────────────────────────────────────────
    // Positive strength magnifies the center (samples from a compressed UV
    // region); negative values produce a pinch effect.
    const bulgeScale = clamp(
      float(1.0).sub(this._strengthU.mul(falloff)),
      float(0.05),
      float(3.0),
    );
    const bulgeUV = vec2(
      this._centerXU.add(dx.mul(bulgeScale)),
      this._centerYU.add(dy.mul(bulgeScale)),
    );

    // ── Wave ───────────────────────────────────────────────────────────────
    const invLen = float(1.0).div(dist.add(float(0.0001)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dirXAspect: any = dxAspect.mul(invLen);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dirY: any = dy.mul(invLen);
    const phase = float(
      dist
        .mul(this._waveFreqU.mul(float(20.0)))
        .sub(this._timeU.mul(this._waveSpeedU)),
    );
    const waveAmount = float(sin(phase).mul(this._waveAmpU).mul(falloff));
    const waveUV = vec2(
      uvx.add(dirXAspect.div(aspect).mul(waveAmount)),
      uvy.add(dirY.mul(waveAmount)),
    );

    const warpedUV = select(this._modeU.lessThan(float(0.5)), bulgeUV, waveUV);
    const clampedUV = clamp(warpedUV, vec2(0.001, 0.001), vec2(0.999, 0.999));

    this._sampleNode = tslTexture(new THREE.Texture(), clampedUV);

    return vec4(
      float(this._sampleNode.r),
      float(this._sampleNode.g),
      float(this._sampleNode.b),
      float(1.0),
    );
  }

  override updateUniforms(params: ShaderParam[]): void {
    let mode = 1;
    let waveAmp = this._waveAmpU.value as number;
    let waveSpeed = this._waveSpeedU.value as number;

    for (const p of params) {
      switch (p.key) {
        case "mode": {
          const map: Record<string, number> = {
            // Backward compatibility: legacy "swirl" presets map to bulge.
            swirl: 0,
            bulge: 0,
            wave: 1,
          };
          mode = map[p.value as string] ?? 1;
          this._modeU.value = mode;
          break;
        }
        case "strength":
          this._strengthU.value = typeof p.value === "number" ? p.value : 0.7;
          break;
        case "radius":
          this._radiusU.value = typeof p.value === "number" ? p.value : 0.35;
          break;
        case "center": {
          const [x, y] = Array.isArray(p.value) ? (p.value as number[]) : [0.5, 0.5];
          this._centerXU.value = Number.isFinite(x) ? x : 0.5;
          this._centerYU.value = Number.isFinite(y) ? y : 0.5;
          break;
        }
        case "waveAmplitude":
          waveAmp = typeof p.value === "number" ? p.value : 0.015;
          this._waveAmpU.value = waveAmp;
          break;
        case "waveFrequency":
          this._waveFreqU.value = typeof p.value === "number" ? p.value : 5;
          break;
        case "waveSpeed":
          waveSpeed = typeof p.value === "number" ? p.value : 1;
          this._waveSpeedU.value = waveSpeed;
          break;
      }
    }

    this._needsWaveAnimation = mode === 1 && Math.abs(waveAmp) > 1e-6 && Math.abs(waveSpeed) > 1e-6;
  }
}
