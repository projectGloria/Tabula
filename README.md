# Tabula

A local-first, offline, hand-drawn whiteboard that runs in the browser. Nothing is sent anywhere: drawings live in your browser (IndexedDB) and in `.tabula` files you save yourself.

## Features

- Rectangles, diamonds, ellipses, lines, arrows (bindable, curved), pencil, text, images.
- Hand-drawn rendering with stroke, fill, hatch, roughness and opacity styles.
- Groups, align, z-order, lock, duplicate, copy/paste, undo/redo.
- Grid and object snapping; point editor for lines and arrows.
- Autosave, multiple drawings, open/save `.tabula` files, PNG/SVG export with the scene embedded.
- Dark theme, zen and view modes, command palette (Ctrl/⌘+/), shortcuts list (?).
- Touch: pinch to zoom, palm rejection once a pen is used. Works on narrow screens.
- Installable and fully offline after the first visit (production build).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test
npm run lint
npm run build      # dist/, includes the offline service worker
npm run preview    # serve the production build
```

Architecture notes and decisions: `STATE.md`. Plan: `INITIAL_PLAN.md`.

## License

Proprietary. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
