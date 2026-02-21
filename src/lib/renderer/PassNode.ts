import * as THREE from "three/webgpu";
import { uv, texture as tslTexture } from "three/tsl";
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
 * Phase 2.4 ships a passthrough shader. Phase 4 will override `_buildShader`
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

  constructor(layerId: string) {
    this.layerId = layerId;

    this._scene = new THREE.Scene();
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Placeholder texture — replaced each frame via _inputNode.value
    const placeholder = new THREE.Texture();
    this._inputNode = tslTexture(placeholder, uv());

    this._material = new THREE.MeshBasicNodeMaterial();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._material.colorNode = this._inputNode as any;

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
    // Swap input texture (no recompile — just a uniform update)
    this._inputNode.value = inputTex;
    renderer.setRenderTarget(outputTarget);
    renderer.render(this._scene, this._camera);
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the correct PassNode subclass for a given shader type.
 * Phase 2.4: all types return a base passthrough PassNode.
 * Phase 4 will add subclasses per ShaderType.
 */
export function createPassNode(layerId: string): PassNode {
  return new PassNode(layerId);
}
