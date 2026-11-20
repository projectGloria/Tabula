# Build Prompt: Offline Hand-Drawn Whiteboard — V1 (Tabula)

> Copy everything below the line into a fresh AI coding session in an **empty folder**.
> Replace `Tabula` and `[FILE_EXT]` (e.g. `skch`) before starting.

---

## 1. Role, workflow, and session handoff

You are the lead engineer building **Tabula**, a local-first, offline-capable, hand-drawn-style whiteboard running in the browser. I am the operator: I run commands, verify visuals in the browser, and make product calls. You handle architecture, implementation, tests, and concise technical notes.

### Working rules
1. **Never start a milestone without my explicit "start" / "go".** Present the milestone plan first, then wait.
2. **One milestone at a time** (Section 8). At the end of each milestone:
   - Run `npm run typecheck`, `npm test`, and `npm run lint` until all pass with zero warnings.
   - Update `STATE.md` (see below).
   - Commit to git with a clear message.
   - Start the dev server and give me a short checklist of exact things to verify in the browser, then **stop and wait**.
3. **Before any destructive change** (deleting files, rewriting core modules, altering the saved file schema), explain the impact and ask.
4. **No fluff.** Short summaries, concrete trade-offs, direct answers. If any requirement here is ambiguous or flawed, flag it and propose an alternative instead of guessing.

### Cross-session state (`STATE.md`)
Because this project spans multiple coding sessions, maintain a concise `STATE.md` in the repo root (under 150 lines) and update it at every milestone boundary with:
- Completed milestones and current milestone status.
- Locked architectural invariants (coordinate systems, store shape, file schema version).
- Key module paths and public entry points.
- Known limitations, edge cases, or deferred V2 items.
- Exact starting point for the next milestone.

---

## 2. Independence, licensing, and dependencies

- **Clean-room implementation.** Do not copy, adapt, translate, or reference source code, internal schemas, icons, palettes, or UI copy from Excalidraw, tldraw, or other whiteboard apps. All code, data models, naming, and assets must be original.
- **Ownership:** 100% owned by me (my name only in `LICENSE`).
- **Runtime dependencies:** Default allowed runtime dependencies are `react` and `react-dom` only.
  - Prefer native browser APIs over libraries: `crypto.randomUUID()`, `CompressionStream` / `DecompressionStream`, `BroadcastChannel`, `EyeDropper`, `File System Access API`, and `Intl`.
  - **Exceptions:** For genuinely specialized geometry/rendering problems (specifically variable-width pressure stroke outlining or hand-drawn path generation), you may propose small, permissive (MIT/ISC/BSD/Apache-2.0) micro-libraries one by one in Section 9 with: package name, license, minified+gzipped size, and concrete reason. Every approved dependency goes into `THIRD_PARTY_NOTICES.md`.
- **Dev-only tooling** (Vite, TypeScript, Vitest, ESLint, Prettier, Playwright, and build-time Vite plugins) does not ship to users and is allowed.
- **Fonts:** Self-hosted SIL Open Font License (OFL) fonts stored in the repo (zero runtime CDNs). Propose 3 candidates in Section 9: one hand-drawn, one clean sans-serif, one monospace. Record licenses in `THIRD_PARTY_NOTICES.md`.
- **Icons:** Original, minimal 24px SVG line icons drawn in-repo. No third-party icon packs.

---

## 3. Scope

### In scope (V1)
A fast, reliable, single-user, offline-first hand-drawn whiteboard running strictly in the browser with local IndexedDB persistence, local file save/open, and PNG/SVG export.

### Out of scope — NEVER build (and leave NO hooks for)
- Real-time collaboration, multiplayer sync, CRDTs, tombstones, shareable links, cloud storage, backends, accounts, payments, telemetry, analytics, AI APIs, external runtime CDNs, or live third-party iframe embeds.

### Deferred to V2 — do NOT build in V1
- Orthogonal elbow auto-routing, frames & presentation mode, personal reusable component libraries, non-destructive image cropping, binary SVG font subsetting, text-to-diagram DSL / Mermaid / automatic graph layout, CSV-to-chart generation, and pixel-identical RTL/CJK canvas-to-textarea parity.

---

## 4. Tech stack

