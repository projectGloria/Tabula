import { freedrawWidth, strokeOutline } from './stroke-outline';
import type { Point } from './vec';
import { STROKE_WIDTH_PX } from '../model/style';
import type { ArrowElement, FreedrawElement, SceneElement } from '../model/types';

/** Stroke width of an element in world units. */
export function strokePx(el: SceneElement): number {
  return STROKE_WIDTH_PX[el.style.strokeWidth];
}

/** Arrowhead length in world units for a given stroke width. */
export function arrowheadSize(stroke: number): number {
  return 6 + 2.5 * stroke;
}

/** Base width of a freedraw stroke before pressure scaling. */
export function freedrawBaseWidth(stroke: number): number {
  return stroke * 1.5;
}

/** Largest width any freedraw point can have for a given stroke. */
export function freedrawMaxWidth(stroke: number): number {
  return freedrawWidth(freedrawBaseWidth(stroke), 1);
}

/** Corner radius used for rounded rectangles and diamonds. */
export function cornerRadius(el: SceneElement): number {
  if (el.style.corners !== 'rounded') return 0;
  return Math.min(16, Math.min(el.width, el.height) / 4);
}

/** Diamond vertices in local space (origin at the unrotated top-left): top, right, bottom, left. */
export function diamondVertices(w: number, h: number): [Point, Point, Point, Point] {
  return [
    { x: w / 2, y: 0 },
    { x: w, y: h / 2 },
    { x: w / 2, y: h },
    { x: 0, y: h / 2 },
  ];
}

const outlineCache = new WeakMap<FreedrawElement, readonly Point[]>();

/** Freedraw outline polygon in local space. Cached per element object (immutable). */
export function freedrawOutline(el: FreedrawElement): readonly Point[] {
  const hit = outlineCache.get(el);
  if (hit) return hit;
  const base = freedrawBaseWidth(strokePx(el));
  const widths = el.points.map((_, i) => freedrawWidth(base, el.pressures[i] ?? 0.5));
  const outline = strokeOutline(el.points, widths);
  outlineCache.set(el, outline);
  return outline;
}

/** True when the arrow has any visible head. */
export function hasArrowheads(el: ArrowElement): boolean {
  return el.startHead !== 'none' || el.endHead !== 'none';
}
