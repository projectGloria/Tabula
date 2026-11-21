import type { FontFamily } from '../model/types';

/**
 * CSS font stacks. The first name in each stack is the self-hosted face
 * declared in `src/ui/fonts.css`; the rest are fallbacks used until (or
 * unless) the bundled font files are present.
 */
export const FONT_STACKS: Readonly<Record<FontFamily, string>> = {
  hand: '"Tabula Hand", "Patrick Hand", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  sans: '"Tabula Sans", Inter, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '"Tabula Mono", "JetBrains Mono", ui-monospace, Consolas, Menlo, monospace',
};

export const FONT_FAMILIES: readonly FontFamily[] = ['hand', 'sans', 'mono'];

/** Line height as a multiple of the font size. */
export const LINE_HEIGHT = 1.25;

/** Size presets in world units (S, M, L, XL). */
export const FONT_SIZE_PRESETS = [16, 20, 28, 36] as const;
export const DEFAULT_FONT_SIZE = 20;
export const MIN_FONT_SIZE = 4;
export const MAX_FONT_SIZE = 400;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size * 10) / 10));
}

/** Canvas/CSS `font` shorthand for a family and size in px. */
export function fontString(family: FontFamily, size: number): string {
  return `${String(size)}px ${FONT_STACKS[family]}`;
}
