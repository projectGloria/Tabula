/** Curated stroke colors: ink, graphite, then warm-to-cool earthy hues. */
export const STROKE_PALETTE: readonly string[] = [
  '#26241f',
  '#6b675e',
  '#b8432f',
  '#c97a12',
  '#6f7d1f',
  '#2e7d5b',
  '#1f7a8c',
  '#3d4fa8',
  '#8e3b78',
];

/** Curated fill colors: paper white, then soft tints matching the stroke hues. */
export const FILL_PALETTE: readonly string[] = [
  '#ffffff',
  '#efe3c8',
  '#f3cfc6',
  '#f7d9a8',
  '#d9e8b4',
  '#c4e6d4',
  '#c5e3ea',
  '#d3d6f0',
  '#ead0e3',
];

export const MAX_RECENT_COLORS = 8;

const PALETTE_SET = new Set([...STROKE_PALETTE, ...FILL_PALETTE]);

export function isPaletteColor(color: string): boolean {
  return PALETTE_SET.has(color);
}

/**
 * Normalizes user hex input to lowercase `#rrggbb`. Accepts `rgb`, `rrggbb`,
 * with or without `#`. Returns null when the input is not a hex color.
 */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  const hex = m?.[1]?.toLowerCase();
  if (!hex) return null;
  if (hex.length === 3) {
    return `#${hex.replace(/./g, '$&$&')}`;
  }
  return `#${hex}`;
}
