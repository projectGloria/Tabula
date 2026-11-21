import { boxFromPoints } from './box';
import { rectCenter, toRectLocal } from './rect';
import { rotateAround, type Point } from './vec';
import type { LocalPoint, PointsElement, SceneElement } from '../model/types';

export function elementCenter(el: SceneElement): Point {
  return rectCenter(el);
}

/** Maps a local point (relative to the element's unrotated top-left) to world space. */
export function localToWorld(el: SceneElement, p: Point): Point {
  const world = { x: el.x + p.x, y: el.y + p.y };
  return el.angle === 0 ? world : rotateAround(world, rectCenter(el), el.angle);
}

/** Maps a world point into the element's unrotated local frame. */
export function worldToLocal(el: SceneElement, p: Point): Point {
  return toRectLocal(el, p);
}

export function worldPointsOf(el: PointsElement): Point[] {
  return el.points.map((p) => localToWorld(el, p));
}

export interface PointsPatch {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly points: readonly LocalPoint[];
}

/**
 * Builds the geometry patch for a points element from world-space points,
 * keeping `angle`. The local bounding box is re-normalized to start at (0, 0).
 */
export function pointsPatchFromWorld(angle: number, world: readonly Point[]): PointsPatch {
  const origin = { x: 0, y: 0 };
  const u = angle === 0 ? world : world.map((p) => rotateAround(p, origin, -angle));
  const box = boxFromPoints(u) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const cu = { x: box.minX + w / 2, y: box.minY + h / 2 };
  const wc = angle === 0 ? cu : rotateAround(cu, origin, angle);
  return {
    x: wc.x - w / 2,
    y: wc.y - h / 2,
    width: w,
    height: h,
    points: u.map((p) => ({ x: p.x - box.minX, y: p.y - box.minY })),
  };
}
