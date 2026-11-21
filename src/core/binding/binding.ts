import { localToWorld, pointsPatchFromWorld, worldPointsOf } from '../geometry/element-geometry';
import { distanceToEllipseOutline, pointInEllipse } from '../geometry/ellipse';
import { diamondVertices, strokePx } from '../geometry/element-shape';
import { rectCenter, toRectLocal } from '../geometry/rect';
import { distanceToPolygonEdges, pointInPolygon } from '../geometry/segment';
import type { Point } from '../geometry/vec';
import { applyGeometry } from '../model/scene';
import type {
  ArrowElement,
  BoxElement,
  ElementId,
  PointBinding,
  Scene,
  SceneElement,
  ImageElement,
  TextElement,
} from '../model/types';

/** Gap between a bound endpoint and the target's outline, in world units (plus half its stroke). */
export const BIND_GAP = 4;
/** A dragged endpoint binds to shapes whose outline is within this many screen px. */
export const BIND_DISTANCE_PX = 16;
/** Anchors are pulled this fraction toward the centre so the arrow always aims into the shape. */
const ANCHOR_INSET = 0.1;
/** An endpoint that moved further than this (world units) on its own detaches. */
const DETACH_EPS = 0.5;

/** Elements an arrow endpoint can attach to: closed shapes and free text. */
export type Bindable = BoxElement | TextElement | ImageElement;

export function isBindable(el: SceneElement): el is Bindable {
  switch (el.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
    case 'image':
      return true;
    case 'text':
      return el.containerId === null;
    case 'line':
    case 'arrow':
    case 'freedraw':
      return false;
  }
}

/** Closed outline in local space: polygon vertices, or null for an ellipse. */
export function polygonOf(el: Bindable): readonly Point[] | null {
  switch (el.type) {
    case 'diamond':
      return diamondVertices(el.width, el.height);
    case 'ellipse':
      return null;
    case 'rectangle':
    case 'text':
    case 'image':
      return [
        { x: 0, y: 0 },
        { x: el.width, y: 0 },
        { x: el.width, y: el.height },
        { x: 0, y: el.height },
      ];
  }
}

function insideLocal(el: Bindable, l: Point): boolean {
  const poly = polygonOf(el);
  if (poly) return pointInPolygon(l, poly);
  const a = el.width / 2;
  const b = el.height / 2;
  return pointInEllipse({ x: l.x - a, y: l.y - b }, a, b);
}

function outlineDistanceLocal(el: Bindable, l: Point): number {
  const poly = polygonOf(el);
  if (poly) return distanceToPolygonEdges(l, poly);
  const a = el.width / 2;
  const b = el.height / 2;
  return distanceToEllipseOutline({ x: l.x - a, y: l.y - b }, a, b);
}

/** Whether a world point is inside the shape or within `tolerance` of its outline. */
export function nearBindable(el: Bindable, p: Point, tolerance: number): boolean {
  const l = toRectLocal(el, p);
  return insideLocal(el, l) || outlineDistanceLocal(el, l) <= tolerance;
}

/** Smallest t in [0, 1] where segment a→b crosses segment c→d, or null. */
function segmentHit(a: Point, b: Point, c: Point, d: Point): number | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * First point where the world segment `from → to` crosses the target's
 * outline, or null when it does not cross it.
 */
export function outlineHit(el: Bindable, from: Point, to: Point): Point | null {
  const a = toRectLocal(el, from);
  const b = toRectLocal(el, to);
  let best: number | null = null;
  const poly = polygonOf(el);
  if (poly) {
    for (let i = 0; i < poly.length; i++) {
      const c = poly[i];
      const d = poly[(i + 1) % poly.length];
      if (!c || !d) continue;
      const t = segmentHit(a, b, c, d);
      if (t !== null && (best === null || t < best)) best = t;
    }
  } else {
    const rx = el.width / 2;
    const ry = el.height / 2;
    if (rx < 1e-9 || ry < 1e-9) return null;
    // Solve |(a + t(b − a) − c) / r|² = 1 for t.
    const px = (a.x - rx) / rx;
    const py = (a.y - ry) / ry;
    const dx = (b.x - a.x) / rx;
    const dy = (b.y - a.y) / ry;
    const qa = dx * dx + dy * dy;
    const qb = 2 * (px * dx + py * dy);
    const qc = px * px + py * py - 1;
    const disc = qb * qb - 4 * qa * qc;
    if (qa > 1e-12 && disc >= 0) {
      const s = Math.sqrt(disc);
      for (const t of [(-qb - s) / (2 * qa), (-qb + s) / (2 * qa)]) {
        if (t >= 0 && t <= 1 && (best === null || t < best)) best = t;
      }
    }
  }
  if (best === null) return null;
  return localToWorld(el, { x: a.x + (b.x - a.x) * best, y: a.y + (b.y - a.y) * best });
}

