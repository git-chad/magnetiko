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
  dot,
  min,
  max,
  clamp,
  mix,
  select,
  screenSize,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Shapes3DPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analytic 3D shape layer.
 *
 * Shapes:
 * - sphere
 * - cube
 * - torus
 * - prism
 *
 * Includes material presets, animation modes, and orbit-style camera params.
 */
export class Shapes3DPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _shapeU: any; // 0=sphere 1=cube 2=torus 3=prism
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _materialU: any; // 0=matte 1=metal 2=neon 3=clay
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _animU: any; // 0=none 1=rotate 2=float 3=rotate-float

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
  private readonly _baseRotationU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _intensityU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _ambientU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _camYawU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _camPitchU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _camDistanceU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _autoOrbitU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _orbitSpeedU: any;

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

    this._shapeU = uniform(0.0);
    this._materialU = uniform(0.0);
    this._animU = uniform(0.0);

    this._sizeXU = uniform(0.36);
    this._sizeYU = uniform(0.28);
    this._sizeZU = uniform(0.24);
    this._radiusU = uniform(0.38);
    this._thicknessU = uniform(0.1);
    this._roundnessU = uniform(0.05);
    this._baseRotationU = uniform(0.0);
    this._intensityU = uniform(0.9);
    this._ambientU = uniform(0.18);

    this._camYawU = uniform(0.0);
    this._camPitchU = uniform(0.15);
    this._camDistanceU = uniform(2.8);
    this._autoOrbitU = uniform(0.0);
    this._orbitSpeedU = uniform(0.3);

    this._speedU = uniform(0.55);
    this._timeU = uniform(0.0);

    const [shapeR, shapeG, shapeB] = parseCSSColorRGB("#ff6a1f");
    const [bgR, bgG, bgB] = parseCSSColorRGB("#0b0e10");
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
    if (!this._shapeU) return this._inputNode;

    // Y-flipped UV (render-target convention).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(uv().x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(float(1.0).sub(uv().y));
    const src = this._inputNode;

    const aspect = screenSize.x.div(screenSize.y);
    const viewX = float(uvx.sub(float(0.5)).mul(float(2.0)).mul(aspect));
    const viewY = float(uvy.sub(float(0.5)).mul(float(2.0)));

    const tAnim = float(this._timeU.mul(this._speedU));
    const orbitYaw = select(
      this._autoOrbitU.greaterThan(float(0.5)),
      this._camYawU.add(this._timeU.mul(this._orbitSpeedU)),
      this._camYawU,
    );
    const yaw = float(orbitYaw);
    const pitch = float(this._camPitchU);
    const camDist = max(this._camDistanceU, float(0.5));

    // Camera ray setup.
    let ro = vec3(0.0, 0.0, camDist);
    let rd = vec3(viewX, viewY, float(-1.8));
    rd = rd.div(max(length(rd), float(0.0001)));

    const cy = float(cos(yaw));
    const sy = float(sin(yaw));
    const cp = float(cos(pitch));
    const sp = float(sin(pitch));

    // Rotate around Y (orbit yaw).
    ro = vec3(
      float(ro.x).mul(cy).add(float(ro.z).mul(sy)),
      float(ro.y),
      float(ro.z).mul(cy).sub(float(ro.x).mul(sy)),
    );
    rd = vec3(
      float(rd.x).mul(cy).add(float(rd.z).mul(sy)),
      float(rd.y),
      float(rd.z).mul(cy).sub(float(rd.x).mul(sy)),
    );

    // Rotate around X (orbit pitch).
    ro = vec3(
      float(ro.x),
      float(ro.y).mul(cp).sub(float(ro.z).mul(sp)),
      float(ro.y).mul(sp).add(float(ro.z).mul(cp)),
    );
    rd = vec3(
      float(rd.x),
      float(rd.y).mul(cp).sub(float(rd.z).mul(sp)),
      float(rd.y).mul(sp).add(float(rd.z).mul(cp)),
    );

    // Object animation transform.
    const rotateOn = select(
      this._animU.lessThan(float(0.5)),
      float(0.0),
      select(
        this._animU.lessThan(float(1.5)),
        float(1.0),
        select(this._animU.lessThan(float(2.5)), float(0.0), float(1.0)),
      ),
    );
    const floatOn = select(this._animU.lessThan(float(1.5)), float(0.0), float(1.0));

    const objRot = this._baseRotationU.add(tAnim.mul(rotateOn));
    const objLift = sin(tAnim.mul(float(1.7))).mul(float(0.18)).mul(floatOn);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdfShape = (pIn: any): any => {
      const px0 = float(pIn.x);
      const py0 = float(pIn.y).sub(objLift);
      const pz0 = float(pIn.z);

      const cr = float(cos(objRot));
      const sr = float(sin(objRot));
      const px = px0.mul(cr).sub(pz0.mul(sr));
      const pz = px0.mul(sr).add(pz0.mul(cr));
      const py = py0;
      const p = vec3(px, py, pz);

      const sphereD = float(length(p).sub(this._radiusU));

      const boxQ = abs(p).sub(vec3(this._sizeXU, this._sizeYU, this._sizeZU));
      const boxOut = float(length(max(boxQ, vec3(0.0, 0.0, 0.0))));
      const boxIn = float(min(max(float(boxQ.x), max(float(boxQ.y), float(boxQ.z))), float(0.0)));
      const cubeD = float(boxOut.add(boxIn).sub(this._roundnessU));

      const torusQ = vec2(
        float(length(vec2(float(p.x), float(p.z))).sub(this._radiusU)),
        float(p.y),
      );
      const torusD = float(length(torusQ).sub(this._thicknessU));

      // Triangular prism approximation.
      const triBase = max(
        float(abs(float(p.x)).mul(float(0.866025)).add(float(p.y).mul(float(0.5)))),
        float(p.y).negate(),
      ).sub(this._radiusU.mul(float(0.7)));
      const prismD = max(triBase, abs(float(p.z)).sub(this._sizeZU));

      return select(
        this._shapeU.lessThan(float(0.5)),
        sphereD,
        select(this._shapeU.lessThan(float(1.5)), cubeD, select(this._shapeU.lessThan(float(2.5)), torusD, prismD)),
      );
    };

    // Raymarch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let travel: any = float(0.0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hitMask: any = float(0.0);

    for (let i = 0; i < 52; i++) {
      const p = ro.add(rd.mul(travel));
      const d = sdfShape(p);
      const hitNow = d.lessThan(float(0.0015));
      hitMask = select(hitNow, float(1.0), hitMask);
      const stepDist = max(d.mul(float(0.9)), float(0.002));
      travel = select(hitMask.lessThan(float(0.5)), min(travel.add(stepDist), float(18.0)), travel);
    }

    // Shading.
    const hitPos = ro.add(rd.mul(travel));
    const eps = float(0.003);
    const nx = sdfShape(hitPos.add(vec3(eps, 0.0, 0.0))).sub(sdfShape(hitPos.sub(vec3(eps, 0.0, 0.0))));
    const ny = sdfShape(hitPos.add(vec3(0.0, eps, 0.0))).sub(sdfShape(hitPos.sub(vec3(0.0, eps, 0.0))));
    const nz = sdfShape(hitPos.add(vec3(0.0, 0.0, eps))).sub(sdfShape(hitPos.sub(vec3(0.0, 0.0, eps))));
    const nRaw = vec3(nx, ny, nz);
    const n = nRaw.div(max(length(nRaw), float(0.0001)));

    const lightDirRaw = vec3(float(-0.58), float(0.71), float(0.38));
    const lightDir = lightDirRaw.div(max(length(lightDirRaw), float(0.0001)));
    const viewDir = rd.negate();

    const lambert = clamp(dot(n, lightDir), float(0.0), float(1.0));
    const hRaw = lightDir.add(viewDir);
    const h = hRaw.div(max(length(hRaw), float(0.0001)));
    const ndh = clamp(dot(n, h), float(0.0), float(1.0));
    const spec = ndh.mul(ndh).mul(ndh).mul(ndh).mul(ndh).mul(ndh).mul(ndh).mul(ndh); // ndh^8

    const fog = clamp(float(1.0).div(float(1.0).add(travel.mul(float(0.25)))), float(0.0), float(1.0));
    const visibility = hitMask.mul(fog);

    const baseColor = vec3(this._colorRU, this._colorGU, this._colorBU);
    const bgColor = vec3(this._bgRU, this._bgGU, this._bgBU);

    // Material presets.
    const matteShade = this._ambientU.add(lambert.mul(float(0.92)));
    const metalShade = this._ambientU.add(lambert.mul(float(0.65))).add(spec.mul(float(0.9)));
    const neonShade = this._ambientU.add(lambert.mul(float(0.35))).add(spec.mul(float(0.2))).add(float(0.55));
    const clayShade = this._ambientU.add(lambert.mul(float(0.72))).add(spec.mul(float(0.08)));

    const shade = select(
      this._materialU.lessThan(float(0.5)),
      matteShade,
      select(
        this._materialU.lessThan(float(1.5)),
        metalShade,
        select(this._materialU.lessThan(float(2.5)), neonShade, clayShade),
      ),
    );

    const litShape = vec3(
      float(baseColor.x).mul(shade),
      float(baseColor.y).mul(shade),
      float(baseColor.z).mul(shade),
    );
    const shapeColor = vec3(
      mix(float(bgColor.x), float(litShape.x), visibility),
      mix(float(bgColor.y), float(litShape.y), visibility),
      mix(float(bgColor.z), float(litShape.z), visibility),
    );

    const outColor = vec3(
      mix(float(src.r), float(shapeColor.x), this._intensityU),
      mix(float(src.g), float(shapeColor.y), this._intensityU),
      mix(float(src.b), float(shapeColor.z), this._intensityU),
    );

    return vec4(outColor, float(1.0));
  }

  override updateUniforms(params: ShaderParam[]): void {
    let animMode = this._animU.value as number;
    let speed = this._speedU.value as number;
    let autoOrbit = this._autoOrbitU.value > 0.5;
    let orbitSpeed = this._orbitSpeedU.value as number;

    for (const p of params) {
      switch (p.key) {
        case "shape": {
          const map: Record<string, number> = {
            sphere: 0,
            cube: 1,
            torus: 2,
            prism: 3,
          };
          this._shapeU.value = map[p.value as string] ?? 0;
          break;
        }
        case "material": {
          const map: Record<string, number> = {
            matte: 0,
            metal: 1,
            neon: 2,
            clay: 3,
          };
          this._materialU.value = map[p.value as string] ?? 0;
          break;
        }
        case "animation": {
          const map: Record<string, number> = {
            none: 0,
            rotate: 1,
            float: 2,
            "rotate-float": 3,
          };
          animMode = map[p.value as string] ?? 0;
          this._animU.value = animMode;
          break;
        }
        case "size": {
          const [x, y, z] = Array.isArray(p.value) ? (p.value as number[]) : [0.36, 0.28, 0.24];
          this._sizeXU.value = Number.isFinite(x) ? x : 0.36;
          this._sizeYU.value = Number.isFinite(y) ? y : 0.28;
          this._sizeZU.value = Number.isFinite(z) ? z : 0.24;
          break;
        }
        case "radius":
          this._radiusU.value = typeof p.value === "number" ? p.value : 0.38;
          break;
        case "thickness":
          this._thicknessU.value = typeof p.value === "number" ? p.value : 0.1;
          break;
        case "roundness":
          this._roundnessU.value = typeof p.value === "number" ? p.value : 0.05;
          break;
        case "rotation":
          this._baseRotationU.value = typeof p.value === "number" ? p.value : 0;
          break;
        case "intensity":
          this._intensityU.value = typeof p.value === "number" ? p.value : 0.9;
          break;
        case "ambient":
          this._ambientU.value = typeof p.value === "number" ? p.value : 0.18;
          break;
        case "cameraYaw":
          this._camYawU.value = typeof p.value === "number" ? p.value : 0;
          break;
        case "cameraPitch":
          this._camPitchU.value = typeof p.value === "number" ? p.value : 0.15;
          break;
        case "cameraDistance":
          this._camDistanceU.value = typeof p.value === "number" ? p.value : 2.8;
          break;
        case "autoOrbit":
          autoOrbit = p.value === true;
          this._autoOrbitU.value = autoOrbit ? 1.0 : 0.0;
          break;
        case "orbitSpeed":
          orbitSpeed = typeof p.value === "number" ? p.value : 0.3;
          this._orbitSpeedU.value = orbitSpeed;
          break;
        case "speed":
          speed = typeof p.value === "number" ? p.value : 0.55;
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

    const hasAnim = animMode > 0 && Math.abs(speed) > 1e-6;
    const hasOrbit = autoOrbit && Math.abs(orbitSpeed) > 1e-6;
    this._needsAnimation = hasAnim || hasOrbit;
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
