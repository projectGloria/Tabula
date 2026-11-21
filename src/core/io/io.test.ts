import { describe, expect, it } from 'vitest';
import { addElements, setSelection } from '../actions/actions';
import { createArrow, createRectangle, mutateElement } from '../model/scene';
import type { GroupId } from '../model/types';
import { createInitialState, selectedIds } from '../store/app-state';
import {
  CLIPBOARD_KIND,
  copyableElements,
  parseClipboard,
  pasteElements,
  serializeClipboard,
} from './clipboard';
import { MAX_POINTS, sanitizeElement, sanitizeElements, sanitizeStyle } from './validate';

describe('sanitizeElement', () => {
  it('round-trips a valid element with revision reset', () => {
    const a = { ...createRectangle({ x: 1, y: 2, width: 3, height: 4 }), revision: 9 };
    const parsed = sanitizeElement(JSON.parse(JSON.stringify(a)));
    expect(parsed).toEqual({ ...a, revision: 0 });
  });

  it('rejects unknown types, missing ids and bad point lists', () => {
    expect(sanitizeElement({ id: 'x', type: 'blob' })).toBeNull();
    expect(sanitizeElement({ type: 'rectangle' })).toBeNull();
    expect(sanitizeElement({ id: 'x', type: 'line', points: [] })).toBeNull();
    expect(sanitizeElement({ id: 'x', type: 'line', points: [{ x: 'a', y: 0 }] })).toBeNull();
    const huge = Array.from({ length: MAX_POINTS + 1 }, () => ({ x: 0, y: 0 }));
    expect(sanitizeElement({ id: 'x', type: 'line', points: huge })).toBeNull();
  });

  it('replaces malformed fields with safe defaults', () => {
    const el = sanitizeElement({
      id: 'x',
      type: 'arrow',
      x: Infinity,
      width: -5,
      locked: 'yes',
      groupIds: ['g', 'g', 42],
      points: [{ x: 0, y: 0 }],
      endHead: 'rocket',
    });
    expect(el).toMatchObject({ x: 0, width: 5, locked: false, groupIds: ['g'], endHead: 'arrow' });
  });

  it('sanitizes style values', () => {
    const s = sanitizeStyle({ strokeColor: 'red;}', opacity: 250, fillStyle: 'zigzag' });
    expect(s.opacity).toBe(100);
    expect(s.fillStyle).toBe('none');
    expect(s.strokeColor.startsWith('#')).toBe(true);
  });

  it('drops duplicate ids', () => {
    const a = createRectangle({ x: 0, y: 0 });
    expect(sanitizeElements([a, a, null, 'x'])).toHaveLength(1);
  });
});

describe('clipboard', () => {
  const a = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
  const b = createArrow({ x: 20, y: 20 });
  const state = setSelection(addElements(createInitialState(), [a, b]), [a.id]);

  it('serializes the selection and parses it back', () => {
    const text = serializeClipboard(copyableElements(state));
    expect(text).toContain(CLIPBOARD_KIND);
    expect(parseClipboard(text)?.map((e) => e.id)).toEqual([a.id]);
  });

  it('ignores foreign or future payloads', () => {
    expect(parseClipboard('hello')).toBeNull();
    expect(parseClipboard('{"kind":"other","version":1,"elements":[]}')).toBeNull();
    expect(
      parseClipboard(JSON.stringify({ kind: CLIPBOARD_KIND, version: 99, elements: [a] })),
    ).toBeNull();
    expect(parseClipboard('{not json')).toBeNull();
  });

  it('pastes centered at a point with fresh ids and groups', () => {
    const g = 'g' as GroupId;
    const grouped = [
      mutateElement(a, { groupIds: [g] }),
      mutateElement(createRectangle({ x: 30, y: 0, width: 10, height: 10 }), { groupIds: [g] }),
    ];
    const s = pasteElements(state, grouped, { x: 100, y: 100 });
    const copies = selectedIds(s).map((id) => s.scene.entities[id]);
    expect(copies).toHaveLength(2);
    expect(copies[0]?.id).not.toBe(a.id);
    expect(copies[0]?.x).toBe(80);
    expect(copies[0]?.groupIds[0]).not.toBe(g);
    expect(copies[0]?.groupIds).toEqual(copies[1]?.groupIds);
    expect(s.scene.order.slice(-2)).toEqual(selectedIds(s));
  });

  it('pastes in place when no point is given', () => {
    const s = pasteElements(state, [a], null);
    const copy = s.scene.entities[selectedIds(s)[0] ?? a.id];
    expect(copy?.x).toBe(0);
  });
});
