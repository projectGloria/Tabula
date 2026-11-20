import { createElementId, createSeed } from './ids';
import { DEFAULT_STYLE } from './style';
import type { ElementId, ElementStyle, RectangleElement, Scene, SceneElement } from './types';

export const EMPTY_SCENE: Scene = { entities: {}, order: [] };

/** Fields a mutation may change. `id`, `type` and `revision` are managed. */
export type ElementPatch<T extends SceneElement = SceneElement> = Partial<
  Omit<T, 'id' | 'type' | 'revision'>
>;

export function getElement(scene: Scene, id: ElementId): SceneElement | undefined {
  return scene.entities[id];
}

/** Returns the elements in bottom-to-top order. */
export function orderedElements(scene: Scene): SceneElement[] {
  const out: SceneElement[] = [];
  for (const id of scene.order) {
    const el = scene.entities[id];
    if (el) out.push(el);
  }
  return out;
}

/** Returns a new element with the patch applied and `revision` bumped. */
export function mutateElement<T extends SceneElement>(el: T, patch: ElementPatch<T>): T {
  return { ...el, ...patch, revision: el.revision + 1 };
}

/** Inserts elements on top of the stack (or at `index`). Throws on duplicate ids. */
export function insertElements(
  scene: Scene,
  elements: readonly SceneElement[],
  index: number = scene.order.length,
): Scene {
  if (elements.length === 0) return scene;
  const entities: Record<ElementId, SceneElement> = { ...scene.entities };
  const ids: ElementId[] = [];
  for (const el of elements) {
    if (entities[el.id]) throw new Error(`Duplicate element id: ${el.id}`);
    entities[el.id] = el;
    ids.push(el.id);
  }
  const order = [...scene.order];
  order.splice(Math.max(0, Math.min(index, order.length)), 0, ...ids);
  return { entities, order };
}

/** Replaces existing elements by id. Unknown ids are ignored. */
export function replaceElements(scene: Scene, elements: readonly SceneElement[]): Scene {
  let entities: Record<ElementId, SceneElement> | null = null;
  for (const el of elements) {
    const prev = scene.entities[el.id];
    if (!prev || prev === el) continue;
    entities ??= { ...scene.entities };
    entities[el.id] = el;
  }
  return entities ? { entities, order: scene.order } : scene;
}

/** Removes elements from both `entities` and `order`. */
export function removeElements(scene: Scene, ids: Iterable<ElementId>): Scene {
  const drop = new Set<ElementId>();
  for (const id of ids) if (scene.entities[id]) drop.add(id);
  if (drop.size === 0) return scene;
  const entities: Record<ElementId, SceneElement> = { ...scene.entities };
  for (const id of drop) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed record removal
    delete entities[id];
  }
  return { entities, order: scene.order.filter((id) => !drop.has(id)) };
}

export interface NewRectangleInit {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly style?: ElementStyle;
}

export function createRectangle(init: NewRectangleInit): RectangleElement {
  return {
    id: createElementId(),
    type: 'rectangle',
    x: init.x,
    y: init.y,
    width: init.width ?? 0,
    height: init.height ?? 0,
    angle: 0,
    style: init.style ?? DEFAULT_STYLE,
    seed: createSeed(),
    groupIds: [],
    locked: false,
    revision: 0,
  };
}
