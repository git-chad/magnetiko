"use client";

import { ArrowCounterClockwise, Diamond, Info } from "@phosphor-icons/react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/ColorPicker";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import type { ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParamControlProps {
  param: ShaderParam;
  /** Full default param object (same key). Used to determine if reset is needed. */
  defaultParam?: ShaderParam;
  /**
   * Called immediately on every interaction.
   * Use this to update shader uniforms in real-time.
   */
  onChange: (key: string, value: ShaderParam["value"]) => void;
  /**
   * Called ~300 ms after the last interaction for the same param.
   * Use this to push a history snapshot.
   */
  onCommit?: (key: string, value: ShaderParam["value"]) => void;
  keyframe?: {
    state: "none" | "track" | "keyframe";
    onToggle: () => void;
    disabled?: boolean;
  };
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function valuesEqual(
  a: ShaderParam["value"],
  b: ShaderParam["value"],
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === (b as number[])[i]);
  }
  return a === b;
}

// ─────────────────────────────────────────────────────────────────────────────
// ParamControl
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the appropriate control for a single ShaderParam.
 *
 * Debounce behaviour:
 *   - onChange fires immediately (real-time uniform updates)
 *   - onCommit fires 300 ms after the last change (history snapshot)
 *
 * Supported param types:
 *   float / int  → Slider with numeric readout
 *   bool         → Switch
 *   color        → Native colour picker swatch (Phase 5.3 will replace with custom)
 *   enum         → Select dropdown
 *   vec2         → Two sliders (X / Y)
 *   vec3         → Three sliders (X / Y / Z)
 */
