# Tabula — STATE

Local-first, offline, hand-drawn whiteboard. Build plan: `INITIAL_PLAN.md`.

## Milestones

| #   | Milestone                         | Status                              |
| --- | --------------------------------- | ----------------------------------- |
| 1   | Foundation & Guardrails           | Done                                |
| 2   | Core Shapes & Transform Geometry  | Done                                |
| 3   | Hand-Drawn Renderer & Style Panel | Done                                |
| 4   | Editing Core & History            | **Done**: awaiting browser sign-off |
| 5   | Text & Bound Labels               | —                                   |
| 6   | Arrow Binding & Snapping          | —                                   |
| 7   | Persistence, Files & Export       | — (planned split: 7a / 7b)          |
| 8   | UX Polish, A11y & Offline PWA     | —                                   |

## Decisions

- File extension `.tabula`. Schema version: TBD in M7.
- LICENSE: proprietary, "Copyright (c) 2026 Project Gloria. All rights reserved." Confirmed by the user on 2026-11-21.
- Fonts approved (OFL, self-hosted; bundled in M5): Patrick Hand, Inter, JetBrains Mono.
- Unfilled shapes hit only near their outline; filled shapes hit anywhere inside.
- Runtime deps: `react` and `react-dom` only.
- Web Locks API and the M7 split were proposed and assumed approved (not explicitly confirmed).
- M2 (flagged, not yet confirmed): multi-selection resize is always aspect-locked, so rotated members stay undistorted. Pencil is sticky and does not select its stroke. A 2-point line or arrow shows endpoint handles only. Escape keeps a polyline that has ≥ 2 points. The arrow default is no start head and an `arrow` end head. All 6 head types render.
- M3 (flagged, not yet confirmed): style memory is per category (rect/diamond/ellipse share one; line/arrow share one; pencil has its own; arrowheads are separate). Editing the selection also updates its category's memory. Locked elements are skipped. Only custom (non-palette) colors go into Recent, which is session-only until M7. Roughness and pattern do not apply to pencil strokes. The hatch color is the fill color, so the default white fill makes a hatch invisible until a fill color is picked.

- M4 (flagged, not yet confirmed): Ctrl/⌘+D duplicates (offset 10). Alt+drag duplicates. A click selects the outermost group; double-click enters it (focus group, dashed frame). Ctrl/⌘+click picks a single member. The marquee selects only fully enclosed, unlocked elements. Clipboard is JSON `text/plain` with kind `tabula/clipboard`; paste goes to the pointer, Ctrl/⌘+Shift+V pastes in place. Locked elements cannot be selected by click or marquee and are skipped by every edit; "Unlock all" is in the canvas menu. History keeps scene changes only (selection is restored with them), max 200 entries, keyed edits coalesce within 1 s.

## Locked invariants

- **World units**: 1 unit = 1 CSS px at 100% zoom. y points down. `angle` is in radians, clockwise, around the box center.
- **Element box**: `x`/`y` is the top-left of the _unrotated_ box. `width`/`height` are always ≥ 0, normalized on creation.
- **Points elements** (line, arrow, freedraw): `points` are local to `x`/`y` and normalized so their bbox starts at (0,0) and spans `width × height`. Rotation is applied about the box center. Rebuild from world points with `pointsPatchFromWorld(angle, pts)`.
- **Geometry edits** go through `GeometryPatch` / `applyGeometry` / `setElementGeometry`. Cancel uses `restoreElements`, which bumps `revision` past the current one.
- **Camera** `{x, y, zoom}`: `x`/`y` is the world point at the screen's top-left. `screen = (world − cam) × zoom`. Zoom is clamped to 0.1–30.
- **Scene** is `{ entities: Record<ElementId, SceneElement>, order: ElementId[] }`, with order bottom → top.
- **Elements are immutable.** Every change goes through `mutateElement`, which bumps `revision`.
- **Sketches** are pure functions of `(seed, type, size, points/heads, style)` in the element's local frame. Random streams are split per purpose (outline / fill / hatch / heads), so changing the fill never changes the outline. `SketchCache` keys on `(id, revision)` and reuses the drawable when only `x`/`y`/`angle` changed.
- **Hit-testing stays on clean geometry.** Bounds are padded by `sketchPadding` for wobble.
- **AppState** `{scene, camera, viewport, selection, activeTool, background, debug}` is a single immutable store. Actions are pure `(state, …) → state` and return the _same_ object for no-ops.
- **Editor** owns the store and the `GridIndex`. The index is synced _before_ subscribers are notified.
- **`src/core` has no React** and no imports from `ui/` or `app/`. This is enforced by ESLint.
- **Keymap** matches `event.code` (physical keys). `Mod` is Ctrl on Windows/Linux and ⌘ on macOS. Shortcuts are skipped inside editable targets.
- **All UI strings** go through `t()` (`src/i18n`).
- **History**: `Editor.update` records scene changes. `begin`/`end` collapse a gesture into one entry; `{history: 'skip'}` leaves a change out; any other string key coalesces. Tools wrap gestures in transactions.
- **Groups**: `groupIds` are innermost first. Selection target = outermost group, or the next group inside `focusGroup`.
- **Dev-only commands** (`devOnly: true`) are filtered out of production bindings.

