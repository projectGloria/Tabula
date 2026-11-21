import { describe, expect, it } from 'vitest';
import { addElements, setElementPositions, setSelection } from '../actions/actions';
import { COMMANDS, executeCommand } from '../actions/commands';
import { cloneElements } from '../actions/edit-actions';
import {
  deleteLinearPoints,
  insertLinearPoint,
  openLinearEdit,
  setLinearPoints,
} from '../actions/linear-actions';
import { screenToWorld } from '../camera/camera';
import { worldPointsOf } from '../geometry/element-geometry';
import { linearPathPoints } from '../geometry/linear-path';
import type { Point } from '../geometry/vec';
import { sanitizeElement } from '../io/validate';
import {
  createArrow,
  createBoxElement,
  createLine,
  createRectangle,
  removeElements,
} from '../model/scene';
import type { ArrowElement, ElementId, SceneElement } from '../model/types';
import { snapBox, snapContext, snapPoint, NO_SNAP } from '../snapping/snapping';
import { createInitialState } from '../store/app-state';
import { Editor } from '../store/editor';
import { LinearTool } from '../tools/linear-tool';
import type { PointerInput, ToolContext } from '../tools/tool';
import { anchorWorld, findBindTarget, outlineHit } from './binding';

function arrowOf(editor: Editor, id: ElementId): ArrowElement {
  const el = editor.getState().scene.entities[id];
  if (el?.type !== 'arrow') throw new Error('not an arrow');
  return el;
}

function ends(a: ArrowElement): [Point, Point] {
  const pts = worldPointsOf(a);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) throw new Error('no points');
  return [first, last];
}

/** Box A at (0,0)-(100,100), box B at (300,0)-(400,100), arrow bound A→B. */
function boundPair() {
  const a = createRectangle({ x: 0, y: 0, width: 100, height: 100 });
  const b = createRectangle({ x: 300, y: 0, width: 100, height: 100 });
  const arrow = createArrow({ x: 100, y: 50 });
  const editor = new Editor();
  editor.update((s) => addElements(s, [a, b, arrow]));
  editor.update((s) =>
    setLinearPoints(
      s,
      arrow.id,
      [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
      ],
      {
        start: { elementId: a.id, anchor: { x: 0.9, y: 0.5 } },
        end: { elementId: b.id, anchor: { x: 0.1, y: 0.5 } },
      },
    ),
  );
  return { editor, a, b, arrow };
}

describe('outlineHit', () => {
  it('finds the first crossing of a rectangle', () => {
    const r = createRectangle({ x: 0, y: 0, width: 100, height: 100 });
    expect(outlineHit(r, { x: -50, y: 50 }, { x: 50, y: 50 })).toEqual({ x: 0, y: 50 });
  });
  it('finds the crossing of an ellipse', () => {
    const e = createBoxElement('ellipse', { x: 0, y: 0, width: 100, height: 50 });
    const p = outlineHit(e, { x: 50, y: -100 }, { x: 50, y: 25 });
    expect(p?.x).toBeCloseTo(50);
    expect(p?.y).toBeCloseTo(0);
  });
  it('returns null when the segment misses', () => {
    const r = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
    expect(outlineHit(r, { x: 20, y: 0 }, { x: 30, y: 0 })).toBeNull();
  });
});

describe('findBindTarget', () => {
  it('picks the topmost unlocked shape near the point and skips excluded ones', () => {
    const a = createRectangle({ x: 0, y: 0, width: 100, height: 100 });
    const b = createRectangle({ x: 50, y: 50, width: 100, height: 100 });
    const s = addElements(createInitialState(), [a, b]);
    expect(findBindTarget(s.scene, { x: 75, y: 75 }, 4, new Set())?.id).toBe(b.id);
    expect(findBindTarget(s.scene, { x: 75, y: 75 }, 4, new Set([b.id]))?.id).toBe(a.id);
    expect(findBindTarget(s.scene, { x: 500, y: 500 }, 4, new Set())).toBeUndefined();
  });
});

