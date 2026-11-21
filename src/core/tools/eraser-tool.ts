import { deleteElements } from '../actions/actions';
import { distance, type Point } from '../geometry/vec';
import { expandToGroups } from '../model/groups';
import type { ElementId } from '../model/types';
import type { AppState } from '../store/app-state';
import type { PointerInput, Tool, ToolContext } from './tool';

/** Screen px between hit samples along a fast stroke. */
const SAMPLE_PX = 4;

function setErasing(s: AppState, ids: readonly ElementId[]): AppState {
  if (s.overlay.erasing.length === 0 && ids.length === 0) return s;
  return { ...s, overlay: { ...s.overlay, erasing: ids } };
}

/**
 * Drag across elements to mark them (painted faded); releasing deletes them in
 * one undo step. Groups go as a whole; locked elements are never hit.
 */
export class EraserTool implements Tool {
  readonly id = 'eraser' as const;
  readonly cursor = 'crosshair';
  private stroke: { pointerId: number; last: PointerInput; hits: Set<ElementId> } | null = null;

  onPointerDown(ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0 || this.stroke) return;
    this.stroke = { pointerId: e.pointerId, last: e, hits: new Set() };
    this.sample(ctx, [e.world]);
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const st = this.stroke;
    if (st?.pointerId !== e.pointerId) return;
    const from = st.last;
    st.last = e;
    const steps = Math.max(1, Math.ceil(distance(from.screen, e.screen) / SAMPLE_PX));
    const pts: Point[] = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      pts.push({
        x: from.world.x + (e.world.x - from.world.x) * t,
        y: from.world.y + (e.world.y - from.world.y) * t,
      });
    }
    this.sample(ctx, pts);
  }

  onPointerUp(ctx: ToolContext, e: PointerInput): void {
    const st = this.stroke;
    if (st?.pointerId !== e.pointerId) return;
    this.stroke = null;
    ctx.update((s) => {
      const ids = s.overlay.erasing;
      return ids.length === 0 ? s : deleteElements(setErasing(s, []), ids);
    });
  }

  cancel(ctx: ToolContext): void {
    if (!this.stroke) return;
    this.stroke = null;
    ctx.update((s) => setErasing(s, []), { history: 'skip' });
  }

  private sample(ctx: ToolContext, pts: readonly Point[]): void {
    const st = this.stroke;
    if (!st) return;
    const fresh: ElementId[] = [];
    for (const p of pts) {
      const id = ctx.hitTest(p);
      if (id !== undefined && !st.hits.has(id)) {
        st.hits.add(id);
        fresh.push(id);
      }
    }
    if (fresh.length === 0) return;
    ctx.update(
      (s) => {
        const all = expandToGroups(s.scene, [...s.overlay.erasing, ...fresh], s.focusGroup);
        return setErasing(s, all);
      },
      { history: 'skip' },
    );
  }
}
