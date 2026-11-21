import { arrowsBoundTo } from '../binding/binding';
import { visibleWorldBox } from '../camera/camera';
import type { Box } from '../geometry/box';
import { rectAABB } from '../geometry/rect';
import type { Point } from '../geometry/vec';
import type { ElementId } from '../model/types';
import type { AppState } from '../store/app-state';

/** Object snapping engages within this many screen px. */
export const SNAP_DISTANCE_PX = 8;

/** A guide line in world units: `axis: 'x'` is a vertical line at x = `at`. */
export interface Guide {
  readonly axis: 'x' | 'y';
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

/** Everything one gesture snaps against, collected once at its start. */
export interface SnapContext {
  /** Boxes of other elements (object snapping off: empty). */
  readonly boxes: readonly Box[];
  /** World-unit tolerance for object snapping. */
  readonly tolerance: number;
  /** Grid spacing in world units, or null when not snapping to the grid. */
  readonly grid: number | null;
}

export const NO_SNAP: SnapContext = { boxes: [], tolerance: 0, grid: null };

/** Grid spacing to snap to, or null: snapping applies only while the grid is shown. */
export function activeGrid(state: AppState): number | null {
  return state.gridVisible && state.gridSnap ? state.gridSize : null;
}

/**
 * Snap context for a gesture that changes `moving`. Other elements on screen
 * are targets, except bound labels and arrows attached to the moving
 * elements (they follow, so snapping to them would chase itself).
 */
export function snapContext(
  state: AppState,
  moving: Iterable<ElementId>,
  queryBox?: (box: Box) => ReadonlySet<ElementId>,
): SnapContext {
  const grid = activeGrid(state);
  if (!state.objectSnap) return grid === null ? NO_SNAP : { ...NO_SNAP, grid };
  const exclude = new Set(moving);
  for (const id of arrowsBoundTo(state.scene, exclude)) exclude.add(id);
  const view = visibleWorldBox(state.camera, state.viewport);
  const ids = queryBox ? queryBox(view) : state.scene.order;
  const boxes: Box[] = [];
  for (const id of ids) {
    if (exclude.has(id)) continue;
    const el = state.scene.entities[id];
    if (!el || (el.type === 'text' && el.containerId !== null)) continue;
    if (el.groupIds.length > 0 && [...exclude].some((m) => sharesGroup(state, m, el.groupIds))) {
      // Members of the moving element's group usually move with it.
      continue;
    }
    boxes.push(rectAABB(el));
  }
  return { boxes, tolerance: SNAP_DISTANCE_PX / state.camera.zoom, grid };
}

function sharesGroup(state: AppState, id: ElementId, groups: readonly string[]): boolean {
  const el = state.scene.entities[id];
  return el?.groupIds.some((g) => groups.includes(g)) === true;
}

interface AxisHit {
  readonly delta: number;
  readonly at: number;
}

/** Best offset bringing one of `values` onto one of the targets within tolerance. */
function bestAxis(
  values: readonly number[],
  targets: readonly number[],
  tol: number,
): AxisHit | null {
  let best: AxisHit | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, at: t };
      }
    }
  }
  return best;
}

const xsOf = (b: Box): number[] => [b.minX, (b.minX + b.maxX) / 2, b.maxX];
const ysOf = (b: Box): number[] => [b.minY, (b.minY + b.maxY) / 2, b.maxY];

const gridDelta = (v: number, g: number): number => Math.round(v / g) * g - v;

/** Guides along `axis` at `at`, spanning the snapped box and every target touching that line. */
function guidesFor(axis: 'x' | 'y', at: number, moved: Box, boxes: readonly Box[]): Guide {
  const eps = 1e-6;
  let from = axis === 'x' ? moved.minY : moved.minX;
  let to = axis === 'x' ? moved.maxY : moved.maxX;
  for (const b of boxes) {
    const vals = axis === 'x' ? xsOf(b) : ysOf(b);
    if (!vals.some((v) => Math.abs(v - at) < eps)) continue;
    from = Math.min(from, axis === 'x' ? b.minY : b.minX);
    to = Math.max(to, axis === 'x' ? b.maxY : b.maxX);
  }
  return { axis, at, from, to };
}

export interface SnapResult {
  readonly dx: number;
  readonly dy: number;
  readonly guides: readonly Guide[];
}

function snapValues(
  sc: SnapContext,
  xs: readonly number[],
  ys: readonly number[],
  gridX: number,
  gridY: number,
): { dx: number; dy: number; hx: AxisHit | null; hy: AxisHit | null } {
  const tx = sc.boxes.flatMap(xsOf);
  const ty = sc.boxes.flatMap(ysOf);
  const hx = bestAxis(xs, tx, sc.tolerance);
  const hy = bestAxis(ys, ty, sc.tolerance);
  // Per axis: objects win over the grid.
  const dx = hx ? hx.delta : sc.grid !== null ? gridDelta(gridX, sc.grid) : 0;
  const dy = hy ? hy.delta : sc.grid !== null ? gridDelta(gridY, sc.grid) : 0;
  return { dx, dy, hx, hy };
}

/** Offset snapping a moved box's edges/centre to other boxes, else its top-left to the grid. */
export function snapBox(sc: SnapContext, box: Box): SnapResult {
  const { dx, dy, hx, hy } = snapValues(sc, xsOf(box), ysOf(box), box.minX, box.minY);
  const moved = {
    minX: box.minX + dx,
    minY: box.minY + dy,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
  };
  const guides: Guide[] = [];
  if (hx) guides.push(guidesFor('x', hx.at, moved, sc.boxes));
  if (hy) guides.push(guidesFor('y', hy.at, moved, sc.boxes));
  return { dx, dy, guides };
}

/** Snaps a single point (resize handle, line vertex, shape corner). */
export function snapPoint(sc: SnapContext, p: Point): { point: Point; guides: readonly Guide[] } {
  const { dx, dy, hx, hy } = snapValues(sc, [p.x], [p.y], p.x, p.y);
  const point = { x: p.x + dx, y: p.y + dy };
  const dot = { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  const guides: Guide[] = [];
  if (hx) guides.push(guidesFor('x', hx.at, dot, sc.boxes));
  if (hy) guides.push(guidesFor('y', hy.at, dot, sc.boxes));
  return { point, guides };
}
