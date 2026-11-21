import type { ImageElement, SceneElement, TextElement } from '../model/types';
import { fontString } from '../text/fonts';
import { layoutOf } from '../text/layout';
import type { SketchCache } from './sketch/cache';
import { tracePath } from './sketch/path';

/**
 * Paints an element from its cached sketch. Expects the context in world
 * space. Opacity applies per layer, so a fill under its own outline darkens
 * slightly where they overlap at partial opacity.
 */
export function paintElement(
  ctx: CanvasRenderingContext2D,
  el: SceneElement,
  cache: SketchCache,
): void {
  const entry = cache.get(el);
  const { layers } = entry.drawable;
  if (layers.length === 0 || el.style.opacity <= 0) return;
  let paths = entry.native as Path2D[] | null;
  if (!paths) {
    paths = layers.map((layer) => {
      const p = new Path2D();
      tracePath(p, layer.path);
      return p;
    });
    entry.native = paths;
  }

  ctx.save();
  ctx.globalAlpha = el.style.opacity / 100;
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  if (el.angle !== 0) ctx.rotate(el.angle);
  // Work in the element's local frame (origin at the unrotated top-left).
  ctx.translate(-el.width / 2, -el.height / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  layers.forEach((layer, i) => {
    const path = paths[i];
    if (!path) return;
    if (layer.mode === 'fill') {
      ctx.fillStyle = layer.color;
      ctx.fill(path);
    } else {
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.setLineDash(layer.dash ?? []);
      ctx.stroke(path);
    }
  });
  ctx.restore();
}

/** Decoded image bytes by file id; null while loading or when missing. */
export interface ImageSource {
  get(fileId: string): CanvasImageSource | null;
}

const PLACEHOLDER_FILL = 'rgba(128, 128, 128, 0.12)';
const PLACEHOLDER_LINE = 'rgba(128, 128, 128, 0.6)';

/** Paints an image stretched to its box, or a placeholder until it decodes. */
export function paintImage(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  images: ImageSource | null,
): void {
  if (el.style.opacity <= 0 || el.width <= 0 || el.height <= 0) return;
  ctx.save();
  ctx.globalAlpha = el.style.opacity / 100;
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  if (el.angle !== 0) ctx.rotate(el.angle);
  ctx.translate(-el.width / 2, -el.height / 2);
  const bitmap = images?.get(el.fileId) ?? null;
  if (bitmap) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, el.width, el.height);
  } else {
    ctx.fillStyle = PLACEHOLDER_FILL;
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.strokeStyle = PLACEHOLDER_LINE;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(0, 0, el.width, el.height);
  }
  ctx.restore();
}

/**
 * Paints a text element line by line from its layout. `backdrop` fills the
 * text box first (arrow labels sit on a gap in the line).
 */
export function paintText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  backdrop: string | null = null,
): void {
  if (el.style.opacity <= 0 || el.text === '') return;
  const layout = layoutOf(el);
  ctx.save();
  ctx.globalAlpha = el.style.opacity / 100;
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  if (el.angle !== 0) ctx.rotate(el.angle);
  ctx.translate(-el.width / 2, -el.height / 2);
  if (backdrop !== null) {
    const pad = 4;
    ctx.fillStyle = backdrop;
    ctx.fillRect(-pad, -pad / 2, el.width + pad * 2, el.height + pad);
  }
  ctx.font = fontString(el.fontFamily, el.fontSize);
  ctx.fillStyle = el.style.strokeColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = el.textAlign;
  const x = el.textAlign === 'left' ? 0 : el.textAlign === 'center' ? el.width / 2 : el.width;
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, x, layout.lineHeight * (i + 0.5));
  });
  ctx.restore();
}
