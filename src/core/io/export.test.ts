import { describe, expect, it } from 'vitest';
import { setSelection } from '../actions/actions';
import { insertImages } from '../actions/image-actions';
import { pasteTextAt, MAX_PASTE_TEXT } from '../actions/text-actions';
import { createImage, createRectangle, createText, insertElements } from '../model/scene';
import type { ImageElement } from '../model/types';
import { createInitialState, selectedIds } from '../store/app-state';
import { documentFromState } from './document';
import {
  decodeScenePayload,
  embedSceneInPng,
  extractSceneFromPng,
  extractSceneFromSvg,
  svgSceneMetadata,
} from './embed';
import { darkScene, exportIds, invertLightness, pathData, sceneToSvg } from './export';
import { base64ToBytes, fileIdsOf, insertSize, isFileId, sha256Hex } from './image-files';
import { crc32, isPng, readChunk, writeChunk } from './png-chunk';
import { sanitizeElement } from './validate';

/** Smallest valid PNG: 1×1 transparent pixel. */
const TINY_PNG = base64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);
const FILE_ID = 'a'.repeat(64);

describe('png chunks', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')) ^ 0xffffffff).toBe(0xcbf43926 | 0);
  });

  it('inserts a chunk before IEND and reads it back', () => {
    expect(isPng(TINY_PNG)).toBe(true);
    const data = new TextEncoder().encode('hello');
    const out = writeChunk(TINY_PNG, 'tbLa', data);
    expect(out).not.toBeNull();
    if (!out) return;
    expect(out.length).toBe(TINY_PNG.length + 12 + data.length);
    expect(new TextDecoder().decode(readChunk(out, 'tbLa') ?? new Uint8Array())).toBe('hello');
    // IEND stays last.
    expect(String.fromCharCode(...out.subarray(out.length - 8, out.length - 4))).toBe('IEND');
  });

  it('replaces an existing chunk of the same type', () => {
    const once = writeChunk(TINY_PNG, 'tbLa', new Uint8Array([1, 2, 3]));
    const twice = once && writeChunk(once, 'tbLa', new Uint8Array([4]));
    expect(twice?.length).toBe(TINY_PNG.length + 13);
    expect([...(twice ? (readChunk(twice, 'tbLa') ?? []) : [])]).toEqual([4]);
  });

  it('rejects non-PNG input and corrupted chunks', () => {
    expect(writeChunk(new Uint8Array([1, 2, 3]), 'tbLa', new Uint8Array())).toBeNull();
    const out = writeChunk(TINY_PNG, 'tbLa', new Uint8Array([9, 9]));
    if (!out) throw new Error('no png');
    const corrupt = out.slice();
    const at = corrupt.length - 12 - 4 - 2; // first data byte of our chunk
    corrupt[at] = 0;
    expect(readChunk(corrupt, 'tbLa')).toBeNull();
  });
});

