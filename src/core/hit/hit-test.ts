import { distanceToEllipseOutline, pointInEllipse } from '../geometry/ellipse';
import {
  diamondVertices,
  freedrawBaseWidth,
  freedrawOutline,
  strokePx,
} from '../geometry/element-shape';
import { linearPathPoints } from '../geometry/linear-path';
import { freedrawWidth } from '../geometry/stroke-outline';
import { toRectLocal } from '../geometry/rect';
import {
  distanceToPolygonEdges,
  distanceToPolyline,
  distanceToSegment,
  pointInPolygon,
} from '../geometry/segment';
import type { Point } from '../geometry/vec';
import type { ElementId, FreedrawElement, Scene, SceneElement } from '../model/types';
import type { SpatialIndex } from '../spatial/spatial-index';

function hitFreedraw(el: FreedrawElement, local: Point, tolerance: number): boolean {
  if (pointInPolygon(local, freedrawOutline(el))) return true;
  const base = freedrawBaseWidth(strokePx(el));
  const pts = el.points;
  const first = pts[0];
  if (!first) return false;
  if (pts.length === 1) {
    return (
      Math.hypot(local.x - first.x, local.y - first.y) <=
      tolerance + freedrawWidth(base, el.pressures[0] ?? 0.5) / 2
    );
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const w = Math.max(
      freedrawWidth(base, el.pressures[i - 1] ?? 0.5),
      freedrawWidth(base, el.pressures[i] ?? 0.5),
    );
    if (distanceToSegment(local, a, b) <= tolerance + w / 2) return true;
  }
  return false;
}

/**
 * Precise hit test against a single element.
 * Filled shapes hit anywhere inside; unfilled shapes hit only near their outline.
 */
export function hitTestElement(el: SceneElement, p: Point, tolerance: number): boolean {
  const local = toRectLocal(el, p);
  const reach = tolerance + strokePx(el) / 2;
  const filled = el.style.fillStyle !== 'none';
  switch (el.type) {
    case 'rectangle': {
      const insideOuter =
        local.x >= -reach &&
        local.y >= -reach &&
        local.x <= el.width + reach &&
        local.y <= el.height + reach;
      if (!insideOuter) return false;
      if (filled) return true;
      const insideInner =
        local.x > reach &&
        local.y > reach &&
        local.x < el.width - reach &&
        local.y < el.height - reach;
      return !insideInner;
    }
    case 'diamond': {
      const poly = diamondVertices(el.width, el.height);
      if (filled && pointInPolygon(local, poly)) return true;
      return distanceToPolygonEdges(local, poly) <= reach;
    }
    case 'ellipse': {
      const a = el.width / 2;
      const b = el.height / 2;
      const c = { x: local.x - a, y: local.y - b };
      if (filled && pointInEllipse(c, a, b)) return true;
      return distanceToEllipseOutline(c, a, b) <= reach;
    }
    case 'line':
    case 'arrow':
      return distanceToPolyline(local, linearPathPoints(el)) <= reach;
    case 'freedraw':
      return hitFreedraw(el, local, tolerance);
    case 'text':
    case 'image':
      return (
        local.x >= -tolerance &&
        local.y >= -tolerance &&
        local.x <= el.width + tolerance &&
        local.y <= el.height + tolerance
      );
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
    if (!el || !hitTestElement(el, p, tolerance)) continue;
    // A label hit selects its container.
    if (el.type === 'text' && el.containerId !== null) {
      const c = scene.entities[el.containerId];
      if (c && !c.locked) return c.id;
      continue;
    }
    if (!el.locked) return id;
  }
  return undefined;
}
