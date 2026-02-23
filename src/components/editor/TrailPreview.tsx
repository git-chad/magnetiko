"use client";

import * as React from "react";
import * as THREE from "three/webgpu";
import { Badge, Button, Text } from "@/components/ui";
import { isWebGPUSupported } from "@/lib/renderer/WebGPURenderer";
import { PipelineManager } from "@/lib/renderer/PipelineManager";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────

type EffectMode = "ripple" | "trail" | "glow";

const EFFECT_CONFIGS: Record<
  EffectMode,
  { label: string; hint: string; color: string; strength: number }
> = {
  ripple: { label: "Ripple", hint: "Click to spawn rings",  color: "#64ccff", strength: 0.8 },
  trail:  { label: "Trail",  hint: "Move mouse to paint",   color: "#ffffff", strength: 1.0 },
  glow:   { label: "Glow",   hint: "Move cursor for glow",  color: "#ff9940", strength: 1.0 },
};

function buildParams(effect: EffectMode): ShaderParam[] {
  const cfg = EFFECT_CONFIGS[effect];
  return [
    { key: "effect",   label: "Effect",   type: "enum",  value: effect },
    { key: "color",    label: "Color",    type: "color", value: cfg.color },
    { key: "radius",   label: "Radius",   type: "float", value: 60 },
    { key: "strength", label: "Strength", type: "float", value: cfg.strength },
    { key: "decay",    label: "Decay",    type: "float", value: 0.97 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// TrailPreview
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Self-contained interactive shader demo.
 *
 * Creates its own WebGPURenderer + PipelineManager with a single
 * InteractivityPass (not connected to the global layerStore).
 * Mouse events are forwarded directly to the pass via
 * PipelineManager.setPointerForInteractivity() / addClickForInteractivity().
 */
export function TrailPreview() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef    = React.useRef<HTMLCanvasElement>(null);
  const pipelineRef  = React.useRef<PipelineManager | null>(null);
  const prevPosRef   = React.useRef<{ x: number; y: number } | null>(null);

  const [status, setStatus] = React.useState<"loading" | "ok" | "unsupported" | "error">("loading");
  const [fps,    setFps   ] = React.useState(0);
  const [mode,   setMode  ] = React.useState<EffectMode>("trail");

  // ── WebGPU init (once) ─────────────────────────────────────────────────────
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    if (!isWebGPUSupported()) { setStatus("unsupported"); return; }

    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;
    let pipeline: PipelineManager | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        renderer = new THREE.WebGPURenderer({ canvas: canvas!, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const rect = container.getBoundingClientRect();
        const w    = Math.max(Math.floor(rect.width),  1);
        const h    = Math.max(Math.floor(rect.height), 1);
        renderer.setSize(w, h, false);
        await renderer.init();
        if (disposed) { renderer.dispose(); return; }

        pipeline = new PipelineManager(renderer, w, h);
        pipelineRef.current = pipeline;
        pipeline.baseQuad.updateCanvasAspect(w, h);

        // Seed the pipeline with a single interactivity pass (trail mode by default).
        pipeline.syncLayers([{
          id:           "trail-demo",
          shaderType:   "interactivity",
          visible:      true,
          opacity:      1,
          blendMode:    "normal",
          filterMode:   "filter",
          params:       buildParams("trail"),
        }]);

        // Animation loop
        let frames = 0, lastFpsSec = 0, prevTimeSec = 0;
        renderer.setAnimationLoop((timeMs: number) => {
          const timeSec = timeMs / 1000;
          const delta   = prevTimeSec > 0 ? timeSec - prevTimeSec : 0;
          prevTimeSec   = timeSec;
          pipeline!.render(timeSec, delta);
          frames++;
          if (timeSec - lastFpsSec >= 1) {
            setFps(frames);
            frames = 0;
            lastFpsSec = timeSec;
          }
        });

        ro = new ResizeObserver(([entry]) => {
          const { width: rw, height: rh } = entry.contentRect;
          if (rw > 0 && rh > 0) {
            renderer?.setSize(Math.floor(rw), Math.floor(rh), false);
            pipeline?.resize(Math.floor(rw), Math.floor(rh));
          }
        });
        ro.observe(container!);
        setStatus("ok");
      } catch (err) {
        if (!disposed) setStatus("error");
        console.error("[TrailPreview]", err);
      }
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      renderer?.setAnimationLoop(null);
      pipeline?.dispose();
      renderer?.dispose();
      pipelineRef.current = null;
    };
  }, []);

  // Push new effect params whenever the mode button changes.
  React.useEffect(() => {
    pipelineRef.current?.updateLayerParams("trail-demo", buildParams(mode));
  }, [mode]);

  // ── Pointer helpers ────────────────────────────────────────────────────────

  function getUV(e: React.MouseEvent<HTMLDivElement>): { uvX: number; uvY: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      uvX: (e.clientX - rect.left) / rect.width,
      uvY: (e.clientY - rect.top)  / rect.height,
    };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const p = pipelineRef.current;
    if (!p || !containerRef.current) return;
    const { uvX, uvY } = getUV(e);
    const prev = prevPosRef.current ?? { x: uvX, y: uvY };
    p.setPointerForInteractivity(uvX, uvY, uvX - prev.x, uvY - prev.y, true);
    prevPosRef.current = { x: uvX, y: uvY };
  }

  function handleMouseLeave() {
    const p   = pipelineRef.current;
    const pos = prevPosRef.current ?? { x: 0.5, y: 0.5 };
    p?.setPointerForInteractivity(pos.x, pos.y, 0, 0, false);
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "ripple") return;
    const p = pipelineRef.current;
    if (!p || !containerRef.current) return;
    const { uvX, uvY } = getUV(e);
    p.addClickForInteractivity(uvX, uvY);
  }

  // ─────────────────────────────────────────────────────────────────────────

  const cfg = EFFECT_CONFIGS[mode];

  return (
    <div className="space-y-xs">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative h-64 w-full overflow-hidden rounded-sm border border-[var(--color-border)] bg-primary cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: status === "ok" ? "block" : "none" }}
        />

        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Text variant="caption" color="disabled">Initialising WebGPU…</Text>
          </div>
        )}
        {status === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-xs text-center px-md">
            <Text variant="caption" color="secondary">WebGPU not available</Text>
            <Text variant="caption" color="disabled">Requires Chrome 113+, Edge 113+, or Safari 18+</Text>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Text variant="caption" color="tertiary">Renderer error — check console</Text>
          </div>
        )}

        {status === "ok" && (
          <>
            {/* Hint overlay */}
            <div className="pointer-events-none absolute top-xs left-xs">
              <span className="rounded-xs bg-black/30 px-xs py-3xs font-mono text-caption text-[var(--color-fg-disabled)]">
                {cfg.hint}
              </span>
            </div>
            {/* Badges */}
            <div className="pointer-events-none absolute bottom-xs right-xs flex items-center gap-3xs">
              <Badge variant="secondary" className="border-0 bg-black/40 text-white backdrop-blur-sm">
                {fps} fps
              </Badge>
              <Badge variant="accent" className="border-0 bg-black/40 backdrop-blur-sm">
                {cfg.label}
              </Badge>
            </div>
          </>
        )}
      </div>

      {/* Effect mode switcher */}
      <div className="flex items-center gap-3xs">
        {(["ripple", "trail", "glow"] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? "primary" : "secondary"}
            onClick={() => setMode(m)}
          >
            {EFFECT_CONFIGS[m].label}
          </Button>
        ))}
      </div>
    </div>
  );
}
