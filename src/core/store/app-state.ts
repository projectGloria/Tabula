import { DEFAULT_CAMERA, type Camera, type Viewport } from '../camera/camera';
import { EMPTY_SCENE } from '../model/scene';
import { DEFAULT_STYLE } from '../model/style';
import type { Box } from '../geometry/box';
import type { Arrowhead, ElementId, ElementStyle, GroupId, Scene } from '../model/types';

export type ToolId = 'select' | 'rectangle' | 'diamond' | 'ellipse' | 'line' | 'arrow' | 'freedraw';

export type Selection = Readonly<Partial<Record<ElementId, true>>>;

export interface AppState {
  readonly scene: Scene;
  readonly camera: Camera;
  /** Viewport size in CSS pixels. */
  readonly viewport: Viewport;
  readonly selection: Selection;
  readonly activeTool: ToolId;
  readonly background: string;
  /** Dev debug overlay visibility. */
  readonly debug: boolean;
  readonly styleMemory: StyleMemory;
  /** Custom colors picked this session, most recent first (palette colors excluded). */
  readonly recentColors: readonly string[];
  /** Group the user has entered by double-click; clicks select inside it. */
  readonly focusGroup: GroupId | null;
  /** Transient overlay chrome drawn by tools (marquee, guides, highlights). */
  readonly overlay: OverlayState;
}

export interface OverlayState {
  /** Marquee rectangle in world units. */
  readonly marquee: Box | null;
}

export const EMPTY_OVERLAY: OverlayState = { marquee: null };

/** Tools sharing one remembered style: shapes, lines and arrows, freedraw. */
export type StyleCategory = 'shape' | 'linear' | 'freedraw';

export interface ArrowHeads {
  readonly start: Arrowhead;
  readonly end: Arrowhead;
}

/** Last-used style per tool category, applied to newly created elements. */
export interface StyleMemory {
  readonly shape: ElementStyle;
  readonly linear: ElementStyle;
  readonly freedraw: ElementStyle;
  readonly arrowHeads: ArrowHeads;
}

export const DEFAULT_STYLE_MEMORY: StyleMemory = {
  shape: DEFAULT_STYLE,
  linear: DEFAULT_STYLE,
  freedraw: DEFAULT_STYLE,
  arrowHeads: { start: 'none', end: 'arrow' },
};

export const EMPTY_SELECTION: Selection = {};

export function createInitialState(overrides: Partial<AppState> = {}): AppState {
  return {
    scene: EMPTY_SCENE,
    camera: DEFAULT_CAMERA,
    viewport: { width: 0, height: 0 },
    selection: EMPTY_SELECTION,
    activeTool: 'select',
    background: '#fbfaf6',
    debug: false,
    styleMemory: DEFAULT_STYLE_MEMORY,
    recentColors: [],
    focusGroup: null,
    overlay: EMPTY_OVERLAY,
    ...overrides,
  };
}

export function selectedIds(state: AppState): ElementId[] {
  const out: ElementId[] = [];
  for (const id of state.scene.order) if (state.selection[id]) out.push(id);
  return out;
}

export function isSelected(state: AppState, id: ElementId): boolean {
  return state.selection[id] === true;
}
