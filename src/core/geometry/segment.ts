import type { Point } from './vec';

/** Shortest distance from `p` to the segment `a`–`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance from `p` to an open polyline. Infinity for an empty list. */
export function distanceToPolyline(p: Point, points: readonly Point[]): number {
  const first = points[0];
  if (!first) return Infinity;
  if (points.length === 1) return Math.hypot(p.x - first.x, p.y - first.y);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const d = distanceToSegment(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

/** Distance from `p` to the boundary of a closed polygon. */
export function distanceToPolygonEdges(p: Point, poly: readonly Point[]): number {
  const first = poly[0];
  if (!first) return Infinity;
  return distanceToPolyline(p, [...poly, first]);
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
