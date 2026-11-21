import { localToWorld } from '../geometry/element-geometry';
import { linearPathPoints } from '../geometry/linear-path';
import type { Point } from '../geometry/vec';
import { mutateElement, removeElements, replaceElements } from '../model/scene';
import type {
  ArrowElement,
  BoxElement,
  ElementId,
  Scene,
  SceneElement,
  TextElement,
} from '../model/types';
import { layoutString } from './layout';

/** Gap between a container's inner edge and its label, in world units. */
export const BOUND_TEXT_PADDING = 8;

export type TextContainer = BoxElement | ArrowElement;

export function isTextContainer(el: SceneElement): el is TextContainer {
  return (
    el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse' || el.type === 'arrow'
  );
}

export function isBoundText(el: SceneElement): el is TextElement & { containerId: ElementId } {
  return el.type === 'text' && el.containerId !== null;
}

const indexCache = new WeakMap<object, ReadonlyMap<ElementId, ElementId>>();

/** container id → bound text id, cached per scene entities object. */
export function boundTextIndex(scene: Scene): ReadonlyMap<ElementId, ElementId> {
  const hit = indexCache.get(scene.entities);
  if (hit) return hit;
  const map = new Map<ElementId, ElementId>();
  for (const id of scene.order) {
    const el = scene.entities[id];
    if (el?.type === 'text' && el.containerId !== null) map.set(el.containerId, el.id);
  }
  indexCache.set(scene.entities, map);
  return map;
}

export function boundTextOf(scene: Scene, containerId: ElementId): TextElement | undefined {
  const id = boundTextIndex(scene).get(containerId);
  const el = id === undefined ? undefined : scene.entities[id];
  return el?.type === 'text' ? el : undefined;
}

/** Fraction of a box shape's size usable for text (inscribed rectangle). */
function innerFactor(type: BoxElement['type']): number {
  switch (type) {
    case 'rectangle':
      return 1;
    case 'ellipse':
      return Math.SQRT1_2;
    case 'diamond':
      return 0.5;
  }
}

/** Inner text area of a box shape: size only (it is centered in the shape). */
export function containerInnerSize(c: BoxElement): { width: number; height: number } {
  const k = innerFactor(c.type);
  return {
    width: Math.max(0, c.width * k - BOUND_TEXT_PADDING * 2),
    height: Math.max(0, c.height * k - BOUND_TEXT_PADDING * 2),
  };
}

/** World point at half the arc length of an arrow. */
export function arrowMidpoint(el: ArrowElement): Point {
  const pts = linearPathPoints(el).map((p) => localToWorld(el, p));
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len >= left && len > 0) {
      const t = left / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  return pts[0] ?? { x: el.x, y: el.y };
}

const EPS = 1e-6;
const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

interface Placed {
  readonly text: TextElement;
  readonly container: SceneElement;
}

/**
 * Derives a bound text's geometry from its container, growing a box
 * container vertically when the text does not fit. Unchanged elements are
 * returned as the same objects.
 */
export function placeBoundText(text: TextElement, container: TextContainer): Placed {
  if (container.type === 'arrow') {
    const layout = layoutString(text.text, text.fontFamily, text.fontSize, null);
    const mid = arrowMidpoint(container);
    const w = layout.width;
    const h = layout.height;
    const x = mid.x - w / 2;
    const y = mid.y - h / 2;
    const same =
      near(text.x, x) &&
      near(text.y, y) &&
      near(text.width, w) &&
      near(text.height, h) &&
      text.angle === 0 &&
      text.sizing === 'auto';
    return {
      text: same
        ? text
        : mutateElement(text, { x, y, width: w, height: h, angle: 0, sizing: 'auto' }),
      container,
    };
  }

  let c: BoxElement = container;
  let inner = containerInnerSize(c);
  const layout = layoutString(text.text, text.fontFamily, text.fontSize, Math.max(1, inner.width));
  if (layout.height > inner.height + EPS) {
    const k = innerFactor(c.type);
    const height = (layout.height + BOUND_TEXT_PADDING * 2) / k;
    c = mutateElement(c, { height });
    inner = containerInnerSize(c);
  }
  const w = inner.width;
  const h = layout.height;
  // Vertical placement in the container's local frame.
  const top = (c.height - inner.height) / 2;
  let ly = top;
  if (text.verticalAlign === 'middle') ly = top + (inner.height - h) / 2;
  else if (text.verticalAlign === 'bottom') ly = top + inner.height - h;
  const centerLocal = { x: c.width / 2, y: ly + h / 2 };
  const center = localToWorld(c, centerLocal);
  const x = center.x - w / 2;
  const y = center.y - h / 2;
  const same =
    near(text.x, x) &&
    near(text.y, y) &&
    near(text.width, w) &&
    near(text.height, h) &&
    text.angle === c.angle &&
    text.sizing === 'fixed';
  return {
    text: same
      ? text
      : mutateElement(text, { x, y, width: w, height: h, angle: c.angle, sizing: 'fixed' }),
    container: c,
  };
}

/** Recomputes a free text's size from its content (auto: both; fixed: height). */
export function fitFreeText(text: TextElement): TextElement {
  const layout = layoutString(
    text.text,
    text.fontFamily,
    text.fontSize,
    text.sizing === 'fixed' ? text.width : null,
  );
  const w = text.sizing === 'fixed' ? text.width : layout.width;
  const h = layout.height;
  if (near(w, text.width) && near(h, text.height)) return text;
  return mutateElement(text, { width: w, height: h });
}

/** Re-lays out one text element against the scene; returns updated elements. */
function relayout(scene: Scene, text: TextElement): SceneElement[] {
  if (text.containerId === null) {
    const next = fitFreeText(text);
    return next === text ? [] : [next];
  }
  const c = scene.entities[text.containerId];
  if (!c || !isTextContainer(c)) return [];
  const placed = placeBoundText(text, c);
  const out: SceneElement[] = [];
  if (placed.text !== text) out.push(placed.text);
  if (placed.container !== c) out.push(placed.container);
  return out;
}

/**
 * Keeps text consistent after any scene change: removes labels whose
 * container is gone, re-lays out changed text, and moves labels with their
 * containers. Pure; returns `next` unchanged when nothing needs fixing.
 */
export function syncText(prev: Scene | null, next: Scene): Scene {
  if (prev === next) return next;
  const index = boundTextIndex(next);
  const orphans: ElementId[] = [];
  for (const [cid, tid] of index) {
    const c = next.entities[cid];
    if (!c || !isTextContainer(c)) orphans.push(tid);
  }
  let scene = orphans.length > 0 ? removeElements(next, orphans) : next;

  const todo = new Set<ElementId>();
  for (const id of Object.keys(scene.entities) as ElementId[]) {
    const el = scene.entities[id];
    if (!el || prev?.entities[id] === el) continue;
    if (el.type === 'text') todo.add(id);
    else {
      const tid = index.get(id);
      if (tid !== undefined && scene.entities[tid]) todo.add(tid);
    }
  }
  if (todo.size === 0) return scene;
  for (const id of todo) {
    const t = scene.entities[id];
    if (t?.type !== 'text') continue;
    const updated = relayout(scene, t);
    if (updated.length > 0) scene = replaceElements(scene, updated);
  }
  return scene;
}

/** Re-lays out every text element (after fonts load or the measurer changes). */
export function relayoutAllText(scene: Scene): Scene {
  let out = scene;
  for (const id of scene.order) {
    const t = out.entities[id];
    if (t?.type !== 'text') continue;
    const updated = relayout(out, t);
    if (updated.length > 0) out = replaceElements(out, updated);
  }
  return out;
}
