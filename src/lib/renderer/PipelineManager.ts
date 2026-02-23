import * as THREE from "three/webgpu";
import { uv, vec2, float, texture as tslTexture } from "three/tsl";
import { FullscreenQuad } from "./MediaTexture";
import { PassNode } from "./PassNode";
import { createPassNode } from "./passNodeFactory";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal layer descriptor the pipeline needs per frame. */
export interface PipelineLayer {
  id: string;
  visible: boolean;
  opacity: number;
  /** Phase 4: blend mode applied in mask mode */
  blendMode: string;
  /** filter — processes underlying texture; mask — independent output */
  filterMode: "filter" | "mask";
  params: ShaderParam[];
  shaderType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PipelineManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the full filter chain:
 *
 * 1. Renders base media (FullscreenQuad) to ping-pong RT A
 * 2. Each visible filter-mode layer reads from the current RT and writes
 *    to the other (ping-pong), transforming the image
 * 3. Blits the final RT to the screen
 *
 * Mask-mode layers are composited (Phase 2.6 / Phase 4).
 *
 * The `baseQuad` is public so the owning component can call
 * `setTexture` / `setVideoHandle` to inject media.
 */
export class PipelineManager {
  private readonly _renderer: THREE.WebGPURenderer;

  // ── Base media (bottom of the stack) ─────────────────────────────────────
  /** Set media on this quad to inject image / video into the pipeline. */
  readonly baseQuad: FullscreenQuad;
  private readonly _baseScene: THREE.Scene;
  private readonly _baseCamera: THREE.OrthographicCamera;

  // ── Ping-pong render targets ──────────────────────────────────────────────
  private _rtA: THREE.WebGLRenderTarget;
  private _rtB: THREE.WebGLRenderTarget;

  // ── Final blit to screen ──────────────────────────────────────────────────
  private readonly _blitScene: THREE.Scene;
  private readonly _blitCamera: THREE.OrthographicCamera;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _blitInputNode: any; // ShaderNodeObject<TextureNode>
  private readonly _blitMaterial: THREE.MeshBasicNodeMaterial;

  // ── Layer pass nodes ──────────────────────────────────────────────────────
  /** Ordered bottom → top (render order matches the filter chain). */
  private _passes: PassNode[] = [];
  private _passMap = new Map<string, PassNode>();

  // ── Current canvas dimensions (needed to size new passes) ─────────────────
  private _width: number;
  private _height: number;

  // ─────────────────────────────────────────────────────────────────────────

  constructor(renderer: THREE.WebGPURenderer, width: number, height: number) {
    this._renderer = renderer;
    this._width    = width;
    this._height   = height;

    // Base media scene
    this._baseScene = new THREE.Scene();
    this._baseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.baseQuad = new FullscreenQuad();
    this._baseScene.add(this.baseQuad.mesh);

    // Ping-pong RTs
    this._rtA = this._makeRT(width, height);
    this._rtB = this._makeRT(width, height);

    // Blit scene — final RT → screen.
    // Same Y-flip as PassNode: RT textures have V=0=top in WebGPU convention.
    this._blitScene = new THREE.Scene();
    this._blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blitUV = vec2(uv().x, float(1.0).sub(uv().y));
    this._blitInputNode = tslTexture(new THREE.Texture(), blitUV);
    this._blitMaterial = new THREE.MeshBasicNodeMaterial();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._blitMaterial.colorNode = this._blitInputNode as any;
    const blitGeo = new THREE.PlaneGeometry(2, 2);
    const blitMesh = new THREE.Mesh(blitGeo, this._blitMaterial);
    blitMesh.frustumCulled = false;
    this._blitScene.add(blitMesh);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Sync pipeline passes with the current layer list.
   * Creates PassNodes for new layers, removes nodes for deleted layers,
   * and re-orders to match `layers` (bottom → top).
   *
   * Call this whenever layers are added, removed, or reordered.
   */
  syncLayers(layers: PipelineLayer[]): void {
    const incomingIds = new Set(layers.map((l) => l.id));

    // Remove stale passes
    for (const [id, pass] of this._passMap) {
      if (!incomingIds.has(id)) {
        pass.dispose();
        this._passMap.delete(id);
      }
    }

    // Create passes for new layers
    for (const layer of layers) {
      if (!this._passMap.has(layer.id)) {
        const pass = createPassNode(layer.id, layer.shaderType);
        pass.resize(this._width, this._height);
        this._passMap.set(layer.id, pass);
      }
      const pass = this._passMap.get(layer.id)!;
      pass.enabled = layer.visible;
      pass.updateOpacity(layer.opacity);
      pass.updateBlendMode(layer.blendMode);
      pass.updateUniforms(layer.params);
    }

    // Re-order to match layer stack (bottom → top)
    this._passes = layers.map((l) => this._passMap.get(l.id)!);

  }

  /**
   * Update uniforms for a single layer without rebuilding the pipeline.
   * Call this on param slider changes.
   */
  updateLayerParams(layerId: string, params: ShaderParam[]): void {
    this._passMap.get(layerId)?.updateUniforms(params);
  }

  /**
   * Forward pointer state to all InteractivityPass instances in the pipeline.
   * Call once per animation frame (or on every pointermove event).
   *
   * @param uvX     Normalised X — 0 = left edge, 1 = right edge
   * @param uvY     Normalised Y — 0 = top  edge, 1 = bottom edge (browser coords)
   * @param duvX    X delta since last call (UV units)
   * @param duvY    Y delta since last call (UV units)
   * @param isActive  true while the pointer is over the canvas
   */
  setPointerForInteractivity(
    uvX: number,
    uvY: number,
    duvX: number,
    duvY: number,
    isActive: boolean,
  ): void {
    for (const pass of this._passMap.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (pass as any).setPointer === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pass as any).setPointer(uvX, uvY, duvX, duvY, isActive);
      }
    }
  }

