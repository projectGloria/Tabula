import { describe, expect, it } from 'vitest';
import { screenToWorld } from '../camera/camera';
import type { Point } from '../geometry/vec';
import { createRectangle } from '../model/scene';
import { DEFAULT_STYLE } from '../model/style';
import { createInitialState, type AppState } from '../store/app-state';
import { Editor } from '../store/editor';
import { BoxShapeTool } from '../tools/box-shape-tool';
import { EraserTool } from '../tools/eraser-tool';
import { HandTool } from '../tools/hand-tool';
import type { PointerInput, ToolContext } from '../tools/tool';
import { darkColor, invertLightness } from '../render/invert';
import { addElements, setSelection, setTool } from './actions';
import { COMMANDS, commandAllowed } from './commands';
import {
  contentOffscreen,
  fitBox,
  FIT_ALL_MAX_ZOOM,
  scrollToContent,
  setViewMode,
  toggleToolLock,
  zoomIn,
  zoomOut,
  zoomReset,
  zoomToFit,
  zoomToSelection,
} from './view-actions';

const filled = { ...DEFAULT_STYLE, fillStyle: 'solid' as const };

function base(): AppState {
  return { ...createInitialState(), viewport: { width: 1000, height: 800 } };
}

function harness(initial: AppState = base()) {
  const editor = new Editor(initial);
  const ctx: ToolContext = {
    getState: editor.getState,
    update: editor.update,
    hitTest: (w) => editor.hitTest(w),
  };
  const input = (screen: Point, pointerId = 1): PointerInput => ({
    pointerId,
    kind: 'mouse',
    screen,
    world: screenToWorld(editor.getState().camera, screen),
    button: 0,
    pressure: 0.5,
    shift: false,
    alt: false,
    mod: false,
  });
  return { editor, ctx, input };
}

describe('zoom steps', () => {
  it('steps through fixed levels and keeps the viewport centre fixed', () => {
    const s = base();
    const center = screenToWorld(s.camera, { x: 500, y: 400 });
    const a = zoomIn(s);
    expect(a.camera.zoom).toBe(1.25);
    expect(screenToWorld(a.camera, { x: 500, y: 400 }).x).toBeCloseTo(center.x);
    expect(zoomOut(s).camera.zoom).toBe(0.75);
    expect(zoomReset(zoomIn(zoomIn(s))).camera.zoom).toBe(1);
  });

  it('snaps an off-step zoom to the next step', () => {
    const s = { ...base(), camera: { x: 0, y: 0, zoom: 1.1 } };
    expect(zoomIn(s).camera.zoom).toBe(1.25);
    expect(zoomOut(s).camera.zoom).toBe(1);
  });
});

describe('fitting', () => {
  const small = createRectangle({ x: 0, y: 0, width: 10, height: 10, style: filled });
  const big = createRectangle({ x: 0, y: 0, width: 9000, height: 100, style: filled });

  it('caps fit-all at 100% and centres the content', () => {
    const s = zoomToFit(addElements(base(), [small]));
    expect(s.camera.zoom).toBe(FIT_ALL_MAX_ZOOM);
    const c = screenToWorld(s.camera, { x: 500, y: 400 });
    expect(c.x).toBeCloseTo(5);
    expect(c.y).toBeCloseTo(5);
  });

  it('zooms out to fit large content inside the padding', () => {
    const s = zoomToFit(addElements(base(), [big]));
    expect(s.camera.zoom).toBeLessThan(0.11);
    expect(s.camera.zoom).toBeGreaterThan(0.1);
  });

  it('zoom to selection allows magnifying up to 300%', () => {
    const s = setSelection(addElements(base(), [small]), [small.id]);
    expect(zoomToSelection(s).camera.zoom).toBe(3);
    const none = base();
    expect(zoomToSelection(none)).toBe(none);
  });

  it('fitBox ignores an empty viewport', () => {
    const s = { ...base(), viewport: { width: 0, height: 0 } };
    expect(fitBox(s, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, 1)).toBe(s);
  });
});

describe('contentOffscreen', () => {
  const r = createRectangle({ x: 0, y: 0, width: 100, height: 100, style: filled });

  it('is false for an empty scene and for visible content', () => {
    expect(contentOffscreen(base())).toBe(false);
    expect(contentOffscreen(addElements(base(), [r]))).toBe(false);
  });

  it('is true once panned away, and scrollToContent brings it back', () => {
    const away = { ...addElements(base(), [r]), camera: { x: 50_000, y: 50_000, zoom: 1 } };
    expect(contentOffscreen(away)).toBe(true);
    const back = scrollToContent(away);
    expect(contentOffscreen(back)).toBe(false);
    expect(back.camera.zoom).toBe(1);
  });
});

