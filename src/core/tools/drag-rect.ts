import { rectFromCorners, type NormalizedRect } from '../geometry/rect';
import type { Point } from '../geometry/vec';

export interface DragModifiers {
  /** Constrain to a square. */
  readonly shift: boolean;
  /** Draw from the center outwards. */
  readonly alt: boolean;
}

/** Rect produced by dragging from `origin` to `current` with modifiers. */
export function rectFromDrag(origin: Point, current: Point, mods: DragModifiers): NormalizedRect {
  let dx = current.x - origin.x;
  let dy = current.y - origin.y;
  if (mods.shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = side * (dx < 0 ? -1 : 1);
    dy = side * (dy < 0 ? -1 : 1);
  }
  if (mods.alt) {
    return rectFromCorners(
      { x: origin.x - dx, y: origin.y - dy },
      { x: origin.x + dx, y: origin.y + dy },
    );
  }
  return rectFromCorners(origin, { x: origin.x + dx, y: origin.y + dy });
}
