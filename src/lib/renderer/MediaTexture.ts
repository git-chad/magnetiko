import * as THREE from "three/webgpu";
import {
  uv,
  texture,
  uniform,
  vec2,
  vec4,
  float,
  max,
  min,
  clamp,
  select,
} from "three/tsl";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FitMode = "cover" | "contain";

export interface VideoHandle {
  texture: THREE.VideoTexture;
  video: HTMLVideoElement;
  dispose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load an image URL as a THREE.Texture.
 * The texture is sRGB and ready to use; dispose it when done.
 */
export function loadImageTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      () => reject(new Error(`Failed to load image: ${url}`)),
    );
  });
}

/**
 * Create a VideoTexture from a URL.
 * Video is set to autoplay, loop, and muted so browsers allow it without user
 * interaction. Call `handle.dispose()` to pause and release GPU resources.
 *
 * Resolves on the `playing` event (not `loadedmetadata`) so the first frame is
 * guaranteed to be decoded before the WebGPU backend tries to upload it.
 */
export function createVideoTexture(url: string): Promise<VideoHandle> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    // Wait until a real frame is available — `loadedmetadata` is too early.
    video.addEventListener(
      "playing",
      () => {
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve({
          texture: tex,
          video,
          dispose: () => {
            tex.dispose();
            video.pause();
            video.src = "";
          },
        });
      },
      { once: true },
    );

    // Kick off playback once dimensions are known.
    video.addEventListener(
      "loadedmetadata",
      () => { video.play().catch(reject); },
      { once: true },
    );

    video.onerror = () => reject(new Error(`Failed to load video: ${url}`));

    video.src = url;
    video.load();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FullscreenQuad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A PlaneGeometry(2, 2) with a MeshBasicNodeMaterial that:
 * - Samples a texture (image or video) with aspect-ratio-corrected UVs
 * - Supports cover (crop) and contain (letterbox with dark bars) fit modes
 * - Updates aspect ratio dynamically via GPU uniforms — no shader recompile needed
 *   on resize
 *
 * **Key design:** The TSL shader graph is built ONCE in the constructor with a
 * placeholder texture. Swapping media uses `texNode.value = newTex` — the same
 * pattern as PassNode — which updates the texture binding without triggering a
 * shader recompile. Fit-mode switches (rare, user-driven) still recompile via
 * `needsUpdate = true`, but texture-only swaps never do.
 *
 * Usage:
 * ```ts
 * const quad = new FullscreenQuad();
 * scene.add(quad.mesh);
 * quad.setTexture(myTexture, 'cover');
 * quad.updateCanvasAspect(width, height); // call from ResizeObserver
 * ```
 */
export class FullscreenQuad {
  readonly mesh: THREE.Mesh;

  private readonly _material: THREE.MeshBasicNodeMaterial;
  private _currentTex: THREE.Texture | null = null;
  private _videoTex: THREE.VideoTexture | null = null;
  private _videoHandle: VideoHandle | null = null;
  private _currentFitMode: FitMode = "cover";

  // Float uniforms so aspect ratio updates are uniform-only (no recompile)
  private readonly _uCanvasAspect = uniform(1.0);
  private readonly _uTextureAspect = uniform(1.0);
  private readonly _placeholder: THREE.Texture;

  // Mutable TSL TextureNodes — created once, texture swapped via .value.
  // This avoids the needsUpdate = true / shader-recompile path entirely for
  // texture changes, which is unreliable on already-compiled materials in
  // Three.js WebGPU.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _coverTexNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _containTexNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _containColorNode: any;

