import {
  clearSelection,
  restoreElements,
  setElementGeometry,
  setElementPositions,
  setSelection,
  toggleSelected,
} from '../actions/actions';
import { pointsPatchFromWorld, worldPointsOf } from '../geometry/element-geometry';
import { rectCenter, type RectLike } from '../geometry/rect';
import {
  angleAround,
  computeResize,
  resizeElement,
  resizeElementInGroup,
  rotateElementAround,
  rotatedAngle,
  type ResizeHandle,
} from '../geometry/transform';
import { snapAngle } from '../geometry/angle';
import { distance, type Point } from '../geometry/vec';
import {
  getSelectionFrame,
  getSelectionHandles,
  hitHandle,
  insideSelectionFrame,
  resizeCursor,
} from '../hit/handles';
import type { GeometryPatch } from '../model/scene';
import type { ElementId, LinearElement, SceneElement } from '../model/types';
import { isSelected, selectedIds, type AppState } from '../store/app-state';
import { snapSegment } from './constrain';
import { DRAG_THRESHOLD_PX, type PointerInput, type Tool, type ToolContext } from './tool';

interface PressBase {
  readonly pointerId: number;
  readonly startScreen: Point;
  readonly startWorld: Point;
  /** Snapshots of every element the gesture changes, for cancel. */
  readonly originals: ReadonlyMap<ElementId, SceneElement>;
  dragging: boolean;
}

interface MovePress extends PressBase {
  readonly type: 'move';
}

interface ResizePress extends PressBase {
  readonly type: 'resize';
  readonly handle: ResizeHandle;
  readonly frame: RectLike;
  /** Exact world position of the grabbed handle on the unpadded frame. */
  readonly handleWorld: Point;
  readonly single: boolean;
}

interface RotatePress extends PressBase {
  readonly type: 'rotate';
  readonly pivot: Point;
  readonly startAngle: number;
  readonly single: boolean;
}

interface EndpointPress extends PressBase {
  readonly type: 'endpoint';
  readonly element: LinearElement;
  readonly index: number;
  readonly grabOffset: Point;
}

type Press = MovePress | ResizePress | RotatePress | EndpointPress;

function snapshot(state: AppState, ids: Iterable<ElementId>): Map<ElementId, SceneElement> {
  const out = new Map<ElementId, SceneElement>();
  for (const id of ids) {
    const el = state.scene.entities[id];
    if (el && !el.locked) out.set(id, el);
  }
  return out;
}

export class SelectTool implements Tool {
  readonly id = 'select' as const;
  private press: Press | null = null;
  private hoverCursor = 'default';

  get cursor(): string {
    const p = this.press;
    if (p?.type === 'rotate') return 'grabbing';
    if (p?.type === 'move' && p.dragging) return 'move';
    return this.hoverCursor;
  }

  onPointerDown(ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0 || this.press) return;
    const state = ctx.getState();
    const base = {
      pointerId: e.pointerId,
      startScreen: e.screen,
      startWorld: e.world,
      dragging: false,
    };

    // 1. Handles of the current selection take priority.
    const frame = getSelectionFrame(state);
    const handle = frame
      ? hitHandle(state, e.screen, getSelectionHandles(state, frame))
      : undefined;
    if (frame && handle) {
      const originals = new Map(frame.elements.map((el) => [el.id, el] as const));
      const kind = handle.kind;
      if (kind.type === 'resize') {
        this.press = {
          ...base,
          type: 'resize',
          originals,
          handle: kind.handle,
          frame: frame.rect,
          handleWorld: handle.anchor,
          single: frame.single !== null,
        };
      } else if (kind.type === 'rotate') {
        const pivot = rectCenter(frame.rect);
        this.press = {
          ...base,
          type: 'rotate',
          originals,
          pivot,
          startAngle: angleAround(pivot, e.world),
          single: frame.single !== null,
        };
      } else {
        const el = frame.single;
        if (el?.type !== 'line' && el?.type !== 'arrow') return;
        this.press = {
          ...base,
          type: 'endpoint',
          originals,
          element: el,
          index: kind.index,
          grabOffset: { x: handle.anchor.x - e.world.x, y: handle.anchor.y - e.world.y },
        };
      }
      return;
    }

    // 2. Element under the pointer.
    const hit = ctx.hitTest(e.world);
    if (hit === undefined) {
      // 3. Empty space inside the selection frame drags the selection.
      if (!e.shift && frame && insideSelectionFrame(state, e.screen, frame)) {
        this.startMove(state, base);
        return;
      }
      if (!e.shift) ctx.update(clearSelection);
      return;
    }

