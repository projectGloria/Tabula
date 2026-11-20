import { describe, expect, it } from 'vitest';
import { elementBounds } from '../geometry/element-bounds';
import { createRectangle, EMPTY_SCENE, insertElements, mutateElement } from '../model/scene';
import { DEFAULT_STYLE } from '../model/style';
import type { ElementId, RectangleElement } from '../model/types';
import { GridIndex } from '../spatial/grid-index';
import { hitTestElement, hitTopmost } from './hit-test';

const rect = (x: number, y: number, w: number, h: number, filled = false): RectangleElement =>
  createRectangle({
    x,
    y,
    width: w,
    height: h,
    style: { ...DEFAULT_STYLE, fillStyle: filled ? 'solid' : 'none' },
  });

describe('hitTestElement', () => {
  it('hits only near the outline of unfilled rectangles', () => {
    const r = rect(0, 0, 100, 100);
    expect(hitTestElement(r, { x: 0, y: 50 }, 4)).toBe(true);
    expect(hitTestElement(r, { x: -4, y: 50 }, 4)).toBe(true);
    expect(hitTestElement(r, { x: 50, y: 50 }, 4)).toBe(false);
    expect(hitTestElement(r, { x: -10, y: 50 }, 4)).toBe(false);
  });

  it('hits anywhere inside filled rectangles', () => {
    expect(hitTestElement(rect(0, 0, 100, 100, true), { x: 50, y: 50 }, 4)).toBe(true);
  });

  it('respects rotation', () => {
    // A thin 100×10 bar rotated 90° becomes vertical around its center (50, 5).
    const bar = mutateElement(rect(0, 0, 100, 10, true), { angle: Math.PI / 2 });
    expect(hitTestElement(bar, { x: 50, y: 40 }, 1)).toBe(true);
    expect(hitTestElement(bar, { x: 90, y: 5 }, 1)).toBe(false);
  });
});

describe('hitTopmost', () => {
  const build = (els: RectangleElement[]) => {
    const scene = insertElements(EMPTY_SCENE, els);
    const index = new GridIndex<ElementId>();
    for (const el of els) index.set(el.id, elementBounds(el));
    return { scene, index };
  };

  it('returns the topmost overlapping element', () => {
    const bottom = rect(0, 0, 100, 100, true);
    const top = rect(50, 50, 100, 100, true);
    const { scene, index } = build([bottom, top]);
    expect(hitTopmost(scene, index, { x: 75, y: 75 }, 2)).toBe(top.id);
    expect(hitTopmost(scene, index, { x: 25, y: 25 }, 2)).toBe(bottom.id);
    expect(hitTopmost(scene, index, { x: 500, y: 500 }, 2)).toBeUndefined();
  });

  it('ignores locked elements', () => {
    const bottom = rect(0, 0, 100, 100, true);
    const top = mutateElement(rect(0, 0, 100, 100, true), { locked: true });
    const { scene, index } = build([bottom, top]);
    expect(hitTopmost(scene, index, { x: 50, y: 50 }, 2)).toBe(bottom.id);
  });
});
