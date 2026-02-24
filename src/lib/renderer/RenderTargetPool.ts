import * as THREE from "three/webgpu";

export type PooledRenderTargetOptions = Pick<
  THREE.RenderTargetOptions,
  "minFilter" | "magFilter" | "format" | "type" | "depthBuffer" | "stencilBuffer" | "generateMipmaps"
>;

const DEFAULT_OPTIONS: PooledRenderTargetOptions = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: false,
  stencilBuffer: false,
  generateMipmaps: false,
};

/**
 * Shared render-target pool keyed by texture attachment options.
 *
 * Targets are reused across pass lifecycles (add/remove/recreate) to avoid
 * repeated GPU allocations and transient memory spikes.
 */
export class RenderTargetPool {
  private readonly _buckets = new Map<string, THREE.WebGLRenderTarget[]>();
  private readonly _targetKey = new WeakMap<THREE.WebGLRenderTarget, string>();
  private readonly _leased = new WeakSet<THREE.WebGLRenderTarget>();

  acquire(
    width: number,
    height: number,
    options: Partial<PooledRenderTargetOptions> = {},
  ): THREE.WebGLRenderTarget {
    const normalized = this._normalizeOptions(options);
    const key = this._makeKey(normalized);
    const bucket = this._buckets.get(key);
    const target = bucket?.pop() ?? this._createTarget(width, height, normalized);

    target.setSize(Math.max(width, 1), Math.max(height, 1));
    this._targetKey.set(target, key);
    this._leased.add(target);
    return target;
  }

  release(target: THREE.WebGLRenderTarget): void {
    if (!this._leased.has(target)) return;
    this._leased.delete(target);

    const key = this._targetKey.get(target);
    if (!key) {
      target.dispose();
      return;
    }

    const bucket = this._buckets.get(key);
    if (bucket) {
      bucket.push(target);
      return;
    }
    this._buckets.set(key, [target]);
  }

  dispose(): void {
    for (const bucket of this._buckets.values()) {
      for (const target of bucket) {
        target.dispose();
      }
    }
    this._buckets.clear();
  }

  private _normalizeOptions(
    options: Partial<PooledRenderTargetOptions>,
  ): PooledRenderTargetOptions {
    return {
      minFilter: options.minFilter ?? DEFAULT_OPTIONS.minFilter,
      magFilter: options.magFilter ?? DEFAULT_OPTIONS.magFilter,
      format: options.format ?? DEFAULT_OPTIONS.format,
      type: options.type ?? DEFAULT_OPTIONS.type,
      depthBuffer: options.depthBuffer ?? DEFAULT_OPTIONS.depthBuffer,
      stencilBuffer: options.stencilBuffer ?? DEFAULT_OPTIONS.stencilBuffer,
      generateMipmaps: options.generateMipmaps ?? DEFAULT_OPTIONS.generateMipmaps,
    };
  }

  private _makeKey(options: PooledRenderTargetOptions): string {
    return [
      options.minFilter,
      options.magFilter,
      options.format,
      options.type,
      options.depthBuffer ? 1 : 0,
      options.stencilBuffer ? 1 : 0,
      options.generateMipmaps ? 1 : 0,
    ].join("|");
  }

  private _createTarget(
    width: number,
    height: number,
    options: PooledRenderTargetOptions,
  ): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(Math.max(width, 1), Math.max(height, 1), options);
  }
}

export const sharedRenderTargetPool = new RenderTargetPool();
