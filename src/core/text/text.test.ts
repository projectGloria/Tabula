import { describe, expect, it } from 'vitest';
import { addElements, setSelection, setTool } from '../actions/actions';
import { duplicateSelection } from '../actions/edit-actions';
import { closeTextEditor, createTextAt, editTextAt, setTextContent } from '../actions/text-actions';
import { screenToWorld } from '../camera/camera';
import { copyableElements, pasteElements } from '../io/clipboard';
import { sanitizeElement } from '../io/validate';
import { createRectangle, createText, mutateElement } from '../model/scene';
import type { ElementId, SceneElement, TextElement } from '../model/types';
import { selectedIds, type AppState } from '../store/app-state';
import { Editor } from '../store/editor';
import { SelectTool } from '../tools/select-tool';
import { TextTool } from '../tools/text-tool';
import type { PointerInput, ToolContext } from '../tools/tool';
import { boundTextOf, syncText } from './bound';
import { fontString, LINE_HEIGHT } from './fonts';
import { layoutString, wrapText } from './layout';
import { approximateMeasurer } from './measure';
import { resizeTextElement } from './resize';

// The approximate measurer: 0.55em per Latin character.
const font = fontString('sans', 20); // 11px per character
const m = approximateMeasurer;

function harness() {
  const editor = new Editor();
  const ctx: ToolContext = {
    getState: editor.getState,
    update: editor.update,
    hitTest: (w) => editor.hitTest(w),
  };
  const input = (x: number, y: number): PointerInput => {
    const screen = { x, y };
    return {
      pointerId: 1,
      kind: 'mouse',
      screen,
      world: screenToWorld(editor.getState().camera, screen),
      button: 0,
      pressure: 0,
      shift: false,
      alt: false,
      mod: false,
    };
  };
  return { editor, ctx, input };
}

const texts = (s: AppState): TextElement[] =>
  s.scene.order.flatMap((id) => {
    const el = s.scene.entities[id];
    return el?.type === 'text' ? [el] : [];
  });

const get = (s: AppState, id: ElementId): SceneElement => {
  const el = s.scene.entities[id];
  if (!el) throw new Error(`missing ${id}`);
  return el;
};

