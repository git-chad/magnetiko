import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  sin,
  abs,
  smoothstep,
  mix,
  clamp,
  select,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// GuillochePass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guilloche pattern generator.
 *
 * Produces engraving-style parametric line fields and blends them with the
 * underlying source image.
 */
export class GuillochePass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _modeU: any; // 0=rosette 1=weave 2=radial-lace
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _freq1U: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _freq2U: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _phaseU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _warpU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _lineWidthU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _softnessU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _intensityU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _fgRU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _fgGU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _fgBU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _bgRU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _bgGU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _bgBU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _animateU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _speedU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _timeU: any;

  private _needsAnimation = false;

  constructor(layerId: string) {
    super(layerId);
    // super() calls _buildEffectNode() before uniforms are initialized.

    this._modeU = uniform(0.0);
    this._freq1U = uniform(7.0);
    this._freq2U = uniform(17.0);
    this._phaseU = uniform(0.0);
    this._warpU = uniform(0.8);
    this._lineWidthU = uniform(0.12);
    this._softnessU = uniform(0.05);
    this._intensityU = uniform(0.9);

    const [fgR, fgG, fgB] = parseCSSColorRGB("#121212");
    const [bgR, bgG, bgB] = parseCSSColorRGB("#f7f1e8");
    this._fgRU = uniform(fgR);
    this._fgGU = uniform(fgG);
    this._fgBU = uniform(fgB);
    this._bgRU = uniform(bgR);
    this._bgGU = uniform(bgG);
    this._bgBU = uniform(bgB);

    this._animateU = uniform(0.0);
    this._speedU = uniform(0.2);
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
    delta: number,
  ): void {
    this._timeU.value = time;
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  override needsContinuousRender(): boolean {
    return this._needsAnimation;
  }

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this._modeU) return this._inputNode;

    // Y-flipped UV in render-target convention.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(uv().x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(float(1.0).sub(uv().y));

    // Centered UV coordinates.
    const x = float(uvx.sub(float(0.5)).mul(float(2.0)));
    const y = float(uvy.sub(float(0.5)).mul(float(2.0)));
    const r2 = x.mul(x).add(y.mul(y));

    const t = float(
      select(
        this._animateU.greaterThan(float(0.5)),
        this._timeU.mul(this._speedU),
        float(0.0),
      ),
    );

    // Rosette pattern.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const innerRosette: any = sin(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x as any).add(y).mul(this._freq1U).mul(float(10.0)).add(t),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rosetteArg: any = (r2 as any)
      .mul(this._freq2U)
      .mul(float(16.0))
      .add(innerRosette.mul(this._warpU).mul(float(8.0)))
      .add(this._phaseU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rosette: any = sin(rosetteArg);

    // Weave pattern.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weaveA: any = sin((x as any).mul(this._freq1U).mul(float(12.0)).add(t));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weaveB: any = sin(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (y as any).mul(this._freq2U).mul(float(12.0)).sub((t as any).mul(float(0.73))).add(this._phaseU),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weave: any = weaveA.mul(weaveB);

    // Radial lace pattern.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radialArg: any = (x as any)
      .sub(y)
      .mul(this._freq1U)
      .mul(float(12.0))
      .add((r2 as any).mul(this._freq2U).mul(float(20.0)))
      .add(t)
      .add(this._phaseU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radialLace: any = sin(radialArg);

    const field = select(
      this._modeU.lessThan(float(0.5)),
      rosette,
      select(this._modeU.lessThan(float(1.5)), weave, radialLace),
    );

    // Thin engraved lines appear where field crosses zero.
    const width = clamp(this._lineWidthU, float(0.005), float(1.0));
    const soft = clamp(this._softnessU, float(0.001), float(0.5));
    const line = float(1.0).sub(smoothstep(width, width.add(soft), abs(field)));

    const fg = vec3(this._fgRU, this._fgGU, this._fgBU);
    const bg = vec3(this._bgRU, this._bgGU, this._bgBU);
    const guillocheColor = vec3(
      mix(float(bg.x), float(fg.x), line),
      mix(float(bg.y), float(fg.y), line),
      mix(float(bg.z), float(fg.z), line),
    );

    const src = this._inputNode;
    const outColor = vec3(
      mix(float(src.r), float(guillocheColor.x), this._intensityU),
      mix(float(src.g), float(guillocheColor.y), this._intensityU),
      mix(float(src.b), float(guillocheColor.z), this._intensityU),
    );

    return vec4(outColor, float(1.0));
  }

  override updateUniforms(params: ShaderParam[]): void {
    let animate = this._animateU.value > 0.5;
    let speed = this._speedU.value as number;

    for (const p of params) {
      switch (p.key) {
        case "pattern": {
          const map: Record<string, number> = {
            rosette: 0,
            weave: 1,
            "radial-lace": 2,
          };
          this._modeU.value = map[p.value as string] ?? 0;
          break;
        }
        case "frequency1":
          this._freq1U.value = typeof p.value === "number" ? p.value : 7;
          break;
        case "frequency2":
          this._freq2U.value = typeof p.value === "number" ? p.value : 17;
          break;
        case "phase":
          this._phaseU.value = typeof p.value === "number" ? p.value : 0;
          break;
        case "warp":
          this._warpU.value = typeof p.value === "number" ? p.value : 0.8;
          break;
        case "lineWidth":
          this._lineWidthU.value = typeof p.value === "number" ? p.value : 0.12;
          break;
        case "softness":
          this._softnessU.value = typeof p.value === "number" ? p.value : 0.05;
          break;
        case "intensity":
          this._intensityU.value = typeof p.value === "number" ? p.value : 0.9;
          break;
        case "foreground":
          setColorUniforms(p.value as string, this._fgRU, this._fgGU, this._fgBU);
          break;
        case "background":
          setColorUniforms(p.value as string, this._bgRU, this._bgGU, this._bgBU);
          break;
        case "animate":
          animate = p.value === true;
          this._animateU.value = animate ? 1.0 : 0.0;
          break;
        case "speed":
          speed = typeof p.value === "number" ? p.value : 0.2;
          this._speedU.value = speed;
          break;
      }
    }

    this._needsAnimation = animate && Math.abs(speed) > 1e-6;
  }
}

function setColorUniforms(
  value: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rU: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gU: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bU: any,
): void {
  const [r, g, b] = parseCSSColorRGB(value);
  rU.value = r;
  gU.value = g;
  bU.value = b;
}

function parseCSSColorRGB(css: string): [number, number, number] {
  const rgba = css.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)/i,
  );
  if (rgba) {
    return [
      Number.parseFloat(rgba[1]) / 255,
      Number.parseFloat(rgba[2]) / 255,
      Number.parseFloat(rgba[3]) / 255,
    ];
  }

  const hex = css.trim().replace("#", "");
  if (hex.length === 6) {
    return [
      Number.parseInt(hex.slice(0, 2), 16) / 255,
      Number.parseInt(hex.slice(2, 4), 16) / 255,
      Number.parseInt(hex.slice(4, 6), 16) / 255,
    ];
  }
  if (hex.length === 3) {
    return [
      Number.parseInt(hex[0] + hex[0], 16) / 255,
      Number.parseInt(hex[1] + hex[1], 16) / 255,
      Number.parseInt(hex[2] + hex[2], 16) / 255,
    ];
  }

  return [0, 0, 0];
}
