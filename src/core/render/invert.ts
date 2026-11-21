/** Colour transforms for the dark theme and dark exports (hue kept, lightness flipped). */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(c: string): Rgba | null {
  const s = c.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(s)?.[1];
  if (hex !== undefined && [3, 4, 6, 8].includes(hex.length)) {
    const h = hex.length <= 4 ? Array.from(hex, (d) => d + d).join('') : hex;
    const n = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(s)?.[1];
  if (fn !== undefined) {
    const [r, g, b, a = 1] = fn
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (r === undefined || g === undefined || b === undefined) return null;
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return { r, g, b, a };
  }
  return null;
}

const hex2 = (n: number): string =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

/** Colour with its HSL lightness inverted; unparseable values pass through. */
export function invertLightness(color: string): string {
  const c = parseColor(color);
  if (!c || c.a === 0) return color;
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const nl = 1 - l;
  const chroma = (1 - Math.abs(2 * nl - 1)) * s;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const table: readonly (readonly [number, number, number])[] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  const [rr, gg, bb] = table[Math.floor(h) % 6] ?? [0, 0, 0];
  const base = nl - chroma / 2;
  const out = `#${hex2((rr + base) * 255)}${hex2((gg + base) * 255)}${hex2((bb + base) * 255)}`;
  return c.a < 1 ? out + hex2(c.a * 255) : out;
}

const memo = new Map<string, string>();

/** Memoized `invertLightness` for per-frame painting. */
export function darkColor(color: string): string {
  let out = memo.get(color);
  if (out === undefined) {
    out = invertLightness(color);
    if (memo.size > 4096) memo.clear();
    memo.set(color, out);
  }
  return out;
}
