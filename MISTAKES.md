# Shader Studio — Mistakes & Lessons Learned

> **READ THIS FILE AT THE START OF EVERY SESSION.**
> This log prevents repeating past mistakes. Before writing any code, scan for entries relevant to your current task.

---

## How to Use This File

When you encounter a problem — a bug, a wrong approach, a failed assumption, a compilation error, a performance issue — log it here immediately using this format:

```
### [PHASE.TASK] Short title
**Date:** YYYY-MM-DD
**Task:** What you were working on
**What went wrong:** Describe the mistake or bug
**Why it happened:** Root cause analysis
**The fix:** What solved it
**Rule:** One-line rule to prevent recurrence (start with "ALWAYS" or "NEVER")
```

### Severity Tags
Prefix titles with severity:
- 🔴 **CRITICAL** — caused crash, data loss, or hours of debugging
- 🟡 **MODERATE** — wrong approach, had to rewrite significant code
- 🟢 **MINOR** — small bug, quick fix, but worth remembering

---

## Quick Rules (extracted from lessons below)

> This section grows as mistakes are logged. Extract the **Rule** from each entry and add it here for fast scanning.

- NEVER use named spacing tokens (`sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`) with `max-w-*` — our `--spacing-*` tokens override Tailwind's default `max-w-{name}` values. Use arbitrary values (`max-w-[32rem]`) instead.
- ALWAYS add a `clearTexture()` method when designing media-holding objects — callers need a way to reset back to blank state when the media layer is deleted.
- ALWAYS return `vec4` (not `vec3`) from `_buildEffectNode()` — `buildBlendNode` accesses `.rgb` which works on vec4; vec3 causes type-inference issues in TSL.
- ALWAYS add a minimum radius/size param to halftone/dot effects — without `dotMin`, dark areas produce zero-size dots (invisible), giving the incorrect appearance of "random dots not everywhere".
- NEVER use per-pixel input texture as the halftone background in source mode — for smooth images dotColor ≈ bgColor → invisible effect. Use a solid background (white for source mode) so dots are always visible against it.
- NEVER call TSL `If()` or `.toVar()` outside a `Fn()` shader function context — they are null at build time and crash with "Cannot read properties of null". Instead, build a pure functional DAG: JS-time `for` loop + `select(cond, a, b)` + `max(a, b)` to fold results statically.
- NEVER make media layers a special case outside the render pipeline — they must be first-class `PassNode` passes in `syncLayers()`, same as shader layers. A `baseQuad` singleton that one component controls is always a wrong pattern for a layer-based compositor.
- ALWAYS check `l.visible` when selecting which layer to use as a source — skipping the visibility check means hidden layers still affect the output.
- NEVER use `canvas.toDataURL()` as the primary export path for WebGPU output — use renderer/readback from an offscreen render target.
- ALWAYS account for WebGPU readback row padding (`bytesPerRow` aligned to 256) before writing to `ImageData`.
- NEVER derive frame aspect from selected/top media layers implicitly — in auto mode, anchor to a stable base source and expose explicit frame-aspect modes.
- ALWAYS design right-sidebar action rows to wrap on narrow widths; never assume inline labels plus multiple buttons will fit.

<!-- 
Example of what this section will look like:
- NEVER use raw WGSL — always use Three.js TSL node system
- ALWAYS dispose render targets on layer removal to prevent memory leaks
- NEVER set `antialias: true` on WebGPURenderer when using post-processing (it conflicts with render targets)
- ALWAYS use `renderer.setAnimationLoop` instead of raw requestAnimationFrame with WebGPU
- NEVER import from 'three/examples/jsm/*' for WebGPU — those are WebGL-only
-->

---

## Log

### 🔴 [0.4] Tailwind v4 `--spacing-*` overrides `max-w-{name}` utilities
**Date:** 2026-02-21
**Task:** Phase 0.4 — Base UI components + preview page
**What went wrong:** The preview page container rendered at ~96px wide instead of 48rem. All named `max-w-*` utilities using our spacing token names (sm, md, lg, xl, 2xl, 3xl) were broken. Dialog was also broken (`max-w-lg` = 2.25rem instead of 32rem).
**Why it happened:** In Tailwind v4, `--spacing-*` variables in `@theme` generate ALL sizing utilities — including `max-w-*`, `min-w-*`, `w-*`, `h-*`, etc. Our tokens `--spacing-sm: 1.125rem`, `--spacing-3xl: 6rem`, etc. silently replaced Tailwind's default `max-w-sm` (24rem) and `max-w-3xl` (48rem) values.
**The fix:** Replace all `max-w-{spacing-name}` with arbitrary values: `max-w-[32rem]`, `max-w-[48rem]`, etc. Affected: `dialog.tsx` (`max-w-lg` → `max-w-[32rem]`), preview page (`max-w-3xl` → `max-w-[48rem]`, `max-w-sm` → `max-w-[20rem]`, `max-w-xs` → `max-w-[16rem]`).
**Rule:** NEVER use named spacing tokens with `max-w-*` — always use arbitrary pixel/rem values for max-widths.

