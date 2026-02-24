import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec4,
  float,
  texture as tslTexture,
  uniform,
  max,
  mix,
} from "three/tsl";
import { PassNode } from "./PassNode";
import { loadImageTexture, createVideoTexture, createWebcamTexture } from "./MediaTexture";
import type { VideoHandle } from "./MediaTexture";

// ─────────────────────────────────────────────────────────────────────────────
// MediaPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A PassNode subclass that injects a media texture (image or video) into the
 * render chain at its stack position.
 *
 * Compositing model (inherited from PassNode):
 *   effect  = media texture sampled with aspect-ratio-corrected cover UVs
 *   blended = blendFn(runningComposite, effect)
 *   output  = mix(runningComposite, blended, opacity)
 *
 * This means:
 *   - blend=normal, opacity=1 → media fully replaces whatever was below
 *   - blend=normal, opacity=0.5 → 50/50 mix with the composite below
 *   - blend=multiply, opacity=1 → multiplied over the composite
 *
 * Cover UV notes:
 *   Image/video textures have Y=0 at the bottom (standard image convention).
 *   The pipeline input (_inputNode) uses a Y-flipped UV because render-target
 *   textures have Y=0 at the top in WebGPU. The media texture node uses
 *   regular uv() — NO Y-flip — because it samples a fresh image, not an RT.
 *
 * Constructor pattern:
 *   super() calls _buildEffectNode() but the guard returns the passthrough
 *   _inputNode because uniforms don't exist yet. After super() returns, the
 *   subclass initialises all uniforms and calls _buildEffectNode() +
 *   _rebuildColorNode() again to install the real shader graph.
 */
export class MediaPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _uCanvasAspect:  any;   // uniform(float) — updated by resize()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _uTextureAspect: any;   // uniform(float) — set when media loads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mediaTexNode:   any;   // tslTexture node — .value swapped each frame
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _uMirrorX:       any;   // uniform(float) — 1.0 for webcam, 0.0 otherwise

  private _placeholder: THREE.Texture;

  // Loaded media state
  private _currentTex:  THREE.Texture | null      = null;
  private _videoTex:    THREE.VideoTexture | null  = null;
  private _videoHandle: VideoHandle | null         = null;
  private _loadedUrl:   string | null              = null;

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor(layerId: string) {
    super(layerId);
    // super() calls _buildEffectNode() → guard returns passthrough. Now init.
    this._placeholder    = new THREE.Texture();
    this._uCanvasAspect  = uniform(1.0);
    this._uTextureAspect = uniform(1.0);
    this._uMirrorX       = uniform(0.0);
    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** The URL currently loaded (or being loaded) into this pass. */
  get loadedUrl(): string | null { return this._loadedUrl; }

  /**
   * Asynchronously load a media URL into this pass.
   * Replaces any previously loaded media.
   * Safe to call multiple times (old media is disposed before the new load).
   */
  async setMedia(url: string, type: "image" | "video"): Promise<void> {
    this._releaseCurrentMedia();
    this._loadedUrl = url;
    if (this._uMirrorX) this._uMirrorX.value = 0.0;
    try {
      if (type === "image") {
        const tex = await loadImageTexture(url);
        this._currentTex = tex;
        this._setAspect(tex);
      } else {
        const handle = await createVideoTexture(url);
        this._currentTex  = handle.texture;
        this._videoTex    = handle.texture;
        this._videoHandle = handle;
        this._setAspect(handle.texture);
      }
    } catch (err) {
      console.error("[MediaPass] failed to load media:", err);
      this._loadedUrl = null;
    }
  }

  /**
   * Start a live webcam feed as the media source.
   * Replaces any previously loaded media. Uses getUserMedia — the browser may
   * prompt for camera permission. No-op if webcam is already active.
   */
  async startWebcam(): Promise<void> {
    if (this._loadedUrl === "__webcam__") return;
    this._releaseCurrentMedia();
    this._loadedUrl = "__webcam__";
    if (this._uMirrorX) this._uMirrorX.value = 1.0;
    try {
      const handle = await createWebcamTexture();
      this._currentTex  = handle.texture;
      this._videoTex    = handle.texture;
      this._videoHandle = handle;
      this._setAspect(handle.texture);
    } catch (err) {
      console.error("[MediaPass] failed to start webcam:", err);
      this._loadedUrl = null;
    }
  }

  // ── PassNode overrides ─────────────────────────────────────────────────────

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    // Mark video frame dirty so WebGPU re-uploads it
    if (this._videoTex) this._videoTex.needsUpdate = true;
    // Refresh texture binding every frame (same pattern as FullscreenQuad.tick)
    if (this._currentTex && this._mediaTexNode) {
      this._mediaTexNode.value = this._currentTex;
    }
    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  override resize(width: number, height: number): void {
    if (this._uCanvasAspect) {
      this._uCanvasAspect.value = width / Math.max(height, 1);
    }
  }

  override needsContinuousRender(): boolean {
    return this._videoTex !== null;
  }

  override dispose(): void {
    this._releaseCurrentMedia();
    this._placeholder.dispose();
    super.dispose();
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: super() calls this before uniforms exist. Return passthrough.
    if (!this._uCanvasAspect) return this._inputNode;

    // Cover UV — regular uv() (no Y-flip: image textures are bottom-origin)
    const ratio       = this._uTextureAspect.div(this._uCanvasAspect);
    const centeredUV  = uv().sub(0.5);
    const coverScaleX = max(ratio, float(1.0));
    const coverScaleY = max(float(1.0).div(ratio), float(1.0));
    const scaledX = centeredUV.x.div(coverScaleX);
    const mirroredX = mix(scaledX, scaledX.negate(), this._uMirrorX);
    const coverUV = vec2(
      mirroredX,
      centeredUV.y.div(coverScaleY),
    ).add(0.5);

    this._mediaTexNode = tslTexture(this._placeholder, coverUV);
    return vec4(this._mediaTexNode.rgb, float(1.0));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _setAspect(tex: THREE.Texture): void {
    const img = tex.image as HTMLImageElement | HTMLVideoElement | null | undefined;
    const tw =
      img instanceof HTMLVideoElement
        ? img.videoWidth
        : (img as HTMLImageElement | null)?.naturalWidth ?? 1;
    const th =
      img instanceof HTMLVideoElement
        ? img.videoHeight
        : (img as HTMLImageElement | null)?.naturalHeight ?? 1;
    if (this._uTextureAspect) {
      this._uTextureAspect.value = tw / Math.max(th, 1);
    }
  }

  private _releaseCurrentMedia(): void {
    this._currentTex?.dispose();
    this._currentTex  = null;
    this._videoTex    = null;
    this._videoHandle?.dispose();
    this._videoHandle = null;
    this._loadedUrl   = null;
  }
}
