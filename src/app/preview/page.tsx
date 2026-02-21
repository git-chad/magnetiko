"use client";

import * as React from "react";
import {
  MagnifyingGlass,
  Sliders,
  Stack,
  Sparkle,
  Trash,
  DotsThree,
  Eye,
  EyeSlash,
  Plus,
  ArrowCounterClockwise,
  ArrowClockwise,
  Info,
  UploadSimple,
  Image as ImageIcon,
  FilmStrip,
  ArrowLineLeft,
  ArrowLineRight,
} from "@phosphor-icons/react";

import {
  Badge,
  Button,
  Text,
  ThemeToggle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useToast,
} from "@/components/ui";

import { RendererPreview } from "@/components/editor/RendererPreview";
import { MediaTexturePreview } from "@/components/editor/MediaTexturePreview";
import { PipelinePreview } from "@/components/editor/PipelinePreview";
import { useLayerStore } from "@/store/layerStore";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useMediaStore } from "@/store/mediaStore";
import type { ShaderType, MediaAsset } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-xs">
      <Text
        variant="caption"
        color="tertiary"
        as="h2"
        className="font-medium uppercase tracking-widest"
      >
        {title}
      </Text>
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-md">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-md py-3xs">
      <Text variant="caption" color="secondary" as="span" className="w-32 shrink-0">
        {label}
      </Text>
      <div className="flex items-center gap-3xs flex-wrap">{children}</div>
    </div>
  );
}

/** Instruction callout shown at the top of each store demo */
function Instruction({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-xs flex items-start gap-xs rounded-xs border-l-2 border-accent bg-[var(--color-bg)] px-xs py-3xs">
      <Info size={13} weight="bold" className="mt-px shrink-0 text-accent" />
      <Text variant="caption" color="secondary">
        {children}
      </Text>
    </div>
  );
}

