const TAU = Math.PI * 2;

/** 15° in radians: the snap step for rotation and constrained lines. */
export const SNAP_ANGLE = Math.PI / 12;

/** Normalizes an angle to [0, 2π). */
export function normalizeAngle(a: number): number {
  const r = a % TAU;
  const n = r < 0 ? r + TAU : r;
  // Values that round up to exactly 2π collapse to 0.
  return n >= TAU - 1e-12 ? 0 : n;
}

/** Rounds an angle to the nearest multiple of `step`. */
export function snapAngle(a: number, step: number = SNAP_ANGLE): number {
  return Math.round(a / step) * step;
}
