import { describe, expect, it } from 'vitest';
import { screenToWorld } from '../camera/camera';
import type { Point } from '../geometry/vec';
import { normalizeHex } from '../model/palette';
import { createArrow, createBoxElement, createLine, mutateElement } from '../model/scene';
import type { SceneElement } from '../model/types';
import { createInitialState, type AppState } from '../store/app-state';
import { Editor } from '../store/editor';
import { LinearTool } from '../tools/linear-tool';
import type { PointerInput, ToolContext } from '../tools/tool';
import { addElements, setSelection, setTool } from './actions';
import { applyStyle, getStyleView, pushRecentColor } from './style-actions';

const box = () => createBoxElement('rectangle', { x: 0, y: 0, width: 50, height: 50 });

function withSelected(...els: SceneElement[]): AppState {
  const s = addElements(createInitialState(), els);
  return setSelection(
    s,
    els.map((e) => e.id),
  );
}

describe('getStyleView', () => {
  it('returns null for the select tool with nothing selected', () => {
    expect(getStyleView(createInitialState())).toBeNull();
  });

  it('shows the active tool memory without a selection', () => {
    const s = setTool(createInitialState(), 'arrow');
    const view = getStyleView(s);
    expect(view?.endHead).toBe('arrow');
    expect(view?.fillStyle).toBeUndefined();
  });

  it('reports mixed values and omits unsupported properties', () => {
    const a = box();
    const b = mutateElement(box(), { style: { ...a.style, strokeColor: '#b8432f' } });
    const line = createLine({ x: 0, y: 0 });
    const view = getStyleView(withSelected(a, b, line));
    expect(view?.strokeColor).toBe('mixed');
    expect(view?.strokeWidth).toBe('medium');
    // Fill is supported by the boxes only, and they agree.
    expect(view?.fillStyle).toBe('none');
    expect(view?.startHead).toBeUndefined();
  });
});

describe('applyStyle', () => {
  it('updates selected elements and their category memory', () => {
    const a = box();
    const arrow = createArrow({ x: 0, y: 0 });
    const s = applyStyle(withSelected(a, arrow), { strokeWidth: 'bold', fillStyle: 'hatch' });
    const na = s.scene.entities[a.id];
    const nArrow = s.scene.entities[arrow.id];
    expect(na?.style.strokeWidth).toBe('bold');
    expect(na?.style.fillStyle).toBe('hatch');
    expect(na?.revision).toBe(a.revision + 1);
    expect(nArrow?.style.strokeWidth).toBe('bold');
    expect(nArrow?.style.fillStyle).toBe('none');
    expect(s.styleMemory.shape.fillStyle).toBe('hatch');
    expect(s.styleMemory.linear.strokeWidth).toBe('bold');
    expect(s.styleMemory.linear.fillStyle).toBe('none');
    expect(s.styleMemory.freedraw.strokeWidth).toBe('medium');
  });

  it('skips locked elements', () => {
    const locked = mutateElement(box(), { locked: true });
    const s = applyStyle(withSelected(locked), { roughness: 2 });
    expect(s.scene.entities[locked.id]).toBe(locked);
  });

  it('sets arrowheads on arrows and remembers them', () => {
    const arrow = createArrow({ x: 0, y: 0 });
    const s = applyStyle(withSelected(arrow), { startHead: 'dot' });
    const next = s.scene.entities[arrow.id];
    expect(next?.type === 'arrow' && next.startHead).toBe('dot');
    expect(s.styleMemory.arrowHeads).toEqual({ start: 'dot', end: 'arrow' });
  });

  it('updates only tool memory without a selection', () => {
    const s0 = setTool(createInitialState(), 'ellipse');
    const s = applyStyle(s0, { roughness: 0, startHead: 'bar' });
    expect(s.scene).toBe(s0.scene);
    expect(s.styleMemory.shape.roughness).toBe(0);
    expect(s.styleMemory.arrowHeads.start).toBe('none');
  });

  it('returns the same state for a no-op change', () => {
    const s = withSelected(box());
    expect(applyStyle(s, { strokeWidth: 'medium' })).toBe(s);
  });

  it('records custom colors only', () => {
    const s = withSelected(box());
    expect(applyStyle(s, { strokeColor: '#3d4fa8' }).recentColors).toEqual([]);
    expect(applyStyle(s, { strokeColor: '#123456' }).recentColors).toEqual(['#123456']);
  });
});

describe('colors', () => {
  it('normalizes hex input', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex(' #12aB9f ')).toBe('#12ab9f');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
  });

  it('keeps recent colors unique, newest first, capped', () => {
    let r: readonly string[] = [];
    for (let i = 0; i < 10; i++) r = pushRecentColor(r, `#00000${String(i)}`);
    expect(r).toHaveLength(8);
    expect(r[0]).toBe('#000009');
    r = pushRecentColor(r, '#000005');
    expect(r[0]).toBe('#000005');
    expect(r.filter((c) => c === '#000005')).toHaveLength(1);
  });
});

describe('tools use remembered style', () => {
  it('draws an arrow with the remembered heads and style', () => {
    const editor = new Editor();
    editor.update((s) => applyStyle(setTool(s, 'arrow'), { endHead: 'diamond', roughness: 2 }));
    const ctx: ToolContext = {
      getState: editor.getState,
      update: editor.update,
      hitTest: (w) => editor.hitTest(w),
    };
    const input = (screen: Point): PointerInput => ({
      pointerId: 1,
      kind: 'mouse',
      screen,
      world: screenToWorld(editor.getState().camera, screen),
      button: 0,
      pressure: 0,
      shift: false,
      alt: false,
      mod: false,
    });
    const tool = new LinearTool('arrow');
    tool.onPointerDown(ctx, input({ x: 10, y: 10 }));
    tool.onPointerMove(ctx, input({ x: 120, y: 60 }));
    tool.onPointerUp(ctx, input({ x: 120, y: 60 }));
    const s = editor.getState();
    const el = s.scene.entities[s.scene.order[0] ?? ('' as never)];
    expect(el?.type).toBe('arrow');
    expect(el?.type === 'arrow' && el.endHead).toBe('diamond');
    expect(el?.style.roughness).toBe(2);
  });
});
