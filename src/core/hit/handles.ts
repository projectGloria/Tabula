import { screenToWorld, worldToScreen } from '../camera/camera';
import { boxUnion, type Box } from '../geometry/box';
import { localToWorld } from '../geometry/element-geometry';
import { rectAABB, rectCenter, toRectLocal, type RectLike } from '../geometry/rect';
import { RESIZE_HANDLE_DIRS, type ResizeHandle } from '../geometry/transform';
import { distance, rotateAround, type Point } from '../geometry/vec';
import type { SceneElement } from '../model/types';
import { selectedIds, type AppState } from '../store/app-state';

/** Side of a square resize handle, in screen px. */
export const HANDLE_SIZE_PX = 8;
/** Extra pick radius around each handle, in screen px. */
export const HANDLE_HIT_SLOP_PX = 4;
/** Distance from the frame's top edge to the rotation handle, in screen px. */
export const ROTATE_HANDLE_OFFSET_PX = 24;
/** Below this frame size (screen px) the edge handles on that axis are hidden. */
export const MIN_EDGE_HANDLE_SPAN_PX = 24;
/** Gap between an element and its selection outline, in screen px. */
export const SELECTION_PAD_PX = 4;

export type HandleKind =
  | { readonly type: 'resize'; readonly handle: ResizeHandle }
  | { readonly type: 'rotate' }
  | { readonly type: 'endpoint'; readonly index: number };

export interface SelectionHandle {
  readonly kind: HandleKind;
  /** World position of the handle's grab point on the *unpadded* frame. */
  readonly anchor: Point;
  /** World position where the handle is drawn (padded frame). */
  readonly center: Point;
}

export interface SelectionFrame {
  /** Transformable (unlocked) selected elements, bottom → top. */
  readonly elements: readonly SceneElement[];
  /** Exact frame: the single element's box, or the union AABB for multi-selection. */
  readonly rect: RectLike;
  /** Single unlocked element selected. */
  readonly single: SceneElement | null;
}

export function getSelectionFrame(state: AppState): SelectionFrame | null {
  const elements: SceneElement[] = [];
  for (const id of selectedIds(state)) {
    const el = state.scene.entities[id];
    if (el && !el.locked) elements.push(el);
  }
  const first = elements[0];
  if (!first) return null;
  if (elements.length === 1) {
    const { x, y, width, height, angle } = first;
    return { elements, rect: { x, y, width, height, angle }, single: first };
  }
  let box: Box = rectAABB(first);
  for (const el of elements) box = boxUnion(box, rectAABB(el));
  return {
    elements,
    rect: {
      x: box.minX,
      y: box.minY,
      width: box.maxX - box.minX,
      height: box.maxY - box.minY,
      angle: 0,
    },
    single: null,
  };
}

/** True for a single selected 2-point line or arrow, which shows endpoint handles only. */
export function usesEndpointHandles(el: SceneElement | null): boolean {
  return el !== null && (el.type === 'line' || el.type === 'arrow') && el.points.length === 2;
}

const HANDLE_ORDER: readonly ResizeHandle[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'];

/** Handles for the current selection in hit-priority order (rotate, corners, edges). */
export function getSelectionHandles(
  state: AppState,
  frame = getSelectionFrame(state),
): SelectionHandle[] {
  if (!frame) return [];
  const zoom = state.camera.zoom;
  const single = frame.single;

  if (
    single &&
    usesEndpointHandles(single) &&
    (single.type === 'line' || single.type === 'arrow')
  ) {
    return single.points.map((p, index) => {
      const w = localToWorld(single, p);
      return { kind: { type: 'endpoint', index }, anchor: w, center: w };
    });
  }

  const r = frame.rect;
  const pad = SELECTION_PAD_PX / zoom;
  const c = rectCenter(r);
  const place = (
    lx: number,
    ly: number,
    padX: number,
    padY: number,
  ): { anchor: Point; center: Point } => {
    const anchor = rotateAround({ x: r.x + lx, y: r.y + ly }, c, r.angle);
    const center = rotateAround({ x: r.x + lx + padX, y: r.y + ly + padY }, c, r.angle);
    return { anchor, center };
  };

  const out: SelectionHandle[] = [];
  const top = place(r.width / 2, 0, 0, -pad - ROTATE_HANDLE_OFFSET_PX / zoom);
  out.push({ kind: { type: 'rotate' }, anchor: top.center, center: top.center });

  const showX = r.width * zoom >= MIN_EDGE_HANDLE_SPAN_PX;
  const showY = r.height * zoom >= MIN_EDGE_HANDLE_SPAN_PX;
  for (const h of HANDLE_ORDER) {
    const d = RESIZE_HANDLE_DIRS[h];
    if (d.x === 0 && !showX) continue;
    if (d.y === 0 && !showY) continue;
    const lx = ((d.x + 1) / 2) * r.width;
    const ly = ((d.y + 1) / 2) * r.height;
    out.push({ kind: { type: 'resize', handle: h }, ...place(lx, ly, d.x * pad, d.y * pad) });
  }
  return out;
}

/** Handle under a screen point, if any. */
export function hitHandle(
  state: AppState,
  screen: Point,
  handles = getSelectionHandles(state),
): SelectionHandle | undefined {
  const reach = HANDLE_SIZE_PX / 2 + HANDLE_HIT_SLOP_PX;
  let best: SelectionHandle | undefined;
  let bestD = Infinity;
  for (const h of handles) {
    const d = distance(worldToScreen(state.camera, h.center), screen);
    // Strictly-less keeps the earlier (higher-priority) handle on ties.
    if (d <= reach && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** True when a screen point is inside the padded selection frame. */
export function insideSelectionFrame(
  state: AppState,
  screen: Point,
  frame = getSelectionFrame(state),
): boolean {
  if (!frame || usesEndpointHandles(frame.single)) return false;
  const local = toRectLocal(frame.rect, screenToWorld(state.camera, screen));
  const pad = SELECTION_PAD_PX / state.camera.zoom;
  return (
    local.x >= -pad &&
    local.y >= -pad &&
    local.x <= frame.rect.width + pad &&
    local.y <= frame.rect.height + pad
  );
}

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

/** CSS cursor for a resize handle on a frame rotated by `angle`. */
export function resizeCursor(handle: ResizeHandle, angle: number): string {
  const d = RESIZE_HANDLE_DIRS[handle];
  const a = Math.atan2(d.y, d.x) + angle;
  const step = Math.round(a / (Math.PI / 4));
  const i = ((step % 4) + 4) % 4;
  return RESIZE_CURSORS[i] ?? 'move';
}
