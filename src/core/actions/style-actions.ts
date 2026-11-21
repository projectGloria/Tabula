import { replaceElements } from '../model/scene';
import { isPaletteColor, MAX_RECENT_COLORS, normalizeHex } from '../model/palette';
import type { Arrowhead, ElementStyle, ElementType, SceneElement } from '../model/types';
import {
  selectedIds,
  type AppState,
  type StyleCategory,
  type StyleMemory,
  type ToolId,
} from '../store/app-state';

/** Every style property the inspector edits, including per-arrow heads. */
export interface FullStyle extends ElementStyle {
  readonly startHead: Arrowhead;
  readonly endHead: Arrowhead;
}

export type StyleKey = keyof FullStyle;
export type StylePatch = Partial<FullStyle>;

/** Per property: the shared value, `'mixed'`, or absent when no target supports it. */
export type StyleView = { readonly [K in StyleKey]?: FullStyle[K] | 'mixed' };

export const STYLE_KEYS: readonly StyleKey[] = [
  'strokeColor',
  'fillColor',
  'fillStyle',
  'strokeWidth',
  'strokePattern',
  'roughness',
  'corners',
  'opacity',
  'startHead',
  'endHead',
];

/** Whether an element type has a given style property. */
export function supportsStyle(type: ElementType, key: StyleKey): boolean {
  switch (key) {
    case 'strokeColor':
    case 'strokeWidth':
    case 'opacity':
      return true;
    case 'strokePattern':
    case 'roughness':
      return type !== 'freedraw';
    case 'fillColor':
    case 'fillStyle':
      return type === 'rectangle' || type === 'diamond' || type === 'ellipse';
    case 'corners':
      return type === 'rectangle' || type === 'diamond';
    case 'startHead':
    case 'endHead':
      return type === 'arrow';
  }
}

export function categoryOfType(type: ElementType): StyleCategory {
  switch (type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return 'shape';
    case 'line':
    case 'arrow':
      return 'linear';
    case 'freedraw':
      return 'freedraw';
  }
}

/** The element type a drawing tool creates, or null for non-drawing tools. */
export function toolElementType(tool: ToolId): ElementType | null {
  return tool === 'select' ? null : tool;
}

function fullStyleOf(el: SceneElement, memory: StyleMemory): FullStyle {
  const heads =
    el.type === 'arrow'
      ? { startHead: el.startHead, endHead: el.endHead }
      : { startHead: memory.arrowHeads.start, endHead: memory.arrowHeads.end };
  return { ...el.style, ...heads };
}

/** Remembered style a drawing tool will use for its next element. */
export function rememberedStyle(state: AppState, type: ElementType): FullStyle {
  const m = state.styleMemory;
  return {
    ...m[categoryOfType(type)],
    startHead: m.arrowHeads.start,
    endHead: m.arrowHeads.end,
  };
}

/**
 * What the style inspector shows: the selection's style (with `'mixed'` where
 * elements differ), else the active drawing tool's remembered style, else null.
 */
export function getStyleView(state: AppState): StyleView | null {
  const ids = selectedIds(state);
  const sources: { type: ElementType; style: FullStyle }[] = [];
  for (const id of ids) {
    const el = state.scene.entities[id];
    if (el) sources.push({ type: el.type, style: fullStyleOf(el, state.styleMemory) });
  }
  if (sources.length === 0) {
    const type = toolElementType(state.activeTool);
    if (!type) return null;
    sources.push({ type, style: rememberedStyle(state, type) });
  }
  const view: Record<string, unknown> = {};
  for (const key of STYLE_KEYS) {
    let value: unknown;
    let seen = false;
    for (const s of sources) {
      if (!supportsStyle(s.type, key)) continue;
      const v = s.style[key];
      if (!seen) {
        value = v;
        seen = true;
      } else if (value !== v) {
        value = 'mixed';
        break;
      }
    }
    if (seen) view[key] = value;
  }
  return view;
}

/** Only the entries of `patch` that `type` supports. */
function patchFor(type: ElementType, patch: StylePatch): StylePatch {
  const out: Record<string, unknown> = {};
  for (const key of STYLE_KEYS) {
    if (patch[key] !== undefined && supportsStyle(type, key)) out[key] = patch[key];
  }
  return out;
}

function withPatch(el: SceneElement, patch: StylePatch): SceneElement {
  const { startHead, endHead, ...stylePart } = patch;
  const style = { ...el.style, ...stylePart };
  const styleChanged = (Object.keys(stylePart) as (keyof ElementStyle)[]).some(
    (k) => el.style[k] !== style[k],
  );
  if (el.type === 'arrow') {
    const start = startHead ?? el.startHead;
    const end = endHead ?? el.endHead;
    if (!styleChanged && start === el.startHead && end === el.endHead) return el;
    return {
      ...el,
      style: styleChanged ? style : el.style,
      startHead: start,
      endHead: end,
      revision: el.revision + 1,
    };
  }
  if (!styleChanged) return el;
  return { ...el, style, revision: el.revision + 1 };
}

function rememberStyle(
  memory: StyleMemory,
  category: StyleCategory,
  patch: StylePatch,
): StyleMemory {
  const { startHead, endHead, ...stylePart } = patch;
  let next = memory;
  const current = next[category];
  if ((Object.keys(stylePart) as (keyof ElementStyle)[]).some((k) => current[k] !== stylePart[k]))
    next = { ...next, [category]: { ...current, ...stylePart } };
  if (
    (startHead !== undefined && startHead !== next.arrowHeads.start) ||
    (endHead !== undefined && endHead !== next.arrowHeads.end)
  ) {
    next = {
      ...next,
      arrowHeads: {
        start: startHead ?? next.arrowHeads.start,
        end: endHead ?? next.arrowHeads.end,
      },
    };
  }
  return next;
}

/** Moves a custom color to the front of the recent list; palette colors are not recorded. */
export function pushRecentColor(recent: readonly string[], color: string): readonly string[] {
  const hex = normalizeHex(color);
  if (!hex || isPaletteColor(hex)) return recent;
  if (recent[0] === hex) return recent;
  return [hex, ...recent.filter((c) => c !== hex)].slice(0, MAX_RECENT_COLORS);
}

/**
 * Applies a style change from the inspector. With a selection, it updates
 * every selected, unlocked element that supports each property and the
 * remembered style of their categories; without one, it updates the active
 * drawing tool's remembered style.
 */
export function applyStyle(state: AppState, patch: StylePatch): AppState {
  let memory = state.styleMemory;
  let scene = state.scene;
  const ids = selectedIds(state);
  if (ids.length > 0) {
    const updated: SceneElement[] = [];
    for (const id of ids) {
      const el = state.scene.entities[id];
      if (!el || el.locked) continue;
      const p = patchFor(el.type, patch);
      memory = rememberStyle(memory, categoryOfType(el.type), p);
      const next = withPatch(el, p);
      if (next !== el) updated.push(next);
    }
    scene = replaceElements(scene, updated);
  } else {
    const type = toolElementType(state.activeTool);
    if (type) memory = rememberStyle(memory, categoryOfType(type), patchFor(type, patch));
  }

  let recent = state.recentColors;
  if (patch.strokeColor) recent = pushRecentColor(recent, patch.strokeColor);
  if (patch.fillColor) recent = pushRecentColor(recent, patch.fillColor);

  if (scene === state.scene && memory === state.styleMemory && recent === state.recentColors)
    return state;
  return { ...state, scene, styleMemory: memory, recentColors: recent };
}
