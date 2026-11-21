import { describe, expect, it } from 'vitest';
import { addElements, setSelection } from '../actions/actions';
import { pointsPatchFromWorld } from '../geometry/element-geometry';
import {
  createArrow,
  createBoxElement,
  createFreedraw,
  createLine,
  mutateElement,
} from '../model/scene';
import { DEFAULT_STYLE } from '../model/style';
import type { SceneElement } from '../model/types';
import { createInitialState, type AppState } from '../store/app-state';
import {
  getSelectionFrame,
  getSelectionHandles,
  hitHandle,
  insideSelectionFrame,
  resizeCursor,
} from './handles';
import { hitTestElement } from './hit-test';

const filled = { ...DEFAULT_STYLE, fillStyle: 'solid' as const };

function withSelected(...els: SceneElement[]): AppState {
  let s = addElements(createInitialState(), els);
  s = setSelection(
    s,
    els.map((e) => e.id),
  );
  return s;
}

const line = (pts: { x: number; y: number }[], type: 'line' | 'arrow' = 'line') =>
  mutateElement(
    type === 'line' ? createLine({ x: 0, y: 0 }) : createArrow({ x: 0, y: 0 }),
    pointsPatchFromWorld(0, pts),
  );

describe('hitTestElement per type', () => {
  it('diamond: edges when unfilled, interior when filled', () => {
    const d = createBoxElement('diamond', { x: 0, y: 0, width: 100, height: 100 });
    expect(hitTestElement(d, { x: 25, y: 25 }, 4)).toBe(true);
    expect(hitTestElement(d, { x: 50, y: 50 }, 4)).toBe(false);
    expect(hitTestElement(d, { x: 5, y: 5 }, 4)).toBe(false); // bbox corner, outside the diamond
    const f = createBoxElement('diamond', { x: 0, y: 0, width: 100, height: 100, style: filled });
    expect(hitTestElement(f, { x: 50, y: 50 }, 4)).toBe(true);
  });

  it('ellipse: outline when unfilled, interior when filled', () => {
    const e = createBoxElement('ellipse', { x: 0, y: 0, width: 200, height: 100 });
    expect(hitTestElement(e, { x: 200, y: 50 }, 4)).toBe(true);
    expect(hitTestElement(e, { x: 100, y: 50 }, 4)).toBe(false);
    expect(hitTestElement(e, { x: 5, y: 5 }, 4)).toBe(false);
    const f = createBoxElement('ellipse', { x: 0, y: 0, width: 200, height: 100, style: filled });
    expect(hitTestElement(f, { x: 100, y: 50 }, 4)).toBe(true);
  });

  it('respects rotation', () => {
    const e = {
      ...createBoxElement('ellipse', { x: 0, y: 0, width: 200, height: 40, style: filled }),
      angle: Math.PI / 2,
    };
    expect(hitTestElement(e, { x: 100, y: 100 }, 1)).toBe(true);
    expect(hitTestElement(e, { x: 190, y: 20 }, 1)).toBe(false);
  });

  it('line: near the polyline only', () => {
    const l = line([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(hitTestElement(l, { x: 50, y: 3 }, 4)).toBe(true);
    expect(hitTestElement(l, { x: 103, y: 50 }, 4)).toBe(true);
    expect(hitTestElement(l, { x: 50, y: 50 }, 4)).toBe(false);
  });

  it('freedraw: on the stroke', () => {
    const fd = mutateElement(createFreedraw({ x: 0, y: 0 }), {
      width: 100,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      pressures: [0.5, 0.5, 0.5],
    });
    expect(hitTestElement(fd, { x: 50, y: 2 }, 4)).toBe(true);
    expect(hitTestElement(fd, { x: 50, y: 30 }, 4)).toBe(false);
  });
});

describe('selection handles', () => {
  it('lays out rotate + 4 corners + 4 edges for a box', () => {
    const r = createBoxElement('rectangle', { x: 100, y: 100, width: 200, height: 100 });
    const hs = getSelectionHandles(withSelected(r));
    expect(hs.map((h) => (h.kind.type === 'resize' ? h.kind.handle : h.kind.type))).toEqual([
      'rotate',
      'nw',
      'ne',
      'se',
      'sw',
      'n',
      'e',
      's',
      'w',
    ]);
    const se = hs.find((h) => h.kind.type === 'resize' && h.kind.handle === 'se');
    expect(se?.anchor).toEqual({ x: 300, y: 200 });
    expect(se?.center).toEqual({ x: 304, y: 204 }); // padded outline
  });

  it('hides edge handles on small frames', () => {
    const r = createBoxElement('rectangle', { x: 0, y: 0, width: 10, height: 10 });
    const hs = getSelectionHandles(withSelected(r));
    expect(hs).toHaveLength(5);
  });

  it('gives a 2-point line endpoint handles only', () => {
    const l = line([
      { x: 10, y: 10 },
      { x: 110, y: 60 },
    ]);
    const hs = getSelectionHandles(withSelected(l));
    expect(hs.map((h) => h.kind)).toEqual([
      { type: 'endpoint', index: 0 },
      { type: 'endpoint', index: 1 },
    ]);
    expect(hs[1]?.anchor).toEqual({ x: 110, y: 60 });
  });

  it('frames a multi-selection with its union box', () => {
    const a = createBoxElement('rectangle', { x: 0, y: 0, width: 10, height: 10 });
    const b = createBoxElement('ellipse', { x: 50, y: 40, width: 10, height: 10 });
    const f = getSelectionFrame(withSelected(a, b));
    expect(f?.single).toBeNull();
    expect(f?.rect).toEqual({ x: 0, y: 0, width: 60, height: 50, angle: 0 });
  });

  it('picks handles within the slop and prefers higher priority', () => {
    const r = createBoxElement('rectangle', { x: 100, y: 100, width: 200, height: 100 });
    const s = withSelected(r);
    expect(hitHandle(s, { x: 306, y: 206 })?.kind).toEqual({ type: 'resize', handle: 'se' });
    expect(hitHandle(s, { x: 200, y: 72 })?.kind).toEqual({ type: 'rotate' });
    expect(hitHandle(s, { x: 200, y: 150 })).toBeUndefined();
    expect(insideSelectionFrame(s, { x: 200, y: 150 })).toBe(true);
    expect(insideSelectionFrame(s, { x: 400, y: 150 })).toBe(false);
  });

  it('turns resize cursors with the frame angle', () => {
    expect(resizeCursor('e', 0)).toBe('ew-resize');
    expect(resizeCursor('se', 0)).toBe('nwse-resize');
    expect(resizeCursor('ne', 0)).toBe('nesw-resize');
    expect(resizeCursor('e', Math.PI / 2)).toBe('ns-resize');
    expect(resizeCursor('e', Math.PI / 4)).toBe('nwse-resize');
  });
});
