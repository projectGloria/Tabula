import type { Point } from '../../geometry/vec';
import { itemAt } from './path';

export interface HatchLine {
  readonly a: Point;
  readonly b: Point;
  /** Scanline index relative to `center`; stable as the shape grows or shrinks. */
  readonly index: number;
}

/**
 * Parallel lines at `angle` (radians) clipped to a closed polygon, spaced by
 * `gap` and anchored at `center`. Each end is pulled in by `inset` so lines
 * stay inside the outline stroke.
 */
export function hatchLines(
  poly: readonly Point[],
  angle: number,
  gap: number,
  inset: number,
  center: Point,
): HatchLine[] {
  if (poly.length < 3 || gap <= 0) return [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Rotate by -angle so the hatch lines become horizontal.
  const local = poly.map((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  });
  const toWorld = (x: number, y: number): Point => ({
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  });
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of local) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const out: HatchLine[] = [];
  const first = Math.ceil((minY + inset) / gap);
  const last = Math.floor((maxY - inset) / gap);
  for (let i = first; i <= last; i++) {
    const y = i * gap;
    const xs: number[] = [];
    for (let e = 0; e < local.length; e++) {
      const p = itemAt(local, e);
      const q = itemAt(local, (e + 1) % local.length);
      if (p.y <= y !== q.y <= y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = itemAt(xs, k) + inset;
      const x1 = itemAt(xs, k + 1) - inset;
      if (x1 - x0 > 1) out.push({ a: toWorld(x0, y), b: toWorld(x1, y), index: i });
    }
  }
  return out;
}