### 🟡 [4.2] Delete-media-layer left stale texture on canvas
**Date:** 2026-02-22
**Task:** Phase 4.2 — Halftone + canvas media sync
**What went wrong:** Deleting a media (image/video) layer from the stack did not clear the canvas — the stale texture kept rendering.
**Why it happened:** `Canvas.tsx` `sync()` only loaded new media (when `mediaLayer.mediaUrl !== loadedBaseUrlRef.current`), but had no branch for the case where `mediaLayer` was undefined (layer deleted). `FullscreenQuad` also had no `clearTexture()` method.
**The fix:** Added `clearTexture()` to `FullscreenQuad` (resets both `_coverTexNode`/`_containTexNode` to `_placeholder`, resets `_uTextureAspect`). Updated `sync()` to call `p.baseQuad.clearTexture()` when no media layer exists.
**Rule:** ALWAYS add a `clearTexture()` / reset method when designing media-holding GPU objects — callers need a way to revert to blank state.

### 🔴 [4.2] Halftone source mode invisible — bgColor ≈ dotColor for smooth images
**Date:** 2026-02-22
**Task:** Phase 4.2 — Halftone shader source color mode
**What went wrong:** Source color mode produced near-invisible halftone. Appeared as a barely-there dot pattern on smooth images, and completely invisible on uniform-color areas.
**Why it happened:** The original code sampled the input texture per-pixel for both the dot color AND the background. For smooth images, the per-pixel background color and the cell-center dot color are essentially the same value → contrast ≈ 0 → invisible.
**The fix:** Changed the source mode background from per-pixel input to solid white `vec3(1.0, 1.0, 1.0)`. This matches how reference halftone implementations work: colored dots (cell-center color) always appear against a solid neutral background.
**Rule:** NEVER use per-pixel input texture as the halftone background in source mode. Always use a solid background so dots have visible contrast.

### 🟡 [4.2] Halftone "random dots not everywhere" — zero radius in dark areas
**Date:** 2026-02-22
**Task:** Phase 4.2 — Halftone dot sizing
**What went wrong:** After fixing source mode visibility, halftone still showed dots only in bright/mid regions. Dark areas had no dots at all, making the effect look sparse and "random."
**Why it happened:** Dot radius formula was `luma * dotSize`. In dark areas `luma ≈ 0`, so `radius ≈ 0` — dots are mathematically zero-size and thus invisible.
**The fix:** Added a `dotMin` parameter (minimum dot radius). New formula: `radius = dotMin + adjustedLuma * dotSize`. This ensures a minimum-size dot is always present in every cell, even in black areas. Default `dotMin = 2px`.
**Rule:** ALWAYS add a minimum radius/size param to halftone and dot-grid effects. Without it, dark regions produce invisible dots, breaking the illusion of a full halftone grid.

### 🟢 [4.2] _buildEffectNode should return vec4, not vec3
**Date:** 2026-02-22
**Task:** Phase 4.2 — Halftone PassNode subclass
**What went wrong:** Initial halftone `_buildEffectNode()` returned a `vec3`. While `buildBlendNode` can sometimes handle this, it caused TypeScript type inference issues and was inconsistent with the pixelation pass (which returns `vec4`).
**The fix:** Changed return to `vec4(mix(bgColor, dotColor, mask), float(1.0))`. This matches the established pattern and keeps the blend node's `.rgb` accessor working correctly.
**Rule:** ALWAYS return `vec4` from `_buildEffectNode()` subclass overrides.

