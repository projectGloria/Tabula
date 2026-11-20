import { describe, expect, it } from 'vitest';
import { createRectangle, mutateElement } from '../model/scene';
import type { ElementId } from '../model/types';
import { createInitialState, selectedIds } from '../store/app-state';
import {
  addElements,
  clearSelection,
  deleteElements,
  moveElements,
  panCamera,
  setSelection,
  setTool,
  setViewport,
  toggleDebug,
  toggleSelected,
  updateElement,
  zoomCameraAt,
} from './actions';
import { COMMANDS } from './commands';

const a = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
const b = createRectangle({ x: 20, y: 0, width: 10, height: 10 });
const base = addElements(createInitialState(), [a, b]);

describe('actions', () => {
  it('return the same state for no-ops', () => {
    expect(setTool(base, 'select')).toBe(base);
    expect(clearSelection(base)).toBe(base);
    expect(moveElements(base, [a.id], 0, 0)).toBe(base);
    expect(panCamera(base, 0, 0)).toBe(base);
    expect(addElements(base, [])).toBe(base);
    expect(updateElement(base, 'nope' as ElementId, { x: 1 })).toBe(base);
    expect(deleteElements(base, ['nope' as ElementId])).toBe(base);
    expect(setViewport(base, 0, 0)).toBe(base);
  });

  it('selects only existing ids and ignores identical selections', () => {
    const s = setSelection(base, [a.id, 'ghost' as ElementId]);
    expect(selectedIds(s)).toEqual([a.id]);
    expect(setSelection(s, [a.id])).toBe(s);
    expect(setSelection(s, [])).toEqual(clearSelection(s));
  });

  it('toggles selection', () => {
    const s = toggleSelected(toggleSelected(base, a.id), b.id);
    expect(selectedIds(s)).toEqual([a.id, b.id]);
    expect(selectedIds(toggleSelected(s, a.id))).toEqual([b.id]);
  });

  it('moves unlocked elements and skips locked ones', () => {
    const locked = updateElement(base, b.id, { locked: true });
    const s = moveElements(locked, [a.id, b.id], 5, -5);
    expect(s.scene.entities[a.id]).toMatchObject({ x: 5, y: -5, revision: 1 });
    expect(s.scene.entities[b.id]?.x).toBe(20);
  });

  it('deletes elements and drops them from the selection', () => {
    const s = deleteElements(setSelection(base, [a.id, b.id]), [a.id]);
    expect(s.scene.order).toEqual([b.id]);
    expect(selectedIds(s)).toEqual([b.id]);
  });

  it('updates via patch and bumps revision', () => {
    const s = updateElement(base, a.id, { width: 99 });
    expect(s.scene.entities[a.id]).toEqual(mutateElement(a, { width: 99 }));
  });

  it('zooms and pans the camera', () => {
    const z = zoomCameraAt(base, { x: 0, y: 0 }, 2);
    expect(z.camera.zoom).toBe(2);
    expect(panCamera(z, 10, 0).camera.x).toBe(-5);
  });

  it('toggles debug and runs commands', () => {
    expect(toggleDebug(base).debug).toBe(true);
    expect(COMMANDS['tool.rectangle'].run(setSelection(base, [a.id]))).toMatchObject({
      activeTool: 'rectangle',
      selection: {},
    });
    expect(COMMANDS['debug.toggle'].devOnly).toBe(true);
  });
});