/** Compact monospace state readout */
function StateDisplay({ value }: { value: unknown }) {
  return (
    <div className="mt-xs overflow-auto rounded-xs border border-[var(--color-border)] bg-[var(--color-bg)] p-xs">
      <pre className="whitespace-pre-wrap break-all font-mono text-caption text-[var(--color-fg-secondary)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Store demos
// ─────────────────────────────────────────────────────────────────────────────

function LayerStoreDemo() {
  const { toast } = useToast();
  const layers = useLayerStore((s) => s.layers);
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const addLayer = useLayerStore((s) => s.addLayer);
  const removeLayer = useLayerStore((s) => s.removeLayer);
  const selectLayer = useLayerStore((s) => s.selectLayer);

  const shaderOptions: { type: ShaderType; label: string }[] = [
    { type: "halftone", label: "Halftone" },
    { type: "grain", label: "Grain" },
    { type: "bloom", label: "Bloom" },
    { type: "ascii", label: "ASCII" },
  ];

  function handleAdd(shaderType: ShaderType, label: string) {
    addLayer("shader", shaderType);
    toast({ title: `${label} layer added`, variant: "success" });
  }

  function handleRemove(id: string, name: string) {
    removeLayer(id);
    toast({ title: `"${name}" removed` });
  }

  return (
    <Section title="Store / Layer">
      <Instruction>
        Click a shader button to call{" "}
        <code className="font-mono">addLayer()</code>. Click a row to select it.
        Delete removes it and selects the nearest neighbor. Each action fires a toast.
      </Instruction>

      {/* Add buttons */}
      <div className="mb-xs flex flex-wrap gap-3xs">
        {shaderOptions.map(({ type, label }) => (
          <Button
            key={type}
            size="sm"
            variant="secondary"
            onClick={() => handleAdd(type, label)}
          >
            <Plus size={13} />
            {label}
          </Button>
        ))}
      </div>

      {/* Layer list */}
      {layers.length === 0 ? (
        <div className="flex h-16 items-center justify-center rounded-xs border border-dashed border-[var(--color-border)]">
          <Text variant="caption" color="disabled">
            No layers yet — add one above
          </Text>
        </div>
      ) : (
        <div className="space-y-3xs">
          {layers.map((layer) => (
            <div
              key={layer.id}
              onClick={() => selectLayer(layer.id)}
              className={[
                "flex cursor-pointer items-center justify-between rounded-xs border px-xs py-3xs transition-colors duration-micro",
                selectedLayerId === layer.id
                  ? "border-accent bg-accent/5"
                  : "border-[var(--color-border)] hover:bg-[var(--color-hover-bg)]",
              ].join(" ")}
            >
              <div className="flex items-center gap-xs">
                <Text variant="body" as="span">
                  {layer.name}
                </Text>
                <Badge variant="secondary">{layer.shaderType}</Badge>
                <Text variant="caption" color="tertiary" as="span">
                  {layer.params.length} params
                </Text>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete layer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(layer.id, layer.name);
                }}
              >
                <Trash size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <StateDisplay
        value={{
          layerCount: layers.length,
          selectedLayerId,
          layers: layers.map((l) => ({
            id: l.id.slice(0, 8) + "…",
            name: l.name,
            shaderType: l.shaderType,
            paramCount: l.params.length,
          })),
        }}
      />
    </Section>
  );
}

function EditorStoreDemo() {
  const { toast } = useToast();
  const zoom = useEditorStore((s) => s.zoom);
  const panOffset = useEditorStore((s) => s.panOffset);
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen);
  const setZoom = useEditorStore((s) => s.setZoom);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const resetView = useEditorStore((s) => s.resetView);

  function handleReset() {
    resetView();
    toast({ title: "View reset", description: "Zoom → 1×, pan → (0, 0)" });
  }

  return (
    <Section title="Store / Editor">
      <Instruction>
        Drag the zoom slider to call <code className="font-mono">setZoom()</code>.
        Toggle the sidebar buttons to open/close each panel. Hit Reset to call{" "}
        <code className="font-mono">resetView()</code>. State updates live below.
      </Instruction>

      <div className="space-y-xs">
        {/* Zoom */}
        <Row label="Zoom">
          <Slider
            className="w-48"
            min={0.1}
            max={5}
            step={0.1}
            value={[zoom]}
            onValueChange={([v]) => setZoom(v)}
            showValue
          />
        </Row>

        <Separator />

        {/* Sidebar toggles */}
        <Row label="Sidebars">
          <Button
            size="sm"
            variant={sidebarOpen.left ? "primary" : "secondary"}
            onClick={() => {
              toggleSidebar("left");
              toast({
                title: `Left sidebar ${sidebarOpen.left ? "closed" : "opened"}`,
              });
            }}
          >
            <ArrowLineLeft size={14} />
            Left {sidebarOpen.left ? "open" : "closed"}
          </Button>
          <Button
            size="sm"
            variant={sidebarOpen.right ? "primary" : "secondary"}
            onClick={() => {
              toggleSidebar("right");
              toast({
                title: `Right sidebar ${sidebarOpen.right ? "closed" : "opened"}`,
              });
            }}
          >
            Right {sidebarOpen.right ? "open" : "closed"}
            <ArrowLineRight size={14} />
          </Button>
        </Row>

        <Separator />

        {/* Reset */}
        <Row label="View">
          <Button size="sm" variant="secondary" onClick={handleReset}>
            Reset view
          </Button>
        </Row>
      </div>

      <StateDisplay value={{ zoom, panOffset, sidebarOpen }} />
    </Section>
  );
}

function HistoryStoreDemo() {
  const { toast } = useToast();
  const layers = useLayerStore((s) => s.layers);
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const past = useHistoryStore((s) => s.past);
  const future = useHistoryStore((s) => s.future);
  const pushState = useHistoryStore((s) => s.pushState);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  const snapshotCountRef = React.useRef(0);

  function handlePush() {
    snapshotCountRef.current += 1;
    const label = `Snapshot ${snapshotCountRef.current}`;
    pushState({ layers, selectedLayerId, label });
    toast({ title: `Pushed "${label}"`, description: `Stack: ${past.length + 1} past, 0 future` });
  }

  function handleUndo() {
    const entry = undo();
    if (entry) {
      toast({ title: `Undid "${entry.label}"`, variant: "info" as const });
    } else {
      toast({ title: "Nothing to undo", variant: "warning" });
    }
  }

  function handleRedo() {
    const entry = redo();
    if (entry) {
      toast({ title: `Redid "${entry.label}"`, variant: "info" as const });
    } else {
      toast({ title: "Nothing to redo", variant: "warning" });
    }
  }

  function handleClear() {
    clearHistory();
    snapshotCountRef.current = 0;
    toast({ title: "History cleared" });
  }

  return (
    <Section title="Store / History">
      <Instruction>
        Push snapshots of the current layer state (from the Layer store above).
        Undo/Redo moves through the stack — Undo returns the previous entry.
        In the real editor, the returned snapshot is applied back to{" "}
        <code className="font-mono">layerStore</code>. Max depth: 50.
      </Instruction>

      <div className="flex flex-wrap gap-3xs">
        <Button size="sm" variant="primary" onClick={handlePush}>
          Push snapshot
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleUndo}
          disabled={past.length === 0}
        >
          <ArrowCounterClockwise size={14} />
          Undo
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRedo}
          disabled={future.length === 0}
        >
          <ArrowClockwise size={14} />
          Redo
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear}>
          Clear
        </Button>
      </div>

      <StateDisplay
        value={{
          past: past.map((e) => ({
            label: e.label,
            layers: e.layers.length,
            at: new Date(e.timestamp).toLocaleTimeString(),
          })),
          future: future.map((e) => ({
            label: e.label,
            layers: e.layers.length,
          })),
          canUndo: past.length > 0,
          canRedo: future.length > 0,
        }}
      />
    </Section>
  );
}

function MediaStoreDemo() {
  const { toast } = useToast();
  const assets = useMediaStore((s) => s.assets);
  const loadAsset = useMediaStore((s) => s.loadAsset);
  const removeAsset = useMediaStore((s) => s.removeAsset);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";
    try {
      const asset = await loadAsset(file);
      toast({
        title: `"${asset.name}" loaded`,
        description: `${asset.width} × ${asset.height}${asset.duration ? ` · ${asset.duration.toFixed(1)}s` : ""}`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Failed to load file",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    }
  }

  function handleRemove(asset: MediaAsset) {
    removeAsset(asset.id);
    toast({ title: `"${asset.name}" removed` });
  }

  return (
    <Section title="Store / Media">
      <Instruction>
        Upload a PNG, JPG, WebP, MP4, or WebM (max 50 MB). The store creates an
        object URL and extracts dimensions (and duration for video). Invalid files
        trigger an error toast. Click Remove to revoke the URL and free memory.
      </Instruction>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
        className="hidden"
        onChange={handleFile}
      />

      <Button
        size="sm"
        variant="secondary"
        onClick={() => fileInputRef.current?.click()}
        className="mb-xs"
      >
        <UploadSimple size={14} />
        Upload file
      </Button>

      {/* Asset list */}
      {assets.length === 0 ? (
        <div className="flex h-16 items-center justify-center rounded-xs border border-dashed border-[var(--color-border)]">
          <Text variant="caption" color="disabled">
            No assets yet — upload one above
          </Text>
        </div>
      ) : (
        <div className="space-y-3xs">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between rounded-xs border border-[var(--color-border)] px-xs py-3xs"
            >
              <div className="flex items-center gap-xs">
                {asset.type === "image" ? (
                  <ImageIcon size={15} className="text-[var(--color-fg-secondary)]" />
                ) : (
                  <FilmStrip size={15} className="text-[var(--color-fg-secondary)]" />
                )}
                <div>
                  <Text variant="body" as="span">
                    {asset.name}
                  </Text>
                  <Text variant="caption" color="tertiary" as="span" className="ml-xs">
                    {asset.width} × {asset.height}
                    {asset.duration ? ` · ${asset.duration.toFixed(1)}s` : ""}
                  </Text>
                </div>
                <Badge variant={asset.type === "image" ? "accent" : "secondary"}>
                  {asset.type}
                </Badge>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Remove asset"
                onClick={() => handleRemove(asset)}
              >
                <Trash size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <StateDisplay
        value={{
          assetCount: assets.length,
          assets: assets.map((a) => ({
            id: a.id.slice(0, 8) + "…",
            name: a.name,
            type: a.type,
            width: a.width,
            height: a.height,
            ...(a.duration ? { duration: `${a.duration.toFixed(1)}s` } : {}),
          })),
        }}
      />
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview page
// ─────────────────────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const { toast } = useToast();
  const [sliderVal, setSliderVal] = React.useState([32]);
  const [switchOn, setSwitchOn] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const [visible, setVisible] = React.useState(true);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-[var(--color-bg)] px-md py-lg">
        <div className="mx-auto max-w-[48rem]">

          {/* ── Header ── */}
          <div className="mb-lg flex items-center justify-between">
            <div>
              <Text variant="headline">Component Preview</Text>
              <Text variant="body" color="secondary" className="mt-3xs">
                Phase 0–1 — Design system + Zustand stores
              </Text>
            </div>
            <ThemeToggle />
          </div>

          <div className="space-y-md">

            {/* ══════════════════════════════════════════════════
                Renderer preview (Phase 2.1)
            ══════════════════════════════════════════════════ */}

            <div className="space-y-3xs">
              <Text variant="caption" color="disabled" className="font-medium uppercase tracking-widest">
                Phase 2.1 — WebGPU renderer
              </Text>
              <Separator />
            </div>

            <Section title="Renderer / WebGPU Canvas">
              <div className="space-y-xs">
                <div className="mb-xs flex items-start gap-xs rounded-xs border-l-2 border-accent bg-[var(--color-bg)] px-xs py-3xs">
                  <Info size={13} weight="bold" className="mt-px shrink-0 text-accent" />
                  <Text variant="caption" color="secondary">
                    Live WebGPU canvas — animated TSL plasma shader running on the GPU.
                    Three waves of <code className="font-mono">sin()</code> are summed and
                    mapped across the brand palette (dark → accent → neutral).
                    FPS badge confirms the render loop is active. Open DevTools console
                    to see the{" "}
                    <code className="font-mono">[Magnetiko] WebGPU initialized ✓</code> log.
                  </Text>
                </div>
                <RendererPreview />
              </div>
            </Section>

            {/* ── Phase 2.2 ── */}
            <Section title="Renderer / Media Texture">
              <div className="space-y-xs">
                <div className="mb-xs flex items-start gap-xs rounded-xs border-l-2 border-accent bg-[var(--color-bg)] px-xs py-3xs">
                  <Info size={13} weight="bold" className="mt-px shrink-0 text-accent" />
                  <Text variant="caption" color="secondary">
                    Upload any PNG, JPG, WebP, MP4, or WebM (max 50 MB) to display it on
                    the WebGPU canvas. The{" "}
                    <code className="font-mono">FullscreenQuad</code> applies aspect-ratio
                    correction via two{" "}
                    <code className="font-mono">uniform()</code> GPU nodes — no shader
                    recompile on window resize. Toggle{" "}
                    <strong>Cover</strong> (fills canvas, crops) ↔{" "}
                    <strong>Contain</strong> (fits whole image, dark bars) to compare fit
                    modes. Video plays automatically, looped and muted.
                  </Text>
                </div>
                <MediaTexturePreview />
              </div>
            </Section>

            {/* ── Phase 2.3 / 2.4 ── */}
            <Section title="Renderer / Pipeline Manager">
              <div className="space-y-xs">
                <div className="mb-xs flex items-start gap-xs rounded-xs border-l-2 border-accent bg-[var(--color-bg)] px-xs py-3xs">
                  <Info size={13} weight="bold" className="mt-px shrink-0 text-accent" />
                  <Text variant="caption" color="secondary">
                    The <code className="font-mono">PipelineManager</code> owns two ping-pong{" "}
                    <code className="font-mono">WebGLRenderTarget</code>s and an ordered list of{" "}
                    <code className="font-mono">PassNode</code>s. With 0 passes, media renders
                    directly to screen. Each added pass reads from one RT and writes to the
                    other — the blit step outputs the final RT to screen. Upload media and add
                    passthrough passes to verify the chain produces identical output.
                  </Text>
                </div>
                <PipelinePreview />
              </div>
            </Section>

            {/* ══════════════════════════════════════════════════
                Store demos (Phase 1)
            ══════════════════════════════════════════════════ */}

            <div className="space-y-3xs">
              <Text variant="caption" color="disabled" className="font-medium uppercase tracking-widest">
                Phase 1 — Zustand stores
              </Text>
              <Separator />
            </div>

            <LayerStoreDemo />
            <EditorStoreDemo />
            <HistoryStoreDemo />
            <MediaStoreDemo />

            {/* ══════════════════════════════════════════════════
                Component demos (Phase 0)
            ══════════════════════════════════════════════════ */}

            <div className="space-y-3xs pt-xs">
              <Text variant="caption" color="disabled" className="font-medium uppercase tracking-widest">
                Phase 0 — UI components
              </Text>
              <Separator />
            </div>

            {/* ── Typography ── */}
            <Section title="Typography">
              <div className="space-y-xs">
                {(
                  [
                    { variant: "display",  spec: "29px / 700 / −0.015em", sample: "Shader Studio" },
                    { variant: "headline", spec: "24px / 700 / −0.01em",  sample: "Layer Properties" },
                    { variant: "title",    spec: "20px / 600 / −0.005em", sample: "Add a shader layer" },
                    { variant: "subhead",  spec: "17px / 500 / 0em",      sample: "Halftone — dot grid effect" },
                    { variant: "body",     spec: "14px / 400 / 0em",      sample: "The filter samples the input texture, pixelates it to match the dot grid, then sizes each dot proportional to luminance." },
                    { variant: "caption",  spec: "12px / 400 / +0.01em",  sample: "Layer 3 · Visible · Filter mode" },
                  ] as const
                ).map(({ variant, spec, sample }) => (
                  <div
                    key={variant}
                    className="flex items-baseline gap-xs border-b border-[var(--color-border)] pb-xs last:border-0 last:pb-0"
                  >
                    <div className="w-[5rem] shrink-0">
                      <Text variant="caption" color="tertiary" className="capitalize">
                        {variant}
                      </Text>
                      <Text variant="caption" color="disabled" className="tabular-nums">
                        {spec}
                      </Text>
                    </div>
                    <Text variant={variant} color="primary" as="span">
                      {sample}
                    </Text>
                  </div>
                ))}

                <Separator />

                <div className="space-y-3xs">
                  <Text variant="body" color="primary">primary — the default reading color</Text>
                  <Text variant="body" color="secondary">secondary — supporting labels and descriptions</Text>
                  <Text variant="body" color="tertiary">tertiary — placeholders, metadata, hints</Text>
                  <Text variant="body" color="disabled">disabled — inactive and unavailable states</Text>
                </div>

                <Separator />

                <div className="flex gap-3xs">
                  <span className="rounded-sm bg-primary px-xs py-3xs">
                    <Text variant="caption" color="onPrimary">onPrimary</Text>
                  </span>
                  <span className="rounded-sm bg-accent px-xs py-3xs">
                    <Text variant="caption" color="onAccent">onAccent</Text>
                  </span>
                </div>
              </div>
            </Section>

            {/* ── Badges ── */}
            <Section title="Badge">
              <div className="flex flex-wrap gap-3xs">
                <Badge>Default</Badge>
                <Badge variant="accent">Accent</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="error">Error</Badge>
                <Badge variant="info">Info</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </Section>

            {/* ── Buttons ── */}
            <Section title="Button">
              <div className="space-y-xs">
                <Row label="Variants">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                </Row>
                <Separator />
                <Row label="Sizes">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </Row>
                <Separator />
                <Row label="Icons">
                  <Button size="icon-sm" variant="ghost" aria-label="Add">
                    <Plus size={14} />
                  </Button>
                  <Button size="icon-md" variant="secondary" aria-label="Settings">
                    <Sliders size={15} />
                  </Button>
                  <Button size="icon-lg" variant="primary" aria-label="Layers">
                    <Stack size={18} />
                  </Button>
                </Row>
                <Separator />
                <Row label="States">
                  <Button disabled>Disabled</Button>
                  <Button variant="secondary" disabled>Disabled</Button>
                </Row>
              </div>
            </Section>

            {/* ── Input ── */}
            <Section title="Input">
              <div className="space-y-xs max-w-[20rem]">
                <Input placeholder="Default input" />
                <Input
                  placeholder="With leading icon"
                  leadingIcon={<MagnifyingGlass size={14} />}
                />
                <Input
                  placeholder="With trailing icon"
                  trailingIcon={<Sparkle size={14} />}
                />
                <Input placeholder="Error state" error />
                <Input placeholder="Disabled" disabled />
              </div>
            </Section>

            {/* ── Select ── */}
            <Section title="Select">
              <div className="max-w-[16rem]">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a shader…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="halftone">Halftone</SelectItem>
                    <SelectItem value="pixelation">Pixelation</SelectItem>
                    <SelectItem value="ascii">ASCII</SelectItem>
                    <SelectItem value="dithering">Dithering</SelectItem>
                    <SelectItem value="bloom">Bloom</SelectItem>
                    <SelectItem value="grain">Grain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Section>

            {/* ── Slider ── */}
            <Section title="Slider">
              <div className="space-y-xs max-w-[20rem]">
                <Row label="Default">
                  <Slider
                    className="w-48"
                    min={0}
                    max={100}
                    step={1}
                    value={sliderVal}
                    onValueChange={setSliderVal}
                    showValue
                  />
                </Row>
                <Row label="Disabled">
                  <Slider className="w-48" defaultValue={[50]} disabled showValue />
                </Row>
              </div>
            </Section>

            {/* ── Switch + Checkbox ── */}
            <Section title="Switch & Checkbox">
              <div className="space-y-xs">
                <Row label="Switch">
                  <div className="flex items-center gap-xs">
                    <Switch checked={switchOn} onCheckedChange={setSwitchOn} id="sw1" />
                    <Text as="label" variant="body" className="cursor-pointer" {...{ htmlFor: "sw1" }}>
                      {switchOn ? "On" : "Off"}
                    </Text>
                  </div>
                  <Switch disabled />
                  <Switch disabled checked />
                </Row>
                <Separator />
                <Row label="Checkbox">
                  <div className="flex items-center gap-xs">
                    <Checkbox
                      id="cb1"
                      checked={checked}
                      onCheckedChange={(v) => setChecked(Boolean(v))}
                    />
                    <Text as="label" variant="body" className="cursor-pointer" {...{ htmlFor: "cb1" }}>
                      {checked ? "Checked" : "Unchecked"}
                    </Text>
                  </div>
                  <Checkbox disabled />
                  <Checkbox disabled checked />
                </Row>
              </div>
            </Section>

            {/* ── Tooltip ── */}
            <Section title="Tooltip">
              <Row label="Default">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" size="sm">Hover me</Button>
                  </TooltipTrigger>
                  <TooltipContent>Shader preview</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-md"
                      variant="ghost"
                      aria-label="Visibility"
                      onClick={() => setVisible((v) => !v)}
                    >
                      {visible ? <Eye size={15} /> : <EyeSlash size={15} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle visibility</TooltipContent>
                </Tooltip>
              </Row>
            </Section>

            {/* ── Dialog ── */}
            <Section title="Dialog">
              <Row label="Modal">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Open Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete layer?</DialogTitle>
                      <DialogDescription>
                        This will permanently remove the Halftone layer and cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="ghost">Cancel</Button>
                      <Button variant="destructive">Delete</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </Row>
            </Section>

            {/* ── Popover ── */}
            <Section title="Popover">
              <Row label="Default">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" size="sm">Open Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <div className="space-y-3xs">
                      <Text variant="body" className="font-medium">Layer options</Text>
                      <Text variant="caption" color="secondary">
                        Configure blend mode and opacity for this layer.
                      </Text>
                    </div>
                  </PopoverContent>
                </Popover>
              </Row>
            </Section>

            {/* ── Dropdown Menu ── */}
            <Section title="Dropdown Menu">
              <Row label="Context menu">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon-md" aria-label="More options">
                      <DotsThree size={16} weight="bold" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Layer actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Stack size={14} />
                      Duplicate
                      <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuCheckboxItem checked={visible} onCheckedChange={setVisible}>
                      Toggle visibility
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive>
                      <Trash size={14} />
                      Delete layer
                      <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Row>
            </Section>

            {/* ── Toast ── */}
            <Section title="Toast">
              <Row label="Variants">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    toast({ title: "Layer added", description: "Halftone layer was added to the stack." })
                  }
                >
                  Default
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toast({ title: "Export complete", variant: "success" })}
                >
                  Success
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    toast({
                      title: "GPU memory low",
                      description: "Consider removing some layers.",
                      variant: "warning",
                    })
                  }
                >
                  Warning
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    toast({
                      title: "Shader error",
                      description: "Failed to compile halftone pass.",
                      variant: "error",
                    })
                  }
                >
                  Error
                </Button>
              </Row>
            </Section>

            {/* ── Tabs ── */}
            <Section title="Tabs">
              <Tabs defaultValue="params">
                <TabsList>
                  <TabsTrigger value="params">Parameters</TabsTrigger>
                  <TabsTrigger value="blend">Blend</TabsTrigger>
                  <TabsTrigger value="info">Info</TabsTrigger>
                </TabsList>
                <TabsContent value="params">
                  <Text variant="body" color="secondary">Shader parameters appear here.</Text>
                </TabsContent>
                <TabsContent value="blend">
                  <Text variant="body" color="secondary">Blend mode and opacity controls.</Text>
                </TabsContent>
                <TabsContent value="info">
                  <Text variant="body" color="secondary">Layer metadata and documentation.</Text>
                </TabsContent>
              </Tabs>
            </Section>

            {/* ── Scroll Area ── */}
            <Section title="Scroll Area">
              <ScrollArea className="h-40 rounded-sm border border-[var(--color-border)]">
                <div className="p-xs space-y-3xs">
                  {Array.from({ length: 16 }, (_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xs px-xs py-3xs hover:bg-[var(--color-hover-bg)]"
                    >
                      <Text variant="body" as="span">Layer {i + 1}</Text>
                      <Badge variant={i % 3 === 0 ? "accent" : i % 3 === 1 ? "secondary" : "outline"}>
                        {["Halftone", "Grain", "Bloom"][i % 3]}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Section>

            {/* ── Separator ── */}
            <Section title="Separator">
              <div className="space-y-xs">
                <div className="space-y-3xs">
                  <Text variant="body">Above separator</Text>
                  <Separator />
                  <Text variant="body" color="secondary">Below separator</Text>
                </div>
                <div className="flex h-8 items-center gap-xs">
                  <Text variant="body" as="span">Left</Text>
                  <Separator orientation="vertical" />
                  <Text variant="body" color="secondary" as="span">Right</Text>
                </div>
              </div>
            </Section>

          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
