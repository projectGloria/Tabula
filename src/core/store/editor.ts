import { elementBounds } from '../geometry/element-bounds';
import type { Point } from '../geometry/vec';
import { hitTopmost } from '../hit/hit-test';
import {
  applyEntry,
  History,
  makeEntry,
  restoredSelection,
  type Snapshot,
} from '../history/history';
import type { ElementId, Scene } from '../model/types';
import { GridIndex } from '../spatial/grid-index';
import { createInitialState, type AppState } from './app-state';
import { createStore, type Listener, type Store } from './store';

/** Hit tolerance in screen pixels. */
export const HIT_TOLERANCE_PX = 6;

export interface UpdateOptions {
  /**
   * `'skip'` leaves the change out of history (camera, viewport, loading a
   * drawing); a string key coalesces with the previous change of that key.
   */
  readonly history?: string;
}

/**
 * Editor = store + derived spatial index + undo history. All state changes go
 * through `update`, which keeps the index in sync *before* subscribers are
 * notified.
 *
 * History records scene changes. Inside a transaction (`begin`/`end`, nested)
 * every change collapses into one entry, so a whole drag is one undo step.
 */
export class Editor {
  readonly index = new GridIndex<ElementId>();
  readonly history = new History();
  private readonly store: Store<AppState>;
  private txDepth = 0;
  private txBase: Snapshot | null = null;
  private txKey: string | null = null;
  private historyListeners = new Set<Listener>();
  private now: () => number;

  constructor(initial: AppState = createInitialState(), now: () => number = () => Date.now()) {
    this.store = createStore(initial);
    this.now = now;
    this.syncIndex(null, initial.scene);
  }

  getState = (): AppState => this.store.getState();

  subscribe = (listener: Listener): (() => void) => this.store.subscribe(listener);

  /** Notified when undo/redo availability may have changed. */
  subscribeHistory = (listener: Listener): (() => void) => {
    this.historyListeners.add(listener);
    return () => {
      this.historyListeners.delete(listener);
    };
  };

  update = (fn: (prev: AppState) => AppState, options: UpdateOptions = {}): void => {
    const prev = this.store.getState();
    const next = fn(prev);
    if (next === prev) return;
    if (next.scene !== prev.scene) {
      this.syncIndex(prev.scene, next.scene);
      const h = options.history;
      if (h === 'skip') {
        // Not recorded; a transaction base still sees it as part of the gesture.
      } else if (this.txDepth > 0) {
        // The base is taken at the first scene change, so selection clicks
        // that precede a drag are not undone with it.
        this.txBase ??= { scene: prev.scene, selection: prev.selection };
        if (h !== undefined) this.txKey = h;
      } else {
        this.record(prev, next, h ?? null);
      }
    }
    this.store.setState(next);
  };

  /** Opens a (nestable) transaction; all scene changes until `end` become one entry. */
  begin = (): void => {
    if (this.txDepth++ === 0) {
      this.txBase = null;
      this.txKey = null;
    }
  };

  end = (): void => {
    if (this.txDepth === 0) return;
    if (--this.txDepth > 0) return;
    const base = this.txBase;
    this.txBase = null;
    if (base) this.record(base, this.getState(), this.txKey);
  };

  get inTransaction(): boolean {
    return this.txDepth > 0;
  }

  undo = (): void => {
    if (this.txDepth > 0) return;
    const entry = this.history.popUndo();
    if (!entry) return;
    this.applyHistory((s) => {
      const scene = applyEntry(s.scene, entry, 'before');
      return { ...s, scene, selection: restoredSelection(scene, entry.selectionBefore) };
    });
  };

  redo = (): void => {
    if (this.txDepth > 0) return;
    const entry = this.history.popRedo();
    if (!entry) return;
    this.applyHistory((s) => {
      const scene = applyEntry(s.scene, entry, 'after');
      return { ...s, scene, selection: restoredSelection(scene, entry.selectionAfter) };
    });
  };

  /** Replaces the whole state without history (e.g. opening a drawing) and clears history. */
  reset = (fn: (prev: AppState) => AppState): void => {
    this.txDepth = 0;
    this.txBase = null;
    this.update(fn, { history: 'skip' });
    this.history.clear();
    this.emitHistory();
  };

  /** Topmost unlocked element under a world point. */
  hitTest(world: Point, tolerancePx: number = HIT_TOLERANCE_PX): ElementId | undefined {
    const state = this.getState();
    return hitTopmost(state.scene, this.index, world, tolerancePx / state.camera.zoom);
  }

  private applyHistory(fn: (s: AppState) => AppState): void {
    this.update(fn, { history: 'skip' });
    this.emitHistory();
  }

  private record(a: Snapshot, b: Snapshot, key: string | null): void {
    const entry = makeEntry(a, b, key, this.now());
    if (!entry) return;
    this.history.push(entry);
    this.emitHistory();
  }

  private emitHistory(): void {
    for (const l of [...this.historyListeners]) l();
  }

  private syncIndex(prev: Scene | null, next: Scene): void {
    if (prev) {
      for (const id of Object.keys(prev.entities) as ElementId[]) {
        if (!next.entities[id]) this.index.remove(id);
      }
    }
    for (const id of Object.keys(next.entities) as ElementId[]) {
      const el = next.entities[id];
      if (!el) continue;
      if (prev?.entities[id] === el && this.index.has(id)) continue;
      this.index.set(id, elementBounds(el));
    }
  }
}
