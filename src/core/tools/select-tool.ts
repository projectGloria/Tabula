import {
  clearSelection,
  deleteElements,
  restoreElements,
  setElementGeometry,
  setElementPositions,
  setSelection,
} from '../actions/actions';
import { duplicateElements, setFocusGroup } from '../actions/edit-actions';
import {
  closeLinearEdit,
  insertLinearPoint,
  openLinearEdit,
  selectLinearPoints,
  setLinearPoints,
  type EndBindings,
} from '../actions/linear-actions';
import { editTextAt } from '../actions/text-actions';
import { boxContainsBox, boxFromRect, boxUnion, type Box } from '../geometry/box';
import { worldPointsOf } from '../geometry/element-geometry';
import { rectAABB, rectCenter, type RectLike } from '../geometry/rect';
import {
  angleAround,
  computeResize,
  resizeElement,
  resizeElementInGroup,
  rotateElementAround,
  rotatedAngle,
  RESIZE_HANDLE_DIRS,
  type ResizeHandle,
} from '../geometry/transform';
import { resizeTextElement } from '../text/resize';
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
import type { ElementId, SceneElement } from '../model/types';
import { snapBox, snapContext, snapPoint, type SnapContext } from '../snapping/snapping';
import { isSelected, selectedIds, type AppState } from '../store/app-state';
import { bindCandidate } from './bind-assist';
import { snapSegment } from './constrain';
import { clearOverlay, setOverlay } from './overlay';
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
  snap: SnapContext | null;
}

interface ResizePress extends PressBase {
  readonly type: 'resize';
  readonly handle: ResizeHandle;
  readonly frame: RectLike;
  /** Exact world position of the grabbed handle on the unpadded frame. */
  readonly handleWorld: Point;
  readonly single: boolean;
  readonly snap: SnapContext;
}

interface RotatePress extends PressBase {
  readonly type: 'rotate';
  readonly pivot: Point;
  readonly startAngle: number;
  readonly single: boolean;
}

