import * as THREE from "three/webgpu";
import { uv, vec2, float, texture as tslTexture, uniform } from "three/tsl";
import { buildBlendNode } from "@/lib/utils/blendModes";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// PassNode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single render pass in the filter pipeline.
 *
 * Each pass owns its own Scene + OrthographicCamera + fullscreen quad so the
 * PipelineManager can call `renderer.render(pass.scene, pass.camera)` into any
 * render target without touching the other passes.
 *
 * The input texture is exposed as a mutable TSL TextureNode — updating
 * `.value` swaps the sampled texture without triggering a shader recompile.
 *
 * **Compositing model:**
 * ```
 *   effect   = _buildEffectNode()          // shader output (passthrough for now)
 *   blended  = blendFn(input, effect)      // blend mode applied to RGB
 *   output   = mix(input, blended, opacity) // opacity mixes effect in
 * ```
 * Opacity updates are uniform-only (no recompile).
 * Blend mode changes rebuild colorNode (one recompile; rare, user-driven).
 *
 * Phase 2.4 ships a passthrough shader. Phase 4 will override `_buildEffectNode`
 * per ShaderType to inject the real effect.
 */
export class PassNode {
  readonly layerId: string;
  enabled: boolean = true;

  protected readonly _scene: THREE.Scene;
  protected readonly _camera: THREE.OrthographicCamera;
  protected readonly _material: THREE.MeshBasicNodeMaterial;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _inputNode: any; // ShaderNodeObject<TextureNode> — value is mutable

  // Compositing state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _opacityUniform: any; // ShaderNodeObject<UniformNode>
  private _blendMode: string = "normal";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _effectNode: any; // cached output of _buildEffectNode()

  constructor(layerId: string) {
    this.layerId = layerId;

    this._scene = new THREE.Scene();
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Placeholder texture — replaced each frame via _inputNode.value.
    // Render target textures have flipY=false (GPU-native), so V=0 is at the
    // TOP in WebGPU convention — opposite of PlaneGeometry UVs (V=0=bottom).
    // Flip Y here so every RT-to-RT step samples correctly without accumulating
    // a flip per pass.
    const placeholder = new THREE.Texture();
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));
    this._inputNode = tslTexture(placeholder, rtUV);

    this._opacityUniform = uniform(1.0);

    this._material = new THREE.MeshBasicNodeMaterial();

    // Build the initial color node (normal blend, opacity 1 = passthrough)
    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();

    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, this._material);
    mesh.frustumCulled = false;
    this._scene.add(mesh);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Render this pass.
   * Sets `inputTex` as the sampled texture, renders the scene into
   * `outputTarget`. The caller (PipelineManager) is responsible for resetting
   * the render target afterward.
   */
  render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    _time: number,
    _delta: number,
  ): void {
    this._inputNode.value = inputTex;
    renderer.setRenderTarget(outputTarget);
    renderer.render(this._scene, this._camera);
  }

  /**
   * Update the opacity uniform — no shader recompile.
   * Call this on every syncLayers() / slider change.
   */
  updateOpacity(opacity: number): void {
    this._opacityUniform.value = opacity;
  }

  /**
   * Switch the blend mode. Rebuilds colorNode and sets needsUpdate = true
   * (one recompile). Safe to call on every syncLayers(); early-exits when
   * the mode hasn't changed.
   */
  updateBlendMode(blendMode: string): void {
    if (blendMode === this._blendMode) return;
    this._blendMode = blendMode;
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  /**
   * Update TSL uniforms from ShaderParam values.
   * Phase 2.4: no-op (passthrough). Phase 4 will map params → uniforms.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateUniforms(_params: ShaderParam[]): void {
    // Phase 4: implement per-shader param → uniform mapping
  }

  dispose(): void {
    this._scene.clear();
    this._material.dispose();
  }

  // ── Protected — override in Phase 4 subclasses ────────────────────────────

  /**
   * Build and return the TSL node that represents this pass's shader output.
   * Called once in the constructor. Phase 4 subclasses override this to return
   * a TSL computation graph instead of the passthrough input node.
   *
   * **Important:** Phase 4 subclasses must set up all uniform nodes BEFORE
   * `super()` finishes (or call `_rebuildColorNode()` again after setup).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _buildEffectNode(): any {
    return this._inputNode; // passthrough
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _rebuildColorNode(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._material.colorNode = buildBlendNode(
      this._blendMode,
      this._inputNode,
      this._effectNode,
      this._opacityUniform,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the correct PassNode subclass for a given layer ID.
 * Phase 2.4: all layers return a base passthrough PassNode.
 * Phase 4 will add subclasses per ShaderType.
 */
export function createPassNode(layerId: string): PassNode {
  return new PassNode(layerId);
}
