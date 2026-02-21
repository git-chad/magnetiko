"use client";

import * as React from "react";
import { ArrowLineLeft, ArrowLineRight } from "@phosphor-icons/react";
import { Button, ThemeToggle, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { useEditorStore } from "@/store/editorStore";

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar — Phase 3.1 stub
// Full implementation in Phase 3.2 (undo/redo, zoom, export, settings)
// ─────────────────────────────────────────────────────────────────────────────

export function Toolbar() {
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const leftOpen = useEditorStore((s) => s.sidebarOpen.left);
  const rightOpen = useEditorStore((s) => s.sidebarOpen.right);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-raised)] px-xs">
      {/* Left: logo + sidebar toggle */}
      <div className="flex items-center gap-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Toggle layer panel"
              onClick={() => toggleSidebar("left")}
            >
              <ArrowLineLeft size={15} className={leftOpen ? "opacity-100" : "opacity-40"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{leftOpen ? "Collapse" : "Expand"} layers</TooltipContent>
        </Tooltip>

        <span className="font-medium text-sm tracking-tight text-[var(--color-fg-primary)] select-none">
          magnetiko
        </span>
      </div>

      {/* Center: placeholder for Phase 3.2 controls */}
      <div className="flex items-center gap-xs" />

      {/* Right: theme toggle + right sidebar toggle */}
      <div className="flex items-center gap-xs">
        <ThemeToggle />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Toggle properties panel"
              onClick={() => toggleSidebar("right")}
            >
              <ArrowLineRight size={15} className={rightOpen ? "opacity-100" : "opacity-40"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{rightOpen ? "Collapse" : "Expand"} properties</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
