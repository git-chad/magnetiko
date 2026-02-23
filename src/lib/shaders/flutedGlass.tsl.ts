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
  length,
  mix,
  select,
  screenSize,
  texture as tslTexture,
  atan,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-normalised 9-tap Gaussian weights (σ ≈ 1.5). Sum = 1. */
const WEIGHTS = [0.0076, 0.0361, 0.1096, 0.2135, 0.2666, 0.2135, 0.1096, 0.0361, 0.0076];
const OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

// ─────────────────────────────────────────────────────────────────────────────
// FlutedGlassPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fluted-glass filter pass.
 *
 * Simulates viewing the scene through ribbed (fluted) glass. Each flute acts
 * as a cylindrical lens that refracts and distorts the UV lookup.
 *
 * Per-flute distortion formula:
 *   u_local = fract(coord * numFlutes)            — [0,1) position within flute
 *   phase   = (u_local - 0.5) × π                — [-π/2, π/2]
 *   offset  = sin(phase) × distortion × (ior - 1) — UV displacement (S-curve)
 *
 * Orientations (_orientationU):
 *   0 = vertical   — ridges top↔bottom, distortion in X, blur in Y
 *   1 = horizontal — ridges left↔right, distortion in Y, blur in X
 *   2 = radial     — sectors from screen center, tangential distortion & blur
 *
 * Directional blur (9-tap Gaussian) runs along the flute axis at the refracted
 * UV position. blurU = 0 degenerates to a single sharp sample.
 */
