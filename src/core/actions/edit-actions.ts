import { boxCenter, boxUnion, type Box } from '../geometry/box';
import { rectAABB } from '../geometry/rect';
import type { Point } from '../geometry/vec';
import {
  expandToGroups,
  groupFullyIn,
  groupMembers,
  selectionTargetGroup,
  selectionUnits,
} from '../model/groups';
import { createElementId, createGroupId } from '../model/ids';
import { insertElements, isPointsElement, mutateElement, replaceElements } from '../model/scene';
import type { ElementId, GroupId, PointBinding, Scene, SceneElement } from '../model/types';
import { selectedIds, type AppState } from '../store/app-state';
import { boundTextIndex } from '../text/bound';
import { clearSelection, deleteElements, moveElements, setSelection } from './actions';

/** Offset for duplicates and repeated pastes, in world units. */
export const DUPLICATE_OFFSET = 16;

function unlockedSelection(state: AppState): ElementId[] {
  return selectedIds(state).filter((id) => state.scene.entities[id]?.locked === false);
}

function boundsOf(elements: readonly SceneElement[]): Box | null {
  let box: Box | null = null;
  for (const el of elements) box = box ? boxUnion(box, rectAABB(el)) : rectAABB(el);
  return box;
}

// --- Selection ---------------------------------------------------------

export function selectAll(state: AppState): AppState {
  const ids = state.scene.order.filter((id) => state.scene.entities[id]?.locked === false);
  return setSelection(state, ids);
}

/** Clears the selection, then leaves the focused group. */
export function deselect(state: AppState): AppState {
  if (Object.keys(state.selection).length > 0) return clearSelection(state);
  return state.focusGroup === null ? state : { ...state, focusGroup: null };
}

export function setFocusGroup(state: AppState, group: GroupId | null): AppState {
  return state.focusGroup === group ? state : { ...state, focusGroup: group };
}

/** Selects `id` expanded to its target group (click semantics). */
export function selectWithGroups(
  state: AppState,
  ids: Iterable<ElementId>,
  additive: boolean,
): AppState {
  const expanded = expandToGroups(state.scene, ids, state.focusGroup);
  return setSelection(state, additive ? [...selectedIds(state), ...expanded] : expanded);
}

// --- Delete / duplicate --------------------------------------------------

export function deleteSelection(state: AppState): AppState {
  const ids = unlockedSelection(state);
  return ids.length === 0 ? state : deleteElements(state, ids);
}

/**
 * Copies elements with fresh ids and seeds kept (so copies look identical).
 * Groups listed in `remap` get new ids; others are kept, so a copy made inside
 * an entered group stays in it.
 */
export function cloneElements(
  elements: readonly SceneElement[],
  offset: Point,
  remap: (g: GroupId) => boolean,
): SceneElement[] {
  const newIds = new Map<GroupId, GroupId>();
  const ids = new Map<ElementId, ElementId>(elements.map((el) => [el.id, createElementId()]));
  return elements.flatMap((el): SceneElement[] => {
    const id = ids.get(el.id) ?? createElementId();
    if (el.type === 'text' && el.containerId !== null) {
      // A label is copied only together with its container.
      const containerId = ids.get(el.containerId);
      if (containerId === undefined) return [];
      return [cloneOne({ ...el, containerId }, id, offset, remap, newIds)];
    }
    if (el.type === 'arrow') {
      // Bindings follow their target into the copy; others are dropped.
      const rebind = (b: PointBinding | null): PointBinding | null => {
        const target = b ? ids.get(b.elementId) : undefined;
        return b && target !== undefined ? { elementId: target, anchor: b.anchor } : null;
      };
      const arrow = {
        ...el,
        startBinding: rebind(el.startBinding),
        endBinding: rebind(el.endBinding),
      };
      return [cloneOne(arrow, id, offset, remap, newIds)];
    }
    return [cloneOne(el, id, offset, remap, newIds)];
  });
}

/** Elements plus the labels bound to any of them, in z-order. */
export function withBoundText(scene: Scene, ids: Iterable<ElementId>): ElementId[] {
  const set = new Set(ids);
  const index = boundTextIndex(scene);
  for (const id of [...set]) {
    const t = index.get(id);
    if (t !== undefined) set.add(t);
  }
  return scene.order.filter((id) => set.has(id));
}

function cloneOne(
  el: SceneElement,
  id: ElementId,
  offset: Point,
  remap: (g: GroupId) => boolean,
  newIds: Map<GroupId, GroupId>,
): SceneElement {
  return {
    ...el,
    id,
    x: el.x + offset.x,
    y: el.y + offset.y,
    locked: false,
    revision: 0,
    groupIds: el.groupIds.map((g) => {
      if (!remap(g)) return g;
      let n = newIds.get(g);
      if (!n) {
        n = createGroupId();
        newIds.set(g, n);
      }
      return n;
    }),
  };
}

