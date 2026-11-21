import type { ElementId, GroupId, Scene, SceneElement } from './types';

/*
 * Groups are implicit: an element lists the groups it belongs to, innermost
 * first. A group exists while at least one element names it.
 */

/**
 * The group a click on `el` selects. Outside any focused group that is the
 * element's outermost group; inside a focused group it is the next group in
 * (or the element itself, returned as null).
 */
export function selectionTargetGroup(el: SceneElement, focusGroup: GroupId | null): GroupId | null {
  const groups = el.groupIds;
  if (focusGroup !== null) {
    const k = groups.indexOf(focusGroup);
    if (k >= 0) return k === 0 ? null : (groups[k - 1] ?? null);
  }
  return groups[groups.length - 1] ?? null;
}

/** Ids of every element in `group`, bottom to top. */
export function groupMembers(scene: Scene, group: GroupId): ElementId[] {
  const out: ElementId[] = [];
  for (const id of scene.order) if (scene.entities[id]?.groupIds.includes(group)) out.push(id);
  return out;
}

/** Expands ids to whole selection targets (groups) under the current focus. */
export function expandToGroups(
  scene: Scene,
  ids: Iterable<ElementId>,
  focusGroup: GroupId | null,
): ElementId[] {
  const out = new Set<ElementId>();
  const seen = new Set<GroupId>();
  for (const id of ids) {
    const el = scene.entities[id];
    if (!el) continue;
    const g = selectionTargetGroup(el, focusGroup);
    if (g === null) {
      out.add(id);
    } else if (!seen.has(g)) {
      seen.add(g);
      for (const m of groupMembers(scene, g)) out.add(m);
    }
  }
  return scene.order.filter((id) => out.has(id));
}

/** Selected elements bucketed into units (a target group or a lone element). */
export function selectionUnits(
  scene: Scene,
  ids: readonly ElementId[],
  focusGroup: GroupId | null,
): SceneElement[][] {
  const units = new Map<string, SceneElement[]>();
  for (const id of ids) {
    const el = scene.entities[id];
    if (!el) continue;
    const key = selectionTargetGroup(el, focusGroup) ?? id;
    const list = units.get(key);
    if (list) list.push(el);
    else units.set(key, [el]);
  }
  return [...units.values()];
}

/** True when every member of `group` is in `ids`. */
export function groupFullyIn(scene: Scene, group: GroupId, ids: ReadonlySet<ElementId>): boolean {
  for (const id of scene.order) {
    if (scene.entities[id]?.groupIds.includes(group) && !ids.has(id)) return false;
  }
  return true;
}
