import { documentFromState } from '../core/io/document';
import { embedSceneInPng, svgSceneMetadata } from '../core/io/embed';
import {
  darkScene,
  exportIds,
  invertLightness,
  sceneToSvg,
  subScene,
  type ExportScope,
} from '../core/io/export';
import { fileIdsOf } from '../core/io/image-files';
import { boxExpand, boxHeight, boxWidth } from '../core/geometry/box';
import {
  canvasToBlob,
  elementsBounds,
  MAX_CANVAS_SIDE,
  rasterize,
} from '../core/render/paint-scene';
import type { AppState } from '../core/store/app-state';
import type { ImageLibrary } from './images';

export type ExportFormat = 'png' | 'svg';

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly scope: ExportScope;
  readonly background: boolean;
  readonly dark: boolean;
  readonly embed: boolean;
  readonly scale: 1 | 2 | 3;
  readonly padding: number;
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'png',
  scope: 'all',
  background: true,
  dark: false,
  embed: true,
  scale: 2,
  padding: 16,
};

export const EXPORT_MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
};

export interface ExportSize {
  readonly width: number;
  readonly height: number;
  /** True when the PNG was scaled down to the browser's canvas limit. */
  readonly clamped: boolean;
}

/** Output pixel size without rendering; null when nothing would be exported. */
export function exportSize(state: AppState, opts: ExportOptions): ExportSize | null {
  const ids = exportIds(state, opts.scope);
  const content = elementsBounds(state.scene, ids);
  if (!content) return null;
  const box = boxExpand(content, opts.padding);
  const w = boxWidth(box);
  const h = boxHeight(box);
  if (opts.format === 'svg') return { width: Math.ceil(w), height: Math.ceil(h), clamped: false };
  const scale = Math.min(opts.scale, MAX_CANVAS_SIDE / Math.max(w, h, 1));
  return {
    width: Math.max(1, Math.ceil(w * scale)),
    height: Math.max(1, Math.ceil(h * scale)),
    clamped: scale < opts.scale,
  };
}

/** Renders the export; null when there is nothing to export. */
export async function renderExport(
  state: AppState,
  opts: ExportOptions,
  images: ImageLibrary,
): Promise<Blob | null> {
  const ids = exportIds(state, opts.scope);
  if (ids.length === 0) return null;
  const own = subScene(state.scene, ids);
  const scene = opts.dark ? darkScene(own) : own;
  const canvasColor = opts.dark ? invertLightness(state.background) : state.background;
  const background = opts.background ? canvasColor : null;
  const fileIds = fileIdsOf(Object.values(own.entities));
  // The embedded scene keeps the drawing's own colours, not the dark variant.
  const doc = opts.embed
    ? documentFromState({ ...state, scene: own }, await images.exportFiles(fileIds))
    : null;

  if (opts.format === 'svg') {
    const files = doc?.files ?? (await images.exportFiles(fileIds));
    const svg = sceneToSvg(scene, ids, {
      padding: opts.padding,
      background,
      labelBackdrop: canvasColor,
      imageHref: (id) => files[id]?.dataURL ?? null,
      head: doc ? await svgSceneMetadata(doc) : '',
    });
    return svg === null ? null : new Blob([svg], { type: EXPORT_MIME.svg });
  }

  // Make sure every bitmap is decoded before painting.
  await Promise.all([...fileIds].map((id) => images.ready(id)));
  const canvas = rasterize(scene, ids, {
    scale: opts.scale,
    padding: opts.padding,
    background,
    labelBackdrop: canvasColor,
    images,
  });
  const png = canvas ? await canvasToBlob(canvas) : null;
  if (!png || !doc) return png;
  const embedded = await embedSceneInPng(new Uint8Array(await png.arrayBuffer()), doc);
  return embedded ? new Blob([embedded], { type: EXPORT_MIME.png }) : png;
}

/** Small PNG of the export for the dialog preview (no scene embed). */
export async function renderPreview(
  state: AppState,
  opts: ExportOptions,
  images: ImageLibrary,
  maxSide: number,
): Promise<Blob | null> {
  const ids = exportIds(state, opts.scope);
  if (ids.length === 0) return null;
  const own = subScene(state.scene, ids);
  const scene = opts.dark ? darkScene(own) : own;
  const canvasColor = opts.dark ? invertLightness(state.background) : state.background;
  const fileIds = fileIdsOf(Object.values(own.entities));
  await Promise.all([...fileIds].map((id) => images.ready(id)));
  const canvas = rasterize(scene, ids, {
    scale: 2,
    padding: opts.padding,
    background: opts.background ? canvasColor : null,
    labelBackdrop: canvasColor,
    maxSide,
    images,
  });
  return canvas ? canvasToBlob(canvas) : null;
}
