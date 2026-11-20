import { STROKE_WIDTH_PX } from '../model/style';
import type { SceneElement } from '../model/types';

/**
 * Clean geometric element drawing (M1/M2). The seeded sketch renderer
 * replaces this in M3. Expects the context to be in world space.
 */
export function drawElement(ctx: CanvasRenderingContext2D, el: SceneElement): void {
  const { style } = el;
  ctx.save();
  ctx.globalAlpha = style.opacity / 100;
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  if (el.angle !== 0) ctx.rotate(el.angle);
  ctx.lineWidth = STROKE_WIDTH_PX[style.strokeWidth];
  ctx.strokeStyle = style.strokeColor;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (el.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- single-variant union until M2 adds shapes
    case 'rectangle': {
      ctx.beginPath();
      const radius =
        style.corners === 'rounded' ? Math.min(16, Math.min(el.width, el.height) / 4) : 0;
      ctx.roundRect(-el.width / 2, -el.height / 2, el.width, el.height, radius);
      if (style.fillStyle !== 'none') {
        ctx.fillStyle = style.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
