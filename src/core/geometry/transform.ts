import { normalizeAngle, snapAngle } from './angle';
import { rectCenter, toRectLocal, type RectLike } from './rect';
import { rotateAround, type Point } from './vec';
import type { GeometryPatch } from '../model/scene';
import type { SceneElement } from '../model/types';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type Dir = -1 | 0 | 1;

export const RESIZE_HANDLE_DIRS: Readonly<Record<ResizeHandle, { x: Dir; y: Dir }>> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

export interface ResizeOptions {
  /** Keep the aspect ratio (Shift, or always for multi-selection). */
  readonly keepAspect: boolean;
  /** Scale around the frame center (Alt). */
  readonly fromCenter: boolean;
}

/**
 * A resize expressed in the frame's local space (origin at the frame's
 * unrotated top-left): `L(q) = anchor + (q − anchor) ⊙ (sx, sy)`.
 * Negative scales are flips.
 */
export interface ResizeMapping {
  readonly anchor: Point;
  readonly sx: number;
  readonly sy: number;
}

/** Smallest frame dimension a resize may produce, in world units. */
export const MIN_RESIZE_SIZE = 1;

function axisScale(dir: Dir, size: number, pointer: number, anchor: number): number {
  if (dir === 0 || size <= 1e-9) return 1;
  const handle = ((dir + 1) / 2) * size;
  const d = handle - anchor;
  if (Math.abs(d) < 1e-9) return 1;
  return (pointer - anchor) / d;
}

function clampScale(s: number, size: number): number {
  if (size <= 1e-9) return s;
  const min = MIN_RESIZE_SIZE / size;
  if (Math.abs(s) >= min) return s;
  return s < 0 ? -min : min;
}

const signOf = (v: number): number => (v < 0 ? -1 : 1);

/** Computes the mapping for dragging `handle` of `frame` to `pointerWorld`. */
export function computeResize(
  frame: RectLike,
  handle: ResizeHandle,
  pointerWorld: Point,
  opts: ResizeOptions,
): ResizeMapping {
  const dir = RESIZE_HANDLE_DIRS[handle];
  const { width: w, height: h } = frame;
  const q = toRectLocal(frame, pointerWorld);
  const anchor = opts.fromCenter
    ? { x: w / 2, y: h / 2 }
    : { x: ((1 - dir.x) / 2) * w, y: ((1 - dir.y) / 2) * h };
  let sx = axisScale(dir.x, w, q.x, anchor.x);
  let sy = axisScale(dir.y, h, q.y, anchor.y);

  if (opts.keepAspect) {
    if (dir.x !== 0 && dir.y !== 0) {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = signOf(sx) * s;
      sy = signOf(sy) * s;
    } else if (dir.x !== 0) {
      sy = Math.abs(sx);
    } else {
      sx = Math.abs(sy);
    }
  }
  return { anchor, sx: clampScale(sx, w), sy: clampScale(sy, h) };
}

function applyLocal(m: ResizeMapping, p: Point): Point {
  return { x: m.anchor.x + (p.x - m.anchor.x) * m.sx, y: m.anchor.y + (p.y - m.anchor.y) * m.sy };
}

function frameLocalToWorld(frame: RectLike, p: Point): Point {
  const world = { x: frame.x + p.x, y: frame.y + p.y };
  return frame.angle === 0 ? world : rotateAround(world, rectCenter(frame), frame.angle);
}

/** Resizes a single element within its own (rotated) frame. */
export function resizeElement(el: SceneElement, m: ResizeMapping): GeometryPatch {
  const w = Math.abs(el.width * m.sx);
  const h = Math.abs(el.height * m.sy);
  const center = frameLocalToWorld(el, applyLocal(m, { x: el.width / 2, y: el.height / 2 }));
  const box = { x: center.x - w / 2, y: center.y - h / 2, width: w, height: h };
  if (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw') {
    const minX = Math.min(applyLocal(m, { x: 0, y: 0 }).x, applyLocal(m, { x: el.width, y: 0 }).x);
    const minY = Math.min(applyLocal(m, { x: 0, y: 0 }).y, applyLocal(m, { x: 0, y: el.height }).y);
    const points = el.points.map((p) => {
      const q = applyLocal(m, p);
      return { x: q.x - minX, y: q.y - minY };
    });
    return { ...box, points };
  }
  return box;
}

/**
 * Resizes one element of a multi-selection whose axis-aligned frame is being
 * scaled. `m` must be uniform in magnitude (|sx| = |sy|). Flips mirror the
 * element's contents and negate its angle when exactly one axis flips.
 */
export function resizeElementInGroup(
  el: SceneElement,
  frame: RectLike,
  m: ResizeMapping,
): GeometryPatch {
  const s = Math.abs(m.sx);
  const flipX = m.sx < 0;
  const flipY = m.sy < 0;
  const c = rectCenter(el);
  const nc = applyLocal(m, { x: c.x - frame.x, y: c.y - frame.y });
  const w = el.width * s;
  const h = el.height * s;
  const angle = flipX !== flipY ? normalizeAngle(-el.angle) : el.angle;
  const box = { x: frame.x + nc.x - w / 2, y: frame.y + nc.y - h / 2, width: w, height: h, angle };
  if (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw') {
    const points = el.points.map((p) => ({
      x: (flipX ? el.width - p.x : p.x) * s,
      y: (flipY ? el.height - p.y : p.y) * s,
    }));
    return { ...box, points };
  }
  return box;
}

/** Angle of `p` around `center`, in radians. */
export function angleAround(center: Point, p: Point): number {
  return Math.atan2(p.y - center.y, p.x - center.x);
}

/** New absolute angle for a single-element rotation. */
export function rotatedAngle(origAngle: number, delta: number, snap: boolean): number {
  const a = origAngle + delta;
  return normalizeAngle(snap ? snapAngle(a) : a);
}

/** Rotates an element's center around `pivot` by `delta` and adds `delta` to its angle. */
export function rotateElementAround(el: SceneElement, pivot: Point, delta: number): GeometryPatch {
  const c = rotateAround(rectCenter(el), pivot, delta);
  return {
    x: c.x - el.width / 2,
    y: c.y - el.height / 2,
    angle: normalizeAngle(el.angle + delta),
  };
}
