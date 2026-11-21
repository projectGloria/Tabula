import { describe, expect, it } from 'vitest';
import { addElements, moveElements, setSelection } from '../actions/actions';
import { executeCommand, COMMANDS } from '../actions/commands';
import { createRectangle } from '../model/scene';
import { selectedIds } from '../store/app-state';
import { Editor } from '../store/editor';
import { COALESCE_MS, MAX_HISTORY } from './history';

function setup() {
  let t = 0;
  const editor = new Editor(undefined, () => t);
  const advance = (ms: number): void => {
    t += ms;
  };
  const a = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
  return { editor, advance, a };
}

describe('history', () => {
  it('undoes and redoes a scene change, restoring selection', () => {
    const { editor, a } = setup();
    editor.update((s) => setSelection(addElements(s, [a]), [a.id]));
    expect(editor.history.canUndo).toBe(true);
    editor.update((s) => moveElements(s, [a.id], 5, 0));
    editor.undo();
    expect(editor.getState().scene.entities[a.id]?.x).toBe(0);
    editor.undo();
    expect(editor.getState().scene.order).toEqual([]);
    expect(selectedIds(editor.getState())).toEqual([]);
    editor.redo();
    editor.redo();
    expect(editor.getState().scene.entities[a.id]?.x).toBe(5);
    expect(editor.history.canRedo).toBe(false);
  });

  it('does not record selection-only or skipped changes', () => {
    const { editor, a } = setup();
    editor.update((s) => addElements(s, [a]), { history: 'skip' });
    editor.update((s) => setSelection(s, [a.id]));
    expect(editor.history.canUndo).toBe(false);
  });

  it('coalesces keyed changes inside the window only', () => {
    const { editor, advance, a } = setup();
    editor.update((s) => addElements(s, [a]));
    for (let i = 0; i < 5; i++) {
      advance(100);
      editor.update((s) => moveElements(s, [a.id], 1, 0), { history: 'nudge' });
    }
    expect(editor.history.size).toBe(2);
    advance(COALESCE_MS + 1);
    editor.update((s) => moveElements(s, [a.id], 1, 0), { history: 'nudge' });
    expect(editor.history.size).toBe(3);
    editor.undo();
    editor.undo();
    expect(editor.getState().scene.entities[a.id]?.x).toBe(0);
  });

  it('collapses a transaction into one entry', () => {
    const { editor, a } = setup();
    editor.begin();
    editor.update((s) => addElements(s, [a]));
    editor.update((s) => moveElements(s, [a.id], 3, 0));
    editor.update((s) => moveElements(s, [a.id], 3, 0));
    expect(editor.history.size).toBe(0);
    editor.end();
    expect(editor.history.size).toBe(1);
    editor.undo();
    expect(editor.getState().scene.order).toEqual([]);
  });

  it('ignores undo inside a transaction and records nothing for an empty one', () => {
    const { editor, a } = setup();
    editor.update((s) => addElements(s, [a]));
    editor.begin();
    editor.undo();
    expect(editor.getState().scene.order).toEqual([a.id]);
    editor.end();
    expect(editor.history.size).toBe(1);
  });

  it('clears redo on a new change and caps the stack', () => {
    const { editor, advance, a } = setup();
    editor.update((s) => addElements(s, [a]));
    editor.update((s) => moveElements(s, [a.id], 1, 0));
    editor.undo();
    editor.update((s) => moveElements(s, [a.id], 0, 1));
    expect(editor.history.canRedo).toBe(false);
    for (let i = 0; i < MAX_HISTORY + 20; i++) {
      advance(10);
      editor.update((s) => moveElements(s, [a.id], 1, 0));
    }
    expect(editor.history.size).toBe(MAX_HISTORY);
  });

  it('notifies history listeners', () => {
    const { editor, a } = setup();
    let calls = 0;
    editor.subscribeHistory(() => {
      calls++;
    });
    editor.update((s) => addElements(s, [a]));
    editor.undo();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('runs undo/redo through commands', () => {
    const { editor, a } = setup();
    editor.update((s) => addElements(s, [a]));
    executeCommand(editor, COMMANDS['history.undo']);
    expect(editor.getState().scene.order).toEqual([]);
    executeCommand(editor, COMMANDS['history.redo']);
    expect(editor.getState().scene.order).toEqual([a.id]);
  });
});