export class FlutedGlassPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _flutesU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _orientationU: any;   // 0=vertical 1=horizontal 2=radial
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _distortU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _iorU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blurU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _tintRU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _tintGU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _tintBU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _tintAU: any;

  // 9 mutable texture nodes for the directional blur taps — updated each frame.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _blurSamples: any[] = [];

  constructor(layerId: string) {
    super(layerId);

    this._flutesU      = uniform(20.0);
    this._orientationU = uniform(0.0);
    this._distortU     = uniform(0.5);
    this._iorU         = uniform(1.3);
    this._blurU        = uniform(0.5);
    this._tintRU       = uniform(0.0);
    this._tintGU       = uniform(0.0);
    this._tintBU       = uniform(0.0);
    this._tintAU       = uniform(0.0);

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
    for (const s of this._blurSamples) s.value = inputTex;
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this._flutesU) return this._inputNode;

    const PI     = float(Math.PI);
    const TWO_PI = float(Math.PI * 2.0);
    const iorM1  = this._iorU.sub(float(1.0));

    // Y-flipped UV components — kept as explicit float nodes to avoid TSL
    // swizzle-access typing issues (vec2.x/y are typed broadly by Three.js).
    const uvx = float(uv().x);
    const uvy = float(float(1.0).sub(uv().y));
    const rtUV = vec2(uvx, uvy);   // used where a vec2 node is needed

    // ── Vertical flutes ────────────────────────────────────────────────────
    // Ridges run top↔bottom; distortion offsets X; blur runs along Y.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u_v: any = fract((uvx as any).mul(this._flutesU));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disp_v = (vec2 as any)(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      uvx.add((sin(u_v.sub(float(0.5)).mul(PI)) as any).mul(this._distortU).mul(iorM1)),
      uvy,
    );
    const bdir_v = vec2(float(0.0), this._blurU.div(screenSize.y));

    // ── Horizontal flutes ──────────────────────────────────────────────────
    // Ridges run left↔right; distortion offsets Y; blur runs along X.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u_h: any = fract((uvy as any).mul(this._flutesU));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disp_h = (vec2 as any)(
      uvx,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      uvy.add((sin(u_h.sub(float(0.5)).mul(PI)) as any).mul(this._distortU).mul(iorM1)),
    );
    const bdir_h = vec2(this._blurU.div(screenSize.x), float(0.0));

    // ── Radial flutes ──────────────────────────────────────────────────────
    // Angular sectors from screen center. Distortion is tangential (perpendicular
    // to the radial direction); blur runs radially outward.
    const dx = float(uvx.sub(float(0.5)));
    const dy = float(uvy.sub(float(0.5)));
    // atan(y, x) — two-arg form maps to GLSL atan(y,x) / WGSL atan2(y,x).
    const angle = atan(dy, dx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u_r: any = fract((angle as any).div(TWO_PI).mul(this._flutesU).add(float(0.5)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mag_r: any = (sin(u_r.sub(float(0.5)).mul(PI)) as any).mul(this._distortU).mul(iorM1);
    // Radial unit vector (guard against divide-by-zero at center).
    const rlen = float(length(vec2(dx, dy)).add(float(1e-5)));
    const nx   = float(dx.div(rlen));   // radial X component
    const ny   = float(dy.div(rlen));   // radial Y component
    // Tangent = (-ny, nx); displacement applied in UV space.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disp_r = (vec2 as any)(
      uvx.add(ny.negate().mul(mag_r)),
      uvy.add(nx.mul(mag_r)),
    );
    // Blur along radial direction (outward smear along each spoke).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bdir_r = (vec2 as any)(
      nx.mul(this._blurU).div(screenSize.x),
      ny.mul(this._blurU).div(screenSize.y),
    );

    // ── Select displaced UV + blur direction by orientation ────────────────
    const disp = select(
      this._orientationU.lessThan(float(0.5)),
      disp_v,
      select(this._orientationU.lessThan(float(1.5)), disp_h, disp_r),
    );
    const bdir = select(
      this._orientationU.lessThan(float(0.5)),
      bdir_v,
      select(this._orientationU.lessThan(float(1.5)), bdir_h, bdir_r),
    );

    // ── 9-tap Gaussian blur along the flute axis at the displaced UV ───────
    // blurU = 0 → all taps land on disp; weighted sum = 1.0 × sample = sharp.
    this._blurSamples = OFFSETS.map((off) =>
      tslTexture(this._inputNode.value, disp.add(bdir.mul(float(off)))),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let acc: any = vec4(0, 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      acc = acc.add(this._blurSamples[i].mul(float(WEIGHTS[i])));
    }

    // ── Tint ──────────────────────────────────────────────────────────────
    // tintAU = 0 (default) → pure glass with no tint.
    const glassColor = vec3(float(acc.r), float(acc.g), float(acc.b));
    const tintColor  = vec3(this._tintRU, this._tintGU, this._tintBU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tinted     = (mix as any)(glassColor, tintColor, float(this._tintAU));

    return vec4(tinted, float(1.0));
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "flutes":
          this._flutesU.value = typeof p.value === "number" ? p.value : 20;
          break;
        case "orientation": {
          const map: Record<string, number> = { vertical: 0, horizontal: 1, radial: 2 };
          this._orientationU.value = map[p.value as string] ?? 0;
          break;
        }
        case "distortionStrength":
          this._distortU.value = typeof p.value === "number" ? p.value : 0.5;
          break;
        case "refractionIndex":
          this._iorU.value = typeof p.value === "number" ? p.value : 1.3;
          break;
        case "blur":
          this._blurU.value = typeof p.value === "number" ? p.value : 0.5;
          break;
        case "tint": {
          const [r, g, b, a] = parseCSSColor(p.value as string);
          this._tintRU.value = r;
          this._tintGU.value = g;
          this._tintBU.value = b;
          this._tintAU.value = a;
          break;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a CSS colour string to [r, g, b, a] in [0, 1].
 * Handles rgba(...), rgb(...), and hex formats.
 */
function parseCSSColor(css: string): [number, number, number, number] {
  const m = css.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (m) {
    return [
      parseFloat(m[1]) / 255,
      parseFloat(m[2]) / 255,
      parseFloat(m[3]) / 255,
      m[4] !== undefined ? parseFloat(m[4]) : 1.0,
    ];
  }
  const c = new THREE.Color();
  try { c.setStyle(css); } catch { /* ignore */ }
  return [c.r, c.g, c.b, 1.0];
}
