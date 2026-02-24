"use client";

import * as React from "react";
import {
  ArrowCounterClockwise,
  Camera,
  CaretDown,
  CaretRight,
  Image as ImageIcon,
  LockSimple,
  LockSimpleOpen,
  Shapes,
  Sliders,
  Trash,
  VideoCamera,
} from "@phosphor-icons/react";
import {
  Button,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { useLayerStore } from "@/store/layerStore";
import { useHistoryStore } from "@/store/historyStore";
import { getDefaultParams } from "@/lib/utils/defaultParams";
import { ParamControl } from "@/components/shared/ParamControl";
import { cn } from "@/lib/utils";
import type { BlendMode, FilterMode, Layer, ShaderParam } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Blend mode option groups (all 16 CSS blend modes, organised by category)
// ─────────────────────────────────────────────────────────────────────────────

const BLEND_MODE_GROUPS: Array<{
  label: string;
  modes: Array<{ value: BlendMode; label: string }>;
}> = [
  { label: "Normal",     modes: [{ value: "normal",    label: "Normal" }] },
  { label: "Darken",     modes: [
    { value: "darken",     label: "Darken" },
    { value: "multiply",   label: "Multiply" },
    { value: "color-burn", label: "Color Burn" },
  ]},
  { label: "Lighten",    modes: [
    { value: "lighten",    label: "Lighten" },
    { value: "screen",     label: "Screen" },
    { value: "color-dodge", label: "Color Dodge" },
  ]},
  { label: "Contrast",   modes: [
    { value: "overlay",    label: "Overlay" },
    { value: "soft-light", label: "Soft Light" },
    { value: "hard-light", label: "Hard Light" },
  ]},
  { label: "Difference", modes: [
    { value: "difference", label: "Difference" },
    { value: "exclusion",  label: "Exclusion" },
  ]},
  { label: "Component",  modes: [
    { value: "hue",        label: "Hue" },
    { value: "saturation", label: "Saturation" },
    { value: "color",      label: "Color" },
    { value: "luminosity", label: "Luminosity" },
  ]},
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: push a snapshot to history
// ─────────────────────────────────────────────────────────────────────────────

function usePushHistory() {
  const pushState = useHistoryStore((s) => s.pushState);
  return React.useCallback(
    (label: string, debounce = false) => {
      const { layers, selectedLayerId } = useLayerStore.getState();
      pushState({ layers, selectedLayerId, label }, debounce);
    },
    [pushState],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertiesPanel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Right sidebar: shows properties for the currently selected layer.
 * When nothing is selected, shows an empty state prompt.
 */
export function PropertiesPanel() {
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const layer = useLayerStore((s) =>
    s.layers.find((l) => l.id === selectedLayerId) ?? null,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header */}
      <div className="flex h-11 shrink-0 items-center gap-3xs border-b border-[var(--color-border)] px-xs">
        <Sliders size={14} className="text-[var(--color-fg-tertiary)]" />
        <Text variant="caption" color="secondary" className="font-medium">
          Properties
        </Text>
      </div>

      {layer ? (
        <>
          {/* Layer header (name + lock) */}
          <_LayerHeader layer={layer} />

          {/* Scrollable body */}
          <ScrollArea className="flex-1">
            <div className="space-y-0">
              <_GeneralSection layer={layer} />
              {layer.kind === "shader" && layer.params.length > 0 && (
                <_ParamsSection layer={layer} />
              )}
              <_ActionsSection layer={layer} />
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-md">
          <Text variant="caption" color="disabled" className="text-center">
            Select a layer to edit its properties
          </Text>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _LayerHeader — editable name + kind icon + lock toggle
// ─────────────────────────────────────────────────────────────────────────────

function _LayerHeader({ layer }: { layer: Layer }) {
  const renameLayer  = useLayerStore((s) => s.renameLayer);
  const setLocked    = useLayerStore((s) => s.setLayerLocked);
  const pushHistory  = usePushHistory();

  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft]         = React.useState(layer.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync draft when an external rename (e.g. from LayerItem) changes the name
  React.useEffect(() => {
    if (!isEditing) setDraft(layer.name);
  }, [layer.name, isEditing]);

  function startEdit() {
    setDraft(layer.name);
    setIsEditing(true);
    // Focus happens via autoFocus on the input
  }

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== layer.name) {
      renameLayer(layer.id, trimmed);
      pushHistory("Rename layer");
    } else {
      setDraft(layer.name);
    }
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter")  commitEdit();
    if (e.key === "Escape") { setDraft(layer.name); setIsEditing(false); }
  }

  function handleLockToggle() {
    setLocked(layer.id, !layer.locked);
    pushHistory(layer.locked ? "Unlock layer" : "Lock layer");
  }

  return (
    <div className="flex items-center gap-xs border-b border-[var(--color-border)] px-xs py-xs">
      {/* Kind icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xs border border-[var(--color-border)] bg-[var(--color-bg)]">
        {layer.kind === "image"   ? <ImageIcon   size={14} className="text-[var(--color-fg-tertiary)]" /> :
         layer.kind === "video"   ? <VideoCamera size={14} className="text-[var(--color-fg-tertiary)]" /> :
         layer.kind === "webcam"  ? <Camera      size={14} className="text-[var(--color-fg-tertiary)]" /> :
         <Shapes size={14} className="text-[var(--color-fg-tertiary)]" />}
      </div>

      {/* Name + type */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            ref={inputRef}
            className="w-full rounded-xs border border-[var(--color-accent)] bg-[var(--color-bg)] px-3xs py-0 text-xs font-medium text-[var(--color-fg-primary)] outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="w-full truncate text-left text-xs font-medium text-[var(--color-fg-primary)] hover:text-[var(--color-accent)] transition-colors"
                onClick={startEdit}
                aria-label="Edit layer name"
              >
                {layer.name}
              </button>
            </TooltipTrigger>
            <TooltipContent>Click to rename</TooltipContent>
          </Tooltip>
        )}
        {layer.shaderType && (
          <span className="mt-[1px] block truncate text-[10px] capitalize leading-none text-[var(--color-fg-disabled)]">
            {layer.shaderType.replace(/-/g, " ")}
          </span>
        )}
      </div>

      {/* Lock toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
            onClick={handleLockToggle}
            className={layer.locked ? "text-[var(--color-fg-secondary)]" : "text-[var(--color-fg-disabled)]"}
          >
            {layer.locked
              ? <LockSimple size={13} weight="bold" />
              : <LockSimpleOpen size={13} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{layer.locked ? "Unlock layer" : "Lock layer"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _SectionHeader — collapsible section heading used in params
// ─────────────────────────────────────────────────────────────────────────────

function _SectionLabel({ title }: { title: string }) {
  return (
    <div className="px-xs pt-xs pb-3xs">
      <Text
        variant="caption"
        color="disabled"
        as="h3"
        className="font-medium uppercase tracking-widest"
      >
        {title}
      </Text>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _GeneralSection — opacity, blend mode, filter/mask
// ─────────────────────────────────────────────────────────────────────────────

function _GeneralSection({ layer }: { layer: Layer }) {
  const setLayerOpacity     = useLayerStore((s) => s.setLayerOpacity);
  const setLayerBlendMode   = useLayerStore((s) => s.setLayerBlendMode);
  const setLayerFilterMode  = useLayerStore((s) => s.setLayerFilterMode);
  const pushHistory         = usePushHistory();

  function handleOpacity(value: number) {
    setLayerOpacity(layer.id, value);
    pushHistory("Change opacity", true); // debounced — historyStore handles 300ms
  }

  function handleBlendMode(mode: BlendMode) {
    setLayerBlendMode(layer.id, mode);
    pushHistory("Change blend mode");
  }

  function handleFilterMode(mode: FilterMode) {
    setLayerFilterMode(layer.id, mode);
    pushHistory("Change layer mode");
  }

  return (
    <div>
      <_SectionLabel title="General" />
      <div className="space-y-0 px-xs pb-xs">

        {/* Opacity */}
        <div className="flex items-center gap-xs py-3xs">
          <Text variant="caption" color="secondary" as="span" className="w-14 shrink-0">
            Opacity
          </Text>
          <Slider
            className="flex-1"
            min={0}
            max={1}
            step={0.01}
            value={[layer.opacity]}
            onValueChange={([v]) => handleOpacity(v)}
          />
          <span className="w-9 shrink-0 text-right font-mono text-caption text-[var(--color-fg-tertiary)] tabular-nums">
            {Math.round(layer.opacity * 100)}%
          </span>
        </div>

        {/* Blend Mode */}
        <div className="flex items-center gap-xs py-3xs">
          <Text variant="caption" color="secondary" as="span" className="w-14 shrink-0">
            Blend
          </Text>
          <Select
            value={layer.blendMode}
            onValueChange={(v) => handleBlendMode(v as BlendMode)}
          >
            <SelectTrigger className="h-7 flex-1 text-caption capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLEND_MODE_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.modes.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="capitalize">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filter / Mask mode */}
        <div className="flex items-center gap-xs py-3xs">
          <Text variant="caption" color="secondary" as="span" className="w-14 shrink-0">
            Mode
          </Text>
          <div className="flex gap-3xs">
            <Button
              size="sm"
              variant={layer.filterMode === "filter" ? "secondary" : "ghost"}
              onClick={() => handleFilterMode("filter")}
              aria-pressed={layer.filterMode === "filter"}
            >
              Filter
            </Button>
            <Button
              size="sm"
              variant={layer.filterMode === "mask" ? "secondary" : "ghost"}
              onClick={() => handleFilterMode("mask")}
              aria-pressed={layer.filterMode === "mask"}
            >
              Mask
            </Button>
          </div>
        </div>
      </div>
      <Separator />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _ParamsSection — shader params grouped by param.group, each collapsible
// ─────────────────────────────────────────────────────────────────────────────

function _ParamsSection({ layer }: { layer: Layer }) {
  const updateParam  = useLayerStore((s) => s.updateParam);
  const pushHistory  = usePushHistory();

  // Build ordered group map — params without a group go into "Parameters"
  const groups = React.useMemo(() => {
    const map: Map<string, ShaderParam[]> = new Map();
    for (const p of layer.params) {
      const key = p.group ?? "Parameters";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [layer.params]);

  // Default params map for reset buttons — keyed by param.key
  const defaultParamsMap = React.useMemo(() => {
    if (!layer.shaderType) return {} as Record<string, ShaderParam>;
    return Object.fromEntries(
      getDefaultParams(layer.shaderType).map((p) => [p.key, p]),
    );
  }, [layer.shaderType]);

  // Expanded state per group — reset to all-open when the selected layer changes
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries([...groups.keys()].map((k) => [k, true])),
  );
  React.useEffect(() => {
    setExpanded(Object.fromEntries([...groups.keys()].map((k) => [k, true])));
  // Intentionally only resetting on layer identity change, not every param update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id]);

  function toggleGroup(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleChange(key: string, value: ShaderParam["value"]) {
    updateParam(layer.id, key, value);
  }

  function handleCommit(key: string, _value: ShaderParam["value"]) {
    const label = layer.params.find((p) => p.key === key)?.label ?? key;
    pushHistory(`Change ${label}`);
  }

  return (
    <div>
      {[...groups.entries()].map(([groupName, params]) => {
        const isOpen = expanded[groupName] ?? true;
        return (
          <div key={groupName}>
            {/* Collapsible group header */}
            <button
              type="button"
              className="flex w-full items-center gap-2xs px-xs py-3xs text-left hover:bg-[var(--color-bg-subtle)] transition-colors"
              onClick={() => toggleGroup(groupName)}
              aria-expanded={isOpen}
            >
              <span className="text-[var(--color-fg-disabled)]">
                {isOpen
                  ? <CaretDown size={10} weight="bold" />
                  : <CaretRight size={10} weight="bold" />}
              </span>
              <Text
                variant="caption"
                color="disabled"
                as="span"
                className="font-medium uppercase tracking-widest"
              >
                {groupName}
              </Text>
            </button>

            {/* Params */}
            {isOpen && (
              <div className="divide-y divide-[var(--color-border)] px-xs">
                {params.map((param) => (
                  <ParamControl
                    key={param.key}
                    param={param}
                    defaultParam={defaultParamsMap[param.key]}
                    onChange={handleChange}
                    onCommit={handleCommit}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Separator />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// _ActionsSection — Reset All / Delete
// ─────────────────────────────────────────────────────────────────────────────

function _ActionsSection({ layer }: { layer: Layer }) {
  const resetParams  = useLayerStore((s) => s.resetParams);
  const removeLayer  = useLayerStore((s) => s.removeLayer);
  const pushHistory  = usePushHistory();

  function handleReset() {
    // Push current state before resetting so it can be undone
    pushHistory("Reset parameters");
    resetParams(layer.id);
  }

  function handleDelete() {
    // Push current state before deleting so the deletion can be undone
    pushHistory("Delete layer");
    removeLayer(layer.id);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-xs px-xs py-xs">
      {layer.kind === "shader" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReset}
              className="gap-3xs"
            >
              <ArrowCounterClockwise size={13} />
              Reset all
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset all parameters to their defaults</TooltipContent>
        </Tooltip>
      )}
      <Button
        size="sm"
        variant="destructive"
        onClick={handleDelete}
        className={cn("gap-3xs", layer.kind !== "shader" && "ml-auto")}
      >
        <Trash size={13} />
        Delete layer
      </Button>
    </div>
  );
}
