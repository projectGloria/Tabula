import { boxExpand, boxHeight, boxUnion, boxWidth, type Box } from '../geometry/box';
import { elementBounds } from '../geometry/element-bounds';
import type { ElementId, Scene } from '../model/types';
import { boundTextOf, isTextContainer } from '../text/bound';
import {
  paintElement,
  paintImage,
  paintText,
  type ColorMap,
  type ImageSource,
} from './draw-element';
import { SketchCache } from './sketch/cache';

export interface PaintOptions {
  /** Background behind arrow labels (the canvas colour). */
  readonly labelBackdrop: string;
  /** Text element hidden while it is open in the inline editor. */
  readonly skip?: ElementId | null;
  /** Decoded images; without it images paint as placeholders. */
  readonly images?: ImageSource | null;
  /** Colour transform for strokes, fills and text (images are never mapped). */
  readonly color?: ColorMap;
  /** Elements painted faded (marked by the eraser). */
  readonly faded?: ReadonlySet<ElementId>;
}

const FADED_ALPHA = 0.25;

/**
 * Paints `ids` (bottom-to-top) into a world-space context. Bound labels are
 * painted right after their container, whether or not they are listed.
 */
export function paintElements(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  ids: Iterable<ElementId>,
  cache: SketchCache,
  opts: PaintOptions,
): void {
  const skip = opts.skip ?? null;
  const color = opts.color ?? ((c: string) => c);
  const faded = opts.faded;
  for (const id of ids) {
    const el = scene.entities[id];
    if (!el) continue;
    const fade = faded?.has(id) === true;
    if (fade) {
      ctx.save();
      ctx.globalAlpha = FADED_ALPHA;
    }
    if (el.type === 'text') {
      if (el.containerId === null && el.id !== skip) paintText(ctx, el, null, color);
    } else if (el.type === 'image') {
      paintImage(ctx, el, opts.images ?? null);
    } else {
      paintElement(ctx, el, cache, color);
      if (isTextContainer(el)) {
        const label = boundTextOf(scene, el.id);
        if (label && label.id !== skip) {
          paintText(ctx, label, el.type === 'arrow' ? opts.labelBackdrop : null, color);
        }
      }
    }
    if (fade) ctx.restore();
  }
}

/** Union of element bounds; null when none of the ids exist. */
export function elementsBounds(scene: Scene, ids: Iterable<ElementId>): Box | null {
  let box: Box | null = null;
  for (const id of ids) {
    const el = scene.entities[id];
    if (!el) continue;
    const b = elementBounds(el);
    box = box ? boxUnion(box, b) : b;
  }
  return box;
}

export interface RasterOptions {
  /** Output pixels per world unit. */
  readonly scale: number;
  /** World-unit margin around the content. */
  readonly padding: number;
  /** Fill colour; null leaves the image transparent. */
  readonly background: string | null;
  /** Colour behind arrow labels when the background is transparent. */
  readonly labelBackdrop: string;
  /** Shrinks the scale so neither side exceeds this many pixels. */
  readonly maxSide?: number;
  readonly images?: ImageSource | null;
}

/** Largest canvas side browsers reliably support. */
export const MAX_CANVAS_SIDE = 16_384;

/** Renders elements into a new canvas sized to their bounds; null when empty. */
export function rasterize(
  scene: Scene,
  ids: readonly ElementId[],
  opts: RasterOptions,
): HTMLCanvasElement | null {
  const content = elementsBounds(scene, ids);
  if (!content) return null;
  const box = boxExpand(content, opts.padding);
  const w = boxWidth(box);
  const h = boxHeight(box);
  const limit = Math.min(opts.maxSide ?? MAX_CANVAS_SIDE, MAX_CANVAS_SIDE);
  const scale = Math.min(opts.scale, limit / Math.max(w, h, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (opts.background !== null) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, -box.minX * scale, -box.minY * scale);
  paintElements(ctx, scene, ids, new SketchCache(), {
    labelBackdrop: opts.labelBackdrop,
    images: opts.images ?? null,
  });
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type);
  });
}
