import { visibleWorldBox, worldToScreen } from '../camera/camera';
import { boxUnion, type Box } from '../geometry/box';
import { rectAABB, rectCorners, type RectLike } from '../geometry/rect';
import {
  getSelectionFrame,
  getSelectionHandles,
  HANDLE_HIT_SLOP_PX,
  HANDLE_SIZE_PX,
  SELECTION_PAD_PX,
  usesEndpointHandles,
  type SelectionHandle,
} from '../hit/handles';
import type { Point } from '../geometry/vec';
import type { ElementId } from '../model/types';
import type { GridIndex } from '../spatial/grid-index';
import type { AppState } from '../store/app-state';
import { paintElement } from './draw-element';
import { SketchCache } from './sketch/cache';
import { FpsMeter } from './fps-meter';
import { CanvasSurface } from './surface';

const SELECTION_COLOR = '#2f6fde';
const SELECTION_MEMBER_COLOR = 'rgba(47, 111, 222, 0.45)';
const MARQUEE_FILL = 'rgba(47, 111, 222, 0.08)';
const FOCUS_GROUP_COLOR = 'rgba(47, 111, 222, 0.6)';
const HANDLE_FILL = '#ffffff';
const DEBUG_HANDLE_COLOR = 'rgba(230, 140, 20, 0.9)';
const DEBUG_AABB_COLOR = 'rgba(214, 51, 108, 0.8)';
const DEBUG_BOUNDS_COLOR = 'rgba(16, 152, 120, 0.9)';

export interface DebugLabels {
  fps(value: number): string;
  elements(visible: number, total: number): string;
  zoom(percent: number): string;
  cells(count: number): string;
}

interface Dirty {
  scene: boolean;
  overlay: boolean;
}

/**
 * Dual-canvas renderer. The scene canvas redraws only when scene, camera,
 * viewport or background change; the overlay canvas holds selection chrome,
 * tool previews and the debug overlay. Draws are batched into one rAF.
 */
export class Renderer {
  private readonly scene: CanvasSurface;
  private readonly overlay: CanvasSurface;
  private readonly fps = new FpsMeter();
  /** Generated sketches, reused across frames until an element's sketch inputs change. */
  readonly sketches = new SketchCache();
  private readonly dirty: Dirty = { scene: true, overlay: true };
  private frame = 0;
  private lastState: AppState | null = null;
  private visible: ElementId[] = [];
  private disposed = false;

  constructor(
    sceneCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    private readonly getState: () => AppState,
    private readonly index: GridIndex<ElementId>,
    private readonly debugLabels: DebugLabels,
  ) {
    this.scene = new CanvasSurface(sceneCanvas);
    this.overlay = new CanvasSurface(overlayCanvas);
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const a = this.scene.resize(cssWidth, cssHeight, dpr);
    const b = this.overlay.resize(cssWidth, cssHeight, dpr);
    if (a || b) this.invalidate({ scene: true, overlay: true });
  }

  /** Call after every state change; decides which layers need a redraw. */
  onStateChange(): void {
    const next = this.getState();
    const prev = this.lastState;
    const sceneDirty =
      prev?.scene !== next.scene ||
      prev.camera !== next.camera ||
      prev.viewport !== next.viewport ||
      prev.background !== next.background;
    const overlayDirty =
      sceneDirty ||
      prev.selection !== next.selection ||
      prev.debug !== next.debug ||
      prev.overlay !== next.overlay ||
      prev.focusGroup !== next.focusGroup;
    if (sceneDirty || overlayDirty) this.invalidate({ scene: sceneDirty, overlay: overlayDirty });
  }

  invalidate(flags: Partial<Dirty>): void {
    if (this.disposed) return;
    if (flags.scene) this.dirty.scene = true;
    if (flags.overlay) this.dirty.overlay = true;
    if (this.frame === 0) this.frame = requestAnimationFrame(this.draw);
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly draw = (now: number): void => {
    this.frame = 0;
    if (this.disposed) return;
    const state = this.getState();
    this.lastState = state;

    if (this.dirty.scene) {
      this.dirty.scene = false;
      this.drawScene(state);
      this.fps.tick(now);
    }
    if (this.dirty.overlay) {
      this.dirty.overlay = false;
      this.drawOverlay(state);
    }
    // Keep the loop alive while debugging so the FPS readout reflects capacity.
    if (state.debug) this.invalidate({ scene: true, overlay: true });
    else this.fps.reset();
  };

  private drawScene(state: AppState): void {
    const { ctx } = this.scene;
    const dpr = this.scene.pixelRatio;
    const { camera } = state;
    this.scene.clear();
    ctx.fillStyle = state.background;
    ctx.fillRect(0, 0, state.viewport.width, state.viewport.height);

    const view = visibleWorldBox(camera, state.viewport);
    const candidates = this.index.queryBox(view);
    const visible: ElementId[] = [];
    for (const id of state.scene.order) if (candidates.has(id)) visible.push(id);
    this.visible = visible;

    const z = camera.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, -camera.x * z, -camera.y * z);
    for (const id of visible) {
      const el = state.scene.entities[id];
      if (el) paintElement(ctx, el, this.sketches);
    }
    this.sketches.prune(state.scene);
  }

