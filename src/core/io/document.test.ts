import { describe, expect, it } from 'vitest';
import { addElements } from '../actions/actions';
import { createRectangle, createText } from '../model/scene';
import { createInitialState } from '../store/app-state';
import {
  applyDocument,
  DOCUMENT_VERSION,
  documentFromState,
  migrate,
  parseDocument,
  parseDocumentValue,
  serializeDocument,
  type Migration,
} from './document';

function sample() {
  const rect = createRectangle({ x: 10, y: 20, width: 100, height: 50 });
  const text = createText({ x: 0, y: 0, text: 'hi' });
  return addElements(createInitialState({ background: '#123456', gridVisible: true }), [
    rect,
    text,
  ]);
}

describe('.tabula document', () => {
  it('round-trips elements, order and settings', () => {
    const state = sample();
    const parsed = parseDocument(serializeDocument(documentFromState(state)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.version).toBe(DOCUMENT_VERSION);
    expect(parsed.doc.elements.map((e) => e.id)).toEqual(state.scene.order);
    expect(parsed.doc.settings.background).toBe('#123456');
    expect(parsed.doc.settings.gridVisible).toBe(true);

    const restored = applyDocument(createInitialState(), parsed.doc);
    expect(restored.scene.order).toEqual(state.scene.order);
    expect(restored.background).toBe('#123456');
    expect(restored.selection).toEqual({});
  });

  it('rejects foreign, malformed and future documents', () => {
    expect(parseDocument('nope')).toEqual({ ok: false, error: 'not-json' });
    expect(parseDocument('{"type":"other","version":1}')).toEqual({
      ok: false,
      error: 'not-tabula',
    });
    expect(parseDocument('{"type":"tabula","version":"1"}')).toEqual({
      ok: false,
      error: 'bad-version',
    });
    expect(parseDocument(`{"type":"tabula","version":${DOCUMENT_VERSION + 1}}`)).toEqual({
      ok: false,
      error: 'too-new',
    });
  });

  it('sanitizes settings, elements and files', () => {
    const parsed = parseDocumentValue({
      type: 'tabula',
      version: 1,
      elements: [{ id: 'x', type: 'blob' }, null],
      settings: { background: 'red', gridSize: 9999, gridStyle: 'weird' },
      files: {
        bad: { dataURL: 'data:image/png;base64,AAAA' },
        ['a'.repeat(64)]: { dataURL: 'data:text/html;base64,AAAA' },
        ['b'.repeat(64)]: { dataURL: 'data:image/png;base64,AAAA' },
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.elements).toEqual([]);
    expect(parsed.doc.settings.background).toBe('#fbfaf6');
    expect(parsed.doc.settings.gridSize).toBe(200);
    expect(parsed.doc.settings.gridStyle).toBe('dots');
    expect(Object.keys(parsed.doc.files)).toEqual(['b'.repeat(64)]);
    expect(parsed.doc.files['b'.repeat(64)]?.mimeType).toBe('image/png');
  });
});

describe('migration runner', () => {
  const migrations: Record<number, Migration> = {
    1: (d) => ({ ...d, renamed: d.old }),
    2: (d) => ({ ...d, steps: 2 }),
  };

  it('applies each step in order up to the target', () => {
    const r = migrate({ version: 1, old: 'v' }, migrations, 3);
    expect(r).toEqual({ ok: true, doc: { version: 3, old: 'v', renamed: 'v', steps: 2 } });
  });

  it('starts from the document version', () => {
    const r = migrate({ version: 2 }, migrations, 3);
    expect(r).toEqual({ ok: true, doc: { version: 3, steps: 2 } });
  });

  it('fails on gaps, bad and future versions', () => {
    expect(migrate({ version: 1 }, { 1: (d) => d }, 3)).toEqual({
      ok: false,
      error: 'bad-version',
    });
    expect(migrate({ version: 0 }, migrations, 3)).toEqual({ ok: false, error: 'bad-version' });
    expect(migrate({ version: 4 }, migrations, 3)).toEqual({ ok: false, error: 'too-new' });
  });
});
