import type { Point } from './vec';

const CAP_STEPS = 8;

/** Full freedraw stroke width at `pressure` (0–1) for a base width. */
export function freedrawWidth(base: number, pressure: number): number {
  return base * (0.4 + 1.2 * Math.max(0, Math.min(1, pressure)));
}

/**
 * Builds a closed outline polygon around a variable-width polyline with
 * round caps. `widths` is parallel to `points` (full width, not radius).
 */
export function strokeOutline(points: readonly Point[], widths: readonly number[]): Point[] {
  const n = points.length;
  const first = points[0];
  if (!first) return [];
  const w0 = widths[0] ?? 1;

  if (n === 1 || points.every((p) => p.x === first.x && p.y === first.y)) {
    const r = Math.max(w0, ...widths.slice(0, n)) / 2;
    const out: Point[] = [];
    const steps = CAP_STEPS * 2;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      out.push({ x: first.x + Math.cos(a) * r, y: first.y + Math.sin(a) * r });
    }
    return out;
  }

  const left: Point[] = [];
  const right: Point[] = [];
  const normals: Point[] = [];
  let lastNormal: Point = { x: 0, y: -1 };
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)] ?? first;
    const next = points[Math.min(n - 1, i + 1)] ?? first;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty);
    const normal = len > 1e-9 ? { x: -ty / len, y: tx / len } : lastNormal;
    lastNormal = normal;
    normals.push(normal);
    const p = points[i] ?? first;
    const r = (widths[i] ?? w0) / 2;
    left.push({ x: p.x + normal.x * r, y: p.y + normal.y * r });
    right.push({ x: p.x - normal.x * r, y: p.y - normal.y * r });
  }

  const out: Point[] = [...left];
  const end = points[n - 1] ?? first;
  const endN = normals[n - 1] ?? lastNormal;
  const endR = (widths[n - 1] ?? w0) / 2;
  const endA = Math.atan2(endN.y, endN.x);
  for (let k = 1; k < CAP_STEPS; k++) {
    const a = endA - (Math.PI * k) / CAP_STEPS;
    out.push({ x: end.x + Math.cos(a) * endR, y: end.y + Math.sin(a) * endR });
  }
  for (let i = n - 1; i >= 0; i--) {
    const p = right[i];
    if (p) out.push(p);
  }
  const startN = normals[0] ?? lastNormal;
  const startR = w0 / 2;
  const startA = Math.atan2(startN.y, startN.x);
  for (let k = 1; k < CAP_STEPS; k++) {
    const a = startA + Math.PI - (Math.PI * k) / CAP_STEPS;
    out.push({ x: first.x + Math.cos(a) * startR, y: first.y + Math.sin(a) * startR });
  }
  return out;
}
