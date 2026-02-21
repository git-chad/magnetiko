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

  // Float uniforms so aspect ratio updates are uniform-only (no recompile)
  private readonly _uCanvasAspect = uniform(1.0);
  private readonly _uTextureAspect = uniform(1.0);

  constructor() {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this._material = new THREE.MeshBasicNodeMaterial();
    // Near-black default when no texture is set
    this._material.color.set(0x0d0d0c);
    this.mesh = new THREE.Mesh(geometry, this._material);
    // Always visible — it's fullscreen, never outside frustum
    this.mesh.frustumCulled = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Display a texture on the quad with aspect-ratio-corrected UVs.
   * If you're swapping media, pass the new texture and the old one is disposed.
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

    this._buildColorNode(tex, fitMode);
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
   * Call once per animation frame.
   * Marks the video texture dirty so the WebGPU backend re-uploads the current
   * frame. Without this, VideoTexture shows only the first frame.
   */
  tick(): void {
    if (this._videoTex) this._videoTex.needsUpdate = true;
  }

  /** Call from ResizeObserver — updates the canvas aspect uniform every frame. */
  updateCanvasAspect(width: number, height: number): void {
    this._uCanvasAspect.value = width / Math.max(height, 1);
  }

  /**
   * Re-apply the current texture with a different fit mode.
   * Triggers a one-time shader recompile; use sparingly (e.g., on user toggle).
   */
  applyFitMode(fitMode: FitMode): void {
    if (this._currentTex) {
      this._buildColorNode(this._currentTex, fitMode);
    }
  }

  dispose(): void {
    this._releaseCurrentMedia();
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

  private _buildColorNode(tex: THREE.Texture, fitMode: FitMode): void {
    // ratio = textureAspect / canvasAspect
    // > 1 → texture wider than canvas  → crop left/right in cover
    // < 1 → texture taller than canvas → crop top/bottom in cover
    const ratio = this._uTextureAspect.div(this._uCanvasAspect);

    const centeredUV = uv().sub(0.5);

    let correctedUV;

    if (fitMode === "cover") {
      // Scale UVs so the texture fills the canvas on both axes, cropping the excess.
      // scaleX > 1 when texture is wider (compresses UV.x → sees less of the texture width)
      const scaleX = max(ratio, 1.0);
      const scaleY = max(float(1.0).div(ratio), 1.0);
      correctedUV = vec2(
        centeredUV.x.div(scaleX),
        centeredUV.y.div(scaleY),
      ).add(0.5);
    } else {
      // contain — fit entire texture, leaving dark bars outside.
      const scaleX = min(ratio, 1.0);
      const scaleY = min(float(1.0).div(ratio), 1.0);
      correctedUV = vec2(
        centeredUV.x.div(scaleX),
        centeredUV.y.div(scaleY),
      ).add(0.5);

      // Detect out-of-bounds (letterbox region) and output dark bars
      const inBounds = correctedUV.x
        .greaterThanEqual(0.0)
        .and(correctedUV.x.lessThanEqual(1.0))
        .and(correctedUV.y.greaterThanEqual(0.0))
        .and(correctedUV.y.lessThanEqual(1.0));

      const safeUV = clamp(correctedUV, vec2(0.0), vec2(1.0));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._material.colorNode = select(
        inBounds,
        texture(tex, safeUV),
        vec4(0.07, 0.07, 0.07, 1.0),
      ) as any;
      this._material.needsUpdate = true;
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._material.colorNode = texture(tex, correctedUV) as any;
    this._material.needsUpdate = true;
  }
}