describe('scene embedding', () => {
  const state = (() => {
    const s = createInitialState();
    const scene = insertElements(s.scene, [createRectangle({ x: 0, y: 0, width: 40, height: 20 })]);
    return { ...s, scene };
  })();
  const doc = documentFromState(state);

  it('round-trips a document through a PNG', async () => {
    const png = await embedSceneInPng(TINY_PNG, doc);
    expect(png).not.toBeNull();
    if (!png) return;
    const back = await extractSceneFromPng(png);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.doc.elements).toEqual(doc.elements);
  });

  it('round-trips a document through SVG metadata', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${await svgSceneMetadata(doc)}</svg>`;
    const back = await extractSceneFromSvg(svg);
    expect(back.ok && back.doc.elements.length).toBe(1);
  });

  it('reports a missing or broken payload as no-scene', async () => {
    expect(await extractSceneFromPng(TINY_PNG)).toEqual({ ok: false, error: 'no-scene' });
    expect(await extractSceneFromSvg('<svg/>')).toEqual({ ok: false, error: 'no-scene' });
    expect(await decodeScenePayload(new Uint8Array([1, 2, 3]))).toEqual({
      ok: false,
      error: 'no-scene',
    });
  });
});

describe('dark variant', () => {
  it('inverts lightness and keeps hue', () => {
    expect(invertLightness('#000000')).toBe('#ffffff');
    expect(invertLightness('#fff')).toBe('#000000');
    expect(invertLightness('#ff0000')).toBe('#ff0000'); // L = 0.5 stays
    expect(invertLightness('#1e1e1e80')).toBe('#e1e1e180');
    expect(invertLightness('transparent')).toBe('transparent');
    expect(invertLightness('rgba(0, 0, 0, 0)')).toBe('rgba(0, 0, 0, 0)');
  });

  it('maps every element colour', () => {
    const r = createRectangle({ x: 0, y: 0, width: 1, height: 1 });
    const s = insertElements(createInitialState().scene, [r]);
    const dark = darkScene(s).entities[r.id];
    expect(dark?.style.strokeColor).toBe(invertLightness(r.style.strokeColor));
  });
});

describe('svg export', () => {
  it('serializes path commands', () => {
    expect(pathData([['M', 0, 0], ['L', 1.234, 2], ['C', 1, 2, 3, 4, 5, 6.005], ['Z']])).toBe(
      'M0 0L1.23 2C1 2 3 4 5 6.01Z',
    );
  });

  it('writes shapes, escaped text and images', () => {
    const rect = createRectangle({ x: 10, y: 10, width: 100, height: 50 });
    const text = createText({ x: 0, y: 100, text: 'a < b & "c"' });
    const image = createImage({ x: 200, y: 0, width: 30, height: 20, fileId: FILE_ID });
    const scene = insertElements(createInitialState().scene, [rect, text, image]);
    const svg = sceneToSvg(scene, scene.order, {
      padding: 8,
      background: '#ffffff',
      labelBackdrop: '#ffffff',
      imageHref: () => 'data:image/png;base64,AAAA',
    });
    expect(svg).not.toBeNull();
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('a &#60; b &#38; &#34;c&#34;');
    expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('returns null when nothing is exported', () => {
    const scene = createInitialState().scene;
    const opts = { padding: 0, background: null, labelBackdrop: '#fff', imageHref: () => null };
    expect(sceneToSvg(scene, [], opts)).toBeNull();
  });

  it('exports the selection with its bound labels, or everything', () => {
    const a = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRectangle({ x: 20, y: 0, width: 10, height: 10 });
    const label = createText({ x: 0, y: 0, text: 'x', containerId: a.id });
    let s = createInitialState();
    s = { ...s, scene: insertElements(s.scene, [a, label, b]) };
    s = setSelection(s, [a.id]);
    expect(exportIds(s, 'selection')).toEqual([a.id, label.id]);
    expect(exportIds(s, 'all')).toEqual([a.id, label.id, b.id]);
  });
});

describe('images', () => {
  it('validates file ids on load', () => {
    const el = createImage({ x: 0, y: 0, width: 10, height: 10, fileId: FILE_ID });
    expect(sanitizeElement(JSON.parse(JSON.stringify(el)))).toEqual({ ...el, revision: 0 });
    expect(sanitizeElement({ ...el, fileId: '../x' })).toBeNull();
    expect(isFileId('A'.repeat(64))).toBe(false);
  });

  it('hashes bytes as lowercase SHA-256 hex', async () => {
    const id = await sha256Hex(new TextEncoder().encode('abc').buffer);
    expect(id).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('fits large images and keeps small ones', () => {
    expect(insertSize(1600, 800)).toEqual({ width: 800, height: 400 });
    expect(insertSize(100, 50)).toEqual({ width: 100, height: 50 });
  });

  it('inserts side by side, selected, and lists file ids', () => {
    const s = insertImages(
      createInitialState(),
      [
        { fileId: FILE_ID, width: 100, height: 50 },
        { fileId: 'b'.repeat(64), width: 40, height: 40 },
      ],
      { x: 0, y: 0 },
    );
    const els = s.scene.order.map((id) => s.scene.entities[id]) as ImageElement[];
    expect(els).toHaveLength(2);
    const [first, second] = els;
    expect(second && first && second.x).toBeGreaterThan((first?.x ?? 0) + (first?.width ?? 0));
    expect(selectedIds(s)).toHaveLength(2);
    expect(fileIdsOf(els)).toEqual(new Set([FILE_ID, 'b'.repeat(64)]));
  });
});

describe('pasteTextAt', () => {
  it('creates selected text with normalized newlines', () => {
    const s = pasteTextAt(createInitialState(), { x: 5, y: 6 }, 'a\r\nb\rc');
    const el = s.scene.entities[s.scene.order[0] ?? ('' as never)];
    expect(el?.type === 'text' && el.text).toBe('a\nb\nc');
    expect(el?.x).toBe(5);
    expect(selectedIds(s)).toEqual([el?.id]);
  });

  it('ignores blank text and caps length', () => {
    const blank = createInitialState();
    expect(pasteTextAt(blank, { x: 0, y: 0 }, '  \n ')).toBe(blank);
    const s = pasteTextAt(blank, { x: 0, y: 0 }, 'x'.repeat(MAX_PASTE_TEXT + 10));
    const el = s.scene.entities[s.scene.order[0] ?? ('' as never)];
    expect(el?.type === 'text' && el.text.length).toBe(MAX_PASTE_TEXT);
  });
});
