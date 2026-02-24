import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  fract,
  sin,
  dot,
  floor,
  mix,
  clamp,
  max,
  min,
  length,
  select,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// NoiseGeneratorPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standalone procedural noise layer.
 *
 * Modes:
 * - perlin  (value-noise style gradient)
 * - simplex (2D simplex-style triangular lattice noise)
 * - voronoi (cellular distance field)
 */
export class NoiseGeneratorPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _algorithmU: any; // 0=perlin 1=simplex 2=voronoi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _scaleU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _intensityU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _speedU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _contrastU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _invertU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _timeU: any;

  private _needsAnimation = false;

  constructor(layerId: string) {
    super(layerId);
    // super() calls _buildEffectNode() once before uniforms below exist.

    this._algorithmU = uniform(0.0);
    this._scaleU = uniform(8.0);
    this._intensityU = uniform(1.0);
    this._speedU = uniform(0.35);
    this._contrastU = uniform(1.0);
    this._invertU = uniform(0.0);
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
    if (!this._algorithmU) return this._inputNode;

    // Y-flipped UV for render-target sampling convention.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(uv().x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(float(1.0).sub(uv().y));

    const animatedP = vec2(
      uvx.mul(this._scaleU).add(this._timeU.mul(this._speedU)),
      uvy.mul(this._scaleU).add(this._timeU.mul(this._speedU).mul(float(0.73))),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash11 = (p: any): any =>
      fract((sin(dot(p, vec2(127.1, 311.7))) as any).mul(43758.5453123));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash22 = (p: any): any =>
      vec2(
        hash11(p.add(vec2(0.0, 0.0))),
        hash11(p.add(vec2(19.19, 73.73))),
      );

    // ── Perlin-like (value noise) ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perlinNoise = (p: any): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i: any = floor(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const f: any = fract(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u: any = f.mul(f).mul(float(3.0).sub(f.mul(float(2.0))));

      const a = hash11(i);
      const b = hash11(i.add(vec2(1.0, 0.0)));
      const c = hash11(i.add(vec2(0.0, 1.0)));
      const d = hash11(i.add(vec2(1.0, 1.0)));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x1: any = (mix as any)(a, b, float(u.x));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x2: any = (mix as any)(c, d, float(u.x));
      return mix(x1, x2, float(u.y));
    };

    // ── Simplex-like ──────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simplexNoise = (p: any): any => {
      const F2 = float(0.3660254037844386);
      const G2 = float(0.21132486540518713);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = float(p.x).add(float(p.y)).mul(F2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i: any = floor(p.add(vec2(s, s)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t: any = float(i.x).add(float(i.y)).mul(G2);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x0: any = p.sub(i).add(vec2(t, t));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i1: any = select(float(x0.x).greaterThan(float(x0.y)), vec2(1.0, 0.0), vec2(0.0, 1.0));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x1: any = x0.sub(i1).add(vec2(G2, G2));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x2: any = x0.sub(vec2(1.0, 1.0)).add(vec2(G2.mul(float(2.0)), G2.mul(float(2.0))));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grad = (cell: any): any => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h: any = hash22(i.add(cell)).mul(float(2.0)).sub(vec2(1.0, 1.0));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invLen: any = float(1.0).div(max(length(h), float(0.0001)));
        return h.mul(invLen);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contrib = (x: any, g: any): any => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const atten: any = max(float(0.5).sub(dot(x, x)), float(0.0));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const atten2: any = atten.mul(atten);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const atten4: any = atten2.mul(atten2);
        return atten4.mul(dot(x, g));
      };

      const g0 = grad(vec2(0.0, 0.0));
      const g1 = grad(i1);
      const g2 = grad(vec2(1.0, 1.0));

      // 70 is canonical normalization for 2D simplex implementations.
      const n = float(70.0)
        .mul(contrib(x0, g0).add(contrib(x1, g1)).add(contrib(x2, g2)));
      return clamp(n.mul(float(0.5)).add(float(0.5)), float(0.0), float(1.0));
    };

    // ── Voronoi (cellular) ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voronoiNoise = (p: any): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i: any = floor(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const f: any = fract(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let minDist: any = float(1000.0);

      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          const cell = vec2(float(x), float(y));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const jitter: any = hash22(i.add(cell));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r: any = cell.add(jitter).sub(f);
          const d = dot(r, r);
          minDist = min(minDist, d);
        }
      }

      return clamp(float(1.0).sub(minDist.mul(float(2.5))), float(0.0), float(1.0));
    };

    const perlin = perlinNoise(animatedP);
    const simplex = simplexNoise(animatedP);
    const voronoi = voronoiNoise(animatedP);

    const rawNoise = select(
      this._algorithmU.lessThan(float(0.5)),
      perlin,
      select(this._algorithmU.lessThan(float(1.5)), simplex, voronoi),
    );

    const inverted = select(
      this._invertU.greaterThan(float(0.5)),
      float(1.0).sub(rawNoise),
      rawNoise,
    );
    const contrasted = clamp(
      inverted
        .sub(float(0.5))
        .mul(max(this._contrastU, float(0.0)))
        .add(float(0.5)),
      float(0.0),
      float(1.0),
    );

    // Intensity blends source -> generated noise, so the layer can work as
    // a filter without forcing full replacement when intensity is low.
    const src = this._inputNode;
    const outColor = vec3(
      mix(float(src.r), contrasted, this._intensityU),
      mix(float(src.g), contrasted, this._intensityU),
      mix(float(src.b), contrasted, this._intensityU),
    );

    return vec4(outColor, float(1.0));
  }

  override updateUniforms(params: ShaderParam[]): void {
    let speed = this._speedU.value as number;

    for (const p of params) {
      switch (p.key) {
        case "algorithm": {
          const map: Record<string, number> = {
            perlin: 0,
            simplex: 1,
            voronoi: 2,
          };
          this._algorithmU.value = map[p.value as string] ?? 0;
          break;
        }
        case "scale":
          this._scaleU.value = typeof p.value === "number" ? p.value : 8;
          break;
        case "intensity":
          this._intensityU.value = typeof p.value === "number" ? p.value : 1;
          break;
        case "speed":
          speed = typeof p.value === "number" ? p.value : 0.35;
          this._speedU.value = speed;
          break;
        case "contrast":
          this._contrastU.value = typeof p.value === "number" ? p.value : 1;
          break;
        case "invert":
          this._invertU.value = p.value ? 1.0 : 0.0;
          break;
      }
    }

    this._needsAnimation = Math.abs(speed) > 1e-6;
  }
}
