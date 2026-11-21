/**
 * Image export: which elements to export, the dark variant, and the SVG
 * serializer. DOM-free; PNG rasterization lives in render/paint-scene.
 */
import { withBoundText } from '../actions/edit-actions';
import { boxExpand, boxHeight, boxWidth } from '../geometry/box';
import type { ElementId, ElementStyle, Scene, SceneElement, TextElement } from '../model/types';
import { elementsBounds } from '../render/paint-scene';
import { SketchCache } from '../render/sketch/cache';
import type { PathCmd } from '../render/sketch/path';
import { selectedIds, type AppState } from '../store/app-state';
import { boundTextOf, isTextContainer } from '../text/bound';
import { FONT_STACKS } from '../text/fonts';
import { layoutOf } from '../text/layout';
import { invertLightness } from '../render/invert';

export { invertLightness };

export type ExportScope = 'selection' | 'all';

/** Element ids to export in z-order (selection includes bound labels). */
export function exportIds(state: AppState, scope: ExportScope): ElementId[] {
  if (scope === 'all') return [...state.scene.order];
  return withBoundText(state.scene, selectedIds(state));
}

/** Scene holding just `ids`, in order. */
export function subScene(scene: Scene, ids: readonly ElementId[]): Scene {
  const entities: Record<ElementId, SceneElement> = {};
  const order: ElementId[] = [];
  for (const id of ids) {
    const el = scene.entities[id];
    if (!el) continue;
    entities[id] = el;
    order.push(id);
  }
  return { entities, order };
}

// ---------------------------------------------------------------------------
// Dark variant: flip lightness, keep hue and saturation.

const darkStyle = (s: ElementStyle): ElementStyle => ({
  ...s,
  strokeColor: invertLightness(s.strokeColor),
  fillColor: invertLightness(s.fillColor),
});

/** The scene with every element colour lightness-inverted. */
export function darkScene(scene: Scene): Scene {
  const entities: Record<ElementId, SceneElement> = {};
  for (const id of scene.order) {
    const el = scene.entities[id];
    if (el) entities[id] = { ...el, style: darkStyle(el.style) };
  }
  return { entities, order: scene.order };
}

// ---------------------------------------------------------------------------
// SVG

const num = (n: number): string => String(Math.round(n * 100) / 100);

const escapeXml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

export function pathData(cmds: readonly PathCmd[]): string {
  return cmds
    .map((c) => {
      switch (c[0]) {
        case 'Z':
          return 'Z';
        case 'M':
        case 'L':
          return `${c[0]}${num(c[1])} ${num(c[2])}`;
        case 'C':
          return `C${[c[1], c[2], c[3], c[4], c[5], c[6]].map(num).join(' ')}`;
      }
    })
    .join('');
}

const frame = (el: SceneElement): string => {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rot = el.angle === 0 ? '' : ` rotate(${num((el.angle * 180) / Math.PI)})`;
  return `translate(${num(cx)} ${num(cy)})${rot} translate(${num(-el.width / 2)} ${num(-el.height / 2)})`;
};

const group = (el: SceneElement, body: string): string => {
  const opacity = el.style.opacity < 100 ? ` opacity="${num(el.style.opacity / 100)}"` : '';
  return `<g transform="${frame(el)}"${opacity}>${body}</g>`;
};

function shapeSvg(el: SceneElement, cache: SketchCache): string {
  const { layers } = cache.get(el).drawable;
  if (layers.length === 0 || el.style.opacity <= 0) return '';
  const body = layers
    .map((layer) => {
      const d = pathData(layer.path);
      const color = escapeXml(layer.color);
      if (layer.mode === 'fill') return `<path d="${d}" fill="${color}"/>`;
      const dash =
        layer.dash && layer.dash.length > 0
          ? ` stroke-dasharray="${layer.dash.map(num).join(' ')}"`
          : '';
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(layer.width)}"${dash}/>`;
    })
    .join('');
  return group(el, body);
}