describe('arrow binding', () => {
  it('places bound ends on the outlines with a gap', () => {
    const { editor, arrow } = boundPair();
    const [p0, p1] = ends(arrowOf(editor, arrow.id));
    expect(p0.x).toBeGreaterThan(100);
    expect(p0.x).toBeLessThan(110);
    expect(p1.x).toBeLessThan(300);
    expect(p1.x).toBeGreaterThan(290);
    expect(p0.y).toBeCloseTo(50);
  });

  it('follows a target that moves', () => {
    const { editor, b, arrow } = boundPair();
    editor.update((s) => setElementPositions(s, new Map([[b.id, { x: 300, y: 200 }]])));
    const a2 = arrowOf(editor, arrow.id);
    expect(a2.endBinding?.elementId).toBe(b.id);
    const [, p1] = ends(a2);
    expect(p1.y).toBeGreaterThan(150);
  });

  it('detaches when the arrow alone is moved', () => {
    const { editor, arrow } = boundPair();
    const cur = arrowOf(editor, arrow.id);
    editor.update((s) =>
      setElementPositions(s, new Map([[arrow.id, { x: cur.x + 10, y: cur.y + 40 }]])),
    );
    const a2 = arrowOf(editor, arrow.id);
    expect(a2.startBinding).toBeNull();
    expect(a2.endBinding).toBeNull();
  });

  it('stays bound through undo of a target move', () => {
    const { editor, b, arrow } = boundPair();
    editor.update((s) => setElementPositions(s, new Map([[b.id, { x: 300, y: 200 }]])));
    editor.undo();
    const a2 = arrowOf(editor, arrow.id);
    expect(a2.endBinding?.elementId).toBe(b.id);
    expect(ends(a2)[1].y).toBeCloseTo(50);
  });

  it('drops bindings whose target is deleted', () => {
    const { editor, b, arrow } = boundPair();
    editor.update((s) => ({ ...s, scene: removeElements(s.scene, [b.id]) }));
    expect(arrowOf(editor, arrow.id).endBinding).toBeNull();
  });

  it('copies remap bindings to copied targets and drop the rest', () => {
    const { editor, a, arrow } = boundPair();
    const s = editor.getState().scene;
    const els = [s.entities[a.id], s.entities[arrow.id]].filter(
      (e): e is SceneElement => e !== undefined,
    );
    const copies = cloneElements(els, { x: 10, y: 10 }, () => true);
    const [ca, carrow] = copies;
    if (carrow?.type !== 'arrow' || !ca) throw new Error('copy failed');
    expect(carrow.startBinding?.elementId).toBe(ca.id);
    expect(carrow.endBinding).toBeNull();
  });

  it('validates bindings when loading', () => {
    const { editor, b, arrow } = boundPair();
    const raw = JSON.parse(JSON.stringify(editor.getState().scene.entities[arrow.id])) as unknown;
    const loaded = sanitizeElement(raw);
    expect(loaded?.type === 'arrow' ? loaded.endBinding?.elementId : null).toBe(b.id);
  });
});

function toolHarness() {
  const editor = new Editor();
  const ctx: ToolContext = {
    getState: editor.getState,
    update: editor.update,
    hitTest: (w) => editor.hitTest(w),
    begin: editor.begin,
    end: editor.end,
  };
  const input = (screen: Point, mods: Partial<PointerInput> = {}): PointerInput => ({
    pointerId: 1,
    kind: 'mouse',
    screen,
    world: screenToWorld(editor.getState().camera, screen),
    button: 0,
    pressure: 0.5,
    shift: false,
    alt: false,
    mod: false,
    ...mods,
  });
  return { editor, ctx, input };
}

describe('LinearTool binding', () => {
  it('binds both ends of a dragged arrow and highlights the target meanwhile', () => {
    const h = toolHarness();
    const a = createRectangle({ x: 0, y: 0, width: 100, height: 100 });
    const b = createRectangle({ x: 300, y: 0, width: 100, height: 100 });
    h.editor.update((s) => addElements(s, [a, b]));
    const tool = new LinearTool('arrow');
    const pa = { x: 50, y: 50 };
    const pb = { x: 350, y: 50 };
    tool.onPointerDown(h.ctx, h.input(pa));
    tool.onPointerMove(h.ctx, h.input({ x: 200, y: 50 }));
    tool.onPointerMove(h.ctx, h.input(pb));
    expect(h.editor.getState().overlay.bindTarget).toBe(b.id);
    tool.onPointerUp(h.ctx, h.input(pb));
    const s = h.editor.getState();
    const id = s.scene.order[s.scene.order.length - 1];
    const arrow = id === undefined ? undefined : s.scene.entities[id];
    if (arrow?.type !== 'arrow') throw new Error('no arrow');
    expect(arrow.startBinding?.elementId).toBe(a.id);
    expect(arrow.endBinding?.elementId).toBe(b.id);
    expect(s.overlay.bindTarget).toBeNull();
    const [p0, p1] = ends(arrow);
    expect(p0.x).toBeGreaterThan(100);
    expect(p1.x).toBeLessThan(300);
  });

  it('does not bind while Ctrl/⌘ is held', () => {
    const h = toolHarness();
    const b = createRectangle({ x: 300, y: 0, width: 100, height: 100 });
    h.editor.update((s) => addElements(s, [b]));
    const tool = new LinearTool('arrow');
    tool.onPointerDown(h.ctx, h.input({ x: 0, y: 50 }, { mod: true }));
    tool.onPointerMove(h.ctx, h.input({ x: 350, y: 50 }, { mod: true }));
    tool.onPointerUp(h.ctx, h.input({ x: 350, y: 50 }, { mod: true }));
    const s = h.editor.getState();
    const arrow = s.scene.entities[s.scene.order[1] ?? ('' as ElementId)];
    expect(arrow?.type === 'arrow' ? arrow.endBinding : 'x').toBeNull();
  });
});

