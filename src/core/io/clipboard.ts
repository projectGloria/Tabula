import { cloneElements, withBoundText } from '../actions/edit-actions';
import { setSelection } from '../actions/actions';
import { boxCenter, boxUnion, type Box } from '../geometry/box';
import { rectAABB } from '../geometry/rect';
import type { Point } from '../geometry/vec';
import { insertElements } from '../model/scene';
import type { SceneElement } from '../model/types';
import { selectedIds, type AppState } from '../store/app-state';
import { sanitizeElements } from './validate';

/** MIME-like marker identifying Tabula clipboard payloads. */
export const CLIPBOARD_KIND = 'tabula/clipboard';
export const CLIPBOARD_VERSION = 1;

/** Clipboard text longer than this is not parsed. */
const MAX_CLIPBOARD_CHARS = 20_000_000;

interface ClipboardPayload {
  readonly kind: typeof CLIPBOARD_KIND;
  readonly version: number;
  readonly elements: readonly SceneElement[];
}

/** Selected elements in z-order, ready to copy. */
export function copyableElements(state: AppState): SceneElement[] {
  return withBoundText(state.scene, selectedIds(state)).flatMap((id) => {
    const el = state.scene.entities[id];
    return el ? [el] : [];
  });
}

export function serializeClipboard(elements: readonly SceneElement[]): string {
  const payload: ClipboardPayload = {
    kind: CLIPBOARD_KIND,
    version: CLIPBOARD_VERSION,
    elements: elements.map((el) => ({ ...el, revision: 0 })),
  };
  return JSON.stringify(payload);
}

/** Parses clipboard text; null when it is not a Tabula payload. */
export function parseClipboard(text: string): SceneElement[] | null {
  if (text.length > MAX_CLIPBOARD_CHARS || !text.trimStart().startsWith('{')) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.kind !== CLIPBOARD_KIND || typeof d.version !== 'number') return null;
  if (d.version > CLIPBOARD_VERSION) return null;
  const elements = sanitizeElements(d.elements);
  return elements.length > 0 ? elements : null;
}

/**
 * Inserts pasted elements on top with fresh ids and groups. `at` centers the
 * paste there; null keeps the original position (paste in place).
 */
export function pasteElements(
  state: AppState,
  elements: readonly SceneElement[],
  at: Point | null,
): AppState {
  if (elements.length === 0) return state;
  let box: Box | null = null;
  for (const el of elements) box = box ? boxUnion(box, rectAABB(el)) : rectAABB(el);
  if (!box) return state;
  const c = boxCenter(box);
  const offset = at ? { x: at.x - c.x, y: at.y - c.y } : { x: 0, y: 0 };
  const copies = cloneElements(elements, offset, () => true);
  const scene = insertElements(state.scene, copies);
  return setSelection(
    { ...state, scene, focusGroup: null },
    copies.map((e) => e.id),
  );
}
