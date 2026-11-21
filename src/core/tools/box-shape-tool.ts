import {
  addElements,
  deleteElements,
  setSelection,
  setTool,
  updateElement,
} from '../actions/actions';
import type { Point } from '../geometry/vec';
import { createBoxElement } from '../model/scene';
import type { BoxElementType, ElementId } from '../model/types';
import { rectFromDrag } from './drag-rect';
import type { PointerInput, Tool, ToolContext } from './tool';

/** Shapes smaller than this (in screen px) on both axes are discarded on release. */
const MIN_SIZE_PX = 2;

interface Drawing {
  readonly pointerId: number;
  readonly id: ElementId;
  readonly origin: Point;
}

/** Drag-to-draw tool for rectangle, diamond and ellipse. Shift: equal sides; Alt: from center. */
export class BoxShapeTool<T extends BoxElementType> implements Tool {
  readonly cursor = 'crosshair';
  private drawing: Drawing | null = null;

  constructor(readonly id: T) {}

  onPointerDown(ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0 || this.drawing) return;
    const el = createBoxElement(this.id, { x: e.world.x, y: e.world.y });
    this.drawing = { pointerId: e.pointerId, id: el.id, origin: e.world };
    ctx.update((s) => addElements(s, [el]));
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const d = this.drawing;
    if (d?.pointerId !== e.pointerId) return;
    const r = rectFromDrag(d.origin, e.world, e);
    ctx.update((s) => updateElement(s, d.id, r));
  }

  onPointerUp(ctx: ToolContext, e: PointerInput): void {
    const d = this.drawing;
    if (d?.pointerId !== e.pointerId) return;
    this.onPointerMove(ctx, e);
    this.drawing = null;
    ctx.update((s) => {
      const el = s.scene.entities[d.id];
      const min = MIN_SIZE_PX / s.camera.zoom;
      if (!el || (el.width < min && el.height < min)) return deleteElements(s, [d.id]);
      // Tool lock arrives in M8; until then return to Select after each shape.
      return setTool(setSelection(s, [d.id]), 'select');
    });
  }

  cancel(ctx: ToolContext): void {
    const d = this.drawing;
    if (!d) return;
    this.drawing = null;
    ctx.update((s) => deleteElements(s, [d.id]));
  }
}
