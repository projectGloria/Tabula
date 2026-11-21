import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addElements } from '../actions/actions';
import { createRectangle } from '../model/scene';
import { Editor } from '../store/editor';
import { DrawingSession, type TabChannel, type TabMessage } from './session';
import { MemoryStore } from './store';

/** In-process stand-in for BroadcastChannel linking several sessions. */
function channelHub() {
  const members = new Set<(m: unknown) => void>();
  return (): TabChannel => {
    let own: ((m: unknown) => void) | null = null;
    return {
      post: (m: TabMessage) => {
        for (const l of members) if (l !== own) l(m);
      },
      onMessage: (l) => {
        own = l;
        members.add(l);
      },
      close: () => {
        if (own) members.delete(own);
      },
    };
  };
}

let counter = 0;
const newId = () => `id-${String(++counter)}`;

function makeSession(store: MemoryStore, channel: TabChannel | null = null) {
  const editor = new Editor();
  const session = new DrawingSession(editor, {
    store,
    channel,
    newId,
    defaultName: () => 'Untitled',
    debounceMs: 100,
  });
  return { editor, session };
}

const addRect = (editor: Editor) => {
  editor.update((s) => addElements(s, [createRectangle({ x: 0, y: 0, width: 10, height: 10 })]));
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('DrawingSession', () => {
  it('creates a first drawing and restores it on the next start', async () => {
    const store = new MemoryStore();
    const a = makeSession(store);
    await a.session.start();
    addRect(a.editor);
    expect(a.session.getInfo().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(150);
    expect(a.session.getInfo().status).toBe('saved');

    const b = makeSession(store);
    await b.session.start();
    expect(b.session.getInfo().id).toBe(a.session.getInfo().id);
    expect(b.editor.getState().scene.order).toEqual(a.editor.getState().scene.order);
    expect(b.editor.history.canUndo).toBe(false);
  });

  it('debounces bursts of edits into one write', async () => {
    const store = new MemoryStore();
    const put = vi.spyOn(store, 'putDrawing');
    const { editor, session } = makeSession(store);
    await session.start();
    put.mockClear();
    for (let i = 0; i < 5; i++) {
      addRect(editor);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('reports quota errors instead of throwing', async () => {
    const store = new MemoryStore();
    const { editor, session } = makeSession(store);
    await session.start();
    store.failWrites = true;
    addRect(editor);
    await vi.advanceTimersByTimeAsync(150);
    expect(session.getInfo().status).toBe('quota');
  });

  it('creates, switches, renames, duplicates and deletes drawings', async () => {
    const store = new MemoryStore();
    const { editor, session } = makeSession(store);
    await session.start();
    const first = session.getInfo().id ?? '';
    addRect(editor);

    const second = await session.create();
    expect(editor.getState().scene.order).toEqual([]);
    expect((await store.getDrawing(first))?.doc.elements).toHaveLength(1);

    await session.rename(first, '  Plan  ');
    expect((await store.getDrawing(first))?.meta.name).toBe('Plan');

    const copy = await session.duplicate(first, (n) => `${n} copy`);
    expect(copy).not.toBeNull();
    expect((await store.getDrawing(copy ?? ''))?.meta.name).toBe('Plan copy');

    expect(await session.open(first)).toBe(true);
    expect(editor.getState().scene.order).toHaveLength(1);
    expect(session.getInfo().name).toBe('Plan');

    await session.remove(first);
    expect(await store.getDrawing(first)).toBeUndefined();
    expect([second, copy]).toContain(session.getInfo().id);
  });

  it('pauses saving when another tab opens the same drawing', async () => {
    const store = new MemoryStore();
    const hub = channelHub();
    const a = makeSession(store, hub());
    await a.session.start();
    const b = makeSession(store, hub());
    await b.session.start();
    expect(b.session.getInfo().id).toBe(a.session.getInfo().id);
    expect(a.session.getInfo().conflict).toBe(true);
    expect(b.session.getInfo().conflict).toBe(false);

    const put = vi.spyOn(store, 'putDrawing');
    addRect(a.editor);
    await vi.advanceTimersByTimeAsync(150);
    expect(put).not.toHaveBeenCalled();

    await a.session.takeOver();
    expect(a.session.getInfo().conflict).toBe(false);
    expect(b.session.getInfo().conflict).toBe(true);
    expect(put).toHaveBeenCalled();
  });

  it('collects file ids referenced by stored drawings', async () => {
    const store = new MemoryStore();
    const { session } = makeSession(store);
    await session.start();
    const rec = await store.getDrawing(session.getInfo().id ?? '');
    if (!rec) throw new Error('missing');
    await store.putDrawing({
      ...rec,
      doc: {
        ...rec.doc,
        elements: [{ ...createRectangle({ x: 0, y: 0 }), fileId: 'f1' } as never],
      },
    });
    expect([...(await session.referencedFiles(['f2']))].sort()).toEqual(['f1', 'f2']);
  });
});
