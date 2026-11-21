import { beforeEach, describe, expect, it } from 'vitest';
import { addElements, setSelection, setTool } from '../actions/actions';
import { screenToWorld } from '../camera/camera';
import { worldPointsOf } from '../geometry/element-geometry';
import { rectCorners } from '../geometry/rect';
import type { Point } from '../geometry/vec';
import { createBoxElement } from '../model/scene';
import type { SceneElement } from '../model/types';
import { selectedIds } from '../store/app-state';
import { Editor } from '../store/editor';
import { FreedrawTool } from './freedraw-tool';
import { LinearTool } from './linear-tool';
import { SelectTool } from './select-tool';
import type { PointerInput, Tool, ToolContext } from './tool';

function harness() {
  const editor = new Editor();
  const ctx: ToolContext = {
    getState: editor.getState,
    update: editor.update,
    hitTest: (w) => editor.hitTest(w),
  };
  const input = (screen: Point, mods: Partial<PointerInput> = {}): PointerInput => ({
    pointerId: 1,
    kind: 'mouse',
    screen,
    world: screenToWorld(editor.getState().camera, screen),
    button: 0,
    pressure: 0,
    shift: false,
    alt: false,
    mod: false,
    ...mods,
  });
  const only = (): SceneElement => {
    const s = editor.getState();
    expect(s.scene.order).toHaveLength(1);
    const el = s.scene.entities[s.scene.order[0] ?? ('' as never)];
    if (!el) throw new Error('missing element');
    return el;
  };
  const drag = (tool: Tool, from: Point, to: Point, mods: Partial<PointerInput> = {}) => {
    tool.onPointerDown(ctx, input(from, mods));
    tool.onPointerMove(ctx, input({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, mods));
    tool.onPointerMove(ctx, input(to, mods));
    tool.onPointerUp(ctx, input(to, mods));
  };
  const click = (tool: Tool, p: Point) => {
    tool.onPointerDown(ctx, input(p));
    tool.onPointerUp(ctx, input(p));
  };
  return { editor, ctx, input, only, drag, click };
}

const close = (a: number, b: number, eps = 1e-6) => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};

describe('LinearTool', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    h.editor.update((s) => setTool(s, 'arrow'));
  });

  it('drags a two-point arrow, selects it and returns to Select', () => {
    const tool = new LinearTool('arrow');
    h.drag(tool, { x: 100, y: 100 }, { x: 40, y: 160 });
    const el = h.only();
    expect(el.type).toBe('arrow');
    expect(worldPointsOf(el as never)).toEqual([
      { x: 100, y: 100 },
      { x: 40, y: 160 },
    ]);
    expect(el).toMatchObject({ x: 40, y: 100, width: 60, height: 60 });
    const s = h.editor.getState();
    expect(selectedIds(s)).toEqual([el.id]);
    expect(s.activeTool).toBe('select');
  });

  it('snaps the segment to 15° with Shift, keeping its length', () => {
    const tool = new LinearTool('line');
    h.drag(tool, { x: 0, y: 0 }, { x: 100, y: 8 }, { shift: true });
    const pts = worldPointsOf(h.only() as never);
    close(pts[1]?.y ?? NaN, 0);
    close(pts[1]?.x ?? NaN, Math.hypot(100, 8));
  });

  it('builds a polyline by clicking and finishes on the last point', () => {
    const tool = new LinearTool('line');
    h.click(tool, { x: 0, y: 0 });
    tool.onPointerMove(h.ctx, h.input({ x: 100, y: 0 }));
    h.click(tool, { x: 100, y: 0 });
    h.click(tool, { x: 100, y: 100 });
    h.click(tool, { x: 103, y: 102 }); // within the finish radius
    expect(worldPointsOf(h.only() as never)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(h.editor.getState().activeTool).toBe('select');
  });

  it('finishes with Enter and keeps a ≥2-point polyline on cancel', () => {
    const a = new LinearTool('line');
    h.click(a, { x: 0, y: 0 });
    h.click(a, { x: 50, y: 50 });
    a.finish(h.ctx);
    expect(worldPointsOf(h.only() as never)).toHaveLength(2);

    const b = harness();
    const t = new LinearTool('line');
    b.click(t, { x: 0, y: 0 });
    b.click(t, { x: 50, y: 0 });
    t.cancel(b.ctx);
    expect(b.editor.getState().scene.order).toHaveLength(1);
  });

  it('discards a lone click on cancel and a tiny drag', () => {
    const tool = new LinearTool('line');
    h.click(tool, { x: 10, y: 10 });
    tool.cancel(h.ctx);
    expect(h.editor.getState().scene.order).toHaveLength(0);

    tool.onPointerDown(h.ctx, h.input({ x: 10, y: 10 }));
    tool.onPointerMove(h.ctx, h.input({ x: 15, y: 10 }));
    tool.onPointerUp(h.ctx, h.input({ x: 11, y: 10 }));
    expect(h.editor.getState().scene.order).toHaveLength(0);
  });
});

