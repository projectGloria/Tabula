import type { SceneElement } from '../model/types';
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
