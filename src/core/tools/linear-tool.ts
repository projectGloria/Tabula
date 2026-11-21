import {
  addElements,
  deleteElements,
  setElementGeometry,
  setSelection,
  setTool,
} from '../actions/actions';
import { pointsPatchFromWorld } from '../geometry/element-geometry';
import { distance, type Point } from '../geometry/vec';
import { createLinearElement } from '../model/scene';
import type { ElementId, LinearElementType } from '../model/types';
import { snapSegment } from './constrain';
import { DRAG_THRESHOLD_PX, type PointerInput, type Tool, type ToolContext } from './tool';

/** Clicking within this many screen px of the last fixed point finishes a polyline. */
export const FINISH_RADIUS_PX = 8;
/** Lines whose points all lie within this many screen px are discarded. */
const MIN_EXTENT_PX = 2;

interface Gesture {
  readonly id: ElementId;
  /** Fixed world points; the floating point follows the cursor. */
  readonly fixed: Point[];
  floating: Point;
  /**
   * `press`: first button down, not yet a drag or a click.
   * `drag`: two-point line being dragged out.
   * `poly`: click-click polyline, button up between points.
   */
  mode: 'press' | 'drag' | 'poly';
  pointerId: number;
  readonly pressScreen: Point;
}

/**
 * Line / arrow tool. Drag draws a two-point line; a click starts a polyline
 * where each click adds a point and clicking the last point again, Enter or
 * Escape finishes. Shift snaps the current segment to 15°.
 */
export class LinearTool implements Tool {
  readonly cursor = 'crosshair';
  private g: Gesture | null = null;

  constructor(readonly id: LinearElementType) {}

  onPointerDown(ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0) return;
    const g = this.g;
    if (!g) {
      const el = createLinearElement(this.id, { x: e.world.x, y: e.world.y });
      this.g = {
        id: el.id,
        fixed: [e.world],
        floating: e.world,
        mode: 'press',
        pointerId: e.pointerId,
        pressScreen: e.screen,
      };
      ctx.update((s) => addElements(s, [el]));
      this.sync(ctx);
      return;
    }
    if (g.mode !== 'poly') return;
    g.pointerId = e.pointerId;
    const last = g.fixed[g.fixed.length - 1] ?? e.world;
    const zoom = ctx.getState().camera.zoom;
    if (distance(last, e.world) * zoom <= FINISH_RADIUS_PX) {
      this.commit(ctx, g.fixed);
      return;
    }
    g.floating = this.constrain(g, e);
    g.fixed.push(g.floating);
    this.sync(ctx);
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const g = this.g;
    if (!g) return;
    if (g.mode === 'press') {
      if (e.pointerId !== g.pointerId) return;
      if (distance(g.pressScreen, e.screen) < DRAG_THRESHOLD_PX) return;
      g.mode = 'drag';
    }
    if (g.mode === 'drag' && e.pointerId !== g.pointerId) return;
    g.floating = this.constrain(g, e);
    this.sync(ctx);
  }

  onPointerUp(ctx: ToolContext, e: PointerInput): void {
    const g = this.g;
    if (g?.pointerId !== e.pointerId) return;
    if (g.mode === 'press') {
      g.mode = 'poly';
      return;
    }
    if (g.mode === 'drag') {
      g.floating = this.constrain(g, e);
      const first = g.fixed[0] ?? g.floating;
      this.commit(ctx, [first, g.floating]);
    }
  }

  /** Enter: finish the polyline with its fixed points (or a drag in progress). */
  finish(ctx: ToolContext): void {
    const g = this.g;
    if (!g) return;
    if (g.mode === 'drag') {
      const first = g.fixed[0] ?? g.floating;
      this.commit(ctx, [first, g.floating]);
    } else {
      this.commit(ctx, g.fixed);
    }
  }

  /** Escape / tool switch: keep a polyline with ≥ 2 fixed points, drop anything else. */
  cancel(ctx: ToolContext): void {
    const g = this.g;
    if (!g) return;
    if (g.mode === 'poly' && g.fixed.length >= 2) this.commit(ctx, g.fixed);
    else this.discard(ctx);
  }

  private constrain(g: Gesture, e: PointerInput): Point {
    const last = g.fixed[g.fixed.length - 1];
    return e.shift && last ? snapSegment(last, e.world) : e.world;
  }

  private sync(ctx: ToolContext): void {
    const g = this.g;
    if (!g) return;
    const pts = g.mode === 'poly' || g.mode === 'drag' ? [...g.fixed, g.floating] : g.fixed;
    const patch = pointsPatchFromWorld(0, pts);
    ctx.update((s) => setElementGeometry(s, new Map([[g.id, patch]])));
  }

  private commit(ctx: ToolContext, pts: readonly Point[]): void {
    const g = this.g;
    if (!g) return;
    this.g = null;
    const first = pts[0];
    const zoom = ctx.getState().camera.zoom;
    const tooSmall =
      pts.length < 2 || !first || pts.every((p) => distance(p, first) * zoom < MIN_EXTENT_PX);
    if (tooSmall) {
      ctx.update((s) => deleteElements(s, [g.id]));
      return;
    }
    const patch = pointsPatchFromWorld(0, pts);
    ctx.update((s) => {
      const next = setElementGeometry(s, new Map([[g.id, patch]]));
      // Tool lock arrives in M8; until then return to Select after each line.
      return setTool(setSelection(next, [g.id]), 'select');
    });
  }

  private discard(ctx: ToolContext): void {
    const g = this.g;
    if (!g) return;
    this.g = null;
    ctx.update((s) => deleteElements(s, [g.id]));
  }
}
