/**
 * Text width measurement. The app installs a canvas-backed measurer at
 * startup; tests and headless code use the deterministic approximation.
 */
export interface TextMeasurer {
  /** Advance width in px of `text` drawn with the CSS `font` shorthand. */
  width(text: string, font: string): number;
}

/** Wide East Asian and emoji code points count as a full em. */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/** Font size in px from a `font` shorthand such as `20px Foo`. */
function sizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 16;
}

/** Deterministic estimate: 0.55 em per narrow character, 1 em per wide one. */
export const approximateMeasurer: TextMeasurer = {
  width(text, font) {
    const size = sizeOf(font);
    let w = 0;
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      w += isWide(code) ? size : size * 0.55;
    }
    return w;
  },
};

let current: TextMeasurer = approximateMeasurer;
let generation = 0;

export function getTextMeasurer(): TextMeasurer {
  return current;
}

/** Installs a measurer (e.g. canvas-based) and invalidates cached layouts. */
export function setTextMeasurer(m: TextMeasurer): void {
  current = m;
  generation++;
}

/** Bumped whenever measurement may have changed (new measurer, fonts loaded). */
export function measureGeneration(): number {
  return generation;
}

export function invalidateMeasurements(): void {
  generation++;
}

/** A measurer backed by a 2D canvas context, memoizing per font and string. */
export function createCanvasMeasurer(ctx: {
  font: string;
  measureText(text: string): { width: number };
}): TextMeasurer & { clear(): void } {
  const cache = new Map<string, number>();
  return {
    width(text, font) {
      const key = `${font}\u0000${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      ctx.font = font;
      const w = ctx.measureText(text).width;
      if (cache.size > 20_000) cache.clear();
      cache.set(key, w);
      return w;
    },
    clear() {
      cache.clear();
    },
  };
}
