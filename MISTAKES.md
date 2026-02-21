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

_No sessions yet._

<!--
### Session 2025-XX-XX
- Completed: Phase 0 (design tokens, Tailwind config, base components)
- In progress: Phase 1.1 (types)
- Blocked on: nothing
- Note: Inter font loads slowly on first visit — consider self-hosting
-->