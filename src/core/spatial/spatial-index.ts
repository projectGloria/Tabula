import type { Box } from '../geometry/box';
import type { Point } from '../geometry/vec';

/** Broad-phase spatial index over AABBs. Query results are unordered candidates. */
export interface SpatialIndex<K> {
  readonly size: number;
  /** Inserts or replaces the box for `key`. */
  set(key: K, box: Box): void;
  remove(key: K): void;
  has(key: K): boolean;
  getBox(key: K): Box | undefined;
  /** All keys whose box intersects `box` (inclusive). */
  queryBox(box: Box): Set<K>;
  /** All keys whose box contains `p` expanded by `radius`. */
  queryPoint(p: Point, radius?: number): Set<K>;
  /** Union of all boxes, or null when empty. */
  bounds(): Box | null;
  clear(): void;
}