### 🔴 [2.3] Media layers not first-class pipeline passes — compositor fundamentally broken
**Date:** 2026-02-23
**Task:** Phase 6 — multi-image stacking, reorder, blend modes between media layers
**What went wrong:** Uploading multiple images always showed the first one. Hiding a layer had no effect. Blend modes and opacity didn't apply between media layers. The user correctly identified the core issue: the entire point of a layer system is stacking/reordering/compositing, and none of that worked for media.
**Why it happened:** The original architecture had a single `baseQuad` (a `FullscreenQuad`) controlled directly by `Canvas.tsx`. `PipelineManager.syncLayers()` only accepted shader layers. Media layers lived in a completely separate code path that bypassed the render chain. Two compounding bugs:
1. `ordered.find()` in the sync function picked the **bottommost** media layer, not the most recently added one — new uploads go to the top so the first-ever upload always won
2. `l.visible` was not checked — hidden media layers still drove the canvas
**The fix:** `MediaPass` — a `PassNode` subclass that samples its image/video texture with aspect-ratio cover UVs, blends it over the running composite using the layer's blend mode + opacity. `PipelineManager.syncLayers()` now handles all layer kinds (`kind: 'shader'|'image'|'video'`), creates `MediaPass` for media layers, and calls `setMedia(url, type)` when the URL changes. `Canvas.tsx sync()` maps ALL layers to `PipelineLayer` and calls `syncLayers()` once. The separate `baseQuad` / `_loadBaseMedia` side path is deleted.
**Rule:** NEVER make one layer type a special case outside the main render pipeline. Every layer kind must participate in `syncLayers()` so stacking, reordering, visibility, opacity, and blend modes all work uniformly.

### 🟢 [6.1] `l.visible` not checked in media layer selection
**Date:** 2026-02-23
**Task:** Canvas sync — media layer source selection
**What went wrong:** Hiding a media layer had no effect on the canvas. The hidden layer continued to drive the base texture.
**Why it happened:** `ordered.find((l) => l.kind === 'image' || l.kind === 'video')` — `l.visible` not included in the predicate.
**The fix:** Added `&& l.visible` to the find predicate (later made irrelevant by the full MediaPass refactor, which correctly uses `pass.enabled = layer.visible`).
**Rule:** ALWAYS check `l.visible` when selecting which layer drives any output. Invisible layers must be invisible.

### 🔴 [4.2] TSL `If()` / `.toVar()` crash outside `Fn()` context
**Date:** 2026-02-23
**Task:** Halftone 3×3 neighborhood loop for dot overflow
**What went wrong:** Added a `checkCell()` helper inside `_buildEffectNode()` that used `.toVar()` and `If()` to accumulate the max-coverage cell across a 3×3 grid. Crashed at runtime with: `TypeError: Cannot read properties of null (reading 'If')`.
**Why it happened:** TSL control-flow constructs (`If`, `Else`, `.toVar()`, `Loop`) are only defined inside a `Fn()` closure — they bind to the currently-building shader function. Called at JS module/class build time (outside `Fn()`), the underlying runtime reference is null.
**The fix:** Replaced the mutable accumulator + `If` pattern with a pure functional fold built at JS time:
```ts
let accCov = float(0.0);
let accR = float(0.0);
for (let dj = -1; dj <= 1; dj++) {
  for (let di = -1; di <= 1; di++) {
    // compute cellCov (smoothstep coverage for this neighbor)
    const isNew = cellCov.greaterThan(accCov);
    accR = select(isNew, cellR, accR);
    accCov = max(cellCov, accCov);
  }
}
```
Each iteration builds a new static DAG node via `select`/`max` — no mutation, no `If`, no `Fn()` required.
**Rule:** NEVER call `If()` or `.toVar()` outside a `Fn()` shader function context. Build pure functional `select`/`max` DAGs at JS time instead.

### 🔴 [9.1] WebGPU export path: white/empty PNG + readback bounds error
**Date:** 2026-02-24
**Task:** Phase 9.1 — image export
**What went wrong:** Exported PNGs were completely white/empty. A follow-up attempt failed with `offset is out of bounds`.
**Why it happened:** Two issues combined:
1. Export initially used `canvas.toDataURL()` on a WebGPU canvas swapchain, which is not a reliable capture source for final frame contents.
2. WebGPU `readRenderTargetPixelsAsync()` can return row-padded buffers (`bytesPerRow` aligned to 256). Writing that raw buffer directly into `ImageData` overflowed expected RGBA size.
**The fix:** Replaced export with pipeline-driven offscreen readback: render pipeline output to an offscreen render target, read pixels with `readRenderTargetPixelsAsync()`, unpack row padding into tight RGBA, force alpha to 255, then encode PNG blob for download.
**Rule:** NEVER trust `canvas.toDataURL()` for WebGPU frame export. ALWAYS use offscreen render-target readback and handle padded row strides.

