import { panBy, zoomAt } from '../camera/camera';
import type { Point } from '../geometry/vec';
import {
  insertElements,
  mutateElement,
  removeElements,
  replaceElements,
  type ElementPatch,
  applyGeometry,
  type GeometryPatch,
} from '../model/scene';
import type { ElementId, SceneElement } from '../model/types';
import { EMPTY_SELECTION, type AppState, type Selection, type ToolId } from '../store/app-state';

/*
 * Pure, named state transitions. Every function returns the *same* state object
 * when nothing changes so subscribers are not notified needlessly.
 */

export function setTool(state: AppState, tool: ToolId): AppState {
  return state.activeTool === tool ? state : { ...state, activeTool: tool };
}

export function toggleDebug(state: AppState): AppState {
  return { ...state, debug: !state.debug };
}

export function setSelection(state: AppState, ids: Iterable<ElementId>): AppState {
  const next: Partial<Record<ElementId, true>> = {};
  let count = 0;
  for (const id of ids) {
    if (state.scene.entities[id]) {
      next[id] = true;
      count++;
    }
  }
  if (count === 0) return clearSelection(state);
  if (sameSelection(state.selection, next)) return state;
  return { ...state, selection: next };
}

export function toggleSelected(state: AppState, id: ElementId): AppState {
  if (!state.scene.entities[id]) return state;
  const next: Partial<Record<ElementId, true>> = { ...state.selection };
  if (next[id]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed record removal
    delete next[id];
  } else {
    next[id] = true;
  }
  return { ...state, selection: next };
}

export function clearSelection(state: AppState): AppState {
  return Object.keys(state.selection).length === 0
    ? state
    : { ...state, selection: EMPTY_SELECTION };
}

export function addElements(state: AppState, elements: readonly SceneElement[]): AppState {
  if (elements.length === 0) return state;
  return { ...state, scene: insertElements(state.scene, elements) };
}

export function updateElement(state: AppState, id: ElementId, patch: ElementPatch): AppState {
  const el = state.scene.entities[id];
  if (!el) return state;
  return { ...state, scene: replaceElements(state.scene, [mutateElement(el, patch)]) };
}

/** Replaces one element with `fn(element)`. No-op when it returns the same object. */
export function updateElementWith(
  state: AppState,
  id: ElementId,
  fn: (el: SceneElement) => SceneElement,
): AppState {
  const el = state.scene.entities[id];
  if (!el) return state;
  const next = fn(el);
  return next === el ? state : { ...state, scene: replaceElements(state.scene, [next]) };
}

/** Applies geometry patches by id (resize, rotate, point edits). */
export function setElementGeometry(
  state: AppState,
  patches: ReadonlyMap<ElementId, GeometryPatch>,
): AppState {
  const updated: SceneElement[] = [];
  for (const [id, g] of patches) {
    const el = state.scene.entities[id];
    if (el) updated.push(applyGeometry(el, g));
  }
  if (updated.length === 0) return state;
  return { ...state, scene: replaceElements(state.scene, updated) };
}

/** Puts back whole element snapshots (used to cancel a gesture). Unknown ids are ignored. */
export function restoreElements(state: AppState, elements: Iterable<SceneElement>): AppState {
  const restored: SceneElement[] = [];
  for (const orig of elements) {
    const current = state.scene.entities[orig.id];
    // Bump past the current revision so revision-keyed caches never go stale.
    if (current && current !== orig) restored.push({ ...orig, revision: current.revision + 1 });
  }
  const scene = replaceElements(state.scene, restored);
  return scene === state.scene ? state : { ...state, scene };
}

/** Sets absolute positions; `positions` maps id → new top-left. */
export function setElementPositions(
  state: AppState,
  positions: ReadonlyMap<ElementId, Point>,
): AppState {
  const updated: SceneElement[] = [];
  for (const [id, p] of positions) {
    const el = state.scene.entities[id];
    if (!el || (el.x === p.x && el.y === p.y)) continue;
    updated.push(mutateElement(el, { x: p.x, y: p.y }));
  }
  if (updated.length === 0) return state;
  return { ...state, scene: replaceElements(state.scene, updated) };
}

export function moveElements(
  state: AppState,
  ids: Iterable<ElementId>,
  dx: number,
  dy: number,
): AppState {
  if (dx === 0 && dy === 0) return state;
  const positions = new Map<ElementId, Point>();
  for (const id of ids) {
    const el = state.scene.entities[id];
    if (el && !el.locked) positions.set(id, { x: el.x + dx, y: el.y + dy });
  }
  return setElementPositions(state, positions);
}

export function deleteElements(state: AppState, ids: Iterable<ElementId>): AppState {
  const list = [...ids];
  const scene = removeElements(state.scene, list);
  if (scene === state.scene) return state;
  const selection: Partial<Record<ElementId, true>> = { ...state.selection };
  for (const id of list) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed record removal
    delete selection[id];
  }
  return { ...state, scene, selection };
}

export function panCamera(state: AppState, dxScreen: number, dyScreen: number): AppState {
  if (dxScreen === 0 && dyScreen === 0) return state;
  return { ...state, camera: panBy(state.camera, dxScreen, dyScreen) };
}

export function zoomCameraAt(state: AppState, screenPoint: Point, zoom: number): AppState {
  const camera = zoomAt(state.camera, screenPoint, zoom);
  return camera === state.camera ? state : { ...state, camera };
}

export function setViewport(state: AppState, width: number, height: number): AppState {
  const vp = state.viewport;
  return vp.width === width && vp.height === height
    ? state
    : { ...state, viewport: { width, height } };
}

function sameSelection(a: Selection, b: Selection): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => b[k as ElementId]);
}