/** Inserts copies directly above the topmost source element and selects them. */
export function duplicateElements(
  state: AppState,
  ids: readonly ElementId[],
  offset: Point,
): AppState {
  const set = new Set(ids);
  const sources = withBoundText(state.scene, ids);
  const elements = sources.flatMap((id) => {
    const el = state.scene.entities[id];
    return el ? [el] : [];
  });
  if (elements.length === 0) return state;
  const copies = cloneElements(elements, offset, (g) => groupFullyIn(state.scene, g, set));
  const selectable = copies.filter((c) => !(c.type === 'text' && c.containerId !== null));
  const top = Math.max(...sources.map((id) => state.scene.order.indexOf(id)));
  const scene = insertElements(state.scene, copies, top + 1);
  return setSelection(
    { ...state, scene },
    selectable.map((c) => c.id),
  );
}

export function duplicateSelection(state: AppState): AppState {
  return duplicateElements(state, selectedIds(state), { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET });
}

// --- Groups ----------------------------------------------------------------

export function groupSelection(state: AppState): AppState {
  const ids = unlockedSelection(state);
  if (ids.length < 2) return state;
  const set = new Set(ids);
  const { scene } = state;
  // Already exactly one group: nothing to do.
  const firstEl = scene.entities[ids[0] ?? ('' as ElementId)];
  for (const g of firstEl?.groupIds ?? []) {
    if (groupFullyIn(scene, g, set) && groupMembers(scene, g).length === ids.length) return state;
  }
  const gid = createGroupId();
  const updated = ids.flatMap((id) => {
    const el = scene.entities[id];
    if (!el) return [];
    // Nest the new group inside groups the selection only partly covers.
    let k = el.groupIds.findIndex((g) => !groupFullyIn(scene, g, set));
    if (k < 0) k = el.groupIds.length;
    const groupIds = [...el.groupIds.slice(0, k), gid, ...el.groupIds.slice(k)];
    return [mutateElement(el, { groupIds })];
  });
  return { ...state, scene: replaceElements(scene, updated) };
}

export function ungroupSelection(state: AppState): AppState {
  const ids = unlockedSelection(state);
  const set = new Set(ids);
  const { scene } = state;
  const drop = new Set<GroupId>();
  for (const id of ids) {
    const el = scene.entities[id];
    if (!el) continue;
    const g = selectionTargetGroup(el, state.focusGroup);
    if (g !== null && groupFullyIn(scene, g, set)) drop.add(g);
  }
  if (drop.size === 0) return state;
  const updated = ids.flatMap((id) => {
    const el = scene.entities[id];
    if (!el?.groupIds.some((g) => drop.has(g))) return [];
    return [mutateElement(el, { groupIds: el.groupIds.filter((g) => !drop.has(g)) })];
  });
  return { ...state, scene: replaceElements(scene, updated) };
}

// --- Z-order -----------------------------------------------------------------

export type ZMove = 'back' | 'backward' | 'forward' | 'front';

function reorder(scene: Scene, ids: ReadonlySet<ElementId>, move: ZMove): readonly ElementId[] {
  const order = [...scene.order];
  if (move === 'front' || move === 'back') {
    const sel = order.filter((id) => ids.has(id));
    const rest = order.filter((id) => !ids.has(id));
    return move === 'front' ? [...rest, ...sel] : [...sel, ...rest];
  }
  if (move === 'forward') {
    for (let i = order.length - 2; i >= 0; i--) {
      const a = order[i];
      const b = order[i + 1];
      if (a !== undefined && b !== undefined && ids.has(a) && !ids.has(b)) {
        order[i] = b;
        order[i + 1] = a;
      }
    }
  } else {
    for (let i = 1; i < order.length; i++) {
      const a = order[i];
      const b = order[i - 1];
      if (a !== undefined && b !== undefined && ids.has(a) && !ids.has(b)) {
        order[i] = b;
        order[i - 1] = a;
      }
    }
  }
  return order;
}

export function moveInZ(state: AppState, move: ZMove): AppState {
  const ids = new Set(unlockedSelection(state));
  if (ids.size === 0) return state;
  const order = reorder(state.scene, ids, move);
  if (order.every((id, i) => state.scene.order[i] === id)) return state;
  return { ...state, scene: { entities: state.scene.entities, order } };
}

// --- Align / distribute ----------------------------------------------------

export type Alignment = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

interface Unit {
  readonly elements: SceneElement[];
  readonly box: Box;
}

function units(state: AppState): Unit[] {
  const out: Unit[] = [];
  for (const elements of selectionUnits(state.scene, unlockedSelection(state), state.focusGroup)) {
    const box = boundsOf(elements);
    if (box) out.push({ elements, box });
  }
  return out;
}

