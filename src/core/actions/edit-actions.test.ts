import { describe, expect, it } from 'vitest';
import { expandToGroups, selectionTargetGroup } from '../model/groups';
import { createLine, createRectangle, mutateElement } from '../model/scene';
import type { GroupId, SceneElement } from '../model/types';
import { createInitialState, selectedIds, type AppState } from '../store/app-state';
import { addElements, setSelection } from './actions';
import {
  alignSelection,
  deleteSelection,
  deselect,
  distributeSelection,
  duplicateSelection,
  DUPLICATE_OFFSET,
  flipSelection,
  groupSelection,
  moveInZ,
  nudgeSelection,
  selectAll,
  setFocusGroup,
  toggleLockSelection,
  ungroupSelection,
  unlockAll,
} from './edit-actions';

const rect = (x: number, y: number, w = 10, h = 10) =>
  createRectangle({ x, y, width: w, height: h });

function stateWith(...els: SceneElement[]): AppState {
  return addElements(createInitialState(), els);
}

function el(s: AppState, id: string): SceneElement {
  const e = s.scene.entities[id as SceneElement['id']];
  if (!e) throw new Error(`missing ${id}`);
  return e;
}

describe('selection actions', () => {
  it('selectAll skips locked elements; deselect clears then leaves focus', () => {
    const a = rect(0, 0);
    const b = mutateElement(rect(20, 0), { locked: true });
    let s = selectAll(stateWith(a, b));
    expect(selectedIds(s)).toEqual([a.id]);
    s = { ...s, focusGroup: 'g' as GroupId };
    s = deselect(s);
    expect(selectedIds(s)).toEqual([]);
    expect(s.focusGroup).toBe('g');
    expect(deselect(s).focusGroup).toBeNull();
  });
});

describe('delete and duplicate', () => {
  it('deletes only unlocked selected elements', () => {
    const a = rect(0, 0);
    const b = mutateElement(rect(20, 0), { locked: true });
    const s = deleteSelection(setSelection(stateWith(a, b), [a.id, b.id]));
    expect(s.scene.order).toEqual([b.id]);
  });

  it('duplicates above the source with an offset and selects copies', () => {
    const a = rect(0, 0);
    const b = rect(50, 0);
    const s = duplicateSelection(setSelection(stateWith(a, b), [a.id]));
    expect(s.scene.order).toHaveLength(3);
    const copyId = s.scene.order[1];
    expect(copyId).not.toBe(a.id);
    const copy = el(s, copyId ?? '');
    expect(copy.x).toBe(DUPLICATE_OFFSET);
    expect(copy.seed).toBe(a.seed);
    expect(selectedIds(s)).toEqual([copyId]);
  });

  it('gives fully copied groups new ids and keeps partially copied ones', () => {
    const g = 'outer' as GroupId;
    const a = mutateElement(rect(0, 0), { groupIds: [g] });
    const b = mutateElement(rect(20, 0), { groupIds: [g] });
    const whole = duplicateSelection(setSelection(stateWith(a, b), [a.id, b.id]));
    const copies = selectedIds(whole).map((id) => el(whole, id));
    expect(copies.every((c) => c.groupIds[0] !== g)).toBe(true);
    expect(copies[0]?.groupIds[0]).toBe(copies[1]?.groupIds[0]);
    const part = duplicateSelection(setSelection(stateWith(a, b), [a.id]));
    expect(el(part, selectedIds(part)[0] ?? '').groupIds).toEqual([g]);
  });
});

