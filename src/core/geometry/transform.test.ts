import { describe, expect, it } from 'vitest';
import { applyGeometry, createBoxElement, createLine, mutateElement } from '../model/scene';
import type { SceneElement } from '../model/types';
import { pointsPatchFromWorld, worldPointsOf } from './element-geometry';
import { rectCenter, rectCorners } from './rect';
import {
  computeResize,
  resizeElement,
  resizeElementInGroup,
  rotateElementAround,
  rotatedAngle,
} from './transform';

const close = (a: number, b: number, eps = 1e-6) => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};

const rect = (x: number, y: number, w: number, h: number, angle = 0): SceneElement => ({
  ...createBoxElement('rectangle', { x, y, width: w, height: h }),
  angle,
});

const free = { keepAspect: false, fromCenter: false };

describe('computeResize + resizeElement', () => {
  it('drags the SE corner with the NW corner fixed', () => {
    const el = rect(0, 0, 100, 50);
    const m = computeResize(el, 'se', { x: 200, y: 75 }, free);
    expect(applyGeometry(el, resizeElement(el, m))).toMatchObject({
      x: 0,
      y: 0,
      width: 200,
      height: 75,
    });
  });

  it('moves only one axis for edge handles', () => {
    const el = rect(0, 0, 100, 50);
    const m = computeResize(el, 'w', { x: 20, y: 999 }, free);
    expect(applyGeometry(el, resizeElement(el, m))).toMatchObject({
      x: 20,
      y: 0,
      width: 80,
      height: 50,
    });
  });

  it('keeps the aspect ratio with Shift', () => {
    const el = rect(0, 0, 100, 50);
    const m = computeResize(el, 'se', { x: 300, y: 60 }, { keepAspect: true, fromCenter: false });
    expect(applyGeometry(el, resizeElement(el, m))).toMatchObject({ width: 300, height: 150 });
    const e = computeResize(el, 'e', { x: 200, y: 0 }, { keepAspect: true, fromCenter: false });
    // Edge + Shift scales the other axis around its midpoint.
    expect(applyGeometry(el, resizeElement(el, e))).toMatchObject({
      x: 0,
      y: -25,
      width: 200,
      height: 100,
    });
  });

  it('scales from the center with Alt', () => {
    const el = rect(0, 0, 100, 50);
    const m = computeResize(el, 'e', { x: 150, y: 0 }, { keepAspect: false, fromCenter: true });
    expect(applyGeometry(el, resizeElement(el, m))).toMatchObject({
      x: -50,
      y: 0,
      width: 200,
      height: 50,
    });
  });

  it('flips past the anchor and keeps sizes non-negative', () => {
    const el = rect(0, 0, 100, 50);
    const m = computeResize(el, 'e', { x: -40, y: 0 }, free);
    expect(m.sx).toBeLessThan(0);
    expect(applyGeometry(el, resizeElement(el, m))).toMatchObject({ x: -40, width: 40 });
  });

  it('keeps the opposite corner fixed in world space for a rotated element', () => {
    const el = rect(0, 0, 100, 50, 0.6);
    const nwBefore = rectCorners(el)[0];
    const seTarget = { x: 150, y: 140 };
    const next = applyGeometry(el, resizeElement(el, computeResize(el, 'se', seTarget, free)));
    const [nw, , se] = rectCorners(next);
    close(nw.x, nwBefore.x);
    close(nw.y, nwBefore.y);
    // The dragged corner lands on the pointer (projected in the element frame).
    close(se.x, seTarget.x, 1e-6);
    close(se.y, seTarget.y, 1e-6);
    expect(next.angle).toBe(0.6);
  });

  it('mirrors points of a line when flipped', () => {
    const line = mutateElement(
      createLine({ x: 0, y: 0 }),
      pointsPatchFromWorld(0, [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ]),
    );
    const m = computeResize(line, 'e', { x: -100, y: 0 }, free);
    const next = applyGeometry(line, resizeElement(line, m));
    const pts = worldPointsOf(next);
    close(pts[0]?.x ?? NaN, 0);
    close(pts[1]?.x ?? NaN, -100);
    close(pts[1]?.y ?? NaN, 50);
  });
});

describe('resizeElementInGroup', () => {
  it('scales positions and sizes uniformly from the frame anchor', () => {
    const a = rect(0, 0, 50, 50);
    const b = rect(100, 50, 50, 50);
    const frame = { x: 0, y: 0, width: 150, height: 100, angle: 0 };
    const m = computeResize(
      frame,
      'se',
      { x: 300, y: 120 },
      { keepAspect: true, fromCenter: false },
    );
    expect(m.sx).toBe(2);
    expect(m.sy).toBe(2);
    expect(applyGeometry(b, resizeElementInGroup(b, frame, m))).toMatchObject({
      x: 200,
      y: 100,
      width: 100,
      height: 100,
    });
    expect(applyGeometry(a, resizeElementInGroup(a, frame, m))).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
    });
  });

  it('negates the angle when one axis flips', () => {
    const a = rect(0, 0, 50, 20, 0.5);
    const frame = { x: 0, y: 0, width: 100, height: 100, angle: 0 };
    const m = { anchor: { x: 50, y: 50 }, sx: -1, sy: 1 };
    const next = applyGeometry(a, resizeElementInGroup(a, frame, m));
    close(next.angle, Math.PI * 2 - 0.5);
    close(rectCenter(next).x, 75);
  });
});

describe('rotation', () => {
  it('snaps the absolute angle with Shift', () => {
    close(rotatedAngle(0.1, 0.2, true), Math.PI / 12);
    close(rotatedAngle(0, -Math.PI / 2, false), (3 * Math.PI) / 2);
  });

  it('rotates members around a shared pivot', () => {
    const el = rect(100, -10, 20, 20);
    const next = applyGeometry(el, rotateElementAround(el, { x: 0, y: 0 }, Math.PI / 2));
    const c = rectCenter(next);
    close(c.x, 0);
    close(c.y, 110);
    close(next.angle, Math.PI / 2);
  });
});
