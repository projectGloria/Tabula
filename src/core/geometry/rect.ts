import type { Box } from './box';
import { rotateAround, type Point } from './vec';

/** Minimal geometry of a (possibly rotated) box-shaped element. */
export interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Builds a non-negative rect from two arbitrary corners. */
export function rectFromCorners(a: Point, b: Point): NormalizedRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function rectCenter(r: RectLike): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** World-space corners in order: top-left, top-right, bottom-right, bottom-left. */
export function rectCorners(r: RectLike): [Point, Point, Point, Point] {
  const tl = { x: r.x, y: r.y };
  const tr = { x: r.x + r.width, y: r.y };
  const br = { x: r.x + r.width, y: r.y + r.height };
  const bl = { x: r.x, y: r.y + r.height };
  if (r.angle === 0) return [tl, tr, br, bl];
  const c = rectCenter(r);
  return [
    rotateAround(tl, c, r.angle),
    rotateAround(tr, c, r.angle),
    rotateAround(br, c, r.angle),
    rotateAround(bl, c, r.angle),
  ];
}

/** Axis-aligned bounds of a rotated rect. */
export function rectAABB(r: RectLike): Box {
  const [a, b, c, d] = rectCorners(r);
  return {
    minX: Math.min(a.x, b.x, c.x, d.x),
    minY: Math.min(a.y, b.y, c.y, d.y),
    maxX: Math.max(a.x, b.x, c.x, d.x),
    maxY: Math.max(a.y, b.y, c.y, d.y),
  };
}

/** Maps a world point into the rect's unrotated local frame (origin at rect top-left). */
export function toRectLocal(r: RectLike, p: Point): Point {
  const unrotated = r.angle === 0 ? p : rotateAround(p, rectCenter(r), -r.angle);
  return { x: unrotated.x - r.x, y: unrotated.y - r.y };
}
