import type { TextElement } from '../model/types';
import { fontString, LINE_HEIGHT } from './fonts';
import { getTextMeasurer, measureGeneration, type TextMeasurer } from './measure';

export interface TextLayout {
  readonly lines: readonly string[];
  /** Widths of each line in px. */
  readonly lineWidths: readonly number[];
  /** Widest line. */
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
}

/** Splits a word that is wider than `max` into the longest fitting chunks. */
function breakWord(word: string, font: string, max: number, m: TextMeasurer): string[] {
  const out: string[] = [];
  let chunk = '';
  for (const ch of word) {
    const next = chunk + ch;
    if (chunk !== '' && m.width(next, font) > max) {
      out.push(chunk);
      chunk = ch;
    } else {
      chunk = next;
    }
  }
  if (chunk !== '' || out.length === 0) out.push(chunk);
  return out;
}

/**
 * Greedy word wrap. Explicit newlines always break; with `maxWidth` null
 * lines never wrap. Words longer than the width break between characters.
 * Spaces at a wrap point are dropped; other whitespace is preserved.
 */
export function wrapText(
  text: string,
  font: string,
  maxWidth: number | null,
  m: TextMeasurer = getTextMeasurer(),
): string[] {
  const paragraphs = text.split(/\r\n|\r|\n/);
  if (maxWidth === null) return paragraphs;
  const max = Math.max(1, maxWidth);
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (para === '' || m.width(para, font) <= max) {
      lines.push(para);
      continue;
    }
    // Tokens keep their leading spaces so indentation survives.
    const tokens = para.match(/\s*\S+|\s+$/g) ?? [para];
    let line = '';
    for (const token of tokens) {
      const candidate = line + token;
      if (m.width(candidate, font) <= max) {
        line = candidate;
        continue;
      }
      const word = token.trimStart();
      if (line !== '') lines.push(line);
      if (m.width(word, font) <= max) {
        line = word;
      } else {
        const parts = breakWord(word, font, max, m);
        line = parts.pop() ?? '';
        lines.push(...parts);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Lays out a string; `maxWidth` null means no wrapping. */
export function layoutString(
  text: string,
  family: TextElement['fontFamily'],
  fontSize: number,
  maxWidth: number | null,
  m: TextMeasurer = getTextMeasurer(),
): TextLayout {
  const font = fontString(family, fontSize);
  const lines = wrapText(text, font, maxWidth, m);
  const lineWidths = lines.map((l) => m.width(l, font));
  const lineHeight = fontSize * LINE_HEIGHT;
  return {
    lines,
    lineWidths,
    width: Math.max(0, ...lineWidths),
    height: Math.max(1, lines.length) * lineHeight,
    lineHeight,
  };
}

const cache = new WeakMap<TextElement, { gen: number; layout: TextLayout }>();

/** Layout of a text element as stored (cached per element object). */
export function layoutOf(el: TextElement): TextLayout {
  const gen = measureGeneration();
  const hit = cache.get(el);
  if (hit?.gen === gen) return hit.layout;
  const layout = layoutString(
    el.text,
    el.fontFamily,
    el.fontSize,
    el.sizing === 'fixed' ? el.width : null,
  );
  cache.set(el, { gen, layout });
  return layout;
}
