import * as THREE from "three/webgpu";
import { uv, vec2, float, texture as tslTexture } from "three/tsl";
import { FullscreenQuad } from "./MediaTexture";
import { PassNode } from "./PassNode";
import { MediaPass } from "./MediaPass";
import { ModelPass } from "./ModelPass";
import { createPassNode } from "./passNodeFactory";
import { sharedRenderTargetPool } from "./RenderTargetPool";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal layer descriptor the pipeline needs per frame. */
export interface PipelineLayer {
  id: string;
  /** Determines which PassNode subclass to create for this layer. */
  kind: "shader" | "image" | "video" | "webcam" | "model";
  visible: boolean;
  opacity: number;
  blendMode: string;
  filterMode: "filter" | "mask";
  params: ShaderParam[];
  shaderType?: string;
  /** Image or video URL — only set for kind='image'|'video' layers. Webcam layers don't use this. */
  mediaUrl?: string;
  /** Original uploaded filename (used for media/model format hints). */
  mediaName?: string;
  /** Increment to force media reload retry without changing URL. */
  mediaVersion?: number;
  /** Optional per-layer painted mask texture (white=reveal). */
  maskTexture?: THREE.Texture | null;
}

export interface PipelineManagerCallbacks {
  onShaderError?: (layerId: string, error: Error) => void;
  onMediaStatus?: (
    layerId: string,
    status: "loading" | "ready" | "error",
    error?: string,
  ) => void;
  onOutOfMemory?: (error: Error) => void;
}

export type ExportImageFormat = "png" | "jpeg";

export interface ExportImageOptions {
  width?: number;
  height?: number;
  format?: ExportImageFormat;
  /** JPEG quality from 0-1. Ignored for PNG. */
  quality?: number;
  /** Master toggle for non-pipeline UI overlays. */
  includeUiOverlays?: boolean;
  /** Draws editor grid overlay when includeUiOverlays is enabled. */
  includeGridOverlay?: boolean;
}

const PIPELINE_RT_OPTIONS = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  type: THREE.UnsignedByteType,
  format: THREE.RGBAFormat,
  depthBuffer: false,
  stencilBuffer: false,
  generateMipmaps: false,
} as const;

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : "Unknown renderer error");
}

function toUint8ClampedArray(data: THREE.TypedArray): Uint8ClampedArray {
  if (data instanceof Uint8ClampedArray || data instanceof Uint8Array) {
    return new Uint8ClampedArray(data);
  }
  const converted = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) {
    converted[i] = Math.max(0, Math.min(255, Number(data[i])));
  }
  return converted;
}

function unpackReadbackRgba8(
  data: THREE.TypedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const expected = width * height * 4;
  const bytes =
    data instanceof Uint8Array || data instanceof Uint8ClampedArray
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : null;

  if (!bytes) {
    const converted = toUint8ClampedArray(data);
    if (converted.length === expected) return converted;
    const out = new Uint8ClampedArray(expected);
    out.set(converted.subarray(0, Math.min(expected, converted.length)));
    return out;
  }

  if (bytes.length === expected) {
    return new Uint8ClampedArray(bytes);
  }

  const rowBytes = width * 4;
  const stride = Math.ceil(rowBytes / 256) * 256;
  const minimumPaddedLength = (height - 1) * stride + rowBytes;
  const out = new Uint8ClampedArray(expected);

  if (bytes.length >= minimumPaddedLength && stride >= rowBytes) {
    for (let row = 0; row < height; row++) {
      const srcStart = row * stride;
      const srcEnd = srcStart + rowBytes;
      const dstStart = row * rowBytes;
      out.set(bytes.subarray(srcStart, srcEnd), dstStart);
    }
    return out;
  }

  out.set(bytes.subarray(0, Math.min(expected, bytes.length)));
  return out;
}

function isLikelyOutOfMemoryError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("out of memory") ||
    msg.includes("oom") ||
    msg.includes("device lost") ||
    msg.includes("gpu memory") ||
    msg.includes("allocation failed")
  );
}

function clampExportDimension(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(16_384, Math.round(value)));
}

function clampJpegQuality(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.92;
  return Math.max(0.05, Math.min(1, value));
}

function drawGridOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const minDimension = Math.max(Math.min(width, height), 1);
  const majorDivisions = 8;
  const majorStepX = width / majorDivisions;
  const majorStepY = height / majorDivisions;
  const minorStep = Math.max(Math.round(minDimension / 40), 12);

  ctx.save();
  ctx.lineCap = "square";

  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.lineWidth = Math.max(minDimension / 1200, 1);
  for (let x = minorStep; x < width; x += minorStep) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = minorStep; y < height; y += minorStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = Math.max(minDimension / 700, 1.25);
  for (let i = 1; i < majorDivisions; i++) {
    const x = i * majorStepX;
    const y = i * majorStepY;

    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.restore();
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
 * Media layers are fully first-class passes in the chain — a `MediaPass`
 * node is created for each image/video layer and composited in stack order.
 */
export class PipelineManager {
  private readonly _renderer: THREE.WebGPURenderer;
  private readonly _callbacks: PipelineManagerCallbacks;

  // ── Black base — used to initialise RT A to a clean frame each render ─────
  private readonly _baseQuad: FullscreenQuad;
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
  private readonly _layerKindById = new Map<string, PipelineLayer["kind"]>();
  private readonly _mediaRequestVersion = new Map<string, number>();

  // ── Current canvas dimensions (needed to size new passes) ─────────────────
  private _width: number;
  private _height: number;
  private _dirty = true;
  private _lastPointerActive = false;
  private _lastPointerX = 0.5;
  private _lastPointerY = 0.5;
  private _isExporting = false;
  private readonly _uniformRecompileWarned = new Set<string>();
  private readonly _shaderErrorNotified = new Set<string>();

  // ─────────────────────────────────────────────────────────────────────────

  constructor(
    renderer: THREE.WebGPURenderer,
    width: number,
    height: number,
    callbacks: PipelineManagerCallbacks = {},
  ) {
    this._renderer = renderer;
    this._width = width;
    this._height = height;
    this._callbacks = callbacks;

    // Black-base scene — renders an untextured quad to clear RT A each frame.
    // Media layers are now full PassNode passes in the chain; this just gives
    // the first pass a clean black input to composite over.
    this._baseScene = new THREE.Scene();
    this._baseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._baseQuad = new FullscreenQuad();
    this._baseScene.add(this._baseQuad.mesh);

    // Ping-pong RTs
    this._rtA = sharedRenderTargetPool.acquire(width, height, PIPELINE_RT_OPTIONS);
    this._rtB = sharedRenderTargetPool.acquire(width, height, PIPELINE_RT_OPTIONS);

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
        this._layerKindById.delete(id);
        this._mediaRequestVersion.delete(id);
        this._uniformRecompileWarned.delete(id);
        this._shaderErrorNotified.delete(id);
      }
    }

    // Create / update passes
    for (const layer of layers) {
      this._layerKindById.set(layer.id, layer.kind);

      let pass = this._passMap.get(layer.id);
      if (!pass) {
        try {
          pass =
            layer.kind === "model"
              ? new ModelPass(layer.id)
              : layer.kind === "image" ||
                  layer.kind === "video" ||
                  layer.kind === "webcam"
              ? new MediaPass(layer.id)
              : createPassNode(layer.id, layer.shaderType);
          pass.resize(this._width, this._height);
          this._passMap.set(layer.id, pass);
        } catch (err) {
          const error = toError(err);
          if (layer.kind === "shader") {
            this._notifyShaderError(layer.id, error);
          } else {
            this._callbacks.onMediaStatus?.(layer.id, "error", error.message);
          }
          if (isLikelyOutOfMemoryError(error)) {
            this._callbacks.onOutOfMemory?.(error);
          }
          continue;
        }
      }

      try {
        const materialVersionBefore = pass.getMaterialVersion();
        pass.enabled = layer.visible;
        pass.updateOpacity(layer.opacity);
        const blendChanged = pass.updateBlendMode(layer.blendMode);
        const filterModeChanged = pass.updateFilterMode(layer.filterMode);
        pass.updateMaskTexture(layer.maskTexture ?? null);
        pass.updateUniforms(layer.params);
        const materialVersionAfter = pass.getMaterialVersion();

        if (
          process.env.NODE_ENV === "development" &&
          materialVersionAfter !== materialVersionBefore &&
          !blendChanged &&
          !filterModeChanged &&
          !this._uniformRecompileWarned.has(layer.id)
        ) {
          this._uniformRecompileWarned.add(layer.id);
          console.warn(
            `[PipelineManager] Material recompiled during uniform update for layer "${layer.id}".`,
          );
        }

        this._shaderErrorNotified.delete(layer.id);
      } catch (err) {
        pass.enabled = false;
        this._notifyShaderError(layer.id, toError(err));
        continue;
      }

      if (layer.kind === "image" || layer.kind === "video") {
        const mediaPass = pass as MediaPass;
        const requestedVersion = layer.mediaVersion ?? 0;
        const lastVersion = this._mediaRequestVersion.get(layer.id);

        if (layer.mediaUrl && lastVersion !== requestedVersion) {
          this._mediaRequestVersion.set(layer.id, requestedVersion);
          this._callbacks.onMediaStatus?.(layer.id, "loading");
          void mediaPass
            .setMedia(layer.mediaUrl, layer.kind)
            .then(() => {
              this._callbacks.onMediaStatus?.(layer.id, "ready");
              this._dirty = true;
            })
            .catch((err) => {
              const error = toError(err);
              this._callbacks.onMediaStatus?.(layer.id, "error", error.message);
              if (isLikelyOutOfMemoryError(error)) {
                this._callbacks.onOutOfMemory?.(error);
              }
              this._dirty = true;
            });
        }
      }

      if (layer.kind === "model") {
        const modelPass = pass as ModelPass;
        const requestedVersion = layer.mediaVersion ?? 0;
        const lastVersion = this._mediaRequestVersion.get(layer.id);

        if (layer.mediaUrl && lastVersion !== requestedVersion) {
          this._mediaRequestVersion.set(layer.id, requestedVersion);
          this._callbacks.onMediaStatus?.(layer.id, "loading");
          void modelPass
            .setModel(layer.mediaUrl, layer.mediaName)
            .then(() => {
              this._callbacks.onMediaStatus?.(layer.id, "ready");
              this._dirty = true;
            })
            .catch((err) => {
              const error = toError(err);
              this._callbacks.onMediaStatus?.(layer.id, "error", error.message);
              if (isLikelyOutOfMemoryError(error)) {
                this._callbacks.onOutOfMemory?.(error);
              }
              this._dirty = true;
            });
        }
      }

      if (layer.kind === "webcam") {
        const mediaPass = pass as MediaPass;
        const requestedVersion = layer.mediaVersion ?? 0;
        const lastVersion = this._mediaRequestVersion.get(layer.id);

        if (lastVersion !== requestedVersion) {
          this._mediaRequestVersion.set(layer.id, requestedVersion);
          this._callbacks.onMediaStatus?.(layer.id, "loading");
          void mediaPass
            .startWebcam()
            .then(() => {
              this._callbacks.onMediaStatus?.(layer.id, "ready");
              this._dirty = true;
            })
            .catch((err) => {
              const error = toError(err);
              this._callbacks.onMediaStatus?.(layer.id, "error", error.message);
              if (isLikelyOutOfMemoryError(error)) {
                this._callbacks.onOutOfMemory?.(error);
              }
              this._dirty = true;
            });
        }
      }
    }

    // Re-order to match layer stack (bottom → top)
    this._passes = layers
      .map((layer) => this._passMap.get(layer.id))
      .filter((pass): pass is PassNode => Boolean(pass));
    this._dirty = true;
  }

  /**
   * Update uniforms for a single layer without rebuilding the pipeline.
   * Call this on param slider changes.
   */
  updateLayerParams(layerId: string, params: ShaderParam[]): void {
    this._passMap.get(layerId)?.updateUniforms(params);
    this._dirty = true;
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
    const pointerMoved =
      Math.abs(duvX) > 1e-7 ||
      Math.abs(duvY) > 1e-7 ||
      Math.abs(uvX - this._lastPointerX) > 1e-7 ||
      Math.abs(uvY - this._lastPointerY) > 1e-7;
    const activeChanged = isActive !== this._lastPointerActive;
    if (activeChanged || (isActive && pointerMoved)) {
      this._dirty = true;
    }
    this._lastPointerActive = isActive;
    this._lastPointerX = uvX;
    this._lastPointerY = uvY;
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
    this._dirty = true;
  }

  /**
   * Returns the latest fluid trail texture from the first interactivity pass.
   * Useful for feeding interaction data into other shader passes.
   */
  getInteractivityTrailTexture(): THREE.Texture | null {
    for (const pass of this._passes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (pass as any).getTrailTexture === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (pass as any).getTrailTexture() as THREE.Texture;
      }
    }
    return null;
  }

  /**
   * Returns the latest repel/attract displacement field texture from the first
   * interactivity pass.
   */
  getInteractivityDisplacementTexture(): THREE.Texture | null {
    for (const pass of this._passes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (pass as any).getDisplacementTexture === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (pass as any).getDisplacementTexture() as THREE.Texture;
      }
    }
    return null;
  }

  /**
   * Main render entry point — call from the animation loop.
   *
   * With 0 visible passes: renders base media directly to screen (fast path).
   * With N passes: base → RT A → pass 0 → RT B → pass 1 → RT A → … → screen.
   *
   * Returns `true` when a frame was rendered, `false` when skipped by the
   * dirty/continuous-render gate.
   */
  render(time: number, delta: number): boolean {
    const renderer = this._renderer;

    if (this._isExporting) {
      return false;
    }

    const activePasses = this._passes.filter((p) => p.enabled);
    const needsContinuous = activePasses.some((pass) => pass.needsContinuousRender());

    if (!this._dirty && !needsContinuous) {
      return false;
    }

    try {
      this._renderFrame(activePasses, time, delta, null);
      this._dirty = false;
      return true;
    } catch (err) {
      const error = toError(err);
      if (isLikelyOutOfMemoryError(error)) {
        this._callbacks.onOutOfMemory?.(error);
        this._dirty = true;
        return false;
      }
      throw error;
    }
  }

  /**
   * Puts the pipeline in export mode. While enabled, the normal animation-loop
   * `render()` is skipped so export can drive deterministic frame steps.
   */
  beginExportSession(): void {
    this._isExporting = true;
  }

  /**
   * Leaves export mode and marks the pipeline dirty so the next live frame is
   * rendered immediately in the preview.
   */
  endExportSession(): void {
    this._isExporting = false;
    this._dirty = true;
  }

  /**
   * Force-renders one frame while in export mode, bypassing dirty/continuous
   * gating used by the interactive preview loop.
   */
  renderExportFrame(time: number, delta: number): void {
    const activePasses = this._passes.filter((p) => p.enabled);
    try {
      this._renderFrame(activePasses, time, delta, null);
    } catch (err) {
      const error = toError(err);
      if (isLikelyOutOfMemoryError(error)) {
        this._callbacks.onOutOfMemory?.(error);
      }
      throw error;
    }
  }

  /**
   * Render the current pipeline to an offscreen target and return a PNG blob.
   * This avoids `canvas.toDataURL()` on WebGPU swapchains, which can return
   * empty/cleared frames in some browsers.
   */
  async exportPngBlob(time: number, delta: number): Promise<Blob> {
    return this.exportImageBlob(time, delta, { format: "png" });
  }

  /**
   * Render the current pipeline to an offscreen target and return an image
   * blob (PNG/JPEG) with optional high-res dimensions and UI overlay controls.
   */
  async exportImageBlob(
    time: number,
    delta: number,
    options: ExportImageOptions = {},
  ): Promise<Blob> {
    const originalWidth = Math.max(this._width, 1);
    const originalHeight = Math.max(this._height, 1);
    const width = clampExportDimension(options.width, originalWidth);
    const height = clampExportDimension(options.height, originalHeight);
    const format = options.format ?? "png";
    const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
    const jpegQuality = clampJpegQuality(options.quality);
    const shouldDrawGridOverlay = Boolean(options.includeUiOverlays && options.includeGridOverlay);
    const needsResize = width !== originalWidth || height !== originalHeight;
    const exportTarget = sharedRenderTargetPool.acquire(width, height, PIPELINE_RT_OPTIONS);

    try {
      this._isExporting = true;
      if (needsResize) {
        this.resize(width, height);
      }

      const activePasses = this._passes.filter((p) => p.enabled);
      this._renderFrame(activePasses, time, delta, exportTarget);

      const pixelData = await this._renderer.readRenderTargetPixelsAsync(
        exportTarget,
        0,
        0,
        width,
        height,
      );
      const rgba = unpackReadbackRgba8(pixelData, width, height);
      for (let i = 3; i < rgba.length; i += 4) {
        rgba[i] = 255;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create 2D canvas context for export.");

      const imageData = ctx.createImageData(width, height);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);

      if (shouldDrawGridOverlay) {
        drawGridOverlay(ctx, width, height);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((next) => {
          if (!next) {
            reject(new Error(`Failed to encode ${format.toUpperCase()} blob.`));
            return;
          }
          resolve(next);
        }, mimeType, format === "jpeg" ? jpegQuality : undefined);
      });

      return blob;
    } finally {
      if (needsResize) {
        this.resize(originalWidth, originalHeight);
      }
      this._isExporting = false;
      this._dirty = true;
      sharedRenderTargetPool.release(exportTarget);
    }
  }

  /**
   * Call from ResizeObserver when the canvas size changes.
   * Resizes render targets and updates the base quad's canvas-aspect uniform.
   */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._rtA.setSize(width, height);
    this._rtB.setSize(width, height);
    this._baseQuad.updateCanvasAspect(width, height);
    for (const pass of this._passMap.values()) {
      pass.resize(width, height);
    }
    this._dirty = true;
  }

  dispose(): void {
    sharedRenderTargetPool.release(this._rtA);
    sharedRenderTargetPool.release(this._rtB);
    this._baseQuad.dispose();
    for (const pass of this._passMap.values()) {
      pass.dispose();
    }
    this._passMap.clear();
    this._passes = [];
    this._layerKindById.clear();
    this._mediaRequestVersion.clear();
    this._uniformRecompileWarned.clear();
    this._shaderErrorNotified.clear();
    this._blitMaterial.dispose();
  }

  private _notifyShaderError(layerId: string, error: Error): void {
    if (this._shaderErrorNotified.has(layerId)) return;
    this._shaderErrorNotified.add(layerId);
    this._callbacks.onShaderError?.(layerId, error);
  }

  private _renderFrame(
    activePasses: PassNode[],
    time: number,
    delta: number,
    finalTarget: THREE.WebGLRenderTarget | null,
  ): void {
    const renderer = this._renderer;

    if (activePasses.length === 0) {
      renderer.setRenderTarget(finalTarget);
      renderer.render(this._baseScene, this._baseCamera);
      return;
    }

    // Step 1 — base media → RT A
    renderer.setRenderTarget(this._rtA);
    renderer.render(this._baseScene, this._baseCamera);

    // Step 2 — ping-pong through pass nodes
    let read = this._rtA;
    let write = this._rtB;
    this._bindInteractivityTextures(activePasses);

    for (const pass of activePasses) {
      try {
        pass.render(renderer, read.texture, write, time, delta);
        const tmp = read;
        read = write;
        write = tmp;
      } catch (err) {
        const error = toError(err);
        pass.enabled = false;

        const layerId = pass.layerId;
        const kind = this._layerKindById.get(layerId);
        if (kind === "shader") {
          this._notifyShaderError(layerId, error);
        } else if (kind === "image" || kind === "video" || kind === "webcam" || kind === "model") {
          this._callbacks.onMediaStatus?.(layerId, "error", error.message);
        }
        if (isLikelyOutOfMemoryError(error)) {
          this._callbacks.onOutOfMemory?.(error);
        }

        this._dirty = true;
        break;
      }
    }

    // Step 3 — blit final chain output
    this._blitInputNode.value = read.texture;
    renderer.setRenderTarget(finalTarget);
    renderer.render(this._blitScene, this._blitCamera);
  }

  private _bindInteractivityTextures(activePasses: PassNode[]): void {
    let trailTexture: THREE.Texture | null = null;
    let displacementTexture: THREE.Texture | null = null;

    for (const pass of activePasses) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidate = pass as any;
      if (!trailTexture && typeof candidate.getTrailTexture === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trailTexture = candidate.getTrailTexture() as THREE.Texture;
      }
      if (
        !displacementTexture &&
        typeof candidate.getDisplacementTexture === "function"
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        displacementTexture = candidate.getDisplacementTexture() as THREE.Texture;
      }
      if (trailTexture && displacementTexture) break;
    }

    for (const pass of activePasses) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidate = pass as any;
      if (typeof candidate.setInteractivityTextures === "function") {
        candidate.setInteractivityTextures(trailTexture, displacementTexture);
      }
    }
  }
}