interface EndpointPress extends PressBase {
  readonly type: 'endpoint';
  readonly id: ElementId;
  /** Point being dragged; set once a midpoint drag has inserted its point. */
  index: number;
  /** Midpoint drag: insert a point after this index on the first move. */
  insertAfter: number | null;
  readonly grabOffset: Point;
  readonly snap: SnapContext;
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
          snap: snapContext(state, originals.keys(), ctx.queryBox),
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
        const point = kind.type === 'endpoint';
        if (point && state.linearEdit?.id === el.id) {
          // Clicking a point selects it; Shift adds or removes it.
          const sel = state.linearEdit.selected;
          const has = sel.includes(kind.index);
          const next = e.shift
            ? has
              ? sel.filter((i) => i !== kind.index)
              : [...sel, kind.index]
            : has
              ? sel
              : [kind.index];
          ctx.update((s) => selectLinearPoints(s, next));
        }
        this.press = {
          ...base,
          type: 'endpoint',
          originals,
          id: el.id,
          index: point ? kind.index : kind.index + 1,
          insertAfter: point ? null : kind.index,
          grabOffset: { x: handle.anchor.x - e.world.x, y: handle.anchor.y - e.world.y },
          snap: snapContext(state, [el.id], ctx.queryBox),
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

  /**
   * Double-click enters the group under the pointer, one level per click;
   * on a line it opens the point editor; otherwise it edits text or a label.
   */
  onDoubleClick(ctx: ToolContext, e: PointerInput): void {
    const hit = ctx.hitTest(e.world);
    const state = ctx.getState();
    const el = hit === undefined ? undefined : state.scene.entities[hit];
    const group = el ? selectionTargetGroup(el, state.focusGroup) : null;
    if (state.linearEdit !== null && (hit === undefined || hit === state.linearEdit.id)) {
      if (hit === undefined) ctx.update(closeLinearEdit);
      return;
    }
    if (el?.type === 'line' && !el.locked && group === null) {
      ctx.update((s) => openLinearEdit(setSelection(s, [el.id]), el.id));
      return;
    }
    if (hit !== undefined && group !== null) {
      ctx.update((s) => {
        const focused = setFocusGroup(s, group);
        return setSelection(focused, expandToGroups(focused.scene, [hit], group));
      });
      return;
    }
    ctx.update((s) => editTextAt(s, e.world, hit));
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
    this.press = null;
    ctx.update(clearOverlay, { history: 'skip' });
    this.updateHover(ctx, e);
  }

  cancel(ctx: ToolContext): void {
    const p = this.press;
    if (!p) return;
    this.press = null;
    ctx.update(clearOverlay, { history: 'skip' });
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
    this.press = {
      ...base,
      type: 'move',
      originals,
      duplicate,
      sources: null,
      moving: originals,
      snap: null,
    };
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
    p.snap ??= snapContext(ctx.getState(), p.moving.keys(), ctx.queryBox);
    let dx = e.world.x - p.startWorld.x;
    let dy = e.world.y - p.startWorld.y;
    let box: Box | null = null;
    for (const o of p.moving.values()) box = box ? boxUnion(box, rectAABB(o)) : rectAABB(o);
    let guides: ReturnType<typeof snapBox>['guides'] = [];
    if (box) {
      const r = snapBox(p.snap, {
        minX: box.minX + dx,
        minY: box.minY + dy,
        maxX: box.maxX + dx,
        maxY: box.maxY + dy,
      });
      dx += r.dx;
      dy += r.dy;
      guides = r.guides;
    }
    const positions = new Map<ElementId, Point>();
    for (const [id, o] of p.moving) positions.set(id, { x: o.x + dx, y: o.y + dy });
    ctx.update((s) => setOverlay(setElementPositions(s, positions), { guides }));
  }

  private applyResize(ctx: ToolContext, p: ResizePress, e: PointerInput): void {
    const raw = {
      x: p.handleWorld.x + e.world.x - p.startWorld.x,
      y: p.handleWorld.y + e.world.y - p.startWorld.y,
    };
    // Snapping a rotated frame's handle to axis-aligned guides would skew it.
    const snapped = p.frame.angle === 0 ? snapPoint(p.snap, raw) : { point: raw, guides: [] };
    const target = snapped.point;
    const dir = RESIZE_HANDLE_DIRS[p.handle];
    const corner = dir.x !== 0 && dir.y !== 0;
    const solo = (type: SceneElement['type']): boolean =>
      p.single && [...p.originals.values()].some((el) => el.type === type);
    // Multi-selection always scales proportionally so rotated members stay
    // undistorted; a text corner scales its font, so it keeps its aspect too.
    // An image corner keeps its aspect unless Shift frees it.
    const keepAspect = !p.single
      ? true
      : solo('image') && corner
        ? !e.shift
        : e.shift || (solo('text') && corner);
    const m = computeResize(p.frame, p.handle, target, {
      keepAspect,
      fromCenter: e.alt,
    });
    const patches = new Map<ElementId, GeometryPatch>();
    const texts: SceneElement[] = [];
    for (const [id, el] of p.originals) {
      const g = p.single ? resizeElement(el, m) : resizeElementInGroup(el, p.frame, m);
      if (el.type === 'text') {
        texts.push(resizeTextElement(el, g, p.single ? p.handle : null, Math.abs(m.sx)));
      } else {
        patches.set(id, g);
      }
    }
    ctx.update((s) =>
      setOverlay(restoreElements(setElementGeometry(s, patches), texts), {
        guides: snapped.guides,
      }),
    );
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

  /**
   * Drags one point of a line/arrow. Works from the element's current points
   * so ends placed by bindings stay put. An arrow end over a shape attaches
   * to it (Ctrl/⌘: never); otherwise Shift snaps the segment to its
   * neighbour to 15°, and the point snaps to objects / the grid.
   */
  private applyEndpoint(ctx: ToolContext, p: EndpointPress, e: PointerInput): void {
    const raw = { x: e.world.x + p.grabOffset.x, y: e.world.y + p.grabOffset.y };
    if (p.insertAfter !== null) {
      const after = p.insertAfter;
      p.insertAfter = null;
      ctx.update((s) => {
        const next = insertLinearPoint(s, p.id, after, raw);
        return next.linearEdit?.id === p.id ? selectLinearPoints(next, [after + 1]) : next;
      });
    }
    const state = ctx.getState();
    const el = state.scene.entities[p.id];
    if (el?.type !== 'line' && el?.type !== 'arrow') return;
    const pts = worldPointsOf(el);
    const last = pts.length - 1;
    if (p.index < 0 || p.index > last) return;
    const isEnd = p.index === 0 || p.index === last;
    let target = raw;
    let guides: ReturnType<typeof snapPoint>['guides'] = [];
    let bindings: EndBindings = {};
    let bindTarget: ElementId | null = null;
    const cand =
      el.type === 'arrow' && isEnd
        ? bindCandidate(ctx, raw, e.mod, this.otherEndExclude(el, p.index))
        : null;
    if (cand) {
      bindTarget = cand.target.id;
    } else {
      const neighbour = pts[p.index === 0 ? 1 : p.index - 1];
      if (e.shift && neighbour) target = snapSegment(neighbour, raw);
      else ({ point: target, guides } = snapPoint(p.snap, raw));
    }
    if (el.type === 'arrow' && isEnd) {
      const b = cand?.binding ?? null;
      bindings = p.index === 0 ? { start: b } : { end: b };
    }
    pts[p.index] = target;
    ctx.update((s) => setOverlay(setLinearPoints(s, p.id, pts, bindings), { bindTarget, guides }));
  }

  /** The arrow itself, plus (two-point arrows) the shape the other end is on. */
  private otherEndExclude(el: SceneElement, index: number): Set<ElementId> {
    const out = new Set([el.id]);
    if (el.type !== 'arrow' || el.points.length !== 2) return out;
    const other = index === 0 ? el.endBinding : el.startBinding;
    if (other) out.add(other.elementId);
    return out;
  }
}