### 🟡 [6.4] Frame aspect ownership coupled to selected/front media
**Date:** 2026-02-24
**Task:** Canvas frame aspect stability while switching portrait/landscape media
**What went wrong:** Uploading/selecting a landscape media layer after a portrait source unexpectedly changed the canvas frame aspect; hiding layers could "restore" the prior aspect.
**Why it happened:** Aspect resolution used implicit selected/front media ownership instead of a dedicated frame policy, so selection/stack changes silently overrode frame size.
**The fix:** Added explicit frame-aspect modes (`auto-base`, `locked`, `custom`) in editor state. Auto mode now resolves from the bottom-most active media layer (stable base source), and sidebar controls own the behavior.
**Rule:** NEVER derive frame aspect from selected/top media layers implicitly — in auto mode, anchor to a stable base source and expose explicit frame-aspect modes.

### 🟢 [8.5] Properties sidebar actions clipped on narrow width
**Date:** 2026-02-24
**Task:** Frame controls in right properties panel
**What went wrong:** "From selected" and "Lock current" were cut off horizontally in narrow sidebar widths.
**Why it happened:** Actions shared a single inline row with the current aspect label and had no wrapping behavior.
**The fix:** Split the actions into a dedicated `flex-wrap` row under the current value line, so controls flow correctly at constrained widths.
**Rule:** ALWAYS design right-sidebar action rows to wrap on narrow widths; never assume inline labels plus multiple buttons will fit.

<!--
### 🟡 [2.1] WebGPURenderer failed to initialize on Firefox
**Date:** 2025-XX-XX  
**Task:** Setting up WebGPU renderer  
**What went wrong:** Firefox Nightly requires different adapter options. `navigator.gpu.requestAdapter()` returned null.  
**Why it happened:** Firefox's WebGPU implementation needs `powerPreference: 'high-performance'` explicitly.  
**The fix:** Added explicit adapter request with fallback options. Added browser detection to show specific instructions per browser.  
**Rule:** ALWAYS request adapter with explicit options and handle null return gracefully.
-->

---

## Patterns to Watch For

These are common pitfalls in this tech stack. Not mistakes yet, but things to be vigilant about:

### Three.js WebGPU / TSL
- TSL nodes are **declarative graphs**, not imperative code. You build a node tree, not a sequence of operations.
- `uniform()` creates a reference — update `.value`, don't recreate the uniform.
- Render targets must be explicitly disposed or they leak GPU memory.
- `WebGPURenderer` is async to initialize — `await renderer.init()` before first render.
- TSL imports come from `'three/tsl'`, NOT from `'three'` or `'three/webgpu'`.

### Next.js + Three.js
- Three.js must be client-only. Use `'use client'` directive and dynamic imports with `ssr: false`.
- `useEffect` for renderer init, not `useMemo` — needs DOM reference.
- Cleanup in `useEffect` return: dispose renderer, remove event listeners, cancel animation loop.

### Zustand
- `immer` middleware: don't return from the setter function, just mutate the draft.
- Subscriptions outside React: use `store.subscribe()`, not hooks.
- Shallow comparison for selectors that return objects: `useStore(store, selector, shallow)`.

### Performance
- Re-rendering the pipeline on every param change is fine (GPU is fast), but avoid re-**compiling** shaders on param changes.
- Debounce history snapshots for slider drags, NOT the actual uniform updates.
- Video textures: `needsUpdate` is set automatically by `VideoTexture`, don't set it manually per frame.

---

## Session Notes

> Quick notes from each work session. Not full mistake entries — just context for continuity.

### Session 2026-02-23 (continued)
- Fixed: media layers are now first-class `PassNode` passes (`MediaPass`) in the pipeline — previously only the bottommost media layer was shown via a `baseQuad` singleton, making stacking/reordering/blend-modes between media layers completely broken
- Fixed: `sync()` in Canvas.tsx no longer has a separate media-loading side path — all layers (media + shader) go through `syncLayers()`, which creates the correct pass type per `kind`
- Fixed: `l.visible` not checked in media layer selection — hidden layers were still driving the canvas
- Fixed: always-first-image bug — `ordered.find()` returned the bottommost (first-uploaded) media layer regardless of what was added later (compounded with the visibility bug)
- **KEY LESSON — MediaPass visibility of the bug:** The original `baseQuad` design was fine for a simple "one image + shader stack" demo but fundamentally wrong for a real compositor. The signal: any time you have a "special case" path for one layer type that lives outside the main render loop, it will fail when users try to use that layer type the same way as all others.
- **KEY LESSON — Y-flip in MediaPass:** Image/video textures have Y=0 at the bottom (standard image convention). Render-target textures have Y=0 at the TOP (WebGPU convention). `_inputNode` in PassNode applies the flip for RT-to-RT sampling. `MediaPass._buildEffectNode()` must use regular `uv()` (no flip) because it samples a fresh image, not an RT. Getting this wrong would cause media layers to appear upside-down.

