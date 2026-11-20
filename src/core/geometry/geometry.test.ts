import { describe, expect, it } from 'vitest';
import {
  boxContainsBox,
  boxContainsPoint,
  boxExpand,
  boxFromPoints,
  boxFromRect,
  boxIntersects,
  boxUnion,
} from './box';
import { rectAABB, rectCorners, rectFromCorners, toRectLocal } from './rect';
import { add, distance, rotateAround, sub } from './vec';

const close = (a: number, b: number) => {
  expect(a).toBeCloseTo(b, 9);
};

describe('vec', () => {
  it('adds, subtracts and measures', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('rotates clockwise in y-down space', () => {
    const p = rotateAround({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    close(p.x, 0);
    close(p.y, 1);
  });

  it('returns the same point for a zero angle', () => {
    const p = { x: 3, y: 4 };
    expect(rotateAround(p, { x: 0, y: 0 }, 0)).toBe(p);
  });
});

describe('box', () => {
  it('normalizes negative rects', () => {
    expect(boxFromRect(10, 10, -5, -5)).toEqual({ minX: 5, minY: 5, maxX: 10, maxY: 10 });
  });

  it('builds from points and handles empty input', () => {
    expect(boxFromPoints([])).toBeNull();
    expect(
      boxFromPoints([
        { x: 1, y: 5 },
        { x: -2, y: 3 },
      ]),
    ).toEqual({ minX: -2, minY: 3, maxX: 1, maxY: 5 });
  });

  it('intersects inclusively', () => {
    const a = boxFromRect(0, 0, 10, 10);
    expect(boxIntersects(a, boxFromRect(10, 10, 5, 5))).toBe(true);
    expect(boxIntersects(a, boxFromRect(10.01, 0, 5, 5))).toBe(false);
  });

  it('unions, expands and tests containment', () => {
    const a = boxFromRect(0, 0, 10, 10);
    const b = boxFromRect(5, -5, 10, 10);
    expect(boxUnion(a, b)).toEqual({ minX: 0, minY: -5, maxX: 15, maxY: 10 });
    expect(boxExpand(a, 2)).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 });
    expect(boxContainsBox(boxExpand(a, 1), a)).toBe(true);
    expect(boxContainsBox(a, b)).toBe(false);
    expect(boxContainsPoint(a, { x: 10, y: 0 })).toBe(true);
  });
});

describe('rect', () => {
  it('builds a normalized rect from any two corners', () => {
    expect(rectFromCorners({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({
      x: 0,
      y: 5,
      width: 10,
      height: 15,
    });
  });

  it('computes the AABB of a 45° rotated square', () => {
    const b = rectAABB({ x: 0, y: 0, width: 10, height: 10, angle: Math.PI / 4 });
    const half = Math.SQRT2 * 5;
    close(b.minX, 5 - half);
    close(b.maxX, 5 + half);
    close(b.minY, 5 - half);
    close(b.maxY, 5 + half);
  });

  it('keeps corners of an unrotated rect exact', () => {
    expect(rectCorners({ x: 1, y: 2, width: 3, height: 4, angle: 0 })).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 6 },
      { x: 1, y: 6 },
    ]);
  });

  it('maps world points into the local frame (inverse of rotation)', () => {
    const r = { x: 0, y: 0, width: 20, height: 10, angle: Math.PI / 2 };
    // After a 90° rotation around the center (10,5), the local top-left maps to (15,-5).
    const local = toRectLocal(r, { x: 15, y: -5 });
    close(local.x, 0);
    close(local.y, 0);
  });
});
