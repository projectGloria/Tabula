import { beforeEach, describe, expect, it } from 'vitest';
import { addElements, setTool } from '../actions/actions';
import { screenToWorld } from '../camera/camera';
import type { Point } from '../geometry/vec';
import { createRectangle } from '../model/scene';
import { DEFAULT_STYLE } from '../model/style';
import { selectedIds } from '../store/app-state';
import { Editor } from '../store/editor';
import { rectFromDrag } from './drag-rect';
import { BoxShapeTool } from './box-shape-tool';
import { SelectTool } from './select-tool';
import type { PointerInput, ToolContext } from './tool';

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
    pressure: 0.5,
    shift: false,
    alt: false,
    mod: false,
    ...mods,
  });
  return { editor, ctx, input };
}

describe('rectFromDrag', () => {
  const o = { x: 100, y: 100 };
  it('normalizes a backwards drag', () => {
    expect(rectFromDrag(o, { x: 40, y: 70 }, { shift: false, alt: false })).toEqual({
      x: 40,
      y: 70,
      width: 60,
      height: 30,
    });
  });
  it('constrains to a square with Shift', () => {
    expect(rectFromDrag(o, { x: 40, y: 130 }, { shift: true, alt: false })).toEqual({
      x: 40,
      y: 100,
      width: 60,
      height: 60,
    });
  });
  it('draws from the center with Alt', () => {
    expect(rectFromDrag(o, { x: 130, y: 110 }, { shift: false, alt: true })).toEqual({
      x: 70,
      y: 90,
      width: 60,
      height: 20,
    });
  });
});

describe('BoxShapeTool (rectangle)', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    h.editor.update((s) => setTool(s, 'rectangle'));
  });

  it('creates a normalized rectangle, selects it and returns to Select', () => {
    const tool = new BoxShapeTool('rectangle');
    tool.onPointerDown(h.ctx, h.input({ x: 200, y: 200 }));
    tool.onPointerMove(h.ctx, h.input({ x: 150, y: 260 }));
    tool.onPointerUp(h.ctx, h.input({ x: 100, y: 300 }));
    const s = h.editor.getState();
    expect(s.scene.order).toHaveLength(1);
    const el = s.scene.entities[s.scene.order[0] ?? ('' as never)];
    expect(el).toMatchObject({ x: 100, y: 200, width: 100, height: 100 });
    expect(selectedIds(s)).toEqual([el?.id]);
    expect(s.activeTool).toBe('select');
  });

  it('discards a click without drag', () => {
    const tool = new BoxShapeTool('rectangle');
    tool.onPointerDown(h.ctx, h.input({ x: 10, y: 10 }));
    tool.onPointerUp(h.ctx, h.input({ x: 10.5, y: 10.5 }));
    expect(h.editor.getState().scene.order).toHaveLength(0);
  });

  it('removes the in-progress shape on cancel', () => {
    const tool = new BoxShapeTool('rectangle');
    tool.onPointerDown(h.ctx, h.input({ x: 10, y: 10 }));
    tool.onPointerMove(h.ctx, h.input({ x: 90, y: 90 }));
    tool.cancel(h.ctx);
    expect(h.editor.getState().scene.order).toHaveLength(0);
  });

  it('ignores other pointers during a gesture', () => {
    const tool = new BoxShapeTool('rectangle');
    tool.onPointerDown(h.ctx, h.input({ x: 0, y: 0 }));
    tool.onPointerMove(h.ctx, h.input({ x: 500, y: 500 }, { pointerId: 2 }));
    tool.onPointerUp(h.ctx, h.input({ x: 50, y: 40 }));
    const s = h.editor.getState();
    expect(s.scene.entities[s.scene.order[0] ?? ('' as never)]).toMatchObject({
      width: 50,
      height: 40,
    });
  });
});

describe('SelectTool', () => {
  const filled = { ...DEFAULT_STYLE, fillStyle: 'solid' as const };
  let h: ReturnType<typeof harness>;
  const a = createRectangle({ x: 0, y: 0, width: 100, height: 100, style: filled });
  const b = createRectangle({ x: 300, y: 0, width: 100, height: 100, style: filled });
  beforeEach(() => {
    h = harness();
    h.editor.update((s) => addElements(s, [a, b]));
  });

  it('click selects, click on empty space clears', () => {
    const tool = new SelectTool();
    tool.onPointerDown(h.ctx, h.input({ x: 50, y: 50 }));
    tool.onPointerUp(h.ctx, h.input({ x: 50, y: 50 }));
    expect(selectedIds(h.editor.getState())).toEqual([a.id]);
    tool.onPointerDown(h.ctx, h.input({ x: 200, y: 500 }));
    tool.onPointerUp(h.ctx, h.input({ x: 200, y: 500 }));
    expect(selectedIds(h.editor.getState())).toEqual([]);
  });

  it('shift-click toggles membership', () => {
    const tool = new SelectTool();
    const click = (p: Point, shift = false) => {
      tool.onPointerDown(h.ctx, h.input(p, { shift }));
      tool.onPointerUp(h.ctx, h.input(p, { shift }));
    };
    click({ x: 50, y: 50 });
    click({ x: 350, y: 50 }, true);
    expect(selectedIds(h.editor.getState())).toEqual([a.id, b.id]);
    click({ x: 50, y: 50 }, true);
    expect(selectedIds(h.editor.getState())).toEqual([b.id]);
  });

  it('drags the whole selection without drift', () => {
    const tool = new SelectTool();
    tool.onPointerDown(h.ctx, h.input({ x: 50, y: 50 }));
    tool.onPointerUp(h.ctx, h.input({ x: 50, y: 50 }));
    tool.onPointerDown(h.ctx, h.input({ x: 350, y: 50 }, { shift: true }));
    for (let i = 1; i <= 10; i++) tool.onPointerMove(h.ctx, h.input({ x: 350 + i * 3, y: 50 + i }));
    tool.onPointerUp(h.ctx, h.input({ x: 380, y: 60 }));
    const s = h.editor.getState();
    expect(s.scene.entities[a.id]).toMatchObject({ x: 30, y: 10 });
    expect(s.scene.entities[b.id]).toMatchObject({ x: 330, y: 10 });
  });

  it('does not move below the drag threshold', () => {
    const tool = new SelectTool();
    tool.onPointerDown(h.ctx, h.input({ x: 50, y: 50 }));
    tool.onPointerMove(h.ctx, h.input({ x: 51, y: 51 }));
    tool.onPointerUp(h.ctx, h.input({ x: 51, y: 51 }));
    expect(h.editor.getState().scene.entities[a.id]).toBe(a);
  });

  it('restores positions on cancel', () => {
    const tool = new SelectTool();
    tool.onPointerDown(h.ctx, h.input({ x: 50, y: 50 }));
    tool.onPointerMove(h.ctx, h.input({ x: 150, y: 150 }));
    tool.cancel(h.ctx);
    expect(h.editor.getState().scene.entities[a.id]).toMatchObject({ x: 0, y: 0 });
  });

  it('works at non-default zoom', () => {
    h.editor.update((s) => ({ ...s, camera: { x: 0, y: 0, zoom: 2 } }));
    const tool = new SelectTool();
    tool.onPointerDown(h.ctx, h.input({ x: 100, y: 100 })); // world (50,50)
    tool.onPointerMove(h.ctx, h.input({ x: 140, y: 100 }));
    tool.onPointerUp(h.ctx, h.input({ x: 140, y: 100 }));
    expect(h.editor.getState().scene.entities[a.id]).toMatchObject({ x: 20, y: 0 });
  });
});
