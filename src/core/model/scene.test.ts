import { describe, expect, it } from 'vitest';
import {
  createRectangle,
  EMPTY_SCENE,
  insertElements,
  mutateElement,
  orderedElements,
  removeElements,
  replaceElements,
} from './scene';
import type { ElementId } from './types';

describe('scene model', () => {
  it('creates rectangles with fresh ids, seeds and revision 0', () => {
    const a = createRectangle({ x: 1, y: 2 });
    const b = createRectangle({ x: 1, y: 2 });
    expect(a.id).not.toBe(b.id);
    expect(a.seed).toBeGreaterThan(0);
    expect(a.revision).toBe(0);
    expect(a).toMatchObject({ type: 'rectangle', x: 1, y: 2, width: 0, height: 0, angle: 0 });
  });

  it('inserts on top and at an index, and rejects duplicates', () => {
    const a = createRectangle({ x: 0, y: 0 });
    const b = createRectangle({ x: 0, y: 0 });
    const c = createRectangle({ x: 0, y: 0 });
    let s = insertElements(EMPTY_SCENE, [a, b]);
    s = insertElements(s, [c], 1);
    expect(s.order).toEqual([a.id, c.id, b.id]);
    expect(orderedElements(s).map((e) => e.id)).toEqual([a.id, c.id, b.id]);
    expect(() => insertElements(s, [a])).toThrow(/Duplicate/);
    expect(EMPTY_SCENE.order).toHaveLength(0);
  });

  it('mutates immutably and bumps revision', () => {
    const a = createRectangle({ x: 0, y: 0 });
    const m = mutateElement(a, { x: 10 });
    expect(m).not.toBe(a);
    expect(m.x).toBe(10);
    expect(m.revision).toBe(1);
    expect(a.x).toBe(0);
  });

  it('replaces only known, changed elements', () => {
    const a = createRectangle({ x: 0, y: 0 });
    const s = insertElements(EMPTY_SCENE, [a]);
    expect(replaceElements(s, [a])).toBe(s);
    expect(replaceElements(s, [createRectangle({ x: 0, y: 0 })])).toBe(s);
    const s2 = replaceElements(s, [mutateElement(a, { y: 3 })]);
    expect(s2.entities[a.id]?.y).toBe(3);
    expect(s2.order).toBe(s.order);
  });

  it('removes from entities and order', () => {
    const a = createRectangle({ x: 0, y: 0 });
    const b = createRectangle({ x: 0, y: 0 });
    const s = insertElements(EMPTY_SCENE, [a, b]);
    const s2 = removeElements(s, [a.id]);
    expect(s2.entities[a.id]).toBeUndefined();
    expect(s2.order).toEqual([b.id]);
    expect(removeElements(s2, ['missing' as ElementId])).toBe(s2);
  });
});
