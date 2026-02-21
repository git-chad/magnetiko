# Shader Studio — Project Plan

> **No-code tool to create and edit shaders powered by WebGPU (Three.js TSL)**
> Layers act as **filters** by default (not masks). Each shader layer processes the underlying media through pixelation-matched sampling, producing rich microtextures rather than simple overlays.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Design System Foundation](#phase-0--design-system-foundation)
3. [Core Data Model & State](#phase-1--core-data-model--state-management)
4. [Three.js WebGPU Renderer](#phase-2--threejs-webgpu-renderer--pipeline)
5. [Layer System UI](#phase-3--layer-system-ui)
6. [Shader Library — Core Effects](#phase-4--shader-library--core-effects)
7. [Shader Controls & Sidebar](#phase-5--shader-controls--sidebar)
8. [Media Input Pipeline](#phase-6--media-input-pipeline)
9. [Interactivity Layer](#phase-7--interactivity-layer)
10. [Polish, Performance & Accessibility](#phase-8--polish-performance--accessibility)
11. [Export & Sharing](#phase-9--export--sharing)
12. [Stretch Goals](#phase-10--stretch-goals)

---

## Architecture Overview

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout + font injection + theme provider
│   ├── page.tsx                  # Main editor page
│   └── globals.css               # Tailwind directives + CSS custom properties (design tokens)
├── components/
│   ├── ui/                       # Radix-based primitives (Button, Slider, Select, Switch, etc.)
│   ├── editor/
│   │   ├── Canvas.tsx            # Three.js WebGPU mount point
│   │   ├── Toolbar.tsx           # Top bar: file ops, undo/redo, zoom, export
│   │   ├── LayerPanel.tsx        # Left sidebar: layer stack, drag-reorder, visibility
│   │   ├── PropertiesPanel.tsx   # Right sidebar: selected layer controls
│   │   ├── LayerItem.tsx         # Single layer row in the stack
│   │   ├── PresetBrowser.tsx     # Modal/drawer: browse starter shaders & media
│   │   └── Viewport.tsx          # Wraps canvas + overlays (zoom controls, fps)
│   └── shared/
│       ├── ColorPicker.tsx
│       ├── ParamControl.tsx      # Renders the right control for a ShaderParam type
│       └── Toast.tsx
├── lib/
│   ├── renderer/
│   │   ├── WebGPURenderer.ts     # Three.js WebGPU setup, render loop, resize
│   │   ├── PipelineManager.ts    # Manages the filter chain (layer ordering → shader passes)
│   │   ├── PassNode.ts           # Individual shader pass using TSL
│   │   └── MediaTexture.ts       # Handles image/video → Three.js texture
│   ├── shaders/
│   │   ├── index.ts              # Registry: shaderType → factory function
│   │   ├── pixelation.tsl.ts
│   │   ├── halftone.tsl.ts
│   │   ├── ascii.tsl.ts
│   │   ├── dithering.tsl.ts
│   │   ├── bloom.tsl.ts
│   │   ├── flutedGlass.tsl.ts
│   │   ├── progressiveBlur.tsl.ts
│   │   ├── grain.tsl.ts
│   │   └── interactivity.tsl.ts
│   └── utils/
│       ├── defaultParams.ts      # Default ShaderParam[] per ShaderType
│       ├── blendModes.ts         # TSL blend mode implementations
│       └── colorUtils.ts
├── store/
│   ├── layerStore.ts             # Zustand: layers, selection, ordering
│   ├── editorStore.ts            # Zustand: viewport state, zoom, tool mode
│   ├── historyStore.ts           # Zustand: undo/redo stack
│   └── mediaStore.ts             # Zustand: loaded media assets
├── hooks/
│   ├── useWebGPU.ts              # Init renderer, handle fallback
│   ├── useRenderLoop.ts          # RAF loop tied to layer state
│   ├── useMouseInteraction.ts    # Normalized pointer data for interactivity layers
│   └── useResizeObserver.ts
├── types/
│   └── index.ts                  # All shared TypeScript types
├── styles/
│   └── tokens.ts                 # Design system tokens as JS constants
└── config/
    └── presets.ts                # Starter shader presets & demo media URLs
```

### Key Tech Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | Next.js (App Router) | SSR shell, API routes for future backend, easy deployment |
| 3D / GPU | Three.js WebGPURenderer + TSL | First-class WebGPU, node-based shader language, no raw WGSL needed |
| State | Zustand | Minimal boilerplate, middleware for undo/redo, works outside React |
| Styling | Tailwind + CSS custom properties | Design tokens as CSS vars, utility classes for layout |
| UI primitives | Radix (headless) | Accessible, unstyled, composable |
| Icons | Phosphor Icons (`@phosphor-icons/react`) | 6 weight variants, MIT, matches design spec |
| Animation | GSAP | Timeline control for UI transitions, ScrollTrigger if needed |
| Drag & drop | `@dnd-kit/core` | Layer reordering in the panel |

### The Filter Philosophy (Critical)

Every shader layer operates as a **filter pass** by default:

1. The underlying media (or the output of all layers below) is rendered to an offscreen texture.
2. The shader layer **samples** this texture, processes it (e.g., pixelates, dithers, halftones), and outputs the result.
3. The next layer above receives this processed output as *its* input texture.

This creates a **sequential filter chain**, not a compositing stack of independent layers. The order matters: a halftone on top of a bloom will look fundamentally different from bloom on top of halftone.

**Mask mode** (opt-in per layer): Instead of processing the underlying texture, the shader generates an independent output that is composited via blend modes. This is the traditional approach and should be available as a toggle.

---

## Phase 0 — Design System Foundation

**Goal:** Establish all design tokens, Tailwind config, base components, and theming before any feature work. Everything built afterward references these tokens.

### 0.1 Design Tokens File (`src/styles/tokens.ts`)

- [x] Export all color tokens as JS constants (primary shades, secondary, accent, surfaces, semantic, interactive states)
- [x] Export spacing scale: `4xs` through `4xl` mapped to px values
- [x] Export typography scale objects: caption, body, subhead, title, headline, display — each with fontFamily, fontSize, fontWeight, lineHeight, letterSpacing
- [x] Export border radius scale: xs, sm, md, lg, xl, full
- [x] Export elevation map: low, mid, high (box-shadow strings)
- [x] Export motion tokens: duration (micro, base, medium, large) + easing curves (enter, exit, move, micro) as CSS timing strings
- [x] Export border color tokens: base, divider, hover, focus (rgba strings)
- [x] Export overlay tokens: backdrop, uniform, blur, scrim gradient

**Done when:** File compiles, all values match the design system spec exactly, imported successfully in at least one component.

### 0.2 Tailwind Configuration (`globals.css` — Tailwind v4 `@theme`)

> Note: Project uses Tailwind v4. Configuration lives in `globals.css` via `@theme`, not a separate config file.

- [x] Extend `colors` with all primary, secondary, accent shades + semantic colors + surface colors
- [x] Extend `spacing` with the full spacing scale (3, 6, 9, 12, 18, 24, 36, 48, 72, 96, 144)
- [x] Extend `borderRadius` with xs, sm, md, lg, xl, full
- [x] Extend `boxShadow` with low, mid, high
- [x] Extend `fontFamily` with Inter stack (via `next/font/google` + CSS var)
- [x] Extend `fontSize` with the type scale (caption, body, subhead, title, headline, display) including lineHeight and letterSpacing
- [x] Extend `transitionDuration` and `transitionTimingFunction` with motion tokens
- [x] Configure dark mode: `class` strategy (`@custom-variant dark (&:is(.dark *))`)
- [x] Add CSS custom properties via `@layer base` in `globals.css` for both light and dark themes

**Done when:** `npx tailwind` resolves all custom classes. Light and dark mode tokens switch correctly via class toggle.

### 0.3 CSS Custom Properties (`globals.css`)

- [x] Define all color tokens as `--color-*` custom properties under `:root` (light) and `.dark` (dark)
- [x] Define `--shadow-*`, `--radius-*`, `--space-*` custom properties (via `@theme`)
- [x] Inter font loaded via `next/font/google` (Next.js-optimised; no raw @import needed)
- [x] Define `@keyframes` for: modal-enter, modal-exit, dropdown-enter, toast-enter, toast-exit, fade-in, slide-up
- [x] `@media (prefers-reduced-motion: reduce)` — disable all animations
- [x] Base resets: box-sizing border-box, smooth scroll, antialiased text

**Done when:** Browser devtools show all custom properties. Animations play. Reduced-motion disables them.

### 0.4 Base UI Components (Radix + Tailwind)

Build each as a thin wrapper around Radix primitives, styled with Tailwind using design tokens:

- [x] **Button** — variants: primary, secondary, ghost, destructive. Sizes: sm, md, lg. States: hover, active, disabled, focus. Icon-only variant.
- [x] **Input** — default, focus, error, disabled states. With optional leading/trailing icons.
- [x] **Select** — Radix Select with dropdown styling per spec (2px radius, mid shadow, 10px offset)
- [x] **Slider** — Radix Slider, accent track color, custom thumb. Displays value label.
- [x] **Switch** — Radix Switch, full radius, accent color when on.
- [x] **Checkbox** — Radix Checkbox, sm radius.
- [x] **Tooltip** — Radix Tooltip, 2px radius, dark bg, 60ms fade.
- [x] **Dialog/Modal** — Radix Dialog, backdrop blur, 12px radius, high shadow, scale+translateY enter animation.
- [x] **Popover** — Radix Popover, 2px radius, mid shadow, dropdown animation.
- [x] **DropdownMenu** — Radix DropdownMenu, same visual spec as Popover.
- [x] **Toast** — Radix Toast, fixed bottom-right, stack up to 3, auto-dismiss 5s, slide-up+fade enter.
- [x] **Tabs** — Radix Tabs for sidebar section switching.
- [x] **ScrollArea** — Radix ScrollArea for layer panel and properties panel.
- [x] **Separator** — styled `<hr>` with divider token.
- [x] **Badge** — full radius, caption size, for layer type indicators.

**Done when:** Each component renders correctly in both light and dark mode. All interactive states work. Focus indicators match spec. I confirm visually.

### 0.5 Theme Provider & Toggle

- [x] Create `ThemeProvider` component (manual class toggle, no next-themes dependency)
- [x] Light mode by default, dark mode supported
- [x] Persist preference (cookie-based for SSR compat, not localStorage)
- [x] Add `ThemeToggle` component (Moon/Sun icon button with Tooltip)
- [x] Layout reads cookie server-side, injects `dark` class on `<html>` before paint — no flash

**Done when:** Toggling theme switches all tokens. Page loads in correct mode. No flash of wrong theme.

### 0.6 Typography Components

- [x] Create `<Text>` component with `variant` prop: caption, body, subhead, title, headline, display
- [x] Each variant applies font-size + weight from type scale via Tailwind `text-*` tokens (line-height + letter-spacing baked in)
- [x] Support `as` prop for semantic HTML elements (defaults: span/p/p/h3/h2/h1 per variant)
- [x] Support `color` prop: primary, secondary, tertiary, disabled, onPrimary, onSecondary, onAccent

**Done when:** All 6 variants render with correct metrics. Line heights snap to 8px grid.

---

## Phase 1 — Core Data Model & State Management

**Goal:** Fully typed layer model in Zustand with all CRUD operations, before any rendering is connected. This is the backbone everything else plugs into.

### 1.1 Define Types (`src/types/index.ts`)

- [ ] Define `BlendMode` union type (16 modes: normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity)
- [ ] Define `LayerKind` union: `'shader' | 'image' | 'video'`
- [ ] Define `FilterMode` union: `'filter' | 'mask'` — determines if layer processes input texture or composites independently
- [ ] Define `ShaderType` union: `'pixelation' | 'halftone' | 'ascii' | 'dithering' | 'bloom' | 'fluted-glass' | 'progressive-blur' | 'grain' | 'interactivity'`
- [ ] Define `ShaderParam` interface:
  ```ts
  interface ShaderParam {
    key: string;
    label: string;
    type: 'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'enum' | 'bool';
    value: number | number[] | string | boolean;
    min?: number;
    max?: number;
    step?: number;
    options?: { label: string; value: string }[];
    group?: string;       // for grouping controls in sidebar
    description?: string; // tooltip text
  }
  ```
- [ ] Define `Layer` interface:
  ```ts
  interface Layer {
    id: string;
    name: string;
    kind: LayerKind;
    shaderType?: ShaderType;
    filterMode: FilterMode;      // 'filter' by default
    visible: boolean;
    solo: boolean;               // solo this layer (hide all others temporarily)
    opacity: number;             // 0–1
    blendMode: BlendMode;
    params: ShaderParam[];
    locked: boolean;
    expanded: boolean;           // UI: expanded in layer panel
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    thumbnail?: string;          // base64 preview for layer panel
  }
  ```
- [ ] Define `EditorState` interface (viewport zoom, pan, selected tool, canvas dimensions)
- [ ] Define `HistoryEntry` interface (snapshot of layers array + metadata)

**Done when:** TypeScript compiles with no errors. Types are importable from `@/types`.

### 1.2 Default Params Registry (`src/lib/utils/defaultParams.ts`)

- [ ] Create `getDefaultParams(shaderType: ShaderType): ShaderParam[]` function
- [ ] **Pixelation** defaults: cellSize (float, 4–64, default 8), shape (enum: square/circle/diamond), preserveAspect (bool, true)
- [ ] **Halftone** defaults: dotSize (float, 1–20, default 4), gridSpacing (float, 4–32, default 8), shape (enum: circle/square/diamond/line), angle (float, 0–360, default 45), colorMode (enum: source/monochrome/duotone), duotoneLight (color, #F5F5F0), duotoneDark (color, #1d1d1c), contrast (float, 0–2, default 1), softness (float, 0–1, default 0.1)
- [ ] **ASCII** defaults: cellSize (float, 4–24, default 8), charset (enum: light/dense/blocks/hatching/binary/custom), customChars (string, for custom charset), colorMode (enum: source/monochrome/green-terminal), bgOpacity (float, 0–1, default 1), fontWeight (enum: thin/regular/bold), invert (bool, false)
- [ ] **Dithering** defaults: algorithm (enum: ordered-bayer/floyd-steinberg/atkinson/blue-noise), matrixSize (enum: 2x2/4x4/8x8, for ordered), colorMode (enum: source/monochrome/palette), palette (color[], for custom palette mode), levels (int, 2–16, default 2), spread (float, 0–2, default 1)
- [ ] **Bloom** defaults: threshold (float, 0–1, default 0.7), intensity (float, 0–3, default 1), radius (float, 0–20, default 5), softKnee (float, 0–1, default 0.5), blendWithSource (bool, true)
- [ ] **Fluted Glass** defaults: flutes (int, 2–100, default 20), orientation (enum: vertical/horizontal/radial), distortionStrength (float, 0–2, default 0.5), refractionIndex (float, 1–2, default 1.3), tint (color, transparent), blur (float, 0–5, default 0.5)
- [ ] **Progressive Blur** defaults: direction (enum: top-to-bottom/bottom-to-top/left-to-right/right-to-left/center-out/radial), startStrength (float, 0), endStrength (float, 0–20, default 8), falloff (enum: linear/ease-in/ease-out/ease-in-out), focusPoint (vec2, [0.5, 0.5]), focusSize (float, 0–1, default 0.3)
- [ ] **Grain** defaults: intensity (float, 0–1, default 0.15), size (float, 0.5–3, default 1), speed (float, 0–2, default 1, for animated grain), monochrome (bool, true), blendMode (enum: overlay/soft-light/add)
- [ ] **Interactivity** defaults: effect (enum: ripple/trail/repel/attract/glow), radius (float, 10–200, default 50), strength (float, 0–2, default 0.5), decay (float, 0–1, default 0.95), color (color, #64643a), trailLength (int, 5–50, default 20)

**Done when:** Every shader type returns a complete, typed array of ShaderParam. No missing defaults.

### 1.3 Layer Store (`src/store/layerStore.ts`)

- [ ] Create Zustand store with `immer` middleware for immutable updates
- [ ] **State shape:**
  ```ts
  {
    layers: Layer[];
    selectedLayerId: string | null;
    hoveredLayerId: string | null;
  }
  ```
- [ ] **Actions:**
  - [ ] `addLayer(kind, shaderType?, insertIndex?)` — creates layer with UUID, default name ("Halftone 1"), default params, inserts at index or top
  - [ ] `removeLayer(id)` — removes, selects nearest neighbor
  - [ ] `duplicateLayer(id)` — deep clone with new ID, " copy" suffix
  - [ ] `reorderLayers(fromIndex, toIndex)` — move layer in stack
  - [ ] `selectLayer(id | null)`
  - [ ] `setLayerVisibility(id, visible)`
  - [ ] `toggleLayerSolo(id)`
  - [ ] `setLayerOpacity(id, opacity)`
  - [ ] `setLayerBlendMode(id, blendMode)`
  - [ ] `setLayerFilterMode(id, filterMode)`
  - [ ] `setLayerLocked(id, locked)`
  - [ ] `renameLayer(id, name)`
  - [ ] `updateParam(layerId, paramKey, value)` — update a single shader param
  - [ ] `resetParams(layerId)` — reset to defaults for that shader type
  - [ ] `setLayerMedia(id, url, type)`
- [ ] **Derived/computed selectors:**
  - [ ] `getSelectedLayer()` — returns selected Layer or null
  - [ ] `getVisibleLayers()` — respects solo mode: if any layer is solo'd, return only solo'd layers
  - [ ] `getLayersByOrder()` — bottom to top (render order)

**Done when:** All actions work in isolation (unit test or manual console test). Adding a halftone layer produces a Layer object with all correct default params. Reorder works. No TypeScript errors.

### 1.4 Editor Store (`src/store/editorStore.ts`)

- [ ] **State:**
  - [ ] `zoom: number` (0.1–5, default 1)
  - [ ] `panOffset: { x: number, y: number }`
  - [ ] `canvasSize: { width: number, height: number }`
  - [ ] `showGrid: boolean`
  - [ ] `theme: 'light' | 'dark'`
  - [ ] `sidebarOpen: { left: boolean, right: boolean }`
  - [ ] `fps: number` (updated by render loop)
- [ ] **Actions:** setZoom, setPan, resetView, toggleGrid, toggleTheme, toggleSidebar, setFps

**Done when:** Store creates and all getters/setters work without errors.

### 1.5 History Store (`src/store/historyStore.ts`)

- [ ] Implement undo/redo as a middleware or standalone store that snapshots `layerStore` state
- [ ] Max history depth: 50 entries
- [ ] **Actions:** `pushState()`, `undo()`, `redo()`, `canUndo()`, `canRedo()`, `clearHistory()`
- [ ] Subscribe to layerStore — push snapshot on every meaningful action (debounced for continuous slider changes: 300ms)
- [ ] Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z (redo)

**Done when:** Can add layers, undo to remove them, redo to restore. Slider drags produce one undo entry, not hundreds.

### 1.6 Media Store (`src/store/mediaStore.ts`)

- [ ] **State:** `assets: MediaAsset[]` — loaded images/videos with metadata
- [ ] **Actions:** `loadAsset(file: File): Promise<MediaAsset>`, `removeAsset(id)`, `getAssetById(id)`
- [ ] `MediaAsset` type: `{ id, name, url (objectURL), type, width, height, duration? }`
- [ ] Validate file types (png, jpg, webp, mp4, webm) and max size (50MB)

**Done when:** Can load an image file, get back an asset with dimensions. URL is usable in an `<img>` tag.

---

## Phase 2 — Three.js WebGPU Renderer & Pipeline

**Goal:** Get a Three.js WebGPURenderer displaying a textured fullscreen quad, with the filter chain architecture in place. No shader effects yet — just the pipeline skeleton.

### 2.1 WebGPU Renderer Setup (`src/lib/renderer/WebGPURenderer.ts`)

- [ ] Initialize `THREE.WebGPURenderer` with antialias, correct pixel ratio, alpha
- [ ] Handle WebGPU availability check — show fallback message if not supported (link to browser requirements)
- [ ] Create an orthographic camera for fullscreen quad rendering
- [ ] Set up resize handling (observe container element)
- [ ] Implement render loop using `renderer.setAnimationLoop` (not raw RAF — Three.js manages timing)
- [ ] Expose `dispose()` for cleanup on unmount
- [ ] Export singleton-like factory: `createRenderer(canvas, options)`

**Done when:** A black canvas renders at the correct size. Resize works. Console shows "WebGPU initialized" or fallback message. No memory leaks on unmount.

### 2.2 Fullscreen Quad & Media Texture (`src/lib/renderer/MediaTexture.ts`)

- [ ] Create `FullscreenQuad` class: a `THREE.Mesh` with `PlaneGeometry(2,2)` and a custom TSL material
- [ ] Load image as `THREE.Texture` and display on the quad (UV-mapped, aspect-ratio correct)
- [ ] Load video as `THREE.VideoTexture` with auto-play, loop, muted
- [ ] Handle aspect ratio: letterbox or cover mode (user preference, default cover)
- [ ] Provide method to swap media at runtime

**Done when:** Uploading or selecting an image shows it on the canvas, correctly sized. A video plays in real-time on the canvas.

### 2.3 Pipeline Manager (`src/lib/renderer/PipelineManager.ts`)

This is the **core architecture** for the filter chain.

- [ ] Maintain an ordered list of `PassNode` objects, synced with `layerStore.getLayersByOrder()`
- [ ] Use **ping-pong render targets**: two `THREE.RenderTarget` objects. Each pass reads from one and writes to the other, alternating.
- [ ] On each frame:
  1. Render base media to render target A
  2. For each visible layer (bottom to top):
     - If `filterMode === 'filter'`: bind previous target as input texture, render shader pass to the next target
     - If `filterMode === 'mask'`: render shader independently, composite with previous target using blendMode
  3. Final pass: render last target to screen
- [ ] Handle layer opacity: mix pass output with input at layer's opacity level
- [ ] Handle blend modes in the compositing step (TSL blend mode functions)
- [ ] React to layer store changes: rebuild pipeline when layers are added, removed, reordered
- [ ] React to param changes: update uniforms without rebuilding pipeline
- [ ] **Performance:** only re-render if something changed (dirty flag system)

**Done when:** With a single passthrough layer, the media displays unchanged. Adding a second passthrough layer still shows the media unchanged. Pipeline rebuilds when layers change. Console confirms pass count.

### 2.4 Pass Node (`src/lib/renderer/PassNode.ts`)

- [ ] Abstract class/interface for a single render pass
- [ ] Properties: `inputTexture`, `outputTarget`, `uniforms` (from ShaderParam[]), `enabled`
- [ ] Method: `render(renderer, inputTexture, outputTarget, time, delta)`
- [ ] Method: `updateUniforms(params: ShaderParam[])` — maps params to TSL node uniforms
- [ ] Method: `dispose()` — clean up GPU resources
- [ ] Factory: `createPassNode(shaderType: ShaderType): PassNode` — returns the correct subclass

**Done when:** A PassNode can be created for a shader type, receives a texture, and writes to a render target (even if the shader is just a passthrough for now).

### 2.5 React Integration (`src/components/editor/Canvas.tsx`)

- [ ] Mount Three.js canvas via `useRef` on a container div
- [ ] Use `useEffect` to initialize WebGPURenderer on mount, dispose on unmount
- [ ] Subscribe to `layerStore` — when layers change, update PipelineManager
- [ ] Subscribe to `editorStore` — handle zoom/pan by adjusting camera or container transform
- [ ] Forward pointer events to the interactivity system (Phase 7)
- [ ] Display FPS counter (dev mode)

**Done when:** Canvas renders in the editor layout. Responds to window resize. Shows uploaded media through the pipeline.

### 2.6 Blend Mode Library (`src/lib/utils/blendModes.ts`)

- [ ] Implement all 16 blend modes as TSL node functions
- [ ] Each function signature: `(base: Node, blend: Node, opacity: Node) => Node`
- [ ] Test: Apply each blend mode visually with two colored quads to confirm correctness

**Done when:** All 16 blend modes produce visually correct results compared to Photoshop/CSS reference.

---

## Phase 3 — Layer System UI

**Goal:** Full layer panel with drag-and-drop reordering, visibility toggles, and all layer management UX. This is the user's primary interaction point.

### 3.1 Editor Layout (`src/app/page.tsx`)

- [ ] Three-column layout: left sidebar (layer panel, ~280px), center (canvas, flexible), right sidebar (properties, ~320px)
- [ ] Sidebars collapsible with smooth animation (GSAP)
- [ ] Top toolbar: full width
- [ ] Responsive: on mobile (<768px), sidebars become bottom sheet / drawer
- [ ] Use CSS Grid for the main layout, flex within sidebars

**Done when:** Layout renders correctly at 375px, 768px, 1024px, 1440px. Sidebars collapse and expand. Canvas fills available space.

### 3.2 Toolbar (`src/components/editor/Toolbar.tsx`)

- [ ] Left section: Logo/app name, file operations (New, Import Media)
- [ ] Center section: Undo/Redo buttons (disabled state from historyStore), Zoom controls (fit, %, +/−)
- [ ] Right section: Theme toggle, Export button, Settings gear
- [ ] Keyboard shortcuts displayed in tooltips
- [ ] Height: 48px, bottom border (divider token)

**Done when:** All buttons render with correct states. Undo/redo disable when unavailable. Zoom percentage updates.

### 3.3 Layer Panel (`src/components/editor/LayerPanel.tsx`)

- [ ] Header: "Layers" title + "Add Layer" button (opens dropdown/popover with shader type options)
- [ ] Scrollable list of `LayerItem` components, ordered top-to-bottom (top = front = highest in stack)
- [ ] Drag-and-drop reordering with `@dnd-kit/core` + `@dnd-kit/sortable`
  - [ ] Drag handle on left of each layer item
  - [ ] Smooth reorder animation
  - [ ] Visual drop indicator
- [ ] Bottom: Quick-add buttons for common operations

**Done when:** Can add layers of different types. Can drag to reorder. Layer order syncs with layerStore. Scroll works with many layers.

### 3.4 Layer Item (`src/components/editor/LayerItem.tsx`)

- [ ] Thumbnail (48×48): live preview of this layer's output, or shader icon if no preview
- [ ] Layer name (editable on double-click)
- [ ] Shader type badge
- [ ] Visibility toggle (eye icon) — dims the row when hidden
- [ ] Lock toggle (lock icon)
- [ ] Filter/Mask mode toggle (small indicator)
- [ ] Selection highlight (accent border-left)
- [ ] Right-click context menu: Duplicate, Delete, Rename, Reset Parameters, Move to Top/Bottom
- [ ] Solo mode: Alt+click on visibility toggles solo
- [ ] Opacity slider: appears on hover or when selected, compact inline slider
- [ ] Hover state: subtle background change

**Done when:** All interactions work. Double-click renames inline. Context menu appears with all options. Solo mode works correctly.

### 3.5 Add Layer Flow

- [ ] Clicking "Add Layer" opens a popover/dropdown with categories:
  - **Texture Effects:** Pixelation, Halftone, ASCII, Dithering, Grain
  - **Optical Effects:** Bloom, Fluted Glass, Progressive Blur
  - **Interactive:** Mouse Ripple, Mouse Trail, Repel/Attract
  - **Media:** Import Image, Import Video
- [ ] Each option shows an icon + name + one-line description
- [ ] Selecting adds the layer at the top of the stack, selects it, and opens the properties panel
- [ ] Optionally: hover preview on the canvas before adding (stretch goal)

**Done when:** Popover opens, shows all options, adding a layer creates it with correct defaults and selects it.

### 3.6 Preset Browser (`src/components/editor/PresetBrowser.tsx`)

- [ ] Modal dialog for the initial "Get Started" experience
- [ ] Sections: "Start from Scratch" (blank canvas + color picker), "Default Assets" (bundled images), "Starter Shaders" (pre-configured layer stacks)
- [ ] Grid of cards (top-image variant) with previews
- [ ] Selecting a preset loads the media and/or layer configuration
- [ ] Also accessible from Toolbar → File → Browse Presets

**Done when:** Modal opens, shows presets, selecting one loads it into the editor. Close dismisses. Keyboard accessible (Esc to close, Tab to navigate).

---

## Phase 4 — Shader Library — Core Effects

**Goal:** Implement all 9 shader effects as TSL pass nodes. Each shader must work as a filter (processes input texture) by default.

### Critical Pattern: Filter Pre-processing

Every filter-mode shader follows this pattern:
1. Sample the input texture at the fragment's UV
2. **Pre-process** (pixelate / quantize / grid-align) to match the effect's grid
3. Apply the effect using the pre-processed color
4. Output the result

This ensures halftone dots, ASCII characters, and dithering patterns reflect the underlying media content, not just overlay shapes.

### 4.1 Pixelation Shader (`src/lib/shaders/pixelation.tsl.ts`)

- [ ] TSL node function that takes input texture + params
- [ ] Floor UV to grid cells of `cellSize`
- [ ] Sample center of each cell
- [ ] Shape variants: square (blocky pixels), circle (dots on background), diamond
- [ ] Preserve aspect ratio option
- [ ] Anti-aliasing at cell edges (smoothstep)

**Done when:** Pixelation renders at various cell sizes. Changing cellSize updates in real-time. Shape variants work. Input texture is correctly processed.

**Acceptance criteria:**
- [ ] No visual artifacts at cell boundaries
- [ ] Smooth parameter transitions
- [ ] Works with both image and video input
- [ ] No console errors or GPU warnings

### 4.2 Halftone Shader (`src/lib/shaders/halftone.tsl.ts`)

- [ ] Sample input texture, pre-pixelate to match dot grid (1:1 grid alignment — this is the key insight)
- [ ] Compute luminance from sampled pixel
- [ ] Size each dot proportional to luminance (dark = large dot, light = small dot, or inverted)
- [ ] Grid patterns: regular, rotated (angle param), staggered
- [ ] Dot shapes: circle, square, diamond, line (creates line-based halftone)
- [ ] Color modes: source color per dot, monochrome, duotone (light/dark color params)
- [ ] Contrast control: remap luminance curve before sizing dots
- [ ] Softness: anti-aliased dot edges (smoothstep width)
- [ ] CMYK mode (stretch): separate halftone per channel at different angles

**Done when:** Halftone produces rich microtextures that reflect the underlying image. Changing an image changes the halftone pattern. All shape and color modes work.

### 4.3 ASCII Shader (`src/lib/shaders/ascii.tsl.ts`)

- [ ] Pre-pixelate input to match character grid
- [ ] Sample luminance per cell
- [ ] Map luminance to character index from selected charset
- [ ] Charsets (shipped as small SDF or bitmap font textures):
  - Light: ` .:-=+*#%@`
  - Dense: ` .',:;!|({[#@`
  - Blocks: ` ░▒▓█`
  - Hatching: ` ╱╲╳░▒`
  - Binary: `01`
- [ ] Render character by sampling a font texture atlas at the correct glyph position
- [ ] Color modes: source color, monochrome, green-terminal (classic CRT green on black)
- [ ] Background opacity control
- [ ] Font weight variants: change the font texture atlas

**Done when:** ASCII art clearly represents the underlying image. Changing charset changes the visual character. Green-terminal mode looks like a retro CRT.

### 4.4 Dithering Shader (`src/lib/shaders/dithering.tsl.ts`)

- [ ] **Ordered Bayer dithering**: Implement 2×2, 4×4, 8×8 Bayer matrices as uniforms/constants
  - [ ] Threshold input luminance against matrix value at tiled UV position
- [ ] **Floyd-Steinberg** (approximation for GPU): Since F-S is inherently sequential, implement a close approximation using blue noise or pre-computed error diffusion texture
- [ ] **Atkinson dithering**: Similar GPU approximation approach
- [ ] **Blue noise dithering**: Use a pre-computed blue noise texture as threshold map
- [ ] Color modes: monochrome (B&W), source color (per-channel dithering), custom palette (map to nearest N colors then dither)
- [ ] Levels control: quantize to N levels before dithering
- [ ] Spread: controls dithering intensity/spread

**Done when:** All 4 algorithms produce visually distinct dithering. Bayer is crisp and grid-like, blue noise is organic. Color palette mode maps correctly.

### 4.5 Bloom Shader (`src/lib/shaders/bloom.tsl.ts`)

- [ ] **Multi-pass approach** (may need internal ping-pong within this single layer's pass):
  1. Brightness extraction: threshold filter isolates bright areas
  2. Downsample + blur: iterative Gaussian blur at progressively lower resolutions (3-5 mip levels)
  3. Upsample + combine: add blurred bright areas back to original
- [ ] Soft knee: smooth threshold transition
- [ ] Intensity: multiplier on bloom contribution
- [ ] Radius: blur kernel size
- [ ] Option to blend with source or replace

**Done when:** Bright areas glow convincingly. Performance is good (watch for GPU stalls on large radius). Threshold clearly controls what glows.

### 4.6 Fluted Glass Shader (`src/lib/shaders/flutedGlass.tsl.ts`)

- [ ] Create parallel ridges (flutes) that distort the UV lookup
- [ ] Distortion via sinusoidal UV offset perpendicular to flute direction
- [ ] Orientations: vertical, horizontal, radial (emanating from center)
- [ ] Refraction simulation: offset UVs based on a fake refraction index
- [ ] Optional color tint applied to result
- [ ] Optional blur along the flute axis (directional blur)
- [ ] Flute count controls frequency

**Done when:** Image behind looks like it's viewed through ribbed glass. Changing orientation rotates the effect. Refraction index creates visible distortion differences.

### 4.7 Progressive Blur Shader (`src/lib/shaders/progressiveBlur.tsl.ts`)

- [ ] Compute blur strength per pixel based on distance from focus point/line
- [ ] Directions: top-to-bottom, bottom-to-top, left-to-right, right-to-left, center-out, radial
- [ ] Focus point (vec2) and focus size (defines sharp region)
- [ ] Falloff curves: linear, ease-in, ease-out, ease-in-out
- [ ] Implementation: variable-radius blur. Options:
  - Multiple blur passes at different strengths, blended by gradient mask
  - Or mip-map sampling at different LODs based on gradient (more performant)
- [ ] Start/end strength define the range of blur

**Done when:** Sharp focus area transitions smoothly to blurred edges. Direction options all work. Tilt-shift look achievable with bottom-to-top direction.

### 4.8 Grain Shader (`src/lib/shaders/grain.tsl.ts`)

- [ ] Animated noise pattern (time-based hash or noise texture)
- [ ] Intensity: how visible the grain is
- [ ] Size: scale of the noise pattern
- [ ] Speed: animation rate
- [ ] Monochrome: single channel noise vs. per-channel (RGB) noise for color grain
- [ ] Blend via overlay, soft-light, or additive
- [ ] Subtle: should feel like film grain, not static

**Done when:** Grain animates smoothly. At low intensity, adds subtle film-like texture. Monochrome vs. color grain clearly different.

### 4.9 Interactivity Shader (`src/lib/shaders/interactivity.tsl.ts`)

> This is covered in more detail in Phase 7. Here we define the base shader.

- [ ] Receives mouse position and history as uniforms
- [ ] **Ripple**: concentric rings emanating from click/touch point, decaying over time
- [ ] **Trail**: persistent trail that follows cursor, with adjustable decay
- [ ] **Repel/Attract**: displaces underlying texture away from or toward cursor
- [ ] All effects receive the input texture and distort/overlay it
- [ ] Decay: controls how quickly the effect fades
- [ ] Multiple concurrent effects (click multiple times for multiple ripple origins)

**Done when:** Moving the mouse over the canvas creates visible interactive effects on the shader output. Ripple emanates from click. Trail follows cursor smoothly.

---

## Phase 5 — Shader Controls & Sidebar

**Goal:** When a layer is selected, the right sidebar shows all its controls. Every ShaderParam maps to the correct UI control. Changes update in real-time.

### 5.1 Param Control Router (`src/components/shared/ParamControl.tsx`)

- [ ] Receives a `ShaderParam` and renders the appropriate control:
  - `float` / `int` → Slider with value input
  - `bool` → Switch
  - `color` → Color picker swatch (opens picker on click)
  - `enum` → Select dropdown
  - `vec2` → Two linked sliders (or XY pad for position)
  - `vec3` → Three sliders (or color picker if contextually appropriate)
- [ ] Fires `onChange(key, value)` on interaction
- [ ] Debounce slider changes at 16ms (one frame) for uniform updates, 300ms for history snapshots
- [ ] Shows label, current value, and optional description tooltip
- [ ] Reset to default button per param (appears on hover)

**Done when:** Every param type renders the correct control. Changing a slider updates the canvas in real-time. Correct debouncing behavior.

### 5.2 Properties Panel (`src/components/editor/PropertiesPanel.tsx`)

- [ ] Header: layer name + shader type icon
- [ ] **General section** (always visible for all layers):
  - Opacity slider (0–100%)
  - Blend mode dropdown (16 options with preview swatches)
  - Filter/Mask toggle
- [ ] **Parameters section**: grouped by `param.group`, each group collapsible
  - Renders `ParamControl` for each param
- [ ] **Actions section**: Reset All Parameters, Delete Layer
- [ ] Empty state: "Select a layer to edit its properties"
- [ ] Scrollable when content exceeds viewport
- [ ] Responsive: on mobile, this is a bottom sheet that slides up

**Done when:** Selecting a halftone layer shows all halftone controls grouped logically. Changing any param updates the canvas. Blend mode dropdown works.

### 5.3 Color Picker (`src/components/shared/ColorPicker.tsx`)

- [ ] HSL color picker with:
  - Saturation/Lightness 2D area
  - Hue slider bar
  - Alpha slider bar (when applicable)
  - Hex input field
  - RGB input fields
- [ ] Popover positioning (doesn't overflow viewport)
- [ ] Swatch shows current color, opens picker on click
- [ ] Recent colors row (kept in component state, not persisted)

**Done when:** Can pick any color. Hex input syncs with picker. Alpha works. Popover positions correctly.

### 5.4 XY Pad Control

- [ ] For `vec2` params like `focusPoint`
- [ ] Small 2D area where you can click/drag to set X/Y
- [ ] Shows crosshair at current position
- [ ] Displays numeric X/Y values
- [ ] Bounded to 0–1 range (normalized)

**Done when:** Dragging the pad updates the vec2 param. Canvas responds in real-time.

---

## Phase 6 — Media Input Pipeline

**Goal:** Users can upload images/videos, select from defaults, or start with a solid color. Media feeds into the render pipeline as the base texture.

### 6.1 Upload Flow

- [ ] Drag-and-drop zone on canvas (when no media loaded) + file input button
- [ ] Accept: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.mp4`, `.webm`
- [ ] File validation: type check, size limit (50MB), dimension check
- [ ] Progress indicator during load
- [ ] On success: create `MediaAsset` in mediaStore, set as base texture in renderer
- [ ] Error toast on invalid file

**Done when:** Can drag an image onto the canvas and it appears. Same with video. Invalid files show error toast.

### 6.2 Default Assets

- [ ] Bundle 4-6 high-quality images (abstract textures, landscapes, portraits — royalty-free)
- [ ] Store as static assets in `/public/assets/`
- [ ] Available in Preset Browser and via Toolbar → Import → Default Assets
- [ ] Solid color option: renders a solid color quad (with color picker)
- [ ] Gradient option: renders a configurable gradient (2-4 color stops, angle)

**Done when:** Default images load instantly from local assets. Solid color and gradient base textures work.

### 6.3 Video Handling

- [ ] Auto-play, loop, muted by default
- [ ] Play/pause toggle in toolbar or properties panel
- [ ] Seek bar for scrubbing (when paused)
- [ ] `VideoTexture` updates every frame automatically
- [ ] Handle video end: loop or pause based on setting

**Done when:** Video plays through the shader pipeline in real-time. Pause/play works. Scrubbing updates the canvas.

---

## Phase 7 — Interactivity Layer

**Goal:** Mouse/touch interactions affect the shader output. This requires a separate data flow from pointer events → shader uniforms.

### 7.1 Pointer Data Hook (`src/hooks/useMouseInteraction.ts`)

- [ ] Track normalized mouse position (0–1 UV space relative to canvas)
- [ ] Track mouse velocity
- [ ] Maintain a position history buffer (last N positions for trail effects)
- [ ] Track click/touch events with timestamps (for ripple origins)
- [ ] Handle touch events for mobile
- [ ] Throttle updates to animation frame rate

**Done when:** Hook provides accurate, real-time pointer data in UV space. Works on desktop and mobile.

### 7.2 Interaction Data Buffer

- [ ] GPU-side: maintain a buffer/texture that stores interaction state
- [ ] For ripples: array of {origin, startTime, active} — max 10 concurrent
- [ ] For trails: texture that gets painted at mouse position each frame, with decay
- [ ] For repel/attract: displacement field computed from mouse position + radius
- [ ] Updated every frame from the hook data

**Done when:** The interaction data is available as a uniform/texture in the shader pass. Multiple simultaneous interactions work.

### 7.3 Interactive Effects

- [ ] Ripple: ring distortion that expands and fades
- [ ] Trail: soft brush stroke that follows cursor, fading over time
- [ ] Repel: pushes underlying texture pixels away from cursor
- [ ] Attract: pulls underlying texture pixels toward cursor
- [ ] Glow: bright spot that follows cursor
- [ ] Each effect composites with the underlying filtered texture

**Done when:** All 5 interactive effects work and feel responsive (<16ms latency from pointer move to visual update). Effects combine with other shader layers correctly.

---

## Phase 8 — Polish, Performance & Accessibility

**Goal:** Ship-quality polish. Smooth animations, keyboard support, screen reader compatibility, 60fps render loop.

### 8.1 Performance

- [ ] Dirty flag system: only re-render when state changes or video frame updates
- [ ] Render target pooling: reuse render targets, don't allocate per frame
- [ ] Uniform updates without material recompilation (TSL should handle this, verify)
- [ ] FPS monitoring: warn user (toast) if dropping below 30fps, suggest reducing quality
- [ ] Resolution scaling: allow rendering at 0.5× or 0.75× resolution for performance
- [ ] Layer thumbnail generation: render at low resolution on a separate schedule (not every frame)
- [ ] Profile GPU usage with Chrome DevTools / browser MCP

**Done when:** Maintains 60fps with 5 shader layers on a mid-range GPU. No memory leaks over extended sessions. FPS counter confirms.

### 8.2 Animations & Transitions (GSAP)

- [ ] Sidebar open/close: slide + fade, 150ms, correct easing from design system
- [ ] Layer add/remove: height collapse animation in list
- [ ] Layer reorder: smooth position animation (dnd-kit + GSAP)
- [ ] Modal enter/exit: scale + translateY per design spec
- [ ] Toast enter/exit: per design spec
- [ ] Stagger: 30ms per child in lists
- [ ] Reduced motion: respect `prefers-reduced-motion`

**Done when:** All UI transitions match the design system motion spec exactly. No janky animations. Reduced motion kills all.

### 8.3 Keyboard & Screen Reader

- [ ] All interactive elements focusable via Tab
- [ ] Layer panel: Arrow keys to navigate, Space to toggle visibility, Enter to select, Delete to remove
- [ ] Sliders: Arrow keys for fine control (step), Shift+Arrow for coarse (10×step)
- [ ] Undo/Redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
- [ ] Save: Ctrl/Cmd+S (triggers export)
- [ ] ARIA labels on all icon buttons
- [ ] `aria-expanded` on collapsible sections
- [ ] `aria-live` on toast container and FPS counter
- [ ] Focus trap in modals
- [ ] Skip-to-content link (skips toolbar, goes to canvas)
- [ ] Color contrast: verify all text meets WCAG AA (4.5:1 body, 3:1 large)

**Done when:** Can operate the entire editor with keyboard only. VoiceOver/NVDA can navigate layer panel and controls. Contrast checker passes.

### 8.4 Responsive Design

- [ ] **375px (mobile):** Single column. Canvas full width. Layer panel = bottom drawer (drag up). Properties = bottom sheet. Toolbar compact with hamburger menu.
- [ ] **768px (tablet):** Canvas with left sidebar (layer panel, collapsible). Properties as overlay/drawer from right.
- [ ] **1024px (laptop):** Full three-column layout. Sidebars fixed.
- [ ] **1440px+ (desktop):** Wider sidebars, more breathing room.
- [ ] Touch interactions: pinch-to-zoom on canvas, swipe to dismiss drawers
- [ ] Test with Chrome DevTools device simulation + browser MCP

**Done when:** Layout works beautifully at all 4 breakpoints. Touch gestures feel native. No overflow, no cut-off content.

### 8.5 Error Handling & Edge Cases

- [ ] WebGPU not available: show clear fallback page with browser requirements
- [ ] Shader compilation error: catch, show toast with error, disable layer (don't crash)
- [ ] Media load failure: show error state in layer, allow retry
- [ ] Empty state: welcoming "Get Started" screen when no layers exist
- [ ] Maximum layers: cap at 20, show toast when limit reached
- [ ] Out of GPU memory: catch, show warning, suggest removing layers

**Done when:** Every error case shows a helpful message, not a blank screen or cryptic error.

---

## Phase 9 — Export & Sharing

**Goal:** Users can export their creation as an image, video, or shareable configuration.

### 9.1 Image Export

- [ ] Capture current canvas frame as PNG or JPEG
- [ ] Resolution options: 1×, 2×, 4× current viewport, or custom dimensions
- [ ] Quality slider for JPEG
- [ ] Download via browser save dialog
- [ ] Include/exclude UI overlays (interaction cursors, grid)

**Done when:** Exports a clean, high-resolution image that matches the canvas exactly.

### 9.2 Video/GIF Export (Stretch)

- [ ] Record N seconds of the canvas output (for animated shaders/video input)
- [ ] Use `MediaRecorder` API on the canvas stream
- [ ] Format options: WebM, MP4 (if supported), GIF (via library)
- [ ] Progress bar during recording/encoding

**Done when:** Can export a 5-second loop of an animated shader as WebM. Quality is good.

### 9.3 Preset Export/Import

- [ ] Export current layer stack as JSON (layer config, params — no media binary)
- [ ] Import JSON to restore layer stack
- [ ] Useful for sharing presets and templates

**Done when:** Export → close → import → identical layer stack (minus media, which would need re-upload).

---

## Phase 10 — Stretch Goals

These are not in the initial scope but designed to be easy to add given the architecture.

- [ ] **Layer groups**: nest layers in folders, collapsed/expanded
- [ ] **Masking**: draw masks per layer (brush tool on a mask texture)
- [ ] **LUT/Color grading layer**: upload a LUT file, apply as a filter
- [ ] **Noise generators**: Perlin, Simplex, Voronoi as standalone shader layers
- [ ] **SDF shapes**: 2D/3D SDF primitives as layers
- [ ] **Warp/Distortion layer**: UV displacement maps, swirl, bulge, wave
- [ ] **Mesh gradient layer**: configurable gradient with control points
- [ ] **Guilloche patterns**: parametric engraving-style patterns
- [ ] **Timeline**: keyframe animation of any param over time
- [ ] **Collaboration**: real-time multiplayer editing (would require backend)
- [ ] **Plugin system**: allow users to write custom TSL shaders
- [ ] **AI assistance**: describe a shader effect in natural language, generate params

---

## Appendix A — Design System Quick Reference

### Colors
```
Primary:     #1d1d1c  (shades: #10100f → #171716, tints: #4d4d46 → #d4d4cf)
Secondary:   #656553  (shades: #151510 → #515142, tints: #878772 → #e0e0dd)
Accent:      #64643a  (shades: #15150b → #51512d, tints: #8d8d58 → #e0e0d8)
Background:  #F5F5F0
Surfaces:    #c5c5a6 / #94945e / #4b4b2e
Text:        #111110 (primary) / #444440 (secondary) / #88887e (tertiary) / #bbbbbb (disabled)
Border:      rgba(0,0,0,0.04)
```

### Semantic
```
Success: #22C55E | Warning: #F59E0B | Error: #EF4444 | Info: #3B82F6
```

### Spacing Scale (base: 24px)
```
4xs:3 | 3xs:6 | 2xs:9 | xs:12 | sm:18 | md:24 | lg:36 | xl:48 | 2xl:72 | 3xl:96 | 4xl:144
```

### Type Scale (Inter)
```
Caption:  12px / 400 / 24px LH / 0.01em LS
Body:     14px / 400 / 24px LH / 0em LS
Subhead:  17px / 500 / 24px LH / 0em LS
Title:    20px / 600 / 24px LH / -0.005em LS
Headline: 24px / 700 / 32px LH / -0.01em LS
Display:  29px / 700 / 40px LH / -0.015em LS
```

### Border Radius
```
xs:2 | sm:4 | md:8 | lg:12 | xl:16 | full:9999
Buttons: sm(4) | Inputs: sm(4) | Cards: md(8) | Modals: lg(12) | Tooltips: xs(2) | Badges: full
```

### Elevation
```
Low:  0 1px 3px 0px rgba(0,0,0,0.047)
Mid:  0 3px 8px 0px rgba(0,0,0,0.08)
High: 0 7px 18px 0px rgba(0,0,0,0.119)
```

### Motion
```
Micro:  60ms  cubic-bezier(.2,1.4,.4,1)
Base:   120ms cubic-bezier(.2,1.4,.4,1)
Medium: 150ms cubic-bezier(.2,1.4,.4,1)
Large:  500ms cubic-bezier(.2,1.4,.4,1)
Exit:   enter × 0.6 duration, cubic-bezier(0,0,.2,1)
```

---

## Appendix B — Available Skills & Resources

Cursor has access to these pre-installed skills/resources:

- **WebGPU skills** — shader development patterns, TSL reference
- **UI design skills** — component architecture, accessibility patterns
- **Performance skills** — rendering optimization, memory management
- **Next.js best practices** — App Router patterns, SSR considerations
- **Three.js R3F llms.txt** — `https://r3f.docs.pmnd.rs/llms-full.txt` (Three.js Fiber reference — useful even though we're using vanilla Three.js for WebGPU specifics)
- **Three.js Drei llms.txt - `https://drei.docs.pmnd.rs/llms-full.txt`(Three.js Drei reference — useful even though we're using vanilla Three.js for WebGPU specifics)
- **Chrome Browser MCP** — catch runtime errors, inspect GPU performance, verify responsive layouts

### Usage Notes for Cursor

1. **Always check skills first** before implementing a shader or complex component.
2. **Use browser MCP** to verify: no console errors, correct rendering at all breakpoints, WebGPU initialization success.
3. **Test incrementally**: after each subtask, run the dev server and verify in browser before moving on.
4. **TSL (Three Shading Language)**: This is Three.js's node-based shader system for WebGPU. NOT raw WGSL. Reference the Three.js docs and r3f llms.txt for patterns. Key imports: `import { uniform, texture, uv, float, vec2, vec3, vec4, mix, step, smoothstep, fract, floor, sin, cos, mod, length, dot } from 'three/tsl'`.
5. **Shader development pattern**: Build each shader first as an isolated test (render to screen with hardcoded params), then integrate into the pipeline.
6. **Log mistakes**: When you encounter a bug, wrong approach, or failed attempt — log it in `MISTAKES.md` with what went wrong, why, and the fix. **Read `MISTAKES.md` at the start of every session** to avoid repeating past errors.
7. **Update progress**: After completing each task, mark it `[x]` in this plan. If blocked, mark `[!]` with a note.

---

## Appendix C — Task Completion Criteria

Every task (numbered X.Y) is considered **done** when:

1. ✅ Code compiles with zero TypeScript errors
2. ✅ No console errors or warnings in browser (verified via browser MCP)
3. ✅ Visual result matches design spec (colors, spacing, typography, radius, shadow)
4. ✅ Interactive states work (hover, focus, active, disabled)
5. ✅ Keyboard accessible where applicable
6. ✅ Works at all breakpoints (375px, 768px, 1024px, 1440px)
7. ✅ My explicit confirmation after testing

Tasks can be marked with:
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Complete & confirmed
- `[!]` — Blocked (add note)

---

## Progress Tracker

| Phase | Name | Tasks | Done | Status |
|-------|------|-------|------|--------|
| 0 | Design System | 6 | 6 | ✅ Complete |
| 1 | Data Model & State | 6 | 0 | ⬜ Not started |
| 2 | WebGPU Renderer | 6 | 0 | ⬜ Not started |
| 3 | Layer System UI | 6 | 0 | ⬜ Not started |
| 4 | Shader Library | 9 | 0 | ⬜ Not started |
| 5 | Controls & Sidebar | 4 | 0 | ⬜ Not started |
| 6 | Media Input | 3 | 0 | ⬜ Not started |
| 7 | Interactivity | 3 | 0 | ⬜ Not started |
| 8 | Polish & Perf | 5 | 0 | ⬜ Not started |
| 9 | Export | 3 | 0 | ⬜ Not started |
| 10 | Stretch | — | 0 | ⬜ Future |

**Total: 51 tasks across 10 phases**