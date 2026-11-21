import { screenToWorld, worldToScreen } from '../camera/camera';
import { boxUnion, type Box } from '../geometry/box';
import { localToWorld } from '../geometry/element-geometry';
import { catmullRomSegments } from '../geometry/linear-path';
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
  /** A line/arrow point (any point in the point editor, else an end). */
  | { readonly type: 'endpoint'; readonly index: number }
  /** Midpoint of segment `index → index + 1`; dragging it inserts a point. */
  | { readonly type: 'midpoint'; readonly index: number };

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

/**
 * True when the single selection shows point handles instead of a box: a
 * 2-point line or arrow, or the line/arrow open in the point editor.
 */
export function usesEndpointHandles(el: SceneElement | null, state?: AppState): boolean {
  if (el === null || (el.type !== 'line' && el.type !== 'arrow')) return false;
  return el.points.length === 2 || state?.linearEdit?.id === el.id;
}

/** Midpoint handles appear only on segments at least this long on screen. */
const MIN_MIDPOINT_SEGMENT_PX = 24;

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
    (single.type === 'line' || single.type === 'arrow') &&
    usesEndpointHandles(single, state)
  ) {
    const world = single.points.map((p) => localToWorld(single, p));
    const out: SelectionHandle[] = world.map((w, index) => ({
      kind: { type: 'endpoint', index },
      anchor: w,
      center: w,
    }));
    if (state.linearEdit?.id === single.id) {
      // On a curve the handle sits on the spline (t = ½ of its segment).
      const segs = single.curve === 'curved' ? catmullRomSegments(world) : null;
      for (let index = 0; index < world.length - 1; index++) {
        const a = world[index];
        const b = world[index + 1];
        if (!a || !b || distance(a, b) * zoom < MIN_MIDPOINT_SEGMENT_PX) continue;
        const s = segs?.[index];
        const m = s
          ? {
              x: (s.p1.x + 3 * s.c1.x + 3 * s.c2.x + s.p2.x) / 8,
              y: (s.p1.y + 3 * s.c1.y + 3 * s.c2.y + s.p2.y) / 8,
            }
          : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        out.push({ kind: { type: 'midpoint', index }, anchor: m, center: m });
      }
    }
    return out;
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
  if (!frame || usesEndpointHandles(frame.single, state)) return false;
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
