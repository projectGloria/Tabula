# Tabula — STATE

Local-first, offline, hand-drawn whiteboard. Build plan: `INITIAL_PLAN.md`.

## Milestones

| #   | Milestone                         | Status                              |
| --- | --------------------------------- | ----------------------------------- |
| 1   | Foundation & Guardrails           | **Done**: awaiting browser sign-off |
| 2   | Core Shapes & Transform Geometry  | Next                                |
| 3   | Hand-Drawn Renderer & Style Panel | —                                   |
| 4   | Editing Core & History            | —                                   |
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

## Locked invariants

- **World units**: 1 unit = 1 CSS px at 100% zoom. y points down. `angle` is in radians, clockwise, around the box center.
- **Element box**: `x`/`y` is the top-left of the _unrotated_ box. `width`/`height` are always ≥ 0, normalized on creation.
- **Camera** `{x, y, zoom}`: `x`/`y` is the world point at the screen's top-left. `screen = (world − cam) × zoom`. Zoom is clamped to 0.1–30.
- **Scene** is `{ entities: Record<ElementId, SceneElement>, order: ElementId[] }`, with order bottom → top.
- **Elements are immutable.** Every change goes through `mutateElement`, which bumps `revision`. M3 render caches key on `revision`.
- **AppState** `{scene, camera, viewport, selection, activeTool, background, debug}` is a single immutable store. Actions are pure `(state, …) → state` and return the _same_ object for no-ops.
- **Editor** owns the store and the `GridIndex`. The index is synced _before_ subscribers are notified.
- **`src/core` has no React** and no imports from `ui/` or `app/`. This is enforced by ESLint.
- **Keymap** matches `event.code` (physical keys). `Mod` is Ctrl on Windows/Linux and ⌘ on macOS. Shortcuts are skipped inside editable targets.
- **All UI strings** go through `t()` (`src/i18n`).
- **Dev-only commands** (`devOnly: true`) are filtered out of production bindings.

## Module map

```
src/core/model      types.ts, scene.ts (ops + createRectangle), style.ts, ids.ts
src/core/geometry   vec, box, rect (rotated corners/AABB, toRectLocal), element-bounds
src/core/spatial    SpatialIndex interface, GridIndex (256-unit cells, oversized list)
src/core/store      store.ts (createStore), app-state.ts, editor.ts (Editor: store + index + hitTest)
src/core/camera     camera.ts (screen↔world, zoomAt, panBy, wheelZoomFactor)
src/core/hit        hit-test.ts (hitTestElement, hitTopmost)
src/core/actions    actions.ts (pure transitions), commands.ts (COMMANDS registry)
src/core/keymap     keymap.ts (parse/match/format/conflicts), bindings.ts (DEFAULT_BINDINGS)
src/core/tools      tool.ts (Tool interface), select-tool, rectangle-tool, drag-rect
src/core/render     renderer.ts (dual canvas, rAF batching, culling, debug), draw-element, surface, fps-meter
src/core/{history,binding,snapping,io,persist}   empty; reserved for M4/M6/M7
src/i18n            en.ts (string table), t.ts
src/app             main.tsx (entry), create-app.ts (wires services), App.tsx
src/ui              Canvas.tsx (pointer/wheel/resize), Toolbar.tsx, icons.tsx, hooks/, styles.css
```

Entry point is `src/app/main.tsx` → `createApp()` → `<App services>`.

## Input (M1)

- Pointer Events on the overlay canvas, with pointer capture.
- Pan: middle-drag, Space+drag, or wheel (Shift+wheel pans horizontally).
- Zoom: Ctrl/⌘+wheel, anchored at the cursor.
- Shortcuts: V select, R rectangle, Esc cancels the gesture and clears the selection, Ctrl/⌘+Shift+D toggles debug (dev only).

## Known limitations / deferred

- Only rectangles exist. Switches over `el.type` carry an `eslint-disable` for the single-variant union; remove these in M2.
- No resize/rotate handles (M2), no marquee or undo (M4), no persistence (M7). Reload loses everything.
- Rendering is clean geometry; the sketch engine arrives in M3. The `roughness` and `seed` fields exist but are unused.
- Fonts are not bundled yet (M5). The UI uses the system font stack.
- Tool lock is in M8: the rectangle tool returns to Select after each shape.
- The debug overlay text is drawn in English via `t()` and is not RTL-aware.
- No Playwright E2E yet (M8).

## Commands

`npm run dev` · `npm run typecheck` · `npm test` · `npm run lint` · `npm run format` · `npm run build`

## Next: Milestone 2 starting point

1. Add `diamond`, `ellipse`, `line`, `arrow`, and `freedraw` to `SceneElement` in `core/model/types.ts`. Line, arrow and freedraw store `points` relative to `x`/`y`.
2. Per-type geometry: bounds and hit-testing in `core/hit`, and drawing in `render/draw-element.ts`. Then drop the single-variant `eslint-disable`s.
3. Transform handles: a `core/tools/transform` module for 8-handle resize (Shift keeps aspect, Alt resizes from the center) and rotation (15° snap with Shift), drawn by the overlay.
4. Freedraw: coalesced pointer events, smoothing, pressure.