describe('wrapText', () => {
  it('never wraps without a width and keeps explicit newlines', () => {
    expect(wrapText('a b\nc', font, null, m)).toEqual(['a b', 'c']);
  });

  it('wraps greedily at spaces', () => {
    // "aaa bbb" = 77px; width 50 fits "aaa" (33) but not "aaa bbb".
    expect(wrapText('aaa bbb ccc', font, 50, m)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(wrapText('aa bb cc', font, 60, m)).toEqual(['aa bb', 'cc']);
  });

  it('breaks words longer than the width between characters', () => {
    expect(wrapText('abcdefgh', font, 35, m)).toEqual(['abc', 'def', 'gh']);
  });

  it('keeps empty paragraphs', () => {
    expect(wrapText('a\n\nb', font, 100, m)).toEqual(['a', '', 'b']);
  });
});

describe('layoutString', () => {
  it('measures width and height from lines', () => {
    const l = layoutString('ab\nabcd', 'sans', 20, null, m);
    expect(l.lines).toEqual(['ab', 'abcd']);
    expect(l.width).toBeCloseTo(44);
    expect(l.height).toBeCloseTo(2 * 20 * LINE_HEIGHT);
  });

  it('an empty string still has one line of height', () => {
    expect(layoutString('', 'sans', 20, null, m).height).toBeCloseTo(25);
  });
});

describe('syncText', () => {
  const rect = () => createRectangle({ x: 0, y: 0, width: 100, height: 60 });
  const label = (containerId: ElementId, text: string) =>
    createText({ x: 0, y: 0, text, fontFamily: 'sans', containerId, textAlign: 'center' });

  it('fits free text to its content', () => {
    const t = createText({ x: 0, y: 0, text: 'abcd', fontFamily: 'sans' });
    const s = addElements(new Editor().getState(), [t]);
    const out = syncText(null, s.scene).entities[t.id] as TextElement;
    expect(out.width).toBeCloseTo(44);
    expect(out.height).toBeCloseTo(25);
  });

  it('centres a label inside its container and follows moves', () => {
    const r = rect();
    const t = label(r.id, 'ab');
    let scene = syncText(null, addElements(new Editor().getState(), [r, t]).scene);
    let placed = scene.entities[t.id] as TextElement;
    expect(placed.y + placed.height / 2).toBeCloseTo(30);
    expect(placed.x + placed.width / 2).toBeCloseTo(50);

    const moved = mutateElement(r, { x: 200 });
    const next = { ...scene, entities: { ...scene.entities, [r.id]: moved } };
    scene = syncText(scene, next);
    placed = scene.entities[t.id] as TextElement;
    expect(placed.x + placed.width / 2).toBeCloseTo(250);
  });

  it('grows a box container to fit its label', () => {
    const r = rect();
    const t = label(r.id, 'one two three four five six');
    const scene = syncText(null, addElements(new Editor().getState(), [r, t]).scene);
    const grown = scene.entities[r.id];
    expect(grown?.height ?? 0).toBeGreaterThan(60);
    const placed = scene.entities[t.id] as TextElement;
    expect(placed.height).toBeLessThanOrEqual((grown?.height ?? 0) - 16 + 1e-6);
  });

  it('removes labels whose container was deleted', () => {
    const r = rect();
    const t = label(r.id, 'x');
    const scene = addElements(new Editor().getState(), [t]).scene;
    expect(syncText(null, scene).entities[t.id]).toBeUndefined();
  });
});

describe('text editing transactions', () => {
  it('creating, typing and closing is a single undo step', () => {
    const { editor } = harness();
    editor.update((s) => createTextAt(s, { x: 10, y: 10 }));
    const id = editor.getState().editingText;
    if (id === null) throw new Error('editor not open');
    editor.update((s) => setTextContent(s, id, 'h'));
    editor.update((s) => setTextContent(s, id, 'hi'));
    editor.update(closeTextEditor);
    expect(editor.history.size).toBe(1);
    expect((get(editor.getState(), id) as TextElement).text).toBe('hi');
    editor.undo();
    expect(editor.getState().scene.order).toHaveLength(0);
  });

  it('leaving new text empty removes it and records nothing', () => {
    const { editor } = harness();
    editor.update((s) => createTextAt(s, { x: 10, y: 10 }));
    editor.update(closeTextEditor);
    expect(editor.getState().scene.order).toHaveLength(0);
    expect(editor.history.size).toBe(0);
  });
});

describe('TextTool', () => {
  it('a click starts auto-width text and returns to Select', () => {
    const h = harness();
    h.editor.update((s) => setTool(s, 'text'));
    const tool = new TextTool();
    tool.onPointerDown(h.ctx, h.input(100, 100));
    tool.onPointerUp(h.ctx, h.input(100, 100));
    const s = h.editor.getState();
    const [t] = texts(s);
    expect(t?.sizing).toBe('auto');
    expect(s.editingText).toBe(t?.id);
    expect(s.activeTool).toBe('select');
  });

  it('a drag starts fixed-width text spanning the drag', () => {
    const h = harness();
    const tool = new TextTool();
    tool.onPointerDown(h.ctx, h.input(100, 100));
    tool.onPointerUp(h.ctx, h.input(300, 120));
    const [t] = texts(h.editor.getState());
    expect(t?.sizing).toBe('fixed');
    expect(t?.width).toBeCloseTo(200);
    expect(t?.x).toBeCloseTo(100);
  });
});

describe('labels', () => {
  const setup = () => {
    const h = harness();
    const r = createRectangle({ x: 0, y: 0, width: 120, height: 60 });
    h.editor.update((s) => addElements(s, [r]));
    return { ...h, r };
  };

  it('double-clicking an unfilled shape creates a label and selects the shape', () => {
    const h = setup();
    new SelectTool().onDoubleClick(h.ctx, h.input(60, 30));
    const s = h.editor.getState();
    const t = boundTextOf(s.scene, h.r.id);
    expect(t).toBeDefined();
    expect(s.editingText).toBe(t?.id);
    expect(selectedIds(s)).toEqual([h.r.id]);
  });

  it('labels are never selected directly', () => {
    const h = setup();
    h.editor.update((s) => editTextAt(s, { x: 60, y: 30 }, h.r.id));
    const t = boundTextOf(h.editor.getState().scene, h.r.id);
    if (!t) throw new Error('no label');
    h.editor.update((s) => setSelection(s, [t.id, h.r.id]));
    expect(selectedIds(h.editor.getState())).toEqual([h.r.id]);
  });

  it('duplicate and copy carry the label, remapped to the copy', () => {
    const h = setup();
    h.editor.update((s) => editTextAt(s, { x: 60, y: 30 }, h.r.id));
    const id = h.editor.getState().editingText;
    if (id === null) throw new Error('no label');
    h.editor.update((s) => setTextContent(s, id, 'label'));
    h.editor.update(closeTextEditor);
    h.editor.update((s) => setSelection(s, [h.r.id]));
    h.editor.update(duplicateSelection);
    let s = h.editor.getState();
    const [copy] = selectedIds(s);
    expect(copy).toBeDefined();
    expect(copy).not.toBe(h.r.id);
    expect(boundTextOf(s.scene, copy ?? ('' as ElementId))?.text).toBe('label');

    const clip = copyableElements(s);
    expect(clip.filter((e) => e.type === 'text')).toHaveLength(1);
    h.editor.update((st) => pasteElements(st, clip, { x: 500, y: 500 }));
    s = h.editor.getState();
    expect(texts(s)).toHaveLength(3);
    const [pasted] = selectedIds(s);
    expect(boundTextOf(s.scene, pasted ?? ('' as ElementId))?.text).toBe('label');
  });
});

describe('resizeTextElement', () => {
  const t = createText({ x: 0, y: 0, width: 44, height: 25, text: 'abcd', fontSize: 20 });

  it('corner handles scale the font', () => {
    const out = resizeTextElement(t, { x: 0, y: 0, width: 88, height: 50 }, 'se', 2);
    expect(out.fontSize).toBe(40);
    expect(out.width).toBeCloseTo(88);
  });

  it('side handles set a fixed width', () => {
    const out = resizeTextElement(t, { x: 0, y: 0, width: 30, height: 25 }, 'e', 30 / 44);
    expect(out.sizing).toBe('fixed');
    expect(out.width).toBe(30);
    expect(out.fontSize).toBe(20);
  });

  it('top/bottom handles leave text unchanged', () => {
    expect(resizeTextElement(t, { height: 80 }, 's', 1)).toBe(t);
  });
});

describe('validate text', () => {
  it('sanitizes enums, font size and length', () => {
    const t = createText({ x: 0, y: 0, text: 'ok' });
    const out = sanitizeElement({
      ...t,
      fontFamily: 'comic',
      textAlign: 'justify',
      fontSize: 9999,
      text: 'x'.repeat(200_000),
      containerId: 42,
    });
    expect(out?.type).toBe('text');
    const v = out as TextElement;
    expect(v.fontFamily).toBe('hand');
    expect(v.textAlign).toBe('left');
    expect(v.fontSize).toBe(400);
    expect(v.text.length).toBe(100_000);
    expect(v.containerId).toBeNull();
  });
});
