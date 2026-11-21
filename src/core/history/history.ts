import type { ElementId, Scene, SceneElement } from '../model/types';
import type { Selection } from '../store/app-state';

/** Before/after snapshot of one element; `undefined` means "absent". */
export interface ElementChange {
  readonly before: SceneElement | undefined;
  readonly after: SceneElement | undefined;
}

/** One undoable step: the elements it touched plus order and selection around it. */
export interface HistoryEntry {
  readonly changes: ReadonlyMap<ElementId, ElementChange>;
  readonly orderBefore: readonly ElementId[];
  readonly orderAfter: readonly ElementId[];
  readonly selectionBefore: Selection;
  readonly selectionAfter: Selection;
  /** Coalescing key: consecutive entries with the same key merge (e.g. nudges, sliders). */
  readonly key: string | null;
  readonly time: number;
}

export const MAX_HISTORY = 200;
/** Same-key changes closer together than this merge into one entry. */
export const COALESCE_MS = 1000;

/** Equal except for `revision` (restores bump revisions without changing content). */
export function sameContent(a: SceneElement, b: SceneElement): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof SceneElement)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (k === 'revision') continue;
    if (a[k] !== (b as unknown as Record<string, unknown>)[k]) return false;
  }
  return true;
}

function sameOrder(a: readonly ElementId[], b: readonly ElementId[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Element-level diff of two scenes; empty when they differ only in revisions. */
export function diffScenes(a: Scene, b: Scene): Map<ElementId, ElementChange> {
  const out = new Map<ElementId, ElementChange>();
  if (a.entities === b.entities) return out;
  for (const id of Object.keys(b.entities) as ElementId[]) {
    const before = a.entities[id];
    const after = b.entities[id];
    if (before === after) continue;
    if (!before || !after || !sameContent(before, after)) out.set(id, { before, after });
  }
  for (const id of Object.keys(a.entities) as ElementId[]) {
    if (!b.entities[id]) out.set(id, { before: a.entities[id], after: undefined });
  }
  return out;
}

export interface Snapshot {
  readonly scene: Scene;
  readonly selection: Selection;
}

/** Builds an entry for `a → b`, or null when the scene content did not change. */
export function makeEntry(
  a: Snapshot,
  b: Snapshot,
  key: string | null,
  time: number,
): HistoryEntry | null {
  const changes = diffScenes(a.scene, b.scene);
  if (changes.size === 0 && sameOrder(a.scene.order, b.scene.order)) return null;
  return {
    changes,
    orderBefore: a.scene.order,
    orderAfter: b.scene.order,
    selectionBefore: a.selection,
    selectionAfter: b.selection,
    key,
    time,
  };
}

/** Merges `next` into `prev` (prev's "before", next's "after"). */
export function mergeEntries(prev: HistoryEntry, next: HistoryEntry): HistoryEntry {
  const changes = new Map(prev.changes);
  for (const [id, c] of next.changes) {
    const old = changes.get(id);
    changes.set(id, { before: old ? old.before : c.before, after: c.after });
  }
  return {
    ...prev,
    changes,
    orderAfter: next.orderAfter,
    selectionAfter: next.selectionAfter,
    time: next.time,
  };
}

/**
 * Applies one side of an entry to `scene`. Restored elements get a revision
 * past the current one so revision-keyed caches never serve stale paths.
 */
export function applyEntry(scene: Scene, entry: HistoryEntry, side: 'before' | 'after'): Scene {
  const entities: Record<ElementId, SceneElement> = { ...scene.entities };
  for (const [id, change] of entry.changes) {
    const target = change[side];
    const current = entities[id];
    if (target) {
      entities[id] = { ...target, revision: Math.max(target.revision, current?.revision ?? 0) + 1 };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed record removal
      delete entities[id];
    }
  }
  const order = (side === 'before' ? entry.orderBefore : entry.orderAfter).filter(
    (id) => entities[id] !== undefined,
  );
  return { entities, order };
}

/** Selection to restore, limited to elements that exist. */
export function restoredSelection(scene: Scene, selection: Selection): Selection {
  const out: Partial<Record<ElementId, true>> = {};
  for (const id of Object.keys(selection) as ElementId[]) if (scene.entities[id]) out[id] = true;
  return out;
}

/** Undo/redo stacks with coalescing. */
export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get size(): number {
    return this.undoStack.length;
  }

  push(entry: HistoryEntry): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (
      last &&
      entry.key !== null &&
      last.key === entry.key &&
      entry.time - last.time < COALESCE_MS &&
      this.redoStack.length === 0
    ) {
      this.undoStack[this.undoStack.length - 1] = mergeEntries(last, entry);
    } else {
      this.undoStack.push(entry);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    }
    this.redoStack = [];
  }

  popUndo(): HistoryEntry | undefined {
    const e = this.undoStack.pop();
    if (e) this.redoStack.push(e);
    return e;
  }

  popRedo(): HistoryEntry | undefined {
    const e = this.redoStack.pop();
    if (e) this.undoStack.push(e);
    return e;
  }

  /** Ends coalescing so the next same-key change starts a new entry. */
  seal(): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last?.key != null) this.undoStack[this.undoStack.length - 1] = { ...last, key: null };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Every element snapshot held by the stacks (used by image blob GC). */
  *elements(): IterableIterator<SceneElement> {
    for (const e of [...this.undoStack, ...this.redoStack]) {
      for (const c of e.changes.values()) {
        if (c.before) yield c.before;
        if (c.after) yield c.after;
      }
    }
  }
}
