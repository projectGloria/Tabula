import { boxIntersects, type Box } from '../geometry/box';
import type { Point } from '../geometry/vec';
import type { SpatialIndex } from './spatial-index';

interface CellRange {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface GridIndexOptions {
  /** Cell edge length in world units. */
  readonly cellSize?: number;
  /** Items covering more cells than this go to an "oversized" list scanned linearly. */
  readonly maxCellsPerItem?: number;
}

/**
 * Uniform-grid spatial hash. Each item is registered in every cell its AABB
 * overlaps; huge items are kept in a separate list so they never flood the grid.
 */
export class GridIndex<K> implements SpatialIndex<K> {
  readonly cellSize: number;
  private readonly maxCellsPerItem: number;
  private readonly cells = new Map<string, Set<K>>();
  private readonly boxes = new Map<K, Box>();
  private readonly ranges = new Map<K, CellRange>();
  private readonly oversized = new Set<K>();
  private cachedBounds: Box | null = null;
  private boundsDirty = false;

  constructor(options: GridIndexOptions = {}) {
    this.cellSize = options.cellSize ?? 256;
    this.maxCellsPerItem = options.maxCellsPerItem ?? 256;
  }

  get size(): number {
    return this.boxes.size;
  }

  has(key: K): boolean {
    return this.boxes.has(key);
  }

  getBox(key: K): Box | undefined {
    return this.boxes.get(key);
  }

  /** Number of non-empty grid cells (debug only). */
  get cellCount(): number {
    return this.cells.size;
  }

  set(key: K, box: Box): void {
    const prevRange = this.ranges.get(key);
    const nextRange = this.rangeOf(box);
    const wasOversized = this.oversized.has(key);
    const isOversized = this.cellsIn(nextRange) > this.maxCellsPerItem;

    if (this.boxes.has(key)) {
      const sameCells =
        prevRange !== undefined &&
        wasOversized === isOversized &&
        prevRange.x0 === nextRange.x0 &&
        prevRange.y0 === nextRange.y0 &&
        prevRange.x1 === nextRange.x1 &&
        prevRange.y1 === nextRange.y1;
      if (!sameCells) this.unregister(key);
      this.boxes.set(key, box);
      this.boundsDirty = true;
      if (sameCells) return;
    } else {
      this.boxes.set(key, box);
      this.boundsDirty = true;
    }

    this.ranges.set(key, nextRange);
    if (isOversized) {
      this.oversized.add(key);
      return;
    }
    for (let cx = nextRange.x0; cx <= nextRange.x1; cx++) {
      for (let cy = nextRange.y0; cy <= nextRange.y1; cy++) {
        const id = cellKey(cx, cy);
        let cell = this.cells.get(id);
        if (!cell) {
          cell = new Set();
          this.cells.set(id, cell);
        }
        cell.add(key);
      }
    }
  }

  remove(key: K): void {
    if (!this.boxes.has(key)) return;
    this.unregister(key);
    this.boxes.delete(key);
    this.boundsDirty = true;
  }

  queryBox(box: Box): Set<K> {
    const out = new Set<K>();
    const range = this.rangeOf(box);
    if (this.cellsIn(range) > this.boxes.size) {
      // Cheaper to scan every item than to walk mostly-empty cells.
      for (const [key, b] of this.boxes) if (boxIntersects(b, box)) out.add(key);
      return out;
    }
    for (let cx = range.x0; cx <= range.x1; cx++) {
      for (let cy = range.y0; cy <= range.y1; cy++) {
        const cell = this.cells.get(cellKey(cx, cy));
        if (!cell) continue;
        for (const key of cell) {
          if (out.has(key)) continue;
          const b = this.boxes.get(key);
          if (b && boxIntersects(b, box)) out.add(key);
        }
      }
    }
    for (const key of this.oversized) {
      const b = this.boxes.get(key);
      if (b && boxIntersects(b, box)) out.add(key);
    }
    return out;
  }

  queryPoint(p: Point, radius = 0): Set<K> {
    return this.queryBox({
      minX: p.x - radius,
      minY: p.y - radius,
      maxX: p.x + radius,
      maxY: p.y + radius,
    });
  }

  bounds(): Box | null {
    if (!this.boundsDirty) return this.cachedBounds;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of this.boxes.values()) {
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    this.cachedBounds = this.boxes.size === 0 ? null : { minX, minY, maxX, maxY };
    this.boundsDirty = false;
    return this.cachedBounds;
  }

  clear(): void {
    this.cells.clear();
    this.boxes.clear();
    this.ranges.clear();
    this.oversized.clear();
    this.cachedBounds = null;
    this.boundsDirty = false;
  }

  private unregister(key: K): void {
    const range = this.ranges.get(key);
    this.ranges.delete(key);
    if (this.oversized.delete(key) || !range) return;
    for (let cx = range.x0; cx <= range.x1; cx++) {
      for (let cy = range.y0; cy <= range.y1; cy++) {
        const id = cellKey(cx, cy);
        const cell = this.cells.get(id);
        if (!cell) continue;
        cell.delete(key);
        if (cell.size === 0) this.cells.delete(id);
      }
    }
  }

  private rangeOf(box: Box): CellRange {
    const s = this.cellSize;
    return {
      x0: Math.floor(box.minX / s),
      y0: Math.floor(box.minY / s),
      x1: Math.floor(box.maxX / s),
      y1: Math.floor(box.maxY / s),
    };
  }

  private cellsIn(r: CellRange): number {
    return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  }
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}
