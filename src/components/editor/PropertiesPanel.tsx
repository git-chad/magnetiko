"use client";

import * as React from "react";
import { Sliders } from "@phosphor-icons/react";
import { Text } from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// PropertiesPanel — Phase 3.1 stub
// Full implementation in Phase 5.2
// ─────────────────────────────────────────────────────────────────────────────

export function PropertiesPanel() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center gap-3xs border-b border-[var(--color-border)] px-xs">
        <Sliders size={14} className="text-[var(--color-fg-tertiary)]" />
        <Text variant="caption" color="secondary" className="font-medium">
          Properties
        </Text>
      </div>

      {/* Body */}
      <div className="flex flex-1 items-center justify-center p-md">
        <Text variant="caption" color="disabled" className="text-center">
          Select a layer to edit its properties
        </Text>
      </div>
    </div>
  );
}
