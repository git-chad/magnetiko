import * as THREE from "three/webgpu";
import {
  clamp,
  cos,
  float,
  length,
  mix,
  screenSize,
  select,
  sin,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// ChromaticAberrationPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chromatic aberration / prism split pass.
 *
 * Splits RGB channels with independent UV offsets to create lens-fringe and
 * prism styles. Can be radial (edge-heavy fringing from a center point) or
 * directional (uniform split along an angle).
 */
export class ChromaticAberrationPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _modeU: any; // 0=radial, 1=directional
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _amountPxU: any; // channel shift in screen pixels
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _angleRadU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _centerXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _centerYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _falloffU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _spectrumU: any; // 0=natural, 1=cmy, 2=neon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blendU: any;

  // Mutable input samplers; .value is rebound each frame.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _baseSampleNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _rSampleNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _gSampleNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _bSampleNode: any;

  constructor(layerId: string) {
    super(layerId);
    // super() calls _buildEffectNode() once before uniforms below exist.

    this._modeU = uniform(0.0);
    this._amountPxU = uniform(6.0);
    this._angleRadU = uniform(0.0);
    this._centerXU = uniform(0.5);
    this._centerYU = uniform(0.5);
    this._falloffU = uniform(1.2);
    this._spectrumU = uniform(0.0);
    this._blendU = uniform(0.85);

    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    if (this._baseSampleNode) this._baseSampleNode.value = inputTex;
    if (this._rSampleNode) this._rSampleNode.value = inputTex;
    if (this._gSampleNode) this._gSampleNode.value = inputTex;
    if (this._bSampleNode) this._bSampleNode.value = inputTex;
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this._modeU) return this._inputNode;

    const uvx = float(uv().x);
    const uvy = float(float(1.0).sub(uv().y));
    const rtUV = vec2(uvx, uvy);

    // ── Direction vector (radial or directional) ─────────────────────────
    const dx = uvx.sub(this._centerXU);
    const dy = uvy.sub(this._centerYU);
    const aspect = screenSize.x.div(screenSize.y);
    const dxAspect = dx.mul(aspect);
    const dist = length(vec2(dxAspect, dy));
    const invLen = float(1.0).div(dist.add(float(1e-5)));
    const radialDirX = dxAspect.mul(invLen).div(aspect);
    const radialDirY = dy.mul(invLen);

    const directionalX = float(cos(this._angleRadU));
    const directionalY = float(sin(this._angleRadU));
    const useRadial = this._modeU.lessThan(float(0.5));
    const dirX = select(useRadial, radialDirX, directionalX);
    const dirY = select(useRadial, radialDirY, directionalY);

    // Radial mode ramps split toward edges. Directional mode stays uniform.
    const radialGain = clamp(dist.mul(this._falloffU).mul(float(1.75)), float(0.0), float(1.0));
    const modeGain = select(useRadial, radialGain, float(1.0));
    const amountUV = this._amountPxU.div(screenSize.x).mul(modeGain);

    // Perpendicular axis gives prism-like colour fan options.
    const perpX = float(0.0).sub(dirY);
    const perpY = dirX;

    // ── Spectrum styles ───────────────────────────────────────────────────
    const isNatural = this._spectrumU.lessThan(float(0.5));
    const isCMY = this._spectrumU.lessThan(float(1.5));

    const rDir = select(isNatural, float(1.0), select(isCMY, float(0.8), float(1.35)));
    const gDir = select(isNatural, float(0.25), select(isCMY, float(-0.2), float(0.0)));
    const bDir = select(isNatural, float(-1.0), select(isCMY, float(-0.8), float(-1.35)));

    const rPerp = select(isNatural, float(0.0), select(isCMY, float(0.35), float(0.25)));
    const gPerp = float(0.0);
    const bPerp = select(isNatural, float(0.0), select(isCMY, float(-0.35), float(-0.25)));

    const rOff = vec2(
      amountUV.mul(dirX.mul(rDir).add(perpX.mul(rPerp))),
      amountUV.mul(dirY.mul(rDir).add(perpY.mul(rPerp))),
    );
    const gOff = vec2(
      amountUV.mul(dirX.mul(gDir).add(perpX.mul(gPerp))),
      amountUV.mul(dirY.mul(gDir).add(perpY.mul(gPerp))),
    );
    const bOff = vec2(
      amountUV.mul(dirX.mul(bDir).add(perpX.mul(bPerp))),
      amountUV.mul(dirY.mul(bDir).add(perpY.mul(bPerp))),
    );

    const rUV = clamp(rtUV.add(rOff), vec2(0.001, 0.001), vec2(0.999, 0.999));
    const gUV = clamp(rtUV.add(gOff), vec2(0.001, 0.001), vec2(0.999, 0.999));
    const bUV = clamp(rtUV.add(bOff), vec2(0.001, 0.001), vec2(0.999, 0.999));
    this._baseSampleNode = tslTexture(new THREE.Texture(), rtUV);
    this._rSampleNode = tslTexture(new THREE.Texture(), rUV);
    this._gSampleNode = tslTexture(new THREE.Texture(), gUV);
    this._bSampleNode = tslTexture(new THREE.Texture(), bUV);

    const baseColor = vec3(
      float(this._baseSampleNode.r),
      float(this._baseSampleNode.g),
      float(this._baseSampleNode.b),
    );
    const splitColor = vec3(
      float(this._rSampleNode.r),
      float(this._gSampleNode.g),
      float(this._bSampleNode.b),
    );
    const outColor = mix(baseColor, splitColor, this._blendU);

    return vec4(
      float(outColor.x),
      float(outColor.y),
      float(outColor.z),
      float(1.0),
    );
  }

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "mode":
          this._modeU.value = p.value === "directional" ? 1.0 : 0.0;
          break;
        case "amount":
          this._amountPxU.value = typeof p.value === "number" ? p.value : 6.0;
          break;
        case "angle":
          this._angleRadU.value =
            typeof p.value === "number"
              ? (p.value * Math.PI) / 180
              : 0.0;
          break;
        case "center": {
          const [x, y] = Array.isArray(p.value) ? (p.value as number[]) : [0.5, 0.5];
          this._centerXU.value = Number.isFinite(x) ? x : 0.5;
          this._centerYU.value = Number.isFinite(y) ? y : 0.5;
          break;
        }
        case "falloff":
          this._falloffU.value = typeof p.value === "number" ? p.value : 1.2;
          break;
        case "spectrum": {
          const map: Record<string, number> = {
            natural: 0,
            cmy: 1,
            neon: 2,
          };
          this._spectrumU.value = map[p.value as string] ?? 0;
          break;
        }
        case "blend":
          this._blendU.value = typeof p.value === "number" ? p.value : 0.85;
          break;
      }
    }
  }
}
