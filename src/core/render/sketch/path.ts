import type { Point } from '../../geometry/vec';

/**
 * Renderer-agnostic path commands. Coordinates are rounded to 0.01 so the
 * output is stable and compact; the same data feeds Canvas and SVG export.
 */
export type PathCmd =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

/** Cubic control distance for a quarter circle. */
export const KAPPA = 0.5522847498;

// `+ 0` turns -0 into 0 so equal geometry serializes identically.
const q = (v: number): number => Math.round(v * 100) / 100 + 0;

export class PathBuilder {
  readonly cmds: PathCmd[] = [];

  moveTo(p: Point): void {
    this.cmds.push(['M', q(p.x), q(p.y)]);
  }

  lineTo(p: Point): void {
    this.cmds.push(['L', q(p.x), q(p.y)]);
  }

  curveTo(c1: Point, c2: Point, p: Point): void {
    this.cmds.push(['C', q(c1.x), q(c1.y), q(c2.x), q(c2.y), q(p.x), q(p.y)]);
  }

  close(): void {
    this.cmds.push(['Z']);
  }
}

/** Anything that accepts path calls: `Path2D` and `CanvasRenderingContext2D` both fit. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  closePath(): void;
}

export function tracePath(sink: PathSink, cmds: readonly PathCmd[]): void {
  for (const c of cmds) {
    switch (c[0]) {
      case 'M':
        sink.moveTo(c[1], c[2]);
        break;
      case 'L':
        sink.lineTo(c[1], c[2]);
        break;
      case 'C':
        sink.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        break;
      case 'Z':
        sink.closePath();
        break;
    }
  }
}

/** Checked array access for indices known to be in range. */
export function itemAt<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range`);
  return v;
}

const at = itemAt;
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function polygonPath(pb: PathBuilder, pts: readonly Point[]): void {
  if (pts.length === 0) return;
  pb.moveTo(at(pts, 0));
  for (let i = 1; i < pts.length; i++) pb.lineTo(at(pts, i));
  pb.close();
}

/** Polygon with each corner replaced by a cubic of tangent length `radius`. */
export function roundedPolygonPath(pb: PathBuilder, pts: readonly Point[], radius: number): void {
  const corners = roundedCorners(pts, radius);
  const first = corners[0];
  if (!first) return;
  pb.moveTo(first.a);
  corners.forEach((c, i) => {
    if (i > 0) pb.lineTo(c.a);
    pb.curveTo(lerp(c.a, c.v, KAPPA), lerp(c.b, c.v, KAPPA), c.b);
  });
  pb.close();
}

interface Corner {
  /** Tangent point on the incoming edge. */
  readonly a: Point;
  readonly v: Point;
  /** Tangent point on the outgoing edge. */
  readonly b: Point;
}

function roundedCorners(pts: readonly Point[], radius: number): Corner[] {
  const n = pts.length;
  return pts.map((v, i) => {
    const prev = at(pts, (i - 1 + n) % n);
    const next = at(pts, (i + 1) % n);
    const lp = Math.hypot(prev.x - v.x, prev.y - v.y);
    const ln = Math.hypot(next.x - v.x, next.y - v.y);
    const d = Math.min(radius, lp / 2, ln / 2);
    return {
      a: lp > 0 ? lerp(v, prev, d / lp) : v,
      v,
      b: ln > 0 ? lerp(v, next, d / ln) : v,
    };
  });
}

function cubicPoint(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** Dense closed polyline of a rounded polygon (for resampling). */
export function roundedPolygonPoints(pts: readonly Point[], radius: number): Point[] {
  const out: Point[] = [];
  for (const c of roundedCorners(pts, radius)) {
    const c1 = lerp(c.a, c.v, KAPPA);
    const c2 = lerp(c.b, c.v, KAPPA);
    for (let s = 0; s <= 6; s++) out.push(cubicPoint(c.a, c1, c2, c.b, s / 6));
  }
  return out;
}

export function ellipsePath(pb: PathBuilder, cx: number, cy: number, rx: number, ry: number): void {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  pb.moveTo({ x: cx + rx, y: cy });
  pb.curveTo({ x: cx + rx, y: cy + ky }, { x: cx + kx, y: cy + ry }, { x: cx, y: cy + ry });
  pb.curveTo({ x: cx - kx, y: cy + ry }, { x: cx - rx, y: cy + ky }, { x: cx - rx, y: cy });
  pb.curveTo({ x: cx - rx, y: cy - ky }, { x: cx - kx, y: cy - ry }, { x: cx, y: cy - ry });
  pb.curveTo({ x: cx + kx, y: cy - ry }, { x: cx + rx, y: cy - ky }, { x: cx + rx, y: cy });
  pb.close();
}

/** Dense ellipse outline sampled uniformly in angle. */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, n = 96): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return out;
}

export function loopLength(pts: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = at(pts, i);
    const b = at(pts, (i + 1) % pts.length);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Resamples a closed polyline into `n` points evenly spaced by arc length. */
export function resampleLoop(pts: readonly Point[], n: number): Point[] {
  const total = loopLength(pts);
  const first = pts[0];
  if (!first || total <= 1e-9) return first ? [first] : [];
  const out: Point[] = [];
  const step = total / n;
  let seg = 0;
  let segStart = 0;
  for (let k = 0; k < n; k++) {
    const target = k * step;
    for (;;) {
      const a = at(pts, seg % pts.length);
      const b = at(pts, (seg + 1) % pts.length);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (segStart + len >= target || seg >= pts.length - 1) {
        out.push(lerp(a, b, len > 0 ? Math.min(1, (target - segStart) / len) : 0));
        break;
      }
      segStart += len;
      seg++;
    }
  }
  return out;
}

/** Open Catmull-Rom spline through `pts`, as cubics (endpoints clamped). */
export function catmullRomOpen(pb: PathBuilder, pts: readonly Point[]): void {
  const n = pts.length;
  if (n === 0) return;
  const p = (i: number): Point => at(pts, Math.max(0, Math.min(n - 1, i)));
  pb.moveTo(p(0));
  for (let i = 0; i < n - 1; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    pb.curveTo(
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    );
  }
}

/** Closed Catmull-Rom spline through `pts`, as cubics. */
export function catmullRomClosed(pb: PathBuilder, pts: readonly Point[]): void {
  const n = pts.length;
  if (n === 0) return;
  const p = (i: number): Point => at(pts, ((i % n) + n) % n);
  pb.moveTo(p(0));
  for (let i = 0; i < n; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    pb.curveTo(
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    );
  }
  pb.close();
}

/** Smooth closed outline through edge midpoints (quadratics written as cubics). */
export function smoothClosedPath(pb: PathBuilder, pts: readonly Point[]): void {
  const n = pts.length;
  if (n < 2) return;
  const mid = (i: number): Point => lerp(at(pts, i % n), at(pts, (i + 1) % n), 0.5);
  pb.moveTo(mid(0));
  for (let i = 1; i <= n; i++) {
    const start = mid(i - 1);
    const ctrl = at(pts, i % n);
    const end = mid(i);
    pb.curveTo(lerp(start, ctrl, 2 / 3), lerp(end, ctrl, 2 / 3), end);
  }
  pb.close();
}
