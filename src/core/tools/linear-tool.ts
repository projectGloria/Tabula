import { addElements, deleteElements, setSelection, afterCreate } from '../actions/actions';
import { setArrowBindings, setLinearPoints } from '../actions/linear-actions';
import { worldPointsOf } from '../geometry/element-geometry';
import { distance, type Point } from '../geometry/vec';
import { createLinearElement } from '../model/scene';
import type { ElementId, LinearElementType, PointBinding } from '../model/types';
import { snapContext, snapPoint, type Guide, type SnapContext } from '../snapping/snapping';
import type { AppState } from '../store/app-state';
import { bindCandidate } from './bind-assist';
import { snapSegment } from './constrain';
import { clearOverlay, setOverlay } from './overlay';
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
  readonly snap: SnapContext;
  /** Arrow start attached at press (the editor places the point on the outline). */
  readonly startBinding: PointBinding | null;
  /** Attachment of the floating end, refreshed on every move. */
  endBinding: PointBinding | null;
  guides: readonly Guide[];
  /** Ctrl/⌘ held on the latest event: no binding. */
  mod: boolean;
}

/**
 * Line / arrow tool. Drag draws a two-point line; a click starts a polyline
 * where each click adds a point and clicking the last point again, Enter or
 * Escape finishes. Shift snaps the current segment to 15°. Arrow ends dropped
 * on a shape attach to it unless Ctrl/⌘ is held.
 */
export class LinearTool implements Tool {
  readonly cursor = 'crosshair';
  private g: Gesture | null = null;

  constructor(readonly id: LinearElementType) {}

  onPointerDown(ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0) return;
    const g = this.g;
    if (!g) {
      this.start(ctx, e);
      return;
    }
    if (g.mode !== 'poly') return;
    g.pointerId = e.pointerId;
    g.mod = e.mod;
    const last = g.fixed[g.fixed.length - 1] ?? e.world;
    const zoom = ctx.getState().camera.zoom;
    if (distance(last, e.world) * zoom <= FINISH_RADIUS_PX) {
      this.commit(ctx, g.fixed);
      return;
    }
    g.floating = this.constrain(ctx, g, e);
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
    g.mod = e.mod;
    g.floating = this.constrain(ctx, g, e);
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
      g.mod = e.mod;
      g.floating = this.constrain(ctx, g, e);
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

  private start(ctx: ToolContext, e: PointerInput): void {
    const state = ctx.getState();
    const memory = state.styleMemory;
    const snap = snapContext(state, [], ctx.queryBox);
    const startBind = this.id === 'arrow' ? bindCandidate(ctx, e.world, e.mod, new Set()) : null;
    const snapped = startBind ? { point: e.world, guides: [] } : snapPoint(snap, e.world);
    const start = snapped.point;
    const el = createLinearElement(this.id, {
      x: start.x,
      y: start.y,
      style: memory.linear,
      curve: memory.curve,
      startHead: memory.arrowHeads.start,
      endHead: memory.arrowHeads.end,
    });
    const startBinding = startBind?.binding ?? null;
    this.g = {
      id: el.id,
      fixed: [start],
      floating: start,
      mode: 'press',
      pointerId: e.pointerId,
      pressScreen: e.screen,
      snap,
      startBinding,
      endBinding: null,
      guides: snapped.guides,
      mod: e.mod,
    };
    // One undo step for the whole line, even across polyline clicks.
    ctx.begin?.();
    ctx.update((s) => {
      const added = addElements(s, [el]);
      const bound = startBinding ? setArrowBindings(added, el.id, { start: startBinding }) : added;
      return setOverlay(bound, {
        bindTarget: startBind?.target.id ?? null,
        guides: snapped.guides,
      });
    });
  }

  /** Shapes the end at the current point count must not bind to. */
  private endExclude(g: Gesture, pointCount: number): Set<ElementId> {
    const exclude = new Set([g.id]);
    // A two-point arrow never starts and ends on the same shape.
    if (pointCount === 2 && g.startBinding) exclude.add(g.startBinding.elementId);
    return exclude;
  }

  /**
   * The floating point for pointer `e`: over a shape it binds (arrows), with
   * Shift it snaps to 15° steps, otherwise it snaps to objects / the grid.
   */
  private constrain(ctx: ToolContext, g: Gesture, e: PointerInput): Point {
    const last = g.fixed[g.fixed.length - 1];
    g.guides = [];
    g.endBinding = null;
    if (this.id === 'arrow') {
      const cand = bindCandidate(ctx, e.world, e.mod, this.endExclude(g, g.fixed.length + 1));
      if (cand) {
        g.endBinding = cand.binding;
        return e.world;
      }
    }
    if (e.shift && last) return snapSegment(last, e.world);
    const snapped = snapPoint(g.snap, e.world);
    g.guides = snapped.guides;
    return snapped.point;
  }

  /** World points to write: a bound start keeps the position the editor gave it. */
  private points(s: AppState, g: Gesture, pts: readonly Point[]): Point[] {
    const out = [...pts];
    const el = s.scene.entities[g.id];
    if (g.startBinding && el?.type === 'arrow' && el.points.length >= 2) {
      const p0 = worldPointsOf(el)[0];
      if (p0) out[0] = p0;
    }
    return out;
  }

  private sync(ctx: ToolContext): void {
    const g = this.g;
    if (!g) return;
    const pts = g.mode === 'poly' || g.mode === 'drag' ? [...g.fixed, g.floating] : g.fixed;
    ctx.update((s) => {
      const next =
        pts.length < 2
          ? s
          : setLinearPoints(s, g.id, this.points(s, g, pts), { end: g.endBinding });
      return setOverlay(next, {
        bindTarget: g.endBinding?.elementId ?? null,
        guides: g.guides,
      });
    });
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
      ctx.update((s) => clearOverlay(deleteElements(s, [g.id])));
      ctx.end?.();
      return;
    }
    // Finishing on a fixed point (Enter, or clicking the last point again)
    // binds that point; a drag already resolved its end binding.
    let end = g.endBinding;
    const lastPt = pts[pts.length - 1];
    if (this.id === 'arrow' && g.mode !== 'drag' && lastPt) {
      end = bindCandidate(ctx, lastPt, g.mod, this.endExclude(g, pts.length))?.binding ?? null;
    }
    ctx.update((s) => {
      const next = clearOverlay(setLinearPoints(s, g.id, this.points(s, g, pts), { end }));
      return afterCreate(setSelection(next, [g.id]));
    });
    ctx.end?.();
  }

  private discard(ctx: ToolContext): void {
    const g = this.g;
    if (!g) return;
    this.g = null;
    ctx.update((s) => clearOverlay(deleteElements(s, [g.id])));
    ctx.end?.();
  }
}
