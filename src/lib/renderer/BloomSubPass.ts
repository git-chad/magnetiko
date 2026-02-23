import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec4,
  float,
  uniform,
  max,
  smoothstep,
  screenSize,
  texture as tslTexture,
} from "three/tsl";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-normalised 9-tap Gaussian weights (σ ≈ 1.5). Sum = 1. */
const WEIGHTS = [0.0076, 0.0361, 0.1096, 0.2135, 0.2666, 0.2135, 0.1096, 0.0361, 0.0076];
/** Tap offsets in pixels (scaled by radius uniform). */
const OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRT(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(w, 1), Math.max(h, 1), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeScene(colorNode: any): { scene: THREE.Scene; mat: THREE.MeshBasicNodeMaterial } {
  const mat = new THREE.MeshBasicNodeMaterial();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mat.colorNode = colorNode as any;
  mat.needsUpdate = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, mat };
}

// ─────────────────────────────────────────────────────────────────────────────
// BloomSubPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reusable 4-pass bloom effect that any PassNode can opt into.
 *
 * process(renderer, inputTex, outputTarget) pipeline:
 *   1. Extract  — threshold bright/saturated pixels  (inputTex    → _extractRT)
 *   2. Blur H   — 9-tap Gaussian horizontal blur      (_extractRT  → _blurHRT)
 *   3. Blur V   — 9-tap Gaussian vertical blur         (_blurHRT    → _blurVRT)
 *   4. Composite — inputTex + intensity*blurred        (all → _compositeRT)
 *   5. Blit      — copy _compositeRT → outputTarget
 *
 * Brightness extraction uses max(R,G,B) so highly saturated but dark colours
 * (e.g. deep red) also bloom, not only neutral-bright whites.
 *
 * Call resize() whenever the canvas changes size.
 */
export class BloomSubPass {
  // ── Internal render targets ───────────────────────────────────────────────
  private _extractRT:   THREE.WebGLRenderTarget;
  private _blurHRT:     THREE.WebGLRenderTarget;
  private _blurVRT:     THREE.WebGLRenderTarget;
  private _compositeRT: THREE.WebGLRenderTarget;

  // ── Uniforms ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _thresholdU:       any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _softKneeU:        any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _intensityU:       any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _radiusU:          any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blendWithSourceU: any;  // 1=add on top, 0=bloom only

  // ── Scenes + materials ────────────────────────────────────────────────────
  private readonly _extractScene:   THREE.Scene;
  private readonly _blurHScene:     THREE.Scene;
  private readonly _blurVScene:     THREE.Scene;
  private readonly _compositeScene: THREE.Scene;
  private readonly _blitScene:      THREE.Scene;

  private readonly _extractMat:   THREE.MeshBasicNodeMaterial;
  private readonly _blurHMat:     THREE.MeshBasicNodeMaterial;
  private readonly _blurVMat:     THREE.MeshBasicNodeMaterial;
  private readonly _compositeMat: THREE.MeshBasicNodeMaterial;
  private readonly _blitMat:      THREE.MeshBasicNodeMaterial;

  private readonly _camera: THREE.OrthographicCamera;

  // ── Mutable texture nodes ─────────────────────────────────────────────────
  // One per distinct input; .value is updated in process() without recompile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _extractInputNode:   any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blurHSamples:       any[];  // 9 nodes for 9 taps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blurVSamples:       any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _compositeBloomNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _compositeInputNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blitInputNode:      any;

  // ─────────────────────────────────────────────────────────────────────────

