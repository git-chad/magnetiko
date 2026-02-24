import {
  abs,
  clamp,
  exp,
  float,
  length,
  screenSize,
  select,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import * as THREE from "three/webgpu";
import { PassNode } from "@/lib/renderer/PassNode";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RIPPLES = 16;
const MAX_RIPPLE_AGE = 3.0;
const WAVE_SPEED = 0.4;
const RING_WIDTH = 0.3;

const FLUID_SIM_RES = 1024;
const FLUID_DYE_RES = 512;
const FLUID_PRESSURE_ITERS = 12;
const FLUID_DENSITY_DISS = 0.96;
const FLUID_VELOCITY_DISS = 0.8;
const FLUID_PRESSURE_DISS = 0.92;
const FLUID_CURL = 256;
const FLUID_RADIUS = 2.45;
const FLUID_DT = 0.032;
const POINTER_SPLAT_MULTIPLIER = 3;
const MIN_SPLAT_DELTA_PX = 0.05;

type Splat = {
  x: number;
  y: number;
  dx: number;
  dy: number;
};

class DoubleFBO {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;

  constructor(
    width: number,
    height: number,
    options: THREE.RenderTargetOptions,
  ) {
    this.read = new THREE.WebGLRenderTarget(width, height, options);
    this.write = new THREE.WebGLRenderTarget(width, height, options);
  }

  get texture(): THREE.Texture {
    return this.read.texture;
  }

  swap(): void {
    const tmp = this.read;
    this.read = this.write;
    this.write = tmp;
  }

  setSize(width: number, height: number): void {
    this.read.setSize(width, height);
    this.write.setSize(width, height);
  }

  dispose(): void {
    this.read.dispose();
    this.write.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// InteractivityPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interactive effects shader pass.
 *
 * Effects (_effectU):
 *   0 = ripple
 *   1 = trail    — full fluid simulation (velocity+density+pressure+curl)
 *   2 = repel
 *   3 = attract
 *   4 = glow
 *
 * The trail mode ports the WebGL multi-pass stack 1:1:
 *   splat → curl → vorticity → divergence → pressure solve → gradient subtract
 *   → velocity advection → density advection
 */
export class InteractivityPass extends PassNode {
  // ── Mouse state ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseDXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseDYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _mouseActiveU: any;

  // ── Effect params ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _effectU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _radiusPxU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _strengthU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _decayU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorRU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorGU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorBU: any;

  // ── Ripple history ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _rippleXU: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _rippleYU: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _rippleAgeU: any[];
  private _rippleSlot = 0;

  // ── Pointer tracking for trail splats ─────────────────────────────────────
  private _canvasWidth = 1;
  private _canvasHeight = 1;
  private _isPointerInit = false;
  private _lastPointerX = 0;
  private _lastPointerY = 0;
  private _fluidNeedsInit = true;
  private readonly _splatQueue: Splat[] = [];

  // ── Fluid controls (WebGL reference defaults) ─────────────────────────────
  private _iterations = FLUID_PRESSURE_ITERS;
  private _densityDissipation = FLUID_DENSITY_DISS;
  private _velocityDissipation = FLUID_VELOCITY_DISS;
  private _pressureDissipation = FLUID_PRESSURE_DISS;
  private _curlStrength = FLUID_CURL;
  private _radius = FLUID_RADIUS;

  // ── Fluid render targets ───────────────────────────────────────────────────
  private readonly _density: DoubleFBO;
  private readonly _velocity: DoubleFBO;
  private readonly _pressure: DoubleFBO;
  private readonly _divergenceRT: THREE.WebGLRenderTarget;
  private readonly _curlRT: THREE.WebGLRenderTarget;

  // ── Fluid fullscreen scene ────────────────────────────────────────────────
  private readonly _fluidScene: THREE.Scene;
  private readonly _fluidCamera: THREE.OrthographicCamera;
  private readonly _fluidGeometry: THREE.PlaneGeometry;
  private readonly _fluidQuad: THREE.Mesh;

  // ── Fluid pass materials ───────────────────────────────────────────────────
  private readonly _clearMat: THREE.MeshBasicNodeMaterial;
  private readonly _splatMat: THREE.MeshBasicNodeMaterial;
  private readonly _advectionMat: THREE.MeshBasicNodeMaterial;
  private readonly _divergenceMat: THREE.MeshBasicNodeMaterial;
  private readonly _curlMat: THREE.MeshBasicNodeMaterial;
  private readonly _vorticityMat: THREE.MeshBasicNodeMaterial;
  private readonly _pressureMat: THREE.MeshBasicNodeMaterial;
  private readonly _gradientSubtractMat: THREE.MeshBasicNodeMaterial;

  // ── Fluid uniforms / texture nodes (mutable .value) ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _simTexelXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _simTexelYU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _clearTextureNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _clearValueU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatTargetNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatAspectU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatPointXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatPointYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatRadiusU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatColorXU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatColorYU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _splatColorZU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _advectionVelocityNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _advectionSourceNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _advectionDtU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _advectionDissipationU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _divergenceVelocityNodes: any[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _curlVelocityNodes: any[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _vorticityVelocityNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _vorticityCurlNodes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _vorticityCurlU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _vorticityDtU: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _pressurePressureNodes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _pressureDivergenceNode: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _gradientPressureNodes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _gradientVelocityNode: any;

  // ── Display nodes ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _fluidDisplayNode: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _repelNode: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _attractNode: any = null;

  constructor(layerId: string) {
    super(layerId);

    // ── Mouse ──────────────────────────────────────────────────────────────
    this._mouseXU = uniform(0.5);
    this._mouseYU = uniform(0.5);
    this._mouseDXU = uniform(0.0);
    this._mouseDYU = uniform(0.0);
    this._mouseActiveU = uniform(0.0);

    // ── Params ─────────────────────────────────────────────────────────────
    this._effectU = uniform(0.0);
    this._radiusPxU = uniform(50.0);
    this._strengthU = uniform(0.5);
    this._decayU = uniform(0.95);
    this._colorRU = uniform(100 / 255);
    this._colorGU = uniform(100 / 255);
    this._colorBU = uniform(58 / 255);

    // ── Ripple slots ───────────────────────────────────────────────────────
    this._rippleXU = Array.from({ length: MAX_RIPPLES }, () => uniform(-10.0));
    this._rippleYU = Array.from({ length: MAX_RIPPLES }, () => uniform(-10.0));
    this._rippleAgeU = Array.from({ length: MAX_RIPPLES }, () =>
      uniform(999.0),
    );

    // ── Fluid targets ──────────────────────────────────────────────────────
    this._density = new DoubleFBO(
      FLUID_DYE_RES,
      FLUID_DYE_RES,
      makeFluidRTOptions(THREE.LinearFilter),
    );
    this._velocity = new DoubleFBO(
      FLUID_SIM_RES,
      FLUID_SIM_RES,
      makeFluidRTOptions(THREE.NearestFilter),
    );
    this._pressure = new DoubleFBO(
      FLUID_SIM_RES,
      FLUID_SIM_RES,
      makeFluidRTOptions(THREE.LinearFilter),
    );
    this._divergenceRT = makeFluidRT(
      FLUID_SIM_RES,
      FLUID_SIM_RES,
      THREE.NearestFilter,
    );
    this._curlRT = makeFluidRT(
      FLUID_SIM_RES,
      FLUID_SIM_RES,
      THREE.NearestFilter,
    );

    // ── Shared uniforms for fluid graph ───────────────────────────────────
    this._simTexelXU = uniform(1 / FLUID_SIM_RES);
    this._simTexelYU = uniform(1 / FLUID_SIM_RES);

    this._clearValueU = uniform(this._pressureDissipation);

    this._splatAspectU = uniform(1.0);
    this._splatPointXU = uniform(0.5);
    this._splatPointYU = uniform(0.5);
    this._splatRadiusU = uniform(this._radius / 100);
    this._splatColorXU = uniform(0.0);
    this._splatColorYU = uniform(0.0);
    this._splatColorZU = uniform(0.0);

    this._advectionDtU = uniform(FLUID_DT);
    this._advectionDissipationU = uniform(1.0);

    this._vorticityCurlU = uniform(this._curlStrength);
    this._vorticityDtU = uniform(FLUID_DT);

    // ── Fluid graph (RT-space UV for WebGPU render targets) ───────────────
    const fluidUV: any = vec2(uv().x, float(1.0).sub(uv().y));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fuvx: any = float(fluidUV.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fuvy: any = float(fluidUV.y);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vL: any = (vec2 as any)(fuvx.sub(this._simTexelXU), fuvy);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vR: any = (vec2 as any)(fuvx.add(this._simTexelXU), fuvy);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vT: any = (vec2 as any)(fuvx, fuvy.sub(this._simTexelYU));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vB: any = (vec2 as any)(fuvx, fuvy.add(this._simTexelYU));

    // ── Clear pass ─────────────────────────────────────────────────────────
    this._clearTextureNode = tslTexture(new THREE.Texture(), fluidUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clearNode: any = vec4(
      float(this._clearTextureNode.r).mul(this._clearValueU),
      float(this._clearTextureNode.g).mul(this._clearValueU),
      float(this._clearTextureNode.b).mul(this._clearValueU),
      float(this._clearTextureNode.a).mul(this._clearValueU),
    );
    this._clearMat = makeNodeMaterial(clearNode);

    // ── Splat pass ─────────────────────────────────────────────────────────
    this._splatTargetNode = tslTexture(new THREE.Texture(), fluidUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const splatDX: any = fuvx.sub(this._splatPointXU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const splatDY: any = fuvy.sub(this._splatPointYU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const splatPX: any = splatDX.mul(this._splatAspectU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const splatAmt: any = exp(
      splatPX
        .mul(splatPX)
        .add(splatDY.mul(splatDY))
        .negate()
        .div(this._splatRadiusU),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const splatNode: any = vec4(
      float(this._splatTargetNode.r).add(splatAmt.mul(this._splatColorXU)),
      float(this._splatTargetNode.g).add(splatAmt.mul(this._splatColorYU)),
      float(this._splatTargetNode.b).add(splatAmt.mul(this._splatColorZU)),
      float(1.0),
    );
    this._splatMat = makeNodeMaterial(splatNode);

    // ── Advection pass ─────────────────────────────────────────────────────
    this._advectionVelocityNode = tslTexture(new THREE.Texture(), fluidUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advCoord: any = (vec2 as any)(
      fuvx.sub(
        this._advectionDtU
          .mul(float(this._advectionVelocityNode.r))
          .mul(this._simTexelXU),
      ),
      fuvy.sub(
        this._advectionDtU
          .mul(float(this._advectionVelocityNode.g))
          .mul(this._simTexelYU),
      ),
    );
    this._advectionSourceNode = tslTexture(new THREE.Texture(), advCoord);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advectionNode: any = vec4(
      float(this._advectionSourceNode.r).mul(this._advectionDissipationU),
      float(this._advectionSourceNode.g).mul(this._advectionDissipationU),
      float(this._advectionSourceNode.b).mul(this._advectionDissipationU),
      float(1.0),
    );
    this._advectionMat = makeNodeMaterial(advectionNode);

    // ── Divergence pass ────────────────────────────────────────────────────
    const divVelC = tslTexture(new THREE.Texture(), fluidUV);
    const divVelL = tslTexture(new THREE.Texture(), vL);
    const divVelR = tslTexture(new THREE.Texture(), vR);
    const divVelT = tslTexture(new THREE.Texture(), vT);
    const divVelB = tslTexture(new THREE.Texture(), vB);
    this._divergenceVelocityNodes = [
      divVelC,
      divVelL,
      divVelR,
      divVelT,
      divVelB,
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divLRaw: any = float(divVelL.r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divRRaw: any = float(divVelR.r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divTRaw: any = float(divVelT.g);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divBRaw: any = float(divVelB.g);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divCx: any = float(divVelC.r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divCy: any = float(divVelC.g);

    const divL = select(
      float(vL.x).lessThan(float(0.0)),
      divCx.negate(),
      divLRaw,
    );
    const divR = select(
      float(vR.x).greaterThan(float(1.0)),
      divCx.negate(),
      divRRaw,
    );
    const divT = select(
      float(vT.y).lessThan(float(0.0)),
      divCy.negate(),
      divTRaw,
    );
    const divB = select(
      float(vB.y).greaterThan(float(1.0)),
      divCy.negate(),
      divBRaw,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divergenceNode: any = vec4(
      float(0.5).mul(divR.sub(divL).add(divT.sub(divB))),
      float(0.0),
      float(0.0),
      float(1.0),
    );
    this._divergenceMat = makeNodeMaterial(divergenceNode);

    // ── Curl pass ──────────────────────────────────────────────────────────
    const curlVelL = tslTexture(new THREE.Texture(), vL);
    const curlVelR = tslTexture(new THREE.Texture(), vR);
    const curlVelT = tslTexture(new THREE.Texture(), vT);
    const curlVelB = tslTexture(new THREE.Texture(), vB);
    this._curlVelocityNodes = [curlVelL, curlVelR, curlVelT, curlVelB];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const curlNode: any = vec4(
      float(0.5).mul(
        float(curlVelR.g)
          .sub(float(curlVelL.g))
          .sub(float(curlVelT.r))
          .add(float(curlVelB.r)),
      ),
      float(0.0),
      float(0.0),
      float(1.0),
    );
    this._curlMat = makeNodeMaterial(curlNode);

    // ── Vorticity pass ─────────────────────────────────────────────────────
    this._vorticityVelocityNode = tslTexture(new THREE.Texture(), fluidUV);
    const vortCurlL = tslTexture(new THREE.Texture(), vL);
    const vortCurlR = tslTexture(new THREE.Texture(), vR);
    const vortCurlT = tslTexture(new THREE.Texture(), vT);
    const vortCurlB = tslTexture(new THREE.Texture(), vB);
    const vortCurlC = tslTexture(new THREE.Texture(), fluidUV);
    this._vorticityCurlNodes = [
      vortCurlL,
      vortCurlR,
      vortCurlT,
      vortCurlB,
      vortCurlC,
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vortForceX: any = float(0.5).mul(
      abs(float(vortCurlT.r)).sub(abs(float(vortCurlB.r))),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vortForceY: any = float(0.5).mul(
      abs(float(vortCurlR.r)).sub(abs(float(vortCurlL.r))),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vortLen: any = float(
      length((vec2 as any)(vortForceX, vortForceY)),
    ).add(float(0.0001));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vortC: any = float(vortCurlC.r);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vortFx: any = vortForceX
      .div(vortLen)
      .mul(this._vorticityCurlU)
      .mul(vortC);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vortFy: any = vortForceY
      .div(vortLen)
      .mul(this._vorticityCurlU)
      .mul(vortC)
      .mul(float(-1.0));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vorticityNode: any = vec4(
      float(this._vorticityVelocityNode.r).add(vortFx.mul(this._vorticityDtU)),
      float(this._vorticityVelocityNode.g).add(vortFy.mul(this._vorticityDtU)),
      float(0.0),
      float(1.0),
    );
    this._vorticityMat = makeNodeMaterial(vorticityNode);

    // ── Pressure pass ──────────────────────────────────────────────────────
    const pressureL = tslTexture(new THREE.Texture(), vL);
    const pressureR = tslTexture(new THREE.Texture(), vR);
    const pressureT = tslTexture(new THREE.Texture(), vT);
    const pressureB = tslTexture(new THREE.Texture(), vB);
    const pressureC = tslTexture(new THREE.Texture(), fluidUV);
    this._pressurePressureNodes = [
      pressureL,
      pressureR,
      pressureT,
      pressureB,
      pressureC,
    ];
    this._pressureDivergenceNode = tslTexture(new THREE.Texture(), fluidUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pressureNode: any = vec4(
      float(0.25).mul(
        float(pressureL.r)
          .add(float(pressureR.r))
          .add(float(pressureB.r))
          .add(float(pressureT.r))
          .sub(float(this._pressureDivergenceNode.r)),
      ),
      float(0.0),
      float(0.0),
      float(1.0),
    );
    this._pressureMat = makeNodeMaterial(pressureNode);

    // ── Gradient-subtract pass ─────────────────────────────────────────────
    const gradPressureL = tslTexture(new THREE.Texture(), vL);
    const gradPressureR = tslTexture(new THREE.Texture(), vR);
    const gradPressureT = tslTexture(new THREE.Texture(), vT);
    const gradPressureB = tslTexture(new THREE.Texture(), vB);
    this._gradientPressureNodes = [
      gradPressureL,
      gradPressureR,
      gradPressureT,
      gradPressureB,
    ];
    this._gradientVelocityNode = tslTexture(new THREE.Texture(), fluidUV);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gradientNode: any = vec4(
      float(this._gradientVelocityNode.r).sub(
        float(gradPressureR.r).sub(float(gradPressureL.r)),
      ),
      float(this._gradientVelocityNode.g).sub(
        float(gradPressureT.r).sub(float(gradPressureB.r)),
      ),
      float(0.0),
      float(1.0),
    );
    this._gradientSubtractMat = makeNodeMaterial(gradientNode);

    // ── Shared fullscreen quad for all fluid sub-passes ───────────────────
    this._fluidGeometry = new THREE.PlaneGeometry(2, 2);
    this._fluidQuad = new THREE.Mesh(this._fluidGeometry, this._clearMat);
    this._fluidQuad.frustumCulled = false;

    this._fluidScene = new THREE.Scene();
    this._fluidScene.add(this._fluidQuad);
    this._fluidCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── Build display effect node ──────────────────────────────────────────
    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  // ── Pointer API ────────────────────────────────────────────────────────────

  setPointer(
    uvX: number,
    uvY: number,
    duvX: number,
    duvY: number,
    isActive: boolean,
  ): void {
    this._mouseXU.value = uvX;
    this._mouseYU.value = uvY;
    this._mouseDXU.value = duvX;
    this._mouseDYU.value = duvY;
    this._mouseActiveU.value = isActive ? 1.0 : 0.0;

    if (!isActive) {
      this._isPointerInit = false;
      this._lastPointerX = uvX;
      this._lastPointerY = uvY;
      return;
    }

    if (!this._isPointerInit) {
      this._isPointerInit = true;
      this._lastPointerX = uvX;
      this._lastPointerY = uvY;
      return;
    }

    let dxUV = duvX;
    let dyUV = duvY;
    if (Math.abs(dxUV) <= 1e-7 && Math.abs(dyUV) <= 1e-7) {
      dxUV = uvX - this._lastPointerX;
      dyUV = uvY - this._lastPointerY;
    }
    this._lastPointerX = uvX;
    this._lastPointerY = uvY;

    const dxPx = dxUV * this._canvasWidth;
    const dyPx = dyUV * this._canvasHeight;
    if (Math.abs(dxPx) < MIN_SPLAT_DELTA_PX && Math.abs(dyPx) < MIN_SPLAT_DELTA_PX) {
      return;
    }

    this._splatQueue.push({
      x: uvX,
      y: uvY,
      dx: dxPx * POINTER_SPLAT_MULTIPLIER,
      dy: dyPx * POINTER_SPLAT_MULTIPLIER,
    });

    if (this._splatQueue.length > 64) {
      this._splatQueue.splice(0, this._splatQueue.length - 64);
    }
  }

  addClick(uvX: number, uvY: number): void {
    const s = this._rippleSlot;
    this._rippleXU[s].value = uvX;
    this._rippleYU[s].value = uvY;
    this._rippleAgeU[s].value = 0.0;
    this._rippleSlot = (s + 1) % MAX_RIPPLES;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const age = this._rippleAgeU[i].value as number;
      if (age < MAX_RIPPLE_AGE) {
        this._rippleAgeU[i].value = age + delta;
      }
    }

    this._runFluidSimulation(renderer);

    if (this._fluidDisplayNode)
      this._fluidDisplayNode.value = this._density.texture;
    if (this._repelNode) this._repelNode.value = inputTex;
    if (this._attractNode) this._attractNode.value = inputTex;

    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  override resize(width: number, height: number): void {
    this._canvasWidth = Math.max(width, 1);
    this._canvasHeight = Math.max(height, 1);
    this._fluidNeedsInit = true;
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!this._effectU) return this._inputNode;

    const rtUV: any = vec2(uv().x, float(1.0).sub(uv().y));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvx: any = float(rtUV.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvy: any = float(rtUV.y);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src: any = this._inputNode;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radUV: any = this._radiusPxU.div(screenSize.x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const radSq: any = radUV.mul(radUV);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdx: any = uvx.sub(this._mouseXU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mdy: any = uvy.sub(this._mouseYU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mDistSq: any = mdx.mul(mdx).add(mdy.mul(mdy));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mDist: any = float(length((vec2 as any)(mdx, mdy))).add(float(1e-5));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mGauss: any = exp(mDistSq.negate().div(radSq));

    // ── Ripple ─────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rippleSum: any = float(0.0);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rdx: any = uvx.sub(this._rippleXU[i]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rdy: any = uvy.sub(this._rippleYU[i]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rDist: any = float(length((vec2 as any)(rdx, rdy)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const age: any = this._rippleAgeU[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ringR: any = age.mul(float(WAVE_SPEED)).add(float(0.005));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fade: any = clamp(
        float(1.0).sub(age.div(float(MAX_RIPPLE_AGE))),
        float(0.0),
        float(1.0),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ringDelta: any = rDist.sub(ringR);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ring: any = exp(
        ringDelta
          .negate()
          .mul(ringDelta)
          .div(float(RING_WIDTH * RING_WIDTH)),
      );
      rippleSum = rippleSum.add(ring.mul(fade));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rippleIntensity: any = clamp(rippleSum, float(0.0), float(1.0)).mul(
      this._strengthU,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rippleResult: any = vec4(
      clamp(
        float(src.r).add(this._colorRU.mul(rippleIntensity)),
        float(0.0),
        float(1.0),
      ),
      clamp(
        float(src.g).add(this._colorGU.mul(rippleIntensity)),
        float(0.0),
        float(1.0),
      ),
      clamp(
        float(src.b).add(this._colorBU.mul(rippleIntensity)),
        float(0.0),
        float(1.0),
      ),
      float(1.0),
    );

    // ── Trail (full fluid density texture) ────────────────────────────────
    // Sample with RT-space UV so trail aligns with the main source frame.
    this._fluidDisplayNode = tslTexture(new THREE.Texture(), rtUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fluid: any = this._fluidDisplayNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trailResult: any = vec4(
      clamp(float(src.r).add(float(fluid.r)), float(0.0), float(1.0)),
      clamp(float(src.g).add(float(fluid.g)), float(0.0), float(1.0)),
      clamp(float(src.b).add(float(fluid.b)), float(0.0), float(1.0)),
      float(1.0),
    );

    // ── Repel ──────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repelForce: any = mGauss
      .mul(radUV)
      .mul(this._strengthU)
      .mul(this._mouseActiveU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repelUV: any = (vec2 as any)(
      uvx.add(mdx.div(mDist).mul(repelForce)),
      uvy.add(mdy.div(mDist).mul(repelForce)),
    );
    this._repelNode = tslTexture(new THREE.Texture(), repelUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repelResult: any = vec4(
      float(this._repelNode.r),
      float(this._repelNode.g),
      float(this._repelNode.b),
      float(1.0),
    );

    // ── Attract ────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attractUV: any = (vec2 as any)(
      uvx.sub(mdx.div(mDist).mul(repelForce)),
      uvy.sub(mdy.div(mDist).mul(repelForce)),
    );
    this._attractNode = tslTexture(new THREE.Texture(), attractUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attractResult: any = vec4(
      float(this._attractNode.r),
      float(this._attractNode.g),
      float(this._attractNode.b),
      float(1.0),
    );

    // ── Glow ───────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const glowVal: any = mGauss.mul(this._strengthU).mul(this._mouseActiveU);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const glowResult: any = vec4(
      clamp(
        float(src.r).add(this._colorRU.mul(glowVal)),
        float(0.0),
        float(1.0),
      ),
      clamp(
        float(src.g).add(this._colorGU.mul(glowVal)),
        float(0.0),
        float(1.0),
      ),
      clamp(
        float(src.b).add(this._colorBU.mul(glowVal)),
        float(0.0),
        float(1.0),
      ),
      float(1.0),
    );

    return select(
      this._effectU.lessThan(float(0.5)),
      rippleResult,
      select(
        this._effectU.lessThan(float(1.5)),
        trailResult,
        select(
          this._effectU.lessThan(float(2.5)),
          repelResult,
          select(this._effectU.lessThan(float(3.5)), attractResult, glowResult),
        ),
      ),
    );
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    for (const p of params) {
      switch (p.key) {
        case "effect": {
          const map: Record<string, number> = {
            ripple: 0,
            trail: 1,
            repel: 2,
            attract: 3,
            glow: 4,
          };
          this._effectU.value = map[p.value as string] ?? 0;
          break;
        }
        case "radius":
          this._radiusPxU.value = typeof p.value === "number" ? p.value : 50;
          break;
        case "strength":
          this._strengthU.value = typeof p.value === "number" ? p.value : 0.5;
          break;
        case "decay": {
          const d = typeof p.value === "number" ? p.value : 0.95;
          this._decayU.value = d;
          if (Math.abs(d - 0.95) > 1e-6) {
            this._densityDissipation = d;
          }
          break;
        }
        case "trailLength": {
          const n = typeof p.value === "number" ? p.value : 20;
          const mapped = 1.0 - 1.0 / (n * 1.5);
          this._decayU.value = mapped;
          if (n !== 20) {
            this._densityDissipation = mapped;
          }
          break;
        }
        case "color":
          parseCSSColor(
            p.value as string,
            this._colorRU,
            this._colorGU,
            this._colorBU,
          );
          break;
      }
    }
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  override dispose(): void {
    this._density.dispose();
    this._velocity.dispose();
    this._pressure.dispose();
    this._divergenceRT.dispose();
    this._curlRT.dispose();

    this._clearMat.dispose();
    this._splatMat.dispose();
    this._advectionMat.dispose();
    this._divergenceMat.dispose();
    this._curlMat.dispose();
    this._vorticityMat.dispose();
    this._pressureMat.dispose();
    this._gradientSubtractMat.dispose();

    this._fluidGeometry.dispose();
    this._fluidScene.clear();

    super.dispose();
  }

  // ── Fluid internals ────────────────────────────────────────────────────────

  private _runFluidSimulation(renderer: THREE.WebGPURenderer): void {
    if (this._fluidNeedsInit) {
      this._clearFluidTargets(renderer);
      this._fluidNeedsInit = false;
    }

    this._clearValueU.value = this._pressureDissipation;
    this._splatRadiusU.value = this._radius / 100;
    this._vorticityCurlU.value = this._curlStrength;

    for (let i = this._splatQueue.length - 1; i >= 0; i--) {
      const s = this._splatQueue.splice(i, 1)[0];
      this._splat(renderer, s.x, s.y, s.dx, s.dy);
    }

    for (const n of this._curlVelocityNodes) n.value = this._velocity.texture;
    this._renderFluidMaterial(renderer, this._curlMat, this._curlRT);

    this._vorticityVelocityNode.value = this._velocity.texture;
    for (const n of this._vorticityCurlNodes) n.value = this._curlRT.texture;
    this._renderFluidMaterial(
      renderer,
      this._vorticityMat,
      this._velocity.write,
    );
    this._velocity.swap();

    for (const n of this._divergenceVelocityNodes)
      n.value = this._velocity.texture;
    this._renderFluidMaterial(
      renderer,
      this._divergenceMat,
      this._divergenceRT,
    );

    this._clearTextureNode.value = this._pressure.texture;
    this._renderFluidMaterial(renderer, this._clearMat, this._pressure.write);
    this._pressure.swap();

    this._pressureDivergenceNode.value = this._divergenceRT.texture;
    for (let i = 0; i < this._iterations; i++) {
      for (const n of this._pressurePressureNodes)
        n.value = this._pressure.texture;
      this._renderFluidMaterial(
        renderer,
        this._pressureMat,
        this._pressure.write,
      );
      this._pressure.swap();
    }

    for (const n of this._gradientPressureNodes)
      n.value = this._pressure.texture;
    this._gradientVelocityNode.value = this._velocity.texture;
    this._renderFluidMaterial(
      renderer,
      this._gradientSubtractMat,
      this._velocity.write,
    );
    this._velocity.swap();

    this._advectionVelocityNode.value = this._velocity.texture;
    this._advectionSourceNode.value = this._velocity.texture;
    this._advectionDissipationU.value = this._velocityDissipation;
    this._renderFluidMaterial(
      renderer,
      this._advectionMat,
      this._velocity.write,
    );
    this._velocity.swap();

    this._advectionVelocityNode.value = this._velocity.texture;
    this._advectionSourceNode.value = this._density.texture;
    this._advectionDissipationU.value = this._densityDissipation;
    this._renderFluidMaterial(
      renderer,
      this._advectionMat,
      this._density.write,
    );
    this._density.swap();
  }

  private _splat(
    renderer: THREE.WebGPURenderer,
    x: number,
    y: number,
    dx: number,
    dy: number,
  ): void {
    this._splatTargetNode.value = this._velocity.texture;
    this._splatAspectU.value = this._canvasWidth / this._canvasHeight;
    this._splatPointXU.value = x;
    this._splatPointYU.value = y;
    this._splatColorXU.value = dx;
    this._splatColorYU.value = dy;
    this._splatColorZU.value = 1.0;
    this._renderFluidMaterial(renderer, this._splatMat, this._velocity.write);
    this._velocity.swap();

    this._splatTargetNode.value = this._density.texture;
    this._splatColorXU.value = Math.abs(dx) * 0.1 + 0.2;
    this._splatColorYU.value = Math.abs(dy) * 0.1 + 0.3;
    this._splatColorZU.value = Math.abs(dx + dy) * 0.05 + 0.5;
    this._renderFluidMaterial(renderer, this._splatMat, this._density.write);
    this._density.swap();
  }

  private _renderFluidMaterial(
    renderer: THREE.WebGPURenderer,
    material: THREE.MeshBasicNodeMaterial,
    target: THREE.WebGLRenderTarget,
  ): void {
    this._fluidQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this._fluidScene, this._fluidCamera);
  }

  private _clearFluidTargets(renderer: THREE.WebGPURenderer): void {
    const targets = [
      this._density.read,
      this._density.write,
      this._velocity.read,
      this._velocity.write,
      this._pressure.read,
      this._pressure.write,
      this._divergenceRT,
      this._curlRT,
    ];

    for (const target of targets) {
      renderer.setRenderTarget(target);
      renderer.clear();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeFluidRTOptions(filter: number): THREE.RenderTargetOptions {
  return {
    minFilter: filter as THREE.MinificationTextureFilter,
    magFilter: filter as THREE.MagnificationTextureFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  };
}

function makeFluidRT(
  width: number,
  height: number,
  filter: number,
): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(
    Math.max(width, 1),
    Math.max(height, 1),
    makeFluidRTOptions(filter),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeNodeMaterial(colorNode: any): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mat.colorNode = colorNode as any;
  mat.needsUpdate = true;
  return mat;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCSSColor(css: string, rU: any, gU: any, bU: any): void {
  const m = css.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    rU.value = parseFloat(m[1]) / 255;
    gU.value = parseFloat(m[2]) / 255;
    bU.value = parseFloat(m[3]) / 255;
    return;
  }
  const c = new THREE.Color();
  try {
    c.setStyle(css);
  } catch {
    /* ignore */
  }
  rU.value = c.r;
  gU.value = c.g;
  bU.value = c.b;
}
