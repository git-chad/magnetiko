"use client";

import * as React from "react";
import * as THREE from "three/webgpu";
import { texture as tslTexture, uniform } from "three/tsl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Text } from "@/components/ui";
import { isWebGPUSupported } from "@/lib/renderer/WebGPURenderer";
import { buildBlendNode } from "@/lib/utils/blendModes";
import type { BlendMode } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────

const BLEND_MODES: BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to build test textures via 2D canvas
// ─────────────────────────────────────────────────────────────────────────────

function makeBaseTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d")!;
  // Horizontal: blue → purple → red
  const hGrad = ctx.createLinearGradient(0, 0, 512, 0);
  hGrad.addColorStop(0,   "#1a4fc4");
  hGrad.addColorStop(0.5, "#9b59b6");
  hGrad.addColorStop(1,   "#e74c3c");
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, 512, 512);
  // Vertical brightness sweep
  const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
  vGrad.addColorStop(0,   "rgba(255,255,255,0.55)");
  vGrad.addColorStop(0.5, "rgba(0,0,0,0)");
  vGrad.addColorStop(1,   "rgba(0,0,0,0.55)");
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBlendTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d")!;
  // Diagonal: orange → yellow → green
  const dGrad = ctx.createLinearGradient(0, 0, 512, 512);
  dGrad.addColorStop(0,   "#e67e22");
  dGrad.addColorStop(0.5, "#f1c40f");
  dGrad.addColorStop(1,   "#27ae60");
  ctx.fillStyle = dGrad;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Swatch — static CSS preview of a texture (no GPU needed)
// ─────────────────────────────────────────────────────────────────────────────

function Swatch({ label, gradient }: { label: string; gradient: string }) {
  return (
    <div className="space-y-3xs">
      <Text variant="caption" color="tertiary">{label}</Text>
      <div
        className="h-28 w-full rounded-xs border border-[var(--color-border)]"
        style={{ background: gradient }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BlendModePreview
// ─────────────────────────────────────────────────────────────────────────────

export function BlendModePreview() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef    = React.useRef<HTMLCanvasElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const materialRef    = React.useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseNodeRef    = React.useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blendNodeRef   = React.useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opacityRef     = React.useRef<any>(null);
  const rendererRef    = React.useRef<THREE.WebGPURenderer | null>(null);

  const [mode, setMode]       = React.useState<BlendMode>("normal");
  const [opacity, setOpacity] = React.useState(1);
  const [status, setStatus]   = React.useState<"loading" | "ready" | "unsupported">("loading");

  // ── Init WebGPU renderer ─────────────────────────────────────────────────
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    if (!isWebGPUSupported()) { setStatus("unsupported"); return; }

    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const rect = container.getBoundingClientRect();
        renderer.setSize(Math.max(Math.floor(rect.width), 1), Math.max(Math.floor(rect.height), 1), false);
        await renderer.init();
        if (disposed) { renderer.dispose(); return; }
        rendererRef.current = renderer;

        // Textures
        const baseTex  = makeBaseTexture();
        const blendTex = makeBlendTexture();

        // TSL nodes
        const opUniform = uniform(1.0);
        opacityRef.current = opUniform;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const baseNode: any  = tslTexture(baseTex);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blendNode: any = tslTexture(blendTex);
        baseNodeRef.current  = baseNode;
        blendNodeRef.current = blendNode;

        // Material
        const material = new THREE.MeshBasicNodeMaterial();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        material.colorNode = buildBlendNode("normal", baseNode, blendNode, opUniform) as any;
        materialRef.current = material;

        const geo  = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geo, material);
        mesh.frustumCulled = false;
        const scene  = new THREE.Scene();
        scene.add(mesh);
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        renderer.setAnimationLoop(() => renderer!.render(scene, camera));

        ro = new ResizeObserver(([entry]) => {
          const { width: rw, height: rh } = entry.contentRect;
          if (rw > 0 && rh > 0) renderer?.setSize(Math.floor(rw), Math.floor(rh), false);
        });
        ro.observe(container);

        setStatus("ready");
      } catch (err) {
        console.error("[BlendModePreview]", err);
        if (!disposed) setStatus("unsupported");
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      renderer?.setAnimationLoop(null);
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── Swap blend mode (one recompile) ─────────────────────────────────────
  React.useEffect(() => {
    const mat   = materialRef.current;
    const base  = baseNodeRef.current;
    const blend = blendNodeRef.current;
    const op    = opacityRef.current;
    if (!mat || !base || !blend || !op) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mat.colorNode = buildBlendNode(mode, base, blend, op) as any;
    mat.needsUpdate = true;
  }, [mode]);

  // ── Update opacity uniform (no recompile) ───────────────────────────────
  React.useEffect(() => {
    if (opacityRef.current) opacityRef.current.value = opacity;
  }, [opacity]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-xs">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-xs">
        <Select
          value={mode}
          onValueChange={(v) => setMode(v as BlendMode)}
          disabled={status !== "ready"}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Blend mode…" />
          </SelectTrigger>
          <SelectContent>
            {BLEND_MODES.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-xs">
          <Text variant="caption" color="secondary" as="span">Opacity</Text>
          <Slider
            className="w-32"
            min={0} max={1} step={0.01}
            value={[opacity]}
            onValueChange={([v]) => setOpacity(v)}
            showValue
            disabled={status !== "ready"}
          />
        </div>
      </div>

      {/* Three-pane display: base | blend | result */}
      <div className="grid grid-cols-3 gap-xs">
        <Swatch
          label="Base"
          gradient="linear-gradient(to right, #1a4fc4, #9b59b6, #e74c3c)"
        />
        <Swatch
          label="Blend"
          gradient="linear-gradient(135deg, #e67e22, #f1c40f, #27ae60)"
        />

        {/* WebGPU result */}
        <div className="space-y-3xs">
          <Text variant="caption" color="tertiary">
            Result — <span className="font-medium text-[var(--color-fg-secondary)]">{mode}</span>
          </Text>
          <div
            ref={containerRef}
            className="relative h-28 w-full overflow-hidden rounded-xs border border-[var(--color-border)] bg-black"
          >
            <canvas
              ref={canvasRef}
              className="h-full w-full"
              style={{ display: status === "ready" ? "block" : "none" }}
            />
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Text variant="caption" color="disabled">Initialising…</Text>
              </div>
            )}
            {status === "unsupported" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Text variant="caption" color="disabled">WebGPU unavailable</Text>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
