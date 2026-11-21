import type { Point } from '../../geometry/vec';
import { ROUGHNESS_AMP } from '../../model/style';
import type { Roughness, StrokePattern } from '../../model/types';
import { catmullRomClosed, catmullRomOpen, itemAt, type PathBuilder } from './path';
import type { Rng } from './rng';

/** Wobble amplitude for a feature of the given length; small features wobble less. */
export function amplitude(roughness: Roughness, length: number): number {
  return ROUGHNESS_AMP[roughness] * Math.min(1.5, Math.max(0.3, length / 150));
}

/** Clean strokes and patterned strokes draw once; sketchy solid strokes draw twice. */
export function passesFor(roughness: Roughness, pattern: StrokePattern): number {
  return roughness === 0 || pattern !== 'solid' ? 1 : 2;
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** One hand-drawn segment: jittered ends, optional overshoot, single-direction bow. */
export function sketchSegment(
  pb: PathBuilder,
  a: Point,
  b: Point,
  k: number,
  rng: Rng,
  overshoot: boolean,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (k <= 0 || len < 1e-6) {
    pb.moveTo(a);
    pb.lineTo(b);
    return;
  }
  const ux = dx / len;
  const uy = dy / len;
  const ext = overshoot ? k * 0.8 : 0;
  const s0 = ext * rng.next();
  const s1 = ext * rng.next();
  const j = k * 0.5;
  const p0 = { x: a.x - ux * s0 + rng.signed() * j, y: a.y - uy * s0 + rng.signed() * j };
  const p1 = { x: b.x + ux * s1 + rng.signed() * j, y: b.y + uy * s1 + rng.signed() * j };
  const bow = rng.signed() * k * 1.2;
  const c1 = lerp(p0, p1, 0.3 + rng.signed() * 0.08);
  const c2 = lerp(p0, p1, 0.7 + rng.signed() * 0.08);
  const bow2 = bow * (0.6 + 0.8 * rng.next());
  pb.moveTo(p0);
  pb.curveTo(
    { x: c1.x - uy * bow, y: c1.y + ux * bow },
    { x: c2.x - uy * bow2, y: c2.y + ux * bow2 },
    p1,
  );
}

/** Connected polyline: vertices jittered once per pass, each segment bowed. */
export function sketchPolyline(pb: PathBuilder, pts: readonly Point[], k: number, rng: Rng): void {
  const v = pts.map((p) => ({ x: p.x + rng.signed() * k * 0.5, y: p.y + rng.signed() * k * 0.5 }));
  const first = v[0];
  if (!first) return;
  pb.moveTo(first);
  for (let i = 1; i < v.length; i++) {
    const a = itemAt(v, i - 1);
    const b = itemAt(v, i);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = len > 0 ? (b.x - a.x) / len : 0;
    const uy = len > 0 ? (b.y - a.y) / len : 0;
    const bow = rng.signed() * k * 1.2 * Math.min(1, len / 40);
    const bow2 = bow * (0.6 + 0.8 * rng.next());
    const c1 = lerp(a, b, 0.3);
    const c2 = lerp(a, b, 0.7);
    pb.curveTo(
      { x: c1.x - uy * bow, y: c1.y + ux * bow },
      { x: c2.x - uy * bow2, y: c2.y + ux * bow2 },
      b,
    );
  }
}

const NOISE_KNOTS = 5;

/**
 * Hand-drawn closed curve. Points of `loop` (evenly spaced, closed) move along
 * their normals by smooth periodic noise of the loop parameter, so the wobble
 * keeps its shape while the element is resized.
 *
 * `closed` → a closed path for fills; otherwise an open stroke that starts at
 * a random point and overshoots its start.
 */
export function sketchLoop(
  pb: PathBuilder,
  loop: readonly Point[],
  k: number,
  rng: Rng,
  closed: boolean,
): void {
  const n = loop.length;
  if (n < 3) return;
  const knots = Array.from({ length: NOISE_KNOTS }, () => rng.signed() * k);
  const noise = (t: number): number => {
    const x = t * NOISE_KNOTS;
    const i = Math.floor(x);
    const s = (1 - Math.cos((x - i) * Math.PI)) / 2;
    const a = knots[i % NOISE_KNOTS] ?? 0;
    const b = knots[(i + 1) % NOISE_KNOTS] ?? 0;
    return a + (b - a) * s;
  };
  const displaced = (i: number, extra: number): Point => {
    const p = itemAt(loop, i);
    const prev = itemAt(loop, (i - 1 + n) % n);
    const next = itemAt(loop, (i + 1) % n);
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    const d = noise(i / n) + extra;
    return { x: p.x + (ty / tl) * d, y: p.y - (tx / tl) * d };
  };

  if (closed) {
    catmullRomClosed(
      pb,
      loop.map((_, i) => displaced(i, 0)),
    );
    return;
  }
  const start = Math.floor(rng.next() * n);
  const over = Math.max(1, Math.round(n * (0.04 + 0.06 * rng.next())));
  const drift = k * (0.4 + 0.6 * rng.next());
  const pts: Point[] = [];
  for (let j = 0; j <= n + over; j++) {
    const extra = j > n ? (drift * (j - n)) / over : 0;
    pts.push(displaced((start + j) % n, extra));
  }
  catmullRomOpen(pb, pts);
}
