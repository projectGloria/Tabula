import { clampZoom, MAX_ZOOM, MIN_ZOOM, visibleWorldBox, zoomAt } from '../camera/camera';
import { boxHeight, boxIntersects, boxUnion, boxWidth, type Box } from '../geometry/box';
import { elementBounds } from '../geometry/element-bounds';
import type { Point } from '../geometry/vec';
import type { ElementId } from '../model/types';
import {
  EMPTY_OVERLAY,
  EMPTY_SELECTION,
  selectedIds,
  type AppState,
  type GridStyle,
  type Theme,
} from '../store/app-state';

export function toggleGrid(s: AppState): AppState {
  return { ...s, gridVisible: !s.gridVisible };
}

export function toggleGridSnap(s: AppState): AppState {
  return { ...s, gridSnap: !s.gridSnap };
}

export function toggleObjectSnap(s: AppState): AppState {
  return { ...s, objectSnap: !s.objectSnap };
}

export function setGridSize(s: AppState, size: number): AppState {
  const v = Math.max(2, Math.min(200, Math.round(size)));
  return s.gridSize === v ? s : { ...s, gridSize: v };
}

export function setGridStyle(s: AppState, style: GridStyle): AppState {
  return s.gridStyle === style ? s : { ...s, gridStyle: style };
}

// ---------------------------------------------------------------------------
// Modes

export function toggleToolLock(s: AppState): AppState {
  return { ...s, toolLocked: !s.toolLocked };
}

export function toggleZen(s: AppState): AppState {
  return { ...s, zenMode: !s.zenMode };
}

export function setTheme(s: AppState, theme: Theme): AppState {
  return s.theme === theme ? s : { ...s, theme };
}

/** View mode: read-only; the hand tool pans and nothing can be selected. */
export function setViewMode(s: AppState, on: boolean): AppState {
  if (s.viewMode === on) return s;
  if (!on) return { ...s, viewMode: false, activeTool: 'select' };
  return {
    ...s,
    viewMode: true,
    activeTool: 'hand',
    selection: EMPTY_SELECTION,
    linearEdit: null,
    overlay: EMPTY_OVERLAY,
  };
}

// ---------------------------------------------------------------------------
// Zoom

/** Zoom steps used by the buttons and Mod+=/Mod+-. */
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 30];

const viewportCenter = (s: AppState): Point => ({
  x: s.viewport.width / 2,
  y: s.viewport.height / 2,
});

function zoomTo(s: AppState, zoom: number): AppState {
  const camera = zoomAt(s.camera, viewportCenter(s), zoom);
  return camera === s.camera ? s : { ...s, camera };
}

export function zoomIn(s: AppState): AppState {
  const next = ZOOM_STEPS.find((z) => z > s.camera.zoom + 1e-6) ?? MAX_ZOOM;
  return zoomTo(s, next);
}

export function zoomOut(s: AppState): AppState {
  const next = [...ZOOM_STEPS].reverse().find((z) => z < s.camera.zoom - 1e-6) ?? MIN_ZOOM;
  return zoomTo(s, next);
}

export function zoomReset(s: AppState): AppState {
  return zoomTo(s, 1);
}

/** Screen padding around fitted content. */
export const FIT_PADDING = 48;
/** Fit-to-content never magnifies past 100%; zoom-to-selection stops at 300%. */
export const FIT_ALL_MAX_ZOOM = 1;
export const FIT_SELECTION_MAX_ZOOM = 3;

/** Centers `box` in the viewport at the largest zoom that fits (capped). */
export function fitBox(s: AppState, box: Box, maxZoom: number): AppState {
  const { width, height } = s.viewport;
  if (width <= 0 || height <= 0) return s;
  const bw = Math.max(boxWidth(box), 1);
  const bh = Math.max(boxHeight(box), 1);
  const availW = Math.max(width - FIT_PADDING * 2, 1);
  const availH = Math.max(height - FIT_PADDING * 2, 1);
  const zoom = clampZoom(Math.min(availW / bw, availH / bh, maxZoom));
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return { ...s, camera: { x: cx - width / 2 / zoom, y: cy - height / 2 / zoom, zoom } };
}

function boundsOf(s: AppState, ids: Iterable<ElementId>): Box | null {
  let box: Box | null = null;
  for (const id of ids) {
    const el = s.scene.entities[id];
    if (!el) continue;
    const b = elementBounds(el);
    box = box ? boxUnion(box, b) : b;
  }
  return box;
}

export function zoomToFit(s: AppState): AppState {
  const box = boundsOf(s, s.scene.order);
  return box ? fitBox(s, box, FIT_ALL_MAX_ZOOM) : zoomReset(s);
}

export function zoomToSelection(s: AppState): AppState {
  const box = boundsOf(s, selectedIds(s));
  return box ? fitBox(s, box, FIT_SELECTION_MAX_ZOOM) : s;
}

/** True when the scene has content but none of it is on screen. */
export function contentOffscreen(s: AppState): boolean {
  if (s.scene.order.length === 0 || s.viewport.width <= 0) return false;
  const visible = visibleWorldBox(s.camera, s.viewport);
  for (const id of s.scene.order) {
    const el = s.scene.entities[id];
    if (el && boxIntersects(elementBounds(el), visible)) return false;
  }
  return true;
}

/** Pans to the content at the current zoom when it fits, else fits it. */
export function scrollToContent(s: AppState): AppState {
  const box = boundsOf(s, s.scene.order);
  if (!box) return s;
  return fitBox(s, box, s.camera.zoom);
}
