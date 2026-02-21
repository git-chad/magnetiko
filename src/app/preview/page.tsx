"use client";

import * as React from "react";
import {
  MagnifyingGlass,
  Sliders,
  Stack,
  Sparkle,
  Trash,
  DotsThree,
  Sun,
  Moon,
  Eye,
  EyeSlash,
  Plus,
} from "@phosphor-icons/react";

import {
  Badge,
  Button,
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
      <h2 className="text-caption font-medium uppercase tracking-widest text-[var(--color-fg-tertiary)]">
        {title}
      </h2>
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-md">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-md py-3xs">
      <span className="text-caption text-[var(--color-fg-secondary)] w-32 shrink-0">{label}</span>
      <div className="flex items-center gap-3xs flex-wrap">{children}</div>
    </div>
  );
}

// ── Preview Page ──────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const { toast } = useToast();
  const [dark, setDark] = React.useState(false);
  const [sliderVal, setSliderVal] = React.useState([32]);
  const [switchOn, setSwitchOn] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-[var(--color-bg)] px-md py-lg">
        {/* Header */}
        <div className="mx-auto max-w-3xl">
          <div className="mb-lg flex items-center justify-between">
            <div>
              <h1 className="text-headline font-bold text-[var(--color-fg)]">
                Component Preview
              </h1>
              <p className="mt-3xs text-body text-[var(--color-fg-secondary)]">
                Phase 0.4 — Design system primitives
              </p>
            </div>
            <div className="flex items-center gap-3xs">
              <span className="text-caption text-[var(--color-fg-tertiary)]">
                {dark ? "Dark" : "Light"}
              </span>
              <button
                onClick={() => setDark((d) => !d)}
                className="flex size-8 items-center justify-center rounded-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-hover-bg)] transition-colors duration-micro"
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-md">
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
              <div className="space-y-xs max-w-sm">
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
              <div className="max-w-xs">
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
              <div className="space-y-xs max-w-sm">
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
                    <label htmlFor="sw1" className="text-body text-[var(--color-fg)] cursor-pointer">
                      {switchOn ? "On" : "Off"}
                    </label>
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
                    <label htmlFor="cb1" className="text-body text-[var(--color-fg)] cursor-pointer">
                      {checked ? "Checked" : "Unchecked"}
                    </label>
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
                      <p className="text-body font-medium text-[var(--color-fg)]">Layer options</p>
                      <p className="text-caption text-[var(--color-fg-secondary)]">
                        Configure blend mode and opacity for this layer.
                      </p>
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
                  <p className="text-body text-[var(--color-fg-secondary)]">
                    Shader parameters appear here.
                  </p>
                </TabsContent>
                <TabsContent value="blend">
                  <p className="text-body text-[var(--color-fg-secondary)]">
                    Blend mode and opacity controls.
                  </p>
                </TabsContent>
                <TabsContent value="info">
                  <p className="text-body text-[var(--color-fg-secondary)]">
                    Layer metadata and documentation.
                  </p>
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
                      <span className="text-body text-[var(--color-fg)]">
                        Layer {i + 1}
                      </span>
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
                  <p className="text-body text-[var(--color-fg)]">Above separator</p>
                  <Separator />
                  <p className="text-body text-[var(--color-fg-secondary)]">Below separator</p>
                </div>
                <div className="flex h-8 items-center gap-xs">
                  <span className="text-body text-[var(--color-fg)]">Left</span>
                  <Separator orientation="vertical" />
                  <span className="text-body text-[var(--color-fg-secondary)]">Right</span>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
