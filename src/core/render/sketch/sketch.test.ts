import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '../../geometry/segment';
import { createArrow, createBoxElement, mutateElement } from '../../model/scene';
import { DEFAULT_STYLE } from '../../model/style';
import type { ElementStyle, Scene, SceneElement } from '../../model/types';
import { SketchCache } from './cache';
import { generateDrawable } from './generate';
import { hatchLines } from './hatch';
import { createRng } from './rng';

const rect = (style: Partial<ElementStyle> = {}) =>
  createBoxElement('rectangle', {
    x: 10,
    y: 20,
    width: 200,
    height: 120,
    style: { ...DEFAULT_STYLE, ...style },
  });

const outlineOf = (el: SceneElement) => {
  const layers = generateDrawable(el).layers;
  const last = layers[layers.length - 1];
  if (!last) throw new Error('no layers');
  return last;
};

describe('rng', () => {
  it('is deterministic per seed and stays in range', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 50 }, () => c.next())).not.toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('generateDrawable', () => {
  it('is deterministic for the same element and varies with the seed', () => {
    for (const roughness of [1, 2] as const) {
      const el = rect({ roughness, fillStyle: 'cross-hatch', fillColor: '#c4e6d4' });
      expect(generateDrawable(el)).toEqual(generateDrawable({ ...el }));
      expect(generateDrawable({ ...el, seed: el.seed + 1 })).not.toEqual(generateDrawable(el));
    }
  });

  it('keeps the outline unchanged when only the fill changes', () => {
    const base = rect({ roughness: 2 });
    const outline = outlineOf(base);
    for (const fillStyle of ['solid', 'hatch', 'cross-hatch'] as const) {
      const filled = { ...base, style: { ...base.style, fillStyle } };
      expect(outlineOf(filled)).toEqual(outline);
    }
  });

  it('draws exact geometry at roughness 0', () => {
    const el = rect({ roughness: 0 });
    const layers = generateDrawable(el).layers;
    expect(layers).toHaveLength(1);
    expect(layers[0]?.path).toEqual([
      ['M', 0, 0],
      ['L', 200, 0],
      ['L', 200, 120],
      ['L', 0, 120],
      ['Z'],
    ]);
  });

  it('orders fill below outline and uses the fill color for hatches', () => {
    const el = rect({ fillStyle: 'hatch', fillColor: '#f3cfc6' });
    const [fill, outline] = generateDrawable(el).layers;
    expect(fill?.mode).toBe('stroke');
    expect(fill?.color).toBe('#f3cfc6');
    expect(outline?.color).toBe(DEFAULT_STYLE.strokeColor);
  });

  it('draws two passes for sketchy solid strokes and one for patterned', () => {
    const moves = (el: SceneElement) => outlineOf(el).path.filter((c) => c[0] === 'M').length;
    expect(moves(rect())).toBe(8);
    expect(moves(rect({ strokePattern: 'dashed' }))).toBe(4);
    expect(outlineOf(rect({ strokePattern: 'dashed' })).dash).not.toBeNull();
  });

  it('adds arrowhead layers only for configured heads', () => {
    const base = createArrow({ x: 0, y: 0, style: DEFAULT_STYLE });
    const arrow = mutateElement(base, {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 40 },
      ],
    });
    expect(generateDrawable({ ...arrow, startHead: 'none', endHead: 'none' }).layers).toHaveLength(
      1,
    );
    // triangle: exact fill + sketched outline.
    expect(generateDrawable({ ...arrow, endHead: 'triangle' }).layers).toHaveLength(3);
  });
});

describe('hatchLines', () => {
  it('keeps every line inside the polygon', () => {
    const diamond = [
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ];
    const lines = hatchLines(diamond, -Math.PI / 4, 8, 2, { x: 50, y: 50 });
    expect(lines.length).toBeGreaterThan(5);
    for (const { a, b } of lines) {
      expect(pointInPolygon(a, diamond)).toBe(true);
      expect(pointInPolygon(b, diamond)).toBe(true);
      expect(pointInPolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, diamond)).toBe(true);
    }
  });
});

describe('SketchCache', () => {
  const sceneOf = (...els: SceneElement[]): Scene => ({
    entities: Object.fromEntries(els.map((e) => [e.id, e])),
    order: els.map((e) => e.id),
  });

  it('reuses the sketch on move and regenerates on style or size change', () => {
    const cache = new SketchCache();
    const el = rect();
    const first = cache.get(el).drawable;
    expect(cache.get(el).drawable).toBe(first);

    const moved = mutateElement(el, { x: 500, y: -40, angle: 1 });
    expect(cache.get(moved).drawable).toBe(first);
    expect(cache.reused).toBe(1);

    const restyled = mutateElement(moved, { style: { ...moved.style, roughness: 2 } });
    expect(cache.get(restyled).drawable).not.toBe(first);
    const resized = mutateElement(restyled, { width: 300 });
    cache.get(resized);
    expect(cache.generated).toBe(3);
  });

  it('prunes entries for removed elements once the cache outgrows the scene', () => {
    const cache = new SketchCache();
    const a = rect();
    cache.get(a);
    cache.get(rect());
    cache.prune(sceneOf(a));
    expect(cache.size).toBe(2); // small leftovers are kept
    for (let i = 0; i < 80; i++) cache.get(rect());
    cache.prune(sceneOf(a));
    expect(cache.size).toBe(1);
  });
});
