import {
  clearSelection,
  setElementPositions,
  setSelection,
  toggleSelected,
} from '../actions/actions';
import { distance, type Point } from '../geometry/vec';
import type { ElementId } from '../model/types';
import { isSelected, selectedIds } from '../store/app-state';
import { DRAG_THRESHOLD_PX, type PointerInput, type Tool, type ToolContext } from './tool';

interface Press {
  readonly pointerId: number;
  readonly startScreen: Point;
  readonly startWorld: Point;
  /** Original top-left of every element being moved. */
  readonly origins: ReadonlyMap<ElementId, Point>;
  dragging: boolean;
}

export class SelectTool implements Tool {
  readonly id = 'select' as const;
  readonly cursor = 'default';
  private press: Press | null = null;

  onPointerDown(ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0 || this.press) return;
    const hit = ctx.hitTest(e.world);

    if (hit === undefined) {
      if (!e.shift) ctx.update(clearSelection);
      return;
    }

    if (e.shift) ctx.update((s) => toggleSelected(s, hit));
    else if (!isSelected(ctx.getState(), hit)) ctx.update((s) => setSelection(s, [hit]));

    const state = ctx.getState();
    if (!isSelected(state, hit)) return; // shift-click just deselected it

    const origins = new Map<ElementId, Point>();
    for (const id of selectedIds(state)) {
      const el = state.scene.entities[id];
      if (el && !el.locked) origins.set(id, { x: el.x, y: el.y });
    }
    this.press = {
      pointerId: e.pointerId,
      startScreen: e.screen,
      startWorld: e.world,
      origins,
      dragging: false,
    };
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const p = this.press;
    if (p?.pointerId !== e.pointerId) return;
    if (!p.dragging && distance(p.startScreen, e.screen) < DRAG_THRESHOLD_PX) return;
    p.dragging = true;
    const dx = e.world.x - p.startWorld.x;
    const dy = e.world.y - p.startWorld.y;
    const positions = new Map<ElementId, Point>();
    for (const [id, o] of p.origins) positions.set(id, { x: o.x + dx, y: o.y + dy });
    ctx.update((s) => setElementPositions(s, positions));
  }

  onPointerUp(ctx: ToolContext, e: PointerInput): void {
    if (this.press?.pointerId !== e.pointerId) return;
    this.onPointerMove(ctx, e);
    this.press = null;
  }

  cancel(ctx: ToolContext): void {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.dragging) ctx.update((s) => setElementPositions(s, p.origins));
  }
}
