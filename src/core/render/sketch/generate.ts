import {
  arrowheadSize,
  cornerRadius,
  diamondVertices,
  freedrawOutline,
  strokePx,
} from '../../geometry/element-shape';
import type { Point } from '../../geometry/vec';
import type {
  ArrowElement,
  BoxElement,
  FreedrawElement,
  LinearElement,
  SceneElement,
  StrokePattern,
} from '../../model/types';
import { addArrowhead } from './arrowheads';
import { hatchLines } from './hatch';
import {
  ellipsePath,
  itemAt,
  ellipsePoints,
  loopLength,
  PathBuilder,
  polygonPath,
  resampleLoop,
  roundedPolygonPath,
  roundedPolygonPoints,
  smoothClosedPath,
  type PathCmd,
} from './path';
import { rngFor } from './rng';
import { amplitude, passesFor, sketchLoop, sketchPolyline, sketchSegment } from './strokes';

/** One paint operation in the element's local frame (origin at the unrotated top-left). */
export interface SketchLayer {
  readonly mode: 'stroke' | 'fill';
  readonly color: string;
  /** Stroke width in world units (0 for fills). */
  readonly width: number;
  /** Dash pattern in world units, or null for a solid stroke. */
  readonly dash: readonly number[] | null;
  readonly path: readonly PathCmd[];
}

/** Everything needed to paint an element, bottom layer first. Opacity is applied by the painter. */
export interface Drawable {
  readonly layers: readonly SketchLayer[];
}

// Independent random streams per purpose (see `rngFor`).
const STREAM_OUTLINE = 0;
const STREAM_FILL = 1;
const STREAM_HATCH = 2;
const STREAM_HEADS = 3;

/** Dash pattern for a stroke pattern at width `w`; dots rely on round caps. */
export function dashFor(pattern: StrokePattern, w: number): readonly number[] | null {
  switch (pattern) {
    case 'solid':
      return null;
    case 'dashed':
      return [4 * w + 4, 3 * w + 4];
    case 'dotted':
      return [0, 2 * w + 3];
  }
}

/** Hatch line width for an outline width. */
export function hatchWidth(stroke: number): number {
  return Math.max(1, stroke * 0.6);
}

/** Distance between hatch lines for a hatch width. */
export function hatchGap(hatchW: number): number {
  return 5 + 2.2 * hatchW;
}

/**
 * Generates the sketch for an element. Pure and deterministic: identical
 * seed + geometry + style give byte-identical commands.
 */
export function generateDrawable(el: SceneElement): Drawable {
  switch (el.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return boxDrawable(el);
    case 'line':
    case 'arrow':
      return linearDrawable(el);
    case 'freedraw':
      return freedrawDrawable(el);
    case 'text':
      // Text is painted directly from its layout, not from a sketch.
      return { layers: [] };
  }
}

interface BoxOutline {
  /** Corner vertices for sharp polygons; null for curved outlines. */
  readonly polygon: readonly Point[] | null;
  /** Evenly spaced closed outline, used for curved sketches and hatch clipping. */
  readonly loop: readonly Point[];
  readonly perimeter: number;
  readonly exact: (pb: PathBuilder) => void;
}

function boxOutline(el: BoxElement): BoxOutline {
  const w = el.width;
  const h = el.height;
  let dense: Point[];
  let polygon: readonly Point[] | null = null;
  let exact: (pb: PathBuilder) => void;
  if (el.type === 'ellipse') {
    dense = ellipsePoints(w / 2, h / 2, w / 2, h / 2);
    exact = (pb) => {
      ellipsePath(pb, w / 2, h / 2, w / 2, h / 2);
    };
  } else {
    const verts: readonly Point[] =
      el.type === 'rectangle'
        ? [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: h },
            { x: 0, y: h },
          ]
        : diamondVertices(w, h);
    const r = cornerRadius(el);
    if (r > 0) {
      dense = roundedPolygonPoints(verts, r);
      exact = (pb) => {
        roundedPolygonPath(pb, verts, r);
      };
    } else {
      polygon = verts;
      dense = [...verts];
      exact = (pb) => {
        polygonPath(pb, verts);
      };
    }
  }
  const perimeter = loopLength(dense);
  const n = Math.min(160, Math.max(24, Math.round(perimeter / 8)));
  return { polygon, loop: resampleLoop(dense, n), perimeter, exact };
}

