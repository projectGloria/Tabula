import { DEFAULT_CAMERA, type Camera, type Viewport } from '../camera/camera';
import { EMPTY_SCENE } from '../model/scene';
import { DEFAULT_STYLE } from '../model/style';
import type { Box } from '../geometry/box';
import type { Guide } from '../snapping/snapping';
import type {
  Arrowhead,
  ElementId,
  ElementStyle,
  FontFamily,
  GroupId,
  LinearCurve,
  Scene,
  TextAlign,
  VerticalAlign,
} from '../model/types';

export type ToolId =
  'select' | 'rectangle' | 'diamond' | 'ellipse' | 'line' | 'arrow' | 'freedraw' | 'text';

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
  /** Text element open in the inline editor; edits form one history step. */
  readonly editingText: ElementId | null;
  /** Line/arrow open in the point editor, with its selected point indices. */
  readonly linearEdit: LinearEdit | null;
  readonly gridVisible: boolean;
  /** Snap to the grid while it is shown. */
  readonly gridSnap: boolean;
  /** Grid spacing in world units. */
  readonly gridSize: number;
  readonly gridStyle: GridStyle;
  /** Snap to other elements' edges and centres. */
  readonly objectSnap: boolean;
}

export type GridStyle = 'dots' | 'lines';
export const GRID_SIZES = [10, 20, 40] as const;

export interface LinearEdit {
  readonly id: ElementId;
  readonly selected: readonly number[];
}

export interface OverlayState {
  /** Marquee rectangle in world units. */
  readonly marquee: Box | null;
  /** Shape a dragged arrow endpoint would attach to. */
  readonly bindTarget: ElementId | null;
  /** Snap guide lines in world units. */
  readonly guides: readonly Guide[];
}

export const EMPTY_OVERLAY: OverlayState = { marquee: null, bindTarget: null, guides: [] };

/** Tools sharing one remembered style: shapes, lines and arrows, freedraw. */
export type StyleCategory = 'shape' | 'linear' | 'freedraw' | 'text';

export interface ArrowHeads {
  readonly start: Arrowhead;
  readonly end: Arrowhead;
}

export interface TextProps {
  readonly fontFamily: FontFamily;
  readonly fontSize: number;
  readonly textAlign: TextAlign;
  readonly verticalAlign: VerticalAlign;
}

export const DEFAULT_TEXT_PROPS: TextProps = {
  fontFamily: 'hand',
  fontSize: 20,
  textAlign: 'left',
  verticalAlign: 'middle',
};

/** Last-used style per tool category, applied to newly created elements. */
export interface StyleMemory {
  readonly shape: ElementStyle;
  readonly linear: ElementStyle;
  readonly freedraw: ElementStyle;
  readonly text: ElementStyle;
  readonly arrowHeads: ArrowHeads;
  /** Path style for new lines and arrows. */
  readonly curve: LinearCurve;
  readonly textProps: TextProps;
}

export const DEFAULT_STYLE_MEMORY: StyleMemory = {
  shape: DEFAULT_STYLE,
  linear: DEFAULT_STYLE,
  freedraw: DEFAULT_STYLE,
  text: DEFAULT_STYLE,
  arrowHeads: { start: 'none', end: 'arrow' },
  curve: 'straight',
  textProps: DEFAULT_TEXT_PROPS,
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
    editingText: null,
    linearEdit: null,
    gridVisible: false,
    gridSnap: true,
    gridSize: 20,
    gridStyle: 'dots',
    objectSnap: false,
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
