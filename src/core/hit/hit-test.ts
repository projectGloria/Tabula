import { toRectLocal } from '../geometry/rect';
import type { Point } from '../geometry/vec';
import { STROKE_WIDTH_PX } from '../model/style';
import type { ElementId, Scene, SceneElement } from '../model/types';
import type { SpatialIndex } from '../spatial/spatial-index';

/**
 * Precise hit test against a single element.
 * Filled shapes hit anywhere inside; unfilled shapes hit only near their outline.
 */
export function hitTestElement(el: SceneElement, p: Point, tolerance: number): boolean {
  switch (el.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- single-variant union until M2 adds shapes
    case 'rectangle': {
      const local = toRectLocal(el, p);
      const reach = tolerance + STROKE_WIDTH_PX[el.style.strokeWidth] / 2;
      const insideOuter =
        local.x >= -reach &&
        local.y >= -reach &&
        local.x <= el.width + reach &&
        local.y <= el.height + reach;
      if (!insideOuter) return false;
      if (el.style.fillStyle !== 'none') return true;
      const insideInner =
        local.x > reach &&
        local.y > reach &&
        local.x < el.width - reach &&
        local.y < el.height - reach;
      return !insideInner;
    }
  }
}

/** Topmost unlocked element under `p`, using the spatial index as broad phase. */
export function hitTopmost(
  scene: Scene,
  index: SpatialIndex<ElementId>,
  p: Point,
  tolerance: number,
): ElementId | undefined {
  const candidates = index.queryPoint(p, tolerance);
  if (candidates.size === 0) return undefined;
  for (let i = scene.order.length - 1; i >= 0; i--) {
    const id = scene.order[i];
    if (id === undefined || !candidates.has(id)) continue;
    const el = scene.entities[id];
    if (el && !el.locked && hitTestElement(el, p, tolerance)) return id;
  }
  return undefined;
}
