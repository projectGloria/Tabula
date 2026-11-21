import type { Point } from './vec';

const EPS = 1e-9;

/**
 * Distance from `p` (relative to the ellipse center) to the outline of an
 * axis-aligned ellipse with semi-axes `a` (x) and `b` (y). Works in the
 * first quadrant and refines the closest point with a few iterations of an
 * evolute-based projection.
 */
export function distanceToEllipseOutline(p: Point, a: number, b: number): number {
  const px = Math.abs(p.x);
  const py = Math.abs(p.y);
  if (a <= EPS && b <= EPS) return Math.hypot(px, py);
  // Degenerate ellipses collapse to a segment along the remaining axis.
  if (a <= EPS) return Math.hypot(px, Math.max(0, py - b));
  if (b <= EPS) return Math.hypot(Math.max(0, px - a), py);

  let tx = Math.SQRT1_2;
  let ty = Math.SQRT1_2;
  for (let i = 0; i < 4; i++) {
    const x = a * tx;
    const y = b * ty;
    const ex = ((a * a - b * b) * tx ** 3) / a;
    const ey = ((b * b - a * a) * ty ** 3) / b;
    const rx = x - ex;
    const ry = y - ey;
    const qx = px - ex;
    const qy = py - ey;
    const r = Math.hypot(rx, ry);
    const q = Math.hypot(qx, qy) || EPS;
    tx = Math.min(1, Math.max(0, ((qx * r) / q + ex) / a));
    ty = Math.min(1, Math.max(0, ((qy * r) / q + ey) / b));
    const t = Math.hypot(tx, ty) || 1;
    tx /= t;
    ty /= t;
  }
  return Math.hypot(px - a * tx, py - b * ty);
}

/** True when `p` (relative to the center) is inside or on the ellipse. */
export function pointInEllipse(p: Point, a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return (p.x / a) ** 2 + (p.y / b) ** 2 <= 1;
}
