import type { Point } from '../geometry/vec';
import type { ElementId } from '../model/types';
import type { AppState, ToolId } from '../store/app-state';
import type { UpdateOptions } from '../store/editor';

export type PointerKind = 'mouse' | 'pen' | 'touch';

/** Normalized pointer sample delivered to tools. */
export interface PointerInput {
  readonly pointerId: number;
  readonly kind: PointerKind;
  /** Viewport-relative CSS pixels. */
  readonly screen: Point;
  readonly world: Point;
  readonly button: number;
  readonly pressure: number;
  readonly shift: boolean;
  readonly alt: boolean;
  /** Ctrl on Windows/Linux, ⌘ on macOS. */
  readonly mod: boolean;
}

export interface ToolContext {
  getState(): AppState;
  update(fn: (prev: AppState) => AppState, options?: UpdateOptions): void;
  hitTest(world: Point): ElementId | undefined;
  /** Opens a history transaction spanning several pointer gestures (polylines). */
  begin?(): void;
  end?(): void;
}

/** Pointer-driven tool state machine. */
export interface Tool {
  readonly id: ToolId;
  /** CSS cursor; may change with hover state (read after every pointer event). */
  readonly cursor: string;
  /** Deliver every coalesced pointermove sample (freedraw). */
  readonly wantsCoalesced?: boolean;
  onPointerDown(ctx: ToolContext, e: PointerInput): void;
  onPointerMove(ctx: ToolContext, e: PointerInput): void;
  onPointerUp(ctx: ToolContext, e: PointerInput): void;
  /** Abort the current gesture (pointercancel, tool switch, Escape). */
  cancel(ctx: ToolContext): void;
  /** Complete a multi-step gesture (Enter), e.g. a polyline. */
  finish?(ctx: ToolContext): void;
  onDoubleClick?(ctx: ToolContext, e: PointerInput): void;
}

/** Screen-pixel distance a press must travel before it counts as a drag. */
export const DRAG_THRESHOLD_PX = 3;
