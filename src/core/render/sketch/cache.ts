import type { ElementId, Scene, SceneElement } from '../../model/types';
import { generateDrawable, type Drawable } from './generate';

export interface SketchEntry {
  revision: number;
  /** The element object the drawable was generated from (inputs are read from it). */
  source: SceneElement;
  readonly drawable: Drawable;
  /** Painter-owned lazily built native paths (e.g. `Path2D`), parallel to `drawable.layers`. */
  native: unknown;
}

/**
 * True when two versions of an element produce the same local-frame sketch:
 * moves and rotations change `x`/`y`/`angle` only, which the painter applies
 * as a transform.
 */
function sameSketchInputs(a: SceneElement, b: SceneElement): boolean {
  if (
    a.type !== b.type ||
    a.seed !== b.seed ||
    a.style !== b.style ||
    a.width !== b.width ||
    a.height !== b.height
  )
    return false;
  switch (a.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return true;
    case 'line':
      return b.type === 'line' && a.points === b.points;
    case 'arrow':
      return (
        b.type === 'arrow' &&
        a.points === b.points &&
        a.startHead === b.startHead &&
        a.endHead === b.endHead
      );
    case 'freedraw':
      return b.type === 'freedraw' && a.points === b.points && a.pressures === b.pressures;
    case 'text':
      return true;
  }
}

/** Generated sketches keyed by element id and revision. */
export class SketchCache {
  private readonly entries = new Map<ElementId, SketchEntry>();
  /** Counters for tests and the debug overlay. */
  generated = 0;
  reused = 0;

  get(el: SceneElement): SketchEntry {
    const hit = this.entries.get(el.id);
    if (hit) {
      if (hit.revision === el.revision) return hit;
      if (sameSketchInputs(hit.source, el)) {
        hit.revision = el.revision;
        hit.source = el;
        this.reused++;
        return hit;
      }
    }
    const entry: SketchEntry = {
      revision: el.revision,
      source: el,
      drawable: generateDrawable(el),
      native: null,
    };
    this.generated++;
    this.entries.set(el.id, entry);
    return entry;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Drops entries of deleted elements once the cache outgrows the scene. */
  prune(scene: Scene): void {
    if (this.entries.size <= scene.order.length * 1.5 + 64) return;
    for (const id of this.entries.keys()) if (!(id in scene.entities)) this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }
}
