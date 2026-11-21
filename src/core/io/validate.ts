import { normalizeHex } from '../model/palette';
import { DEFAULT_STYLE } from '../model/style';
import type {
  Arrowhead,
  Corners,
  ElementId,
  ElementStyle,
  FillStyle,
  GroupId,
  LinearCurve,
  LocalPoint,
  PointBinding,
  Roughness,
  FontFamily,
  SceneElement,
  StrokePattern,
  StrokeWidth,
  TextAlign,
  TextSizing,
  VerticalAlign,
} from '../model/types';
import { clampFontSize, DEFAULT_FONT_SIZE } from '../text/fonts';
import { isFileId } from './image-files';

/*
 * Defensive parsing of untrusted element data (clipboard, files). Anything
 * malformed is dropped or replaced with a safe default; nothing from the
 * input is trusted to be the right type.
 */

/** Hard limits so hostile input cannot exhaust memory. */
export const MAX_POINTS = 50_000;
export const MAX_GROUP_DEPTH = 32;
export const MAX_COORD = 1e7;
export const MAX_TEXT_CHARS = 100_000;

const FAMILIES: readonly FontFamily[] = ['hand', 'sans', 'mono'];
const ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];
const VALIGNS: readonly VerticalAlign[] = ['top', 'middle', 'bottom'];
const SIZINGS: readonly TextSizing[] = ['auto', 'fixed'];
const CURVES: readonly LinearCurve[] = ['straight', 'curved'];

/** A binding with a string target id and an anchor clamped to the target box. */
function binding(raw: unknown, self: string): PointBinding | null {
  if (!isRecord(raw) || !isRecord(raw.anchor)) return null;
  const elementId = str(raw.elementId, 64);
  if (elementId === null || elementId === self) return null;
  const clamp = (v: unknown): number => Math.min(1, Math.max(0, finite(v, 0.5)));
  return {
    elementId: elementId as ElementId,
    anchor: { x: clamp(raw.anchor.x), y: clamp(raw.anchor.y) },
  };
}

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function finite(v: unknown, fallback: number, limit = MAX_COORD): number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit ? v : fallback;
}

function oneOf<T extends string | number>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
}

const FILLS: readonly FillStyle[] = ['none', 'solid', 'hatch', 'cross-hatch'];
const WIDTHS: readonly StrokeWidth[] = ['thin', 'medium', 'bold', 'extra'];
const PATTERNS: readonly StrokePattern[] = ['solid', 'dashed', 'dotted'];
const ROUGHNESS: readonly Roughness[] = [0, 1, 2];
const CORNERS: readonly Corners[] = ['sharp', 'rounded'];
export const ARROWHEADS: readonly Arrowhead[] = [
  'none',
  'arrow',
  'triangle',
  'bar',
  'dot',
  'diamond',
];

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' ? (normalizeHex(v) ?? fallback) : fallback;
}

export function sanitizeStyle(raw: unknown): ElementStyle {
  const s = isRecord(raw) ? raw : {};
  const d = DEFAULT_STYLE;
  return {
    strokeColor: color(s.strokeColor, d.strokeColor),
    fillColor: color(s.fillColor, d.fillColor),
    fillStyle: oneOf(s.fillStyle, FILLS, d.fillStyle),
    strokeWidth: oneOf(s.strokeWidth, WIDTHS, d.strokeWidth),
    strokePattern: oneOf(s.strokePattern, PATTERNS, d.strokePattern),
    roughness: oneOf(s.roughness, ROUGHNESS, d.roughness),
    opacity: Math.round(Math.min(100, Math.max(0, finite(s.opacity, d.opacity)))),
    corners: oneOf(s.corners, CORNERS, d.corners),
  };
}

function points(raw: unknown): LocalPoint[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_POINTS) return null;
  const out: LocalPoint[] = [];
  for (const p of raw as unknown[]) {
    if (!isRecord(p)) return null;
    const x = finite(p.x, NaN);
    const y = finite(p.y, NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    out.push({ x, y });
  }
  return out;
}

function groupIds(raw: unknown): GroupId[] {
  if (!Array.isArray(raw)) return [];
  const out: GroupId[] = [];
  for (const g of (raw as unknown[]).slice(0, MAX_GROUP_DEPTH)) {
    const id = str(g, 64);
    if (id !== null && !out.includes(id as GroupId)) out.push(id as GroupId);
  }
  return out;
}

export interface BaseFields {
  readonly id: ElementId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly style: ElementStyle;
  readonly seed: number;
  readonly groupIds: readonly GroupId[];
  readonly locked: boolean;
  readonly revision: number;
}

/** Parses one element; returns null when it cannot be made valid. */
export function sanitizeElement(raw: unknown): SceneElement | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id, 64);
  if (id === null) return null;
  const base: BaseFields = {
    id: id as ElementId,
    x: finite(raw.x, 0),
    y: finite(raw.y, 0),
    width: Math.abs(finite(raw.width, 0)),
    height: Math.abs(finite(raw.height, 0)),
    angle: finite(raw.angle, 0, 1e3) % (Math.PI * 2),
    style: sanitizeStyle(raw.style),
    seed: Math.floor(Math.abs(finite(raw.seed, 1, 2 ** 32))) || 1,
    groupIds: groupIds(raw.groupIds),
    locked: raw.locked === true,
    revision: 0,
  };
  switch (raw.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return { ...base, type: raw.type };
    case 'line': {
      const pts = points(raw.points);
      if (!pts) return null;
      return { ...base, type: 'line', points: pts, curve: oneOf(raw.curve, CURVES, 'straight') };
    }
    case 'arrow': {
      const pts = points(raw.points);
      if (!pts) return null;
      return {
        ...base,
        type: 'arrow',
        points: pts,
        curve: oneOf(raw.curve, CURVES, 'straight'),
        startHead: oneOf(raw.startHead, ARROWHEADS, 'none'),
        endHead: oneOf(raw.endHead, ARROWHEADS, 'arrow'),
        startBinding: binding(raw.startBinding, id),
        endBinding: binding(raw.endBinding, id),
      };
    }
    case 'freedraw': {
      const pts = points(raw.points);
      if (!pts) return null;
      const pr = Array.isArray(raw.pressures) ? (raw.pressures as unknown[]) : [];
      const pressures = pts.map((_, i) => Math.min(1, Math.max(0, finite(pr[i], 0.5))));
      return { ...base, type: 'freedraw', points: pts, pressures };
    }
    case 'text': {
      const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_TEXT_CHARS) : '';
      const containerId = str(raw.containerId, 64);
      return {
        ...base,
        type: 'text',
        text,
        fontFamily: oneOf(raw.fontFamily, FAMILIES, 'hand'),
        fontSize: clampFontSize(finite(raw.fontSize, DEFAULT_FONT_SIZE)),
        textAlign: oneOf(raw.textAlign, ALIGNS, 'left'),
        verticalAlign: oneOf(raw.verticalAlign, VALIGNS, 'middle'),
        sizing: oneOf(raw.sizing, SIZINGS, 'auto'),
        containerId: containerId === null ? null : (containerId as ElementId),
      };
    }
    case 'image': {
      if (!isFileId(raw.fileId)) return null;
      return { ...base, type: 'image', fileId: raw.fileId };
    }
    default:
      return null;
  }
}

/** Parses a list of elements, dropping invalid entries and duplicate ids. */
export function sanitizeElements(raw: unknown): SceneElement[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SceneElement[] = [];
  for (const r of raw as unknown[]) {
    const el = sanitizeElement(r);
    if (el && !seen.has(el.id)) {
      seen.add(el.id);
      out.push(el);
    }
  }
  return out;
}