export function ParamControl({
  param,
  defaultParam,
  onChange,
  onCommit,
  keyframe,
  className,
}: ParamControlProps) {
  const commitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [hovered, setHovered] = React.useState(false);

  const isDirty =
    defaultParam !== undefined && !valuesEqual(param.value, defaultParam.value);

  // ── Debounced helpers ──────────────────────────────────────────────────────

  function emit(value: ShaderParam["value"]) {
    onChange(param.key, value);
    if (onCommit) {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        onCommit(param.key, value);
      }, 300);
    }
  }

  function handleReset() {
    if (!defaultParam) return;
    emit(defaultParam.value);
  }

  // ── Layout wrapper ─────────────────────────────────────────────────────────

  return (
    <div
      className={`group flex flex-col gap-3xs py-3xs ${className ?? ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Label row */}
      <div className="flex items-center justify-between gap-xs">
        <div className="flex items-center gap-3xs">
          <Text variant="caption" color="secondary" as="span">
            {param.label}
          </Text>
          {param.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[var(--color-fg-disabled)] transition-colors hover:text-[var(--color-fg-secondary)]">
                  <Info size={11} weight="bold" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[16rem]">
                {param.description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-3xs">
          {keyframe && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant={
                    keyframe.state === "keyframe" ? "secondary" : "ghost"
                  }
                  aria-label={`Toggle keyframe for ${param.label}`}
                  onClick={keyframe.onToggle}
                  disabled={keyframe.disabled}
                  className={
                    keyframe.state === "track"
                      ? "text-[var(--color-accent)]"
                      : undefined
                  }
                >
                  <Diamond
                    size={11}
                    weight={keyframe.state === "none" ? "regular" : "fill"}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {keyframe.state === "keyframe"
                  ? "Remove keyframe at playhead"
                  : "Add keyframe at playhead"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Reset button — visible only on hover when value differs from default */}
          {defaultParam && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Reset ${param.label} to default`}
              onClick={handleReset}
              className={`transition-opacity ${
                hovered && isDirty
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <ArrowCounterClockwise size={11} />
            </Button>
          )}
        </div>
      </div>

      {/* Control */}
      <_ParamInput param={param} emit={emit} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _ParamInput — routes to the correct control by type
// ─────────────────────────────────────────────────────────────────────────────

interface _ParamInputProps {
  param: ShaderParam;
  emit: (value: ShaderParam["value"]) => void;
}

function _ParamInput({ param, emit }: _ParamInputProps) {
  switch (param.type) {
    case "float":
    case "int":
      return (
        <_SliderControl
          value={param.value as number}
          min={param.min ?? 0}
          max={param.max ?? 1}
          step={param.type === "int" ? 1 : (param.step ?? 0.01)}
          emit={emit}
        />
      );

    case "bool":
      return (
        <div className="flex items-center gap-xs">
          <Switch
            checked={param.value as boolean}
            onCheckedChange={(v) => emit(v)}
          />
          <Text variant="caption" color="tertiary" as="span">
            {(param.value as boolean) ? "On" : "Off"}
          </Text>
        </div>
      );

    case "color":
      return (
        <ColorPicker
          value={param.value as string}
          onChange={(hex) => emit(hex)}
        />
      );

    case "enum":
      return (
        <Select value={param.value as string} onValueChange={(v) => emit(v)}>
          <SelectTrigger className="h-7 text-caption">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(param.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "vec2": {
      const [x, y] = param.value as number[];
      return (
        <_XYPadControl
          value={[x, y]}
          min={param.min ?? 0}
          max={param.max ?? 1}
          step={param.step ?? 0.01}
          emit={(v) => emit(v)}
        />
      );
    }

    case "vec3": {
      const [x, y, z] = param.value as number[];
      return (
        <div className="space-y-3xs">
          <_SliderRow
            label="X"
            value={x}
            min={param.min ?? 0}
            max={param.max ?? 1}
            step={param.step ?? 0.01}
            emit={(v) => emit([v, y, z])}
          />
          <_SliderRow
            label="Y"
            value={y}
            min={param.min ?? 0}
            max={param.max ?? 1}
            step={param.step ?? 0.01}
            emit={(v) => emit([x, v, z])}
          />
          <_SliderRow
            label="Z"
            value={z}
            min={param.min ?? 0}
            max={param.max ?? 1}
            step={param.step ?? 0.01}
            emit={(v) => emit([x, y, v])}
          />
        </div>
      );
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _SliderControl — single slider with numeric readout
// ─────────────────────────────────────────────────────────────────────────────

function _SliderControl({
  value,
  min,
  max,
  step,
  emit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  emit: (v: number) => void;
}) {
  // Format displayed value: show 0 decimals for integers, up to 2 for floats.
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const display = value.toFixed(decimals);

  return (
    <div className="flex items-center gap-xs">
      <Slider
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => emit(v)}
      />
      <span className="w-9 shrink-0 text-right font-mono text-caption text-[var(--color-fg-tertiary)] tabular-nums">
        {display}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _SliderRow — labelled slider used inside vec2 / vec3 controls
// ─────────────────────────────────────────────────────────────────────────────

function _SliderRow({
  label,
  value,
  min,
  max,
  step,
  emit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  emit: (v: number) => void;
}) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const display = value.toFixed(decimals);

  return (
    <div className="flex items-center gap-xs">
      <Text
        variant="caption"
        color="disabled"
        as="span"
        className="w-3 shrink-0 text-center"
      >
        {label}
      </Text>
      <Slider
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => emit(v)}
      />
      <span className="w-9 shrink-0 text-right font-mono text-caption text-[var(--color-fg-tertiary)] tabular-nums">
        {display}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _XYPadControl — 2D click/drag pad for vec2 params (Phase 5.4)
// ─────────────────────────────────────────────────────────────────────────────

function _XYPadControl({
  value,
  min,
  max,
  step,
  emit,
}: {
  value: [number, number];
  min: number;
  max: number;
  step: number;
  emit: (v: number[]) => void;
}) {
  const [x, y] = value;
  const padRef = React.useRef<HTMLDivElement>(null);
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;

  // Normalize value → 0-1 for display, denormalize back for emit
  const norm = (val: number) => (val - min) / (max - min);
  const denorm = (n: number) => min + n * (max - min);
  const snap = (val: number) => Math.round(val / step) * step;
  const clamp = (val: number) => Math.max(min, Math.min(max, val));

  const applyDrag = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!padRef.current) return;
      const rect = padRef.current.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      emit([clamp(snap(denorm(nx))), clamp(snap(denorm(ny)))]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max, step, emit],
  );

  return (
    <div className="flex flex-col gap-3xs">
      {/* ── 2D pad ── */}
      <div
        ref={padRef}
        role="presentation"
        aria-label="XY control pad"
        className="relative w-full select-none cursor-crosshair rounded-xs border border-[var(--color-border)] overflow-hidden"
        style={{ aspectRatio: "1 / 1" }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          applyDrag(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (
            !(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)
          )
            return;
          applyDrag(e.clientX, e.clientY);
        }}
      >
        {/* Subtle grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              "linear-gradient(var(--color-border) 1px, transparent 1px)",
              "linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "25% 25%",
            opacity: 0.4,
          }}
        />

        {/* Crosshair lines */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px"
          style={{
            left: `${norm(x) * 100}%`,
            backgroundColor: "var(--color-accent)",
            opacity: 0.35,
          }}
        />
        <div
          className="pointer-events-none absolute left-0 right-0 h-px"
          style={{
            top: `${norm(y) * 100}%`,
            backgroundColor: "var(--color-accent)",
            opacity: 0.35,
          }}
        />

        {/* Handle dot */}
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white"
          style={{
            width: 12,
            height: 12,
            left: `${norm(x) * 100}%`,
            top: `${norm(y) * 100}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: "var(--color-accent)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }}
        />
      </div>

      {/* ── Precise sliders ── */}
      <_SliderRow
        label="X"
        value={x}
        min={min}
        max={max}
        step={step}
        emit={(val) => emit([val, y])}
      />
      <_SliderRow
        label="Y"
        value={y}
        min={min}
        max={max}
        step={step}
        emit={(val) => emit([x, val])}
      />

      {/* Numeric readout */}
      <div className="flex justify-end gap-xs">
        <span className="font-mono text-caption text-[var(--color-fg-disabled)] tabular-nums">
          {x.toFixed(decimals)}, {y.toFixed(decimals)}
        </span>
      </div>
    </div>
  );
}