/** Pad around arrow labels, matching the canvas painter. */
const LABEL_PAD = 4;

function textSvg(el: TextElement, backdrop: string | null): string {
  if (el.style.opacity <= 0 || el.text === '') return '';
  const layout = layoutOf(el);
  const anchor = el.textAlign === 'left' ? 'start' : el.textAlign === 'center' ? 'middle' : 'end';
  const x = el.textAlign === 'left' ? 0 : el.textAlign === 'center' ? el.width / 2 : el.width;
  const family = FONT_STACKS[el.fontFamily].replace(/"/g, "'");
  const back =
    backdrop === null
      ? ''
      : `<rect x="${num(-LABEL_PAD)}" y="${num(-LABEL_PAD / 2)}" width="${num(el.width + LABEL_PAD * 2)}" height="${num(el.height + LABEL_PAD)}" fill="${escapeXml(backdrop)}"/>`;
  const lines = layout.lines
    .map(
      (line, i) =>
        `<tspan x="${num(x)}" y="${num(layout.lineHeight * (i + 0.5))}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const attrs = [
    `font-family="${escapeXml(family)}"`,
    `font-size="${num(el.fontSize)}"`,
    `fill="${escapeXml(el.style.strokeColor)}"`,
    `text-anchor="${anchor}"`,
    'dominant-baseline="central"',
    'xml:space="preserve"',
  ].join(' ');
  return group(el, `${back}<text ${attrs}>${lines}</text>`);
}

function imageSvg(el: SceneElement & { type: 'image' }, href: string | null): string {
  if (el.style.opacity <= 0) return '';
  const w = num(el.width);
  const h = num(el.height);
  return group(
    el,
    href === null
      ? `<rect width="${w}" height="${h}" fill="rgba(128,128,128,0.12)" stroke="rgba(128,128,128,0.6)" stroke-dasharray="6 4"/>`
      : `<image href="${escapeXml(href)}" width="${w}" height="${h}" preserveAspectRatio="none"/>`,
  );
}

export interface SvgOptions {
  readonly padding: number;
  /** Fill colour; null leaves the SVG transparent. */
  readonly background: string | null;
  readonly labelBackdrop: string;
  /** Data URL for an image file; null draws a placeholder. */
  readonly imageHref: (fileId: string) => string | null;
  /** Extra markup placed first inside the root (e.g. `<metadata>`). */
  readonly head?: string;
}

/** Standalone SVG document for `ids`; null when none exist. */
export function sceneToSvg(
  scene: Scene,
  ids: readonly ElementId[],
  opts: SvgOptions,
): string | null {
  const content = elementsBounds(scene, ids);
  if (!content) return null;
  const box = boxExpand(content, opts.padding);
  const w = boxWidth(box);
  const h = boxHeight(box);
  const cache = new SketchCache();
  const parts: string[] = [];
  if (opts.background !== null) {
    parts.push(
      `<rect x="${num(box.minX)}" y="${num(box.minY)}" width="${num(w)}" height="${num(h)}" fill="${escapeXml(opts.background)}"/>`,
    );
  }
  for (const id of ids) {
    const el = scene.entities[id];
    if (!el) continue;
    if (el.type === 'text') {
      if (el.containerId === null) parts.push(textSvg(el, null));
      continue;
    }
    if (el.type === 'image') {
      parts.push(imageSvg(el, opts.imageHref(el.fileId)));
      continue;
    }
    parts.push(shapeSvg(el, cache));
    if (isTextContainer(el)) {
      const label = boundTextOf(scene, el.id);
      if (label) parts.push(textSvg(label, el.type === 'arrow' ? opts.labelBackdrop : null));
    }
  }
  const attrs = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="${num(box.minX)} ${num(box.minY)} ${num(w)} ${num(h)}"`,
    `width="${num(w)}"`,
    `height="${num(h)}"`,
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ].join(' ');
  return `<svg ${attrs}>${opts.head ?? ''}${parts.join('')}</svg>`;
}
