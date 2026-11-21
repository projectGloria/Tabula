import { panCamera } from '../actions/actions';
import type { Point } from '../geometry/vec';
import type { PointerInput, Tool, ToolContext } from './tool';

/** Drag to pan. Also the only tool in view mode. */
export class HandTool implements Tool {
  readonly id = 'hand' as const;
  private drag: { pointerId: number; last: Point } | null = null;

  get cursor(): string {
    return this.drag ? 'grabbing' : 'grab';
  }

  onPointerDown(_ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0 || this.drag) return;
    this.drag = { pointerId: e.pointerId, last: e.screen };
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const d = this.drag;
    if (d?.pointerId !== e.pointerId) return;
    const dx = e.screen.x - d.last.x;
    const dy = e.screen.y - d.last.y;
    d.last = e.screen;
    ctx.update((s) => panCamera(s, dx, dy), { history: 'skip' });
  }

  onPointerUp(_ctx: ToolContext, e: PointerInput): void {
    if (this.drag?.pointerId === e.pointerId) this.drag = null;
  }

  cancel(): void {
    this.drag = null;
  }
}