describe('view mode', () => {
  it('switches to the hand tool, clears selection, and restores select', () => {
    const r = createRectangle({ x: 0, y: 0, width: 10, height: 10 });
    const s = setSelection(addElements(base(), [r]), [r.id]);
    const on = setViewMode(s, true);
    expect(on.activeTool).toBe('hand');
    expect(on.selection).toEqual({});
    expect(setViewMode(on, true)).toBe(on);
    expect(setViewMode(on, false).activeTool).toBe('select');
  });

  it('refuses editing commands but allows view and file commands', () => {
    const on = setViewMode(base(), true);
    expect(commandAllowed(on, COMMANDS['edit.delete'])).toBe(false);
    expect(commandAllowed(on, COMMANDS['tool.rectangle'])).toBe(false);
    expect(commandAllowed(on, COMMANDS['zoom.in'])).toBe(true);
    expect(commandAllowed(on, COMMANDS['view.mode'])).toBe(true);
    expect(commandAllowed(on, COMMANDS['file.save'])).toBe(true);
    expect(commandAllowed(base(), COMMANDS['tool.rectangle'])).toBe(true);
  });
});

describe('tool lock', () => {
  function drawRect(locked: boolean): AppState {
    const initial = setTool(locked ? toggleToolLock(base()) : base(), 'rectangle');
    const h = harness(initial);
    const tool = new BoxShapeTool('rectangle');
    tool.onPointerDown(h.ctx, h.input({ x: 10, y: 10 }));
    tool.onPointerMove(h.ctx, h.input({ x: 80, y: 60 }));
    tool.onPointerUp(h.ctx, h.input({ x: 80, y: 60 }));
    return h.editor.getState();
  }

  it('returns to select after drawing unless locked', () => {
    expect(drawRect(false).activeTool).toBe('select');
    expect(drawRect(true).activeTool).toBe('rectangle');
    expect(drawRect(true).scene.order).toHaveLength(1);
  });
});

describe('HandTool', () => {
  it('pans by the drag delta without touching history', () => {
    const h = harness();
    const tool = new HandTool();
    tool.onPointerDown(h.ctx, h.input({ x: 100, y: 100 }));
    expect(tool.cursor).toBe('grabbing');
    tool.onPointerMove(h.ctx, h.input({ x: 140, y: 70 }));
    tool.onPointerUp(h.ctx, h.input({ x: 140, y: 70 }));
    const { camera } = h.editor.getState();
    expect(camera.x).toBeCloseTo(-40);
    expect(camera.y).toBeCloseTo(30);
    expect(tool.cursor).toBe('grab');
  });
});

describe('EraserTool', () => {
  const a = createRectangle({ x: 0, y: 0, width: 100, height: 100, style: filled });
  const b = createRectangle({ x: 300, y: 0, width: 100, height: 100, style: filled });

  it('marks elements along the stroke and deletes them on release in one step', () => {
    const h = harness(addElements(base(), [a, b]));
    const tool = new EraserTool();
    tool.onPointerDown(h.ctx, h.input({ x: 50, y: 50 }));
    tool.onPointerMove(h.ctx, h.input({ x: 350, y: 50 }));
    expect(h.editor.getState().overlay.erasing).toEqual([a.id, b.id]);
    tool.onPointerUp(h.ctx, h.input({ x: 350, y: 50 }));
    const s = h.editor.getState();
    expect(s.scene.order).toEqual([]);
    expect(s.overlay.erasing).toEqual([]);
    h.editor.undo();
    expect(h.editor.getState().scene.order).toEqual([a.id, b.id]);
  });

  it('cancel clears the marks and keeps the elements', () => {
    const h = harness(addElements(base(), [a]));
    const tool = new EraserTool();
    tool.onPointerDown(h.ctx, h.input({ x: 50, y: 50 }));
    tool.cancel(h.ctx);
    expect(h.editor.getState().overlay.erasing).toEqual([]);
    expect(h.editor.getState().scene.order).toEqual([a.id]);
  });
});

describe('darkColor', () => {
  it('matches invertLightness and is stable', () => {
    expect(darkColor('#000000')).toBe(invertLightness('#000000'));
    expect(darkColor('#1e1e1e')).toBe(darkColor('#1e1e1e'));
  });
});