    if (e.shift) ctx.update((s) => toggleSelected(s, hit));
    else if (!isSelected(state, hit)) ctx.update((s) => setSelection(s, [hit]));

    const next = ctx.getState();
    if (!isSelected(next, hit)) return; // shift-click just deselected it
    this.startMove(next, base);
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const p = this.press;
    if (!p) {
      this.updateHover(ctx, e);
      return;
    }
    if (p.pointerId !== e.pointerId) return;
    if (!p.dragging && distance(p.startScreen, e.screen) < DRAG_THRESHOLD_PX) return;
    p.dragging = true;
    switch (p.type) {
      case 'move':
        this.applyMove(ctx, p, e);
        return;
      case 'resize':
        this.applyResize(ctx, p, e);
        return;
      case 'rotate':
        this.applyRotate(ctx, p, e);
        return;
      case 'endpoint':
        this.applyEndpoint(ctx, p, e);
        return;
    }
  }

  onPointerUp(ctx: ToolContext, e: PointerInput): void {
    if (this.press?.pointerId !== e.pointerId) return;
    this.onPointerMove(ctx, e);
    this.press = null;
    this.updateHover(ctx, e);
  }

  cancel(ctx: ToolContext): void {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.dragging) ctx.update((s) => restoreElements(s, p.originals.values()));
  }

  private startMove(state: AppState, base: Omit<PressBase, 'originals'>): void {
    this.press = { ...base, type: 'move', originals: snapshot(state, selectedIds(state)) };
  }

  private updateHover(ctx: ToolContext, e: PointerInput): void {
    const state = ctx.getState();
    const frame = getSelectionFrame(state);
    const handle = frame
      ? hitHandle(state, e.screen, getSelectionHandles(state, frame))
      : undefined;
    if (frame && handle) {
      const k = handle.kind;
      this.hoverCursor =
        k.type === 'resize'
          ? resizeCursor(k.handle, frame.rect.angle)
          : k.type === 'rotate'
            ? 'grab'
            : 'pointer';
      return;
    }
    const over = ctx.hitTest(e.world) !== undefined || insideSelectionFrame(state, e.screen, frame);
    this.hoverCursor = over ? 'move' : 'default';
  }

  private applyMove(ctx: ToolContext, p: MovePress, e: PointerInput): void {
    const dx = e.world.x - p.startWorld.x;
    const dy = e.world.y - p.startWorld.y;
    const positions = new Map<ElementId, Point>();
    for (const [id, o] of p.originals) positions.set(id, { x: o.x + dx, y: o.y + dy });
    ctx.update((s) => setElementPositions(s, positions));
  }

  private applyResize(ctx: ToolContext, p: ResizePress, e: PointerInput): void {
    const target = {
      x: p.handleWorld.x + e.world.x - p.startWorld.x,
      y: p.handleWorld.y + e.world.y - p.startWorld.y,
    };
    // Multi-selection always scales proportionally so rotated members stay undistorted.
    const m = computeResize(p.frame, p.handle, target, {
      keepAspect: p.single ? e.shift : true,
      fromCenter: e.alt,
    });
    const patches = new Map<ElementId, GeometryPatch>();
    for (const [id, el] of p.originals) {
      patches.set(id, p.single ? resizeElement(el, m) : resizeElementInGroup(el, p.frame, m));
    }
    ctx.update((s) => setElementGeometry(s, patches));
  }

  private applyRotate(ctx: ToolContext, p: RotatePress, e: PointerInput): void {
    const delta = angleAround(p.pivot, e.world) - p.startAngle;
    const patches = new Map<ElementId, GeometryPatch>();
    if (p.single) {
      for (const [id, el] of p.originals) {
        patches.set(id, { angle: rotatedAngle(el.angle, delta, e.shift) });
      }
    } else {
      const d = e.shift ? snapAngle(delta) : delta;
      for (const [id, el] of p.originals) patches.set(id, rotateElementAround(el, p.pivot, d));
    }
    ctx.update((s) => setElementGeometry(s, patches));
  }

  private applyEndpoint(ctx: ToolContext, p: EndpointPress, e: PointerInput): void {
    const el = p.element;
    const pts = worldPointsOf(el);
    let target = { x: e.world.x + p.grabOffset.x, y: e.world.y + p.grabOffset.y };
    const other = pts[p.index === 0 ? 1 : 0];
    if (e.shift && other) target = snapSegment(other, target);
    pts[p.index] = target;
    const patch = pointsPatchFromWorld(el.angle, pts);
    ctx.update((s) => setElementGeometry(s, new Map([[el.id, patch]])));
  }
}
