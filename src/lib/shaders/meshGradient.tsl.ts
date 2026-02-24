import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  clamp,
  sin,
  cos,
  exp,
  max,
  mix,
  select,
  screenSize,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// MeshGradientPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Procedural mesh-gradient layer using four color control points.
 *
 * Each point contributes a Gaussian weight by distance. The weighted-average
 * color forms a smooth continuous gradient field.
 */
export class MeshGradientPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p1xU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p1yU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p2xU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p2yU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p3xU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p3yU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p4xU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _p4yU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c1rU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c1gU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c1bU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c2rU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c2gU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c2bU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c3rU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c3gU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c3bU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c4rU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c4gU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _c4bU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _falloffU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _intensityU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _animateU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _speedU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _driftU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _timeU: any;

  private _needsAnimation = false;

  constructor(layerId: string) {
    super(layerId);
    // super() calls _buildEffectNode() before uniforms are initialized.

    this._p1xU = uniform(0.18);
    this._p1yU = uniform(0.2);
    this._p2xU = uniform(0.82);
    this._p2yU = uniform(0.22);
    this._p3xU = uniform(0.25);
    this._p3yU = uniform(0.82);
    this._p4xU = uniform(0.8);
    this._p4yU = uniform(0.78);

    const [c1r, c1g, c1b] = parseCSSColorRGB("#ff6a1f");
    const [c2r, c2g, c2b] = parseCSSColorRGB("#ff3d81");
    const [c3r, c3g, c3b] = parseCSSColorRGB("#3b82f6");
    const [c4r, c4g, c4b] = parseCSSColorRGB("#ffd166");

    this._c1rU = uniform(c1r);
    this._c1gU = uniform(c1g);
    this._c1bU = uniform(c1b);
    this._c2rU = uniform(c2r);
    this._c2gU = uniform(c2g);
    this._c2bU = uniform(c2b);
    this._c3rU = uniform(c3r);
    this._c3gU = uniform(c3g);
    this._c3bU = uniform(c3b);
    this._c4rU = uniform(c4r);
    this._c4gU = uniform(c4g);
    this._c4bU = uniform(c4b);

    this._falloffU = uniform(2.4);
    this._intensityU = uniform(1.0);
    this._animateU = uniform(0.0);
    this._speedU = uniform(0.35);
    this._driftU = uniform(0.06);
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
    if (!this._p1xU) return this._inputNode;

    // Y-flipped UV (render-target sampling convention in this pipeline).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(uv().x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(float(1.0).sub(uv().y));

    const aspect = screenSize.x.div(screenSize.y);
    const animateOn = this._animateU.greaterThan(float(0.5));
    const t = this._timeU.mul(this._speedU);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animatedCoord = (base: any, phase: number, trig: "sin" | "cos"): any => {
      const osc =
        trig === "sin"
          ? sin(t.add(float(phase))).mul(this._driftU)
          : cos(t.add(float(phase))).mul(this._driftU);
      const withAnim = clamp(base.add(osc), float(0.0), float(1.0));
      return select(animateOn, withAnim, base);
    };

    const p1 = vec2(
      animatedCoord(this._p1xU, 0.0, "sin"),
      animatedCoord(this._p1yU, 0.7, "cos"),
    );
    const p2 = vec2(
      animatedCoord(this._p2xU, 1.2, "cos"),
      animatedCoord(this._p2yU, 2.1, "sin"),
    );
    const p3 = vec2(
      animatedCoord(this._p3xU, 3.3, "sin"),
      animatedCoord(this._p3yU, 4.1, "cos"),
    );
    const p4 = vec2(
      animatedCoord(this._p4xU, 4.9, "cos"),
      animatedCoord(this._p4yU, 5.7, "sin"),
    );

    const c1 = vec3(this._c1rU, this._c1gU, this._c1bU);
    const c2 = vec3(this._c2rU, this._c2gU, this._c2bU);
    const c3 = vec3(this._c3rU, this._c3gU, this._c3bU);
    const c4 = vec3(this._c4rU, this._c4gU, this._c4bU);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weightAt = (p: any): any => {
      const dx = uvx.sub(float(p.x)).mul(aspect);
      const dy = uvy.sub(float(p.y));
      const d2 = dx.mul(dx).add(dy.mul(dy));
      return exp(d2.mul(this._falloffU).mul(float(-6.0)));
    };

    const w1 = weightAt(p1);
    const w2 = weightAt(p2);
    const w3 = weightAt(p3);
    const w4 = weightAt(p4);
    const wSum = max(w1.add(w2).add(w3).add(w4), float(0.0001));

    const meshColor = vec3(
      c1.x.mul(w1).add(c2.x.mul(w2)).add(c3.x.mul(w3)).add(c4.x.mul(w4)).div(wSum),
      c1.y.mul(w1).add(c2.y.mul(w2)).add(c3.y.mul(w3)).add(c4.y.mul(w4)).div(wSum),
      c1.z.mul(w1).add(c2.z.mul(w2)).add(c3.z.mul(w3)).add(c4.z.mul(w4)).div(wSum),
    );

    const src = this._inputNode;
    const outColor = vec3(
      mix(float(src.r), float(meshColor.x), this._intensityU),
      mix(float(src.g), float(meshColor.y), this._intensityU),
      mix(float(src.b), float(meshColor.z), this._intensityU),
    );

    return vec4(outColor, float(1.0));
  }

  override updateUniforms(params: ShaderParam[]): void {
    let animate = this._animateU.value > 0.5;
    let speed = this._speedU.value as number;
    let drift = this._driftU.value as number;

    for (const p of params) {
      switch (p.key) {
        case "point1":
          setVec2Uniforms(p.value, this._p1xU, this._p1yU, [0.18, 0.2]);
          break;
        case "point2":
          setVec2Uniforms(p.value, this._p2xU, this._p2yU, [0.82, 0.22]);
          break;
        case "point3":
          setVec2Uniforms(p.value, this._p3xU, this._p3yU, [0.25, 0.82]);
          break;
        case "point4":
          setVec2Uniforms(p.value, this._p4xU, this._p4yU, [0.8, 0.78]);
          break;
        case "color1":
          setColorUniforms(p.value as string, this._c1rU, this._c1gU, this._c1bU);
          break;
        case "color2":
          setColorUniforms(p.value as string, this._c2rU, this._c2gU, this._c2bU);
          break;
        case "color3":
          setColorUniforms(p.value as string, this._c3rU, this._c3gU, this._c3bU);
          break;
        case "color4":
          setColorUniforms(p.value as string, this._c4rU, this._c4gU, this._c4bU);
          break;
        case "falloff":
          this._falloffU.value = typeof p.value === "number" ? p.value : 2.4;
          break;
        case "intensity":
          this._intensityU.value = typeof p.value === "number" ? p.value : 1;
          break;
        case "animate":
          animate = p.value === true;
          this._animateU.value = animate ? 1.0 : 0.0;
          break;
        case "speed":
          speed = typeof p.value === "number" ? p.value : 0.35;
          this._speedU.value = speed;
          break;
        case "drift":
          drift = typeof p.value === "number" ? p.value : 0.06;
          this._driftU.value = drift;
          break;
      }
    }

    this._needsAnimation = animate && Math.abs(speed) > 1e-6 && Math.abs(drift) > 1e-6;
  }
}

function setVec2Uniforms(
  value: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xU: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yU: any,
  fallback: [number, number],
): void {
  const [fx, fy] = fallback;
  const [x, y] = Array.isArray(value) ? (value as number[]) : [fx, fy];
  xU.value = Number.isFinite(x) ? x : fx;
  yU.value = Number.isFinite(y) ? y : fy;
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

  return [1, 1, 1];
}