  /**
   * Spawn a click/tap event (ripple ring) on all InteractivityPass instances.
   *
   * @param uvX  Normalised X — 0 = left edge
   * @param uvY  Normalised Y — 0 = top  edge (browser coords)
   */
  addClickForInteractivity(uvX: number, uvY: number): void {
    for (const pass of this._passMap.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (pass as any).addClick === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pass as any).addClick(uvX, uvY);
      }
    }
  }

  /**
   * Main render entry point — call from the animation loop.
   *
   * With 0 visible passes: renders base media directly to screen (fast path).
   * With N passes: base → RT A → pass 0 → RT B → pass 1 → RT A → … → screen.
   */
  render(time: number, delta: number): void {
    const renderer = this._renderer;

    // Mark video texture dirty so WebGPU re-uploads the current frame
    this.baseQuad.tick();

    const activePasses = this._passes.filter((p) => p.enabled);

    if (activePasses.length === 0) {
      // Fast path: no layers → base straight to screen
      renderer.setRenderTarget(null);
      renderer.render(this._baseScene, this._baseCamera);
      return;
    }

    // Step 1 — base media → RT A
    renderer.setRenderTarget(this._rtA);
    renderer.render(this._baseScene, this._baseCamera);

    // Step 2 — ping-pong through pass nodes
    let read = this._rtA;
    let write = this._rtB;

    for (const pass of activePasses) {
      pass.render(renderer, read.texture, write, time, delta);
      // Swap
      const tmp = read;
      read = write;
      write = tmp;
    }

    // Step 3 — blit last RT → screen
    this._blitInputNode.value = read.texture;
    renderer.setRenderTarget(null);
    renderer.render(this._blitScene, this._blitCamera);
  }

  /**
   * Call from ResizeObserver when the canvas size changes.
   * Resizes render targets and updates the base quad's canvas-aspect uniform.
   */
  resize(width: number, height: number): void {
    this._width  = width;
    this._height = height;
    this._rtA.setSize(width, height);
    this._rtB.setSize(width, height);
    this.baseQuad.updateCanvasAspect(width, height);
    for (const pass of this._passMap.values()) {
      pass.resize(width, height);
    }
  }

  dispose(): void {
    this._rtA.dispose();
    this._rtB.dispose();
    this.baseQuad.dispose();
    for (const pass of this._passMap.values()) {
      pass.dispose();
    }
    this._passMap.clear();
    this._passes = [];
    this._blitMaterial.dispose();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _makeRT(width: number, height: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(Math.max(width, 1), Math.max(height, 1), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
    });
  }
}