- **TypeScript** (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`), **React 18+**, **Vite**, **npm**.
- **Rendering:** HTML `<canvas>` 2D for the scene and interactive overlay; React for UI chrome only.
- **State:** Minimal custom store with `useSyncExternalStore` (no Redux/Zustand).
- **Testing & quality:** Vitest (unit), Playwright (E2E smoke), ESLint, Prettier.
- **PWA / Offline:** Web app manifest + hand-written service worker paired with a small build-time Vite plugin that injects the hashed asset list into the service worker precache manifest.

---

## 5. Architecture

Keep `src/core/` completely free of React or DOM UI component imports (standard browser APIs like `CanvasRenderingContext2D` are allowed only in `render/` and `io/`):

```text
src/
  core/
    model/        # element types, scene state, IDs
    geometry/     # points, vectors, AABBs, rotation, intersections, distance-to-shape
    spatial/      # spatial index (uniform grid or R-tree) for hit-testing, culling, snapping
    render/       # dual-canvas renderer, seeded sketch generator, path cache, debug overlay
    hit/          # point hit-testing, marquee box selection
    history/      # coalesced snapshot-diff undo/redo
    actions/      # pure, named state transitions
    tools/        # pointer-driven tool state machines
    binding/      # arrow-to-shape anchor binding, bound text containers
    snapping/     # grid snapping + object edge/center snapping
    keymap/       # single source of truth for shortcuts, help dialog, command palette
    io/           # .[FILE_EXT] schema + migrations, PNG/SVG export/import, clipboard
    persist/      # IndexedDB autosave, multi-drawing store, image blob store + GC, multi-tab lock
  ui/             # React toolbar, properties panel, menus, dialogs
  i18n/           # minimal t(key, params) helper + English string table
  app/            # composition root
```

### Key architectural invariants
- **Local-first element model:** Plain serializable JSON objects. Base fields: `id`, `type`, `x`, `y`, `width`, `height`, `angle`, `style`, `seed` (deterministic PRNG seed), `groupIds[]`, `locked`, `revision` (local render-cache invalidation integer, incremented on mutation).
- **Scene storage & z-order:** Store elements as `entities: Record<ElementId, SceneElement>` plus `order: ElementId[]` (bottom-to-top rendering order). Deletions remove elements cleanly from `entities` and `order`; undo/redo restores them via history diffs.
- **Spatial index:** Maintain a spatial index synced with scene mutations for viewport culling, pointer hit-testing, marquee selection, and nearby-object snapping.
- **Dual-canvas rendering:** Static scene `<canvas>` (re-rendered only when scene or camera changes) underneath a lightweight interactive overlay `<canvas>` (selection boxes, resize/rotate handles, snapping guides, live tool previews). Handle `devicePixelRatio` cleanly and batch draws via `requestAnimationFrame`.
- **Deterministic hand-drawn renderer:** Seeded PRNG drives stroke wobble and fill hatches across 3 roughness levels (`0` = clean, `1` = sketch, `2` = loose). Cache generated paths per element keyed by `(id, revision)`. Identical seed + geometry + style must produce byte-identical path coordinates.
- **Dev debug overlay:** Toggleable overlay (`Ctrl+Shift+D` in dev) showing FPS, total vs. visible element count, spatial bounds, element AABBs, handle hitboxes, and arrow binding anchors.
- **Unified input:** Pointer Events only (mouse, touch, pen). Pinch-zoom, two-finger pan, pen pressure for freedraw, optional pen-only mode (palm rejection).
- **Image blob lifecycle:** Deduplicate uploaded/pasted images by SHA-256 hash in an IndexedDB blob store. Run mark-and-sweep garbage collection on app startup against all saved drawings (never delete blobs referenced by the active session's undo/redo stack).
- **Performance targets:** 60 fps panning/zooming with 2,000 elements; a 10,000-element scene loads and renders first frame in under 2 seconds on a mid-range laptop.

---

## 6. V1 feature specification

### 6.1 Tools (toolbar + shortcuts via central keymap)
- Select (`V`), Hand / Pan (`H`, plus `Space`-drag and middle-mouse drag)
- Rectangle (`R`), Diamond (`D`), Ellipse (`O`)
- Line (`L`), Arrow (`A`) — drag for 2-point, click-click for multi-point polyline
- Freedraw (`P`) — smoothed variable-width strokes with pressure sensitivity (simulated velocity pressure for mouse)
- Text (`T`)
- Image — insert via file picker, clipboard paste, or drag-and-drop
- Eraser (`E`) — drag across elements with faded preview, delete on pointer up
- **Tool lock (`Q`):** keep active tool selected after finishing a shape
- Modifiers while drawing: `Shift` constrains proportions / 15° line snapping; `Alt` draws from center.

### 6.2 Style properties
- Stroke color & fill color: curated palette + custom hex input + recent colors + native `EyeDropper` where supported.
- Fill style: `none`, `solid`, `hatch`, `cross-hatch`.
- Stroke width: thin / medium / bold / extra.
- Stroke pattern: solid / dashed / dotted.
- Roughness: `0` (clean), `1` (sketch), `2` (loose).
- Corners: sharp / rounded (rectangles & diamonds).
- Opacity: 0–100%.
- Arrowheads (start & end): none, open arrow, solid triangle, bar, dot, diamond.
- Arrow path style: straight or curved (quadratic/cubic control point).
- Text styles: 3 bundled fonts (hand, sans, mono), size presets + custom px, horizontal alignment, vertical alignment (for container-bound text).
- Layer order: send to back, send backward, bring forward, bring to front.
- Remember last-used style per tool category.

### 6.3 Editing & transformations
- Selection: click, `Shift`-click toggle, marquee box select, select all (`Ctrl+A`), double-click or `Ctrl`-click to deep-select inside groups.
- Move: pointer drag or arrow keys (`Shift` = larger step).
- Resize: 8 handles (`Shift` preserves aspect ratio, `Alt` scales from center); multi-selection scales proportionally; resizing a text box scales font size or wraps width cleanly depending on handle (corner scales, side wraps).
- Rotate: rotation handle (`Shift` snaps to 15°); multi-selection rotates around shared center.
- Flip horizontal (`Shift+H`) / vertical (`Shift+V`).
- Duplicate (`Ctrl+D` and `Alt`-drag), delete, cut/copy/paste (system clipboard, cross-tab), paste in place.
- Nested group / ungroup (`Ctrl+G` / `Ctrl+Shift+G`).
- Align (left, center, right, top, middle, bottom) and distribute (horizontal, vertical).
- Lock / unlock elements (locked elements ignore pointer selection; unlock via context menu or "Unlock all").
- **Vertex editor** for lines and arrows: double-click (or `Ctrl+Enter`) to add, move, or delete intermediate points and adjust curve control points.
- Context menu (right-click / long-press) for canvas and selection.
- Coalesced undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`): continuous drag/resize/rotate gestures collapse into one history entry.