/** World position of a binding's anchor on its target. */
export function anchorWorld(target: Bindable, anchor: Point): Point {
  return localToWorld(target, { x: anchor.x * target.width, y: anchor.y * target.height });
}

/** The normalized anchor for an endpoint dropped at world point `p`. */
export function anchorFor(target: Bindable, p: Point): Point {
  const l = toRectLocal(target, p);
  const norm = (v: number, size: number): number => {
    const n = size > 1e-9 ? Math.min(1, Math.max(0, v / size)) : 0.5;
    return 0.5 + (n - 0.5) * (1 - ANCHOR_INSET);
  };
  return { x: norm(l.x, target.width), y: norm(l.y, target.height) };
}

export function bindingFor(target: Bindable, p: Point): PointBinding {
  return { elementId: target.id, anchor: anchorFor(target, p) };
}

const unit = (v: Point): Point => {
  const len = Math.hypot(v.x, v.y);
  return len > 1e-9 ? { x: v.x / len, y: v.y / len } : { x: 1, y: 0 };
};

/**
 * Where a bound endpoint sits: on the target's outline along the line from
 * the arrow's neighbouring point toward the anchor, pulled back by the gap.
 * When that line misses the outline it aims at the centre instead; when the
 * neighbour is inside the target the endpoint goes out from the centre
 * through the anchor.
 */
export function boundEndpoint(
  arrow: ArrowElement,
  target: Bindable,
  binding: PointBinding,
  adjacent: Point,
): Point {
  const gap = BIND_GAP + strokePx(target) / 2 + strokePx(arrow) / 2;
  const anchor = anchorWorld(target, binding.anchor);
  const center = rectCenter(target);
  const towardAdjacent = (hit: Point): Point => {
    const d = unit({ x: adjacent.x - hit.x, y: adjacent.y - hit.y });
    return { x: hit.x + d.x * gap, y: hit.y + d.y * gap };
  };
  if (!insideLocal(target, toRectLocal(target, adjacent))) {
    const hit = outlineHit(target, adjacent, anchor) ?? outlineHit(target, adjacent, center);
    if (hit) return towardAdjacent(hit);
  }
  // Neighbour inside the target: leave through the anchor's side.
  const out = unit(
    anchor.x === center.x && anchor.y === center.y
      ? { x: adjacent.x - center.x, y: adjacent.y - center.y }
      : { x: anchor.x - center.x, y: anchor.y - center.y },
  );
  const reach = target.width + target.height + gap + 1;
  const far = { x: center.x + out.x * reach, y: center.y + out.y * reach };
  const hit = outlineHit(target, far, center) ?? anchor;
  return { x: hit.x + out.x * gap, y: hit.y + out.y * gap };
}

/**
 * Topmost unlocked bindable element at world point `p` (inside it, or within
 * `tolerance` of its outline), skipping `exclude`. `candidates` narrows the
 * search (spatial index broad phase); without it every element is checked.
 */
export function findBindTarget(
  scene: Scene,
  p: Point,
  tolerance: number,
  exclude: ReadonlySet<ElementId>,
  candidates?: ReadonlySet<ElementId>,
): Bindable | undefined {
  for (let i = scene.order.length - 1; i >= 0; i--) {
    const id = scene.order[i];
    if (id === undefined || exclude.has(id)) continue;
    if (candidates && !candidates.has(id)) continue;
    const el = scene.entities[id];
    if (!el || el.locked || !isBindable(el)) continue;
    if (nearBindable(el, p, tolerance)) return el;
  }
  return undefined;
}

function targetOf(scene: Scene, b: PointBinding | null, self: ElementId): Bindable | null {
  if (!b || b.elementId === self) return null;
  const el = scene.entities[b.elementId];
  return el && isBindable(el) ? el : null;
}

const moved = (a: Point | undefined, b: Point | undefined): boolean =>
  !a || !b || Math.hypot(a.x - b.x, a.y - b.y) > DETACH_EPS;