  constructor(width: number, height: number) {
    this._extractRT   = makeRT(width, height);
    this._blurHRT     = makeRT(width, height);
    this._blurVRT     = makeRT(width, height);
    this._compositeRT = makeRT(width, height);

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // All RT textures have V=0=top (WebGPU convention); flip Y so sampling
    // conventions match the rest of the PassNode pipeline.
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));

    // Uniforms
    this._thresholdU       = uniform(0.7);
    this._softKneeU        = uniform(0.5);
    this._intensityU       = uniform(1.0);
    this._radiusU          = uniform(5.0);
    this._blendWithSourceU = uniform(1.0);

    // ── Pass 1: Extract bright pixels ─────────────────────────────────────
    // Brightness = max(R,G,B) — catches saturated colours as well as neutral whites.
    // Soft-knee smoothstep around threshold suppresses hard clipping artefacts.
    this._extractInputNode = tslTexture(new THREE.Texture(), rtUV);
    const src = this._extractInputNode;
    const brightness = max(max(float(src.r), float(src.g)), float(src.b));
    const kneeLo  = this._thresholdU.sub(this._softKneeU.mul(float(0.5)));
    const kneeHi  = this._thresholdU.add(this._softKneeU.mul(float(0.5)));
    const extract = smoothstep(kneeLo, kneeHi, brightness);
    const extractColor = vec4(
      float(src.r).mul(extract),
      float(src.g).mul(extract),
      float(src.b).mul(extract),
      float(1.0),
    );
    ({ scene: this._extractScene, mat: this._extractMat } = makeScene(extractColor));

    // ── Pass 2: Horizontal Gaussian blur ──────────────────────────────────
    // step = radius / screenWidth in UV space; 9 taps at offsets ±4..0..4.
    const stepX = this._radiusU.div(screenSize.x);
    this._blurHSamples = OFFSETS.map((off) => {
      const sUV = vec2(rtUV.x.add(float(off).mul(stepX)), rtUV.y);
      return tslTexture(new THREE.Texture(), sUV);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let blurHAcc: any = vec4(0, 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      blurHAcc = blurHAcc.add(this._blurHSamples[i].mul(float(WEIGHTS[i])));
    }
    ({ scene: this._blurHScene, mat: this._blurHMat } = makeScene(blurHAcc));

    // ── Pass 3: Vertical Gaussian blur ────────────────────────────────────
    const stepY = this._radiusU.div(screenSize.y);
    this._blurVSamples = OFFSETS.map((off) => {
      const sUV = vec2(rtUV.x, rtUV.y.add(float(off).mul(stepY)));
      return tslTexture(new THREE.Texture(), sUV);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let blurVAcc: any = vec4(0, 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      blurVAcc = blurVAcc.add(this._blurVSamples[i].mul(float(WEIGHTS[i])));
    }
    ({ scene: this._blurVScene, mat: this._blurVMat } = makeScene(blurVAcc));

    // ── Pass 4: Composite — source + intensity × blurred bloom ────────────
    this._compositeBloomNode = tslTexture(new THREE.Texture(), rtUV);
    this._compositeInputNode = tslTexture(new THREE.Texture(), rtUV);
    const bloomContrib = vec4(
      float(this._compositeBloomNode.r).mul(this._intensityU),
      float(this._compositeBloomNode.g).mul(this._intensityU),
      float(this._compositeBloomNode.b).mul(this._intensityU),
      float(1.0),
    );
    const inpContrib = vec4(
      float(this._compositeInputNode.r),
      float(this._compositeInputNode.g),
      float(this._compositeInputNode.b),
      float(1.0),
    );
    // blendWithSource=1: add bloom atop source; 0: bloom-only output
    const compositeColor = vec4(
      float(inpContrib.r).add(float(bloomContrib.r).mul(this._blendWithSourceU)),
      float(inpContrib.g).add(float(bloomContrib.g).mul(this._blendWithSourceU)),
      float(inpContrib.b).add(float(bloomContrib.b).mul(this._blendWithSourceU)),
      float(1.0),
    );
    ({ scene: this._compositeScene, mat: this._compositeMat } = makeScene(compositeColor));

    // ── Pass 5: Blit compositeRT → outputTarget ───────────────────────────
    // Simple 1:1 copy — no Y-flip needed (both are RTs with same convention).
    this._blitInputNode = tslTexture(new THREE.Texture(), rtUV);
    const blitColor = vec4(
      float(this._blitInputNode.r),
      float(this._blitInputNode.g),
      float(this._blitInputNode.b),
      float(1.0),
    );
    ({ scene: this._blitScene, mat: this._blitMat } = makeScene(blitColor));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run the full bloom pipeline.
   *
   * Reads `inputTex`, writes bloom-composited result to `outputTarget`.
   * Safe to pass `outputTarget.texture` as `inputTex` — all intermediate
   * writes go to internal RTs before the final blit overwrites `outputTarget`.
   */
  process(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
  ): void {
    // 1. Extract bright pixels
    this._extractInputNode.value = inputTex;
    renderer.setRenderTarget(this._extractRT);
    renderer.render(this._extractScene, this._camera);

    // 2. Blur H
    for (const s of this._blurHSamples) s.value = this._extractRT.texture;
    renderer.setRenderTarget(this._blurHRT);
    renderer.render(this._blurHScene, this._camera);

    // 3. Blur V
    for (const s of this._blurVSamples) s.value = this._blurHRT.texture;
    renderer.setRenderTarget(this._blurVRT);
    renderer.render(this._blurVScene, this._camera);

    // 4. Composite
    this._compositeBloomNode.value = this._blurVRT.texture;
    this._compositeInputNode.value = inputTex;
    renderer.setRenderTarget(this._compositeRT);
    renderer.render(this._compositeScene, this._camera);

    // 5. Blit to outputTarget
    this._blitInputNode.value = this._compositeRT.texture;
    renderer.setRenderTarget(outputTarget);
    renderer.render(this._blitScene, this._camera);
  }

  /** Resize all internal RTs to match the canvas. Call from PassNode.resize(). */
  resize(width: number, height: number): void {
    this._extractRT.setSize(width, height);
    this._blurHRT.setSize(width, height);
    this._blurVRT.setSize(width, height);
    this._compositeRT.setSize(width, height);
  }

  setThreshold(v: number): void      { this._thresholdU.value       = v; }
  setSoftKnee(v: number): void       { this._softKneeU.value        = v; }
  setRadius(v: number): void         { this._radiusU.value          = v; }
  setIntensity(v: number): void      { this._intensityU.value       = v; }
  setBlendWithSource(v: boolean): void { this._blendWithSourceU.value = v ? 1.0 : 0.0; }

  dispose(): void {
    this._extractRT.dispose();
    this._blurHRT.dispose();
    this._blurVRT.dispose();
    this._compositeRT.dispose();
    this._extractMat.dispose();
    this._blurHMat.dispose();
    this._blurVMat.dispose();
    this._compositeMat.dispose();
    this._blitMat.dispose();
  }
}
