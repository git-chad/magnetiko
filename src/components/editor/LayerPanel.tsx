"use client";

import * as React from "react";
import { Stack, Plus } from "@phosphor-icons/react";
import { Button, Text } from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// LayerPanel — Phase 3.1 stub
// Full implementation in Phase 3.3
// ─────────────────────────────────────────────────────────────────────────────

export function LayerPanel() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-xs">
        <div className="flex items-center gap-3xs">
          <Stack size={14} className="text-[var(--color-fg-tertiary)]" />
          <Text variant="caption" color="secondary" className="font-medium">
            Layers
          </Text>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Add layer">
          <Plus size={13} />
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 items-center justify-center p-md">
        <Text variant="caption" color="disabled" className="text-center">
          No layers yet
        </Text>
      </div>
    </div>
  );
}
