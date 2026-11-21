import type { Point } from '../../geometry/vec';
import type { Arrowhead, Roughness } from '../../model/types';
import { ellipsePath, polygonPath, type PathBuilder } from './path';
import type { Rng } from './rng';
import { amplitude, sketchPolyline } from './strokes';

/** Builders for one arrowhead: filled parts and stroked parts go to separate layers. */
export interface HeadTargets {
  readonly fill: PathBuilder;
  readonly stroke: PathBuilder;
}

/**
 * Adds an arrowhead at `tip` pointing away from `from`. `size` is the head
 * length. Open heads are sketched lines; closed heads get an exact fill plus a
 * sketched outline.
 */
export function addArrowhead(
  out: HeadTargets,
  head: Arrowhead,
  tip: Point,
  from: Point,
  size: number,
  roughness: Roughness,
  passes: number,
  rng: Rng,
): void {
  if (head === 'none') return;
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular (left of travel direction).
  const nx = -uy;
  const ny = ux;
  const at = (along: number, side: number): Point => ({
    x: tip.x - ux * along + nx * side,
    y: tip.y - uy * along + ny * side,
  });
  const k = amplitude(roughness, size) * 0.6;
  const line = (pts: readonly Point[]): void => {
    if (k <= 0) {
      const [first, ...rest] = pts;
      if (!first) return;
      out.stroke.moveTo(first);
      for (const p of rest) out.stroke.lineTo(p);
      return;
    }
    for (let i = 0; i < passes; i++) sketchPolyline(out.stroke, pts, k, rng);
  };
  const closed = (pts: readonly Point[]): void => {
    polygonPath(out.fill, pts);
    const first = pts[0];
    if (first) line([...pts, first]);
  };

  switch (head) {
    case 'arrow':
      line([at(size, size * 0.5), tip, at(size, -size * 0.5)]);
      return;
    case 'bar':
      line([at(0, size * 0.5), at(0, -size * 0.5)]);
      return;
    case 'triangle':
      closed([tip, at(size, size * 0.45), at(size, -size * 0.45)]);
      return;
    case 'diamond': {
      const half = size * 0.35;
      const mid = at(half * 1.4, 0);
      closed([
        tip,
        { x: mid.x + nx * half, y: mid.y + ny * half },
        at(half * 2.8, 0),
        { x: mid.x - nx * half, y: mid.y - ny * half },
      ]);
      return;
    }
    case 'dot': {
      const r = size * 0.3;
      const c = at(r, 0);
      ellipsePath(out.fill, c.x, c.y, r, r);
      return;
    }
  }
}
