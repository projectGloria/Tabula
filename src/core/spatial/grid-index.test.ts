import { describe, expect, it } from 'vitest';
import { boxFromRect, boxIntersects, type Box } from '../geometry/box';
import { GridIndex } from './grid-index';

/** Small deterministic PRNG so the randomized test is reproducible. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sorted = (s: Iterable<number>) => [...s].sort((a, b) => a - b);

describe('GridIndex', () => {
  it('inserts, queries, updates and removes', () => {
    const idx = new GridIndex<string>({ cellSize: 100 });
    idx.set('a', boxFromRect(0, 0, 50, 50));
    idx.set('b', boxFromRect(500, 500, 50, 50));
    expect(idx.size).toBe(2);
    expect([...idx.queryBox(boxFromRect(-10, -10, 20, 20))]).toEqual(['a']);

    idx.set('a', boxFromRect(480, 480, 10, 10));
    expect(idx.queryBox(boxFromRect(-10, -10, 20, 20)).size).toBe(0);
    expect(
      sorted([...idx.queryBox(boxFromRect(470, 470, 100, 100))].map((k) => k.charCodeAt(0))),
    ).toEqual([97, 98]);

    idx.remove('b');
    expect(idx.has('b')).toBe(false);
    expect([...idx.queryPoint({ x: 485, y: 485 })]).toEqual(['a']);
  });

  it('handles negative coordinates across cell boundaries', () => {
    const idx = new GridIndex<number>({ cellSize: 64 });
    idx.set(1, boxFromRect(-70, -70, 20, 20));
    expect([...idx.queryPoint({ x: -60, y: -60 })]).toEqual([1]);
    expect(idx.queryPoint({ x: -10, y: -10 }).size).toBe(0);
  });

  it('keeps huge items in the oversized list and still finds them', () => {
    const idx = new GridIndex<number>({ cellSize: 10, maxCellsPerItem: 4 });
    idx.set(1, boxFromRect(0, 0, 10_000, 10_000));
    expect(idx.cellCount).toBe(0);
    expect([...idx.queryPoint({ x: 5000, y: 5000 })]).toEqual([1]);
    idx.set(1, boxFromRect(0, 0, 5, 5));
    expect(idx.cellCount).toBe(1);
    idx.remove(1);
    expect(idx.cellCount).toBe(0);
  });

  it('tracks overall bounds', () => {
    const idx = new GridIndex<number>();
    expect(idx.bounds()).toBeNull();
    idx.set(1, boxFromRect(0, 0, 10, 10));
    idx.set(2, boxFromRect(-5, 20, 10, 10));
    expect(idx.bounds()).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 30 });
    idx.remove(2);
    expect(idx.bounds()).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    idx.clear();
    expect(idx.bounds()).toBeNull();
  });

  it('matches a brute-force scan on random data', () => {
    const rand = mulberry(42);
    const idx = new GridIndex<number>({ cellSize: 128 });
    const boxes = new Map<number, Box>();
    const randomBox = (): Box =>
      boxFromRect(rand() * 4000 - 2000, rand() * 4000 - 2000, rand() * 600, rand() * 600);

    for (let i = 0; i < 500; i++) {
      const b = randomBox();
      boxes.set(i, b);
      idx.set(i, b);
    }
    // Mutate: move some, remove some.
    for (let i = 0; i < 150; i++) {
      const k = Math.floor(rand() * 500);
      if (rand() < 0.5) {
        boxes.delete(k);
        idx.remove(k);
      } else {
        const b = randomBox();
        boxes.set(k, b);
        idx.set(k, b);
      }
    }
    for (let q = 0; q < 100; q++) {
      const query = randomBox();
      const expected = [...boxes].filter(([, b]) => boxIntersects(b, query)).map(([k]) => k);
      expect(sorted(idx.queryBox(query))).toEqual(sorted(expected));
    }
    // A query far larger than the item count exercises the linear-scan path.
    const huge = boxFromRect(-1e6, -1e6, 2e6, 2e6);
    expect(idx.queryBox(huge).size).toBe(boxes.size);
  });
});