function shiftUnits(
  state: AppState,
  moves: readonly { unit: Unit; dx: number; dy: number }[],
): AppState {
  let next = state;
  for (const m of moves) {
    next = moveElements(
      next,
      m.unit.elements.map((e) => e.id),
      m.dx,
      m.dy,
    );
  }
  return next;
}

export function alignSelection(state: AppState, alignment: Alignment): AppState {
  const list = units(state);
  if (list.length < 2) return state;
  let all = list[0]?.box;
  for (const u of list) all = all ? boxUnion(all, u.box) : u.box;
  if (!all) return state;
  const target = all;
  const c = boxCenter(target);
  return shiftUnits(
    state,
    list.map((unit) => {
      const b = unit.box;
      const uc = boxCenter(b);
      switch (alignment) {
        case 'left':
          return { unit, dx: target.minX - b.minX, dy: 0 };
        case 'right':
          return { unit, dx: target.maxX - b.maxX, dy: 0 };
        case 'centerX':
          return { unit, dx: c.x - uc.x, dy: 0 };
        case 'top':
          return { unit, dx: 0, dy: target.minY - b.minY };
        case 'bottom':
          return { unit, dx: 0, dy: target.maxY - b.maxY };
        case 'centerY':
          return { unit, dx: 0, dy: c.y - uc.y };
      }
    }),
  );
}

/** Equal gaps between units along an axis; the outermost two stay put. */
export function distributeSelection(state: AppState, axis: 'x' | 'y'): AppState {
  const list = units(state);
  if (list.length < 3) return state;
  const lo = (b: Box) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: Box) => (axis === 'x' ? b.maxX : b.maxY);
  const sorted = [...list].sort((a, b) => lo(a.box) + hi(a.box) - (lo(b.box) + hi(b.box)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return state;
  const span =
    Math.max(...sorted.map((u) => hi(u.box))) - Math.min(...sorted.map((u) => lo(u.box)));
  const sizes = sorted.reduce((sum, u) => sum + hi(u.box) - lo(u.box), 0);
  const gap = (span - sizes) / (sorted.length - 1);
  let cursor = Math.min(...sorted.map((u) => lo(u.box)));
  const moves = sorted.map((unit) => {
    const d = cursor - lo(unit.box);
    cursor += hi(unit.box) - lo(unit.box) + gap;
    return axis === 'x' ? { unit, dx: d, dy: 0 } : { unit, dx: 0, dy: d };
  });
  return shiftUnits(state, moves);
}

// --- Flip --------------------------------------------------------------------

/** Mirrors the selection about its center; angles negate, local points mirror. */
export function flipSelection(state: AppState, axis: 'horizontal' | 'vertical'): AppState {
  const elements = unlockedSelection(state).flatMap((id) => {
    const el = state.scene.entities[id];
    return el ? [el] : [];
  });
  const box = boundsOf(elements);
  if (!box) return state;
  const c = boxCenter(box);
  const h = axis === 'horizontal';
  const updated = elements.map((el) => {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const ncx = h ? 2 * c.x - cx : cx;
    const ncy = h ? cy : 2 * c.y - cy;
    const base = { x: ncx - el.width / 2, y: ncy - el.height / 2, angle: -el.angle };
    if (isPointsElement(el)) {
      const points = el.points.map((p) =>
        h ? { x: el.width - p.x, y: p.y } : { x: p.x, y: el.height - p.y },
      );
      return mutateElement(el, { ...base, points });
    }
    return mutateElement(el, base);
  });
  return { ...state, scene: replaceElements(state.scene, updated) };
}

// --- Lock ----------------------------------------------------------------------

/** Locks the selection, or unlocks it when every selected element is locked. */
export function toggleLockSelection(state: AppState): AppState {
  const ids = selectedIds(state);
  if (ids.length === 0) return state;
  const lock = ids.some((id) => state.scene.entities[id]?.locked === false);
  const updated = ids.flatMap((id) => {
    const el = state.scene.entities[id];
    return el && el.locked !== lock ? [mutateElement(el, { locked: lock })] : [];
  });
  return { ...state, scene: replaceElements(state.scene, updated) };
}

export function unlockAll(state: AppState): AppState {
  const updated = state.scene.order.flatMap((id) => {
    const el = state.scene.entities[id];
    return el?.locked ? [mutateElement(el, { locked: false })] : [];
  });
  if (updated.length === 0) return state;
  const next = { ...state, scene: replaceElements(state.scene, updated) };
  return setSelection(
    next,
    updated.map((e) => e.id),
  );
}

// --- Nudge ---------------------------------------------------------------------

export function nudgeSelection(state: AppState, dx: number, dy: number): AppState {
  return moveElements(state, unlockedSelection(state), dx, dy);
}