  constructor() {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this._material = new THREE.MeshBasicNodeMaterial();
    this.mesh = new THREE.Mesh(geometry, this._material);
    this.mesh.frustumCulled = false;

    // Shared UV helpers
    this._placeholder = new THREE.Texture();
    const placeholder = this._placeholder;
    const ratio = this._uTextureAspect.div(this._uCanvasAspect);
    const centeredUV = uv().sub(0.5);

    // ── Cover UV ─────────────────────────────────────────────────────────────
    // Scale UVs so the texture fills the canvas on both axes, cropping excess.
    const coverScaleX = max(ratio, float(1.0));
    const coverScaleY = max(float(1.0).div(ratio), float(1.0));
    const coverUV = vec2(
      centeredUV.x.div(coverScaleX),
      centeredUV.y.div(coverScaleY),
    ).add(0.5);
    this._coverTexNode = texture(placeholder, coverUV);

    // ── Contain UV ────────────────────────────────────────────────────────────
    // Fit entire texture; output dark bars outside the image.
    const containScaleX = min(ratio, float(1.0));
    const containScaleY = min(float(1.0).div(ratio), float(1.0));
    const containUV = vec2(
      centeredUV.x.div(containScaleX),
      centeredUV.y.div(containScaleY),
    ).add(0.5);
    const containInBounds = containUV.x
      .greaterThanEqual(0.0)
      .and(containUV.x.lessThanEqual(1.0))
      .and(containUV.y.greaterThanEqual(0.0))
      .and(containUV.y.lessThanEqual(1.0));
    const containSafeUV = clamp(containUV, vec2(0.0), vec2(1.0));
    this._containTexNode = texture(placeholder, containSafeUV);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._containColorNode = select(containInBounds, this._containTexNode, vec4(0.07, 0.07, 0.07, 1.0)) as any;

    // Default: cover mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._material.colorNode = this._coverTexNode as any;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Display a texture on the quad with aspect-ratio-corrected UVs.
   * Swapping the texture updates the TSL texture node's `.value` — no shader
   * recompile. Switching fit modes triggers one recompile (rare, user-driven).
   */
  setTexture(tex: THREE.Texture, fitMode: FitMode = "cover"): void {
    this._releaseCurrentMedia();

    // Determine texture dimensions from its image source
    const img = tex.image as HTMLImageElement | HTMLVideoElement | null | undefined;
    const tw =
      img instanceof HTMLVideoElement
        ? img.videoWidth
        : (img as HTMLImageElement | null)?.naturalWidth ?? 1;
    const th =
      img instanceof HTMLVideoElement
        ? img.videoHeight
        : (img as HTMLImageElement | null)?.naturalHeight ?? 1;

    this._uTextureAspect.value = tw / Math.max(th, 1);
    this._currentTex = tex;

    // Switch colorNode only when fit mode changes (rare — one recompile)
    if (fitMode !== this._currentFitMode) {
      this._currentFitMode = fitMode;
      this._material.colorNode =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fitMode === "cover" ? (this._coverTexNode as any) : (this._containColorNode as any);
      this._material.needsUpdate = true;
    }
  }

  /** Convenience: track a VideoHandle so dispose() also cleans up the video. */
  setVideoHandle(handle: VideoHandle, fitMode: FitMode = "cover"): void {
    // IMPORTANT: call setTexture FIRST — it calls _releaseCurrentMedia() which
    // disposes the OLD _videoHandle. Setting _videoHandle before that would
    // cause the NEW handle to be disposed immediately.
    this.setTexture(handle.texture, fitMode);
    this._videoHandle = handle;
    this._videoTex = handle.texture;
  }

  /**
   * Call once per animation frame, BEFORE renderer.render().
   *
   * Mirrors PassNode exactly: sets texNode.value = _currentTex on EVERY frame,
   * unconditionally. This ensures the WebGPU bind group is always current,
   * regardless of when setTexture() was called (even across async boundaries).
   */
  tick(): void {
    if (this._currentTex) {
      this._coverTexNode.value = this._currentTex;
      this._containTexNode.value = this._currentTex;
    }
    if (this._videoTex) this._videoTex.needsUpdate = true;
  }

  /** Call from ResizeObserver — updates the canvas aspect uniform. */
  updateCanvasAspect(width: number, height: number): void {
    this._uCanvasAspect.value = width / Math.max(height, 1);
  }

  /**
   * Re-apply the current texture with a different fit mode.
   * Swaps the colorNode; triggers one shader recompile. Use sparingly.
   */
  applyFitMode(fitMode: FitMode): void {
    if (fitMode === this._currentFitMode || !this._currentTex) return;
    this._currentFitMode = fitMode;
    this._material.colorNode =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fitMode === "cover" ? (this._coverTexNode as any) : (this._containColorNode as any);
    this._material.needsUpdate = true;
  }

  /**
   * Remove the current media and revert the quad to the blank placeholder.
   * Call when the user deletes the media layer.
   */
  clearTexture(): void {
    this._releaseCurrentMedia();
    this._coverTexNode.value = this._placeholder;
    this._containTexNode.value = this._placeholder;
    this._uTextureAspect.value = 1.0;
  }

  dispose(): void {
    this._releaseCurrentMedia();
    this._placeholder.dispose();
    this.mesh.geometry.dispose();
    this._material.dispose();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _releaseCurrentMedia(): void {
    this._currentTex?.dispose();
    this._currentTex = null;
    this._videoTex = null;
    this._videoHandle?.dispose();
    this._videoHandle = null;
  }
}
