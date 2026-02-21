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

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-xs">
      <Text variant="caption" color="tertiary" as="h2" className="font-medium uppercase tracking-widest">
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
      <Text variant="caption" color="secondary" as="span" className="w-32 shrink-0">{label}</Text>
      <div className="flex items-center gap-3xs flex-wrap">{children}</div>
    </div>
  );
}

// ── Preview Page ──────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const { toast } = useToast();
  const [sliderVal, setSliderVal] = React.useState([32]);
  const [switchOn, setSwitchOn] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const [visible, setVisible] = React.useState(true);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-[var(--color-bg)] px-md py-lg">
        {/* Header */}
        <div className="mx-auto max-w-[48rem]">
          <div className="mb-lg flex items-center justify-between">
            <div>
              <Text variant="headline">Component Preview</Text>
              <Text variant="body" color="secondary" className="mt-3xs">
                Phase 0.4 — Design system primitives
              </Text>
            </div>
            <ThemeToggle />
          </div>

          <div className="space-y-md">
            {/* ── Typography ── */}
            <Section title="Typography">
              <div className="space-y-xs">
                {/* Type scale — each variant on its own row */}
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
                  <div key={variant} className="flex items-baseline gap-xs border-b border-[var(--color-border)] pb-xs last:border-0 last:pb-0">
                    <div className="w-[5rem] shrink-0">
                      <Text variant="caption" color="tertiary" className="capitalize">{variant}</Text>
                      <Text variant="caption" color="disabled" className="tabular-nums">{spec}</Text>
                    </div>
                    <Text variant={variant} color="primary" as="span">{sample}</Text>
                  </div>
                ))}

                <Separator />

                {/* Color tokens */}
                <div className="space-y-3xs">
                  <Text variant="body" color="primary">primary — the default reading color</Text>
                  <Text variant="body" color="secondary">secondary — supporting labels and descriptions</Text>
                  <Text variant="body" color="tertiary">tertiary — placeholders, metadata, hints</Text>
                  <Text variant="body" color="disabled">disabled — inactive and unavailable states</Text>
                </div>

                <Separator />

                {/* On-color swatches */}
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
                    <Switch
                      checked={switchOn}
                      onCheckedChange={setSwitchOn}
                      id="sw1"
                    />
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
                    <Button size="icon-md" variant="ghost" aria-label="Visibility">
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
                  onClick={() => toast({ title: "Layer added", description: "Halftone layer was added to the stack." })}
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
                  onClick={() => toast({ title: "GPU memory low", description: "Consider removing some layers.", variant: "warning" })}
                >
                  Warning
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toast({ title: "Shader error", description: "Failed to compile halftone pass.", variant: "error" })}
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
                  <Text variant="body" color="secondary">
                    Shader parameters appear here.
                  </Text>
                </TabsContent>
                <TabsContent value="blend">
                  <Text variant="body" color="secondary">
                    Blend mode and opacity controls.
                  </Text>
                </TabsContent>
                <TabsContent value="info">
                  <Text variant="body" color="secondary">
                    Layer metadata and documentation.
                  </Text>
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
                      <Text variant="body" as="span">
                        Layer {i + 1}
                      </Text>
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
