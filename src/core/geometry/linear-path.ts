import type { LinearElement, LocalPoint } from '../model/types';
import type { Point } from './vec';

/** Samples per spline segment when flattening a curved path. */
export const CURVE_SAMPLES = 16;

/**
 * Cubic Bézier control points of the open Catmull-Rom spline through `pts`
 * (endpoints clamped). The renderer and the flattener share this so hit
 * testing matches what is drawn.
 */
export function catmullRomSegments(
  pts: readonly Point[],
): { p1: Point; c1: Point; c2: Point; p2: Point }[] {
  const n = pts.length;
  const at = (i: number): Point => pts[Math.max(0, Math.min(n - 1, i))] ?? { x: 0, y: 0 };
  const out: { p1: Point; c1: Point; c2: Point; p2: Point }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    out.push({
      p1,
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    });
  }
  return out;
}

function cubicAt(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  const k0 = u * u * u;
  const k1 = 3 * u * u * t;
  const k2 = 3 * u * t * t;
  const k3 = t * t * t;
  return {
    x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x,
    y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y,
  };
}

/** Flattens a Catmull-Rom spline through `pts` into a polyline. */
export function flattenCurve(pts: readonly Point[], samples = CURVE_SAMPLES): Point[] {
  const first = pts[0];
  if (!first || pts.length < 3) return [...pts];
  const out: Point[] = [first];
  for (const s of catmullRomSegments(pts)) {
    for (let k = 1; k <= samples; k++) out.push(cubicAt(s.p1, s.c1, s.c2, s.p2, k / samples));
  }
  return out;
}

const cache = new WeakMap<readonly LocalPoint[], readonly LocalPoint[]>();

/**
 * The path a line or arrow actually draws, as a local-space polyline: the
 * points themselves when straight, a flattened spline when curved.
 */
export function linearPathPoints(el: LinearElement): readonly LocalPoint[] {
  if (el.curve === 'straight' || el.points.length < 3) return el.points;
  let out = cache.get(el.points);
  if (!out) {
    out = flattenCurve(el.points);
    cache.set(el.points, out);
  }
  return out;
}