describe('FreedrawTool', () => {
  it('records a stroke with simulated pressure and stays active', () => {
    const h = harness();
    h.editor.update((s) => setTool(s, 'freedraw'));
    const tool = new FreedrawTool();
    tool.onPointerDown(h.ctx, h.input({ x: 0, y: 0 }));
    for (let i = 1; i <= 20; i++) tool.onPointerMove(h.ctx, h.input({ x: i * 10, y: (i % 2) * 5 }));
    tool.onPointerUp(h.ctx, h.input({ x: 200, y: 0 }));
    const el = h.only();
    if (el.type !== 'freedraw') throw new Error('type');
    expect(el.points.length).toBeGreaterThan(10);
    expect(el.pressures).toHaveLength(el.points.length);
    for (const p of el.pressures) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(el.points[0]).toEqual({ x: el.points[0]?.x, y: el.points[0]?.y });
    expect(Math.min(...el.points.map((p) => p.x))).toBe(0);
    const s = h.editor.getState();
    expect(s.activeTool).toBe('freedraw');
    expect(selectedIds(s)).toEqual([]);
  });

  it('uses pen pressure when available and deletes the stroke on cancel', () => {
    const h = harness();
    const tool = new FreedrawTool();
    tool.onPointerDown(h.ctx, h.input({ x: 0, y: 0 }, { kind: 'pen', pressure: 0.9 }));
    tool.onPointerMove(h.ctx, h.input({ x: 30, y: 0 }, { kind: 'pen', pressure: 0.2 }));
    const el = h.only();
    if (el.type !== 'freedraw') throw new Error('type');
    expect(el.pressures).toEqual([0.9, 0.2]);
    tool.cancel(h.ctx);
    expect(h.editor.getState().scene.order).toHaveLength(0);
  });
});

describe('SelectTool handle gestures', () => {
  function setup(el: SceneElement) {
    const h = harness();
    h.editor.update((s) => setSelection(addElements(s, [el]), [el.id]));
    return { ...h, tool: new SelectTool() };
  }

  it('resizes from the SE handle, with Shift keeping the aspect ratio', () => {
    const h = setup(createBoxElement('rectangle', { x: 100, y: 100, width: 200, height: 100 }));
    h.drag(h.tool, { x: 304, y: 204 }, { x: 404, y: 224 });
    expect(h.only()).toMatchObject({ x: 100, y: 100, width: 300, height: 120 });
    h.drag(h.tool, { x: 404, y: 224 }, { x: 704, y: 224 }, { shift: true });
    expect(h.only()).toMatchObject({ width: 600, height: 240 });
  });

  it('rotates with the rotation handle and snaps with Shift', () => {
    const h = setup(createBoxElement('rectangle', { x: 100, y: 100, width: 200, height: 100 }));
    // Rotation handle sits above the top edge; drag it to the right of the center.
    h.drag(h.tool, { x: 200, y: 72 }, { x: 400, y: 158 }, { shift: true });
    close(h.only().angle, Math.PI / 2);
    const [nw] = rectCorners(h.only());
    close(nw.x, 250);
    close(nw.y, 50);
  });

  it('drags a line endpoint', () => {
    const h = harness();
    const line = new LinearTool('line');
    h.drag(line, { x: 0, y: 0 }, { x: 100, y: 0 });
    const tool = new SelectTool();
    h.drag(tool, { x: 100, y: 0 }, { x: 100, y: 50 });
    expect(worldPointsOf(h.only() as never)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it('restores originals on cancel', () => {
    const h = setup(createBoxElement('ellipse', { x: 0, y: 0, width: 100, height: 100 }));
    h.tool.onPointerDown(h.ctx, h.input({ x: 104, y: 104 }));
    h.tool.onPointerMove(h.ctx, h.input({ x: 300, y: 300 }));
    expect(h.only().width).toBeGreaterThan(100);
    h.tool.cancel(h.ctx);
    expect(h.only()).toMatchObject({ x: 0, y: 0, width: 100, height: 100 });
  });
});
