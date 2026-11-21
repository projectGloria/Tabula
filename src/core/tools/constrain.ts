import { snapAngle } from '../geometry/angle';
import type { Point } from '../geometry/vec';

/** Snaps the direction `from → to` to 15° steps, keeping its length. */
export function snapSegment(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  const a = snapAngle(Math.atan2(dy, dx));
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}
