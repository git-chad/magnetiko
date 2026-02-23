"use client";

import * as React from "react";
import {
  ArrowCounterClockwise,
  Info,
} from "@phosphor-icons/react";
import {
  Button,
  Slider,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert any CSS colour string to a 6-digit hex string for <input type="color">. */
function toHexColor(css: string): string {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css;
  if (/^#[0-9a-f]{3}$/i.test(css)) {
    const [, r, g, b] = css.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  // Fall back to Canvas 2D API for any other CSS colour (rgb(), hsl(), named…)
  if (typeof document !== "undefined") {
    try {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = css;
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return (
        "#" +
        r.toString(16).padStart(2, "0") +
        g.toString(16).padStart(2, "0") +
        b.toString(16).padStart(2, "0")
      );
    } catch {
      /* ignore */
    }
  }
  return "#000000";
}

function valuesEqual(a: ShaderParam["value"], b: ShaderParam["value"]): boolean {
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
  className,
}: ParamControlProps) {
  const commitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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

        {/* Reset button — visible only on hover when value differs from default */}
        {defaultParam && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Reset ${param.label} to default`}
            onClick={handleReset}
            className={`transition-opacity ${
              hovered && isDirty ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <ArrowCounterClockwise size={11} />
          </Button>
        )}
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
      return <_ColorControl value={param.value as string} emit={emit} />;

    case "enum":
      return (
        <Select
          value={param.value as string}
          onValueChange={(v) => emit(v)}
        >
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
        <div className="space-y-3xs">
          <_SliderRow
            label="X"
            value={x}
            min={param.min ?? 0}
            max={param.max ?? 1}
            step={param.step ?? 0.01}
            emit={(v) => emit([v, y])}
          />
          <_SliderRow
            label="Y"
            value={y}
            min={param.min ?? 0}
            max={param.max ?? 1}
            step={param.step ?? 0.01}
            emit={(v) => emit([x, v])}
          />
        </div>
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
  const display  = value.toFixed(decimals);

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
  const display  = value.toFixed(decimals);

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
// _ColorControl — colour swatch that opens a native colour picker
// ─────────────────────────────────────────────────────────────────────────────

function _ColorControl({
  value,
  emit,
}: {
  value: string;
  emit: (v: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const hex      = toHexColor(value);

  return (
    <div className="flex items-center gap-xs">
      {/* Swatch — click to open native colour picker */}
      <button
        type="button"
        aria-label="Pick colour"
        className="h-6 w-10 flex-shrink-0 cursor-pointer rounded-xs border border-[var(--color-border)] shadow-inner transition-opacity hover:opacity-80"
        style={{ backgroundColor: hex }}
        onClick={() => inputRef.current?.click()}
      />
      {/* Native colour input (hidden; triggered by swatch click) */}
      <input
        ref={inputRef}
        type="color"
        className="sr-only"
        value={hex}
        onChange={(e) => emit(e.target.value)}
      />
      {/* Hex readout */}
      <span className="font-mono text-caption text-[var(--color-fg-tertiary)] uppercase">
        {hex}
      </span>
    </div>
  );
}