describe('groups', () => {
  it('groups, expands clicks to the group, and ungroups', () => {
    const a = rect(0, 0);
    const b = rect(20, 0);
    const c = rect(40, 0);
    let s = groupSelection(setSelection(stateWith(a, b, c), [a.id, b.id]));
    const g = el(s, a.id).groupIds[0];
    expect(g).toBeDefined();
    expect(el(s, b.id).groupIds).toEqual([g]);
    expect(expandToGroups(s.scene, [a.id], null)).toEqual([a.id, b.id]);
    // Grouping an existing exact group is a no-op.
    expect(groupSelection(setSelection(s, [a.id, b.id]))).toBe(setSelection(s, [a.id, b.id]));
    s = ungroupSelection(setSelection(s, [a.id, b.id]));
    expect(el(s, a.id).groupIds).toEqual([]);
  });

  it('nests groups outermost-last and respects focus', () => {
    const a = rect(0, 0);
    const b = rect(20, 0);
    const c = rect(40, 0);
    let s = groupSelection(setSelection(stateWith(a, b, c), [a.id, b.id]));
    const inner = el(s, a.id).groupIds[0] ?? ('' as GroupId);
    s = groupSelection(setSelection(s, [a.id, b.id, c.id]));
    const outer = el(s, c.id).groupIds[0] ?? ('' as GroupId);
    expect(el(s, a.id).groupIds).toEqual([inner, outer]);
    expect(selectionTargetGroup(el(s, a.id), null)).toBe(outer);
    expect(selectionTargetGroup(el(s, a.id), outer)).toBe(inner);
    expect(selectionTargetGroup(el(s, a.id), inner)).toBeNull();
    const focused = setFocusGroup(s, outer);
    expect(expandToGroups(focused.scene, [a.id], outer)).toEqual([a.id, b.id]);
    expect(expandToGroups(focused.scene, [c.id], outer)).toEqual([c.id]);
  });

  it('nests a new group inside a partially covered one', () => {
    const g = 'big' as GroupId;
    const a = mutateElement(rect(0, 0), { groupIds: [g] });
    const b = mutateElement(rect(20, 0), { groupIds: [g] });
    const c = mutateElement(rect(40, 0), { groupIds: [g] });
    const s = groupSelection(setSelection(stateWith(a, b, c), [a.id, b.id]));
    const ids = el(s, a.id).groupIds;
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(g);
    expect(el(s, c.id).groupIds).toEqual([g]);
  });
});

describe('z-order', () => {
  const a = rect(0, 0);
  const b = rect(0, 0);
  const c = rect(0, 0);
  const base = stateWith(a, b, c);
  it('moves forward, backward, to front and back', () => {
    expect(moveInZ(setSelection(base, [a.id]), 'forward').scene.order).toEqual([b.id, a.id, c.id]);
    expect(moveInZ(setSelection(base, [c.id]), 'backward').scene.order).toEqual([a.id, c.id, b.id]);
    expect(moveInZ(setSelection(base, [a.id]), 'front').scene.order).toEqual([b.id, c.id, a.id]);
    expect(moveInZ(setSelection(base, [b.id, c.id]), 'back').scene.order).toEqual([
      b.id,
      c.id,
      a.id,
    ]);
  });
  it('returns the same state when nothing moves', () => {
    const s = setSelection(base, [c.id]);
    expect(moveInZ(s, 'front')).toBe(s);
  });
});

describe('align and distribute', () => {
  it('aligns left and centers', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(30, 20, 20, 10);
    const s = setSelection(stateWith(a, b), [a.id, b.id]);
    expect(el(alignSelection(s, 'left'), b.id).x).toBe(0);
    expect(el(alignSelection(s, 'right'), a.id).x).toBe(40);
    expect(el(alignSelection(s, 'centerY'), a.id).y).toBe(10);
  });

  it('distributes with equal gaps, keeping the outer ones', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(15, 0, 10, 10);
    const c = rect(90, 0, 10, 10);
    const s = distributeSelection(setSelection(stateWith(a, b, c), [a.id, b.id, c.id]), 'x');
    expect(el(s, a.id).x).toBe(0);
    expect(el(s, b.id).x).toBe(45);
    expect(el(s, c.id).x).toBe(90);
  });

  it('treats a group as one unit', () => {
    const a = rect(0, 0);
    const b = rect(20, 50);
    const c = rect(100, 100);
    let s = groupSelection(setSelection(stateWith(a, b, c), [a.id, b.id]));
    s = alignSelection(setSelection(s, [a.id, b.id, c.id]), 'top');
    expect(el(s, a.id).y).toBe(0);
    expect(el(s, b.id).y).toBe(50);
    expect(el(s, c.id).y).toBe(0);
  });
});

describe('flip, lock, nudge', () => {
  it('flips positions and line points horizontally', () => {
    const a = rect(0, 0);
    const line = mutateElement(createLine({ x: 50, y: 0 }), {
      width: 10,
      height: 10,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    const s = flipSelection(setSelection(stateWith(a, line), [a.id, line.id]), 'horizontal');
    expect(el(s, a.id).x).toBe(50);
    expect(el(s, line.id).x).toBe(0);
    const flipped = el(s, line.id);
    expect(flipped.type === 'line' ? flipped.points : null).toEqual([
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ]);
  });

  it('toggles lock, ignores locked when nudging, and unlocks all', () => {
    const a = rect(0, 0);
    let s = toggleLockSelection(setSelection(stateWith(a), [a.id]));
    expect(el(s, a.id).locked).toBe(true);
    expect(nudgeSelection(s, 5, 0)).toBe(s);
    s = unlockAll(s);
    expect(el(s, a.id).locked).toBe(false);
    expect(el(nudgeSelection(s, 5, 0), a.id).x).toBe(5);
  });
});
