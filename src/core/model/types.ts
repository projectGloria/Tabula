/** Unique element identifier (UUID v4). */
export type ElementId = string & { readonly __brand: 'ElementId' };
/** Group identifier; elements list the groups they belong to, innermost first. */
export type GroupId = string & { readonly __brand: 'GroupId' };

export type FillStyle = 'none' | 'solid' | 'hatch' | 'cross-hatch';
export type StrokeWidth = 'thin' | 'medium' | 'bold' | 'extra';
export type StrokePattern = 'solid' | 'dashed' | 'dotted';
/** 0 = clean, 1 = sketch, 2 = loose. */
export type Roughness = 0 | 1 | 2;
export type Corners = 'sharp' | 'rounded';

export interface ElementStyle {
  readonly strokeColor: string;
  readonly fillColor: string;
  readonly fillStyle: FillStyle;
  readonly strokeWidth: StrokeWidth;
  readonly strokePattern: StrokePattern;
  readonly roughness: Roughness;
  /** 0–100. */
  readonly opacity: number;
  readonly corners: Corners;
}

/**
 * Fields shared by every element.
 *
 * Geometry invariants (world units; 1 unit = 1 CSS px at 100% zoom):
 * - `x`/`y` is the top-left corner of the *unrotated* box.
 * - `width`/`height` are >= 0 once a gesture commits.
 * - `angle` is in radians, clockwise (y-down), around the box center.
 * - Every mutation produces a new object with `revision + 1`.
 */
export interface BaseElement {
  readonly id: ElementId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly style: ElementStyle;
  /** Deterministic PRNG seed for the sketch renderer. */
  readonly seed: number;
  readonly groupIds: readonly GroupId[];
  readonly locked: boolean;
  /** Local render-cache invalidation counter. */
  readonly revision: number;
}

export interface RectangleElement extends BaseElement {
  readonly type: 'rectangle';
}

export interface DiamondElement extends BaseElement {
  readonly type: 'diamond';
}

export interface EllipseElement extends BaseElement {
  readonly type: 'ellipse';
}

/** A point relative to an element's `x`/`y`, in its unrotated frame. */
export interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Point-based elements. `points` are local: the bounding box of the points
 * starts at (0, 0) and spans `width` × `height`.
 */
interface PointsElementBase extends BaseElement {
  readonly points: readonly LocalPoint[];
}

export interface LineElement extends PointsElementBase {
  readonly type: 'line';
}

export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'bar' | 'dot' | 'diamond';

export interface ArrowElement extends PointsElementBase {
  readonly type: 'arrow';
  readonly startHead: Arrowhead;
  readonly endHead: Arrowhead;
}

export interface FreedrawElement extends PointsElementBase {
  readonly type: 'freedraw';
  /** Per-point pressure in 0–1, parallel to `points` (simulated for mouse/touch). */
  readonly pressures: readonly number[];
}

export type BoxElement = RectangleElement | DiamondElement | EllipseElement;
export type LinearElement = LineElement | ArrowElement;
export type PointsElement = LinearElement | FreedrawElement;
export type SceneElement = BoxElement | PointsElement;
export type ElementType = SceneElement['type'];
export type BoxElementType = BoxElement['type'];
export type LinearElementType = LinearElement['type'];

export interface Scene {
  readonly entities: Readonly<Record<ElementId, SceneElement>>;
  /** Bottom-to-top render order. */
  readonly order: readonly ElementId[];
}
