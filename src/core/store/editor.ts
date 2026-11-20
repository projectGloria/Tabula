import { elementBounds } from '../geometry/element-bounds';
import type { Point } from '../geometry/vec';
import { hitTopmost } from '../hit/hit-test';
import type { ElementId, Scene } from '../model/types';
import { GridIndex } from '../spatial/grid-index';
import { createInitialState, type AppState } from './app-state';
import { createStore, type Listener, type Store } from './store';

/** Hit tolerance in screen pixels. */
export const HIT_TOLERANCE_PX = 6;

/**
 * Editor = store + derived spatial index. All state changes go through
 * `update`, which keeps the index in sync *before* subscribers are notified.
 */
export class Editor {
  readonly index = new GridIndex<ElementId>();
  private readonly store: Store<AppState>;

  constructor(initial: AppState = createInitialState()) {
    this.store = createStore(initial);
    this.syncIndex(null, initial.scene);
  }

  getState = (): AppState => this.store.getState();

  subscribe = (listener: Listener): (() => void) => this.store.subscribe(listener);

  update = (fn: (prev: AppState) => AppState): void => {
    const prev = this.store.getState();
    const next = fn(prev);
    if (next === prev) return;
    if (next.scene !== prev.scene) this.syncIndex(prev.scene, next.scene);
    this.store.setState(next);
  };

  /** Topmost unlocked element under a world point. */
  hitTest(world: Point, tolerancePx: number = HIT_TOLERANCE_PX): ElementId | undefined {
    const state = this.getState();
    return hitTopmost(state.scene, this.index, world, tolerancePx / state.camera.zoom);
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
