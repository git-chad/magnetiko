import * as THREE from "three/webgpu";

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU availability
// ─────────────────────────────────────────────────────────────────────────────

export function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RendererConfig {
  /** Default: true */
  antialias?: boolean;
  /** Default: false — set true for transparent backgrounds */
  alpha?: boolean;
}

export interface MagnetikoRenderer {
  renderer: THREE.WebGPURenderer;
  /** Orthographic camera pre-configured for fullscreen quad rendering */
  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  /** Register a per-frame callback. Called before every render. */
  setAnimationCallback(fn: (timeSec: number, deltaSec: number) => void): void;
  /** Update renderer and camera to new logical dimensions (before DPR scaling). */
  resize(width: number, height: number): void;
  /** Stop the render loop and release all GPU resources. */
  dispose(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialise a WebGPURenderer bound to `canvas` and return a handle to it.
 * Must be called in a browser environment (inside useEffect / event handler).
 *
 * @example
 * const mr = await createRenderer(canvasEl, { antialias: true });
 * mr.scene.add(myMesh);
 * mr.setAnimationCallback((t, dt) => { myMesh.rotation.y += dt; });
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  config: RendererConfig = {},
): Promise<MagnetikoRenderer> {
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: config.antialias ?? true,
    alpha: config.alpha ?? false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Use false so we manage CSS sizing separately
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);

  await renderer.init();

  console.log(
    "%c[Magnetiko] WebGPU initialized ✓",
    "color:#8d8d58;font-weight:bold;font-family:monospace",
  );

  // Orthographic camera spanning NDC: x∈[-1,1], y∈[-1,1], z∈[0,1]
  // A PlaneGeometry(2,2) fills this exactly.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();

  let animCallback: ((timeSec: number, deltaSec: number) => void) | null = null;
  let prevTimeSec = 0;

  renderer.setAnimationLoop((timeMs: number) => {
    const timeSec = timeMs / 1000;
    const deltaSec = prevTimeSec > 0 ? timeSec - prevTimeSec : 0;
    prevTimeSec = timeSec;

    animCallback?.(timeSec, deltaSec);
    renderer.render(scene, camera);
  });

  function resize(width: number, height: number): void {
    // setSize with updateStyle=false so CSS controls visual dimensions
    renderer.setSize(width, height, false);
    // OrthographicCamera for fullscreen quad never needs aspect updates
  }

  function dispose(): void {
    renderer.setAnimationLoop(null);
    renderer.dispose();
  }

  return {
    renderer,
    camera,
    scene,
    setAnimationCallback: (fn) => {
      animCallback = fn;
    },
    resize,
    dispose,
  };
}