describe('point editing', () => {
  function line() {
    const l = createLine({ x: 0, y: 0 });
    let s = addElements(createInitialState(), [l]);
    s = setLinearPoints(s, l.id, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    return { s: setSelection(s, [l.id]), id: l.id };
  }

  it('inserts a point after an index', () => {
    const { s, id } = line();
    const n = insertLinearPoint(s, id, 0, { x: 50, y: -20 });
    const el = n.scene.entities[id];
    expect(el && 'points' in el ? worldPointsOf(el)[1] : null).toEqual({ x: 50, y: -20 });
  });

  it('deletes points but keeps at least two', () => {
    const { s, id } = line();
    const one = deleteLinearPoints(s, id, [1]);
    const el = one.scene.entities[id];
    expect(el && 'points' in el ? el.points.length : 0).toBe(2);
    expect(deleteLinearPoints(one, id, [0])).toBe(one);
  });

  it('Delete removes selected points in the point editor', () => {
    const { s, id } = line();
    const editor = new Editor(openLinearEdit(s, id));
    editor.update((st) => (st.linearEdit ? { ...st, linearEdit: { id, selected: [2] } } : st));
    executeCommand(editor, COMMANDS['edit.delete']);
    const el = editor.getState().scene.entities[id];
    expect(el && 'points' in el ? el.points.length : 0).toBe(2);
    executeCommand(editor, COMMANDS['selection.clear']);
    expect(editor.getState().linearEdit).toBeNull();
    expect(editor.getState().selection[id]).toBe(true);
  });

  it('closes the editor when the selection changes', () => {
    const { s, id } = line();
    const editor = new Editor(openLinearEdit(s, id));
    editor.update((st) => setSelection(st, []));
    expect(editor.getState().linearEdit).toBeNull();
  });

  it('curved paths pass through every point', () => {
    const l = createLine({ x: 0, y: 0, curve: 'curved' });
    const s = setLinearPoints(addElements(createInitialState(), [l]), l.id, [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ]);
    const el = s.scene.entities[l.id];
    if (el?.type !== 'line') throw new Error('no line');
    const path = linearPathPoints(el);
    expect(path.length).toBeGreaterThan(3);
    expect(path.some((p) => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y - 50) < 1e-6)).toBe(true);
  });
});

describe('snapping', () => {
  const other = { minX: 200, minY: 0, maxX: 300, maxY: 100 };
  const sc = { boxes: [other], tolerance: 8, grid: null };

  it('snaps box edges to other boxes and reports a guide', () => {
    const r = snapBox(sc, { minX: 0, minY: 5, maxX: 195, maxY: 105 });
    expect(r.dx).toBe(5);
    expect(r.dy).toBe(-5);
    expect(r.guides.some((g) => g.axis === 'x' && g.at === 200)).toBe(true);
  });

  it('snaps to the grid when no object is near', () => {
    const r = snapPoint({ ...NO_SNAP, grid: 20 }, { x: 27, y: 33 });
    expect(r.point).toEqual({ x: 20, y: 40 });
    expect(r.guides).toEqual([]);
  });

  it('only snaps to the grid while it is visible', () => {
    const s = createInitialState({ gridVisible: false, gridSnap: true });
    expect(snapContext(s, []).grid).toBeNull();
    expect(snapContext({ ...s, gridVisible: true }, []).grid).toBe(s.gridSize);
  });

  it('excludes moving elements and their bound arrows', () => {
    const { editor, a } = boundPair();
    const s = { ...editor.getState(), objectSnap: true, viewport: { width: 2000, height: 2000 } };
    const ctx = snapContext(s, [a.id]);
    // Only box B remains a target.
    expect(ctx.boxes).toHaveLength(1);
  });
});

describe('view commands', () => {
  it('toggle grid, grid snap and object snap', () => {
    const editor = new Editor();
    executeCommand(editor, COMMANDS['view.grid']);
    expect(editor.getState().gridVisible).toBe(true);
    executeCommand(editor, COMMANDS['view.gridSnap']);
    expect(editor.getState().gridSnap).toBe(false);
    executeCommand(editor, COMMANDS['view.gridSize40']);
    expect(editor.getState().gridSize).toBe(40);
    expect(COMMANDS['view.gridSize40'].checked?.(editor.getState())).toBe(true);
    executeCommand(editor, COMMANDS['view.objectSnap']);
    expect(editor.getState().objectSnap).toBe(true);
  });

  it('anchors are resolved in world space', () => {
    const r = createRectangle({ x: 10, y: 20, width: 100, height: 50 });
    expect(anchorWorld(r, { x: 0.5, y: 0.5 })).toEqual({ x: 60, y: 45 });
  });
});