function boxDrawable(el: BoxElement): Drawable {
  const { style, seed } = el;
  const w = strokePx(el);
  const outline = boxOutline(el);
  const layers: SketchLayer[] = [];
  const rough = style.roughness;
  const center = { x: el.width / 2, y: el.height / 2 };

  // --- Fill ---
  if (style.fillStyle === 'solid') {
    const pb = new PathBuilder();
    const rng = rngFor(seed, STREAM_FILL);
    if (rough === 0) outline.exact(pb);
    else if (outline.polygon) {
      const k = amplitude(rough, outline.perimeter / 4) * 0.5;
      polygonPath(
        pb,
        outline.polygon.map((p) => ({ x: p.x + rng.signed() * k, y: p.y + rng.signed() * k })),
      );
    } else sketchLoop(pb, outline.loop, amplitude(rough, outline.perimeter / 4) * 0.5, rng, true);
    layers.push({ mode: 'fill', color: style.fillColor, width: 0, dash: null, path: pb.cmds });
  } else if (style.fillStyle !== 'none') {
    const hw = hatchWidth(w);
    const gap = hatchGap(hw);
    const poly = outline.polygon ?? outline.loop;
    const angles = style.fillStyle === 'cross-hatch' ? [-Math.PI / 4, Math.PI / 4] : [-Math.PI / 4];
    const pb = new PathBuilder();
    angles.forEach((angle, set) => {
      for (const line of hatchLines(poly, angle, gap, w / 2 + hw / 2, center)) {
        if (rough === 0) {
          pb.moveTo(line.a);
          pb.lineTo(line.b);
        } else {
          const len = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
          const rng = rngFor(seed, STREAM_HATCH + set * 7919, line.index);
          sketchSegment(pb, line.a, line.b, amplitude(rough, len) * 0.6, rng, false);
        }
      }
    });
    if (pb.cmds.length > 0)
      layers.push({ mode: 'stroke', color: style.fillColor, width: hw, dash: null, path: pb.cmds });
  }

  // --- Outline ---
  const pb = new PathBuilder();
  const passes = passesFor(rough, style.strokePattern);
  const rng = rngFor(seed, STREAM_OUTLINE);
  if (rough === 0) outline.exact(pb);
  else if (outline.polygon) {
    const poly = outline.polygon;
    for (let pass = 0; pass < passes; pass++) {
      poly.forEach((a, i) => {
        const b = itemAt(poly, (i + 1) % poly.length);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        sketchSegment(pb, a, b, amplitude(rough, len), rng, true);
      });
    }
  } else {
    const k = amplitude(rough, outline.perimeter / 4);
    for (let pass = 0; pass < passes; pass++) sketchLoop(pb, outline.loop, k, rng, false);
  }
  layers.push({
    mode: 'stroke',
    color: style.strokeColor,
    width: w,
    dash: dashFor(style.strokePattern, w),
    path: pb.cmds,
  });
  return { layers };
}

function linearDrawable(el: LinearElement): Drawable {
  const { style, seed, points } = el;
  const w = strokePx(el);
  const rough = style.roughness;
  const passes = passesFor(rough, style.strokePattern);
  const pb = new PathBuilder();
  const first = points[0];
  if (first && points.length > 1) {
    if (rough === 0) {
      pb.moveTo(first);
      for (let i = 1; i < points.length; i++) pb.lineTo(itemAt(points, i));
    } else {
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const a = itemAt(points, i - 1);
        const b = itemAt(points, i);
        total += Math.hypot(b.x - a.x, b.y - a.y);
      }
      const k = amplitude(rough, total);
      const rng = rngFor(seed, STREAM_OUTLINE);
      for (let pass = 0; pass < passes; pass++) sketchPolyline(pb, points, k, rng);
    }
  }
  const layers: SketchLayer[] = [
    {
      mode: 'stroke',
      color: style.strokeColor,
      width: w,
      dash: dashFor(style.strokePattern, w),
      path: pb.cmds,
    },
  ];
  if (el.type === 'arrow') layers.push(...headLayers(el, w, passesFor(rough, 'solid')));
  return { layers };
}

function headLayers(el: ArrowElement, w: number, passes: number): SketchLayer[] {
  const pts = el.points;
  const n = pts.length;
  const p0 = pts[0];
  const p1 = pts[1];
  const pn = pts[n - 1];
  const pm = pts[n - 2];
  if (!p0 || !p1 || !pn || !pm) return [];
  const size = arrowheadSize(w);
  const out = { fill: new PathBuilder(), stroke: new PathBuilder() };
  const rough = el.style.roughness;
  addArrowhead(out, el.startHead, p0, p1, size, rough, passes, rngFor(el.seed, STREAM_HEADS, 0));
  addArrowhead(out, el.endHead, pn, pm, size, rough, passes, rngFor(el.seed, STREAM_HEADS, 1));
  const color = el.style.strokeColor;
  const layers: SketchLayer[] = [];
  if (out.fill.cmds.length > 0)
    layers.push({ mode: 'fill', color, width: 0, dash: null, path: out.fill.cmds });
  if (out.stroke.cmds.length > 0)
    layers.push({ mode: 'stroke', color, width: w, dash: null, path: out.stroke.cmds });
  return layers;
}

/** Freedraw keeps its pressure outline; roughness and stroke pattern do not apply. */
function freedrawDrawable(el: FreedrawElement): Drawable {
  const outline = freedrawOutline(el);
  const pb = new PathBuilder();
  const first = outline[0];
  if (outline.length >= 2) smoothClosedPath(pb, outline);
  else if (first) ellipsePath(pb, first.x, first.y, 0.5, 0.5);
  return {
    layers: [{ mode: 'fill', color: el.style.strokeColor, width: 0, dash: null, path: pb.cmds }],
  };
}