### 6.4 Text & labels
- Click with Text tool for free-growing text; drag for fixed-width wrapped text box.
- Double-click any closed shape (rectangle, diamond, ellipse) to create/edit **bound text** centered inside it; container expands automatically if text overflows.
- Double-click an arrow to attach a **bound label** anchored to its midpoint.
- Edit via a positioned `<textarea>` overlay synchronized with canvas font, size, line-height, zoom, and rotation. Standard multi-line and Unicode/emoji support via browser text layout.

### 6.5 Arrow binding & snapping
- **Binding:** Dragging an arrow endpoint near a shape highlights the target shape and binds the endpoint with a small visual gap. Moving or resizing the shape dynamically updates bound arrows. Hold `Ctrl` while dragging to suppress binding.
- **Grid:** Toggleable dot/line grid (`Ctrl+'`), configurable spacing, snap-to-grid toggle.
- **Object snapping (`Alt+S`):** Snap dragged/resized elements to nearby element edges and centers (queried via spatial index) with crisp guide lines.

### 6.6 Canvas UX & navigation
- Infinite canvas; zoom 10%–3000% (`Ctrl+wheel`, pinch, `Ctrl +/-`, zoom-to-cursor); pan via wheel/trackpad/Hand tool.
- Zoom to fit all (`Shift+1`), zoom to selection (`Shift+2`), reset to 100% (`Ctrl+0`).
- "Back to content" button when viewport drifts away from all elements.
- Dark mode (UI + perceptual color inversion on canvas, leaving raster images uninverted), defaulting to system preference.
- Canvas background color picker.
- Zen mode (`Alt+Z`, hide panels) and View mode (`Alt+R`, read-only pan/zoom).
- Command palette (`Ctrl+/`) and Keyboard shortcuts dialog (`?`) — both auto-generated from the central keymap.

### 6.7 Persistence, files & export/import
- **Autosave:** Debounced save of active drawing to IndexedDB; instant restore on reload.
- **Multiple drawings:** Local "My Drawings" modal (stored in IndexedDB) with generated thumbnails, create, rename, duplicate, and delete.
- **Disk files:** Versioned `.[FILE_EXT]` JSON format with schema migration runner. Use File System Access API (`Ctrl+S` saves back to opened handle) with download/file-input fallback. Drag-and-drop `.[FILE_EXT]` or image files onto the canvas.
- **Multi-tab safety:** Use `BroadcastChannel` to detect if the same drawing ID is open in another tab and display a clear warning banner instead of silently clobbering saves. Handle IndexedDB quota errors gracefully.
- **PNG export:** Selection or full scene; toggles for background, dark mode, scale (`1x`/`2x`/`3x`), padding; optional embedded scene payload inside a custom PNG chunk compressed via native `CompressionStream`.
- **SVG export:** Matching options; embedded scene payload in `<metadata>`; embed self-hosted font `@font-face` data URIs optionally (full font toggle, no binary subsetting) with clean fallback fonts.
- **Clipboard & re-import:** Copy selection/scene as PNG or SVG; paste plain text (creates text element) or raster images; opening/dropping a PNG or SVG previously exported with embedded scene data restores the editable scene.

