import type { ResizeHandle } from '../geometry/transform';
import { applyGeometry, type GeometryPatch } from '../model/scene';
import type { TextElement } from '../model/types';
import { clampFontSize } from './fonts';

/**
 * Resizing text. Corner handles (and any multi-selection scale) scale the
 * font; side handles left/right set a fixed wrap width; top/bottom handles
 * do nothing because the height always follows the content.
 * `handle` is null for a multi-selection scale.
 */
export function resizeTextElement(
  original: TextElement,
  g: GeometryPatch,
  handle: ResizeHandle | null,
  scale: number,
): TextElement {
  if (handle === 'n' || handle === 's') return original;
  if (handle === 'e' || handle === 'w') {
    const next = applyGeometry(original, {
      x: g.x ?? original.x,
      y: original.y,
      width: Math.max(1, g.width ?? original.width),
    });
    return { ...next, sizing: 'fixed' };
  }
  const fontSize = clampFontSize(original.fontSize * scale);
  const k = fontSize / original.fontSize;
  const next = applyGeometry(original, {
    ...g,
    width: original.width * k,
    height: original.height * k,
  });
  return { ...next, fontSize };
}