  private drawOverlay(state: AppState): void {
    const { ctx } = this.overlay;
    this.overlay.clear();
    const { camera } = state;

    // Selection chrome, drawn in screen space for crisp 1px lines.
    const frame = getSelectionFrame(state);
    const handles = getSelectionHandles(state, frame);
    ctx.lineWidth = 1;
    const ids = Object.keys(state.selection) as ElementId[];
    const multi = ids.length > 1;
    for (const id of ids) {
      const el = state.scene.entities[id];
      if (!el) continue;
      if (!multi && usesEndpointHandles(el)) continue;
      ctx.strokeStyle = multi ? SELECTION_MEMBER_COLOR : SELECTION_COLOR;
      strokePolygon(
        ctx,
        paddedCorners(el, camera.zoom).map((p) => worldToScreen(camera, p)),
      );
    }
    if (frame && multi) {
      ctx.strokeStyle = SELECTION_COLOR;
      strokePolygon(
        ctx,
        paddedCorners(frame.rect, camera.zoom).map((p) => worldToScreen(camera, p)),
      );
    }
    this.drawHandles(state, handles);
    this.drawFocusGroup(state);

    const marquee = state.overlay.marquee;
    if (marquee) {
      const a = worldToScreen(camera, { x: marquee.minX, y: marquee.minY });
      const b = worldToScreen(camera, { x: marquee.maxX, y: marquee.maxY });
      ctx.fillStyle = MARQUEE_FILL;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }

    if (state.debug) this.drawDebug(state);
  }

  /** Dashed outline around the entered group's members. */
  private drawFocusGroup(state: AppState): void {
    const g = state.focusGroup;
    if (g === null) return;
    let box: Box | null = null;
    for (const id of state.scene.order) {
      const el = state.scene.entities[id];
      if (!el?.groupIds.includes(g)) continue;
      const b = rectAABB(el);
      box = box ? boxUnion(box, b) : b;
    }
    if (!box) return;
    const { ctx } = this.overlay;
    const pad = SELECTION_PAD_PX * 2;
    const a = worldToScreen(state.camera, { x: box.minX, y: box.minY });
    const c = worldToScreen(state.camera, { x: box.maxX, y: box.maxY });
    ctx.strokeStyle = FOCUS_GROUP_COLOR;
    ctx.setLineDash([3, 4]);
    ctx.strokeRect(a.x - pad + 0.5, a.y - pad + 0.5, c.x - a.x + pad * 2, c.y - a.y + pad * 2);
    ctx.setLineDash([]);
  }

  private drawHandles(state: AppState, handles: readonly SelectionHandle[]): void {
    const { ctx } = this.overlay;
    const { camera } = state;
    const half = HANDLE_SIZE_PX / 2;
    const frame = getSelectionFrame(state);
    const angle = frame?.rect.angle ?? 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.fillStyle = HANDLE_FILL;
    for (const h of handles) {
      const c = worldToScreen(camera, h.center);
      ctx.beginPath();
      if (h.kind.type === 'resize') {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(angle);
        ctx.rect(-half, -half, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
        ctx.restore();
      } else {
        ctx.arc(c.x, c.y, half, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawDebug(state: AppState): void {
    const { ctx } = this.overlay;
    const { camera } = state;

    // Handle pick areas.
    ctx.lineWidth = 1;
    ctx.strokeStyle = DEBUG_HANDLE_COLOR;
    const reach = HANDLE_SIZE_PX / 2 + HANDLE_HIT_SLOP_PX;
    for (const h of getSelectionHandles(state)) {
      const c = worldToScreen(camera, h.center);
      ctx.beginPath();
      ctx.arc(c.x, c.y, reach, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = DEBUG_AABB_COLOR;
    for (const id of this.visible) {
      const b = this.index.getBox(id);
      if (b) strokeBox(ctx, b, camera);
    }
    const bounds = this.index.bounds();
    if (bounds) {
      ctx.strokeStyle = DEBUG_BOUNDS_COLOR;
      strokeBox(ctx, bounds, camera);
    }
    ctx.setLineDash([]);

    const lines = [
      this.debugLabels.fps(this.fps.fps),
      this.debugLabels.elements(this.visible.length, state.scene.order.length),
      this.debugLabels.zoom(Math.round(camera.zoom * 100)),
      this.debugLabels.cells(this.index.cellCount),
    ];
    const x = 12;
    const y = state.viewport.height - 12 - lines.length * 16;
    ctx.fillStyle = 'rgba(20, 20, 24, 0.78)';
    ctx.fillRect(x - 6, y - 6, 190, lines.length * 16 + 10);
    ctx.fillStyle = '#f5f5f0';
    ctx.font = '12px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * 16);
    });
  }
}

/** Element/frame corners expanded by the selection pad (screen px) in its own frame. */
function paddedCorners(r: RectLike, zoom: number): Point[] {
  const pad = SELECTION_PAD_PX / zoom;
  return rectCorners({
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
    angle: r.angle,
  });
}

function strokePolygon(ctx: CanvasRenderingContext2D, pts: readonly Point[]): void {
  const [first, ...rest] = pts;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const p of rest) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
}

function strokeBox(ctx: CanvasRenderingContext2D, b: Box, camera: AppState['camera']): void {
  const a = worldToScreen(camera, { x: b.minX, y: b.minY });
  const c = worldToScreen(camera, { x: b.maxX, y: b.maxY });
  ctx.strokeRect(a.x + 0.5, a.y + 0.5, c.x - a.x, c.y - a.y);
}
