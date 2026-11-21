import { replaceElements } from '../model/scene';
import { isPaletteColor, MAX_RECENT_COLORS, normalizeHex } from '../model/palette';
import type {
  Arrowhead,
  ElementStyle,
  ElementType,
  LinearCurve,
  SceneElement,
} from '../model/types';
import { boundTextOf, isTextContainer } from '../text/bound';
import { clampFontSize } from '../text/fonts';
import {
  selectedIds,
  type AppState,
  type StyleCategory,
  type StyleMemory,
  type TextProps,
  type ToolId,
} from '../store/app-state';

/** Every style property the inspector edits, including arrow heads and text. */
export interface FullStyle extends ElementStyle, TextProps {
  readonly startHead: Arrowhead;
  readonly endHead: Arrowhead;
  readonly curve: LinearCurve;
}

const TEXT_KEYS = ['fontFamily', 'fontSize', 'textAlign', 'verticalAlign'] as const;
type TextKey = (typeof TEXT_KEYS)[number];
const isTextKey = (k: string): k is TextKey => (TEXT_KEYS as readonly string[]).includes(k);

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
  'curve',
  'startHead',
  'endHead',
  'fontFamily',
  'fontSize',
  'textAlign',
  'verticalAlign',
];

/** Whether an element type has a given style property. */
export function supportsStyle(type: ElementType, key: StyleKey): boolean {
  switch (key) {
    case 'opacity':
      return true;
    case 'strokeColor':
      return type !== 'image';
    case 'strokeWidth':
      return type !== 'text' && type !== 'image';
    case 'strokePattern':
    case 'roughness':
      return type !== 'freedraw' && type !== 'text' && type !== 'image';
    case 'fontFamily':
    case 'fontSize':
    case 'textAlign':
    case 'verticalAlign':
      return type === 'text';
    case 'fillColor':
    case 'fillStyle':
      return type === 'rectangle' || type === 'diamond' || type === 'ellipse';
    case 'corners':
      return type === 'rectangle' || type === 'diamond';
    case 'startHead':
    case 'endHead':
      return type === 'arrow';
    case 'curve':
      return type === 'line' || type === 'arrow';
  }
}

export function categoryOfType(type: ElementType): StyleCategory {
  switch (type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
    case 'image':
      return 'shape';
    case 'line':
    case 'arrow':
      return 'linear';
    case 'freedraw':
      return 'freedraw';
    case 'text':
      return 'text';
  }
}

/** The element type a drawing tool creates, or null for non-drawing tools. */
export function toolElementType(tool: ToolId): ElementType | null {
  return tool === 'select' || tool === 'hand' || tool === 'eraser' ? null : tool;
}

function fullStyleOf(el: SceneElement, memory: StyleMemory): FullStyle {
  const heads =
    el.type === 'arrow'
      ? { startHead: el.startHead, endHead: el.endHead }
      : { startHead: memory.arrowHeads.start, endHead: memory.arrowHeads.end };
  const curve = el.type === 'arrow' || el.type === 'line' ? el.curve : memory.curve;
  const text: TextProps =
    el.type === 'text'
      ? {
          fontFamily: el.fontFamily,
          fontSize: el.fontSize,
          textAlign: el.textAlign,
          verticalAlign: el.verticalAlign,
        }
      : memory.textProps;
  return { ...el.style, ...heads, curve, ...text };
}

/** Remembered style a drawing tool will use for its next element. */
export function rememberedStyle(state: AppState, type: ElementType): FullStyle {
  const m = state.styleMemory;
  return {
    ...m[categoryOfType(type)],
    startHead: m.arrowHeads.start,
    endHead: m.arrowHeads.end,
    curve: m.curve,
    ...m.textProps,
  };
}

/** Selected elements plus the labels of selected containers. */
function styleTargets(state: AppState): SceneElement[] {
  const out: SceneElement[] = [];
  for (const id of selectedIds(state)) {
    const el = state.scene.entities[id];
    if (!el) continue;
    out.push(el);
    if (isTextContainer(el)) {
      const label = boundTextOf(state.scene, el.id);
      if (label) out.push(label);
    }
  }
  return out;
}

/**
 * What the style inspector shows: the selection's style (with `'mixed'` where
 * elements differ), else the active drawing tool's remembered style, else null.
 */
export function getStyleView(state: AppState): StyleView | null {
  const sources: { type: ElementType; style: FullStyle }[] = [];
  for (const el of styleTargets(state)) {
    sources.push({ type: el.type, style: fullStyleOf(el, state.styleMemory) });
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
  const {
    startHead,
    endHead,
    curve: curvePatch,
    fontFamily,
    fontSize,
    textAlign,
    verticalAlign,
    ...stylePart
  } = patch;
  if (el.type === 'text') {
    const style = { ...el.style, ...stylePart };
    const styleChanged = (Object.keys(stylePart) as (keyof ElementStyle)[]).some(
      (k) => el.style[k] !== style[k],
    );
    const next = {
      fontFamily: fontFamily ?? el.fontFamily,
      fontSize: fontSize === undefined ? el.fontSize : clampFontSize(fontSize),
      textAlign: textAlign ?? el.textAlign,
      verticalAlign: verticalAlign ?? el.verticalAlign,
    };
    const textChanged =
      next.fontFamily !== el.fontFamily ||
      next.fontSize !== el.fontSize ||
      next.textAlign !== el.textAlign ||
      next.verticalAlign !== el.verticalAlign;
    if (!styleChanged && !textChanged) return el;
    return {
      ...el,
      ...next,
      style: styleChanged ? style : el.style,
      revision: el.revision + 1,
    };
  }
  const style = { ...el.style, ...stylePart };
  const styleChanged = (Object.keys(stylePart) as (keyof ElementStyle)[]).some(
    (k) => el.style[k] !== style[k],
  );
  if (el.type === 'arrow') {
    const start = startHead ?? el.startHead;
    const end = endHead ?? el.endHead;
    const curve = curvePatch ?? el.curve;
    if (!styleChanged && start === el.startHead && end === el.endHead && curve === el.curve)
      return el;
    return {
      ...el,
      style: styleChanged ? style : el.style,
      startHead: start,
      endHead: end,
      curve,
      revision: el.revision + 1,
    };
  }
  if (el.type === 'line') {
    const curve = curvePatch ?? el.curve;
    if (!styleChanged && curve === el.curve) return el;
    return { ...el, style: styleChanged ? style : el.style, curve, revision: el.revision + 1 };
  }
  if (!styleChanged) return el;
  return { ...el, style, revision: el.revision + 1 };
}

function rememberStyle(
  memory: StyleMemory,
  category: StyleCategory,
  patch: StylePatch,
): StyleMemory {
  const { startHead, endHead, curve, ...rest } = patch;
  const stylePart: Partial<ElementStyle> = {};
  const textPart: Partial<Record<TextKey, unknown>> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (isTextKey(k)) textPart[k] = v;
    else (stylePart as Record<string, unknown>)[k] = v;
  }
  let next = memory;
  if ((Object.keys(textPart) as TextKey[]).some((k) => next.textProps[k] !== textPart[k])) {
    next = { ...next, textProps: { ...next.textProps, ...textPart } as TextProps };
  }
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
  if (curve !== undefined && curve !== next.curve) next = { ...next, curve };
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
  const targets = styleTargets(state);
  if (targets.length > 0) {
    const updated: SceneElement[] = [];
    for (const el of targets) {
      if (el.locked) continue;
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
