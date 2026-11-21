import { afterCreate } from '../actions/actions';
import { createTextAt, editTextAt } from '../actions/text-actions';
import type { Point } from '../geometry/vec';
import { distance } from '../geometry/vec';
import { LINE_HEIGHT } from '../text/fonts';
import { DRAG_THRESHOLD_PX, type PointerInput, type Tool, type ToolContext } from './tool';

interface Press {
  readonly pointerId: number;
  readonly startScreen: Point;
  readonly startWorld: Point;
}

/**
 * Click: edit text under the pointer, label a shape, or start auto-width
 * text. Drag: start fixed-width text spanning the drag.
 */
export class TextTool implements Tool {
  readonly id = 'text' as const;
  readonly cursor = 'text';
  private press: Press | null = null;

  onPointerDown(_ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0 || this.press) return;
    this.press = { pointerId: e.pointerId, startScreen: e.screen, startWorld: e.world };
  }

  onPointerMove(): void {
    // The drag width is read on release; no preview is drawn.
  }

  onPointerUp(ctx: ToolContext, e: PointerInput): void {
    const p = this.press;
    if (p?.pointerId !== e.pointerId) return;
    this.press = null;
    const dragged = distance(p.startScreen, e.screen) >= DRAG_THRESHOLD_PX * 3;
    if (dragged) {
      const x = Math.min(p.startWorld.x, e.world.x);
      const width = Math.abs(e.world.x - p.startWorld.x);
      const y = Math.min(p.startWorld.y, e.world.y);
      ctx.update((s) => {
        const half = (s.styleMemory.textProps.fontSize * LINE_HEIGHT) / 2;
        return afterCreate(createTextAt(s, { x, y: y + half }, width));
      });
      return;
    }
    const hit = ctx.hitTest(p.startWorld);
    ctx.update((s) => afterCreate(editTextAt(s, p.startWorld, hit)));
  }

  cancel(): void {
    this.press = null;
  }
}