/** Recomputes a bound arrow's endpoints. Returns the same object when nothing moves. */
export function placeBoundArrow(scene: Scene, arrow: ArrowElement): ArrowElement {
  const start = targetOf(scene, arrow.startBinding, arrow.id);
  const end = targetOf(scene, arrow.endBinding, arrow.id);
  let next = arrow;
  if ((arrow.startBinding && !start) || (arrow.endBinding && !end)) {
    next = {
      ...arrow,
      startBinding: start ? arrow.startBinding : null,
      endBinding: end ? arrow.endBinding : null,
      revision: arrow.revision + 1,
    };
  }
  if (!start && !end) return next;
  const pts = worldPointsOf(next);
  const n = pts.length;
  if (n < 2) return next;
  const out = [...pts];
  const two = n === 2;
  if (start && next.startBinding) {
    // A two-point arrow bound at both ends aims at the other anchor, not at
    // the other (computed) endpoint, so the result does not depend on order.
    const adj =
      two && end && next.endBinding
        ? anchorWorld(end, next.endBinding.anchor)
        : (pts[1] ?? pts[0] ?? { x: 0, y: 0 });
    out[0] = boundEndpoint(next, start, next.startBinding, adj);
  }
  if (end && next.endBinding) {
    const adj =
      two && start && next.startBinding
        ? anchorWorld(start, next.startBinding.anchor)
        : (pts[n - 2] ?? pts[0] ?? { x: 0, y: 0 });
    out[n - 1] = boundEndpoint(next, end, next.endBinding, adj);
  }
  const same = out.every((p, i) => {
    const q = pts[i];
    return q !== undefined && Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
  });
  return same ? next : applyGeometry(next, pointsPatchFromWorld(next.angle, out));
}

/**
 * Keeps bound arrows attached after a scene change (run by the editor on
 * every update):
 * - a binding whose target is gone or no longer bindable is dropped;
 * - an endpoint moved on its own (arrow dragged without its target, binding
 *   untouched) detaches;
 * - otherwise, when the arrow or a target changed, the endpoints are re-placed.
 */
export function syncBindings(prev: Scene | null, next: Scene): Scene {
  let entities: Record<ElementId, SceneElement> | null = null;
  for (const id of next.order) {
    const el = next.entities[id];
    if (el?.type !== 'arrow' || (!el.startBinding && !el.endBinding)) continue;
    const before = prev?.entities[id];
    const old = before?.type === 'arrow' ? before : undefined;
    const startT = targetOf(next, el.startBinding, id);
    const endT = targetOf(next, el.endBinding, id);
    const targetChanged = (t: Bindable | null): boolean => t !== null && prev?.entities[t.id] !== t;
    // A binding whose target is gone must be dropped even if nothing else changed.
    const stale = (b: PointBinding | null, t: Bindable | null): boolean => b !== null && t === null;
    const unchanged =
      old === el &&
      !targetChanged(startT) &&
      !targetChanged(endT) &&
      !stale(el.startBinding, startT) &&
      !stale(el.endBinding, endT);
    if (unchanged) continue;

    let arrow = el;
    if (old && old !== el) {
      const a = worldPointsOf(old);
      const b = worldPointsOf(el);
      // Where the bindings would put the ends: an end already there (a
      // restored history entry) stays bound even though it moved.
      let placed: Point[] | null = null;
      const detach = (
        binding: PointBinding | null,
        prevBinding: PointBinding | null,
        t: Bindable | null,
        i: number,
        j: number,
      ): boolean => {
        if (binding === null || binding !== prevBinding || t === null) return false;
        if (prev?.entities[t.id] !== t || !moved(a[i], b[j])) return false;
        placed ??= worldPointsOf(placeBoundArrow(next, el));
        return moved(placed[j], b[j]);
      };
      const dropStart = detach(el.startBinding, old.startBinding, startT, 0, 0);
      const dropEnd = detach(el.endBinding, old.endBinding, endT, a.length - 1, b.length - 1);
      if (dropStart || dropEnd) {
        arrow = {
          ...arrow,
          startBinding: dropStart ? null : arrow.startBinding,
          endBinding: dropEnd ? null : arrow.endBinding,
          revision: arrow.revision + 1,
        };
      }
    }
    const placed = placeBoundArrow(next, arrow);
    if (placed === el) continue;
    entities ??= { ...next.entities };
    entities[id] = placed;
  }
  return entities ? { entities, order: next.order } : next;
}

/** Arrows with an endpoint bound to any of `ids`. */
export function arrowsBoundTo(scene: Scene, ids: ReadonlySet<ElementId>): ElementId[] {
  const out: ElementId[] = [];
  for (const id of scene.order) {
    const el = scene.entities[id];
    if (el?.type !== 'arrow') continue;
    const s = el.startBinding?.elementId;
    const e = el.endBinding?.elementId;
    if ((s !== undefined && ids.has(s)) || (e !== undefined && ids.has(e))) out.push(id);
  }
  return out;
}