## Module map

```
src/core/model      types.ts, scene.ts (ops, create*, applyGeometry), style.ts, ids.ts
src/core/geometry   vec, box, rect, segment, ellipse, angle (15° snap), element-geometry
                    (local↔world, pointsPatchFromWorld), element-shape (head size, radii,
                    freedraw outline cache), stroke-outline, element-bounds, transform
                    (computeResize, resizeElement[InGroup], rotation)
src/core/spatial    SpatialIndex interface, GridIndex (256-unit cells, oversized list)
src/core/store      store.ts (createStore), app-state.ts, editor.ts (Editor: store + index + hitTest)
src/core/camera     camera.ts (screen↔world, zoomAt, panBy, wheelZoomFactor)
src/core/hit        hit-test.ts (per-type hitTestElement, hitTopmost), handles.ts (frame, handle
                    layout/picking, resize cursors)
src/core/actions    actions.ts (pure transitions), commands.ts (COMMANDS registry), style-actions.ts
                    (getStyleView with 'mixed', applyStyle → selection + memory, recent colors)
src/core/keymap     keymap.ts (parse/match/format/conflicts), bindings.ts (DEFAULT_BINDINGS)
src/core/tools      tool.ts, select-tool (move/resize/rotate/endpoint), box-shape-tool
                    (rect/diamond/ellipse), linear-tool, freedraw-tool, constrain, drag-rect
src/core/render     renderer.ts (dual canvas, rAF batching, culling, debug), draw-element (paintElement:
                    Path2D per layer), surface, fps-meter
src/core/render/sketch  rng (xorshift32, rngFor streams), path (PathCmd, builders, itemAt), strokes
                    (segment/polyline/loop wobble), hatch, arrowheads, generate (Drawable layers), cache
src/core/model      palette.ts (stroke/fill palettes, normalizeHex)
src/core/history    history.ts (stack, coalescing, transactions)
src/core/io         validate.ts (sanitizeElement/Style: untrusted input), clipboard.ts
src/core/actions    edit-actions.ts (select all, delete, duplicate, group, z-order, align, flip,
                    lock, nudge); model/groups.ts (expandToGroups, selectionTargetGroup)
src/core/{binding,snapping,persist}   empty; reserved for M6/M7
src/i18n            en.ts (string table), t.ts
src/app             main.tsx (entry), create-app.ts (wires services), App.tsx
src/ui              Canvas.tsx (pointer/wheel/resize), Toolbar.tsx, StylePanel.tsx, icons.tsx,
                    style-icons.tsx, ArrangeSection.tsx, ContextMenu.tsx, hooks/ (useClipboard),
                    styles.css
```

Entry point is `src/app/main.tsx` → `createApp()` → `<App services>`.

## Input

- Pointer Events on the overlay canvas, with pointer capture.
- Pan: middle-drag, Space+drag, or wheel (Shift+wheel pans horizontally).
- Zoom: Ctrl/⌘+wheel, anchored at the cursor.
- Shortcuts: V select, R rectangle, D diamond, O ellipse, A arrow, L line, P pencil, Enter finishes a polyline, Esc cancels the gesture and clears the selection, Ctrl/⌘+Shift+D toggles debug (dev only).
- Line/arrow: drag draws 2 points. A click starts a polyline: each click adds a point; clicking the last point again (8 px), Enter or Esc finishes. Shift snaps the segment to 15°.
- Pencil: coalesced events, streamline 0.5. Real pen pressure; mouse and touch get velocity-simulated pressure.
- Handles: 8 resize handles (Shift keeps aspect, Alt resizes from the center; edge handles are hidden under 24 px) and a rotate handle (Shift snaps to 15°).

## Known limitations / deferred

- No persistence (M7). Reload loses everything.
- The multi-selection frame is an axis-aligned union box recomputed every frame, so it changes size during group rotation.
- Lines have no mid-point or point-insert editing; only 2-point lines get endpoint handles. Curved and elbow arrows are out of scope (straight only).
- At opacity below 100% a solid fill and its outline overlap and the overlap looks slightly darker (layers are composited separately).
- The eyedropper uses the browser EyeDropper API (Chromium only) and is hidden elsewhere.
- The style panel has no keyboard shortcuts yet (M8).
- Fonts are not bundled yet (M5). The UI uses the system font stack.
- Tool lock is in M8: shape and line tools return to Select after each shape (the pencil stays active).
- The debug overlay text is drawn in English via `t()` and is not RTL-aware.
- No Playwright E2E yet (M8).

## Commands

`npm run dev` · `npm run typecheck` · `npm test` · `npm run lint` · `npm run format` · `npm run build`

## Next: Milestone 5 starting point

1. Text element (`text` type) with a textarea overlay editor, auto-size, alignment, font family/size.
2. Bound labels on shapes and arrows; add `text` to `validate`.
3. Fonts via `@font-face` with fallback stacks (font files pending download approval).
