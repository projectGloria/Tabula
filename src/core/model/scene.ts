import { createElementId, createSeed } from './ids';
import { DEFAULT_STYLE } from './style';
import type {
  ArrowElement,
  BoxElement,
  BoxElementType,
  ElementId,
  ElementStyle,
  GroupId,
  FreedrawElement,
  LinearElement,
  LinearElementType,
  LineElement,
  LocalPoint,
  PointsElement,
  RectangleElement,
  Scene,
  SceneElement,
} from './types';

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

export function isPointsElement(el: SceneElement): el is PointsElement {
  return el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw';
}

/** Geometry fields shared by transforms; `points` applies to points elements only. */
export interface GeometryPatch {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly angle?: number;
  readonly points?: readonly LocalPoint[];
}

/** Applies a geometry patch, ignoring `points` on box-shaped elements. */
export function applyGeometry<T extends SceneElement>(el: T, g: GeometryPatch): T {
  if (g.points && !isPointsElement(el)) {
    const rest: GeometryPatch = { ...g };
    delete (rest as { points?: unknown }).points;
    return mutateElement(el, rest as ElementPatch<T>);
  }
  return mutateElement(el, g as ElementPatch<T>);
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

export interface NewBoxInit {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly style?: ElementStyle;
}

/** @deprecated alias kept for M1 call sites. */
export type NewRectangleInit = NewBoxInit;

function baseFields(x: number, y: number, style: ElementStyle | undefined) {
  return {
    id: createElementId(),
    x,
    y,
    angle: 0,
    style: style ?? DEFAULT_STYLE,
    seed: createSeed(),
    groupIds: [] as readonly GroupId[],
    locked: false,
    revision: 0,
  };
}

export function createBoxElement<T extends BoxElementType>(
  type: T,
  init: NewBoxInit,
): Extract<BoxElement, { type: T }> {
  return {
    ...baseFields(init.x, init.y, init.style),
    type,
    width: init.width ?? 0,
    height: init.height ?? 0,
  } as Extract<BoxElement, { type: T }>;
}

export function createRectangle(init: NewBoxInit): RectangleElement {
  return createBoxElement('rectangle', init);
}

export interface NewPointsInit {
  /** World position of the first point. */
  readonly x: number;
  readonly y: number;
  readonly style?: ElementStyle;
}

/** A line with a single point at `(x, y)`; points are appended via `withWorldPoints`. */
export function createLine(init: NewPointsInit): LineElement {
  return {
    ...baseFields(init.x, init.y, init.style),
    type: 'line',
    width: 0,
    height: 0,
    points: [{ x: 0, y: 0 }],
  };
}

export function createArrow(init: NewPointsInit): ArrowElement {
  return {
    ...baseFields(init.x, init.y, init.style),
    type: 'arrow',
    width: 0,
    height: 0,
    points: [{ x: 0, y: 0 }],
    startHead: 'none',
    endHead: 'arrow',
  };
}

export function createLinearElement(type: LinearElementType, init: NewPointsInit): LinearElement {
  return type === 'line' ? createLine(init) : createArrow(init);
}

export function createFreedraw(
  init: NewPointsInit & { readonly pressure?: number },
): FreedrawElement {
  return {
    ...baseFields(init.x, init.y, init.style),
    type: 'freedraw',
    width: 0,
    height: 0,
    points: [{ x: 0, y: 0 }],
    pressures: [init.pressure ?? 0.5],
  };
}
