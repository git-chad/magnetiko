import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  sin,
  cos,
  abs,
  length,
  sqrt,
  dot,
  min,
  max,
  clamp,
  smoothstep,
  mix,
  select,
  exp,
  texture as tslTexture,
  screenSize,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// SdfShapesPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SDF Shapes layer.
 *
 * - 2D mode: circle, box, rounded-box, ring
 * - 3D mode: sphere, box, torus (raymarched)
 */
export class SdfShapesPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _modeU: any; // 0=2d, 1=3d
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _shape2DU: any; // 0=circle,1=box,2=rounded-box,3=ring
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _shape3DU: any; // 0=sphere,1=box,2=torus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _centerXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _centerYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _sizeXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _sizeYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _sizeZU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _radiusU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _thicknessU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _roundnessU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _rotationU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _softnessU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _intensityU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _invertU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _animateU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _speedU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _timeU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorRU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorGU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorBU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _bgRU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _bgGU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _bgBU: any;

  private _needsAnimation = false;

  constructor(layerId: string) {
    super(layerId);
    // super() calls _buildEffectNode() before uniforms exist.

    this._modeU = uniform(0.0);
    this._shape2DU = uniform(0.0);
    this._shape3DU = uniform(0.0);
    this._centerXU = uniform(0.5);
    this._centerYU = uniform(0.5);
    this._sizeXU = uniform(0.28);
    this._sizeYU = uniform(0.22);
    this._sizeZU = uniform(0.24);
    this._radiusU = uniform(0.32);
    this._thicknessU = uniform(0.08);
    this._roundnessU = uniform(0.06);
    this._rotationU = uniform(0.0);
    this._softnessU = uniform(0.03);
    this._intensityU = uniform(0.9);
    this._invertU = uniform(0.0);
    this._animateU = uniform(0.0);
    this._speedU = uniform(0.45);
    this._timeU = uniform(0.0);

    const [shapeR, shapeG, shapeB] = parseCSSColorRGB("#ff6a1f");
    const [bgR, bgG, bgB] = parseCSSColorRGB("#0d0f10");
    this._colorRU = uniform(shapeR);
    this._colorGU = uniform(shapeG);
    this._colorBU = uniform(shapeB);
    this._bgRU = uniform(bgR);
    this._bgGU = uniform(bgG);
    this._bgBU = uniform(bgB);

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

    // Y-flipped UV (render-target convention).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(uv().x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(float(1.0).sub(uv().y));
    const src = this._inputNode;

    const aspect = screenSize.x.div(screenSize.y);
    const x = float(uvx.sub(float(0.5)).mul(float(2.0)).mul(aspect));
    const y = float(uvy.sub(float(0.5)).mul(float(2.0)));

    const centerX = float(this._centerXU.sub(float(0.5)).mul(float(2.0)).mul(aspect));
    const centerY = float(this._centerYU.sub(float(0.5)).mul(float(2.0)));
    const localX = float(x.sub(centerX));
    const localY = float(y.sub(centerY));

    const t = float(
      select(
        this._animateU.greaterThan(float(0.5)),
        this._timeU.mul(this._speedU),
        float(0.0),
      ),
    );
    const rot = float(this._rotationU.add(t));
    const c = float(cos(rot));
    const s = float(sin(rot));

    const qx = float(localX.mul(c).sub(localY.mul(s)));
    const qy = float(localX.mul(s).add(localY.mul(c)));
    const q2 = vec2(qx, qy);

    // ── 2D SDF primitives ─────────────────────────────────────────────────
    const circleD = float(length(q2).sub(this._radiusU));

    const boxHalf = vec2(this._sizeXU, this._sizeYU);
    const boxDelta = abs(q2).sub(boxHalf);
    const boxOutside = float(length(max(boxDelta, vec2(0.0, 0.0))));
    const boxInside = float(min(max(float(boxDelta.x), float(boxDelta.y)), float(0.0)));
    const boxD = float(boxOutside.add(boxInside));

    const roundedBoxD = float(boxD.sub(this._roundnessU));
    const ringD = float(abs(length(q2).sub(this._radiusU)).sub(this._thicknessU));

    const sdf2D = select(
      this._shape2DU.lessThan(float(0.5)),
      circleD,
      select(
        this._shape2DU.lessThan(float(1.5)),
        boxD,
        select(this._shape2DU.lessThan(float(2.5)), roundedBoxD, ringD),
      ),
    );

    const soft2D = max(this._softnessU, float(0.0005));
    let mask2D = float(1.0).sub(smoothstep(float(0.0), soft2D, sdf2D));
    mask2D = select(this._invertU.greaterThan(float(0.5)), float(1.0).sub(mask2D), mask2D);

    // ── 3D SDF primitives (raymarch) ──────────────────────────────────────
    const ro = vec3(float(0.0), float(0.0), float(2.6));
    const rdRaw = vec3(x, y, float(-1.8));
    const rdLen = max(length(rdRaw), float(0.0001));
    const rd = rdRaw.div(rdLen);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdf3D = (p: any): any => {
      const py = float(p.y);
      const pxIn = float(p.x);
      const pzIn = float(p.z);
      const cx = float(cos(rot));
      const sx = float(sin(rot));
      const px = float(pxIn.mul(cx).sub(pzIn.mul(sx)));
      const pz = float(pxIn.mul(sx).add(pzIn.mul(cx)));
      const pr = vec3(px, py, pz);

      const sphereD = float(length(pr).sub(this._radiusU));

      const boxQ = abs(pr).sub(vec3(this._sizeXU, this._sizeYU, this._sizeZU));
      const boxOut = float(length(max(boxQ, vec3(0.0, 0.0, 0.0))));
      const boxIn = float(
        min(
          max(float(boxQ.x), max(float(boxQ.y), float(boxQ.z))),
          float(0.0),
        ),
      );
      const boxDist = float(boxOut.add(boxIn));

      const torusQ = vec2(
        float(length(vec2(float(pr.x), float(pr.z))).sub(this._radiusU)),
        float(pr.y),
      );
      const torusD = float(length(torusQ).sub(this._thicknessU));

      return select(
        this._shape3DU.lessThan(float(0.5)),
        sphereD,
        select(this._shape3DU.lessThan(float(1.5)), boxDist, torusD),
      );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let travel: any = float(0.0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hitMask: any = float(0.0);

    for (let i = 0; i < 40; i++) {
      const p = ro.add(rd.mul(travel));
      const d = sdf3D(p);
      const isHit = d.lessThan(float(0.0015));
      hitMask = select(isHit, float(1.0), hitMask);

      const stepD = max(d.mul(float(0.85)), float(0.0025));
      travel = select(
        hitMask.lessThan(float(0.5)),
        min(travel.add(stepD), float(12.0)),
        travel,
      );
    }

    const hitPos = ro.add(rd.mul(travel));
    const e = float(0.003);
    const nx = sdf3D(hitPos.add(vec3(e, 0.0, 0.0))).sub(sdf3D(hitPos.sub(vec3(e, 0.0, 0.0))));
    const ny = sdf3D(hitPos.add(vec3(0.0, e, 0.0))).sub(sdf3D(hitPos.sub(vec3(0.0, e, 0.0))));
    const nz = sdf3D(hitPos.add(vec3(0.0, 0.0, e))).sub(sdf3D(hitPos.sub(vec3(0.0, 0.0, e))));
    const nRaw = vec3(nx, ny, nz);
    const n = nRaw.div(max(length(nRaw), float(0.0001)));
    const lightDir = vec3(float(-0.55), float(0.7), float(0.45))
      .div(max(length(vec3(float(-0.55), float(0.7), float(0.45))), float(0.0001)));
    const diffuse = clamp(dot(n, lightDir), float(0.0), float(1.0));
    const fog = clamp(exp(travel.mul(float(-0.18))), float(0.0), float(1.0));

    let mask3D = hitMask.mul(fog);
    mask3D = select(this._invertU.greaterThan(float(0.5)), float(1.0).sub(mask3D), mask3D);

    const modeMask = select(this._modeU.lessThan(float(0.5)), mask2D, mask3D);
    const shapeShade = select(
      this._modeU.lessThan(float(0.5)),
      float(1.0),
      float(0.2).add(diffuse.mul(float(0.8))),
    );

    const fg = vec3(this._colorRU, this._colorGU, this._colorBU).mul(shapeShade);
    const bg = vec3(this._bgRU, this._bgGU, this._bgBU);
    const sdfColor = vec3(
      mix(float(bg.x), float(fg.x), modeMask),
      mix(float(bg.y), float(fg.y), modeMask),
      mix(float(bg.z), float(fg.z), modeMask),
    );

    const outColor = vec3(
      mix(float(src.r), float(sdfColor.x), this._intensityU),
      mix(float(src.g), float(sdfColor.y), this._intensityU),
      mix(float(src.b), float(sdfColor.z), this._intensityU),
    );

    return vec4(outColor, float(1.0));
  }

  override updateUniforms(params: ShaderParam[]): void {
    let animate = this._animateU.value > 0.5;
    let speed = this._speedU.value as number;

    for (const p of params) {
      switch (p.key) {
        case "mode": {
          const map: Record<string, number> = { "2d": 0, "3d": 1 };
          this._modeU.value = map[p.value as string] ?? 0;
          break;
        }
        case "shape2d": {
          const map: Record<string, number> = {
            circle: 0,
            box: 1,
            "rounded-box": 2,
            ring: 3,
          };
          this._shape2DU.value = map[p.value as string] ?? 0;
          break;
        }
        case "shape3d": {
          const map: Record<string, number> = {
            sphere: 0,
            box: 1,
            torus: 2,
          };
          this._shape3DU.value = map[p.value as string] ?? 0;
          break;
        }
        case "center": {
          const [x, y] = Array.isArray(p.value) ? (p.value as number[]) : [0.5, 0.5];
          this._centerXU.value = Number.isFinite(x) ? x : 0.5;
          this._centerYU.value = Number.isFinite(y) ? y : 0.5;
          break;
        }
        case "size2d": {
          const [x, y] = Array.isArray(p.value) ? (p.value as number[]) : [0.28, 0.22];
          this._sizeXU.value = Number.isFinite(x) ? x : 0.28;
          this._sizeYU.value = Number.isFinite(y) ? y : 0.22;
          break;
        }
        case "sizeZ":
          this._sizeZU.value = typeof p.value === "number" ? p.value : 0.24;
          break;
        case "radius":
          this._radiusU.value = typeof p.value === "number" ? p.value : 0.32;
          break;
        case "thickness":
          this._thicknessU.value = typeof p.value === "number" ? p.value : 0.08;
          break;
        case "roundness":
          this._roundnessU.value = typeof p.value === "number" ? p.value : 0.06;
          break;
        case "rotation":
          this._rotationU.value = typeof p.value === "number" ? p.value : 0;
          break;
        case "softness":
          this._softnessU.value = typeof p.value === "number" ? p.value : 0.03;
          break;
        case "intensity":
          this._intensityU.value = typeof p.value === "number" ? p.value : 0.9;
          break;
        case "invert":
          this._invertU.value = p.value ? 1.0 : 0.0;
          break;
        case "animate":
          animate = p.value === true;
          this._animateU.value = animate ? 1.0 : 0.0;
          break;
        case "speed":
          speed = typeof p.value === "number" ? p.value : 0.45;
          this._speedU.value = speed;
          break;
        case "color":
          setColorUniforms(p.value as string, this._colorRU, this._colorGU, this._colorBU);
          break;
        case "background":
          setColorUniforms(p.value as string, this._bgRU, this._bgGU, this._bgBU);
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

  return [1, 1, 1];
}
