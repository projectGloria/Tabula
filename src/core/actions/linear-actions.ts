import { pointsPatchFromWorld, worldPointsOf } from '../geometry/element-geometry';
import type { Point } from '../geometry/vec';
import { applyGeometry, replaceElements } from '../model/scene';
import type { ElementId, LinearElement, PointBinding } from '../model/types';
import { selectedIds, type AppState } from '../store/app-state';

export interface EndBindings {
  /** `undefined` keeps the current binding. */
  readonly start?: PointBinding | null;
  readonly end?: PointBinding | null;
}

function linearOf(state: AppState, id: ElementId): LinearElement | undefined {
  const el = state.scene.entities[id];
  return el?.type === 'line' || el?.type === 'arrow' ? el : undefined;
}

/** Replaces a line/arrow's points (world space) and, for arrows, its end bindings. */
export function setLinearPoints(
  state: AppState,
  id: ElementId,
  world: readonly Point[],
  bindings: EndBindings = {},
): AppState {
  const el = linearOf(state, id);
  if (!el || el.locked || world.length < 2) return state;
  let next: LinearElement = applyGeometry(el, pointsPatchFromWorld(el.angle, world));
  if (next.type === 'arrow') {
    next = {
      ...next,
      startBinding: bindings.start === undefined ? next.startBinding : bindings.start,
      endBinding: bindings.end === undefined ? next.endBinding : bindings.end,
    };
  }
  return { ...state, scene: replaceElements(state.scene, [next]) };
}

/** Sets an arrow's end bindings without moving it (the editor re-places bound ends). */
export function setArrowBindings(state: AppState, id: ElementId, bindings: EndBindings): AppState {
  const el = linearOf(state, id);
  if (el?.type !== 'arrow' || el.locked) return state;
  const start = bindings.start === undefined ? el.startBinding : bindings.start;
  const end = bindings.end === undefined ? el.endBinding : bindings.end;
  if (start === el.startBinding && end === el.endBinding) return state;
  const next = { ...el, startBinding: start, endBinding: end, revision: el.revision + 1 };
  return { ...state, scene: replaceElements(state.scene, [next]) };
}

/** Inserts a world point after `index`. */
export function insertLinearPoint(
  state: AppState,
  id: ElementId,
  index: number,
  world: Point,
): AppState {
  const el = linearOf(state, id);
  if (!el || el.locked || index < 0 || index >= el.points.length - 1) return state;
  const pts = worldPointsOf(el);
  pts.splice(index + 1, 0, world);
  return setLinearPoints(state, id, pts);
}

/**
 * Removes points by index, keeping at least two. Removing an end drops its
 * binding (a new end takes its place).
 */
export function deleteLinearPoints(
  state: AppState,
  id: ElementId,
  indices: readonly number[],
): AppState {
  const el = linearOf(state, id);
  if (!el || el.locked) return state;
  const drop = new Set(indices.filter((i) => i >= 0 && i < el.points.length));
  if (drop.size === 0 || el.points.length - drop.size < 2) return state;
  const pts = worldPointsOf(el).filter((_, i) => !drop.has(i));
  const last = el.points.length - 1;
  const bindings: EndBindings = {
    ...(drop.has(0) ? { start: null } : {}),
    ...(drop.has(last) ? { end: null } : {}),
  };
  const next = setLinearPoints(state, id, pts, bindings);
  return next.linearEdit?.id === id ? { ...next, linearEdit: { id, selected: [] } } : next;
}

/** Opens the point editor on the single selected line or arrow. */
export function openLinearEdit(state: AppState, id?: ElementId): AppState {
  const ids = selectedIds(state);
  const target = id ?? (ids.length === 1 ? ids[0] : undefined);
  if (target === undefined) return state;
  const el = linearOf(state, target);
  if (!el || el.locked) return state;
  if (state.linearEdit?.id === target) return state;
  const selection =
    ids.length === 1 && ids[0] === target ? state.selection : { [target]: true as const };
  return { ...state, selection, linearEdit: { id: target, selected: [] } };
}

export function closeLinearEdit(state: AppState): AppState {
  return state.linearEdit === null ? state : { ...state, linearEdit: null };
}

export function selectLinearPoints(state: AppState, selected: readonly number[]): AppState {
  const le = state.linearEdit;
  if (!le) return state;
  const same =
    le.selected.length === selected.length && le.selected.every((v, i) => v === selected[i]);
  return same ? state : { ...state, linearEdit: { id: le.id, selected } };
}

/**
 * Keeps `linearEdit` valid: it closes when its element is gone, locked or no
 * longer the only selection, and drops point indices that no longer exist.
 */
export function normalizeLinearEdit(state: AppState): AppState {
  const le = state.linearEdit;
  if (!le) return state;
  const el = linearOf(state, le.id);
  const ids = selectedIds(state);
  if (!el || el.locked || ids.length !== 1 || ids[0] !== le.id) {
    return { ...state, linearEdit: null };
  }
  const n = el.points.length;
  const kept = le.selected.filter((i) => i < n);
  return kept.length === le.selected.length
    ? state
    : { ...state, linearEdit: { id: le.id, selected: kept } };
}