### Session 2026-02-23
- Completed: Halftone enhancements — invert luma toggle + 3×3 dot overflow (neighbor cells)
- Completed: Phase 5.3 — custom HSV ColorPicker (Radix Popover, SL pad, hue bar, hex/RGB inputs, recent colors)
- Completed: Phase 5.4 — XY Pad for vec2 params (square pad + crosshair + handle + two SliderRow inputs + numeric readout)
- Completed: Phase 6.1 — Upload Flow (useMediaUpload hook, drag-drop canvas with counter pattern, empty state, drop overlay, loading overlay, Toolbar wired to hook)
- **KEY LESSON — TSL If/toVar outside Fn() crash:** `If()` and `.toVar()` are TSL control-flow constructs that only work *inside* a `Fn()` shader function context. Called outside one (e.g. in a PassNode constructor or `_buildEffectNode()`), they are null at JS build time → crash: "Cannot read properties of null (reading 'If')". Fix: build a pure functional DAG at JS time using a `for` loop + nested `select(isNew, newVal, accVal)` + `max(cov, accCov)` nodes — no mutation, no `If`, no `.toVar()`.
- **KEY LESSON — Drag-leave counter pattern:** React's synthetic `onDragLeave` fires when the cursor moves onto a *child element*, not just when leaving the outer div. Use a `dragCountRef` integer (increment on `dragenter`, decrement on `dragleave`, only clear overlay when counter reaches 0) to reliably detect a true drag-leave.
- Blocked on: nothing

### Session 2026-02-22
- Completed: Phase 4.2 Halftone shader — full TSL implementation with grid rotation, 4 dot shapes, 3 color modes, contrast, softness, dotMin
- Fixed: delete-media-layer bug — Canvas.tsx sync() wasn't calling `clearTexture()` when the media layer was removed, so the quad kept showing stale media
- Fixed: halftone source mode "random dots not everywhere" — root cause was zero dotRadius in dark areas AND bgColor ≈ dotColor for smooth images in source mode
- **KEY LESSON — Source mode halftone design:** In source mode the dot color comes from the cell-center sample. If the background is also sampled from the input texture (per-pixel), then on smooth images `dotColor ≈ bgColor` and the effect is invisible. Always use a solid background (white) so dots are always visible.
- **KEY LESSON — dotMin:** A minimum radius param is essential for halftone/dot effects. Without it, dark areas produce zero-radius dots (completely invisible), making the effect look sparse or "random."
- **KEY LESSON — vec4 return from _buildEffectNode:** Return `vec4(rgb, 1.0)` not `vec3`. The `buildBlendNode` accesses `.rgb` which works on vec4; returning vec3 is inconsistent with the pixelation pattern and causes edge-case type issues.
- Blocked on: nothing

### Session 2026-02-21
- Completed: Phase 2.6 (blend mode library — all 16 TSL blend modes, opacity uniform wired into PassNode + PipelineManager)
- Completed: Phase 3.1 (editor layout — three-column, GSAP sidebar animation, Toolbar/LayerPanel/PropertiesPanel stubs)
- Added: BlendModePreview component at /preview for visual testing of all blend modes
- **KEY LESSON — 🔴 ALWAYS CHECK CSS/LAYOUT FIRST:** Spent significant time deep-diving Three.js WebGPU binding internals (NodeSampledTexture, Bindings, generation tracking) convinced the renderer was broken. Root cause was a 1px canvas height — CSS issue. Before touching renderer code, verify the element has real dimensions in DevTools.
- **MediaTexture.ts change:** Moved texture node assignment from `setTexture()` (one-shot) to `tick()` (every frame, unconditionally) — mirrors PassNode pattern. Correct and intentional.
- **PassNode architecture for Phase 4:** `_buildEffectNode()` is protected and returns `_inputNode` (passthrough). Phase 4 subclasses override it to return the actual shader graph. The constructor calls it once; blend mode rebuilds reuse the cached `_effectNode`. Phase 4 subclasses should call `_rebuildColorNode()` after setting up their uniforms.
- In progress: Phase 3 (next: 3.2 Toolbar, 3.3 LayerPanel)
- Blocked on: nothing

<!--
### Session 2025-XX-XX
- Completed: Phase 0 (design tokens, Tailwind config, base components)
- In progress: Phase 1.1 (types)
- Blocked on: nothing
- Note: Inter font loads slowly on first visit — consider self-hosting
-->
