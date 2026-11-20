import { describe, expect, it, vi } from 'vitest';
import { addElements } from '../actions/actions';
import { createRectangle, mutateElement } from '../model/scene';
import { createInitialState } from './app-state';
import { Editor } from './editor';
import { createStore } from './store';

describe('createStore', () => {
  it('notifies subscribers only on change', () => {
    const store = createStore({ n: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState((s) => s);
    expect(listener).not.toHaveBeenCalled();
    store.setState((s) => ({ n: s.n + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().n).toBe(1);
    unsubscribe();
    store.setState({ n: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('Editor', () => {
  it('keeps the spatial index in sync with the scene', () => {
    const editor = new Editor();
    const a = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
    editor.update((s) => addElements(s, [a]));
    expect(editor.index.has(a.id)).toBe(true);

    const moved = mutateElement(a, { x: 1000 });
    editor.update((s) => ({ ...s, scene: { ...s.scene, entities: { [a.id]: moved } } }));
    expect(editor.index.getBox(a.id)?.minX).toBeLessThan(1000);
    expect(editor.index.getBox(a.id)?.minX).toBeGreaterThan(990);

    editor.update((s) => ({ ...s, scene: { entities: {}, order: [] } }));
    expect(editor.index.size).toBe(0);
  });

  it('indexes the initial scene and syncs before notifying', () => {
    const a = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
    const editor = new Editor(createInitialState());
    let seen = -1;
    editor.subscribe(() => {
      seen = editor.index.size;
    });
    editor.update((s) => addElements(s, [a]));
    expect(seen).toBe(1);
  });

  it('hit-tests with tolerance in screen pixels', () => {
    const editor = new Editor();
    const a = createRectangle({ x: 0, y: 0, width: 100, height: 100 });
    editor.update((s) => addElements(s, [a]));
    expect(editor.hitTest({ x: 105, y: 50 })).toBe(a.id); // within 6px + stroke
    expect(editor.hitTest({ x: 120, y: 50 })).toBeUndefined();
    editor.update((s) => ({ ...s, camera: { ...s.camera, zoom: 0.25 } }));
    expect(editor.hitTest({ x: 120, y: 50 })).toBe(a.id); // 6px / 0.25 = 24 world units
  });
});
