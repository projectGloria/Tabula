import {
  arrowheadSize,
  cornerRadius,
  diamondVertices,
  freedrawOutline,
  strokePx,
} from '../geometry/element-shape';
import type { Point } from '../geometry/vec';
import type { ArrowElement, Arrowhead, SceneElement } from '../model/types';

/** Traces a closed polygon with optional rounded corners. */
function tracePolygon(ctx: CanvasRenderingContext2D, pts: readonly Point[], radius: number): void {
  const n = pts.length;
  const last = pts[n - 1];
  const first = pts[0];
  if (!first || !last) return;
  if (radius <= 0) {
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < n; i++) {
      const p = pts[i];
      if (p) ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    return;
  }
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const next = pts[(i + 1) % n];
    if (p && next) ctx.arcTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2, radius);
  }
  ctx.closePath();
}

/** Fills a closed outline with quadratic curves through edge midpoints. */
function fillSmoothOutline(ctx: CanvasRenderingContext2D, pts: readonly Point[]): void {
  const n = pts.length;
  const first = pts[0];
  const second = pts[1];
  if (!first) return;
  ctx.beginPath();
  if (!second) {
    ctx.arc(first.x, first.y, 0.5, 0, Math.PI * 2);
  } else {
    ctx.moveTo((first.x + second.x) / 2, (first.y + second.y) / 2);
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n];
      const next = pts[(i + 1) % n];
      if (p && next) ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    ctx.closePath();
  }
  ctx.fill('nonzero');
}

/**
 * Draws an arrowhead at `tip`, pointing away from `from`. `size` is the head
 * length; the stroke style and color are already set on the context.
 */
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  head: Arrowhead,
  tip: Point,
  from: Point,
  size: number,
  color: string,
): void {
  if (head === 'none') return;
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular (left of travel direction).
  const nx = -uy;
  const ny = ux;
  const at = (along: number, side: number): Point => ({
    x: tip.x - ux * along + nx * side,
    y: tip.y - uy * along + ny * side,
  });

  ctx.beginPath();
  switch (head) {
    case 'arrow': {
      const a = at(size, size * 0.5);
      const b = at(size, -size * 0.5);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }
    case 'triangle': {
      const a = at(size, size * 0.45);
      const b = at(size, -size * 0.45);
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
      return;
    }
    case 'bar': {
      const a = at(0, size * 0.5);
      const b = at(0, -size * 0.5);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }
    case 'dot': {
      const r = size * 0.3;
      const c = at(r, 0);
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      return;
    }
    case 'diamond': {
      const half = size * 0.35;
      const mid = at(half * 1.4, 0);
      const back = at(half * 2.8, 0);
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(mid.x + nx * half, mid.y + ny * half);
      ctx.lineTo(back.x, back.y);
      ctx.lineTo(mid.x - nx * half, mid.y - ny * half);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
      return;
    }
  }
}

function drawArrowheads(
  ctx: CanvasRenderingContext2D,
  el: ArrowElement,
  pts: readonly Point[],
): void {
  const size = arrowheadSize(strokePx(el));
  const n = pts.length;
  const p0 = pts[0];
  const p1 = pts[1];
  const pn = pts[n - 1];
  const pm = pts[n - 2];
  if (p0 && p1) drawArrowhead(ctx, el.startHead, p0, p1, size, el.style.strokeColor);
  if (pn && pm) drawArrowhead(ctx, el.endHead, pn, pm, size, el.style.strokeColor);
}

/**
 * Clean geometric element drawing (M1/M2). The seeded sketch renderer
 * replaces this in M3. Expects the context to be in world space.
 */
export function drawElement(ctx: CanvasRenderingContext2D, el: SceneElement): void {
  const { style } = el;
  const filled = style.fillStyle !== 'none';
  ctx.save();
  ctx.globalAlpha = style.opacity / 100;
  ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
  if (el.angle !== 0) ctx.rotate(el.angle);
  // Work in the element's local frame (origin at the unrotated top-left).
  ctx.translate(-el.width / 2, -el.height / 2);
  ctx.lineWidth = strokePx(el);
  ctx.strokeStyle = style.strokeColor;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (el.type) {
    case 'rectangle': {
      ctx.beginPath();
      ctx.roundRect(0, 0, el.width, el.height, cornerRadius(el));
      if (filled) {
        ctx.fillStyle = style.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      tracePolygon(ctx, diamondVertices(el.width, el.height), cornerRadius(el));
      if (filled) {
        ctx.fillStyle = style.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
      if (filled) {
        ctx.fillStyle = style.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      const pts = el.points;
      const first = pts[0];
      if (!first) break;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (p) ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      if (el.type === 'arrow') drawArrowheads(ctx, el, pts);
      break;
    }
    case 'freedraw': {
      ctx.fillStyle = style.strokeColor;
      fillSmoothOutline(ctx, freedrawOutline(el));
      break;
    }
  }
  ctx.restore();
}
