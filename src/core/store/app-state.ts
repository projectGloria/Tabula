import { DEFAULT_CAMERA, type Camera, type Viewport } from '../camera/camera';
import { EMPTY_SCENE } from '../model/scene';
import type { ElementId, Scene } from '../model/types';

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
}

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