### 6.8 Accessibility, responsive UI & PWA
- Full keyboard navigation for all UI chrome, visible focus rings, ARIA labels, `prefers-reduced-motion` and `prefers-color-scheme` support.
- Shortcuts must never fire while focus is inside `<input>`, `<textarea>`, or `[contenteditable]`.
- Responsive desktop + tablet/mobile layout (bottom toolbar, collapsible inspector).
- Installable offline PWA with an "Update available — Reload" toast when a new service worker activates.

---

## 7. Quality bar

- Zero `any` in `src/core/`.
- Unit tests (Vitest) covering: geometry math, spatial index queries, hit-testing, sketch renderer determinism, history coalescing, every core action, arrow binding updates, snapping, and file format migrations.
- Playwright E2E smoke tests: draw core shapes, undo/redo, reload persistence, export & re-import PNG with embedded scene.
- Zero console errors or React warnings during normal interaction.
- Keep `README.md` concise and accurate (setup, commands, architecture overview).

---

## 8. Milestones (build strictly in order; stop after each)

1. **Foundation & Guardrails** — Vite + strict TS + Vitest + ESLint + Prettier + Git; folder scaffold; `STATE.md`; scene model (`entities` + `order`); custom store (`useSyncExternalStore`); central keymap registry; `t()` i18n wrapper; spatial index implementation; DPR-aware dual-canvas with pan/zoom; rectangle tool; click select & drag move; dev debug overlay (FPS, counts, AABBs).
2. **Core Shapes & Transform Geometry** — Diamond, ellipse, line, straight arrow, freedraw (pointer events + smoothing/pressure); 8-handle resize (`Shift`/`Alt`), rotation handle (15° snap); spatial-index hit-testing; clean geometric renderer (no wobble yet) so all transform math and hitboxes are rock-solid first.
3. **Hand-Drawn Renderer & Style Panel** — Deterministic seeded sketch engine (`roughness` 0/1/2, fills: none/solid/hatch/cross-hatch), revision-keyed path caching, arrowheads, stroke patterns/corners/opacity, properties inspector panel, color palette + hex + recent + eyedropper, per-tool style memory.
4. **Editing Core & History** — Coalesced snapshot-diff undo/redo, multi-select, marquee box select, nested group/ungroup, duplicate/`Alt`-drag, delete, copy/paste (cross-tab clipboard), z-order actions, align/distribute, flip H/V, lock/unlock, arrow-key nudging, context menu.
5. **Text & Bound Labels** — Bundled OFL fonts, free & fixed-width text, canvas line-wrapping, synced `<textarea>` edit overlay (zoom + rotation aware), double-click shape bound text (with container auto-grow), arrow midpoint labels, text style controls.
6. **Arrow Binding & Snapping** — Arrow-to-shape anchor binding with target highlights and dynamic updates (`Ctrl` to bypass), curved arrows + vertex editor (add/move/delete points, adjust curve), grid rendering + snap-to-grid, spatial-index object edge/center snapping with guide lines.
7. **Persistence, Files & Export/Import** — IndexedDB debounced autosave, multi-drawing manager + thumbnails, versioned `.[FILE_EXT]` schema + migrations, File System Access API save/open + fallback, `BroadcastChannel` multi-tab warning, hash-deduplicated image blobs + startup GC, image tool (picker/paste/drop), PNG & SVG export with `CompressionStream` embedded scene + re-import, export preview dialog, clipboard PNG/SVG copy.
8. **UX Polish, Accessibility & Offline PWA** — Hand tool, eraser tool, tool lock, dark mode (color inversion excluding images), zen/view modes, zoom-to-fit/selection/reset, back-to-content button, auto-generated command palette & shortcuts modal, responsive mobile/tablet layout + pen-only palm rejection, ARIA/focus pass, PWA manifest + Vite precache manifest plugin + service worker, Playwright E2E suite, 2k/10k performance verification, final `README.md`.

---

## 9. First step

Do **not** write any code or create files yet. Reply with:
1. Any technical risks, edge cases, or suggested refinements to this V1 spec.
2. Your 3 proposed self-hosted OFL fonts (hand, sans, mono) and any micro-library exception you want to request (if none, explain how you'll handle pressure strokes and sketch fills cleanly).
3. Your concrete plan for **Milestone 1** (files to create, key data types, tests you'll write, and any decisions I need to make).

Then stop and wait for my **"go"**.