import { worldToLocal } from '../geometry/element-geometry';
import type { Point } from '../geometry/vec';
import { createText, insertElements, mutateElement } from '../model/scene';
import type { ElementId, SceneElement, TextElement } from '../model/types';
import { selectedIds, type AppState } from '../store/app-state';
import { boundTextOf, isTextContainer, type TextContainer } from '../text/bound';
import { LINE_HEIGHT } from '../text/fonts';
import { deleteElements, setSelection } from './actions';

/** Opens the inline editor on a text element (selecting it or its container). */
export function openTextEditor(state: AppState, id: ElementId): AppState {
  const el = state.scene.entities[id];
  if (el?.type !== 'text' || el.locked) return state;
  const select = el.containerId ?? el.id;
  return { ...setSelection(state, [select]), editingText: id };
}

/** Closes the editor; a text left empty is removed. */
export function closeTextEditor(state: AppState): AppState {
  const id = state.editingText;
  if (id === null) return state;
  const el = state.scene.entities[id];
  const closed: AppState = { ...state, editingText: null };
  if (el?.type === 'text' && el.text.trim() === '') return deleteElements(closed, [id]);
  return closed;
}

export function setTextContent(state: AppState, id: ElementId, text: string): AppState {
  const el = state.scene.entities[id];
  if (el?.type !== 'text' || el.text === text) return state;
  const entities = { ...state.scene.entities, [id]: mutateElement(el, { text }) };
  return { ...state, scene: { ...state.scene, entities } };
}

function textDefaults(
  state: AppState,
): Pick<TextElement, 'fontFamily' | 'fontSize' | 'textAlign' | 'verticalAlign' | 'style'> {
  const m = state.styleMemory;
  return { ...m.textProps, style: m.text };
}

/** Opens the container's label, creating an empty one when it has none. */
export function editContainerText(state: AppState, container: TextContainer): AppState {
  if (container.locked) return state;
  const existing = boundTextOf(state.scene, container.id);
  if (existing) return openTextEditor(state, existing.id);
  const d = textDefaults(state);
  const text = createText({
    x: container.x,
    y: container.y,
    ...d,
    style: { ...d.style, strokeColor: container.style.strokeColor },
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: container.id,
  });
  const at = state.scene.order.indexOf(container.id) + 1;
  const scene = insertElements(state.scene, [text], at);
  return openTextEditor({ ...state, scene }, text.id);
}

/** Creates free text with its first line centered vertically on `p`. */
export function createTextAt(state: AppState, p: Point, width: number | null = null): AppState {
  const d = textDefaults(state);
  const lineHeight = d.fontSize * LINE_HEIGHT;
  const text = createText({
    x: p.x,
    y: p.y - lineHeight / 2,
    ...d,
    ...(width === null ? {} : { width, sizing: 'fixed' as const }),
  });
  const scene = insertElements(state.scene, [text]);
  return openTextEditor({ ...state, scene }, text.id);
}

/** Largest pasted plain text, in characters. */
export const MAX_PASTE_TEXT = 20_000;

/** Pastes plain text as a new free text element with its top-left at `p`, selected. */
export function pasteTextAt(state: AppState, p: Point, content: string): AppState {
  const value = content.replace(/\r\n?/g, '\n').slice(0, MAX_PASTE_TEXT);
  if (value.trim() === '') return state;
  const text = createText({ x: p.x, y: p.y, ...textDefaults(state), text: value });
  const scene = insertElements(state.scene, [text]);
  return setSelection({ ...state, scene, activeTool: 'select' }, [text.id]);
}

/** Topmost unlocked box shape whose area contains `p` (filled or not). */
function boxUnder(state: AppState, p: Point): TextContainer | undefined {
  const { order, entities } = state.scene;
  for (let i = order.length - 1; i >= 0; i--) {
    const el = entities[order[i] ?? ('' as ElementId)];
    if (!el || el.locked) continue;
    if (el.type !== 'rectangle' && el.type !== 'diamond' && el.type !== 'ellipse') continue;
    const l = worldToLocal(el, p);
    if (l.x >= 0 && l.y >= 0 && l.x <= el.width && l.y <= el.height) return el;
  }
  return undefined;
}

/**
 * Double-click / text-tool click semantics: edit the text under the point,
 * label the shape or arrow under it, or start new free text.
 */
export function editTextAt(state: AppState, p: Point, hit: ElementId | undefined): AppState {
  const el: SceneElement | undefined = hit === undefined ? undefined : state.scene.entities[hit];
  if (el?.type === 'text') return openTextEditor(state, el.id);
  if (el && isTextContainer(el)) return editContainerText(state, el);
  if (!el) {
    const box = boxUnder(state, p);
    if (box) return editContainerText(state, box);
  }
  return createTextAt(state, p);
}

/** Enter on a selection: edit the single selected text or label. */
export function editSelectedText(state: AppState): AppState {
  const ids = selectedIds(state);
  if (ids.length !== 1 || state.editingText !== null) return state;
  const el = state.scene.entities[ids[0] ?? ('' as ElementId)];
  if (!el) return state;
  if (el.type === 'text') return openTextEditor(state, el.id);
  if (isTextContainer(el)) return editContainerText(state, el);
  return state;
}

export function canEditSelectedText(state: AppState): boolean {
  const ids = selectedIds(state);
  if (ids.length !== 1 || state.editingText !== null) return false;
  const el = state.scene.entities[ids[0] ?? ('' as ElementId)];
  return el !== undefined && !el.locked && (el.type === 'text' || isTextContainer(el));
}
