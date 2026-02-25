"use client";

import * as React from "react";
import gsap from "gsap";
import { Toolbar } from "@/components/editor/Toolbar";
import { LayerPanel } from "@/components/editor/LayerPanel";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { Canvas } from "@/components/editor/Canvas";
import { PresetBrowser } from "@/components/editor/PresetBrowser";
import { useEditorStore } from "@/store/editorStore";
import { useLayerStore } from "@/store/layerStore";
import { TooltipProvider } from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LEFT_W = 280;  // px
const RIGHT_W = 320; // px
const ANIM = { duration: 0.15, ease: "power2.inOut" } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Editor layout
// ─────────────────────────────────────────────────────────────────────────────

export default function EditorPage() {
  const leftOpen  = useEditorStore((s) => s.sidebarOpen.left);
  const rightOpen = useEditorStore((s) => s.sidebarOpen.right);
  const layers    = useLayerStore((s) => s.layers);

  // Preset browser — auto-open on first load when no layers
  const [presetOpen, setPresetOpen] = React.useState(false);
  React.useEffect(() => {
    if (layers.length === 0) setPresetOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leftRef = React.useRef<HTMLElement>(null);
  const rightRef = React.useRef<HTMLElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);

  // ── Mobile detection (updated on resize) ────────────────────────────────
  const [isMobile, setIsMobile] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Left sidebar animation ───────────────────────────────────────────────
  React.useEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    const target = isMobile
      ? { x: leftOpen ? 0 : -LEFT_W, opacity: leftOpen ? 1 : 0 }
      : { width: leftOpen ? LEFT_W : 0, opacity: leftOpen ? 1 : 0 };
    if (prefersReducedMotion) {
      gsap.set(el, target);
      return;
    }
    if (isMobile) {
      // Mobile: fixed overlay, translate in from left
      gsap.to(el, { x: leftOpen ? 0 : -LEFT_W, opacity: leftOpen ? 1 : 0, ...ANIM });
    } else {
      // Desktop: inline panel, animate width
      gsap.to(el, { width: leftOpen ? LEFT_W : 0, opacity: leftOpen ? 1 : 0, ...ANIM });
    }
  }, [leftOpen, isMobile, prefersReducedMotion]);

  // ── Right sidebar animation ──────────────────────────────────────────────
  React.useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const target = isMobile
      ? { x: rightOpen ? 0 : RIGHT_W, opacity: rightOpen ? 1 : 0 }
      : { width: rightOpen ? RIGHT_W : 0, opacity: rightOpen ? 1 : 0 };
    if (prefersReducedMotion) {
      gsap.set(el, target);
      return;
    }
    if (isMobile) {
      gsap.to(el, { x: rightOpen ? 0 : RIGHT_W, opacity: rightOpen ? 1 : 0, ...ANIM });
    } else {
      gsap.to(el, { width: rightOpen ? RIGHT_W : 0, opacity: rightOpen ? 1 : 0, ...ANIM });
    }
  }, [rightOpen, isMobile, prefersReducedMotion]);

  // ── Mobile backdrop ──────────────────────────────────────────────────────
  const anySidebarOpen = isMobile && (leftOpen || rightOpen);
  React.useEffect(() => {
    const el = backdropRef.current;
    if (!el) return;
    if (prefersReducedMotion) {
      gsap.set(el, {
        display: anySidebarOpen ? "block" : "none",
        opacity: anySidebarOpen ? 1 : 0,
      });
      return;
    }
    if (anySidebarOpen) {
      gsap.set(el, { display: "block" });
      gsap.to(el, { opacity: 1, duration: 0.15 });
    } else {
      gsap.to(el, { opacity: 0, duration: 0.15, onComplete: () => { gsap.set(el, { display: "none" }); } });
    }
  }, [anySidebarOpen, prefersReducedMotion]);

  // ── Close both sidebars on mobile backdrop click ─────────────────────────
  const closeSidebars = useEditorStore((s) => s.setSidebarOpen);
  function handleBackdropClick() {
    closeSidebars("left", false);
    closeSidebars("right", false);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative z-10 flex h-screen flex-col overflow-hidden bg-transparent">
        <a
          href="#editor-canvas-main"
          className="sr-only absolute left-2 top-2 z-[120] rounded-xs bg-[var(--color-bg-raised)] px-xs py-3xs text-caption text-[var(--color-fg-primary)] shadow-mid focus:not-sr-only"
        >
          Skip to canvas
        </a>

        {/* ── Toolbar (48px) ─────────────────────────────────────────── */}
        <Toolbar onBrowsePresets={() => setPresetOpen(true)} />

        {/* ── Main area ──────────────────────────────────────────────── */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">

          {/* Left sidebar
              Desktop: flex child — width animated by GSAP
              Mobile:  fixed overlay — translateX animated by GSAP          */}
          <aside
            ref={leftRef}
            style={{ width: LEFT_W }}
            className={[
              "shrink-0 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg-raised)]/78 backdrop-blur-xl",
              // Mobile: fixed overlay starting off-screen
              "max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:top-12 max-lg:z-50 max-lg:shadow-mid",
              "max-lg:translate-x-[-280px]", // initial off-screen on mobile (GSAP takes over)
            ].join(" ")}
          >
            <div className="h-full w-[280px] overflow-y-auto">
              <LayerPanel />
            </div>
          </aside>

          {/* Canvas (fills remaining space) */}
          <main
            id="editor-canvas-main"
            tabIndex={-1}
            className="relative min-w-0 flex-1 overflow-hidden bg-transparent p-4"
          >
            <Canvas className="absolute inset-0 size-full" />
          </main>

          {/* Right sidebar */}
          <aside
            ref={rightRef}
            style={{ width: RIGHT_W }}
            className={[
              "shrink-0 overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-bg-raised)]/78 backdrop-blur-xl",
              "max-lg:fixed max-lg:bottom-0 max-lg:right-0 max-lg:top-12 max-lg:z-50 max-lg:shadow-mid",
              "max-lg:translate-x-[320px]",
            ].join(" ")}
          >
            <div className="h-full w-[320px] overflow-y-auto">
              <PropertiesPanel />
            </div>
          </aside>
        </div>

        {/* Mobile backdrop */}
        <div
          ref={backdropRef}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          style={{ display: "none", opacity: 0 }}
        />

        {/* Preset browser */}
        <PresetBrowser open={presetOpen} onOpenChange={setPresetOpen} />
      </div>
    </TooltipProvider>
  );
}
