import {
  clearSelection,
  deleteElements,
  restoreElements,
  setElementGeometry,
  setElementPositions,
  setSelection,
} from '../actions/actions';
import { duplicateElements, setFocusGroup } from '../actions/edit-actions';
import { boxContainsBox, boxFromRect, type Box } from '../geometry/box';
import { pointsPatchFromWorld, worldPointsOf } from '../geometry/element-geometry';
import { rectAABB, rectCenter, type RectLike } from '../geometry/rect';
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
import { expandToGroups, selectionTargetGroup } from '../model/groups';
import type { GeometryPatch } from '../model/scene';
import type { ElementId, LinearElement, SceneElement } from '../model/types';
import { EMPTY_OVERLAY, isSelected, selectedIds, type AppState } from '../store/app-state';
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
  /** Alt held at press: the first drag step duplicates the selection. */
  readonly duplicate: boolean;
  /** Ids the move started from, once an Alt-drag replaced them with copies. */
  sources: readonly ElementId[] | null;
  /** Elements being moved, as they were when the drag began. */
  moving: ReadonlyMap<ElementId, SceneElement>;
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

interface MarqueePress extends PressBase {
  readonly type: 'marquee';
  /** Selection before the marquee (Shift adds to it). */
  readonly initial: readonly ElementId[];
}

type Press = MovePress | ResizePress | RotatePress | EndpointPress | MarqueePress;

function snapshot(state: AppState, ids: Iterable<ElementId>): Map<ElementId, SceneElement> {
  const out = new Map<ElementId, SceneElement>();
  for (const id of ids) {
    const el = state.scene.entities[id];
    if (el && !el.locked) out.set(id, el);
  }
  return out;
}

function clearOverlay(s: AppState): AppState {
  return s.overlay.marquee === null ? s : { ...s, overlay: EMPTY_OVERLAY };
}

/** Unlocked elements whose bounds lie fully inside `box`. */
export function elementsInside(state: AppState, box: Box): ElementId[] {
  return state.scene.order.filter((id) => {
    const el = state.scene.entities[id];
    return el !== undefined && !el.locked && boxContainsBox(box, rectAABB(el));
  });
}

export class SelectTool implements Tool {
  readonly id = 'select' as const;
  private press: Press | null = null;
  private hoverCursor = 'default';

  get cursor(): string {
    const p = this.press;
    if (p?.type === 'rotate') return 'grabbing';
    if (p?.type === 'move' && p.dragging) return p.duplicate ? 'copy' : 'move';
    if (p?.type === 'marquee') return 'crosshair';
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
        this.startMove(state, base, e.alt);
        return;
      }
      // 4. Otherwise a marquee; a plain click on empty space also leaves an entered group.
      if (!e.shift) ctx.update((s) => setFocusGroup(clearSelection(s), null));
      this.press = {
        ...base,
        type: 'marquee',
        originals: new Map(),
        initial: e.shift ? selectedIds(state) : [],
      };
      return;
    }

    const el = state.scene.entities[hit];
    if (!el) return;
    if (state.focusGroup !== null && !el.groupIds.includes(state.focusGroup)) {
      ctx.update((s) => setFocusGroup(s, null));
    }
    const cur = ctx.getState();
    // Mod-click picks the single element, even inside a group.
    const targets = e.mod ? [hit] : expandToGroups(cur.scene, [hit], cur.focusGroup);
    if (e.shift) {
      const all = targets.every((id) => isSelected(cur, id));
      const keep = selectedIds(cur).filter((id) => !(all && targets.includes(id)));
      ctx.update((s) => setSelection(s, all ? keep : [...keep, ...targets]));
    } else if (!isSelected(cur, hit) || e.mod) {
      ctx.update((s) => setSelection(s, targets));
    }

    const next = ctx.getState();
    if (!isSelected(next, hit)) return; // shift-click just deselected it
    this.startMove(next, base, e.alt);
  }

  /** Double-click enters the group under the pointer, one level per click. */
  onDoubleClick(ctx: ToolContext, e: PointerInput): void {
    const hit = ctx.hitTest(e.world);
    if (hit === undefined) return;
    const state = ctx.getState();
    const el = state.scene.entities[hit];
    if (!el) return;
    const group = selectionTargetGroup(el, state.focusGroup);
    if (group === null) return;
    ctx.update((s) => {
      const focused = setFocusGroup(s, group);
      return setSelection(focused, expandToGroups(focused.scene, [hit], group));
    });
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const p = this.press;
    if (!p) {
      this.updateHover(ctx, e);
      return;
    }
    if (p.pointerId !== e.pointerId) return;
    if (!p.dragging && distance(p.startScreen, e.screen) < DRAG_THRESHOLD_PX) return;
    const first = !p.dragging;
    p.dragging = true;
    switch (p.type) {
      case 'move':
        if (first && p.duplicate) this.duplicateForDrag(ctx, p);
        this.applyMove(ctx, p, e);
        return;
      case 'marquee':
        this.applyMarquee(ctx, p, e);
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
    const p = this.press;
    this.press = null;
    if (p.type === 'marquee') ctx.update(clearOverlay, { history: 'skip' });
    this.updateHover(ctx, e);
  }

  cancel(ctx: ToolContext): void {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.type === 'marquee') {
      const initial = p.initial;
      ctx.update((s) => setSelection(clearOverlay(s), initial));
      return;
    }
    if (p.type === 'move' && p.sources) {
      const copies = [...p.moving.keys()];
      const sources = p.sources;
      ctx.update((s) => setSelection(deleteElements(s, copies), sources));
      return;
    }
    if (p.dragging) ctx.update((s) => restoreElements(s, p.originals.values()));
  }

  private startMove(state: AppState, base: Omit<PressBase, 'originals'>, duplicate: boolean): void {
    const originals = snapshot(state, selectedIds(state));
    this.press = { ...base, type: 'move', originals, duplicate, sources: null, moving: originals };
  }

  /** Alt-drag: copies stay where the originals were placed; the drag moves the copies. */
  private duplicateForDrag(ctx: ToolContext, p: MovePress): void {
    const sources = [...p.originals.keys()];
    if (sources.length === 0) return;
    ctx.update((s) => duplicateElements(s, sources, { x: 0, y: 0 }));
    const after = ctx.getState();
    p.sources = sources;
    p.moving = snapshot(after, selectedIds(after));
  }

  private applyMarquee(ctx: ToolContext, p: MarqueePress, e: PointerInput): void {
    const box = boxFromRect(
      Math.min(p.startWorld.x, e.world.x),
      Math.min(p.startWorld.y, e.world.y),
      Math.abs(e.world.x - p.startWorld.x),
      Math.abs(e.world.y - p.startWorld.y),
    );
    ctx.update((s) => {
      const inside = elementsInside(s, box);
      const ids = expandToGroups(s.scene, inside, s.focusGroup).filter(
        (id) => s.scene.entities[id]?.locked === false,
      );
      const next = setSelection(s, [...p.initial, ...ids]);
      return { ...next, overlay: { ...next.overlay, marquee: box } };
    });
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
    for (const [id, o] of p.moving) positions.set(id, { x: o.x + dx, y: o.y + dy });
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
